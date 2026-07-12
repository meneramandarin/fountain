#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.date || new Date().toISOString().slice(0, 10).replaceAll("-", "");
const dryRun = Boolean(options.dryRun);
const inventoryOnly = Boolean(options.inventoryOnly);
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const rateLimitMs = Number.parseInt(options.rateLimitMs || "110", 10);
const maxApiCalls = options.maxApiCalls ? Number.parseInt(options.maxApiCalls, 10) : Infinity;
const checkpointPath = path.resolve(ROOT, options.checkpoint || `location-geocode-guardrail-backfill-checkpoint-${phaseDate}.json`);
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `location-geocode-guardrail-backfill-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/location-geocode-guardrail-backfill-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);
const apiKeyEnvNames = ["GOOGLE_GEOCODING_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY", "GOOGLE_PLACES_API_KEY"];
const writeLocationTypes = new Set(["ROOFTOP", "RANGE_INTERPOLATED", "GEOMETRIC_CENTER", "APPROXIMATE"]);
const lowConfidenceLocationTypes = new Set(["GEOMETRIC_CENTER", "APPROXIMATE"]);

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));
for (const envFile of options.envFile || []) {
  loadEnvFile(path.resolve(ROOT, envFile));
}

const connectionString =
  options.databaseUrl ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

const googleApiKey = options.googleApiKey || apiKeyEnvNames.map((key) => process.env[key]).find(Boolean);
const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  const before = await loadInventory(client);
  printInventory(before);

  if (inventoryOnly) {
    const report = buildReport(before, before, [], "inventory_only");
    writeReports(report);
    process.exit(0);
  }

  if (!googleApiKey) {
    throw new Error(`Missing Google Geocoding API key. Expected one of: ${apiKeyEnvNames.join(", ")}.`);
  }

  const checkpoint = loadCheckpoint();
  const results = await geocodeCandidates(before.candidates, checkpoint);
  saveCheckpoint(checkpoint);

  if (!dryRun) {
    await applyResults(client, before.candidates, results);
  }

  const after = await loadInventory(client);
  const report = buildReport(before, after, results, dryRun ? "dry_run" : "live_write");
  writeReports(report);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadInventory(pgClient) {
  const candidates = await pgClient.query(`
    SELECT
      id,
      name,
      slug,
      address,
      locality,
      region,
      postal_code,
      country_code,
      country_name,
      data_origin,
      latitude,
      longitude,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN latitude IS NULL OR longitude IS NULL THEN 'null_coordinate' END,
        CASE WHEN latitude = 0 AND longitude = 0 THEN 'zero_zero' END,
        CASE WHEN latitude IS NOT NULL AND (latitude < -90 OR latitude > 90) THEN 'latitude_out_of_bounds' END,
        CASE WHEN longitude IS NOT NULL AND (longitude < -180 OR longitude > 180) THEN 'longitude_out_of_bounds' END
      ], NULL) AS coordinate_issues
    FROM ${quoteIdent(schema)}.locations
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND COALESCE(is_virtual, false) = false
      AND (
        latitude IS NULL
        OR longitude IS NULL
        OR (latitude = 0 AND longitude = 0)
        OR (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
        OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))
      )
    ORDER BY id
  `);

  const totals = await pgClient.query(`
    SELECT
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::int AS null_coordinate_rows,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND latitude = 0 AND longitude = 0)::int AS zero_zero_rows,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))::int AS lat_out_of_bounds_rows,
      COUNT(*) FILTER (WHERE longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))::int AS lng_out_of_bounds_rows,
      COUNT(*) FILTER (
        WHERE latitude IS NULL
           OR longitude IS NULL
           OR (latitude = 0 AND longitude = 0)
           OR (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
           OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))
      )::int AS backfill_set_rows
    FROM ${quoteIdent(schema)}.locations
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND COALESCE(is_virtual, false) = false
  `);

  const nullBreakdown = await pgClient.query(`
    SELECT COALESCE(country_code, '') AS country_code, COALESCE(data_origin, '') AS data_origin, COUNT(*)::int AS count
    FROM ${quoteIdent(schema)}.locations
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND COALESCE(is_virtual, false) = false
      AND (latitude IS NULL OR longitude IS NULL)
    GROUP BY 1, 2
    ORDER BY count DESC, country_code, data_origin
  `);

  const badBreakdown = await pgClient.query(`
    SELECT
      COALESCE(country_code, '') AS country_code,
      COALESCE(data_origin, '') AS data_origin,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE latitude = 0 AND longitude = 0)::int AS zero_zero,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))::int AS lat_out_of_bounds,
      COUNT(*) FILTER (WHERE longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))::int AS lng_out_of_bounds
    FROM ${quoteIdent(schema)}.locations
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND COALESCE(is_virtual, false) = false
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND (
        (latitude = 0 AND longitude = 0)
        OR latitude < -90
        OR latitude > 90
        OR longitude < -180
        OR longitude > 180
      )
    GROUP BY 1, 2
    ORDER BY count DESC, country_code, data_origin
  `);

  return {
    ...totals.rows[0],
    candidates: candidates.rows,
    null_coordinate_breakdown: nullBreakdown.rows,
    bad_coordinate_breakdown: badBreakdown.rows,
    estimated_cost_usd: Number(candidates.rowCount) * 5 / 1000,
  };
}

async function geocodeCandidates(candidates, checkpoint) {
  const results = [];
  let apiCalls = 0;
  let processed = 0;

  for (const candidate of candidates) {
    const cached = checkpoint.results[String(candidate.id)];
    if (cached) {
      results.push(cached);
      continue;
    }
    if (apiCalls >= maxApiCalls) {
      break;
    }

    const result = await geocodeCandidate(candidate);
    checkpoint.results[String(candidate.id)] = result;
    results.push(result);
    processed += 1;
    if (result.provider_status !== "NO_QUERY") {
      apiCalls += 1;
    }

    if (processed % 25 === 0) {
      saveCheckpoint(checkpoint);
    }
    if (processed % 100 === 0) {
      console.log(`Geocoded ${processed} new / ${results.length} total; writable ${results.filter((row) => row.decision === "write").length}; checkpoint ${path.relative(ROOT, checkpointPath)}`);
    }
    if (result.provider_status !== "NO_QUERY" && rateLimitMs > 0) {
      await sleep(rateLimitMs);
    }
  }
  return results;
}

async function geocodeCandidate(candidate) {
  const queryString = geocodeQuery(candidate);
  const base = {
    location_id: candidate.id,
    location_name: candidate.name,
    country_code: normalizeCountryCode(candidate.country_code),
    country_name: candidate.country_name || null,
    data_origin: candidate.data_origin || null,
    old_latitude: candidate.latitude,
    old_longitude: candidate.longitude,
    coordinate_issues: candidate.coordinate_issues || [],
    query_string: queryString,
  };

  if (!queryString) {
    return {
      ...base,
      provider_status: "NO_QUERY",
      returned_latitude: null,
      returned_longitude: null,
      location_type: null,
      formatted_address: null,
      returned_country_code: null,
      returned_country_name: null,
      result_types: [],
      place_id: null,
      low_confidence: false,
      needs_review: true,
      decision: "needs_review",
      reason: "no_query",
      raw_result: null,
    };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", queryString);
  url.searchParams.set("key", googleApiKey);

  let payload;
  try {
    const response = await fetch(url);
    payload = await response.json();
  } catch (error) {
    return reviewResult(base, "API_ERROR", "api_error", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (payload.status !== "OK") {
    return reviewResult(base, payload.status || "UNKNOWN_STATUS", payload.status === "ZERO_RESULTS" ? "zero_results" : "api_status", {
      error_message: payload.error_message || null,
    });
  }

  const best = chooseResult(payload.results || [], base.country_code);
  const compact = compactResult(best);
  const returnedCountryCode = normalizeCountryCode(countryComponent(best, "short_name"));
  const returnedCountryName = countryComponent(best, "long_name");
  const locationType = best?.geometry?.location_type || null;
  const countryMatches = Boolean(base.country_code && returnedCountryCode && base.country_code === returnedCountryCode);

  if (!countryMatches) {
    return {
      ...base,
      ...compact,
      returned_country_code: returnedCountryCode,
      returned_country_name: returnedCountryName,
      low_confidence: false,
      needs_review: true,
      decision: "needs_review",
      reason: "country_mismatch",
      raw_result: best || null,
    };
  }

  if (!writeLocationTypes.has(locationType)) {
    return {
      ...base,
      ...compact,
      returned_country_code: returnedCountryCode,
      returned_country_name: returnedCountryName,
      low_confidence: false,
      needs_review: true,
      decision: "needs_review",
      reason: "unsupported_location_type",
      raw_result: best || null,
    };
  }

  return {
    ...base,
    ...compact,
    returned_country_code: returnedCountryCode,
    returned_country_name: returnedCountryName,
    low_confidence: lowConfidenceLocationTypes.has(locationType),
    needs_review: false,
    decision: "write",
    reason: lowConfidenceLocationTypes.has(locationType) ? "low_confidence_country_match" : "street_level_country_match",
    raw_result: best || null,
  };
}

function chooseResult(results, expectedCountryCode) {
  return results.find((result) => {
    const resultCountry = normalizeCountryCode(countryComponent(result, "short_name"));
    return expectedCountryCode && resultCountry === expectedCountryCode && writeLocationTypes.has(result.geometry?.location_type);
  }) || results.find((result) => {
    const resultCountry = normalizeCountryCode(countryComponent(result, "short_name"));
    return expectedCountryCode && resultCountry === expectedCountryCode;
  }) || results[0] || null;
}

function reviewResult(base, providerStatus, reason, detail) {
  return {
    ...base,
    provider_status: providerStatus,
    returned_latitude: null,
    returned_longitude: null,
    location_type: null,
    formatted_address: null,
    returned_country_code: null,
    returned_country_name: null,
    result_types: [],
    place_id: null,
    low_confidence: false,
    needs_review: true,
    decision: "needs_review",
    reason,
    raw_result: detail || null,
  };
}

function compactResult(result) {
  return {
    provider_status: "OK",
    returned_latitude: result?.geometry?.location?.lat ?? null,
    returned_longitude: result?.geometry?.location?.lng ?? null,
    location_type: result?.geometry?.location_type || null,
    formatted_address: result?.formatted_address || null,
    result_types: result?.types || [],
    place_id: result?.place_id || null,
  };
}

function countryComponent(result, field) {
  return result?.address_components?.find((component) => (component.types || []).includes("country"))?.[field] || null;
}

function geocodeQuery(location) {
  const address = cleanPart(location.address);
  if (address) {
    return uniqueParts([
      address,
      location.locality,
      location.region,
      location.postal_code,
      location.country_name,
    ]).join(", ");
  }
  return uniqueParts([
    location.name,
    location.locality,
    location.country_name,
  ]).join(", ");
}

function uniqueParts(parts) {
  const seen = new Set();
  const output = [];
  for (const part of parts) {
    const clean = cleanPart(part);
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      output.push(clean);
    }
  }
  return output;
}

function cleanPart(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function applyResults(pgClient, candidates, results) {
  await pgClient.query("BEGIN");
  try {
    await ensureTables(pgClient, candidates);
    await insertAuditRows(pgClient, results);
    await withGenericAuditTriggerDisabled(pgClient, async () => {
      await updateCoordinates(pgClient, results.filter((row) => row.decision === "write"));
    });
    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

async function ensureTables(pgClient, candidates) {
  await pgClient.query(`
    CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)}
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_coordinate_backup_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      name text,
      address text,
      locality text,
      region text,
      postal_code text,
      country_code text,
      country_name text,
      data_origin text,
      old_latitude double precision,
      old_longitude double precision,
      coordinate_issues text[],
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_backfill_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      location_name text,
      country_code text,
      country_name text,
      data_origin text,
      old_latitude double precision,
      old_longitude double precision,
      coordinate_issues text[],
      query_string text,
      provider_status text,
      returned_latitude double precision,
      returned_longitude double precision,
      location_type text,
      formatted_address text,
      returned_country_code text,
      returned_country_name text,
      result_types text[],
      place_id text,
      low_confidence boolean NOT NULL DEFAULT false,
      needs_review boolean NOT NULL DEFAULT false,
      write_applied boolean NOT NULL DEFAULT false,
      decision text NOT NULL,
      reason text,
      raw_result jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_coordinate_backup_${phaseDate}`)}
      (location_id, name, address, locality, region, postal_code, country_code, country_name, data_origin, old_latitude, old_longitude, coordinate_issues)
    SELECT id, name, address, locality, region, postal_code, country_code, country_name, data_origin, latitude, longitude, coordinate_issues
    FROM jsonb_to_recordset($1::jsonb) AS x(
      id integer,
      name text,
      address text,
      locality text,
      region text,
      postal_code text,
      country_code text,
      country_name text,
      data_origin text,
      latitude double precision,
      longitude double precision,
      coordinate_issues text[]
    )
    ON CONFLICT (location_id) DO NOTHING
    `,
    [JSON.stringify(candidates)],
  );
}

