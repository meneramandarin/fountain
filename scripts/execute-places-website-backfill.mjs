#!/usr/bin/env node

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
const inventoryOnly = Boolean(options.inventoryOnly);
const confirmOver50 = Boolean(options.confirmOver50);
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `places-website-backfill-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/places-website-backfill-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);
const checkpointPath = path.resolve(ROOT, options.checkpoint || `places-website-backfill-checkpoint-${phaseDate}.json`);
const costPerThousandUsd = 20;
const freeEnterpriseCallsEstimate = Number.parseInt(options.freeCalls || "1000", 10);
const maxCostWithoutConfirmationUsd = 50;
const rateLimitMs = Number.parseInt(options.rateLimitMs || "275", 10);
const apiKeyEnvNames = ["GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY"];
const PLACE_FIELD_MASK = "id,displayName,websiteUri,nationalPhoneNumber";
const COMMON_MULTI_LABEL_SUFFIXES = new Set([
  "ac.uk",
  "co.uk",
  "co.za",
  "co.kr",
  "com.au",
  "com.br",
  "com.mx",
  "com.sg",
  "com.tr",
  "net.au",
  "org.au",
  "org.uk",
]);
const MARKETPLACE_DOMAINS = new Set([
  "google.com",
  "facebook.com",
  "instagram.com",
  "yelp.com",
  "rymaps.xyz",
  "europepmc.org",
  "acuityscheduling.com",
  "as.me",
  "clientsecure.me",
  "glossgenius.com",
  "mindbodyonline.com",
  "myshopify.com",
  "onbuildhealth.com",
  "patientnow.com",
  "square.site",
  "squarespace.com",
  "vagaro.com",
  "webflow.io",
  "wixsite.com",
  "zenoti.com",
  "zoca.com",
]);
const IDENTITY_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "of",
  "the",
  "with",
  "clinic",
  "clinics",
  "center",
  "centers",
  "centre",
  "centres",
  "medical",
  "medicine",
  "wellness",
  "therapy",
  "therapies",
  "spa",
  "llc",
  "pllc",
  "pc",
  "md",
  "dr",
  "doctor",
  "health",
  "care",
  "group",
  "institute",
  "inc",
  "co",
  "company",
]);
const BRAND_STOPWORDS = new Set([
  ...IDENTITY_STOPWORDS,
  "primary",
  "physical",
  "occupational",
  "regenerative",
  "stem",
  "cell",
  "cells",
  "pain",
  "management",
  "hospital",
  "med",
  "new",
  "york",
  "city",
  "nyc",
  "usa",
]);
const GENERIC_BRAND_TOKENS = new Set([
  "advanced",
  "center",
  "clinic",
  "health",
  "medical",
  "medicine",
  "primary",
  "care",
  "doctor",
  "doctors",
  "regenerative",
  "stem",
  "cell",
  "therapy",
  "physical",
  "wellness",
  "institute",
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
  const preflight = await loadPreflight(client);
  const inventory = buildInventory(preflight);
  printInventory(inventory);

  if (inventory.estimated_api_cost_before_free_usd > maxCostWithoutConfirmationUsd && !confirmOver50) {
    throw new Error(
      `Estimated API cost is $${inventory.estimated_api_cost_before_free_usd.toFixed(2)} before free allowance. Re-run with --confirm-over-50 after approval.`,
    );
  }

  if (inventoryOnly) {
    const report = baseReport(inventory, [], null, preflight);
    writeReports(report);
    process.exit(0);
  }

  if (inventory.api_calls_required > 0 && !googleApiKey) {
    const report = baseReport(inventory, [], "Missing Google Places API key. Expected GOOGLE_PLACES_API_KEY, GOOGLE_MAPS_API_KEY, or GOOGLE_API_KEY.", preflight);
    writeReports(report);
    throw new Error(report.blocked_reason);
  }

  const fetched = await resolvePlaceDetails(inventory.apiFetchCandidates);
  const resolvedRows = [...inventory.cachedResolvedRows, ...fetched];
  const plan = buildPlan(preflight, resolvedRows);
  const report = await executePlan(client, preflight, plan, inventory, resolvedRows);
  writeReports(report);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadPreflight(pgClient) {
  const candidates = await pgClient.query(`
    SELECT id, org_id, status, name, address, locality, region, country_code, phone, website, slug
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
      AND status = 'active'
      AND website IS NOT NULL
    ORDER BY id
  `);
  const matches = await pgClient.query(`
    SELECT location_id, provider, provider_place_id, display_name, fetched_at, raw_json
    FROM ${quoteIdent(schema)}.external_place_matches
    WHERE provider IN ('google_places', 'google')
  `);
  const orgs = await pgClient.query(`
    SELECT id, canonical_name, website_domain, dedup_key, deleted_at
    FROM ${quoteIdent(schema)}.organizations
    ORDER BY id
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
        `locations_backup_${phaseDate}_places_website_backfill`,
        `organizations_backup_${phaseDate}_places_website_backfill`,
        `places_website_backfill_location_actions_${phaseDate}`,
        `places_website_backfill_org_map_${phaseDate}`,
        `places_website_backfill_new_orgs_${phaseDate}`,
        `places_website_backfill_guardrail_${phaseDate}`,
      ],
    ],
  );

  return {
    allWebsiteLocations: candidates.rows,
    matches: matches.rows,
    orgs: orgs.rows.map((org) => ({
      ...org,
      normalized_domain: normalizeWebsiteToRegistrableDomain(org.website_domain),
    })),
    existingTables: existingTables.rows.map((row) => row.table_name),
  };
}

