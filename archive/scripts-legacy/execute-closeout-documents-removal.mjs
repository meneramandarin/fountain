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
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `closeout-documents-removal-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/closeout-documents-removal-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);

const APPROVED_MATCH_IDS = [43, 621, 1010, 1061];
const HIDE_LOCATION_IDS = [546, 769, 777];
const CHILLRX_LOCATION_IDS = [1020, 1175];
const PDF_SOURCE_SLUGS = ["healing_harmony_thailand_pdf", "thailand_longevity_guidebook_pdf", "korea_medical_directory_pdf"];
const COMMON_MULTI_LABEL_SUFFIXES = new Set([
  "ac.uk",
  "co.il",
  "co.in",
  "co.jp",
  "co.kr",
  "co.nz",
  "co.uk",
  "co.za",
  "com.au",
  "com.br",
  "com.cn",
  "com.hk",
  "com.mx",
  "com.my",
  "com.ph",
  "com.sg",
  "com.tr",
  "com.tw",
  "com.ua",
  "gov.uk",
  "net.au",
  "org.au",
  "org.uk",
]);
const PROFILE_PLATFORM_DOMAINS = new Set([
  "acuityscheduling.com",
  "as.me",
  "booksy.com",
  "calendly.com",
  "clientsecure.me",
  "facebook.com",
  "fresha.com",
  "glossgenius.com",
  "google.com",
  "instagram.com",
  "mindbody.io",
  "mindbodyonline.com",
  "myshopify.com",
  "onbuildhealth.com",
  "patientnow.com",
  "rymaps.xyz",
  "square.site",
  "squarespace.com",
  "vagaro.com",
  "webflow.io",
  "wixsite.com",
  "yelp.com",
  "zenoti.com",
  "zoca.com",
  "zocdoc.com",
]);
const APPROVED_MERGE_DOMAINS = new Map([
  ["thedripbar.com", "The DRIPBaR"],
  ["chillcryo.net", "ChillRx Cryotherapy"],
  ["dexafit.com", "DexaFit"],
  ["hughston.com", "Hughston"],
  ["stem-wave.com", "StemWave"],
  ["wellmedhealthcare.com", "WellMed"],
  ["muschealth.org", "MUSC Health"],
  ["dignityhealth.org", "Dignity Health"],
  ["advocatehealth.com", "Advocate Health"],
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

const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  const preflight = await loadPreflight(client);
  const plan = buildPlan(preflight);
  const report = await executePlan(client, preflight, plan);
  writeReports(report);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadPreflight(pgClient) {
  const locations = await pgClient.query(`
      SELECT id, org_id, status, name, phone, website, slug
      FROM ${quoteIdent(schema)}.locations
      WHERE id = ANY($1::int[])
         OR deleted_at IS NULL
      ORDER BY id
    `, [[...APPROVED_MATCH_IDS, ...HIDE_LOCATION_IDS, ...CHILLRX_LOCATION_IDS]]);
  const externalMatches = await pgClient.query(`
      SELECT location_id, provider, provider_place_id, display_name, fetched_at, raw_json
      FROM ${quoteIdent(schema)}.external_place_matches
      WHERE location_id = ANY($1::int[])
        AND provider = 'google_places'
    `, [APPROVED_MATCH_IDS]);
  const orgs = await pgClient.query(`
      SELECT id, canonical_name, name_normalized, website_domain, dedup_key, deleted_at
      FROM ${quoteIdent(schema)}.organizations
      WHERE deleted_at IS NULL
      ORDER BY id
    `);
  const documentCounts = await pgClient.query(`
      SELECT
        (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.documents) AS documents,
        (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.source_records WHERE entity_type = 'document') AS document_source_records,
        (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.search_index WHERE entity_type = 'document') AS document_search_rows,
        (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.search_index) AS search_index_total
    `);
  const pdfSources = await pgClient.query(`
      SELECT s.id, s.slug,
        (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.documents d WHERE d.source_id = s.id) AS documents,
        (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.source_records sr WHERE sr.source_id = s.id AND sr.entity_type = 'document') AS document_source_records
      FROM ${quoteIdent(schema)}.sources s
      WHERE s.slug = ANY($1::text[])
      ORDER BY s.slug
    `, [PDF_SOURCE_SLUGS]);
  const rawPdfSources = await pgClient.query(`
      SELECT source_slug, listing_count, field_count, page_count, sync_status, last_synced_at
      FROM ${quoteIdent(rawSchema)}.source_databases
      WHERE source_slug = ANY($1::text[])
      ORDER BY source_slug
    `, [PDF_SOURCE_SLUGS]);
  const searchCounts = await pgClient.query(`
      SELECT entity_type, COUNT(*)::int AS count
      FROM ${quoteIdent(schema)}.search_index
      GROUP BY entity_type
      ORDER BY entity_type
    `);
  const existingTables = await pgClient.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
      `,
      [
        rawSchema,
        [
          `closeout_organizations_backup_${phaseDate}`,
          `closeout_locations_backup_${phaseDate}`,
          `closeout_source_records_org_backup_${phaseDate}`,
          `closeout_documents_backup_${phaseDate}`,
          `closeout_document_source_records_backup_${phaseDate}`,
          `closeout_document_search_index_backup_${phaseDate}`,
          `closeout_approved_website_matches_${phaseDate}`,
          `closeout_org_merges_${phaseDate}`,
          `closeout_duplicate_domain_review_${phaseDate}`,
          `closeout_hidden_locations_${phaseDate}`,
          `closeout_documents_deleted_${phaseDate}`,
        ],
      ],
    );

  return {
    locationsById: new Map(locations.rows.map((row) => [row.id, row])),
    externalMatchesByLocationId: new Map(externalMatches.rows.map((row) => [row.location_id, row])),
    orgs: orgs.rows.map((org) => ({ ...org, normalized_domain: normalizeWebsiteToRegistrableDomain(org.website_domain) })),
    documentCounts: documentCounts.rows[0],
    pdfSources: pdfSources.rows,
    rawPdfSources: rawPdfSources.rows,
    searchCountsBefore: searchCounts.rows,
    existingTables: existingTables.rows.map((row) => row.table_name),
  };
}

