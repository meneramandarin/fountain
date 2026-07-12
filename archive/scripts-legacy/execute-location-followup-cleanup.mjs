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
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `location-followup-cleanup-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/location-followup-cleanup-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);

const koreanClinicIds = [2222, 2223, 2224, 2231, 2235, 2237, 2241, 2422, 2442, 2443];
const virtualProviderIds = [1386, 1392, 2457, 2495, 2506, 2509, 2522, 2544];
const emptyShellIds = [2451, 2454, 2563, 9411, 9417, 9421, 9422];
const targetIds = [...koreanClinicIds, ...virtualProviderIds, ...emptyShellIds];

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
  const before = await loadTargets(client);
  const report = await execute(client, before);
  writeReports(report);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function execute(pgClient, before) {
  await pgClient.query("BEGIN");
  try {
    await ensureVirtualColumn(pgClient);
    await ensureTables(pgClient, before.rows);
    const audit = buildAudit(before.rows);
    await insertAudit(pgClient, audit);
    await insertDeletionReview(pgClient, before.rows.filter((row) => emptyShellIds.includes(row.id)));
    await backupReviewRows(pgClient);
    await withGenericAuditTriggerDisabled(pgClient, async () => {
      await applyKoreanClinicUpdates(pgClient);
      await applyVirtualUpdates(pgClient);
      await applyEmptyShellUpdates(pgClient);
    });
    await clearFollowupReviewRows(pgClient);
    const after = await loadTargets(pgClient);
    const acceptance = await loadAcceptance(pgClient);
    if (dryRun) {
      await pgClient.query("ROLLBACK");
    } else {
      await pgClient.query("COMMIT");
    }
    return buildReport(before, after, audit, acceptance);
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

async function ensureVirtualColumn(pgClient) {
  await pgClient.query(`
    ALTER TABLE ${quoteIdent(schema)}.locations
    ADD COLUMN IF NOT EXISTS is_virtual boolean NOT NULL DEFAULT false
  `);
}

async function loadTargets(pgClient) {
  const hasVirtual = Boolean(
    (await pgClient.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = 'locations'
        AND column_name = 'is_virtual'
      `,
      [schema],
    )).rowCount,
  );
  const rows = await pgClient.query(
    `
    SELECT id, name, slug, status, address, locality, region, postal_code, country_code, country_name,
      latitude, longitude, website${hasVirtual ? ", is_virtual" : ", false AS is_virtual"}
    FROM ${quoteIdent(schema)}.locations
    WHERE id = ANY($1::int[])
    ORDER BY id
    `,
    [targetIds],
  );
  return { rows: rows.rows };
}

async function loadAcceptance(pgClient) {
  const counts = await pgClient.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE id = ANY($1::int[]) AND country_code = 'KR' AND country_name = 'South Korea' AND locality = 'Seoul')::int AS korean_context_rows,
      COUNT(*) FILTER (WHERE id = ANY($2::int[]) AND is_virtual = true AND locality IS NULL AND region IS NULL)::int AS virtual_rows,
      COUNT(*) FILTER (WHERE id = ANY($3::int[]) AND status = 'hidden')::int AS hidden_empty_shell_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_deletion_review_${phaseDate}`)}) AS deletion_review_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_audit_${phaseDate}`)}) AS audit_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_review_cleared_${phaseDate}`)}) AS review_rows_cleared
    FROM ${quoteIdent(schema)}.locations
    WHERE id = ANY($4::int[])
    `,
    [koreanClinicIds, virtualProviderIds, emptyShellIds, targetIds],
  );
  return counts.rows[0];
}