async function insertAuditRows(pgClient, results) {
  if (!results.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_backfill_${phaseDate}`)}
      (
        location_id,
        location_name,
        country_code,
        country_name,
        data_origin,
        old_latitude,
        old_longitude,
        coordinate_issues,
        query_string,
        provider_status,
        returned_latitude,
        returned_longitude,
        location_type,
        formatted_address,
        returned_country_code,
        returned_country_name,
        result_types,
        place_id,
        low_confidence,
        needs_review,
        decision,
        reason,
        raw_result
      )
    SELECT
      location_id,
      location_name,
      country_code,
      country_name,
      data_origin,
      old_latitude,
      old_longitude,
      coordinate_issues,
      query_string,
      provider_status,
      returned_latitude,
      returned_longitude,
      location_type,
      formatted_address,
      returned_country_code,
      returned_country_name,
      result_types,
      place_id,
      low_confidence,
      needs_review,
      decision,
      reason,
      raw_result
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      country_code text,
      country_name text,
      data_origin text,
      old_latitude double precision,
      old_longitude double precision,
      coordinate_issues text[],
      query_string text,
      provider_status text,
      returned_latitude double precision,
      returned_longitude double precision,
      location_type text,
      formatted_address text,
      returned_country_code text,
      returned_country_name text,
      result_types text[],
      place_id text,
      low_confidence boolean,
      needs_review boolean,
      decision text,
      reason text,
      raw_result jsonb
    )
    ON CONFLICT (location_id) DO UPDATE
      SET location_name = EXCLUDED.location_name,
          country_code = EXCLUDED.country_code,
          country_name = EXCLUDED.country_name,
          data_origin = EXCLUDED.data_origin,
          old_latitude = EXCLUDED.old_latitude,
          old_longitude = EXCLUDED.old_longitude,
          coordinate_issues = EXCLUDED.coordinate_issues,
          query_string = EXCLUDED.query_string,
          provider_status = EXCLUDED.provider_status,
          returned_latitude = EXCLUDED.returned_latitude,
          returned_longitude = EXCLUDED.returned_longitude,
          location_type = EXCLUDED.location_type,
          formatted_address = EXCLUDED.formatted_address,
          returned_country_code = EXCLUDED.returned_country_code,
          returned_country_name = EXCLUDED.returned_country_name,
          result_types = EXCLUDED.result_types,
          place_id = EXCLUDED.place_id,
          low_confidence = EXCLUDED.low_confidence,
          needs_review = EXCLUDED.needs_review,
          decision = EXCLUDED.decision,
          reason = EXCLUDED.reason,
          raw_result = EXCLUDED.raw_result
    `,
    [JSON.stringify(results)],
  );
}

