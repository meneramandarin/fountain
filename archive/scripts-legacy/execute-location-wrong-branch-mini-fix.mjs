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
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `location-wrong-branch-mini-fix-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/location-wrong-branch-mini-fix-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);

const oneOffFixIds = [1389, 2479, 2488, 2507, 2525, 4921];
const hideIds = [3951, 8507];
const explicitlyLeftFlaggedIds = [2523, 2528, 2529, 2530, 2531, 5303, 3200, 3201, 3202, 2537, 9303, 12171];

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
  const before = await loadReviewRows(client);
  const plan = buildPlan(before.rows);
  const report = await executePlan(client, before, plan);
  writeReports(report);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadReviewRows(pgClient) {
  const rows = await pgClient.query(`
    SELECT
      w.location_id,
      w.location_name,
      w.current_locality,
      w.current_region,
      w.current_country_code,
      w.formatted_address,
      w.result_country_code,
      w.location_type,
      w.result_types,
      w.reason,
      w.claimed_place,
      w.detail,
      NULLIF(w.detail->>'latitude', '')::double precision AS latitude,
      NULLIF(w.detail->>'longitude', '')::double precision AS longitude,
      l.name,
      l.slug,
      l.status,
      l.locality,
      l.region,
      l.country_code,
      l.country_name,
      l.latitude AS old_latitude,
      l.longitude AS old_longitude
    FROM ${quoteIdent(rawSchema)}.location_geocode_wrong_branch_address_20260707 w
    JOIN ${quoteIdent(schema)}.locations l ON l.id = w.location_id
    WHERE l.deleted_at IS NULL
    ORDER BY w.location_id
  `);
  return { rows: rows.rows };
}

function buildPlan(rows) {
  const accepted = [];
  const hidden = [];
  const leftFlagged = [];

  for (const row of rows) {
    if (hideIds.includes(row.location_id)) {
      hidden.push({
        ...row,
        rule: "non_longevity_business_hidden_deletion_review",
      });
      continue;
    }

    const isCaAsCanadaButUsAddress = row.country_code === "CA" && row.result_country_code === "US" && row.latitude != null && row.longitude != null;
    const isNamedOneOff = oneOffFixIds.includes(row.location_id) && row.result_country_code && row.latitude != null && row.longitude != null;
    if (isCaAsCanadaButUsAddress || isNamedOneOff) {
      const geography = parseFormattedGeography(row.formatted_address, row.result_country_code);
      accepted.push({
        location_id: row.location_id,
        location_name: row.location_name,
        old_country_code: row.country_code,
        old_country_name: row.country_name,
        old_region: row.region,
        old_locality: row.locality,
        old_latitude: row.old_latitude,
        old_longitude: row.old_longitude,
        new_country_code: row.result_country_code,
        new_country_name: countryNameForCode(row.result_country_code),
        new_region: geography.region,
        new_locality: geography.locality,
        new_latitude: row.latitude,
        new_longitude: row.longitude,
        formatted_address: row.formatted_address,
        location_type: row.location_type,
        result_types: row.result_types || [],
        rule: isNamedOneOff ? "wrong_branch_one_off_geocoder_fix" : "canada_code_us_state_geocoder_fix",
      });
      continue;
    }

    leftFlagged.push(row);
  }

  return { accepted, hidden, leftFlagged };
}

async function executePlan(pgClient, before, plan) {
  await pgClient.query("BEGIN");
  try {
    await ensureTables(pgClient, plan);
    await insertPlanTables(pgClient, plan);
    await withGenericAuditTriggerDisabled(pgClient, async () => {
      await applyAcceptedFixes(pgClient, plan.accepted);
      await applyHiddenRows(pgClient, plan.hidden);
    });
    await removeResolvedReviewRows(pgClient, [...plan.accepted, ...plan.hidden].map((row) => row.location_id));
    await refreshSearchIndex(pgClient, [...plan.accepted, ...plan.hidden].map((row) => row.location_id));
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
  const ids = [...plan.accepted, ...plan.hidden].map((row) => row.location_id);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_backup_${phaseDate}`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.locations
    WHERE false
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_audit_${phaseDate}`)} (
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
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_accepted_${phaseDate}`)} (
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
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_deletion_review_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      location_name text,
      slug text,
      old_status text,
      new_status text,
      reason text NOT NULL,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_resolved_review_${phaseDate}`)} (
      location_id integer PRIMARY KEY,
      location_name text,
      resolution text NOT NULL,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  if (ids.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_backup_${phaseDate}`)}
      SELECT l.*
      FROM ${quoteIdent(schema)}.locations l
      WHERE l.id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1
          FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_backup_${phaseDate}`)} b
          WHERE b.id = l.id
        )
      `,
      [ids],
    );
  }
}

