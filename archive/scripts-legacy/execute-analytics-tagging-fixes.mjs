#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { extractGoogleSerpRedirectTarget, isGoogleSerpRedirectWrapper } from "../src/lib/url-sanitize.mjs";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const dryRun = Boolean(options.dryRun);
const phaseDate = options.phaseDate || "20260709";
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `analytics-tagging-fixes-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/analytics-tagging-fixes-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);

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

  const beforeRows = await fetchLocationWebsiteRows(db);
  const beforeWrappers = beforeRows.filter((location) => isGoogleSerpRedirectWrapper(location.website));
  const updates = beforeWrappers
    .map((location) => ({
      id: location.id,
      slug: location.slug,
      old_value: location.website,
      new_value: extractGoogleSerpRedirectTarget(location.website),
    }))
    .filter((location) => location.new_value && location.new_value !== location.old_value);

  if (!dryRun) {
    await createBackupAndAuditTables(db);
    if (updates.length) {
      await applyLocationWebsiteUpdates(db, updates);
    }
  }

  const afterRows = await fetchLocationWebsiteRows(db);
  const afterWrappers = afterRows.filter((location) => isGoogleSerpRedirectWrapper(location.website));
  const report = {
    phase_date: phaseDate,
    dry_run: dryRun,
    prompt: "docs/analytics-tagging-fixes-prompt.md",
    backup_tables: dryRun
      ? []
      : [
          `${rawSchema}.locations_backup_${phaseDate}_google_serp_wrapper_hygiene`,
          `${rawSchema}.location_website_serp_wrapper_audit_${phaseDate}`,
        ],
    summary: {
      location_websites_scanned: beforeRows.length,
      google_serp_wrappers_before: beforeWrappers.length,
      google_serp_wrappers_updated: dryRun ? 0 : updates.length,
      google_serp_wrappers_after: afterWrappers.length,
    },
    changed_locations: updates.slice(0, 500),
    unresolved_wrappers_after: afterWrappers.slice(0, 50).map((location) => ({
      id: location.id,
      slug: location.slug,
      website: location.website,
    })),
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

async function fetchLocationWebsiteRows(pgClient) {
  const result = await pgClient.query(
    `
    SELECT id, slug, website
    FROM ${quoteIdent(schema)}.locations
    WHERE website IS NOT NULL
      AND btrim(website) <> ''
    ORDER BY id
    `,
  );
  return result.rows;
}

async function createBackupAndAuditTables(pgClient) {
  await pgClient.query(
    `
    CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)};

    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`locations_backup_${phaseDate}_google_serp_wrapper_hygiene`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.locations;

    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_website_serp_wrapper_audit_${phaseDate}`)} (
      location_id integer NOT NULL,
      slug text,
      old_value text,
      new_value text,
      rule text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    `,
  );
}

async function applyLocationWebsiteUpdates(pgClient, updates) {
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_website_serp_wrapper_audit_${phaseDate}`)}
      (location_id, slug, old_value, new_value, rule)
    SELECT id, slug, old_value, new_value, 'google_serp_wrapper_q_extracted'
    FROM jsonb_to_recordset($1::jsonb) AS x(id integer, slug text, old_value text, new_value text)
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

function renderMarkdown(report) {
  const lines = [
    "# Analytics Tagging Fixes Report",
    "",
    `- Date: ${report.phase_date}`,
    `- Mode: ${report.dry_run ? "dry-run" : "live"}`,
    `- Location websites scanned: ${report.summary.location_websites_scanned}`,
    `- Google SERP wrappers before: ${report.summary.google_serp_wrappers_before}`,
    `- Google SERP wrappers updated: ${report.summary.google_serp_wrappers_updated}`,
    `- Google SERP wrappers after: ${report.summary.google_serp_wrappers_after}`,
    "",
    "## Backup Tables",
    "",
    report.backup_tables.length ? report.backup_tables.map((table) => `- \`${table}\``).join("\n") : "- None; dry run.",
    "",
    "## Write Scope",
    "",
    "- Updated only `fountain.locations.website` rows that matched Google SERP redirect wrappers.",
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

  if (report.unresolved_wrappers_after.length) {
    lines.push("", "## Unresolved Wrapper Samples", "");
    lines.push(
      markdownTable(
        ["id", "slug", "website"],
        report.unresolved_wrappers_after.map((row) => [row.id, row.slug || "", row.website]),
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
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg.startsWith("--") && args[index + 1]) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key === "envFile") {
        parsed.envFile = [...(parsed.envFile || []), args[index + 1]];
      } else {
        parsed[key] = args[index + 1];
      }
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return parsed;
}