async function ensureTables(pgClient, beforeRows) {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_backup_${phaseDate}`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.locations
    WHERE false
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_audit_${phaseDate}`)} (
      location_id integer NOT NULL,
      field text NOT NULL,
      old_value text,
      new_value text,
      rule text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_deletion_review_${phaseDate}`)} (
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
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_review_cleared_${phaseDate}`)} (
      location_id integer NOT NULL,
      location_name text,
      reason text NOT NULL,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_backup_${phaseDate}`)}
    SELECT l.*
    FROM ${quoteIdent(schema)}.locations l
    WHERE l.id = ANY($1::int[])
      AND NOT EXISTS (
        SELECT 1
        FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_backup_${phaseDate}`)} b
        WHERE b.id = l.id
      )
    `,
    [beforeRows.map((row) => row.id)],
  );
}

function buildAudit(rows) {
  const audit = [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of koreanClinicIds) {
    const row = byId.get(id);
    addAudit(audit, row, "country_code", "KR", "korean_context_gangnam_medical_tourism");
    addAudit(audit, row, "country_name", "South Korea", "korean_context_gangnam_medical_tourism");
    addAudit(audit, row, "locality", "Seoul", "korean_context_gangnam_medical_tourism");
  }
  for (const id of virtualProviderIds) {
    const row = byId.get(id);
    addAudit(audit, row, "is_virtual", "true", id === 1392 ? "virtual_provider_cenegenics_global_telehealth" : "virtual_provider_flag");
    addAudit(audit, row, "locality", null, "virtual_provider_clear_geo_junk");
    addAudit(audit, row, "region", null, "virtual_provider_clear_geo_junk");
  }
  for (const id of emptyShellIds) {
    const row = byId.get(id);
    addAudit(audit, row, "status", "hidden", "empty_shell_hidden_deletion_review");
  }
  return audit;
}

function addAudit(audit, row, field, newValue, rule) {
  if (!row) {
    throw new Error(`Missing target location for audit field ${field}`);
  }
  const oldValue = row[field] == null ? null : String(row[field]);
  const normalizedNew = newValue == null ? null : String(newValue);
  if (oldValue === normalizedNew) {
    return;
  }
  audit.push({
    location_id: row.id,
    field,
    old_value: oldValue,
    new_value: normalizedNew,
    rule,
  });
}

async function insertAudit(pgClient, audit) {
  if (!audit.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_audit_${phaseDate}`)}
      (location_id, field, old_value, new_value, rule)
    SELECT location_id, field, old_value, new_value, rule
    FROM jsonb_to_recordset($1::jsonb) AS x(location_id integer, field text, old_value text, new_value text, rule text)
    `,
    [JSON.stringify(audit)],
  );
}

async function insertDeletionReview(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_deletion_review_${phaseDate}`)}
      (location_id, location_name, slug, old_status, new_status, reason, detail)
    SELECT location_id, location_name, slug, old_status, 'hidden', reason, detail
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      slug text,
      old_status text,
      reason text,
      detail jsonb
    )
    ON CONFLICT (location_id) DO UPDATE
      SET location_name = EXCLUDED.location_name,
          slug = EXCLUDED.slug,
          old_status = EXCLUDED.old_status,
          new_status = EXCLUDED.new_status,
          reason = EXCLUDED.reason,
          detail = EXCLUDED.detail
    `,
    [JSON.stringify(rows.map((row) => ({
      location_id: row.id,
      location_name: row.name,
      slug: row.slug,
      old_status: row.status,
      reason: "empty_shell_no_address_no_geo_no_website",
      detail: {
        address: row.address,
        locality: row.locality,
        region: row.region,
        country_code: row.country_code,
        website: row.website,
      },
    })))],
  );
}

async function backupReviewRows(pgClient) {
  const exists = await reviewTableExists(pgClient);
  if (!exists) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_followup_review_cleared_${phaseDate}`)}
      (location_id, location_name, reason, detail)
    SELECT rv.location_id, l.name, rv.reason, rv.detail
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_normalization_review_${phaseDate}`)} rv
    LEFT JOIN ${quoteIdent(schema)}.locations l ON l.id = rv.location_id
    WHERE rv.location_id = ANY($1::int[])
    `,
    [targetIds],
  );
}

