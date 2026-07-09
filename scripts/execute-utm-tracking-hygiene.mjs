#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { containsTrackingParams, sanitizeUrl } from "../src/lib/url-sanitize.mjs";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const dryRun = Boolean(options.dryRun);
const phaseDate = options.phaseDate || "20260708";
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `utm-tracking-hygiene-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/utm-tracking-hygiene-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
for (const envFile of options.envFile || []) {
  loadEnvFile(path.resolve(ROOT, envFile));
}

const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const connectionString =
  options.databaseUrl ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

const db = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await db.connect();
  await db.query("BEGIN");
  const before = await auditUrlColumns(db);
  const updates = await planLocationWebsiteUpdates(db);
  const report = {
    phase_date: phaseDate,
    dry_run: dryRun,
    prompt: "docs/utm-tracking-hygiene-prompt.md",
    backup_tables: dryRun
      ? []
      : [
          `${rawSchema}.locations_backup_${phaseDate}_utm_tracking_hygiene`,
          `${rawSchema}.url_tracking_hygiene_audit_${phaseDate}`,
        ],
    column_audit_before: before,
    decisions: before.map((column) => decisionForColumn(column)),
    planned_location_website_updates: updates.length,
    changed_locations: updates.slice(0, 200).map((update) => ({
      id: update.id,
      slug: update.slug,
      old_value: update.old_value,
      new_value: update.new_value,
    })),
  };

  if (!dryRun && updates.length) {
    await createBackupAndAuditTables(db);
    await applyLocationWebsiteUpdates(db, updates);
  }

  const after = await auditUrlColumns(db);
  report.column_audit_after = after;
  report.summary = {
    dirty_rendered_url_columns_after: after
      .filter((column) => isRenderedUrlColumn(column.table_name, column.column_name))
      .reduce((sum, column) => sum + column.dirty_count, 0),
    location_websites_dirty_before: findColumn(before, "locations", "website")?.dirty_count || 0,
    location_websites_dirty_after: findColumn(after, "locations", "website")?.dirty_count || 0,
    location_websites_cleaned: dryRun ? 0 : updates.length,
  };

  if (dryRun) {
    await db.query("ROLLBACK");
  } else {
    await db.query("COMMIT");
  }

  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Wrote ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, reportMdPath)}`);
} catch (error) {
  try {
    await db.query("ROLLBACK");
  } catch {
    // Ignore rollback failures; the original error is more useful.
  }
  throw error;
} finally {
  await db.end();
}

async function auditUrlColumns(pgClient) {
  const columns = await pgClient.query(
    `
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
     AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = $1
      AND c.data_type IN ('text', 'character varying')
      AND (
        c.column_name ILIKE '%website%'
        OR c.column_name ILIKE '%url%'
        OR c.column_name ILIKE '%link%'
      )
    ORDER BY c.table_name, c.column_name
    `,
    [schema],
  );

  const results = [];
  for (const column of columns.rows) {
    const idExpression = await idExpressionForColumn(pgClient, column.table_name);
    const values = await pgClient.query(
      `
      SELECT ${idExpression} AS entity_id, ${quoteIdent(column.column_name)} AS value
      FROM ${quoteIdent(schema)}.${quoteIdent(column.table_name)}
      WHERE ${quoteIdent(column.column_name)} IS NOT NULL
        AND btrim(${quoteIdent(column.column_name)}::text) <> ''
      `,
    );
    const total = await pgClient.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(schema)}.${quoteIdent(column.table_name)}`);
    const dirtyRows = values.rows.filter((row) => containsTrackingParams(row.value));
    results.push({
      table_name: column.table_name,
      column_name: column.column_name,
      total_rows: Number(total.rows[0].count),
      populated_rows: values.rowCount,
      dirty_count: dirtyRows.length,
      dirty_samples: dirtyRows.slice(0, 10).map((row) => ({ entity_id: row.entity_id, value: row.value })),
    });
  }
  return results;
}

async function idExpressionForColumn(pgClient, tableName) {
  const idColumn = await pgClient.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
      AND column_name = 'id'
    `,
    [schema, tableName],
  );
  return idColumn.rowCount ? "id::text" : "ctid::text";
}

async function planLocationWebsiteUpdates(pgClient) {
  const result = await pgClient.query(
    `
    SELECT id, slug, website
    FROM ${quoteIdent(schema)}.locations
    WHERE website IS NOT NULL
      AND btrim(website) <> ''
    ORDER BY id
    `,
  );
  return result.rows
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      old_value: row.website,
      new_value: sanitizeUrl(row.website),
    }))
    .filter((row) => row.new_value !== row.old_value);
}