async function insertPlanTables(pgClient, plan) {
  await insertAcceptedRows(pgClient, plan.accepted);
  await insertDeletionReviewRows(pgClient, plan.hidden);
  await insertResolvedReviewRows(pgClient, plan);
  await insertAuditRows(pgClient, buildAudit(plan));
}

async function insertAcceptedRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_accepted_${phaseDate}`)}
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

async function insertDeletionReviewRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  const payload = rows.map((row) => ({
    location_id: row.location_id,
    location_name: row.location_name,
    slug: row.slug,
    old_status: row.status,
    new_status: "hidden",
    reason: row.rule,
    detail: {
      formatted_address: row.formatted_address,
      current_country_code: row.country_code,
      result_country_code: row.result_country_code,
      review_source: "wrong_branch_address",
    },
  }));
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_deletion_review_${phaseDate}`)}
      (location_id, location_name, slug, old_status, new_status, reason, detail)
    SELECT location_id, location_name, slug, old_status, new_status, reason, detail
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      slug text,
      old_status text,
      new_status text,
      reason text,
      detail jsonb
    )
    ON CONFLICT (location_id) DO UPDATE
      SET old_status = EXCLUDED.old_status,
          new_status = EXCLUDED.new_status,
          reason = EXCLUDED.reason,
          detail = EXCLUDED.detail
    `,
    [JSON.stringify(payload)],
  );

  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_deletion_review_${phaseDate}`)}
      (location_id, location_name, slug, old_status, new_status, reason, detail)
    SELECT location_id, location_name, slug, old_status, new_status, reason, detail
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      slug text,
      old_status text,
      new_status text,
      reason text,
      detail jsonb
    )
    ON CONFLICT (location_id) DO UPDATE
      SET old_status = EXCLUDED.old_status,
          new_status = EXCLUDED.new_status,
          reason = EXCLUDED.reason,
          detail = EXCLUDED.detail
    `,
    [JSON.stringify(payload)],
  );
}

async function insertResolvedReviewRows(pgClient, plan) {
  const rows = [
    ...plan.accepted.map((row) => ({
      location_id: row.location_id,
      location_name: row.location_name,
      resolution: row.rule,
      detail: { formatted_address: row.formatted_address, new_country_code: row.new_country_code },
    })),
    ...plan.hidden.map((row) => ({
      location_id: row.location_id,
      location_name: row.location_name,
      resolution: row.rule,
      detail: { formatted_address: row.formatted_address, status: "hidden" },
    })),
  ];
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_resolved_review_${phaseDate}`)}
      (location_id, location_name, resolution, detail)
    SELECT location_id, location_name, resolution, detail
    FROM jsonb_to_recordset($1::jsonb) AS x(location_id integer, location_name text, resolution text, detail jsonb)
    ON CONFLICT (location_id) DO UPDATE
      SET resolution = EXCLUDED.resolution,
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
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_audit_${phaseDate}`)}
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

function buildAudit(plan) {
  const audit = [];
  for (const row of plan.accepted) {
    addAudit(audit, row, "country_code", row.old_country_code, row.new_country_code, row.rule, row.formatted_address);
    addAudit(audit, row, "country_name", row.old_country_name, row.new_country_name, row.rule, row.formatted_address);
    addAudit(audit, row, "region", row.old_region, row.new_region, row.rule, row.formatted_address);
    addAudit(audit, row, "locality", row.old_locality, row.new_locality, row.rule, row.formatted_address);
    addAudit(audit, row, "latitude", row.old_latitude, row.new_latitude, row.rule, row.formatted_address);
    addAudit(audit, row, "longitude", row.old_longitude, row.new_longitude, row.rule, row.formatted_address);
  }
  for (const row of plan.hidden) {
    addAudit(audit, row, "status", row.status, "hidden", row.rule, row.formatted_address);
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

async function applyAcceptedFixes(pgClient, rows) {
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

async function applyHiddenRows(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations l
    SET status = 'hidden'
    WHERE l.id = ANY($1::int[])
    `,
    [rows.map((row) => row.location_id)],
  );
}