function buildPlan(preflight) {
  if (!dryRun && preflight.existingTables.length) {
    throw new Error(`Refusing to run because closeout tables already exist: ${preflight.existingTables.join(", ")}`);
  }

  const approvedWebsiteMatches = APPROVED_MATCH_IDS.map((locationId) => {
    const location = preflight.locationsById.get(locationId);
    const match = preflight.externalMatchesByLocationId.get(locationId);
    if (!location || !match) {
      throw new Error(`Missing approved closeout location or external match for ${locationId}`);
    }
    const payload = parseJson(match.raw_json);
    const website = sanitizeUrl(payload?.websiteUri);
    const phone = payload?.nationalPhoneNumber || location.phone;
    if (!website) {
      throw new Error(`Approved closeout location ${locationId} has no fetched websiteUri`);
    }
    return {
      location_id: locationId,
      location_name: location.name,
      old_website: location.website,
      new_website: website,
      old_phone: location.phone,
      new_phone: phone,
      provider_place_id: match.provider_place_id,
      api_display_name: match.display_name,
      raw_payload: payload,
      domain: normalizeWebsiteToRegistrableDomain(website),
    };
  });

  const duplicateDomains = duplicateOrgDomains(preflight.orgs);
  const mergeGroups = [];
  const duplicateDomainReview = [];
  for (const group of duplicateDomains) {
    if (PROFILE_PLATFORM_DOMAINS.has(group.domain)) {
      duplicateDomainReview.push({ ...group, reason: "profile_platform_domain_no_org_merge" });
      continue;
    }
    const approvedName = APPROVED_MERGE_DOMAINS.get(group.domain);
    if (approvedName) {
      mergeGroups.push({
        domain: group.domain,
        canonical_name: approvedName,
        keeper_org_id: Math.min(...group.orgs.map((org) => org.id)),
        loser_org_ids: group.orgs.map((org) => org.id).filter((id) => id !== Math.min(...group.orgs.map((org) => org.id))),
        orgs: group.orgs,
        reason: group.domain === "thedripbar.com" ? "prompt_explicit_merge" : "approved_same_brand_duplicate_domain",
      });
    } else {
      duplicateDomainReview.push({ ...group, reason: "material_name_review_needed" });
    }
  }

  const existingOrgByDomain = new Map();
  for (const org of preflight.orgs) {
    if (!org.normalized_domain || PROFILE_PLATFORM_DOMAINS.has(org.normalized_domain)) {
      continue;
    }
    if (!existingOrgByDomain.has(org.normalized_domain)) {
      existingOrgByDomain.set(org.normalized_domain, []);
    }
    existingOrgByDomain.get(org.normalized_domain).push(org);
  }

  const approvedOrgActions = [];
  const newOrgGroups = [];
  const postMergeKeeperByDomain = new Map(mergeGroups.map((group) => [group.domain, group.keeper_org_id]));
  const domainsCreated = new Set();
  for (const row of approvedWebsiteMatches) {
    const postMergeKeeper = postMergeKeeperByDomain.get(row.domain);
    if (postMergeKeeper) {
      approvedOrgActions.push({ location_id: row.location_id, old_org_id: preflight.locationsById.get(row.location_id)?.org_id ?? null, new_org_id: postMergeKeeper, action: "RELINK_EXISTING_DOMAIN", domain: row.domain });
      continue;
    }
    const matches = existingOrgByDomain.get(row.domain) || [];
    if (matches.length === 1) {
      approvedOrgActions.push({ location_id: row.location_id, old_org_id: preflight.locationsById.get(row.location_id)?.org_id ?? null, new_org_id: matches[0].id, action: "RELINK_EXISTING_DOMAIN", domain: row.domain });
    } else if (!domainsCreated.has(row.domain)) {
      domainsCreated.add(row.domain);
      newOrgGroups.push({
        domain: row.domain,
        canonical_name: displayBrand(row.location_name),
        name_normalized: normalizeNameForDb(displayBrand(row.location_name)),
        dedup_key: row.domain,
        rows: [row],
      });
    }
  }

  const chillrxKeeper = postMergeKeeperByDomain.get("chillcryo.net") || Math.min(...(existingOrgByDomain.get("chillcryo.net") || []).map((org) => org.id));
  const chillrxRelinks = CHILLRX_LOCATION_IDS.map((locationId) => ({
    location_id: locationId,
    old_org_id: preflight.locationsById.get(locationId)?.org_id ?? null,
    new_org_id: chillrxKeeper,
    action: "RELINK_CHILLRX",
    domain: "chillcryo.net",
  })).filter((row) => row.new_org_id && row.old_org_id !== row.new_org_id);

  const hiddenLocations = HIDE_LOCATION_IDS.map((locationId) => {
    const location = preflight.locationsById.get(locationId);
    if (!location) {
      throw new Error(`Missing location ${locationId} for hide step`);
    }
    return {
      location_id: locationId,
      location_name: location.name,
      old_status: location.status,
      new_status: "hidden",
      reason: locationId === 546 ? "google_listed_website_is_google_com" : "newark_city_health_department_facility",
    };
  });

  return {
    approvedWebsiteMatches,
    duplicateDomains,
    mergeGroups,
    duplicateDomainReview,
    approvedOrgActions,
    newOrgGroups,
    chillrxRelinks,
    hiddenLocations,
  };
}