async function createBackupAndAuditTables(pgClient) {
  await pgClient.query(
    `
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`locations_backup_${phaseDate}_utm_tracking_hygiene`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.locations;

    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`url_tracking_hygiene_audit_${phaseDate}`)} (
      entity_type text NOT NULL,
      entity_id integer NOT NULL,
      field text NOT NULL,
      old_value text,
      new_value text,
      rule text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    `,
  );
}

async function applyLocationWebsiteUpdates(pgClient, updates) {
  if (!updates.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`url_tracking_hygiene_audit_${phaseDate}`)}
      (entity_type, entity_id, field, old_value, new_value, rule)
    SELECT 'location', id, 'website', old_value, new_value, 'tracking_params_removed'
    FROM jsonb_to_recordset($1::jsonb) AS x(id integer, old_value text, new_value text)
    `,
    [JSON.stringify(updates)],
  );
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations l
    SET website = x.new_value,
        updated_at = now()
    FROM jsonb_to_recordset($1::jsonb) AS x(id integer, new_value text)
    WHERE l.id = x.id
    `,
    [JSON.stringify(updates)],
  );
}

function decisionForColumn(column) {
  if (column.table_name === "locations" && column.column_name === "website") {
    return { ...columnKey(column), action: "cleaned", reason: "Rendered clinic website and matching input." };
  }
  if (isRenderedUrlColumn(column.table_name, column.column_name)) {
    return { ...columnKey(column), action: "audited_no_write", reason: "Rendered URL column; dirty count was expected to be zero and no rows needed changes." };
  }
  if (column.table_name === "external_place_matches" && column.column_name === "provider_url") {
    return { ...columnKey(column), action: "left_as_provenance", reason: "Provider URL is external match provenance, not a user-facing clinic destination." };
  }
  if (column.table_name === "offerings" && column.column_name === "source_offer_url") {
    return { ...columnKey(column), action: "left_as_provenance", reason: "Offerings were explicitly out of scope for this run." };
  }
  if (column.table_name === "source_records" && column.column_name === "source_url") {
    return { ...columnKey(column), action: "left_as_provenance", reason: "Source URL records origin provenance." };
  }
  return { ...columnKey(column), action: "audited_no_write", reason: "Not a rendered clinic website write path." };
}

function columnKey(column) {
  return { table_name: column.table_name, column_name: column.column_name, dirty_count: column.dirty_count };
}

function isRenderedUrlColumn(tableName, columnName) {
  return tableName === "locations" && columnName === "website";
}

function findColumn(columns, tableName, columnName) {
  return columns.find((column) => column.table_name === tableName && column.column_name === columnName);
}

function renderMarkdown(report) {
  const lines = [
    "# UTM Tracking Hygiene Report",
    "",
    `- Date: ${report.phase_date}`,
    `- Mode: ${report.dry_run ? "dry-run" : "live"}`,
    `- Location websites planned for cleaning: ${report.planned_location_website_updates}`,
    `- Rendered URL dirty count after: ${report.summary.dirty_rendered_url_columns_after}`,
    "",
    "## Column Audit",
    "",
    markdownTable(
      ["column", "populated", "dirty before", "dirty after", "decision"],
      report.column_audit_before.map((before) => {
        const after = findColumn(report.column_audit_after, before.table_name, before.column_name);
        const decision = report.decisions.find((item) => item.table_name === before.table_name && item.column_name === before.column_name);
        return [
          `${before.table_name}.${before.column_name}`,
          before.populated_rows,
          before.dirty_count,
          after?.dirty_count ?? "",
          decision?.action || "",
        ];
      }),
    ),
    "",
    "## Write Scope",
    "",
    "- Cleaned only `fountain.locations.website` because it is rendered to users and used for matching.",
    "- Left provenance-only URL columns untouched and reported their dirty counts.",
    "- Did not touch offerings, reviews, tags, organizations, or practitioners.",
  ];

  if (report.changed_locations.length) {
    lines.push("", "## Changed Location Samples", "");
    lines.push(
      markdownTable(
        ["id", "slug", "old", "new"],
        report.changed_locations.slice(0, 50).map((row) => [row.id, row.slug || "", row.old_value, row.new_value]),
      ),
    );
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [`| ${headers.map(escape).join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`)].join("\n");
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function normalizeIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe Postgres identifier: ${identifier}`);
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

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = unquoteEnvValue(match[2].trim());
  }
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseArgs(args) {
  const parsed = { dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg.startsWith("--") && next) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key === "envFile") {
        parsed.envFile = [...(parsed.envFile || []), next];
      } else {
        parsed[key] = next;
      }
      index += 1;
    }
  }
  return parsed;
}
