#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.phaseDate || "20260708";
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const dryRun = Boolean(options.dryRun);
const backupTable = options.backupTable || `browser_swarm_menu_tier1_nav_deleted_${phaseDate}`;
const reportPath = path.resolve(ROOT, options.report || `docs/menu-cleanup-tiers23-report-${phaseDate}.md`);
const jsonPath = path.resolve(ROOT, options.json || `menu-cleanup-tiers23-report-${phaseDate}.json`);

const genericSimpleNames = [
  "about",
  "all",
  "all services",
  "appointments",
  "blog",
  "book",
  "book now",
  "booking",
  "care",
  "classes",
  "class",
  "company",
  "conditions",
  "consultation",
  "consultations",
  "contact",
  "contact us",
  "events",
  "event",
  "faq",
  "faqs",
  "featured products",
  "financing options",
  "get started",
  "gift card",
  "gift cards",
  "home",
  "learn more",
  "locations",
  "location",
  "login",
  "membership",
  "memberships",
  "men",
  "menu",
  "new patient form",
  "online booking",
  "our treatments",
  "package",
  "packages",
  "patient forms",
  "patient resources",
  "plans",
  "plan",
  "prices",
  "price",
  "pricing",
  "products",
  "product",
  "projects",
  "read more",
  "research",
  "resources",
  "schedule",
  "services",
  "service",
  "shop",
  "specials",
  "store",
  "testing",
  "test",
  "tests",
  "testimonials",
  "therapies",
  "therapy",
  "treatments",
  "treatment",
  "virtual sessions",
  "wellness",
  "women",
];

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

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
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)}`);

  const before = await loadSummary();
  const candidates = await loadDeleteCandidates();
  const backupBefore = await loadBackupDeleted();
  const borderlineKept = await loadBorderlineKept();
  const priceConflicts = await loadReviewRows("price_conflict");
  const sanityFlags = await loadReviewRows("sanity_flag");

  if (!dryRun) {
    await backupAndDelete(candidates.map((row) => row.offering_id));
  }

  const after = await loadSummary();
  const backupAfter = await loadBackupDeleted();
  const deletedSourceRows = candidates.length ? candidates : backupAfter.rows;
  const deletedDistinctRawNames = [...new Set(deletedSourceRows.map((row) => row.raw_name))].sort((a, b) => a.localeCompare(b));
  const deletedRows = candidates.length || backupAfter.count;
  const deletedPricedRows = candidates.length
    ? candidates.filter((row) => row.price_amount !== null && row.price_amount !== undefined).length
    : backupAfter.pricedCount;
  const effectiveBefore = dryRun || candidates.length
    ? before
    : {
        ...after,
        active_tier1_inserted: Number(after.active_tier1_inserted || 0) + deletedRows,
        active_tier1_inserted_priced: Number(after.active_tier1_inserted_priced || 0) + deletedPricedRows,
        active_tier1_inserted_distinct_raw_names: Number(after.active_tier1_inserted_distinct_raw_names || 0) + deletedDistinctRawNames.length,
      };
  const report = {
    phaseDate,
    dryRun,
    backupTable: `${rawSchema}.${backupTable}`,
    genericSimpleNames,
    before: effectiveBefore,
    after,
    backupBeforeCount: backupBefore.count,
    backupAfterCount: backupAfter.count,
    deletedRows,
    deletedPricedRows,
    deletedDistinctRawNameCount: deletedDistinctRawNames.length,
    deletedDistinctRawNames,
    borderlineKept,
    priceConflicts,
    sanityFlags,
  };

  writeJson(jsonPath, report);
  writeMarkdown(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${path.relative(ROOT, reportPath)}`);
} finally {
  await client.end().catch(() => {});
}

async function loadSummary() {
  const result = await client.query(`
    SELECT
      count(*) FILTER (WHERE m.outcome = 'new_offering_inserted' AND o.id IS NOT NULL AND o.deleted_at IS NULL)::integer AS active_tier1_inserted,
      count(*) FILTER (WHERE m.outcome = 'new_offering_inserted' AND o.id IS NOT NULL AND o.deleted_at IS NULL AND o.price_amount IS NOT NULL)::integer AS active_tier1_inserted_priced,
      count(DISTINCT o.raw_name) FILTER (WHERE m.outcome = 'new_offering_inserted' AND o.id IS NOT NULL AND o.deleted_at IS NULL)::integer AS active_tier1_inserted_distinct_raw_names,
      (SELECT count(*)::integer FROM ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)} WHERE tier = 1 AND outcome = 'price_conflict') AS price_conflicts,
      (SELECT count(*)::integer FROM ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)} WHERE tier = 1 AND outcome = 'sanity_flag') AS sanity_flags
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)} m
    LEFT JOIN ${quoteIdent(schema)}.offerings o ON o.id = m.offering_id
    WHERE m.tier = 1
  `);
  return result.rows[0];
}