async function updateCoordinates(pgClient, writable) {
  if (!writable.length) {
    return;
  }
  const result = await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations l
    SET latitude = x.returned_latitude,
        longitude = x.returned_longitude
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      returned_latitude double precision,
      returned_longitude double precision
    )
    WHERE l.id = x.location_id
      AND x.returned_latitude IS NOT NULL
      AND x.returned_longitude IS NOT NULL
      AND l.status = 'active'
      AND l.deleted_at IS NULL
      AND COALESCE(l.is_virtual, false) = false
    `,
    [JSON.stringify(writable)],
  );
  await pgClient.query(
    `
    UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_backfill_${phaseDate}`)}
    SET write_applied = true
    WHERE location_id = ANY($1::int[])
    `,
    [writable.map((row) => row.location_id)],
  );
  console.log(`Updated ${result.rowCount} location coordinate rows.`);
}

async function withGenericAuditTriggerDisabled(pgClient, callback) {
  const trigger = await pgClient.query(
    `
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = $1::regclass
      AND tgname = 'trg_audit_entity_change'
    `,
    [`${schema}.locations`],
  );
  if (!trigger.rowCount) {
    return callback();
  }
  await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations DISABLE TRIGGER trg_audit_entity_change`);
  try {
    return await callback();
  } finally {
    await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations ENABLE TRIGGER trg_audit_entity_change`);
  }
}

