#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { sanitizeUrl } from "../src/lib/url-sanitize.mjs";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.date || new Date().toISOString().slice(0, 10).replaceAll("-", "");
const dryRun = Boolean(options.dryRun);
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `bookimed-cleanup-addendum-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/bookimed-cleanup-addendum-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);
const manualGroups = [
  {
    domain: "medipol.com.tr",
    canonical_name: "Medipol",
    location_ids: [1739, 1769, 1777, 1878],
    reason: "Manual approval of Bookimed org guardrail: four Medipol hospital locations share medipol.com.tr.",
  },
  {
    domain: "bcaremedicalcenter.com",
    canonical_name: "B.Care Medical Center",
    location_ids: [1836, 1989],
    reason: "Manual approval of Bookimed org guardrail: B.Care Spa and B.Care Medical Center share bcaremedicalcenter.com.",
  },
  {
    domain: "medicover.pl",
    canonical_name: "Medicover",
    location_ids: [1949, 1955],
    reason: "Manual approval of Bookimed org guardrail: DentaCare Garbary and Medicover Gdansk share medicover.pl.",
  },
  {
    domain: "europeanvalley.org",
    canonical_name: "European Valley Health",
    location_ids: [1783],
    reason: "Corrected wrong Largo Bittencourt place match; direct clinic website found at europeanvalley.org.",
  },
];
const europeanValleyFix = {
  location_id: 1783,
  old_wrong_place_id: "ChIJ_cahbRXk3JQRwyA11X12Nas",
  new_website: sanitizeUrl("https://europeanvalley.org/"),
  reason: "Bookimed no_website row was caused by a wrong place_id for Largo Bittencourt, not a site-less clinic.",
};

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
  const preflight = await loadPreflight(client);
  const plan = buildPlan(preflight);
  const report = await executePlan(client, plan);
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadPreflight(pgClient) {
  const sentinelRows = await pgClient.query(`
    SELECT *
    FROM ${quoteIdent(schema)}.external_place_matches
    WHERE provider_place_id LIKE 'unmatched-%'
    ORDER BY location_id, provider
  `);
  const locationIds = unique([...manualGroups.flatMap((group) => group.location_ids), europeanValleyFix.location_id]);
  const locations = await pgClient.query(
    `
    SELECT id, name, slug, org_id, website, phone
    FROM ${quoteIdent(schema)}.locations
    WHERE id = ANY($1::int[])
    ORDER BY id
    `,
    [locationIds],
  );
  const existingOrgs = await pgClient.query(
    `
    SELECT id, canonical_name, website_domain, dedup_key, deleted_at
    FROM ${quoteIdent(schema)}.organizations
    WHERE website_domain = ANY($1::text[])
       OR dedup_key = ANY($1::text[])
    ORDER BY website_domain, id
    `,
    [manualGroups.map((group) => group.domain)],
  );
  const wrongPlaceRows = await pgClient.query(
    `
    SELECT *
    FROM ${quoteIdent(schema)}.external_place_matches
    WHERE location_id = $1
      AND provider_place_id = $2
    ORDER BY provider
    `,
    [europeanValleyFix.location_id, europeanValleyFix.old_wrong_place_id],
  );
  return {
    sentinelRows: sentinelRows.rows,
    locations: locations.rows,
    existingOrgs: existingOrgs.rows,
    wrongPlaceRows: wrongPlaceRows.rows,
  };
}

function buildPlan(preflight) {
  const locationsById = new Map(preflight.locations.map((row) => [row.id, row]));
  const existingActiveByDomain = new Map(
    preflight.existingOrgs
      .filter((row) => !row.deleted_at)
      .map((row) => [row.website_domain || row.dedup_key, row]),
  );
  const groups = manualGroups.map((group) => {
    for (const locationId of group.location_ids) {
      if (!locationsById.has(locationId)) {
        throw new Error(`Missing expected location ${locationId} for ${group.domain}`);
      }
    }
    const existingOrg = existingActiveByDomain.get(group.domain) || null;
    return {
      ...group,
      existing_org_id: existingOrg?.id || null,
      rows: group.location_ids.map((locationId) => {
        const location = locationsById.get(locationId);
        return {
          location_id: location.id,
          location_name: location.name,
          old_org_id: location.org_id,
          old_website: location.website,
          old_phone: location.phone,
        };
      }),
    };
  });
  const europeanValley = locationsById.get(europeanValleyFix.location_id);
  return {
    sentinelRows: preflight.sentinelRows,
    groups,
    wrongPlaceRows: preflight.wrongPlaceRows,
    europeanValley: {
      ...europeanValleyFix,
      old_website: europeanValley.website,
      old_org_id: europeanValley.org_id,
      location_name: europeanValley.name,
    },
  };
}

async function executePlan(pgClient, plan) {
  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`SET LOCAL search_path TO ${quoteIdent(schema)}, public`);
    await ensureAuditTables(pgClient);
    await purgeSentinelPlaceMatches(pgClient);
    await applyEuropeanValleyFix(pgClient, plan);
    const orgResults = await applyManualOrgRelinks(pgClient, plan);

    const affectedLocationIds = unique([
      europeanValleyFix.location_id,
      ...manualGroups.flatMap((group) => group.location_ids),
      ...plan.sentinelRows.map((row) => row.location_id),
    ]);
    await pgClient.query(
      `SELECT ${quoteIdent(schema)}.refresh_search_index_for_location(location_id) FROM unnest($1::int[]) AS location_id`,
      [affectedLocationIds],
    );

    const acceptance = await acceptanceChecks(pgClient);
    if (dryRun) {
      await pgClient.query("ROLLBACK");
    } else {
      await pgClient.query("COMMIT");
    }

    return {
      generated_at: new Date().toISOString(),
      mode: dryRun ? "DRY_RUN_ROLLED_BACK" : "EXECUTED",
      summary: {
        sentinel_place_matches_purged: plan.sentinelRows.length,
        wrong_1783_place_matches_purged: plan.wrongPlaceRows.length,
        european_valley_website_written: 1,
        manual_org_groups: plan.groups.length,
        manual_org_locations_relinked: manualGroups.reduce((sum, group) => sum + group.location_ids.length, 0),
        orgs_created: orgResults.new_orgs_created.length,
        orgs_reused: orgResults.orgs_reused.length,
        refreshed_locations: affectedLocationIds.length,
        active_bookimed_remaining_count: acceptance.active_bookimed_remaining_count,
      },
      backup_tables: dryRun
        ? []
        : [
            `${rawSchema}.external_place_matches_backup_${phaseDate}_bookimed_cleanup_addendum`,
            `${rawSchema}.locations_backup_${phaseDate}_bookimed_cleanup_addendum`,
            `${rawSchema}.organizations_backup_${phaseDate}_bookimed_cleanup_addendum`,
            `${rawSchema}.bookimed_cleanup_addendum_org_map_${phaseDate}`,
            `${rawSchema}.bookimed_cleanup_addendum_new_orgs_${phaseDate}`,
            `${rawSchema}.bookimed_cleanup_addendum_location_actions_${phaseDate}`,
          ],
      sentinel_rows: plan.sentinelRows.map((row) => ({
        location_id: row.location_id,
        provider: row.provider,
        provider_place_id: row.provider_place_id,
        match_status: row.match_status,
      })),
      manual_groups: plan.groups,
      new_orgs_created: orgResults.new_orgs_created,
      orgs_reused: orgResults.orgs_reused,
      european_valley_fix: plan.europeanValley,
      acceptance,
    };
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

async function ensureAuditTables(pgClient) {
  if (!dryRun) {
    const existing = await pgClient.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
      `,
      [
        rawSchema,
        [
          `external_place_matches_backup_${phaseDate}_bookimed_cleanup_addendum`,
          `locations_backup_${phaseDate}_bookimed_cleanup_addendum`,
          `organizations_backup_${phaseDate}_bookimed_cleanup_addendum`,
          `bookimed_cleanup_addendum_org_map_${phaseDate}`,
          `bookimed_cleanup_addendum_new_orgs_${phaseDate}`,
          `bookimed_cleanup_addendum_location_actions_${phaseDate}`,
        ],
      ],
    );
    if (existing.rowCount) {
      throw new Error(`Refusing to run because cleanup addendum tables already exist: ${existing.rows.map((row) => row.table_name).join(", ")}`);
    }
  }
  const affectedLocationIds = unique([...manualGroups.flatMap((group) => group.location_ids), europeanValleyFix.location_id]);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`external_place_matches_backup_${phaseDate}_bookimed_cleanup_addendum`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.external_place_matches
    WHERE provider_place_id LIKE 'unmatched-%'
       OR (location_id = ${europeanValleyFix.location_id} AND provider_place_id = '${europeanValleyFix.old_wrong_place_id}')
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`locations_backup_${phaseDate}_bookimed_cleanup_addendum`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.locations
    WHERE id = ANY('{${affectedLocationIds.join(",")}}'::int[])
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`organizations_backup_${phaseDate}_bookimed_cleanup_addendum`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.organizations
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_cleanup_addendum_org_map_${phaseDate}`)} (
      location_id integer NOT NULL,
      old_org_id integer,
      new_org_id integer NOT NULL,
      action text NOT NULL,
      domain text NOT NULL,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_cleanup_addendum_new_orgs_${phaseDate}`)} (
      org_id integer NOT NULL,
      canonical_name text NOT NULL,
      website_domain text NOT NULL,
      dedup_key text NOT NULL,
      location_count integer NOT NULL,
      location_ids integer[] NOT NULL,
      reason text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_cleanup_addendum_location_actions_${phaseDate}`)} (
      location_id integer NOT NULL,
      action text NOT NULL,
      old_website text,
      new_website text,
      old_org_id integer,
      new_org_id integer,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
}

async function purgeSentinelPlaceMatches(pgClient) {
  await pgClient.query(`
    DELETE FROM ${quoteIdent(schema)}.external_place_matches
    WHERE provider_place_id LIKE 'unmatched-%'
  `);
}

async function applyEuropeanValleyFix(pgClient, plan) {
  await pgClient.query(
    `
    DELETE FROM ${quoteIdent(schema)}.external_place_matches
    WHERE location_id = $1
      AND provider_place_id = $2
    `,
    [europeanValleyFix.location_id, europeanValleyFix.old_wrong_place_id],
  );
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations
    SET website = $1
    WHERE id = $2
    `,
    [europeanValleyFix.new_website, europeanValleyFix.location_id],
  );
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_cleanup_addendum_location_actions_${phaseDate}`)} (
      location_id, action, old_website, new_website, old_org_id, detail
    )
    VALUES ($1, 'FIX_WRONG_PLACE_ID_WEBSITE', $2, $3, $4, $5::jsonb)
    `,
    [
      europeanValleyFix.location_id,
      plan.europeanValley.old_website,
      europeanValleyFix.new_website,
      plan.europeanValley.old_org_id,
      JSON.stringify(plan.europeanValley),
    ],
  );
}