async function executePlan(pgClient, preflight, plan) {
  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`SET LOCAL search_path TO ${quoteIdent(schema)}, public`);
    await ensureBackupAndReportTables(pgClient, plan);

    const insertedApprovedOrgs = await createApprovedWebsiteOrgs(pgClient, plan);
    const approvedOrgActions = [
      ...plan.approvedOrgActions,
      ...plan.newOrgGroups.flatMap((group) => {
        const org = insertedApprovedOrgs.find((row) => row.website_domain === group.domain);
        return group.rows.map((row) => ({
          location_id: row.location_id,
          old_org_id: preflight.locationsById.get(row.location_id)?.org_id ?? null,
          new_org_id: org.id,
          action: "NEW_ORG_APPROVED_WEBSITE",
          domain: group.domain,
        }));
      }),
    ];

    await applyApprovedWebsiteMatches(pgClient, plan.approvedWebsiteMatches, approvedOrgActions);
    await applyOrgMerges(pgClient, plan.mergeGroups);
    await applyOrgRelinks(pgClient, [...approvedOrgActions, ...plan.chillrxRelinks]);
    await hideLocations(pgClient, plan.hiddenLocations);
    await removeDocumentsFromServing(pgClient);
    await updateSearchFunctions(pgClient);

    const affectedLocationIds = unique([
      ...plan.approvedWebsiteMatches.map((row) => row.location_id),
      ...approvedOrgActions.map((row) => row.location_id),
      ...plan.chillrxRelinks.map((row) => row.location_id),
      ...plan.hiddenLocations.map((row) => row.location_id),
      ...plan.mergeGroups.flatMap((group) => group.orgs.flatMap((org) => org.location_ids || [])),
    ]);
    if (affectedLocationIds.length) {
      await pgClient.query(
        `SELECT ${quoteIdent(schema)}.refresh_search_index_for_location(location_id) FROM unnest($1::int[]) AS location_id`,
        [affectedLocationIds],
      );
    }

    const acceptance = await acceptanceChecks(pgClient);
    if (dryRun) {
      await pgClient.query("ROLLBACK");
    } else {
      await pgClient.query("COMMIT");
    }

    return {
      generated_at: new Date().toISOString(),
      mode: dryRun ? "DRY_RUN_ROLLED_BACK" : "EXECUTED",
      prompt: "docs/closeout-and-documents-removal-prompt.md",
      backup_tables: dryRun ? [] : backupTableNames(),
      profile_platform_domains_added: [...PROFILE_PLATFORM_DOMAINS].sort(),
      raw_pdf_source_retention: preflight.rawPdfSources,
      serving_pdf_sources_before: preflight.pdfSources,
      duplicate_domains_before: plan.duplicateDomains,
      merged_orgs: plan.mergeGroups,
      duplicate_domains_flagged_for_review: plan.duplicateDomainReview,
      approved_website_matches: plan.approvedWebsiteMatches,
      approved_website_orgs_created: insertedApprovedOrgs,
      chillrx_relinks: plan.chillrxRelinks,
      hidden_locations: plan.hiddenLocations,
      documents_before: preflight.documentCounts,
      search_index_before: preflight.searchCountsBefore,
      summary: {
        approved_websites_written: plan.approvedWebsiteMatches.length,
        approved_orgs_created: insertedApprovedOrgs.length,
        org_merge_groups: plan.mergeGroups.length,
        orgs_merged_away: plan.mergeGroups.reduce((sum, group) => sum + group.loser_org_ids.length, 0),
        duplicate_domain_groups_flagged: plan.duplicateDomainReview.length,
        chillrx_locations_relinked: plan.chillrxRelinks.length,
        hidden_locations: plan.hiddenLocations.length,
        documents_deleted: Number(preflight.documentCounts.documents),
        document_source_records_deleted: Number(preflight.documentCounts.document_source_records),
        document_search_rows_deleted: Number(preflight.documentCounts.document_search_rows),
        search_index_before_total: Number(preflight.documentCounts.search_index_total),
        search_index_after_total: acceptance.search_index_total,
        active_maps_place_id_websites: acceptance.active_maps_place_id_websites,
        koh_samui_document_search_matches: acceptance.koh_samui_document_search_matches,
        koh_samui_all_search_matches: acceptance.koh_samui_all_search_matches,
      },
      acceptance,
    };
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