function buildReport(before, after, results, mode) {
  const writable = results.filter((row) => row.decision === "write");
  const review = results.filter((row) => row.needs_review);
  return {
    generated_at: new Date().toISOString(),
    mode,
    dry_run: dryRun,
    schema,
    raw_schema: rawSchema,
    checkpoint: path.relative(ROOT, checkpointPath),
    backup_table: `${rawSchema}.location_geocode_coordinate_backup_${phaseDate}`,
    audit_table: `${rawSchema}.location_geocode_backfill_${phaseDate}`,
    before: withoutCandidates(before),
    after: withoutCandidates(after),
    summary: {
      backfill_set_before: before.backfill_set_rows,
      null_coordinate_rows_before: before.null_coordinate_rows,
      zero_zero_rows_before: before.zero_zero_rows,
      lat_out_of_bounds_rows_before: before.lat_out_of_bounds_rows,
      lng_out_of_bounds_rows_before: before.lng_out_of_bounds_rows,
      total_google_targets: before.candidates.length,
      estimated_cost_usd: Number(before.estimated_cost_usd.toFixed(2)),
      geocoded_results: results.length,
      coordinates_written: writable.length,
      low_confidence_written: writable.filter((row) => row.low_confidence).length,
      needs_review: review.length,
      backfill_set_after: after.backfill_set_rows,
      null_coordinate_rows_after: after.null_coordinate_rows,
      zero_zero_rows_after: after.zero_zero_rows,
      lat_out_of_bounds_rows_after: after.lat_out_of_bounds_rows,
      lng_out_of_bounds_rows_after: after.lng_out_of_bounds_rows,
    },
    decisions_by_reason: countBy(results, "reason"),
    provider_statuses: countBy(results, "provider_status"),
    null_coordinate_breakdown_before: before.null_coordinate_breakdown,
    bad_coordinate_breakdown_before: before.bad_coordinate_breakdown,
    needs_review_sample: review.slice(0, 200).map(publicAuditRow),
    low_confidence_sample: writable.filter((row) => row.low_confidence).slice(0, 100).map(publicAuditRow),
  };
}