function buildInventory(preflight) {
  const placeIdCandidates = preflight.allWebsiteLocations
    .map((location) => ({
      ...location,
      place_id: extractPlaceId(location.website),
    }))
    .filter((location) => location.place_id);

  const matchesByLocationAndPlace = new Map();
  for (const match of preflight.matches) {
    matchesByLocationAndPlace.set(`${match.location_id}:${match.provider_place_id}`, match);
  }

  const cachedResolvedRows = [];
  const apiFetchCandidates = [];
  for (const candidate of placeIdCandidates) {
    const cached = matchesByLocationAndPlace.get(`${candidate.id}:${candidate.place_id}`);
    const cachedPayload = cached ? parsePlacePayload(cached.raw_json) : null;
    if (cachedPayload?.websiteUri) {
      cachedResolvedRows.push({
        location: candidate,
        place_id: candidate.place_id,
        source: "cache",
        payload: cachedPayload,
        error: null,
      });
    } else {
      apiFetchCandidates.push(candidate);
    }
  }

  const rymapsLocations = preflight.allWebsiteLocations.filter((location) => {
    const domain = normalizeWebsiteToRegistrableDomain(location.website);
    return domain === "rymaps.xyz";
  });
  const estimatedBeforeFree = (apiFetchCandidates.length / 1000) * costPerThousandUsd;
  const billableAfterFree = Math.max(0, apiFetchCandidates.length - freeEnterpriseCallsEstimate);
  const estimatedAfterFree = (billableAfterFree / 1000) * costPerThousandUsd;

  return {
    candidates: placeIdCandidates.length,
    cached_hits_with_website: cachedResolvedRows.length,
    api_calls_required: apiFetchCandidates.length,
    estimated_api_cost_before_free_usd: roundMoney(estimatedBeforeFree),
    estimated_api_cost_after_free_allowance_usd: roundMoney(estimatedAfterFree),
    free_enterprise_calls_estimate: freeEnterpriseCallsEstimate,
    rymaps_locations_to_null: rymapsLocations.length,
    cachedResolvedRows,
    apiFetchCandidates,
    rymapsLocations,
  };
}

async function resolvePlaceDetails(candidates) {
  if (!candidates.length) {
    return [];
  }
  const checkpoint = readCheckpoint();
  const rows = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const checkpointKey = `${candidate.id}:${candidate.place_id}`;
    if (checkpoint[checkpointKey]) {
      rows.push({
        location: candidate,
        place_id: candidate.place_id,
        source: "checkpoint",
        payload: checkpoint[checkpointKey].payload || null,
        error: checkpoint[checkpointKey].error || null,
      });
      continue;
    }

    const result = await fetchPlaceDetails(candidate.place_id);
    checkpoint[checkpointKey] = {
      location_id: candidate.id,
      place_id: candidate.place_id,
      fetched_at: new Date().toISOString(),
      payload: result.payload,
      error: result.error,
    };
    writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    rows.push({
      location: candidate,
      place_id: candidate.place_id,
      source: "api",
      payload: result.payload,
      error: result.error,
    });
    if ((index + 1) % 25 === 0 || index + 1 === candidates.length) {
      console.log(`Fetched/checkpointed ${index + 1}/${candidates.length} place details`);
    }
    await sleep(rateLimitMs);
  }
  return rows;
}

