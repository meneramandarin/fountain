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
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `location-geocode-addendum-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/location-geocode-addendum-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);

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

const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  const before = await loadLoggedRows(client);
  const plan = buildPlan(before.rows);
  const report = await executePlan(client, before, plan);
  writeReports(report);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadLoggedRows(pgClient) {
  const rows = await pgClient.query(`
    SELECT
      lc.location_id,
      lc.location_name,
      lc.address AS logged_address,
      lc.country_code AS logged_country_code,
      lc.status AS geocode_status,
      lc.formatted_address,
      lc.location_type,
      lc.result_types,
      lc.result_country_code,
      NULLIF(lc.detail->>'latitude', '')::double precision AS latitude,
      NULLIF(lc.detail->>'longitude', '')::double precision AS longitude,
      lc.detail,
      l.name,
      l.address,
      l.locality,
      l.region,
      l.country_code,
      l.country_name,
      l.latitude AS current_latitude,
      l.longitude AS current_longitude
    FROM ${quoteIdent(rawSchema)}.location_geocode_low_confidence_20260707 lc
    JOIN ${quoteIdent(schema)}.locations l ON l.id = lc.location_id
    WHERE l.deleted_at IS NULL
      AND l.status = 'active'
    ORDER BY lc.location_id
  `);
  return { rows: rows.rows };
}

function buildPlan(rows) {
  const geocenterRecoveries = [];
  const countryFixes = [];
  const wrongBranch = [];
  const used = new Set();

  for (const row of rows) {
    if (row.geocode_status === "low_confidence_location_type" && row.location_type === "GEOMETRIC_CENTER" && hasStreetNumberOrPremise(row)) {
      if (row.current_latitude == null && row.current_longitude == null && row.latitude != null && row.longitude != null && countryMatches(row)) {
        geocenterRecoveries.push({
          location_id: row.location_id,
          location_name: row.location_name,
          old_latitude: row.current_latitude,
          old_longitude: row.current_longitude,
          new_latitude: row.latitude,
          new_longitude: row.longitude,
          formatted_address: row.formatted_address,
          location_type: row.location_type,
          result_types: row.result_types || [],
          result_country_code: row.result_country_code,
          rule: "geometric_center_street_level",
        });
        used.add(row.location_id);
      }
      continue;
    }

    if (row.geocode_status === "country_mismatch") {
      if (isCountryFixCandidate(row)) {
        const geo = parseFormattedGeography(row.formatted_address, row.result_country_code);
        countryFixes.push({
          location_id: row.location_id,
          location_name: row.location_name,
          old_country_code: row.country_code,
          old_country_name: row.country_name,
          old_region: row.region,
          old_locality: row.locality,
          old_latitude: row.current_latitude,
          old_longitude: row.current_longitude,
          new_country_code: row.result_country_code,
          new_country_name: countryNameForCode(row.result_country_code),
          new_region: geo.region,
          new_locality: geo.locality,
          new_latitude: row.latitude,
          new_longitude: row.longitude,
          formatted_address: row.formatted_address,
          location_type: row.location_type,
          result_types: row.result_types || [],
          rule: "geocoder_country_fix",
        });
        used.add(row.location_id);
      } else {
        wrongBranch.push(wrongBranchRow(row, row.location_type === "APPROXIMATE" ? "country_mismatch_approximate" : "country_mismatch_not_street_level"));
      }
      continue;
    }

    const claim = nameGeographyClaim(row.name || row.location_name);
    if (row.geocode_status === "low_confidence_location_type" && row.location_type === "APPROXIMATE" && claim && !formattedMatchesClaim(row.formatted_address, claim)) {
      wrongBranch.push(wrongBranchRow(row, "name_claim_differs_from_geocoded_address", claim));
    }
  }

  return {
    geocenterRecoveries,
    countryFixes,
    wrongBranch: dedupeByLocation(wrongBranch.filter((row) => !used.has(row.location_id))),
  };
}

async function executePlan(pgClient, before, plan) {
  await pgClient.query("BEGIN");
  try {
    await ensureTables(pgClient, plan);
    await insertPlanTables(pgClient, plan);
    await withGenericAuditTriggerDisabled(pgClient, async () => {
      await writeGeocenterRecoveries(pgClient, plan.geocenterRecoveries);
      await writeCountryFixes(pgClient, plan.countryFixes);
    });
    await refreshSearchIndex(pgClient, [...plan.geocenterRecoveries, ...plan.countryFixes].map((row) => row.location_id));
    const after = await loadAcceptance(pgClient, plan);
    if (dryRun) {
      await pgClient.query("ROLLBACK");
    } else {
      await pgClient.query("COMMIT");
    }
    return buildReport(before, plan, after);
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

async function ensureTables(pgClient, plan) {
  const ids = [...plan.geocenterRecoveries, ...plan.countryFixes].map((row) => row.location_id);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_backup_${phaseDate}`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.locations
    WHERE false
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_audit_${phaseDate}`)} (
      location_id integer NOT NULL,
      field text NOT NULL,
      old_value text,
      new_value text,
      rule text NOT NULL,
      formatted_address text,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_recovered_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      location_name text,
      new_latitude double precision,
      new_longitude double precision,
      formatted_address text,
      location_type text,
      result_types text[],
      result_country_code text,
      rule text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_country_fix_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      location_name text,
      old_country_code text,
      new_country_code text,
      old_country_name text,
      new_country_name text,
      old_region text,
      new_region text,
      old_locality text,
      new_locality text,
      new_latitude double precision,
      new_longitude double precision,
      formatted_address text,
      location_type text,
      result_types text[],
      rule text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_wrong_branch_address_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      location_name text,
      current_locality text,
      current_region text,
      current_country_code text,
      formatted_address text,
      result_country_code text,
      location_type text,
      result_types text[],
      reason text NOT NULL,
      claimed_place text,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  if (ids.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_backup_${phaseDate}`)}
      SELECT l.*
      FROM ${quoteIdent(schema)}.locations l
      WHERE l.id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1
          FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_backup_${phaseDate}`)} b
          WHERE b.id = l.id
        )
      `,
      [ids],
    );
  }
}

