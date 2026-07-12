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
const approvedCost = Boolean(options.approvedCost);
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const checkpointPath = path.resolve(ROOT, options.checkpoint || `location-geocode-backfill-checkpoint-${phaseDate}.json`);
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `location-geocode-backfill-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/location-geocode-backfill-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);
const rateLimitMs = Number.parseInt(options.rateLimitMs || "125", 10);
const maxApiCalls = options.maxApiCalls ? Number.parseInt(options.maxApiCalls, 10) : Infinity;
const geocodeCostPerThousandUsd = 5;
const geocodeCostGateUsd = 25;
const apiKeyEnvNames = ["GOOGLE_GEOCODING_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY", "GOOGLE_PLACES_API_KEY"];
const acceptedLocationTypes = new Set(["ROOFTOP", "RANGE_INTERPOLATED"]);
const acceptedResultTypes = new Set([
  "street_address",
  "premise",
  "subpremise",
  "establishment",
  "point_of_interest",
  "health",
  "doctor",
  "hospital",
  "physiotherapist",
  "spa",
]);

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
    const report = buildReport(before, before, [], [], [], [], "inventory_only");
    writeReports(report);
    process.exit(0);
  }

  if (before.estimated_cost_usd > geocodeCostGateUsd && !approvedCost) {
    throw new Error(`Estimated Google Geocoding cost is $${before.estimated_cost_usd.toFixed(2)}. Re-run with --approved-cost after approval.`);
  }
  if (!googleApiKey) {
    throw new Error(`Missing Google Geocoding API key. Expected one of: ${apiKeyEnvNames.join(", ")}.`);
  }

  const checkpoint = loadCheckpoint();
  const results = await geocodeCandidates(before.candidates, checkpoint);
  saveCheckpoint(checkpoint);

  const accepted = results.filter((row) => row.needs_coordinates && row.status === "accepted");
  const review = results.filter((row) => row.needs_coordinates && row.status !== "accepted");
  const localityResolved = results
    .map((row) => row.locality_resolution)
    .filter((row) => row?.status === "resolved");
  const localityConflicts = results
    .map((row) => row.locality_resolution)
    .filter((row) => row && row.status !== "resolved");
  if (!dryRun) {
    await applyResults(client, before, accepted, review, localityResolved);
  }

  const after = await loadInventory(client);
  const report = buildReport(before, after, accepted, review, localityResolved, localityConflicts, dryRun ? "dry_run" : "live_write");
  writeReports(report);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadInventory(pgClient) {
  const reviewTable = `${rawSchema}.location_normalization_review_${phaseDate}`;
  const reviewTableExists = Boolean((await pgClient.query("SELECT to_regclass($1) AS table_name", [reviewTable])).rows[0].table_name);
  const localityReviewSource = reviewTableExists
    ? `SELECT location_id, detail FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_normalization_review_${phaseDate}`)} WHERE reason = 'address_city_differs_from_locality'`
    : "SELECT NULL::integer AS location_id, NULL::jsonb AS detail WHERE false";
  const candidates = await pgClient.query(`
    WITH locality_review AS (
      ${localityReviewSource}
    )
    SELECT
      l.id,
      l.name,
      l.slug,
      l.address,
      l.locality,
      l.region,
      l.postal_code,
      l.country_code,
      l.country_name,
      l.latitude,
      l.longitude,
      (l.latitude IS NULL AND l.longitude IS NULL) AS needs_coordinates,
      (lr.location_id IS NOT NULL) AS needs_locality_review,
      lr.detail AS locality_review_detail
    FROM ${quoteIdent(schema)}.locations l
    LEFT JOIN locality_review lr ON lr.location_id = l.id
    WHERE l.deleted_at IS NULL
      AND COALESCE(l.is_virtual, false) = false
      AND COALESCE(l.address, '') <> ''
      AND l.address LIKE '%,%'
      AND COALESCE(l.country_code, '') <> ''
      AND (
        (l.latitude IS NULL AND l.longitude IS NULL)
        OR lr.location_id IS NOT NULL
      )
    ORDER BY l.id
  `);
  const counts = await pgClient.query(`
    WITH locality_review AS (
      ${localityReviewSource}
    )
    SELECT
      COUNT(*)::int AS total_locations,
      COUNT(*) FILTER (WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL)::int AS coordinate_coverage,
      COUNT(*) FILTER (
        WHERE l.deleted_at IS NULL
          AND COALESCE(l.is_virtual, false) = false
          AND l.latitude IS NULL
          AND l.longitude IS NULL
          AND COALESCE(l.address, '') <> ''
          AND l.address LIKE '%,%'
      )::int AS geocode_candidates_all,
      COUNT(*) FILTER (
        WHERE l.deleted_at IS NULL
          AND COALESCE(l.is_virtual, false) = false
          AND l.latitude IS NULL
          AND l.longitude IS NULL
          AND COALESCE(l.address, '') <> ''
          AND l.address LIKE '%,%'
          AND COALESCE(l.country_code, '') <> ''
      )::int AS geocode_candidates_with_country,
      COUNT(lr.location_id)::int AS locality_review_rows,
      COUNT(lr.location_id) FILTER (
        WHERE COALESCE(l.address, '') <> ''
          AND l.address LIKE '%,%'
          AND COALESCE(l.country_code, '') <> ''
      )::int AS geocode_locality_review_candidates
    FROM ${quoteIdent(schema)}.locations l
    LEFT JOIN locality_review lr ON lr.location_id = l.id
    WHERE l.deleted_at IS NULL
  `);
  return {
    ...counts.rows[0],
    candidates: candidates.rows,
    estimated_cost_usd: Number(candidates.rowCount) * geocodeCostPerThousandUsd / 1000,
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
    apiCalls += 1;
    processed += 1;

    if (processed % 25 === 0) {
      saveCheckpoint(checkpoint);
    }
    if (processed % 100 === 0) {
      const accepted = results.filter((row) => row.status === "accepted").length;
      console.log(`Geocoded ${processed} new / ${results.length} total; accepted ${accepted}; checkpoint ${path.relative(ROOT, checkpointPath)}`);
    }
    if (rateLimitMs > 0) {
      await sleep(rateLimitMs);
    }
  }
  return results;
}