async function ensureBackupAndReportTables(pgClient, plan) {
  await pgClient.query(`CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_organizations_backup_${phaseDate}`)} AS SELECT * FROM ${quoteIdent(schema)}.organizations`);
  await pgClient.query(`CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_locations_backup_${phaseDate}`)} AS SELECT * FROM ${quoteIdent(schema)}.locations`);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_source_records_org_backup_${phaseDate}`)} AS
    SELECT *
    FROM ${quoteIdent(schema)}.source_records
    WHERE entity_type = 'organization'
      AND entity_id = ANY($1::int[])
  `, [unique(plan.mergeGroups.flatMap((group) => group.orgs.map((org) => org.id)))]);
  await pgClient.query(`CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_documents_backup_${phaseDate}`)} AS SELECT * FROM ${quoteIdent(schema)}.documents`);
  await pgClient.query(`CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_document_source_records_backup_${phaseDate}`)} AS SELECT * FROM ${quoteIdent(schema)}.source_records WHERE entity_type = 'document'`);
  await pgClient.query(`CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_document_search_index_backup_${phaseDate}`)} AS SELECT * FROM ${quoteIdent(schema)}.search_index WHERE entity_type = 'document'`);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_approved_website_matches_${phaseDate}`)} (
      location_id integer,
      location_name text,
      old_website text,
      new_website text,
      old_phone text,
      new_phone text,
      domain text,
      raw_payload jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_org_merges_${phaseDate}`)} (
      domain text,
      keeper_org_id integer,
      loser_org_ids integer[],
      canonical_name text,
      reason text,
      orgs jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_duplicate_domain_review_${phaseDate}`)} (
      domain text,
      org_count integer,
      reason text,
      orgs jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_hidden_locations_${phaseDate}`)} (
      location_id integer,
      location_name text,
      old_status text,
      new_status text,
      reason text,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_documents_deleted_${phaseDate}`)} (
      documents_deleted integer,
      document_source_records_deleted integer,
      document_search_rows_deleted integer,
      created_at timestamptz DEFAULT now()
    )
  `);

  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_org_merges_${phaseDate}`)}
    (domain, keeper_org_id, loser_org_ids, canonical_name, reason, orgs)
    SELECT domain, keeper_org_id, loser_org_ids, canonical_name, reason, orgs
    FROM jsonb_to_recordset($1::jsonb) AS x(domain text, keeper_org_id integer, loser_org_ids integer[], canonical_name text, reason text, orgs jsonb)
    `,
    [JSON.stringify(plan.mergeGroups)],
  );
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_duplicate_domain_review_${phaseDate}`)}
    (domain, org_count, reason, orgs)
    SELECT domain, org_count, reason, orgs
    FROM jsonb_to_recordset($1::jsonb) AS x(domain text, org_count integer, reason text, orgs jsonb)
    `,
    [JSON.stringify(plan.duplicateDomainReview)],
  );
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_hidden_locations_${phaseDate}`)}
    (location_id, location_name, old_status, new_status, reason)
    SELECT location_id, location_name, old_status, new_status, reason
    FROM jsonb_to_recordset($1::jsonb) AS x(location_id integer, location_name text, old_status text, new_status text, reason text)
    `,
    [JSON.stringify(plan.hiddenLocations)],
  );
}

async function createApprovedWebsiteOrgs(pgClient, plan) {
  if (!plan.newOrgGroups.length) {
    return [];
  }
  const input = plan.newOrgGroups.map((group, index) => ({ ord: index, ...group }));
  const result = await pgClient.query(
    `
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb) AS x(ord integer, canonical_name text, name_normalized text, domain text, dedup_key text)
    )
    INSERT INTO ${quoteIdent(schema)}.organizations (
      canonical_name,
      name_normalized,
      website_domain,
      dedup_key,
      data_origin,
      verification_status
    )
    SELECT canonical_name, name_normalized, domain, dedup_key, 'system', 'unverified'
    FROM input
    ORDER BY ord
    RETURNING id, canonical_name, website_domain, dedup_key
    `,
    [JSON.stringify(input)],
  );
  return result.rows;
}

async function applyApprovedWebsiteMatches(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_approved_website_matches_${phaseDate}`)}
    (location_id, location_name, old_website, new_website, old_phone, new_phone, domain, raw_payload)
    SELECT location_id, location_name, old_website, new_website, old_phone, new_phone, domain, raw_payload
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      location_name text,
      old_website text,
      new_website text,
      old_phone text,
      new_phone text,
      domain text,
      raw_payload jsonb
    )
    `,
    [JSON.stringify(rows)],
  );
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
  const matchRows = rows.map((row) => ({
    location_id: row.location_id,
    provider: "google_places",
    provider_place_id: row.provider_place_id,
    provider_url: `https://www.google.com/maps/place/?q=place_id:${row.provider_place_id}`,
    display_name: row.api_display_name,
    match_confidence: 1,
    match_status: "manual_approved",
    fetched_at: new Date().toISOString(),
    raw_json: JSON.stringify(row.raw_payload),
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
      fetched_at text,
      raw_json text
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
    [JSON.stringify(matchRows)],
  );
}