async function applyKoreanClinicUpdates(pgClient) {
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations
    SET country_code = 'KR',
        country_name = 'South Korea',
        locality = 'Seoul'
    WHERE id = ANY($1::int[])
    `,
    [koreanClinicIds],
  );
}

async function applyVirtualUpdates(pgClient) {
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations
    SET is_virtual = true,
        locality = NULL,
        region = NULL
    WHERE id = ANY($1::int[])
    `,
    [virtualProviderIds],
  );
}

async function applyEmptyShellUpdates(pgClient) {
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations
    SET status = 'hidden'
    WHERE id = ANY($1::int[])
    `,
    [emptyShellIds],
  );
}

async function clearFollowupReviewRows(pgClient) {
  const exists = await reviewTableExists(pgClient);
  if (!exists) {
    return;
  }
  await pgClient.query(
    `
    DELETE FROM ${quoteIdent(rawSchema)}.${quoteIdent(`location_normalization_review_${phaseDate}`)}
    WHERE location_id = ANY($1::int[])
    `,
    [targetIds],
  );
}

async function reviewTableExists(pgClient) {
  return Boolean((await pgClient.query("SELECT to_regclass($1) AS table_name", [`${rawSchema}.location_normalization_review_${phaseDate}`])).rows[0].table_name);
}

async function withGenericAuditTriggerDisabled(pgClient, callback) {
  await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations DISABLE TRIGGER trg_audit_entity_change`);
  try {
    return await callback();
  } finally {
    await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations ENABLE TRIGGER trg_audit_entity_change`);
  }
}

function buildReport(before, after, audit, acceptance) {
  return {
    generated_at: new Date().toISOString(),
    mode: dryRun ? "dry_run" : "live_write",
    schema,
    raw_schema: rawSchema,
    backup_table: `${rawSchema}.location_followup_backup_${phaseDate}`,
    audit_table: `${rawSchema}.location_followup_audit_${phaseDate}`,
    deletion_review_table: `${rawSchema}.location_followup_deletion_review_${phaseDate}`,
    review_cleared_table: `${rawSchema}.location_followup_review_cleared_${phaseDate}`,
    summary: {
      korean_clinics: koreanClinicIds.length,
      virtual_providers: virtualProviderIds.length,
      empty_shells_hidden: emptyShellIds.length,
      audit_rows_planned: audit.length,
      ...acceptance,
    },
    before: before.rows,
    after: after.rows,
    audit_by_rule: countBy(audit, "rule"),
  };
}

function writeReports(report) {
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
}

function renderMarkdown(report) {
  return [
    `# Location Follow-Up Cleanup Report (${phaseDate})`,
    "",
    `Mode: ${report.mode}`,
    "",
    "## Summary",
    "",
    `- Korean scrape-context rows set to Seoul, South Korea: ${report.summary.korean_context_rows}`,
    `- Virtual providers flagged and cleared of locality/region: ${report.summary.virtual_rows}`,
    `- Empty-shell rows hidden: ${report.summary.hidden_empty_shell_rows}`,
    `- Deletion review rows: ${report.summary.deletion_review_rows}`,
    `- Field audit rows: ${report.summary.audit_rows}`,
    `- Normalization review rows cleared: ${report.summary.review_rows_cleared}`,
    "",
    "## Audit By Rule",
    "",
    renderCountTable(report.audit_by_rule),
    "",
    "## Tables",
    "",
    `- Backup: \`${report.backup_table}\``,
    `- Field audit: \`${report.audit_table}\``,
    `- Deletion review: \`${report.deletion_review_table}\``,
    `- Cleared normalization review rows: \`${report.review_cleared_table}\``,
    "",
  ].join("\n");
}

function renderCountTable(counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    return "_None._";
  }
  return ["| Rule | Count |", "| --- | ---: |", ...entries.map(([key, value]) => `| ${key} | ${value} |`)].join("\n");
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    counts[row[key]] = (counts[row[key]] || 0) + 1;
  }
  return counts;
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