async function geocodeCandidate(candidate) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", candidate.address);
  url.searchParams.set("key", googleApiKey);

  let payload;
  try {
    const response = await fetch(url);
    payload = await response.json();
  } catch (error) {
    return withLocalityResolution(
      candidate,
      reviewResult(candidate, "api_error", { error: error instanceof Error ? error.message : String(error) }),
      null,
      null,
      "api_error",
    );
  }

  if (payload.status !== "OK") {
    const reason = payload.status === "ZERO_RESULTS" ? "zero_results" : "api_status";
    return withLocalityResolution(
      candidate,
      reviewResult(candidate, reason, { provider_status: payload.status, error_message: payload.error_message || null }),
      null,
      null,
      reason,
    );
  }

  const best = payload.results.find((result) => isAcceptableResult(result, candidate.country_code)) || payload.results[0];
  const compact = compactResult(best);
  const resultCountry = countryCodeFromComponents(best.address_components || []);
  const localityResolution = resolveLocalityConflict(candidate, best, resultCountry);

  if (candidate.country_code && resultCountry && resultCountry !== candidate.country_code) {
    return {
      ...reviewResult(candidate, "country_mismatch", { ...compact, result_country_code: resultCountry }),
      needs_coordinates: candidate.needs_coordinates,
      needs_locality_review: candidate.needs_locality_review,
      locality_resolution: localityResolution,
    };
  }
  if (!isStreetLevel(best)) {
    return {
      ...reviewResult(candidate, "low_confidence_location_type", { ...compact, result_country_code: resultCountry }),
      needs_coordinates: candidate.needs_coordinates,
      needs_locality_review: candidate.needs_locality_review,
      locality_resolution: localityResolution,
    };
  }
  if (!hasAcceptedType(best)) {
    return {
      ...reviewResult(candidate, "low_confidence_result_type", { ...compact, result_country_code: resultCountry }),
      needs_coordinates: candidate.needs_coordinates,
      needs_locality_review: candidate.needs_locality_review,
      locality_resolution: localityResolution,
    };
  }

  return {
    location_id: candidate.id,
    location_name: candidate.name,
    address: candidate.address,
    country_code: candidate.country_code,
    status: "accepted",
    needs_coordinates: candidate.needs_coordinates,
    needs_locality_review: candidate.needs_locality_review,
    old_latitude: candidate.latitude,
    old_longitude: candidate.longitude,
    new_latitude: best.geometry.location.lat,
    new_longitude: best.geometry.location.lng,
    formatted_address: best.formatted_address || null,
    location_type: best.geometry?.location_type || null,
    result_types: best.types || [],
    result_country_code: resultCountry || null,
    rule: "google_geocoding_street_level_country_match",
    locality_resolution: localityResolution,
  };
}