async function applyOrgMerges(pgClient, mergeGroups) {
  for (const group of mergeGroups) {
    const allOrgIds = [group.keeper_org_id, ...group.loser_org_ids];
    await pgClient.query(
      `
      UPDATE ${quoteIdent(schema)}.locations
      SET org_id = $1
      WHERE org_id = ANY($2::int[])
      `,
      [group.keeper_org_id, group.loser_org_ids],
    );
    await pgClient.query(
      `
      UPDATE ${quoteIdent(schema)}.source_records
      SET entity_id = $1
      WHERE entity_type = 'organization'
        AND entity_id = ANY($2::int[])
      `,
      [group.keeper_org_id, group.loser_org_ids],
    );
    await pgClient.query(
      `
      UPDATE ${quoteIdent(schema)}.images
      SET entity_id = $1
      WHERE entity_type = 'organization'
        AND entity_id = ANY($2::int[])
      `,
      [group.keeper_org_id, group.loser_org_ids],
    );
    await pgClient.query(
      `
      UPDATE ${quoteIdent(schema)}.entity_tags
      SET entity_id = $1
      WHERE entity_type = 'organization'
        AND entity_id = ANY($2::int[])
      `,
      [group.keeper_org_id, group.loser_org_ids],
    );
    await pgClient.query(
      `
      UPDATE ${quoteIdent(schema)}.organizations
      SET dedup_key = NULL
      WHERE id = ANY($1::int[])
      `,
      [group.loser_org_ids],
    );
    await pgClient.query(
      `
      UPDATE ${quoteIdent(schema)}.organizations
      SET canonical_name = $1,
          name_normalized = $2,
          website_domain = $3,
          dedup_key = $3
      WHERE id = $4
      `,
      [group.canonical_name, normalizeNameForDb(group.canonical_name), group.domain, group.keeper_org_id],
    );
    await pgClient.query(
      `DELETE FROM ${quoteIdent(schema)}.organizations WHERE id = ANY($1::int[])`,
      [group.loser_org_ids],
    );
    group.location_ids = (
      await pgClient.query(
        `SELECT id FROM ${quoteIdent(schema)}.locations WHERE org_id = $1 AND deleted_at IS NULL ORDER BY id`,
        [group.keeper_org_id],
      )
    ).rows.map((row) => row.id);
    group.all_org_ids = allOrgIds;
  }
}