async function removeResolvedReviewRows(pgClient, ids) {
  if (!ids.length) {
    return;
  }
  await pgClient.query(
    `
    DELETE FROM ${quoteIdent(rawSchema)}.location_geocode_wrong_branch_address_20260707
    WHERE location_id = ANY($1::int[])
    `,
    [ids],
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
  const acceptedIds = plan.accepted.map((row) => row.location_id);
  const hiddenIds = plan.hidden.map((row) => row.location_id);
  const leftIds = explicitlyLeftFlaggedIds;
  const counts = await pgClient.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE id = ANY($1::int[]) AND latitude IS NOT NULL AND longitude IS NOT NULL)::int AS accepted_with_coordinates,
      COUNT(*) FILTER (WHERE id = ANY($1::int[]) AND country_code <> 'CA')::int AS accepted_no_longer_canada_code,
      COUNT(*) FILTER (WHERE id = ANY($2::int[]) AND status = 'hidden')::int AS hidden_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_accepted_${phaseDate}`)}) AS accepted_table_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_deletion_review_${phaseDate}`)}) AS deletion_review_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_wrong_branch_mini_fix_audit_${phaseDate}`)}) AS audit_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.location_geocode_wrong_branch_address_20260707) AS wrong_branch_rows_remaining,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.location_geocode_wrong_branch_address_20260707 WHERE location_id = ANY($3::int[])) AS explicitly_left_flagged_remaining
    FROM ${quoteIdent(schema)}.locations
    WHERE id = ANY($4::int[])
    `,
    [acceptedIds, hiddenIds, leftIds, [...acceptedIds, ...hiddenIds]],
  );
  return counts.rows[0];
}

function buildReport(before, plan, after) {
  return {
    generated_at: new Date().toISOString(),
    mode: dryRun ? "dry_run" : "live_write",
    schema,
    raw_schema: rawSchema,
    summary: {
      wrong_branch_rows_before: before.rows.length,
      accepted_geocoder_rows: plan.accepted.length,
      accepted_ca_to_us_rows: plan.accepted.filter((row) => row.rule === "canada_code_us_state_geocoder_fix").length,
      accepted_one_off_rows: plan.accepted.filter((row) => row.rule === "wrong_branch_one_off_geocoder_fix").length,
      hidden_deletion_review_rows: plan.hidden.length,
      left_flagged_rows: plan.leftFlagged.length,
      ...after,
    },
    tables: {
      backup: `${rawSchema}.location_wrong_branch_mini_fix_backup_${phaseDate}`,
      audit: `${rawSchema}.location_wrong_branch_mini_fix_audit_${phaseDate}`,
      accepted: `${rawSchema}.location_wrong_branch_mini_fix_accepted_${phaseDate}`,
      deletion_review: `${rawSchema}.location_wrong_branch_mini_fix_deletion_review_${phaseDate}`,
      resolved_review: `${rawSchema}.location_wrong_branch_mini_fix_resolved_review_${phaseDate}`,
      active_wrong_branch_review: `${rawSchema}.location_geocode_wrong_branch_address_20260707`,
    },
    accepted_rows: plan.accepted,
    hidden_rows: plan.hidden.map((row) => ({
      location_id: row.location_id,
      location_name: row.location_name,
      old_status: row.status,
      new_status: "hidden",
      formatted_address: row.formatted_address,
      rule: row.rule,
    })),
    left_flagged_rows: plan.leftFlagged.map((row) => ({
      location_id: row.location_id,
      location_name: row.location_name,
      reason: row.reason,
      claimed_place: row.claimed_place,
      current_locality: row.locality,
      current_country_code: row.country_code,
      formatted_address: row.formatted_address,
      result_country_code: row.result_country_code,
    })),
  };
}