async function fetchPlaceDetails(placeId) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": googleApiKey,
          "X-Goog-FieldMask": PLACE_FIELD_MASK,
        },
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (response.ok) {
        return { payload, error: null };
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await sleep(750 * Math.pow(2, attempt));
        continue;
      }
      return {
        payload: null,
        error: {
          status: response.status,
          message: payload?.error?.message || response.statusText,
          raw: payload,
        },
      };
    } catch (error) {
      if (attempt < 3) {
        await sleep(750 * Math.pow(2, attempt));
        continue;
      }
      return { payload: null, error: { message: error.message } };
    }
  }
  return { payload: null, error: { message: "unreachable_fetch_retry_state" } };
}

function buildPlan(preflight, resolvedRows) {
  const resultRows = [];
  const matchedWebsiteRows = [];
  const noWebsiteRows = [];
  const mismatchRows = [];
  const fetchErrorRows = [];

  for (const row of resolvedRows) {
    if (row.error) {
      fetchErrorRows.push({
        location_id: row.location.id,
        location_name: row.location.name,
        place_id: row.place_id,
        error: row.error,
      });
      resultRows.push({ ...row, action: "FETCH_ERROR", verified: false });
      continue;
    }
    const displayName = extractDisplayName(row.payload);
    const website = sanitizeUrl(row.payload?.websiteUri);
    const phone = row.payload?.nationalPhoneNumber || null;
    if (!website) {
      const planned = { ...row, action: "NO_WEBSITE", verified: true, display_name: displayName, website: null, phone };
      noWebsiteRows.push(planned);
      resultRows.push(planned);
      continue;
    }
    const verification = verifyIdentity(row.location, displayName);
    if (!verification.match) {
      const planned = { ...row, action: "MISMATCH", verified: false, display_name: displayName, website, phone, verification };
      mismatchRows.push(planned);
      resultRows.push(planned);
      continue;
    }
    const domain = normalizeWebsiteToRegistrableDomain(website);
    const planned = { ...row, action: "MATCH", verified: true, display_name: displayName, website, phone, domain, verification };
    matchedWebsiteRows.push(planned);
    resultRows.push(planned);
  }

  const orgPlan = buildOrgPlan(preflight, matchedWebsiteRows);

  return {
    resultRows,
    matchedWebsiteRows,
    noWebsiteRows,
    mismatchRows,
    fetchErrorRows,
    ...orgPlan,
  };
}