async function loadBackupDeleted() {
  const exists = await client.query(`
    SELECT to_regclass($1) AS table_name
  `, [`${rawSchema}.${backupTable}`]);
  if (!exists.rows[0]?.table_name) {
    return { count: 0, pricedCount: 0, rows: [] };
  }
  const rows = await client.query(`
    SELECT id AS offering_id, raw_name, price_amount, price_currency
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(backupTable)}
    ORDER BY id
  `);
  return {
    count: rows.rows.length,
    pricedCount: rows.rows.filter((row) => row.price_amount !== null && row.price_amount !== undefined).length,
    rows: rows.rows,
  };
}

async function loadDeleteCandidates() {
  const result = await client.query(`
    WITH inserted AS (
      SELECT
        m.id AS menu_log_id,
        m.offering_id,
        m.location_id,
        m.site_origin,
        m.raw_name,
        m.price_amount,
        m.price_currency,
        m.source_page_url,
        o.treatment_id,
        lower(regexp_replace(trim(m.raw_name), '\\s+', ' ', 'g')) AS normalized_name,
        regexp_replace(lower(regexp_replace(trim(m.raw_name), '\\s+', ' ', 'g')), '[^a-z0-9]+', ' ', 'g') AS simple_name
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)} m
      JOIN ${quoteIdent(schema)}.offerings o ON o.id = m.offering_id
      WHERE m.tier = 1
        AND m.outcome = 'new_offering_inserted'
        AND m.offering_id IS NOT NULL
        AND o.deleted_at IS NULL
    )
    SELECT *
    FROM inserted
    WHERE simple_name = ANY($1::text[])
    ORDER BY simple_name, offering_id
  `, [genericSimpleNames]);
  return result.rows;
}

async function loadBorderlineKept() {
  const result = await client.query(`
    WITH inserted AS (
      SELECT
        m.raw_name,
        count(*)::integer AS rows,
        count(*) FILTER (WHERE m.price_amount IS NOT NULL)::integer AS priced_rows,
        count(*) FILTER (WHERE o.treatment_id IS NOT NULL)::integer AS treatment_rows,
        min(m.location_id)::integer AS sample_location_id
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)} m
      JOIN ${quoteIdent(schema)}.offerings o ON o.id = m.offering_id
      WHERE m.tier = 1
        AND m.outcome = 'new_offering_inserted'
        AND m.offering_id IS NOT NULL
        AND o.deleted_at IS NULL
        AND m.price_amount IS NULL
        AND o.treatment_id IS NULL
        AND m.raw_name = upper(m.raw_name)
        AND array_length(regexp_split_to_array(regexp_replace(lower(m.raw_name), '[^a-z0-9]+', ' ', 'g'), '\\s+'), 1) <= 3
        AND regexp_replace(lower(regexp_replace(trim(m.raw_name), '\\s+', ' ', 'g')), '[^a-z0-9]+', ' ', 'g') <> ALL($1::text[])
      GROUP BY m.raw_name
    )
    SELECT *
    FROM inserted
    ORDER BY rows DESC, raw_name
    LIMIT 120
  `, [genericSimpleNames]);
  return result.rows;
}

async function loadReviewRows(outcome) {
  const result = await client.query(`
    SELECT
      m.location_id,
      l.name AS location_name,
      m.raw_name,
      m.price_amount,
      m.price_currency,
      m.price_context,
      m.reason,
      m.existing_price_amount,
      m.existing_price_currency,
      m.matched_offering_id,
      m.source_page_url
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)} m
    LEFT JOIN ${quoteIdent(schema)}.locations l ON l.id = m.location_id
    WHERE m.tier = 1 AND m.outcome = $1
    ORDER BY m.location_id, m.raw_name
  `, [outcome]);
  return result.rows;
}