async function insertPlanTables(pgClient, plan) {
  await insertRecoveredRows(pgClient, plan.geocenterRecoveries);
  await insertCountryFixRows(pgClient, plan.countryFixes);
  await insertWrongBranchRows(pgClient, plan.wrongBranch);
  await insertAuditRows(pgClient, buildAudit(plan));
}

async function insertRecoveredRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_recovered_${phaseDate}`)}
      (location_id, location_name, new_latitude, new_longitude, formatted_address, location_type, result_types, result_country_code, rule)
    SELECT location_id, location_name, new_latitude, new_longitude, formatted_address, location_type, result_types, result_country_code, rule
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      new_latitude double precision,
      new_longitude double precision,
      formatted_address text,
      location_type text,
      result_types text[],
      result_country_code text,
      rule text
    )
    ON CONFLICT (location_id) DO UPDATE
      SET new_latitude = EXCLUDED.new_latitude,
          new_longitude = EXCLUDED.new_longitude,
          formatted_address = EXCLUDED.formatted_address,
          location_type = EXCLUDED.location_type,
          result_types = EXCLUDED.result_types,
          result_country_code = EXCLUDED.result_country_code,
          rule = EXCLUDED.rule
    `,
    [JSON.stringify(rows)],
  );
}

async function insertCountryFixRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_country_fix_${phaseDate}`)}
      (location_id, location_name, old_country_code, new_country_code, old_country_name, new_country_name, old_region, new_region, old_locality, new_locality, new_latitude, new_longitude, formatted_address, location_type, result_types, rule)
    SELECT location_id, location_name, old_country_code, new_country_code, old_country_name, new_country_name, old_region, new_region, old_locality, new_locality, new_latitude, new_longitude, formatted_address, location_type, result_types, rule
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      old_country_code text,
      new_country_code text,
      old_country_name text,
      new_country_name text,
      old_region text,
      new_region text,
      old_locality text,
      new_locality text,
      new_latitude double precision,
      new_longitude double precision,
      formatted_address text,
      location_type text,
      result_types text[],
      rule text
    )
    ON CONFLICT (location_id) DO UPDATE
      SET new_country_code = EXCLUDED.new_country_code,
          new_country_name = EXCLUDED.new_country_name,
          new_region = EXCLUDED.new_region,
          new_locality = EXCLUDED.new_locality,
          new_latitude = EXCLUDED.new_latitude,
          new_longitude = EXCLUDED.new_longitude,
          formatted_address = EXCLUDED.formatted_address,
          location_type = EXCLUDED.location_type,
          result_types = EXCLUDED.result_types,
          rule = EXCLUDED.rule
    `,
    [JSON.stringify(rows)],
  );
}