async function applyOrgRelinks(pgClient, rows) {
  const effectiveRows = rows.filter((row) => row.new_org_id && row.old_org_id !== row.new_org_id);
  if (!effectiveRows.length) {
    return;
  }
  await pgClient.query(
    `
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb) AS x(location_id integer, new_org_id integer)
    )
    UPDATE ${quoteIdent(schema)}.locations l
    SET org_id = input.new_org_id
    FROM input
    WHERE l.id = input.location_id
    `,
    [JSON.stringify(effectiveRows)],
  );
}

async function hideLocations(pgClient, rows) {
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations
    SET status = 'hidden'
    WHERE id = ANY($1::int[])
    `,
    [rows.map((row) => row.location_id)],
  );
}

async function removeDocumentsFromServing(pgClient) {
  const before = await pgClient.query(`
    SELECT
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.documents) AS documents_deleted,
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.source_records WHERE entity_type = 'document') AS document_source_records_deleted,
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.search_index WHERE entity_type = 'document') AS document_search_rows_deleted
  `);
  await pgClient.query(`DROP TRIGGER IF EXISTS trg_refresh_document_search_index ON ${quoteIdent(schema)}.documents`);
  await pgClient.query(`DELETE FROM ${quoteIdent(schema)}.search_index WHERE entity_type = 'document'`);
  await pgClient.query(`DELETE FROM ${quoteIdent(schema)}.source_records WHERE entity_type = 'document'`);
  await pgClient.query(`DELETE FROM ${quoteIdent(schema)}.documents`);
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`closeout_documents_deleted_${phaseDate}`)}
    (documents_deleted, document_source_records_deleted, document_search_rows_deleted)
    VALUES ($1, $2, $3)
    `,
    [
      before.rows[0].documents_deleted,
      before.rows[0].document_source_records_deleted,
      before.rows[0].document_search_rows_deleted,
    ],
  );
}