async function applyManualOrgRelinks(pgClient, plan) {
  const newOrgResults = [];
  const reusedResults = [];
  const mapRows = [];

  for (const group of plan.groups) {
    let org = null;
    let action = "RELINK_EXISTING_ORG";
    if (group.existing_org_id) {
      const result = await pgClient.query(
        `SELECT id, canonical_name, website_domain, dedup_key FROM ${quoteIdent(schema)}.organizations WHERE id = $1`,
        [group.existing_org_id],
      );
      org = result.rows[0];
      reusedResults.push({ ...org, location_count: group.rows.length, location_ids: group.location_ids, reason: group.reason });
    } else {
      const inserted = await pgClient.query(
        `
        INSERT INTO ${quoteIdent(schema)}.organizations (
          canonical_name, name_normalized, website_domain, dedup_key, data_origin, verification_status
        )
        VALUES ($1, $2, $3, $3, 'system', 'unverified')
        RETURNING id, canonical_name, website_domain, dedup_key
        `,
        [group.canonical_name, normalizeNameForDb(group.canonical_name), group.domain],
      );
      org = inserted.rows[0];
      action = "NEW_ORG";
      const newOrg = { ...org, location_count: group.rows.length, location_ids: group.location_ids, reason: group.reason };
      newOrgResults.push(newOrg);
      await pgClient.query(
        `
        INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_cleanup_addendum_new_orgs_${phaseDate}`)} (
          org_id, canonical_name, website_domain, dedup_key, location_count, location_ids, reason
        )
        VALUES ($1, $2, $3, $4, $5, $6::int[], $7)
        `,
        [org.id, org.canonical_name, org.website_domain, org.dedup_key, group.rows.length, group.location_ids, group.reason],
      );
    }

    for (const row of group.rows) {
      mapRows.push({
        location_id: row.location_id,
        old_org_id: row.old_org_id,
        new_org_id: org.id,
        action,
        domain: group.domain,
        detail: { ...row, domain: group.domain, reason: group.reason, new_org_id: org.id, new_org_name: org.canonical_name },
      });
    }
  }

  if (mapRows.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_cleanup_addendum_org_map_${phaseDate}`)} (
        location_id, old_org_id, new_org_id, action, domain, detail
      )
      SELECT location_id, old_org_id, new_org_id, action, domain, detail
      FROM jsonb_to_recordset($1::jsonb) AS x(
        location_id integer,
        old_org_id integer,
        new_org_id integer,
        action text,
        domain text,
        detail jsonb
      )
      `,
      [JSON.stringify(mapRows)],
    );
    await pgClient.query(`
      UPDATE ${quoteIdent(schema)}.locations l
      SET org_id = m.new_org_id
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_cleanup_addendum_org_map_${phaseDate}`)} m
      WHERE l.id = m.location_id
    `);
    await pgClient.query(
      `
      UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_cleanup_addendum_location_actions_${phaseDate}`)} a
      SET new_org_id = m.new_org_id
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_cleanup_addendum_org_map_${phaseDate}`)} m
      WHERE a.location_id = m.location_id
      `,
    );
  }

  return { new_orgs_created: newOrgResults, orgs_reused: reusedResults };
}