async function insertWrongBranchRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_wrong_branch_address_${phaseDate}`)}
      (location_id, location_name, current_locality, current_region, current_country_code, formatted_address, result_country_code, location_type, result_types, reason, claimed_place, detail)
    SELECT location_id, location_name, current_locality, current_region, current_country_code, formatted_address, result_country_code, location_type, result_types, reason, claimed_place, detail
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      current_locality text,
      current_region text,
      current_country_code text,
      formatted_address text,
      result_country_code text,
      location_type text,
      result_types text[],
      reason text,
      claimed_place text,
      detail jsonb
    )
    ON CONFLICT (location_id) DO UPDATE
      SET location_name = EXCLUDED.location_name,
          current_locality = EXCLUDED.current_locality,
          current_region = EXCLUDED.current_region,
          current_country_code = EXCLUDED.current_country_code,
          formatted_address = EXCLUDED.formatted_address,
          result_country_code = EXCLUDED.result_country_code,
          location_type = EXCLUDED.location_type,
          result_types = EXCLUDED.result_types,
          reason = EXCLUDED.reason,
          claimed_place = EXCLUDED.claimed_place,
          detail = EXCLUDED.detail
    `,
    [JSON.stringify(rows)],
  );
}

async function insertAuditRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_audit_${phaseDate}`)}
      (location_id, field, old_value, new_value, rule, formatted_address)
    SELECT location_id, field, old_value, new_value, rule, formatted_address
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      field text,
      old_value text,
      new_value text,
      rule text,
      formatted_address text
    )
    `,
    [JSON.stringify(rows)],
  );
}

async function writeGeocenterRecoveries(pgClient, rows) {
  if (!rows.length) {
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
    [JSON.stringify(rows)],
  );
}

async function writeCountryFixes(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations l
    SET country_code = x.new_country_code,
        country_name = x.new_country_name,
        region = x.new_region,
        locality = x.new_locality,
        latitude = x.new_latitude,
        longitude = x.new_longitude
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      new_country_code text,
      new_country_name text,
      new_region text,
      new_locality text,
      new_latitude double precision,
      new_longitude double precision
    )
    WHERE l.id = x.location_id
    `,
    [JSON.stringify(rows)],
  );
}

async function refreshSearchIndex(pgClient, locationIds) {
  const ids = Array.from(new Set(locationIds));
  if (!ids.length) {
    return;
  }
  const exists = await pgClient.query(`SELECT to_regprocedure($1) AS proc`, [`${schema}.refresh_search_index_for_location(integer)`]);
  if (!exists.rows[0].proc) {
    return;
  }
  await pgClient.query(
    `
    SELECT ${quoteIdent(schema)}.refresh_search_index_for_location(id)
    FROM unnest($1::int[]) AS ids(id)
    `,
    [ids],
  );
}

async function loadAcceptance(pgClient, plan) {
  const ids = [...plan.geocenterRecoveries, ...plan.countryFixes].map((row) => row.location_id);
  const counts = await pgClient.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE id = ANY($1::int[]) AND latitude IS NOT NULL AND longitude IS NOT NULL)::int AS updated_coordinate_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_recovered_${phaseDate}`)}) AS recovered_table_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_country_fix_${phaseDate}`)}) AS country_fix_table_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_wrong_branch_address_${phaseDate}`)}) AS wrong_branch_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_geocode_addendum_audit_${phaseDate}`)}) AS audit_rows
    FROM ${quoteIdent(schema)}.locations
    WHERE id = ANY($1::int[])
    `,
    [ids],
  );
  return counts.rows[0];
}

function buildAudit(plan) {
  const audit = [];
  for (const row of plan.geocenterRecoveries) {
    addAudit(audit, row, "latitude", row.old_latitude, row.new_latitude, row.rule, row.formatted_address);
    addAudit(audit, row, "longitude", row.old_longitude, row.new_longitude, row.rule, row.formatted_address);
  }
  for (const row of plan.countryFixes) {
    addAudit(audit, row, "country_code", row.old_country_code, row.new_country_code, row.rule, row.formatted_address);
    addAudit(audit, row, "country_name", row.old_country_name, row.new_country_name, row.rule, row.formatted_address);
    addAudit(audit, row, "region", row.old_region, row.new_region, row.rule, row.formatted_address);
    addAudit(audit, row, "locality", row.old_locality, row.new_locality, row.rule, row.formatted_address);
    addAudit(audit, row, "latitude", row.old_latitude, row.new_latitude, row.rule, row.formatted_address);
    addAudit(audit, row, "longitude", row.old_longitude, row.new_longitude, row.rule, row.formatted_address);
  }
  return audit;
}

function addAudit(audit, row, field, oldValue, newValue, rule, formattedAddress) {
  const oldText = oldValue == null ? null : String(oldValue);
  const newText = newValue == null ? null : String(newValue);
  if (oldText === newText) {
    return;
  }
  audit.push({
    location_id: row.location_id,
    field,
    old_value: oldText,
    new_value: newText,
    rule,
    formatted_address: formattedAddress,
  });
}