async function updateSearchFunctions(pgClient) {
  await pgClient.query(`DROP FUNCTION IF EXISTS ${quoteIdent(schema)}.refresh_document_search_index_trigger()`);
  await pgClient.query(`DROP FUNCTION IF EXISTS ${quoteIdent(schema)}.refresh_search_index_for_document(integer)`);
  await pgClient.query(`
    CREATE OR REPLACE FUNCTION ${quoteIdent(schema)}.refresh_search_index()
    RETURNS void
    LANGUAGE plpgsql
    AS $$
    DECLARE
        entity RECORD;
    BEGIN
        DELETE FROM ${quoteIdent(schema)}.search_index;
        FOR entity IN SELECT id FROM ${quoteIdent(schema)}.locations ORDER BY id LOOP
            PERFORM ${quoteIdent(schema)}.refresh_search_index_for_location(entity.id);
        END LOOP;
        FOR entity IN SELECT id FROM ${quoteIdent(schema)}.practitioners ORDER BY id LOOP
            PERFORM ${quoteIdent(schema)}.refresh_search_index_for_practitioner(entity.id);
        END LOOP;
    END;
    $$;
  `);
  await pgClient.query(`
    CREATE OR REPLACE FUNCTION ${quoteIdent(schema)}.refresh_entity_tag_search_index_trigger()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
        IF TG_OP = 'DELETE' THEN
            IF OLD.entity_type = 'location' THEN
                PERFORM ${quoteIdent(schema)}.refresh_search_index_for_location(OLD.entity_id);
            ELSIF OLD.entity_type = 'practitioner' THEN
                PERFORM ${quoteIdent(schema)}.refresh_search_index_for_practitioner(OLD.entity_id);
            END IF;
            RETURN OLD;
        END IF;

        IF NEW.entity_type = 'location' THEN
            PERFORM ${quoteIdent(schema)}.refresh_search_index_for_location(NEW.entity_id);
        ELSIF NEW.entity_type = 'practitioner' THEN
            PERFORM ${quoteIdent(schema)}.refresh_search_index_for_practitioner(NEW.entity_id);
        END IF;
        RETURN NEW;
    END;
    $$;
  `);
}

async function acceptanceChecks(pgClient) {
  const result = await pgClient.query(`
    SELECT
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.documents) AS documents,
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.source_records WHERE entity_type = 'document') AS document_source_records,
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.search_index WHERE entity_type = 'document') AS document_search_rows,
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.search_index) AS search_index_total,
      (SELECT jsonb_object_agg(entity_type, count) FROM (SELECT entity_type, COUNT(*)::int AS count FROM ${quoteIdent(schema)}.search_index GROUP BY entity_type ORDER BY entity_type) x) AS search_index_by_type,
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.locations WHERE deleted_at IS NULL AND status = 'active' AND website ~* '(google\\.[^/]+/maps|maps\\.google\\.[^/]+).*place_id[:=][A-Za-z0-9_-]+') AS active_maps_place_id_websites,
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.search_index WHERE entity_type = 'document' AND search_text @@ plainto_tsquery('english', 'Koh Samui')) AS koh_samui_document_search_matches,
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.search_index WHERE search_text @@ plainto_tsquery('english', 'Koh Samui')) AS koh_samui_all_search_matches,
      (
        SELECT jsonb_agg(jsonb_build_object('entity_type', entity_type, 'entity_id', entity_id, 'name', name, 'locality', locality, 'country', country) ORDER BY entity_type, entity_id)
        FROM ${quoteIdent(schema)}.search_index
        WHERE search_text @@ plainto_tsquery('english', 'Koh Samui')
          AND entity_type <> 'document'
      ) AS koh_samui_non_document_matches,
      (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.locations WHERE id = ANY($1::int[]) AND status = 'hidden') AS named_hidden_locations,
      (SELECT to_regprocedure($2) IS NOT NULL) AS has_refresh_document_function,
      EXISTS (
        SELECT 1
        FROM information_schema.triggers
        WHERE trigger_schema = $3
          AND trigger_name = 'trg_refresh_document_search_index'
      ) AS has_document_refresh_trigger
  `, [HIDE_LOCATION_IDS, `${schema}.refresh_search_index_for_document(integer)`, schema]);
  return result.rows[0];
}