async function backupAndDelete(offeringIds) {
  await client.query("BEGIN");
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(backupTable)} AS
      SELECT
        now()::timestamptz AS backed_up_at,
        'tier1_generic_nav_label'::text AS deletion_reason,
        m.id AS menu_log_id,
        m.site_origin,
        m.source_page_url,
        o.*
      FROM ${quoteIdent(schema)}.offerings o
      JOIN ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)} m ON m.offering_id = o.id
      WHERE false
    `);
    if (offeringIds.length) {
      await client.query(`
        INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(backupTable)}
        SELECT
          now()::timestamptz AS backed_up_at,
          'tier1_generic_nav_label'::text AS deletion_reason,
          m.id AS menu_log_id,
          m.site_origin,
          m.source_page_url,
          o.*
        FROM ${quoteIdent(schema)}.offerings o
        JOIN ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)} m ON m.offering_id = o.id
        WHERE o.id = ANY($1::integer[])
          AND NOT EXISTS (
            SELECT 1
            FROM ${quoteIdent(rawSchema)}.${quoteIdent(backupTable)} b
            WHERE b.id = o.id
          )
      `, [offeringIds]);
      await client.query(`DELETE FROM ${quoteIdent(schema)}.offerings WHERE id = ANY($1::integer[])`, [offeringIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

function writeMarkdown(filePath, report) {
  const lines = [];
  lines.push("# Menu Cleanup Tiers 2/3 Report");
  lines.push("");
  lines.push(`- Phase date: ${report.phaseDate}`);
  lines.push(`- Dry run: ${report.dryRun}`);
  lines.push(`- Backup table: ${report.backupTable}`);
  lines.push(`- Tier 1 inserted offerings before: ${report.before.active_tier1_inserted}`);
  lines.push(`- Tier 1 generic/nav rows deleted: ${report.deletedRows}`);
  lines.push(`- Tier 1 inserted offerings after: ${report.after.active_tier1_inserted}`);
  lines.push(`- Distinct deleted raw names: ${report.deletedDistinctRawNameCount}`);
  lines.push("");
  lines.push("## Deleted Raw Names");
  lines.push("");
  for (const name of report.deletedDistinctRawNames) {
    lines.push(`- ${name}`);
  }
  lines.push("");
  lines.push("## Borderline Kept");
  lines.push("");
  lines.push("These matched the ALL-CAPS/no-price/no-treatment heuristic, but were not deleted because they are not exact generic nav labels.");
  lines.push("");
  lines.push("| raw_name | rows | sample_location_id |");
  lines.push("| --- | ---: | ---: |");
  for (const row of report.borderlineKept) {
    lines.push(`| ${escapePipe(row.raw_name)} | ${row.rows} | ${row.sample_location_id ?? ""} |`);
  }
  lines.push("");
  lines.push("## Price Conflicts");
  lines.push("");
  lines.push("| location_id | location | raw_name | extracted_price | existing_price |");
  lines.push("| ---: | --- | --- | ---: | ---: |");
  for (const row of report.priceConflicts) {
    lines.push(`| ${row.location_id} | ${escapePipe(row.location_name || "")} | ${escapePipe(row.raw_name || "")} | ${formatMoney(row.price_amount, row.price_currency)} | ${formatMoney(row.existing_price_amount, row.existing_price_currency)} |`);
  }
  lines.push("");
  lines.push("## Sanity Flags");
  lines.push("");
  lines.push("| location_id | location | raw_name | extracted_price | reason |");
  lines.push("| ---: | --- | --- | ---: | --- |");
  for (const row of report.sanityFlags) {
    lines.push(`| ${row.location_id} | ${escapePipe(row.location_name || "")} | ${escapePipe(row.raw_name || "")} | ${formatMoney(row.price_amount, row.price_currency)} | ${escapePipe(row.reason || "")} |`);
  }
  lines.push("");
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined) {
    return "";
  }
  return `${currency || ""} ${Number(amount)}`.trim();
}

function escapePipe(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizePostgresConnectionString(value) {
  const url = new URL(value);
  if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode"))) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--phase-date") parsed.phaseDate = args[++index];
    else if (arg === "--schema") parsed.schema = args[++index];
    else if (arg === "--raw-schema") parsed.rawSchema = args[++index];
    else if (arg === "--database-url") parsed.databaseUrl = args[++index];
    else if (arg === "--backup-table") parsed.backupTable = args[++index];
    else if (arg === "--report") parsed.report = args[++index];
    else if (arg === "--json") parsed.json = args[++index];
    else if (arg === "--dry-run") parsed.dryRun = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return parsed;
}