function writeReports(report) {
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
}

function renderMarkdown(report) {
  return [
    `# Location Wrong-Branch Mini-Fix Report (${phaseDate})`,
    "",
    `Mode: ${report.mode}`,
    "",
    "## Summary",
    "",
    `- Wrong-branch rows before: ${report.summary.wrong_branch_rows_before}`,
    `- Accepted geocoder rows: ${report.summary.accepted_geocoder_rows}`,
    `- Accepted CA-as-Canada to US rows: ${report.summary.accepted_ca_to_us_rows}`,
    `- Accepted named one-off rows: ${report.summary.accepted_one_off_rows}`,
    `- Hidden/deletion-review rows: ${report.summary.hidden_deletion_review_rows}`,
    `- Rows left flagged: ${report.summary.left_flagged_rows}`,
    `- Wrong-branch rows remaining in active review table: ${report.summary.wrong_branch_rows_remaining}`,
    "",
    "## Tables",
    "",
    `- Backup: \`${report.tables.backup}\``,
    `- Field audit: \`${report.tables.audit}\``,
    `- Accepted rows: \`${report.tables.accepted}\``,
    `- Deletion review: \`${report.tables.deletion_review}\``,
    `- Resolved review: \`${report.tables.resolved_review}\``,
    `- Active wrong-branch review: \`${report.tables.active_wrong_branch_review}\``,
    "",
    "## Hidden Rows",
    "",
    renderRows(report.hidden_rows, ["location_id", "location_name", "old_status", "new_status", "formatted_address", "rule"]),
    "",
    "## Rows Left Flagged",
    "",
    renderRows(report.left_flagged_rows, ["location_id", "location_name", "reason", "claimed_place", "current_locality", "current_country_code", "formatted_address", "result_country_code"]),
    "",
  ].join("\n");
}

function renderRows(rows, columns) {
  if (!rows.length) {
    return "_None._";
  }
  return [
    `Showing ${rows.length}.`,
    "",
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((column) => escapeMd(row[column] ?? "")).join(" | ")} |`),
  ].join("\n");
}

function parseFormattedGeography(formattedAddress, countryCode) {
  const parts = String(formattedAddress || "").split(",").map((part) => part.trim()).filter(Boolean);
  const beforeCountry = parts.slice(0, -1);
  if (countryCode === "US") {
    const statePart = beforeCountry.at(-1) || "";
    const region = statePart.match(/\b([A-Z]{2})\b/)?.[1] || null;
    const firstPart = stripPostal(beforeCountry.at(0));
    const fallbackLocality = stripPostal(beforeCountry.at(-2)) || stripPostal(beforeCountry.at(-1));
    const locality = looksLikeRoute(firstPart) && beforeCountry.length >= 3 ? fallbackLocality : firstPart || fallbackLocality;
    return { locality, region };
  }
  if (countryCode === "AE") {
    const locality = parts[0]?.replace(/\s*-\s*United Arab Emirates$/i, "") || "United Arab Emirates";
    return { locality, region: null };
  }
  if (countryCode === "IT") {
    return { locality: stripPostal(beforeCountry.at(0)), region: beforeCountry.at(1) || null };
  }
  if (countryCode === "ES") {
    return { locality: beforeCountry.at(0) || null, region: beforeCountry.at(1) || null };
  }
  if (countryCode === "DE") {
    return { locality: beforeCountry.at(0) || null, region: null };
  }
  return { locality: stripPostal(beforeCountry.at(-1)) || parts[0] || null, region: null };
}

function stripPostal(value) {
  return value?.replace(/^\d{4,6}\s+/, "").replace(/\s+\d{4,6}$/, "").trim() || null;
}

function looksLikeRoute(value) {
  return /\b(ave|avenue|st|street|rd|road|blvd|boulevard|dr|drive|ln|lane|way|pkwy|parkway|hwy|highway)\b/i.test(value || "");
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