async function acceptanceChecks(pgClient) {
  const sentinelCount = await pgClient.query(
    `SELECT count(*)::int AS count FROM ${quoteIdent(schema)}.external_place_matches WHERE provider_place_id LIKE 'unmatched-%'`,
  );
  const wrong1783 = await pgClient.query(
    `
    SELECT count(*)::int AS count
    FROM ${quoteIdent(schema)}.external_place_matches
    WHERE location_id = $1
      AND provider_place_id = $2
    `,
    [europeanValleyFix.location_id, europeanValleyFix.old_wrong_place_id],
  );
  const remaining = await pgClient.query(`
    SELECT id, slug, name, website
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
      AND status = 'active'
      AND website ~* '(^https?://)?([^/]*\\.)?bookimed\\.com([/:?#]|$)'
    ORDER BY id
  `);
  const groupRows = await pgClient.query(
    `
    SELECT l.id, l.name, l.website, l.org_id, org.canonical_name AS org_name, org.website_domain AS org_domain
    FROM ${quoteIdent(schema)}.locations l
    LEFT JOIN ${quoteIdent(schema)}.organizations org ON org.id = l.org_id
    WHERE l.id = ANY($1::int[])
    ORDER BY l.id
    `,
    [unique([...manualGroups.flatMap((group) => group.location_ids), europeanValleyFix.location_id])],
  );
  return {
    sentinel_unmatched_remaining_count: sentinelCount.rows[0].count,
    wrong_1783_place_match_remaining_count: wrong1783.rows[0].count,
    active_bookimed_remaining_count: remaining.rowCount,
    active_bookimed_remaining_sample: remaining.rows,
    affected_locations: groupRows.rows,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Bookimed Cleanup Addendum Report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(markdownTable(["metric", "count"], Object.entries(report.summary)));
  if (report.backup_tables.length) {
    lines.push("");
    lines.push("## Backup and Audit Tables");
    lines.push("");
    for (const table of report.backup_tables) {
      lines.push(`- ${table}`);
    }
  }
  lines.push("");
  lines.push("## Manual Org Groups");
  lines.push("");
  lines.push(markdownTable(["domain", "canonical_name", "locations", "reason"], report.manual_groups.map((group) => [group.domain, group.canonical_name, group.location_ids.join(", "), group.reason])));
  lines.push("");
  lines.push("## European Valley Fix");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.european_valley_fix, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Acceptance");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.acceptance, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function normalizeNameForDb(value) {
  return stripDiacritics(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
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