function buildOrgPlan(preflight, matchedWebsiteRows) {
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
  for (const row of matchedWebsiteRows) {
    if (!row.domain || MARKETPLACE_DOMAINS.has(row.domain)) {
      orgGuardrailRows.push(orgGuardrail(row, "non_clinic_or_marketplace_domain"));
      continue;
    }
    const matchingOrgs = existingOrgsByDomain.get(row.domain) || [];
    if (matchingOrgs.length === 1) {
      const target = matchingOrgs[0];
      if (row.location.org_id !== target.id) {
        relinkRows.push({
          location_id: row.location.id,
          location_name: row.location.name,
          old_org_id: row.location.org_id,
          new_org_id: target.id,
          old_org_name: null,
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
    newOrgCandidates.push(row);
  }

  const newOrgGroups = [];
  const grouped = groupBy(newOrgCandidates, "domain");
  for (const [domain, rows] of grouped.entries()) {
    if (existingDedupKeys.has(domain)) {
      orgGuardrailRows.push(...rows.map((row) => orgGuardrail(row, "dedup_key_already_exists")));
      continue;
    }
    const brand = deriveBrand(rows.map((row) => ({ location_name: row.location.name })), domain);
    if (!brand.safe) {
      orgGuardrailRows.push(...rows.map((row) => orgGuardrail(row, brand.reason, brand)));
      continue;
    }
    newOrgGroups.push({
      domain,
      canonical_name: brand.canonical_name,
      name_normalized: normalizeNameForDb(brand.canonical_name),
      dedup_key: domain,
      rows: rows.map((row) => ({
        location_id: row.location.id,
        location_name: row.location.name,
        old_org_id: row.location.org_id,
        domain,
      })),
      brand_evidence: brand,
    });
  }

  return {
    relinkRows,
    newOrgGroups,
    orgGuardrailRows,
  };
}

async function executePlan(pgClient, preflight, plan, inventory, resolvedRows) {
  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`SET LOCAL search_path TO ${quoteIdent(schema)}, public`);
    await ensureBackupAndReportTables(pgClient);

    await insertLocationActionRows(pgClient, plan, resolvedRows);
    await nullRymapsLocations(pgClient, inventory.rymapsLocations);
    await writeExternalPlaceMatches(pgClient, plan.resultRows);
    await applyLocationWebsiteWrites(pgClient, plan);
    const newOrgResults = await applyOrgWrites(pgClient, plan);
    await insertOrgReportRows(pgClient, plan, newOrgResults);

    const affectedLocationIds = unique([
      ...plan.matchedWebsiteRows.map((row) => row.location.id),
      ...plan.noWebsiteRows.map((row) => row.location.id),
      ...inventory.rymapsLocations.map((row) => row.id),
      ...plan.relinkRows.map((row) => row.location_id),
      ...plan.newOrgGroups.flatMap((group) => group.rows.map((row) => row.location_id)),
    ]);
    if (affectedLocationIds.length) {
      await pgClient.query(
        `SELECT ${quoteIdent(schema)}.refresh_search_index_for_location(location_id) FROM unnest($1::int[]) AS location_id`,
        [affectedLocationIds],
      );
    }

    const acceptance = await acceptanceChecks(pgClient, plan, newOrgResults);
    if (dryRun) {
      await pgClient.query("ROLLBACK");
    } else {
      await pgClient.query("COMMIT");
    }

    return {
      generated_at: new Date().toISOString(),
      mode: dryRun ? "DRY_RUN_ROLLED_BACK" : "EXECUTED",
      prompt: "docs/places-website-backfill-prompt.md",
      field_mask: PLACE_FIELD_MASK,
      inventory: publicInventory(inventory),
      backup_tables: dryRun
        ? []
        : [
            `${rawSchema}.locations_backup_${phaseDate}_places_website_backfill`,
            `${rawSchema}.organizations_backup_${phaseDate}_places_website_backfill`,
            `${rawSchema}.places_website_backfill_location_actions_${phaseDate}`,
            `${rawSchema}.places_website_backfill_org_map_${phaseDate}`,
            `${rawSchema}.places_website_backfill_new_orgs_${phaseDate}`,
            `${rawSchema}.places_website_backfill_guardrail_${phaseDate}`,
          ],
      summary: {
        candidates: inventory.candidates,
        cached_hits: inventory.cached_hits_with_website,
        api_calls_made: resolvedRows.filter((row) => row.source === "api").length,
        matches_written: plan.matchedWebsiteRows.length,
        mismatches_flagged: plan.mismatchRows.length,
        no_website: plan.noWebsiteRows.length,
        fetch_errors: plan.fetchErrorRows.length,
        rymaps_nulled: inventory.rymapsLocations.length,
        relinked: plan.relinkRows.length,
        new_orgs_created: newOrgResults.length,
        new_org_locations: newOrgResults.reduce((sum, org) => sum + org.location_count, 0),
        org_guardrail: plan.orgGuardrailRows.length,
        refreshed_locations: affectedLocationIds.length,
        estimated_api_cost_before_free_usd: inventory.estimated_api_cost_before_free_usd,
        estimated_api_cost_after_free_allowance_usd: inventory.estimated_api_cost_after_free_allowance_usd,
      },
      mismatches: plan.mismatchRows.map(reportResultRow),
      no_website: plan.noWebsiteRows.map(reportResultRow),
      fetch_errors: plan.fetchErrorRows,
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

async function ensureBackupAndReportTables(pgClient) {
  if (preexistingRawTablesGuardNeeded()) {
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
          `locations_backup_${phaseDate}_places_website_backfill`,
          `organizations_backup_${phaseDate}_places_website_backfill`,
          `places_website_backfill_location_actions_${phaseDate}`,
          `places_website_backfill_org_map_${phaseDate}`,
          `places_website_backfill_new_orgs_${phaseDate}`,
          `places_website_backfill_guardrail_${phaseDate}`,
        ],
      ],
    );
    if (existing.rowCount) {
      throw new Error(`Refusing to run because Places backfill tables already exist: ${existing.rows.map((row) => row.table_name).join(", ")}`);
    }
  }
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`locations_backup_${phaseDate}_places_website_backfill`)} AS
    SELECT * FROM ${quoteIdent(schema)}.locations
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`organizations_backup_${phaseDate}_places_website_backfill`)} AS
    SELECT * FROM ${quoteIdent(schema)}.organizations
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`places_website_backfill_location_actions_${phaseDate}`)} (
      location_id integer NOT NULL,
      place_id text,
      action text NOT NULL,
      old_website text,
      new_website text,
      old_phone text,
      new_phone text,
      api_display_name text,
      verification jsonb,
      raw_payload jsonb,
      error jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`places_website_backfill_org_map_${phaseDate}`)} (
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
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`places_website_backfill_new_orgs_${phaseDate}`)} (
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
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`places_website_backfill_guardrail_${phaseDate}`)} (
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

function preexistingRawTablesGuardNeeded() {
  return !dryRun;
}

async function insertLocationActionRows(pgClient, plan) {
  const rows = plan.resultRows.map((row) => ({
    location_id: row.location.id,
    place_id: row.place_id,
    action: row.action,
    old_website: row.location.website,
    new_website: row.action === "MATCH" ? row.website : row.action === "NO_WEBSITE" ? null : row.location.website,
    old_phone: row.location.phone,
    new_phone: row.action === "MATCH" && !row.location.phone && row.phone ? row.phone : row.location.phone,
    api_display_name: row.display_name || null,
    verification: row.verification || null,
    raw_payload: row.payload || null,
    error: row.error || null,
  }));
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`places_website_backfill_location_actions_${phaseDate}`)} (
      location_id,
      place_id,
      action,
      old_website,
      new_website,
      old_phone,
      new_phone,
      api_display_name,
      verification,
      raw_payload,
      error
    )
    SELECT location_id, place_id, action, old_website, new_website, old_phone, new_phone, api_display_name, verification, raw_payload, error
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      place_id text,
      action text,
      old_website text,
      new_website text,
      old_phone text,
      new_phone text,
      api_display_name text,
      verification jsonb,
      raw_payload jsonb,
      error jsonb
    )
    `,
    [JSON.stringify(rows)],
  );
}

async function nullRymapsLocations(pgClient, rows) {
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations
    SET website = NULL
    WHERE id = ANY($1::int[])
    `,
    [rows.map((row) => row.id)],
  );
}

