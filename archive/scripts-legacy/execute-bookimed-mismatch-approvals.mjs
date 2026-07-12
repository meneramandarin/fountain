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
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `bookimed-mismatch-approvals-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/bookimed-mismatch-approvals-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);
const approvalLocationIds = [1750, 1788, 1795, 1828, 1988];
const approvalReasons = new Map([
  [1750, "Turkish translation: Ozel Moodist Hastanesi = Private Moodist Hospital; domain moodisthastanesi.com."],
  [1788, "Ukrainian translation: Likarnya Ekspert = Expert Hospital; Uzhhorod location and experthospital.com.ua domain."],
  [1795, "Cyrillic same-name match: IMPULS; domain impuls24.com.ua."],
  [1828, "Ukrainian transliteration of Ukrainian Academy of Plastic Surgery; domain uaps.in.ua."],
  [1988, "Turkish/English name pair Adam & Eve / Adem and Havva; domain ademhavvaclinic.com."],
]);
const COMMON_MULTI_LABEL_SUFFIXES = new Set([
  "ac.uk",
  "co.in",
  "co.kr",
  "co.nz",
  "co.th",
  "co.uk",
  "co.za",
  "com.au",
  "com.br",
  "com.co",
  "com.hk",
  "com.mx",
  "com.my",
  "com.ph",
  "com.sg",
  "com.tr",
  "com.tw",
  "com.ua",
  "in.ua",
  "net.au",
  "or.th",
  "org.au",
  "org.uk",
]);
const MARKETPLACE_DOMAINS = new Set(["facebook.com", "google.com", "instagram.com", "yelp.com"]);

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
  const actionRows = await pgClient.query(
    `
    SELECT
      a.location_id,
      a.place_id,
      a.api_display_name,
      a.verification,
      a.raw_payload,
      l.id,
      l.org_id,
      l.name,
      l.slug,
      l.website,
      l.phone
    FROM ${quoteIdent(rawSchema)}.bookimed_website_backfill_location_actions_20260708 a
    JOIN ${quoteIdent(schema)}.locations l ON l.id = a.location_id
    WHERE a.location_id = ANY($1::int[])
      AND a.action = 'MISMATCH'
    ORDER BY a.location_id
    `,
    [approvalLocationIds],
  );
  const orgs = await pgClient.query(`
    SELECT id, canonical_name, website_domain, dedup_key, deleted_at
    FROM ${quoteIdent(schema)}.organizations
    ORDER BY id
  `);
  return {
    rows: actionRows.rows,
    orgs: orgs.rows.map((org) => ({ ...org, normalized_domain: normalizeWebsiteToRegistrableDomain(org.website_domain) })),
  };
}

function buildPlan(preflight) {
  const missingIds = approvalLocationIds.filter((id) => !preflight.rows.some((row) => row.location_id === id));
  if (missingIds.length) {
    throw new Error(`Missing mismatch audit rows for approval ids: ${missingIds.join(", ")}`);
  }

  const approvedRows = preflight.rows.map((row) => {
    const website = sanitizeUrl(row.raw_payload?.websiteUri);
    if (!website) {
      throw new Error(`Approved location ${row.location_id} has no websiteUri in raw payload`);
    }
    const domain = normalizeWebsiteToRegistrableDomain(website);
    return {
      location_id: row.location_id,
      old_org_id: row.org_id,
      location_name: row.name,
      slug: row.slug,
      old_website: row.website,
      new_website: website,
      old_phone: row.phone,
      new_phone: row.phone || row.raw_payload?.nationalPhoneNumber || null,
      place_id: row.place_id,
      api_display_name: row.api_display_name,
      raw_payload: row.raw_payload,
      verification: {
        ...(row.verification || {}),
        match: true,
        rule: "manual_translation_approval",
        approval_reason: approvalReasons.get(row.location_id),
      },
      approval_reason: approvalReasons.get(row.location_id),
      domain,
    };
  });

  const orgPlan = buildOrgPlan(preflight, approvedRows);
  return { approvedRows, ...orgPlan };
}

function buildOrgPlan(preflight, approvedRows) {
  const existingOrgsByDomain = new Map();
  const existingDedupKeys = new Set();
  for (const org of preflight.orgs) {
    if (org.deleted_at) {
      continue;
    }
    if (org.normalized_domain && !MARKETPLACE_DOMAINS.has(org.normalized_domain)) {
      if (!existingOrgsByDomain.has(org.normalized_domain)) {
        existingOrgsByDomain.set(org.normalized_domain, []);
      }
      existingOrgsByDomain.get(org.normalized_domain).push(org);
    }
    if (org.dedup_key) {
      existingDedupKeys.add(org.dedup_key);
    }
  }

  const relinkRows = [];
  const newOrgCandidates = [];
  const orgGuardrailRows = [];
  for (const row of approvedRows) {
    if (!row.domain || MARKETPLACE_DOMAINS.has(row.domain)) {
      orgGuardrailRows.push(orgGuardrail(row, "non_clinic_or_marketplace_domain"));
      continue;
    }
    const matchingOrgs = existingOrgsByDomain.get(row.domain) || [];
    if (matchingOrgs.length === 1) {
      const target = matchingOrgs[0];
      if (row.old_org_id !== target.id) {
        relinkRows.push({
          location_id: row.location_id,
          location_name: row.location_name,
          old_org_id: row.old_org_id,
          new_org_id: target.id,
          new_org_name: target.canonical_name,
          domain: row.domain,
        });
      }
      continue;
    }
    if (matchingOrgs.length > 1) {
      orgGuardrailRows.push(orgGuardrail(row, "multiple_existing_orgs_share_domain", { matching_orgs: matchingOrgs }));
      continue;
    }
    if (existingDedupKeys.has(row.domain)) {
      orgGuardrailRows.push(orgGuardrail(row, "dedup_key_already_exists"));
      continue;
    }
    newOrgCandidates.push(row);
  }

  const newOrgGroups = [];
  for (const [domain, rows] of groupBy(newOrgCandidates, "domain")) {
    newOrgGroups.push({
      domain,
      canonical_name: displayBrand(rows[0].location_name),
      name_normalized: normalizeNameForDb(rows[0].location_name),
      dedup_key: domain,
      rows: rows.map((row) => ({
        location_id: row.location_id,
        location_name: row.location_name,
        old_org_id: row.old_org_id,
        domain,
      })),
      brand_evidence: {
        safe: true,
        reason: "manual_translation_approval",
        approval_reasons: rows.map((row) => row.approval_reason),
      },
    });
  }

  return { relinkRows, newOrgGroups, orgGuardrailRows };
}

async function executePlan(pgClient, plan) {
  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`SET LOCAL search_path TO ${quoteIdent(schema)}, public`);
    await ensureAuditTables(pgClient);
    await insertApprovalRows(pgClient, plan.approvedRows);
    await applyLocationWrites(pgClient, plan.approvedRows);
    await writeExternalPlaceMatches(pgClient, plan.approvedRows);
    const newOrgResults = await applyOrgWrites(pgClient, plan);
    await insertOrgAuditRows(pgClient, plan, newOrgResults);

    const affectedLocationIds = unique([
      ...plan.approvedRows.map((row) => row.location_id),
      ...plan.relinkRows.map((row) => row.location_id),
      ...plan.newOrgGroups.flatMap((group) => group.rows.map((row) => row.location_id)),
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
      approved_location_ids: approvalLocationIds,
      backup_tables: dryRun
        ? []
        : [
            `${rawSchema}.locations_backup_${phaseDate}_bookimed_mismatch_approvals`,
            `${rawSchema}.organizations_backup_${phaseDate}_bookimed_mismatch_approvals`,
            `${rawSchema}.bookimed_mismatch_approval_location_actions_${phaseDate}`,
            `${rawSchema}.bookimed_mismatch_approval_org_map_${phaseDate}`,
            `${rawSchema}.bookimed_mismatch_approval_new_orgs_${phaseDate}`,
            `${rawSchema}.bookimed_mismatch_approval_guardrail_${phaseDate}`,
          ],
      summary: {
        approved: plan.approvedRows.length,
        websites_written: plan.approvedRows.length,
        phones_written: plan.approvedRows.filter((row) => !row.old_phone && row.new_phone).length,
        orgs_relinked: plan.relinkRows.length,
        orgs_created: newOrgResults.length,
        org_locations_created: newOrgResults.reduce((sum, org) => sum + org.location_count, 0),
        org_guardrail: plan.orgGuardrailRows.length,
        active_bookimed_remaining_count: acceptance.active_bookimed_remaining_count,
      },
      approved: plan.approvedRows,
      relinked: plan.relinkRows,
      new_orgs_created: newOrgResults,
      org_guardrail: plan.orgGuardrailRows,
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
          `locations_backup_${phaseDate}_bookimed_mismatch_approvals`,
          `organizations_backup_${phaseDate}_bookimed_mismatch_approvals`,
          `bookimed_mismatch_approval_location_actions_${phaseDate}`,
          `bookimed_mismatch_approval_org_map_${phaseDate}`,
          `bookimed_mismatch_approval_new_orgs_${phaseDate}`,
          `bookimed_mismatch_approval_guardrail_${phaseDate}`,
        ],
      ],
    );
    if (existing.rowCount) {
      throw new Error(`Refusing to run because approval audit tables already exist: ${existing.rows.map((row) => row.table_name).join(", ")}`);
    }
  }
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`locations_backup_${phaseDate}_bookimed_mismatch_approvals`)} AS
    SELECT * FROM ${quoteIdent(schema)}.locations
    WHERE id = ANY('{${approvalLocationIds.join(",")}}'::int[])
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`organizations_backup_${phaseDate}_bookimed_mismatch_approvals`)} AS
    SELECT * FROM ${quoteIdent(schema)}.organizations
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_mismatch_approval_location_actions_${phaseDate}`)} (
      location_id integer NOT NULL,
      place_id text NOT NULL,
      old_website text,
      new_website text NOT NULL,
      old_phone text,
      new_phone text,
      api_display_name text,
      approval_reason text NOT NULL,
      verification jsonb,
      raw_payload jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_mismatch_approval_org_map_${phaseDate}`)} (
      location_id integer NOT NULL,
      old_org_id integer,
      new_org_id integer,
      action text NOT NULL,
      domain text,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_mismatch_approval_new_orgs_${phaseDate}`)} (
      org_id integer NOT NULL,
      canonical_name text NOT NULL,
      website_domain text NOT NULL,
      dedup_key text NOT NULL,
      location_count integer NOT NULL,
      location_ids integer[] NOT NULL,
      brand_evidence jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_mismatch_approval_guardrail_${phaseDate}`)} (
      location_id integer NOT NULL,
      location_name text,
      location_domain text,
      old_org_id integer,
      reason text NOT NULL,
      evidence jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
}

async function insertApprovalRows(pgClient, rows) {
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_mismatch_approval_location_actions_${phaseDate}`)} (
      location_id, place_id, old_website, new_website, old_phone, new_phone,
      api_display_name, approval_reason, verification, raw_payload
    )
    SELECT location_id, place_id, old_website, new_website, old_phone, new_phone,
           api_display_name, approval_reason, verification, raw_payload
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      place_id text,
      old_website text,
      new_website text,
      old_phone text,
      new_phone text,
      api_display_name text,
      approval_reason text,
      verification jsonb,
      raw_payload jsonb
    )
    `,
    [JSON.stringify(rows)],
  );
}

async function applyLocationWrites(pgClient, rows) {
  await pgClient.query(
    `
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb) AS x(location_id integer, new_website text, new_phone text)
    )
    UPDATE ${quoteIdent(schema)}.locations l
    SET website = input.new_website,
        phone = input.new_phone
    FROM input
    WHERE l.id = input.location_id
    `,
    [JSON.stringify(rows)],
  );
}

async function writeExternalPlaceMatches(pgClient, rows) {
  const payload = rows.map((row) => ({
    location_id: row.location_id,
    provider: "google_places",
    provider_place_id: row.place_id,
    provider_url: `https://www.google.com/maps/place/?q=place_id:${row.place_id}`,
    display_name: row.api_display_name,
    match_confidence: row.verification?.score ?? null,
    match_status: "matched",
    fetched_at: new Date().toISOString(),
    raw_json: row.raw_payload,
  }));
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(schema)}.external_place_matches (
      location_id, provider, provider_place_id, provider_url, display_name, match_confidence, match_status, fetched_at, raw_json
    )
    SELECT location_id, provider, provider_place_id, provider_url, display_name, match_confidence, match_status, fetched_at, raw_json
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      provider text,
      provider_place_id text,
      provider_url text,
      display_name text,
      match_confidence double precision,
      match_status text,
      fetched_at timestamptz,
      raw_json jsonb
    )
    ON CONFLICT (location_id, provider) DO UPDATE
    SET provider_place_id = EXCLUDED.provider_place_id,
        provider_url = EXCLUDED.provider_url,
        display_name = EXCLUDED.display_name,
        match_confidence = EXCLUDED.match_confidence,
        match_status = EXCLUDED.match_status,
        fetched_at = EXCLUDED.fetched_at,
        raw_json = EXCLUDED.raw_json
    `,
    [JSON.stringify(payload)],
  );
}

async function applyOrgWrites(pgClient, plan) {
  const newOrgResults = [];
  if (plan.newOrgGroups.length) {
    const orgInput = plan.newOrgGroups.map((group, index) => ({
      ord: index,
      canonical_name: group.canonical_name,
      name_normalized: group.name_normalized,
      website_domain: group.domain,
      dedup_key: group.dedup_key,
    }));
    const insertedOrgs = await pgClient.query(
      `
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          ord integer,
          canonical_name text,
          name_normalized text,
          website_domain text,
          dedup_key text
        )
      )
      INSERT INTO ${quoteIdent(schema)}.organizations (
        canonical_name, name_normalized, website_domain, dedup_key, data_origin, verification_status
      )
      SELECT canonical_name, name_normalized, website_domain, dedup_key, 'system', 'unverified'
      FROM input
      ORDER BY ord
      RETURNING id, canonical_name, website_domain, dedup_key
      `,
      [JSON.stringify(orgInput)],
    );
    const insertedByDomain = new Map(insertedOrgs.rows.map((org) => [org.website_domain, org]));
    for (const group of plan.newOrgGroups) {
      const org = insertedByDomain.get(group.domain);
      newOrgResults.push({
        org_id: org.id,
        canonical_name: org.canonical_name,
        website_domain: org.website_domain,
        dedup_key: org.dedup_key,
        location_count: group.rows.length,
        location_ids: group.rows.map((row) => row.location_id),
        brand_evidence: group.brand_evidence,
      });
    }
  }

  const mapRows = [
    ...plan.relinkRows.map((row) => ({ ...row, action: "RELINK" })),
    ...plan.newOrgGroups.flatMap((group) => {
      const org = newOrgResults.find((candidate) => candidate.website_domain === group.domain);
      return group.rows.map((row) => ({ ...row, new_org_id: org.org_id, action: "NEW_ORG" }));
    }),
  ];
  if (mapRows.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_mismatch_approval_org_map_${phaseDate}`)} (
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
      [JSON.stringify(mapRows.map((row) => ({ ...row, detail: row })))],
    );
    await pgClient.query(`
      UPDATE ${quoteIdent(schema)}.locations l
      SET org_id = m.new_org_id
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_mismatch_approval_org_map_${phaseDate}`)} m
      WHERE l.id = m.location_id
        AND m.action IN ('RELINK', 'NEW_ORG')
    `);
  }
  return newOrgResults;
}

async function insertOrgAuditRows(pgClient, plan, newOrgResults) {
  if (newOrgResults.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_mismatch_approval_new_orgs_${phaseDate}`)} (
        org_id, canonical_name, website_domain, dedup_key, location_count, location_ids, brand_evidence
      )
      SELECT org_id, canonical_name, website_domain, dedup_key, location_count, location_ids, brand_evidence
      FROM jsonb_to_recordset($1::jsonb) AS x(
        org_id integer,
        canonical_name text,
        website_domain text,
        dedup_key text,
        location_count integer,
        location_ids integer[],
        brand_evidence jsonb
      )
      `,
      [JSON.stringify(newOrgResults)],
    );
  }
  if (plan.orgGuardrailRows.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_mismatch_approval_guardrail_${phaseDate}`)} (
        location_id, location_name, location_domain, old_org_id, reason, evidence
      )
      SELECT location_id, location_name, location_domain, old_org_id, reason, evidence
      FROM jsonb_to_recordset($1::jsonb) AS x(
        location_id integer,
        location_name text,
        location_domain text,
        old_org_id integer,
        reason text,
        evidence jsonb
      )
      `,
      [JSON.stringify(plan.orgGuardrailRows)],
    );
  }
}

async function acceptanceChecks(pgClient) {
  const remaining = await pgClient.query(`
    SELECT id, slug, name, website
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
      AND status = 'active'
      AND website ~* '(^https?://)?([^/]*\\.)?bookimed\\.com([/:?#]|$)'
    ORDER BY id
  `);
  const approved = await pgClient.query(
    `
    SELECT l.id, l.slug, l.name, l.website, l.phone, l.org_id, org.canonical_name AS org_name, org.website_domain AS org_domain,
           epm.provider_place_id, epm.match_status, epm.raw_json->>'websiteUri' AS raw_website
    FROM ${quoteIdent(schema)}.locations l
    LEFT JOIN ${quoteIdent(schema)}.organizations org ON org.id = l.org_id
    LEFT JOIN ${quoteIdent(schema)}.external_place_matches epm
      ON epm.location_id = l.id
     AND epm.provider = 'google_places'
    WHERE l.id = ANY($1::int[])
    ORDER BY l.id
    `,
    [approvalLocationIds],
  );
  return {
    active_bookimed_remaining_count: remaining.rowCount,
    active_bookimed_remaining_sample: remaining.rows,
    approved_locations: approved.rows,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Bookimed Mismatch Approvals Report");
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
  lines.push("## Approved");
  lines.push("");
  lines.push(markdownTable(["location_id", "location_name", "new_website", "reason"], report.approved.map((row) => [row.location_id, row.location_name, row.new_website, row.approval_reason])));
  if (report.new_orgs_created.length) {
    lines.push("");
    lines.push("## New Orgs Created");
    lines.push("");
    lines.push(markdownTable(["org_id", "canonical_name", "website_domain"], report.new_orgs_created.map((row) => [row.org_id, row.canonical_name, row.website_domain])));
  }
  lines.push("");
  lines.push("## Acceptance");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.acceptance, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function orgGuardrail(row, reason, evidence = {}) {
  return {
    location_id: row.location_id,
    location_name: row.location_name,
    location_domain: row.domain,
    old_org_id: row.old_org_id,
    reason,
    evidence,
  };
}

function displayBrand(value) {
  return String(value || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+\|\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNameForDb(value) {
  return stripDiacritics(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeWebsiteToHost(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  let text = value.trim().toLowerCase();
  if (!text) {
    return null;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    text = `https://${text}`;
  }
  try {
    const url = new URL(text);
    return url.hostname.replace(/\.$/, "").replace(/^www\d?\./, "") || null;
  } catch {
    return text
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .split(/[/?#]/)[0]
      .split(":")[0]
      .replace(/^www\d?\./, "")
      .replace(/\.$/, "");
  }
}

function normalizeWebsiteToRegistrableDomain(value) {
  const host = normalizeWebsiteToHost(value);
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host || null;
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  if (parts.length === 2) {
    return host;
  }
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  if (COMMON_MULTI_LABEL_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return lastThree;
  }
  return lastTwo;
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!groups.has(value)) {
      groups.set(value, []);
    }
    groups.get(value).push(row);
  }
  return groups;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
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