function withLocalityResolution(candidate, result, geocodeResult, resultCountry, reason) {
  return {
    ...result,
    needs_coordinates: candidate.needs_coordinates,
    needs_locality_review: candidate.needs_locality_review,
    locality_resolution: resolveLocalityConflict(candidate, geocodeResult, resultCountry, reason),
  };
}

function resolveLocalityConflict(candidate, result, resultCountry, fallbackReason = null) {
  if (!candidate.needs_locality_review) {
    return null;
  }
  const detail = candidate.locality_review_detail || {};
  const oldLocality = detail.locality || candidate.locality || null;
  const parsedCity = detail.parsed_city || null;
  const geocodedLocality = result ? canonicalLocalityFromComponents(result.address_components || []) : null;
  const base = {
    location_id: candidate.id,
    location_name: candidate.name,
    old_locality: oldLocality,
    parsed_city: parsedCity,
    geocoded_locality: geocodedLocality,
    formatted_address: result?.formatted_address || null,
    location_type: result?.geometry?.location_type || null,
    result_country_code: resultCountry || null,
  };

  if (!geocodedLocality) {
    return { ...base, status: "unresolved", reason: fallbackReason || "missing_geocoded_locality" };
  }
  if (candidate.country_code && resultCountry && resultCountry !== candidate.country_code) {
    return { ...base, status: "conflict", reason: "country_mismatch" };
  }
  if (matchesLocalityCandidate(geocodedLocality, oldLocality) || matchesLocalityCandidate(geocodedLocality, parsedCity)) {
    return {
      ...base,
      status: "resolved",
      new_locality: geocodedLocality,
      rule: "google_canonical_locality_matches_candidate",
    };
  }
  return { ...base, status: "conflict", reason: "geocoded_locality_matches_neither_candidate" };
}

function isAcceptableResult(result, countryCode) {
  const resultCountry = countryCodeFromComponents(result.address_components || []);
  return (!countryCode || !resultCountry || resultCountry === countryCode) && isStreetLevel(result) && hasAcceptedType(result);
}

function isStreetLevel(result) {
  return acceptedLocationTypes.has(result.geometry?.location_type);
}

function hasAcceptedType(result) {
  return (result.types || []).some((type) => acceptedResultTypes.has(type));
}

function countryCodeFromComponents(components) {
  return components.find((component) => (component.types || []).includes("country"))?.short_name || null;
}

function canonicalLocalityFromComponents(components) {
  const preferredTypes = [
    "locality",
    "postal_town",
    "administrative_area_level_3",
    "sublocality",
    "sublocality_level_1",
  ];
  for (const type of preferredTypes) {
    const component = components.find((entry) => (entry.types || []).includes(type));
    if (component?.long_name) {
      return component.long_name;
    }
  }
  return null;
}

function matchesLocalityCandidate(geocodedLocality, candidateLocality) {
  const geocoded = normalizeLocality(geocodedLocality);
  const candidate = normalizeLocality(candidateLocality);
  if (!geocoded || !candidate) {
    return false;
  }
  return geocoded === candidate || geocoded.includes(candidate) || candidate.includes(geocoded);
}