function publicAuditRow(row) {
  return {
    location_id: row.location_id,
    location_name: row.location_name,
    query_string: row.query_string,
    returned_latitude: row.returned_latitude,
    returned_longitude: row.returned_longitude,
    location_type: row.location_type,
    formatted_address: row.formatted_address,
    country_code: row.country_code,
    returned_country_code: row.returned_country_code,
    reason: row.reason,
  };
}

function withoutCandidates(inventory) {
  return Object.fromEntries(Object.entries(inventory).filter(([key]) => key !== "candidates"));
}

function writeReports(report) {
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
}

function renderMarkdown(report) {
  return [
    `# Location Geocode Guardrail Backfill Report (${phaseDate})`,
    "",
    `Mode: ${report.mode}`,
    "",
    "## Summary",
    "",
    `- Backfill set before: ${report.summary.backfill_set_before}`,
    `- Null coordinate rows before: ${report.summary.null_coordinate_rows_before}`,
    `- Zero-zero rows before: ${report.summary.zero_zero_rows_before}`,
    `- Total Google targets: ${report.summary.total_google_targets}`,
    `- Estimated Google Geocoding cost: $${report.summary.estimated_cost_usd.toFixed(2)} at $5/1k`,
    `- Coordinates written: ${report.summary.coordinates_written}`,
    `- Low-confidence written: ${report.summary.low_confidence_written}`,
    `- Needs review: ${report.summary.needs_review}`,
    `- Backfill set after: ${report.summary.backfill_set_after}`,
    "",
    "## Tables",
    "",
    `- Coordinate backup: \`${report.backup_table}\``,
    `- Audit table: \`${report.audit_table}\``,
    `- Checkpoint: \`${report.checkpoint}\``,
    "",
    "## Decisions By Reason",
    "",
    renderCountTable(report.decisions_by_reason),
    "",
    "## Needs Review Sample",
    "",
    renderRows(report.needs_review_sample, ["location_id", "location_name", "reason", "country_code", "returned_country_code", "location_type", "formatted_address"], 100),
    "",
  ].join("\n");
}