function buildReport(before, plan, after) {
  return {
    generated_at: new Date().toISOString(),
    mode: dryRun ? "dry_run" : "live_write",
    schema,
    raw_schema: rawSchema,
    summary: {
      logged_low_confidence_rows: before.rows.length,
      coordinates_recovered_from_geometric_center: plan.geocenterRecoveries.length,
      countries_fixed_from_geocoder: plan.countryFixes.length,
      wrong_branch_address_rows: plan.wrongBranch.length,
      ...after,
    },
    tables: {
      backup: `${rawSchema}.location_geocode_addendum_backup_${phaseDate}`,
      audit: `${rawSchema}.location_geocode_addendum_audit_${phaseDate}`,
      recovered: `${rawSchema}.location_geocode_addendum_recovered_${phaseDate}`,
      country_fix: `${rawSchema}.location_geocode_addendum_country_fix_${phaseDate}`,
      wrong_branch_address: `${rawSchema}.location_geocode_wrong_branch_address_${phaseDate}`,
    },
    wrong_branch_address: plan.wrongBranch,
    country_fixes: plan.countryFixes,
    geocenter_recoveries_sample: plan.geocenterRecoveries.slice(0, 100),
  };
}

function writeReports(report) {
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
}

function renderMarkdown(report) {
  return [
    `# Location Geocode Addendum Report (${phaseDate})`,
    "",
    `Mode: ${report.mode}`,
    "",
    "## Summary",
    "",
    `- Logged low-confidence rows scanned: ${report.summary.logged_low_confidence_rows}`,
    `- Coordinates recovered from GEOMETRIC_CENTER street/premise rows: ${report.summary.coordinates_recovered_from_geometric_center}`,
    `- Country mismatches fixed from street-level geocoder rows: ${report.summary.countries_fixed_from_geocoder}`,
    `- Wrong-branch address review rows: ${report.summary.wrong_branch_address_rows}`,
    `- Field audit rows: ${report.summary.audit_rows}`,
    "",
    "## Tables",
    "",
    `- Backup: \`${report.tables.backup}\``,
    `- Field audit: \`${report.tables.audit}\``,
    `- Recovered GEOMETRIC_CENTER coordinates: \`${report.tables.recovered}\``,
    `- Geocoder country fixes: \`${report.tables.country_fix}\``,
    `- Wrong branch address review: \`${report.tables.wrong_branch_address}\``,
    "",
    "## Wrong Branch Address List",
    "",
    renderRows(report.wrong_branch_address, ["location_id", "location_name", "reason", "claimed_place", "current_locality", "current_country_code", "formatted_address", "result_country_code"], report.wrong_branch_address.length),
    "",
  ].join("\n");
}

function renderRows(rows, columns, limit) {
  if (!rows.length) {
    return "_None._";
  }
  const visible = rows.slice(0, limit);
  return [
    `Showing ${visible.length}.`,
    "",
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...visible.map((row) => `| ${columns.map((column) => escapeMd(row[column] ?? "")).join(" | ")} |`),
  ].join("\n");
}

function hasStreetNumberOrPremise(row) {
  const formatted = row.formatted_address || "";
  const addressLine = formatted.split(",")[0] || "";
  const types = row.result_types || [];
  return /^\s*\d{1,6}(?:[-/ ][A-Za-z0-9]+)?\s+\S+/.test(addressLine) || types.some((type) => ["street_address", "premise", "subpremise"].includes(type));
}

function isCountryFixCandidate(row) {
  if (!row.result_country_code || row.latitude == null || row.longitude == null) {
    return false;
  }
  if (row.location_type === "APPROXIMATE") {
    return false;
  }
  return row.location_type === "ROOFTOP" || row.location_type === "RANGE_INTERPOLATED" || hasStreetNumberOrPremise(row);
}

function countryMatches(row) {
  return !row.result_country_code || !row.country_code || row.result_country_code === row.country_code;
}

function wrongBranchRow(row, reason, claim = null) {
  return {
    location_id: row.location_id,
    location_name: row.location_name,
    current_locality: row.locality,
    current_region: row.region,
    current_country_code: row.country_code,
    formatted_address: row.formatted_address,
    result_country_code: row.result_country_code,
    location_type: row.location_type,
    result_types: row.result_types || [],
    reason,
    claimed_place: claim?.label || null,
    detail: {
      logged_country_code: row.logged_country_code,
      logged_address: row.logged_address,
      latitude: row.latitude,
      longitude: row.longitude,
      result_types: row.result_types || [],
    },
  };
}