function duplicateOrgDomains(orgs) {
  const groups = new Map();
  for (const org of orgs) {
    const domain = normalizeWebsiteToRegistrableDomain(org.website_domain);
    if (!domain) {
      continue;
    }
    if (!groups.has(domain)) {
      groups.set(domain, []);
    }
    groups.get(domain).push({
      id: org.id,
      canonical_name: org.canonical_name,
      website_domain: org.website_domain,
    });
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([domain, rows]) => ({ domain, org_count: rows.length, orgs: rows.sort((a, b) => a.id - b.id) }))
    .sort((a, b) => b.org_count - a.org_count || a.domain.localeCompare(b.domain));
}

function backupTableNames() {
  return [
    `${rawSchema}.closeout_organizations_backup_${phaseDate}`,
    `${rawSchema}.closeout_locations_backup_${phaseDate}`,
    `${rawSchema}.closeout_source_records_org_backup_${phaseDate}`,
    `${rawSchema}.closeout_documents_backup_${phaseDate}`,
    `${rawSchema}.closeout_document_source_records_backup_${phaseDate}`,
    `${rawSchema}.closeout_document_search_index_backup_${phaseDate}`,
    `${rawSchema}.closeout_approved_website_matches_${phaseDate}`,
    `${rawSchema}.closeout_org_merges_${phaseDate}`,
    `${rawSchema}.closeout_duplicate_domain_review_${phaseDate}`,
    `${rawSchema}.closeout_hidden_locations_${phaseDate}`,
    `${rawSchema}.closeout_documents_deleted_${phaseDate}`,
  ];
}

function parseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function displayBrand(value) {
  return String(value || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+\|\s+.*$/, "")
    .replace(/\s+-\s+.*$/, "")
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

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
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
  if (COMMON_MULTI_LABEL_SUFFIXES.has(lastThree) && parts.length >= 4) {
    return parts.slice(-4).join(".");
  }
  return lastTwo;
}

function writeReports(report) {
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Closeout and Documents Removal Report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(markdownTable(["metric", "count"], Object.entries(report.summary)));
  lines.push("");
  lines.push("## Raw PDF Retention");
  lines.push("");
  lines.push(markdownTable(["source_slug", "listing_count", "field_count", "page_count"], report.raw_pdf_source_retention.map((row) => [row.source_slug, row.listing_count, row.field_count, row.page_count])));
  lines.push("");
  lines.push("## Approved Website Matches");
  lines.push("");
  lines.push(markdownTable(["location_id", "location_name", "domain", "new_website"], report.approved_website_matches.map((row) => [row.location_id, row.location_name, row.domain, row.new_website])));
  lines.push("");
  lines.push("## Merged Orgs");
  lines.push("");
  lines.push(markdownTable(["domain", "keeper_org_id", "loser_org_ids", "canonical_name", "reason"], report.merged_orgs.map((row) => [row.domain, row.keeper_org_id, row.loser_org_ids.join(", "), row.canonical_name, row.reason])));
  lines.push("");
  lines.push("## Duplicate Domains Flagged");
  lines.push("");
  lines.push(markdownTable(["domain", "org_count", "reason"], report.duplicate_domains_flagged_for_review.map((row) => [row.domain, row.org_count, row.reason])));
  lines.push("");
  lines.push("## Hidden Locations");
  lines.push("");
  lines.push(markdownTable(["location_id", "location_name", "reason"], report.hidden_locations.map((row) => [row.location_id, row.location_name, row.reason])));
  lines.push("");
  lines.push("## Acceptance");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.acceptance, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function markdownTable(headers, rows) {
  const safeRows = rows.length ? rows : [headers.map(() => "")];
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...safeRows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined))];
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
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
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