async function writeExternalPlaceMatches(pgClient, rows) {
  const payload = rows
    .filter((row) => row.payload)
    .map((row) => ({
      location_id: row.location.id,
      provider: "google_places",
      provider_place_id: row.place_id,
      provider_url: `https://www.google.com/maps/place/?q=place_id:${row.place_id}`,
      display_name: row.display_name || extractDisplayName(row.payload),
      match_confidence: row.verification?.score ?? null,
      match_status: row.action.toLowerCase(),
      fetched_at: new Date().toISOString(),
      raw_json: JSON.stringify(row.payload),
    }));
  if (!payload.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(schema)}.external_place_matches (
      location_id,
      provider,
      provider_place_id,
      provider_url,
      display_name,
      match_confidence,
      match_status,
      fetched_at,
      raw_json
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
    [JSON.stringify(payload)],
  );
}

async function applyLocationWebsiteWrites(pgClient, plan) {
  const matchedPayload = plan.matchedWebsiteRows.map((row) => ({
    id: row.location.id,
    website: row.website,
    phone: row.location.phone ? row.location.phone : row.phone,
  }));
  if (matchedPayload.length) {
    await pgClient.query(
      `
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(id integer, website text, phone text)
      )
      UPDATE ${quoteIdent(schema)}.locations l
      SET website = input.website,
          phone = input.phone
      FROM input
      WHERE l.id = input.id
      `,
      [JSON.stringify(matchedPayload)],
    );
  }
  if (plan.noWebsiteRows.length) {
    await pgClient.query(
      `
      UPDATE ${quoteIdent(schema)}.locations
      SET website = NULL
      WHERE id = ANY($1::int[])
      `,
      [plan.noWebsiteRows.map((row) => row.location.id)],
    );
  }
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
        canonical_name,
        name_normalized,
        website_domain,
        dedup_key,
        data_origin,
        verification_status
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
      return group.rows.map((row) => ({
        ...row,
        new_org_id: org.org_id,
        action: "NEW_ORG",
      }));
    }),
  ];

  if (mapRows.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`places_website_backfill_org_map_${phaseDate}`)} (
        location_id,
        old_org_id,
        new_org_id,
        action,
        domain,
        detail
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
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(`places_website_backfill_org_map_${phaseDate}`)} m
      WHERE l.id = m.location_id
        AND m.action IN ('RELINK', 'NEW_ORG')
    `);
  }

  return newOrgResults;
}

async function insertOrgReportRows(pgClient, plan, newOrgResults) {
  if (newOrgResults.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`places_website_backfill_new_orgs_${phaseDate}`)} (
        org_id,
        canonical_name,
        website_domain,
        dedup_key,
        location_count,
        location_ids,
        brand_evidence
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
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`places_website_backfill_guardrail_${phaseDate}`)} (
        location_id,
        location_name,
        location_domain,
        old_org_id,
        reason,
        evidence
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

async function acceptanceChecks(pgClient, plan, newOrgResults) {
  const mapsRemaining = await pgClient.query(
    `
    SELECT id, name, website
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
      AND status = 'active'
      AND website IS NOT NULL
      AND website ~* $1
    ORDER BY id
    `,
    [placeIdUrlRegex().source],
  );
  const elitra = await pgClient.query(`
    SELECT l.id, l.name, l.website, l.org_id, org.canonical_name AS org_name, org.website_domain AS org_domain
    FROM ${quoteIdent(schema)}.locations l
    LEFT JOIN ${quoteIdent(schema)}.organizations org ON org.id = l.org_id
    WHERE l.id = 8
  `);
  const newOrgDomainConflicts = newOrgResults.length
    ? await pgClient.query(
        `
        WITH created AS (
          SELECT UNNEST($1::int[]) AS org_id, UNNEST($2::text[]) AS domain
        )
        SELECT c.org_id, c.domain, other.id AS other_org_id, other.canonical_name AS other_org_name
        FROM created c
        JOIN ${quoteIdent(schema)}.organizations other
          ON other.id <> c.org_id
         AND other.deleted_at IS NULL
         AND lower(regexp_replace(regexp_replace(COALESCE(other.website_domain, ''), '^https?://', ''), '^www\\d?\\.', '')) = c.domain
        ORDER BY c.domain, other.id
        `,
        [
          newOrgResults.map((org) => org.org_id),
          newOrgResults.map((org) => org.website_domain),
        ],
      )
    : { rows: [] };

  return {
    active_maps_place_id_remaining_count: mapsRemaining.rowCount,
    active_maps_place_id_remaining_sample: mapsRemaining.rows.slice(0, 50),
    remaining_explained_by_mismatch_or_fetch_error: mapsRemaining.rows.every((row) => {
      const flaggedIds = new Set([
        ...plan.mismatchRows.map((candidate) => candidate.location.id),
        ...plan.fetchErrorRows.map((candidate) => candidate.location_id),
      ]);
      return flaggedIds.has(row.id);
    }),
    elitra_health_location_8: elitra.rows[0] || null,
    new_org_domain_conflicts: newOrgDomainConflicts.rows,
  };
}

function verifyIdentity(location, displayName) {
  const locationTokens = identityTokens(location.name, location);
  const displayTokens = identityTokens(displayName, location);
  const overlap = [...locationTokens].filter((token) => displayTokens.has(token));
  const minTokenCount = Math.min(locationTokens.size, displayTokens.size);
  const score = minTokenCount ? overlap.length / minTokenCount : 0;
  const comparableLocation = comparableName(location.name);
  const comparableDisplay = comparableName(displayName);
  const substringMatch =
    comparableLocation &&
    comparableDisplay &&
    (comparableLocation.includes(comparableDisplay) || comparableDisplay.includes(comparableLocation));
  const match = Boolean(substringMatch || (overlap.length >= 1 && score >= 0.5));
  return {
    match,
    score,
    overlap,
    location_tokens: [...locationTokens],
    display_tokens: [...displayTokens],
    substring_match: Boolean(substringMatch),
  };
}

function identityTokens(value, location) {
  const locationWords = new Set(
    [location?.locality, location?.region, location?.country_code]
      .filter(Boolean)
      .flatMap((part) => normalizeNameForDb(part).split(/\s+/))
      .filter(Boolean),
  );
  return new Set(
    stripDiacritics(String(value || ""))
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .filter((token) => !IDENTITY_STOPWORDS.has(token))
      .filter((token) => !locationWords.has(token)),
  );
}

function extractPlaceId(value) {
  const text = String(value || "");
  if (!placeIdUrlRegex().test(text)) {
    return null;
  }
  const decoded = safeDecodeURIComponent(text);
  const match = decoded.match(/place_id[:=]([A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
}

function placeIdUrlRegex() {
  return /(?:google\.[^/]+\/maps|maps\.google\.[^/]+).*place_id[:=][A-Za-z0-9_-]+/i;
}

function parsePlacePayload(rawJson) {
  if (!rawJson) {
    return null;
  }
  try {
    const payload = JSON.parse(rawJson);
    if (payload?.websiteUri || payload?.website_uri || payload?.website) {
      return {
        ...payload,
        websiteUri: payload.websiteUri || payload.website_uri || payload.website,
      };
    }
    return payload;
  } catch {
    return null;
  }
}

function extractDisplayName(payload) {
  return payload?.displayName?.text || payload?.displayName || payload?.name || null;
}

function orgGuardrail(row, reason, evidence = {}) {
  return {
    location_id: row.location.id,
    location_name: row.location.name,
    location_domain: row.domain || normalizeWebsiteToRegistrableDomain(row.website),
    old_org_id: row.location.org_id,
    reason,
    evidence,
  };
}

function deriveBrand(rows, domain) {
  if (domain === "flt.life") {
    return {
      safe: false,
      reason: "known_mixed_brand_domain_flt_life",
      distinct_names: distinctPreparedNames(rows),
    };
  }
  if (rows.length === 1) {
    const canonicalName = displayBrand(rows[0].location_name);
    return {
      safe: true,
      reason: "single_location_domain",
      canonical_name: canonicalName,
      distinct_names: distinctPreparedNames(rows),
    };
  }

  const distinctNames = distinctPreparedNames(rows);
  if (distinctNames.length === 1) {
    return {
      safe: true,
      reason: "all_location_names_match_after_suffix_stripping",
      canonical_name: distinctNames[0],
      distinct_names: distinctNames,
    };
  }

  const tokenSets = rows.map((row) => significantTokens(row.location_name));
  const commonTokens = [...tokenSets[0]].filter((token) => tokenSets.every((set) => set.has(token)));
  const domainTokens = significantDomainTokens(domain);
  const commonDomainTokens = commonTokens.filter((token) => domainTokens.has(token));
  const usableCommonTokens = commonTokens.filter((token) => !GENERIC_BRAND_TOKENS.has(token));

  if (usableCommonTokens.length || commonDomainTokens.length) {
    const canonicalName = shortestNameWithToken(rows, usableCommonTokens[0] || commonDomainTokens[0]);
    return {
      safe: true,
      reason: "shared_non_generic_brand_token",
      canonical_name: canonicalName,
      distinct_names: distinctNames,
      common_tokens: commonTokens,
      domain_tokens: [...domainTokens],
    };
  }

  return {
    safe: false,
    reason: "no_shared_obvious_brand_token",
    distinct_names: distinctNames,
    common_tokens: commonTokens,
    domain_tokens: [...domainTokens],
  };
}

function distinctPreparedNames(rows) {
  return unique(rows.map((row) => displayBrand(row.location_name)).filter(Boolean));
}

function shortestNameWithToken(rows, token) {
  const names = distinctPreparedNames(rows);
  const matching = names.filter((name) => significantTokens(name).has(token));
  return (matching.length ? matching : names).sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}

function displayBrand(value) {
  let text = String(value || "").trim();
  text = text.replace(/\s*\([^)]*\)\s*/g, " ");
  text = text.replace(/\s+\|\s+.*$/, "");
  text = text.replace(/\s+-\s+[A-Za-z .'-]+,\s*(?:[A-Z]{2}|[A-Za-z ]+)$/u, "");
  text = text.replace(/\s+[–—-]\s+[A-Za-z .'-]+,\s*(?:[A-Z]{2}|[A-Za-z ]+)$/u, "");
  text = text.replace(/\s+[–—-]\s+(?:New York City|New York|Brooklyn|Austin|Tampa|Denver|Atlanta|Chicago|Boston|Miami|Dallas|Houston|Phoenix|Scottsdale|Jacksonville|London|Prague|Paris|Rome|Berlin)$/iu, "");
  text = text.replace(/\s+/g, " ").trim();
  return text || String(value || "").trim();
}

function comparableName(value) {
  return stripDiacritics(displayBrand(value))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(clinic|medical|center|centre|pc|pllc|llc|inc|the|health|wellness|spa|md)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value) {
  const tokens = stripDiacritics(displayBrand(value))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !BRAND_STOPWORDS.has(token));
  return new Set(tokens);
}

function significantDomainTokens(domain) {
  const sld = String(domain || "").split(".")[0] || "";
  const tokens = sld
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !BRAND_STOPWORDS.has(token));
  if (sld.length >= 3 && !BRAND_STOPWORDS.has(sld.toLowerCase())) {
    tokens.push(sld.toLowerCase());
  }
  return new Set(tokens);
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
  return lastTwo;
}

function reportResultRow(row) {
  return {
    location_id: row.location.id,
    location_name: row.location.name,
    locality: row.location.locality,
    region: row.location.region,
    place_id: row.place_id,
    api_display_name: row.display_name,
    returned_website: row.website,
    verification: row.verification,
  };
}

function baseReport(inventory, resolvedRows, blockedReason, preflight) {
  return {
    generated_at: new Date().toISOString(),
    mode: blockedReason ? "BLOCKED" : "INVENTORY_ONLY",
    prompt: "docs/places-website-backfill-prompt.md",
    blocked_reason: blockedReason,
    field_mask: PLACE_FIELD_MASK,
    inventory: publicInventory(inventory),
    summary: {
      candidates: inventory.candidates,
      cached_hits: inventory.cached_hits_with_website,
      api_calls_required: inventory.api_calls_required,
      estimated_api_cost_before_free_usd: inventory.estimated_api_cost_before_free_usd,
      estimated_api_cost_after_free_allowance_usd: inventory.estimated_api_cost_after_free_allowance_usd,
      rymaps_locations_to_null: inventory.rymaps_locations_to_null,
      existing_places_raw_tables: preflight.existingTables,
      resolved_rows: resolvedRows.length,
    },
  };
}

function publicInventory(inventory) {
  return {
    candidates: inventory.candidates,
    cached_hits_with_website: inventory.cached_hits_with_website,
    api_calls_required: inventory.api_calls_required,
    estimated_api_cost_before_free_usd: inventory.estimated_api_cost_before_free_usd,
    estimated_api_cost_after_free_allowance_usd: inventory.estimated_api_cost_after_free_allowance_usd,
    free_enterprise_calls_estimate: inventory.free_enterprise_calls_estimate,
    rymaps_locations_to_null: inventory.rymaps_locations_to_null,
  };
}

function printInventory(inventory) {
  console.log(
    `Inventory: ${inventory.candidates} candidates, ${inventory.cached_hits_with_website} cached website hits, ${inventory.api_calls_required} API calls required.`,
  );
  console.log(
    `Estimated cost: $${inventory.estimated_api_cost_before_free_usd.toFixed(2)} before free allowance, $${inventory.estimated_api_cost_after_free_allowance_usd.toFixed(2)} after ${inventory.free_enterprise_calls_estimate} estimated free calls.`,
  );
}

function writeReports(report) {
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
  console.log(`Wrote ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, reportMdPath)}`);
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Places Website Backfill Report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Field mask: \`${report.field_mask}\``);
  if (report.blocked_reason) {
    lines.push(`Blocked: ${report.blocked_reason}`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(markdownTable(["metric", "count"], Object.entries(report.summary || {})));
  lines.push("");
  lines.push("## Inventory");
  lines.push("");
  lines.push(markdownTable(["metric", "value"], Object.entries(report.inventory || {})));
  if (report.backup_tables?.length) {
    lines.push("");
    lines.push("## Backup and Audit Tables");
    lines.push("");
    for (const table of report.backup_tables) {
      lines.push(`- ${table}`);
    }
  }
  if (report.mismatches?.length) {
    lines.push("");
    lines.push("## Mismatches");
    lines.push("");
    lines.push(
      markdownTable(
        ["location_id", "location_name", "api_display_name", "returned_website", "score"],
        report.mismatches.map((row) => [
          row.location_id,
          row.location_name,
          row.api_display_name || "",
          row.returned_website || "",
          row.verification?.score ?? "",
        ]),
      ),
    );
  }
  if (report.no_website?.length) {
    lines.push("");
    lines.push("## No Website Returned");
    lines.push("");
    lines.push(
      markdownTable(
        ["location_id", "location_name", "api_display_name"],
        report.no_website.map((row) => [row.location_id, row.location_name, row.api_display_name || ""]),
      ),
    );
  }
  if (report.new_orgs_created?.length) {
    lines.push("");
    lines.push("## New Orgs Created");
    lines.push("");
    lines.push(
      markdownTable(
        ["org_id", "canonical_name", "website_domain", "locations"],
        report.new_orgs_created.map((row) => [row.org_id, row.canonical_name, row.website_domain, row.location_count]),
      ),
    );
  }
  if (report.org_guardrail?.length) {
    lines.push("");
    lines.push("## Org Guardrail");
    lines.push("");
    lines.push(
      markdownTable(
        ["location_id", "location_name", "domain", "reason"],
        report.org_guardrail.map((row) => [row.location_id, row.location_name, row.location_domain, row.reason]),
      ),
    );
  }
  if (report.acceptance) {
    lines.push("");
    lines.push("## Acceptance");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(report.acceptance, null, 2));
    lines.push("```");
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function markdownTable(headers, rows) {
  const safeRows = rows.length ? rows : [["", ""]];
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...safeRows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function readCheckpoint() {
  if (!existsSync(checkpointPath)) {
    return {};
  }
  return JSON.parse(readFileSync(checkpointPath, "utf8"));
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

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--inventory-only") {
      parsed.inventoryOnly = true;
    } else if (arg === "--confirm-over-50") {
      parsed.confirmOver50 = true;
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
    } else if (arg === "--json-out") {
      parsed.jsonOut = args[++index];
    } else if (arg === "--md-out") {
      parsed.mdOut = args[++index];
    } else if (arg === "--checkpoint") {
      parsed.checkpoint = args[++index];
    } else if (arg === "--free-calls") {
      parsed.freeCalls = args[++index];
    } else if (arg === "--rate-limit-ms") {
      parsed.rateLimitMs = args[++index];
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