function dedupeByLocation(rows) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    if (seen.has(row.location_id)) {
      continue;
    }
    seen.add(row.location_id);
    result.push(row);
  }
  return result;
}

function parseFormattedGeography(formattedAddress, countryCode) {
  const parts = String(formattedAddress || "").split(",").map((part) => part.trim()).filter(Boolean);
  const beforeCountry = parts.slice(0, -1);
  if (countryCode === "US") {
    const statePart = beforeCountry.at(-1) || "";
    const region = statePart.match(/\b([A-Z]{2})\b/)?.[1] || null;
    return { locality: beforeCountry.at(-2) || null, region };
  }
  if (countryCode === "CA") {
    const provincePart = beforeCountry.at(-1) || "";
    const region = provincePart.match(/\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/)?.[1] || null;
    return { locality: stripPostal(beforeCountry.at(-2)), region };
  }
  if (countryCode === "MX") {
    return { locality: stripPostal(beforeCountry.at(-2)), region: beforeCountry.at(-1) || null };
  }
  if (countryCode === "IT") {
    const cityRegion = stripPostal(beforeCountry.at(-1));
    const match = cityRegion?.match(/^(.+?)\s+([A-Z]{2})$/);
    return { locality: match ? match[1] : cityRegion, region: match ? match[2] : null };
  }
  if (countryCode === "CR" && beforeCountry.length >= 2) {
    return { locality: beforeCountry.at(-1) || null, region: beforeCountry.at(-2) || null };
  }
  const locality = stripPostal(beforeCountry.at(-1)) || stripPostal(beforeCountry.at(-2)) || null;
  return { locality, region: null };
}

function stripPostal(value) {
  return value?.replace(/^\d{4,6}\s+/, "").trim() || null;
}

function countryNameForCode(code) {
  if (!code) {
    return null;
  }
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function nameGeographyClaim(name) {
  const normalized = normalizeText(name);
  const claims = [
    { label: "New York", city: "new york", country: "US", patterns: ["new york city", "new york", "nyc"] },
    { label: "Switzerland", country: "CH", patterns: ["switzerland", "swiss"] },
    { label: "Poland", country: "PL", patterns: ["poland"] },
    { label: "London", city: "london", country: "GB", patterns: ["london"] },
    { label: "Scottsdale", city: "scottsdale", country: "US", patterns: ["scottsdale"] },
    { label: "Jacksonville", city: "jacksonville", country: "US", patterns: ["jacksonville"] },
    { label: "Rochester", city: "rochester", country: "US", patterns: ["rochester"] },
    { label: "Prague", city: "prague", country: "CZ", patterns: ["prague"] },
    { label: "Dubai", city: "dubai", country: "AE", patterns: ["dubai"] },
    { label: "San Francisco", city: "san francisco", country: "US", patterns: ["san francisco"] },
    { label: "Brisbane", city: "brisbane", country: "AU", patterns: ["brisbane"] },
    { label: "Calabasas", city: "calabasas", country: "US", patterns: ["calabasas"] },
  ];
  return claims.find((claim) => claim.patterns.some((pattern) => normalized.includes(pattern))) || null;
}

function formattedMatchesClaim(formattedAddress, claim) {
  const normalized = normalizeText(formattedAddress);
  if (claim.city) {
    return normalized.includes(claim.city);
  }
  if (claim.country && normalizeText(countryNameForCode(claim.country)) && normalized.includes(normalizeText(countryNameForCode(claim.country)))) {
    return true;
  }
  if (claim.country === "US" && (normalized.includes("usa") || normalized.includes("united states"))) {
    return true;
  }
  return false;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

async function withGenericAuditTriggerDisabled(pgClient, callback) {
  await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations DISABLE TRIGGER trg_audit_entity_change`);
  try {
    return await callback();
  } finally {
    await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations ENABLE TRIGGER trg_audit_entity_change`);
  }
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
    } else if (arg === "--date") {
      parsed.date = args[++index];
    } else if (arg === "--schema") {
      parsed.schema = args[++index];
    } else if (arg === "--raw-schema") {
      parsed.rawSchema = args[++index];
    } else if (arg === "--database-url") {
      parsed.databaseUrl = args[++index];
    } else if (arg === "--json-out") {
      parsed.jsonOut = args[++index];
    } else if (arg === "--md-out") {
      parsed.mdOut = args[++index];
    } else if (arg === "--env-file") {
      parsed.envFile ||= [];
      parsed.envFile.push(args[++index]);
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