function normalizeLocality(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactResult(result) {
  if (!result) {
    return {};
  }
  return {
    formatted_address: result.formatted_address || null,
    location_type: result.geometry?.location_type || null,
    result_types: result.types || [],
    latitude: result.geometry?.location?.lat ?? null,
    longitude: result.geometry?.location?.lng ?? null,
    place_id: result.place_id || null,
  };
}

function reviewResult(candidate, reason, detail) {
  return {
    location_id: candidate.id,
    location_name: candidate.name,
    address: candidate.address,
    country_code: candidate.country_code,
    status: reason,
    ...detail,
  };
}

async function applyResults(pgClient, before, accepted, review, localityResolved) {
  await pgClient.query("BEGIN");
  try {
    await ensureTables(pgClient, before.candidates);
    await insertAcceptedRows(pgClient, accepted);
    await insertReviewRows(pgClient, review);
    await insertLocalityRows(pgClient, localityResolved);
    await withGenericAuditTriggerDisabled(pgClient, async () => {
      await updateCoordinates(pgClient, accepted);
      await updateLocalities(pgClient, localityResolved);
    });
    await clearResolvedLocalityReviews(pgClient, localityResolved);
    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

async function ensureTables(pgClient, candidates) {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_coordinate_backup_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      name text,
      address text,
      country_code text,
      old_latitude double precision,
      old_longitude double precision,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_backfill_audit_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      old_latitude double precision,
      old_longitude double precision,
      new_latitude double precision NOT NULL,
      new_longitude double precision NOT NULL,
      formatted_address text,
      location_type text,
      result_types text[],
      result_country_code text,
      rule text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_low_confidence_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      location_name text,
      address text,
      country_code text,
      status text NOT NULL,
      formatted_address text,
      location_type text,
      result_types text[],
      result_country_code text,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_locality_audit_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      location_name text,
      old_locality text,
      parsed_city text,
      geocoded_locality text NOT NULL,
      new_locality text NOT NULL,
      formatted_address text,
      location_type text,
      result_country_code text,
      rule text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_coordinate_backup_${phaseDate}`)}
      (location_id, name, address, country_code, old_latitude, old_longitude)
    SELECT location_id, name, address, country_code, latitude, longitude
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      name text,
      address text,
      country_code text,
      latitude double precision,
      longitude double precision
    )
    ON CONFLICT (location_id) DO NOTHING
    `,
    [JSON.stringify(candidates.map((row) => ({
      location_id: row.id,
      name: row.name,
      address: row.address,
      country_code: row.country_code,
      latitude: row.latitude,
      longitude: row.longitude,
    })))],
  );
}

async function insertAcceptedRows(pgClient, accepted) {
  if (!accepted.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_backfill_audit_${phaseDate}`)}
      (location_id, old_latitude, old_longitude, new_latitude, new_longitude, formatted_address, location_type, result_types, result_country_code, rule)
    SELECT location_id, old_latitude, old_longitude, new_latitude, new_longitude, formatted_address, location_type, result_types, result_country_code, rule
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      old_latitude double precision,
      old_longitude double precision,
      new_latitude double precision,
      new_longitude double precision,
      formatted_address text,
      location_type text,
      result_types text[],
      result_country_code text,
      rule text
    )
    ON CONFLICT (location_id) DO UPDATE
      SET old_latitude = EXCLUDED.old_latitude,
          old_longitude = EXCLUDED.old_longitude,
          new_latitude = EXCLUDED.new_latitude,
          new_longitude = EXCLUDED.new_longitude,
          formatted_address = EXCLUDED.formatted_address,
          location_type = EXCLUDED.location_type,
          result_types = EXCLUDED.result_types,
          result_country_code = EXCLUDED.result_country_code,
          rule = EXCLUDED.rule
    `,
    [JSON.stringify(accepted)],
  );
}

async function insertReviewRows(pgClient, review) {
  if (!review.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_low_confidence_${phaseDate}`)}
      (location_id, location_name, address, country_code, status, formatted_address, location_type, result_types, result_country_code, detail)
    SELECT location_id, location_name, address, country_code, status, formatted_address, location_type, result_types, result_country_code, detail
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      address text,
      country_code text,
      status text,
      formatted_address text,
      location_type text,
      result_types text[],
      result_country_code text,
      detail jsonb
    )
    ON CONFLICT (location_id) DO UPDATE
      SET location_name = EXCLUDED.location_name,
          address = EXCLUDED.address,
          country_code = EXCLUDED.country_code,
          status = EXCLUDED.status,
          formatted_address = EXCLUDED.formatted_address,
          location_type = EXCLUDED.location_type,
          result_types = EXCLUDED.result_types,
          result_country_code = EXCLUDED.result_country_code,
          detail = EXCLUDED.detail
    `,
    [JSON.stringify(review.map((row) => ({
      ...row,
      detail: row.detail || {
        provider_status: row.provider_status || null,
        error_message: row.error_message || null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        place_id: row.place_id || null,
      },
    })))],
  );
}

async function insertLocalityRows(pgClient, localityResolved) {
  if (!localityResolved.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_locality_audit_${phaseDate}`)}
      (location_id, location_name, old_locality, parsed_city, geocoded_locality, new_locality, formatted_address, location_type, result_country_code, rule)
    SELECT location_id, location_name, old_locality, parsed_city, geocoded_locality, new_locality, formatted_address, location_type, result_country_code, rule
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      old_locality text,
      parsed_city text,
      geocoded_locality text,
      new_locality text,
      formatted_address text,
      location_type text,
      result_country_code text,
      rule text
    )
    ON CONFLICT (location_id) DO UPDATE
      SET location_name = EXCLUDED.location_name,
          old_locality = EXCLUDED.old_locality,
          parsed_city = EXCLUDED.parsed_city,
          geocoded_locality = EXCLUDED.geocoded_locality,
          new_locality = EXCLUDED.new_locality,
          formatted_address = EXCLUDED.formatted_address,
          location_type = EXCLUDED.location_type,
          result_country_code = EXCLUDED.result_country_code,
          rule = EXCLUDED.rule
    `,
    [JSON.stringify(localityResolved)],
  );
}

async function updateCoordinates(pgClient, accepted) {
  if (!accepted.length) {
    return;
  }
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations l
    SET latitude = x.new_latitude,
        longitude = x.new_longitude
    FROM jsonb_to_recordset($1::jsonb) AS x(location_id integer, new_latitude double precision, new_longitude double precision)
    WHERE l.id = x.location_id
      AND l.latitude IS NULL
      AND l.longitude IS NULL
    `,
    [JSON.stringify(accepted)],
  );
}

async function updateLocalities(pgClient, localityResolved) {
  const changed = localityResolved.filter((row) => String(row.old_locality || "") !== String(row.new_locality || ""));
  if (!changed.length) {
    return;
  }
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations l
    SET locality = x.new_locality
    FROM jsonb_to_recordset($1::jsonb) AS x(location_id integer, new_locality text)
    WHERE l.id = x.location_id
      AND COALESCE(l.locality, '') IS DISTINCT FROM x.new_locality
    `,
    [JSON.stringify(changed)],
  );
}

async function clearResolvedLocalityReviews(pgClient, localityResolved) {
  if (!localityResolved.length) {
    return;
  }
  const reviewTable = `${rawSchema}.location_normalization_review_${phaseDate}`;
  const exists = Boolean((await pgClient.query("SELECT to_regclass($1) AS table_name", [reviewTable])).rows[0].table_name);
  if (!exists) {
    return;
  }
  await pgClient.query(
    `
    DELETE FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_normalization_review_${phaseDate}`)}
    WHERE reason = 'address_city_differs_from_locality'
      AND location_id = ANY($1::int[])
    `,
    [localityResolved.map((row) => row.location_id)],
  );
}

async function withGenericAuditTriggerDisabled(pgClient, callback) {
  await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations DISABLE TRIGGER trg_audit_entity_change`);
  try {
    return await callback();
  } finally {
    await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations ENABLE TRIGGER trg_audit_entity_change`);
  }
}

function buildReport(before, after, accepted, review, localityResolved, localityConflicts, mode) {
  const reviewByStatus = countBy(review, "status");
  const localityByStatus = countBy(localityConflicts, "status");
  localityByStatus.resolved = localityResolved.length;
  return {
    generated_at: new Date().toISOString(),
    mode,
    dry_run: dryRun,
    schema,
    raw_schema: rawSchema,
    checkpoint: path.relative(ROOT, checkpointPath),
    backup_table: `${rawSchema}.location_geocode_coordinate_backup_${phaseDate}`,
    audit_table: `${rawSchema}.location_geocode_backfill_audit_${phaseDate}`,
    low_confidence_table: `${rawSchema}.location_geocode_low_confidence_${phaseDate}`,
    locality_audit_table: `${rawSchema}.location_geocode_locality_audit_${phaseDate}`,
    summary: {
      candidates_all_before: before.geocode_candidates_all,
      candidates_with_country_before: before.geocode_candidates_with_country,
      locality_review_rows_before: before.locality_review_rows,
      locality_review_geocodable_before: before.geocode_locality_review_candidates,
      total_google_targets: before.candidates.length,
      estimated_cost_usd: Number(before.estimated_cost_usd.toFixed(2)),
      coordinate_coverage_before: before.coordinate_coverage,
      coordinate_coverage_after: after.coordinate_coverage,
      coordinates_written: accepted.length,
      low_confidence_or_skipped: review.length,
      locality_conflicts_resolved: localityResolved.length,
      locality_conflicts_remaining_or_unresolved: localityConflicts.length,
    },
    before: withoutCandidates(before),
    after: withoutCandidates(after),
    review_by_status: reviewByStatus,
    locality_by_status: localityByStatus,
    accepted_sample: accepted.slice(0, 50),
    low_confidence_sample: review.slice(0, 100),
    locality_resolved_sample: localityResolved.slice(0, 100),
    locality_conflict_sample: localityConflicts.slice(0, 100),
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
    `# Location Geocode Backfill Report (${phaseDate})`,
    "",
    `Mode: ${report.mode}`,
    "",
    "## Summary",
    "",
    `- Candidates with country: ${report.summary.candidates_with_country_before}`,
    `- Locality conflict rows before: ${report.summary.locality_review_rows_before}`,
    `- Locality conflict rows geocodable: ${report.summary.locality_review_geocodable_before}`,
    `- Total Google targets after de-dupe: ${report.summary.total_google_targets}`,
    `- Estimated Google Geocoding cost: $${report.summary.estimated_cost_usd.toFixed(2)} at $${geocodeCostPerThousandUsd}/1k`,
    `- Coordinate coverage: ${report.summary.coordinate_coverage_before} before, ${report.summary.coordinate_coverage_after} after`,
    `- Coordinates written: ${report.summary.coordinates_written}`,
    `- Low-confidence/skipped: ${report.summary.low_confidence_or_skipped}`,
    `- Locality conflicts resolved: ${report.summary.locality_conflicts_resolved}`,
    `- Locality conflicts remaining/unresolved: ${report.summary.locality_conflicts_remaining_or_unresolved}`,
    "",
    "## Low-Confidence Statuses",
    "",
    renderCountTable(report.review_by_status),
    "",
    "## Locality Resolution Statuses",
    "",
    renderCountTable(report.locality_by_status),
    "",
    "## Tables",
    "",
    `- Coordinate backup: \`${report.backup_table}\``,
    `- Accepted audit: \`${report.audit_table}\``,
    `- Low-confidence review: \`${report.low_confidence_table}\``,
    `- Locality audit: \`${report.locality_audit_table}\``,
    `- Checkpoint: \`${report.checkpoint}\``,
    "",
    "## Low-Confidence Sample",
    "",
    renderRows(report.low_confidence_sample, ["location_id", "location_name", "status", "formatted_address", "location_type", "country_code", "result_country_code"], 80),
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
  console.log(`Geocode candidates with country: ${inventory.geocode_candidates_with_country}`);
  console.log(`Locality conflict rows: ${inventory.locality_review_rows}`);
  console.log(`Locality conflict rows geocodable: ${inventory.geocode_locality_review_candidates}`);
  console.log(`Total Google targets after de-dupe: ${inventory.candidates.length}`);
  console.log(`Estimated cost: $${inventory.estimated_cost_usd.toFixed(2)}`);
  console.log(`Coordinate coverage before: ${inventory.coordinate_coverage}`);
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
    counts[row[key]] = (counts[row[key]] || 0) + 1;
  }
  return counts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeMd(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--inventory-only") {
      parsed.inventoryOnly = true;
    } else if (arg === "--approved-cost") {
      parsed.approvedCost = true;
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
    } else if (arg === "--env-file") {
      parsed.envFile ||= [];
      parsed.envFile.push(args[++index]);
    } else if (arg === "--rate-limit-ms") {
      parsed.rateLimitMs = args[++index];
    } else if (arg === "--max-api-calls") {
      parsed.maxApiCalls = args[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizePostgresConnectionString(value) {
  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return value;
  }
}

function normalizeIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return value;
}

function quoteIdent(value) {
  return `"${normalizeIdentifier(value).replaceAll('"', '""')}"`;
}