function renderCountTable(counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    return "_None._";
  }
  return ["| Status | Count |", "| --- | ---: |", ...entries.map(([key, value]) => `| ${escapeMd(key)} | ${value} |`)].join("\n");
}

function renderRows(rows, columns, limit) {
  if (!rows.length) {
    return "_None._";
  }
  const visible = rows.slice(0, limit);
  return [
    `Showing ${visible.length}${rows.length > visible.length ? ` of ${rows.length}` : ""}.`,
    "",
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...visible.map((row) => `| ${columns.map((column) => escapeMd(row[column] ?? "")).join(" | ")} |`),
  ].join("\n");
}

function printInventory(inventory) {
  console.log(`Backfill set rows: ${inventory.backfill_set_rows}`);
  console.log(`Null coordinate rows: ${inventory.null_coordinate_rows}`);
  console.log(`Zero-zero rows: ${inventory.zero_zero_rows}`);
  console.log(`Latitude out-of-bounds rows: ${inventory.lat_out_of_bounds_rows}`);
  console.log(`Longitude out-of-bounds rows: ${inventory.lng_out_of_bounds_rows}`);
  console.log(`Estimated cost: $${inventory.estimated_cost_usd.toFixed(2)}`);
}

function loadCheckpoint() {
  if (!existsSync(checkpointPath)) {
    return { phase_date: phaseDate, results: {} };
  }
  return JSON.parse(readFileSync(checkpointPath, "utf8"));
}

function saveCheckpoint(checkpoint) {
  checkpoint.updated_at = new Date().toISOString();
  writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] || "";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function normalizeCountryCode(value) {
  const clean = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(clean) ? clean : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeMd(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function normalizePostgresConnectionString(rawConnectionString) {
  try {
    const url = new URL(rawConnectionString);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return rawConnectionString;
  }
}

function normalizeIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe Postgres identifier: ${identifier}`);
  }
  return value;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key]) {
      continue;
    }
    let value = rest.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--inventory-only") {
      parsed.inventoryOnly = true;
    } else if (arg === "--date") {
      parsed.date = args[++index];
    } else if (arg === "--schema") {
      parsed.schema = args[++index];
    } else if (arg === "--raw-schema") {
      parsed.rawSchema = args[++index];
    } else if (arg === "--database-url") {
      parsed.databaseUrl = args[++index];
    } else if (arg === "--google-api-key") {
      parsed.googleApiKey = args[++index];
    } else if (arg === "--checkpoint") {
      parsed.checkpoint = args[++index];
    } else if (arg === "--json-out") {
      parsed.jsonOut = args[++index];
    } else if (arg === "--md-out") {
      parsed.mdOut = args[++index];
    } else if (arg === "--rate-limit-ms") {
      parsed.rateLimitMs = args[++index];
    } else if (arg === "--max-api-calls") {
      parsed.maxApiCalls = args[++index];
    } else if (arg === "--env-file") {
      parsed.envFile ||= [];
      parsed.envFile.push(args[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}
