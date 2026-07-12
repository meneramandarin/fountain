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
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const dryRun = Boolean(options.dryRun);
const inventoryOnly = Boolean(options.inventoryOnly);
const reportJsonPath = path.resolve(
  ROOT,
  options.jsonOut || `bookimed-website-backfill-report-${phaseDate}${inventoryOnly ? ".inventory" : dryRun ? ".dry-run" : ""}.json`,
);
const reportMdPath = path.resolve(
  ROOT,
  options.mdOut || `docs/bookimed-website-backfill-report-${phaseDate}${inventoryOnly ? ".inventory" : dryRun ? ".dry-run" : ""}.md`,
);
const checkpointPath = path.resolve(ROOT, options.checkpoint || `bookimed-website-backfill-checkpoint-${phaseDate}.json`);
const costPerThousandUsd = 20;
const freeEnterpriseCallsEstimate = Number.parseInt(options.freeCalls || "1000", 10);
const maxCostWithoutConfirmationUsd = 50;
const rateLimitMs = Number.parseInt(options.rateLimitMs || "275", 10);
const bookimedRateLimitMs = Number.parseInt(options.bookimedRateLimitMs || "550", 10);
const apiKeyEnvNames = ["GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY"];
const PLACE_FIELD_MASK = "id,displayName,websiteUri,nationalPhoneNumber";
const TEXT_SEARCH_FIELD_MASK = "places.id";
const BOOKIMED_SQL_REGEX = "(^https?://)?([^/]*\\.)?bookimed\\.com([/:?#]|$)";
const COMMON_MULTI_LABEL_SUFFIXES = new Set([
  "ac.uk",
  "co.uk",
  "co.za",
  "co.kr",
  "co.in",
  "co.nz",
  "co.th",
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
  "net.au",
  "or.th",
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
  "doctors",
  "health",
  "care",
  "group",
  "institute",
  "inc",
  "co",
  "company",
  "hospital",
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

  if (inventory.estimated_api_cost_before_free_usd > maxCostWithoutConfirmationUsd && !options.confirmOver50) {
    throw new Error(
      `Estimated API cost is $${inventory.estimated_api_cost_before_free_usd.toFixed(2)} before free allowance. Re-run with --confirm-over-50 after approval.`,
    );
  }

  if (inventoryOnly) {
    const report = buildReport(inventory, preflight, null);
    writeReports(report);
    process.exit(0);
  }

  if ((inventory.place_details_calls_estimate > 0 || inventory.text_search_id_only_calls_estimate > 0) && !googleApiKey) {
    const blockedReason = "Missing Google Places API key. Expected GOOGLE_PLACES_API_KEY, GOOGLE_MAPS_API_KEY, or GOOGLE_API_KEY.";
    const report = buildReport(inventory, preflight, blockedReason);
    writeReports(report);
    throw new Error(blockedReason);
  }

  const placeRows = await resolvePlaceIds(inventory);
  const detailRows = await resolvePlaceDetails(placeRows);
  const plan = buildPlan(preflight, detailRows);
  const report = await executePlan(client, preflight, plan, inventory, placeRows, detailRows);
  writeReports(report);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadPreflight(pgClient) {
  const locationsResult = await pgClient.query(
    `
    SELECT id, org_id, status, name, address, locality, region, country_code, phone, website, slug
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
      AND status = 'active'
      AND website IS NOT NULL
      AND website ~* $1
    ORDER BY id
    `,
    [BOOKIMED_SQL_REGEX],
  );
  const locationIds = locationsResult.rows.map((row) => row.id);

  const matchesResult = locationIds.length
    ? await pgClient.query(
        `
        SELECT location_id, provider, provider_place_id, provider_url, display_name, rating, review_count, match_status, fetched_at, raw_json
        FROM ${quoteIdent(schema)}.external_place_matches
        WHERE location_id = ANY($1::int[])
          AND provider IN ('google_places', 'google')
        ORDER BY location_id, provider
        `,
        [locationIds],
      )
    : { rows: [] };

  const sourceRecordsResult = locationIds.length
    ? await pgClient.query(
        `
        SELECT sr.entity_id AS location_id, s.slug AS source_slug, sr.source_listing_id, sr.source_url, sl.source_url AS raw_source_url
        FROM ${quoteIdent(schema)}.source_records sr
        JOIN ${quoteIdent(schema)}.sources s ON s.id = sr.source_id
        LEFT JOIN ${quoteIdent(rawSchema)}.source_listings sl
          ON sl.source_slug = s.slug
         AND sl.source_listing_id = sr.source_listing_id
        WHERE sr.entity_type = 'location'
          AND sr.entity_id = ANY($1::int[])
          AND s.slug LIKE 'bookimed%'
        ORDER BY sr.entity_id, s.slug, sr.source_listing_id
        `,
        [locationIds],
      )
    : { rows: [] };

  const orgsResult = await pgClient.query(`
    SELECT id, canonical_name, website_domain, dedup_key, deleted_at
    FROM ${quoteIdent(schema)}.organizations
    ORDER BY id
  `);

  const existingTablesResult = await pgClient.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_name = ANY($2::text[])
    ORDER BY table_name
    `,
    [
      rawSchema,
      [
        `locations_backup_${phaseDate}_bookimed_website_backfill`,
        `organizations_backup_${phaseDate}_bookimed_website_backfill`,
        `bookimed_website_backfill_location_actions_${phaseDate}`,
        `bookimed_website_backfill_org_map_${phaseDate}`,
        `bookimed_website_backfill_new_orgs_${phaseDate}`,
        `bookimed_website_backfill_guardrail_${phaseDate}`,
      ],
    ],
  );

  const maxVaishaliResult = await pgClient.query(`
    SELECT l.id, l.slug, l.name, l.website, l.org_id, org.canonical_name AS org_name, org.website_domain AS org_domain,
           epm.provider, epm.provider_place_id, epm.rating, epm.review_count
    FROM ${quoteIdent(schema)}.locations l
    LEFT JOIN ${quoteIdent(schema)}.organizations org ON org.id = l.org_id
    LEFT JOIN ${quoteIdent(schema)}.external_place_matches epm
      ON epm.location_id = l.id
     AND epm.provider IN ('google_places', 'google')
    WHERE l.slug = 'max-vaishali-ghaziabad'
    ORDER BY epm.provider
  `);

  return {
    locations: locationsResult.rows,
    matches: matchesResult.rows,
    sourceRecords: sourceRecordsResult.rows,
    orgs: orgsResult.rows.map((org) => ({
      ...org,
      normalized_domain: normalizeWebsiteToRegistrableDomain(org.website_domain),
    })),
    existingTables: existingTablesResult.rows.map((row) => row.table_name),
    maxVaishali: maxVaishaliResult.rows,
  };
}

function buildInventory(preflight) {
  const matchesByLocation = groupBy(preflight.matches, "location_id");
  const sourceUrlsByLocation = new Map();
  for (const row of preflight.sourceRecords) {
    const urls = sourceUrlsByLocation.get(row.location_id) || [];
    for (const url of [row.source_url, row.raw_source_url]) {
      if (url && !urls.includes(url)) {
        urls.push(url);
      }
    }
    sourceUrlsByLocation.set(row.location_id, urls);
  }

  const tier1 = [];
  const tier2 = [];
  const tier3 = [];
  const cachedWebsiteRows = [];

  for (const location of preflight.locations) {
    const matches = matchesByLocation.get(location.id) || [];
    const preferredMatch = choosePreferredMatch(matches);
    const sourceUrls = unique([location.website, ...(sourceUrlsByLocation.get(location.id) || [])].filter(Boolean));
    if (preferredMatch?.provider_place_id) {
      const cachedPayload = parsePlacePayload(preferredMatch.raw_json);
      const row = { location, match: preferredMatch, source_urls: sourceUrls, cached_payload_has_website: Boolean(cachedPayload?.websiteUri) };
      tier1.push(row);
      if (cachedPayload?.websiteUri) {
        cachedWebsiteRows.push(row);
      }
      continue;
    }
    if (sourceUrls.length) {
      tier2.push({ location, source_urls: sourceUrls });
    } else {
      tier3.push({ location, source_urls: [] });
    }
  }

  const tier1DetailsCalls = tier1.length - cachedWebsiteRows.length;
  const maxResolvedFromSearch = tier2.length + tier3.length;
  const maxPlaceDetailsCalls = tier1DetailsCalls + maxResolvedFromSearch;
  const textSearchIdOnlyCalls = tier2.length + tier3.length;
  const estimatedBeforeFree = (maxPlaceDetailsCalls / 1000) * costPerThousandUsd;
  const billableAfterFree = Math.max(0, maxPlaceDetailsCalls - freeEnterpriseCallsEstimate);
  const estimatedAfterFree = (billableAfterFree / 1000) * costPerThousandUsd;

  return {
    candidates: preflight.locations.length,
    tier_1_trusted_place_match: tier1.length,
    tier_1_cached_website_hits: cachedWebsiteRows.length,
    tier_1_place_details_needed: tier1DetailsCalls,
    tier_2_recoverable_bookimed_source: tier2.length,
    tier_3_name_address_only: tier3.length,
    text_search_id_only_calls_estimate: textSearchIdOnlyCalls,
    place_details_calls_estimate: maxPlaceDetailsCalls,
    estimated_api_cost_before_free_usd: roundMoney(estimatedBeforeFree),
    estimated_api_cost_after_free_allowance_usd: roundMoney(estimatedAfterFree),
    free_enterprise_calls_estimate: freeEnterpriseCallsEstimate,
    field_mask: PLACE_FIELD_MASK,
    tier1,
    tier2,
    tier3,
    cachedWebsiteRows,
    tier1Sample: tier1.slice(0, 25).map(sampleTier1),
    tier2Sample: tier2.slice(0, 25).map(sampleTierSource),
    tier3Sample: tier3.slice(0, 25).map(sampleTierSource),
  };
}

function buildReport(inventory, preflight, blockedReason) {
  return {
    generated_at: new Date().toISOString(),
    mode: blockedReason ? "BLOCKED_PREFLIGHT" : "INVENTORY_ONLY",
    prompt: "docs/bookimed-website-backfill-prompt.md",
    blocked_reason: blockedReason,
    field_mask: PLACE_FIELD_MASK,
    inventory: publicInventory(inventory),
    cost_model: {
      place_details_new_website_uri_sku: "Enterprise estimate at $20/1k calls",
      text_search_new_places_id_only: "ID-only field mask estimate treated as free",
      details_calls_estimate: inventory.place_details_calls_estimate,
      text_search_id_only_calls_estimate: inventory.text_search_id_only_calls_estimate,
      estimated_api_cost_before_free_usd: inventory.estimated_api_cost_before_free_usd,
      estimated_api_cost_after_free_allowance_usd: inventory.estimated_api_cost_after_free_allowance_usd,
      free_enterprise_calls_estimate: inventory.free_enterprise_calls_estimate,
    },
    existing_audit_tables: preflight.existingTables,
    samples: {
      tier_1: inventory.tier1Sample,
      tier_2: inventory.tier2Sample,
      tier_3: inventory.tier3Sample,
      max_vaishali_ghaziabad_current_state: preflight.maxVaishali,
    },
  };
}

function publicInventory(inventory) {
  return {
    candidates: inventory.candidates,
    tier_1_trusted_place_match: inventory.tier_1_trusted_place_match,
    tier_1_cached_website_hits: inventory.tier_1_cached_website_hits,
    tier_1_place_details_needed: inventory.tier_1_place_details_needed,
    tier_2_recoverable_bookimed_source: inventory.tier_2_recoverable_bookimed_source,
    tier_3_name_address_only: inventory.tier_3_name_address_only,
    text_search_id_only_calls_estimate: inventory.text_search_id_only_calls_estimate,
    place_details_calls_estimate: inventory.place_details_calls_estimate,
    estimated_api_cost_before_free_usd: inventory.estimated_api_cost_before_free_usd,
    estimated_api_cost_after_free_allowance_usd: inventory.estimated_api_cost_after_free_allowance_usd,
    free_enterprise_calls_estimate: inventory.free_enterprise_calls_estimate,
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
  text = text.replace(
    /\s+[–—-]\s+(?:New York City|New York|Brooklyn|Austin|Tampa|Denver|Atlanta|Chicago|Boston|Miami|Dallas|Houston|Phoenix|Scottsdale|Jacksonville|London|Prague|Paris|Rome|Berlin)$/iu,
    "",
  );
  text = text.replace(/\s+/g, " ").trim();
  return text || String(value || "").trim();
}

function comparableName(value) {
  return stripDiacritics(displayBrand(value))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(clinic|medical|center|centre|pc|pllc|llc|inc|the|health|wellness|spa|md|hospital)\b/g, " ")
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
    tier: row.tier,
    resolution_method: row.resolution_method,
    place_id: row.place_id,
    api_display_name: row.display_name,
    returned_website: row.website,
    verification: row.verification,
  };
}

function reportUnresolvedRow(row) {
  return {
    location_id: row.location.id,
    location_name: row.location.name,
    locality: row.location.locality,
    region: row.location.region,
    tier: row.tier,
    resolution_method: row.resolution_method,
    place_id: row.place_id,
    error: row.error || row.detail_error || null,
    source_urls: row.source_urls || [],
  };
}

function readCheckpoint() {
  if (!existsSync(checkpointPath)) {
    return {};
  }
  return JSON.parse(readFileSync(checkpointPath, "utf8"));
}

function writeCheckpoint(checkpoint) {
  writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function resolvePlaceIds(inventory) {
  const checkpoint = readCheckpoint();
  checkpoint.bookimed_pages ||= {};
  checkpoint.text_search ||= {};
  checkpoint.place_details ||= {};

  const rows = [];
  for (const row of inventory.tier1) {
    const cachedPayload = parsePlacePayload(row.match.raw_json);
    rows.push({
      location: row.location,
      tier: 1,
      resolution_method: "external_place_match",
      place_id: row.match.provider_place_id,
      trusted: true,
      cached_payload: cachedPayload?.websiteUri ? cachedPayload : null,
      source_urls: row.source_urls,
      error: null,
    });
  }

  const demotedToTier3 = [];
  for (let index = 0; index < inventory.tier2.length; index += 1) {
    const row = inventory.tier2[index];
    const pageResult = await resolveBookimedPage(row, checkpoint);
    if (pageResult.place_id) {
      rows.push({
        location: row.location,
        tier: 2,
        resolution_method: pageResult.method,
        place_id: pageResult.place_id,
        trusted: false,
        cached_payload: null,
        source_urls: row.source_urls,
        page_result: pageResult,
        error: null,
      });
    } else if (pageResult.coordinates) {
      const textResult = await resolveTextSearch(row.location, row.location.name, pageResult.coordinates, "tier2_coordinates", checkpoint);
      if (textResult.place_id) {
        rows.push({
          location: row.location,
          tier: 2,
          resolution_method: "text_search_location_bias",
          place_id: textResult.place_id,
          trusted: false,
          cached_payload: null,
          source_urls: row.source_urls,
          page_result: pageResult,
          text_search_result: textResult,
          error: null,
        });
      } else {
        demotedToTier3.push({ ...row, demotion_reason: textResult.error || { message: "text_search_no_result_after_coordinates" } });
      }
    } else {
      demotedToTier3.push({ ...row, demotion_reason: pageResult.error || { message: "bookimed_page_had_no_place_id_or_coordinates" } });
    }
    if ((index + 1) % 25 === 0 || index + 1 === inventory.tier2.length) {
      console.log(`Resolved/checkpointed ${index + 1}/${inventory.tier2.length} Tier 2 Bookimed pages`);
    }
  }

  const tier3Rows = [...inventory.tier3, ...demotedToTier3];
  for (let index = 0; index < tier3Rows.length; index += 1) {
    const row = tier3Rows[index];
    const query = [row.location.name, row.location.address, row.location.locality, row.location.region, row.location.country_code]
      .filter(Boolean)
      .join(" ");
    const textResult = await resolveTextSearch(row.location, query, null, "tier3_name_address", checkpoint);
    if (textResult.place_id) {
      rows.push({
        location: row.location,
        tier: row.demotion_reason ? 2 : 3,
        resolution_method: row.demotion_reason ? "demoted_tier2_text_search_name_address" : "text_search_name_address",
        place_id: textResult.place_id,
        trusted: false,
        cached_payload: null,
        source_urls: row.source_urls,
        text_search_result: textResult,
        demotion_reason: row.demotion_reason || null,
        error: null,
      });
    } else {
      rows.push({
        location: row.location,
        tier: row.demotion_reason ? 2 : 3,
        resolution_method: row.demotion_reason ? "demoted_tier2_unresolved" : "tier3_unresolved",
        place_id: null,
        trusted: false,
        cached_payload: null,
        source_urls: row.source_urls,
        demotion_reason: row.demotion_reason || null,
        error: textResult.error || { message: "text_search_no_result" },
      });
    }
    if ((index + 1) % 25 === 0 || index + 1 === tier3Rows.length) {
      console.log(`Resolved/checkpointed ${index + 1}/${tier3Rows.length} Tier 3/demoted rows`);
    }
  }

  return rows;
}

async function resolveBookimedPage(row, checkpoint) {
  for (const sourceUrl of row.source_urls) {
    const key = `${row.location.id}:${sourceUrl}`;
    let pageResult = checkpoint.bookimed_pages[key];
    if (!pageResult) {
      pageResult = await fetchAndParseBookimedPage(sourceUrl);
      checkpoint.bookimed_pages[key] = {
        location_id: row.location.id,
        source_url: sourceUrl,
        fetched_at: new Date().toISOString(),
        ...pageResult,
      };
      writeCheckpoint(checkpoint);
      await sleep(bookimedRateLimitMs);
    }
    if (pageResult.place_id || pageResult.coordinates) {
      return pageResult;
    }
  }
  return {
    place_id: null,
    coordinates: null,
    method: "bookimed_page_unresolved",
    error: { message: "no_bookimed_source_url_produced_place_id_or_coordinates" },
  };
}

async function fetchAndParseBookimedPage(sourceUrl) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(sourceUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });
      const html = await response.text();
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
        return {
          place_id: null,
          coordinates: null,
          method: "bookimed_fetch_error",
          error: { status: response.status, message: response.statusText, final_url: response.url },
        };
      }
      return {
        ...parseBookimedHtml(html),
        final_url: response.url,
        status: response.status,
      };
    } catch (error) {
      if (attempt < 3) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      return {
        place_id: null,
        coordinates: null,
        method: "bookimed_fetch_exception",
        error: { message: error.message },
      };
    }
  }
  return {
    place_id: null,
    coordinates: null,
    method: "bookimed_unreachable_fetch_state",
    error: { message: "unreachable_fetch_retry_state" },
  };
}

function parseBookimedHtml(html) {
  const decoded = safeDecodeURIComponent(html);
  const placeId = decoded.match(/place_id[:=]([A-Za-z0-9_-]+)/i)?.[1] || null;
  if (placeId) {
    return { place_id: placeId, coordinates: null, cid: null, method: "bookimed_embedded_place_id" };
  }
  const cid = decoded.match(/[?&]cid=(\d+)/i)?.[1] || null;
  const coordinates = extractCoordinatesFromHtml(decoded);
  return {
    place_id: null,
    coordinates,
    cid,
    method: coordinates ? "bookimed_geo_coordinates" : cid ? "bookimed_cid_without_coordinates" : "bookimed_no_map_signal",
  };
}

function extractCoordinatesFromHtml(html) {
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => decodeHtmlEntities(match[1]),
  );
  for (const block of jsonLdBlocks) {
    const coordinates = extractCoordinatesFromJsonish(block);
    if (coordinates) {
      return coordinates;
    }
  }
  return extractCoordinatesFromJsonish(html);
}

function extractCoordinatesFromJsonish(text) {
  const matches = [...String(text || "").matchAll(/"latitude"\s*:\s*"?(-?\d{1,2}(?:\.\d+)?)"?[\s\S]{0,120}?"longitude"\s*:\s*"?(-?\d{1,3}(?:\.\d+)?)"?/gi)];
  for (const match of matches) {
    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude };
    }
  }
  return null;
}

async function resolveTextSearch(location, query, coordinates, method, checkpoint) {
  const key = `${location.id}:${method}:${query}:${coordinates ? `${coordinates.latitude},${coordinates.longitude}` : "none"}`;
  if (checkpoint.text_search[key]) {
    return checkpoint.text_search[key];
  }
  const body = {
    textQuery: query,
  };
  if (coordinates) {
    body.locationBias = {
      circle: {
        center: coordinates,
        radius: 5000,
      },
    };
  }
  const result = await fetchTextSearchPlaceId(body);
  checkpoint.text_search[key] = {
    location_id: location.id,
    method,
    query,
    coordinates,
    fetched_at: new Date().toISOString(),
    ...result,
  };
  writeCheckpoint(checkpoint);
  await sleep(rateLimitMs);
  return checkpoint.text_search[key];
}

async function fetchTextSearchPlaceId(body) {
  const url = "https://places.googleapis.com/v1/places:searchText";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": googleApiKey,
          "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (response.ok) {
        return {
          place_id: payload?.places?.[0]?.id || null,
          raw: payload,
          error: payload?.places?.[0]?.id ? null : { message: "text_search_no_places" },
        };
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await sleep(750 * Math.pow(2, attempt));
        continue;
      }
      return {
        place_id: null,
        raw: payload,
        error: { status: response.status, message: payload?.error?.message || response.statusText },
      };
    } catch (error) {
      if (attempt < 3) {
        await sleep(750 * Math.pow(2, attempt));
        continue;
      }
      return { place_id: null, raw: null, error: { message: error.message } };
    }
  }
  return { place_id: null, raw: null, error: { message: "unreachable_text_search_retry_state" } };
}

async function resolvePlaceDetails(placeRows) {
  const checkpoint = readCheckpoint();
  checkpoint.place_details ||= {};
  const rows = [];
  const candidates = placeRows.filter((row) => row.place_id);
  for (let index = 0; index < candidates.length; index += 1) {
    const row = candidates[index];
    if (row.cached_payload?.websiteUri) {
      rows.push({
        ...row,
        detail_source: "cache",
        payload: row.cached_payload,
        detail_error: null,
      });
      continue;
    }
    const key = `${row.location.id}:${row.place_id}`;
    let detail = checkpoint.place_details[key];
    if (!detail) {
      const result = await fetchPlaceDetails(row.place_id);
      detail = {
        location_id: row.location.id,
        place_id: row.place_id,
        fetched_at: new Date().toISOString(),
        payload: result.payload,
        error: result.error,
      };
      checkpoint.place_details[key] = detail;
      writeCheckpoint(checkpoint);
      await sleep(rateLimitMs);
    }
    rows.push({
      ...row,
      detail_source: "api",
      payload: detail.payload || null,
      detail_error: detail.error || null,
    });
    if ((index + 1) % 25 === 0 || index + 1 === candidates.length) {
      console.log(`Fetched/checkpointed ${index + 1}/${candidates.length} Place Details`);
    }
  }
  rows.push(...placeRows.filter((row) => !row.place_id).map((row) => ({ ...row, payload: null, detail_error: row.error })));
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

function buildPlan(preflight, detailRows) {
  const resultRows = [];
  const matchedWebsiteRows = [];
  const noWebsiteRows = [];
  const mismatchRows = [];
  const unresolvedRows = [];
  const fetchErrorRows = [];
  const trustedAcceptanceRows = [];

  for (const row of detailRows) {
    if (!row.place_id) {
      const planned = { ...row, action: "UNRESOLVED", verified: false, error: row.error || row.detail_error };
      unresolvedRows.push(planned);
      resultRows.push(planned);
      continue;
    }
    if (row.detail_error) {
      const planned = { ...row, action: "FETCH_ERROR", verified: false, error: row.detail_error };
      fetchErrorRows.push(planned);
      resultRows.push(planned);
      continue;
    }
    const displayName = extractDisplayName(row.payload);
    const website = sanitizeUrl(row.payload?.websiteUri);
    const phone = row.payload?.nationalPhoneNumber || null;
    const verification = verifyIdentity(row.location, displayName);
    let trustedAcceptance = false;
    if (!verification.match && row.trusted) {
      verification.match = true;
      verification.rule = "place_match_trusted";
      trustedAcceptance = true;
    }
    if (!verification.match) {
      const planned = { ...row, action: "MISMATCH", verified: false, display_name: displayName, website, phone, verification };
      mismatchRows.push(planned);
      resultRows.push(planned);
      continue;
    }
    if (!website) {
      const planned = { ...row, action: "NO_WEBSITE", verified: true, display_name: displayName, website: null, phone, verification };
      noWebsiteRows.push(planned);
      resultRows.push(planned);
      if (trustedAcceptance) {
        trustedAcceptanceRows.push(planned);
      }
      continue;
    }
    const domain = normalizeWebsiteToRegistrableDomain(website);
    const planned = {
      ...row,
      action: "MATCH",
      verified: true,
      display_name: displayName,
      website,
      phone,
      domain,
      verification,
    };
    matchedWebsiteRows.push(planned);
    resultRows.push(planned);
    if (trustedAcceptance) {
      trustedAcceptanceRows.push(planned);
    }
  }

  const orgPlan = buildOrgPlan(preflight, matchedWebsiteRows);
  return {
    resultRows,
    matchedWebsiteRows,
    noWebsiteRows,
    mismatchRows,
    unresolvedRows,
    fetchErrorRows,
    trustedAcceptanceRows,
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

async function executePlan(pgClient, preflight, plan, inventory, placeRows, detailRows) {
  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`SET LOCAL search_path TO ${quoteIdent(schema)}, public`);
    await ensureBackupAndReportTables(pgClient);

    await insertLocationActionRows(pgClient, plan);
    await writeExternalPlaceMatches(pgClient, plan.resultRows);
    await applyLocationWebsiteWrites(pgClient, plan);
    const newOrgResults = await applyOrgWrites(pgClient, plan);
    await insertOrgReportRows(pgClient, plan, newOrgResults);

    const affectedLocationIds = unique([
      ...plan.matchedWebsiteRows.map((row) => row.location.id),
      ...plan.noWebsiteRows.map((row) => row.location.id),
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
      prompt: "docs/bookimed-website-backfill-prompt.md",
      field_mask: PLACE_FIELD_MASK,
      text_search_field_mask: TEXT_SEARCH_FIELD_MASK,
      inventory: publicInventory(inventory),
      backup_tables: dryRun
        ? []
        : [
            `${rawSchema}.locations_backup_${phaseDate}_bookimed_website_backfill`,
            `${rawSchema}.organizations_backup_${phaseDate}_bookimed_website_backfill`,
            `${rawSchema}.bookimed_website_backfill_location_actions_${phaseDate}`,
            `${rawSchema}.bookimed_website_backfill_org_map_${phaseDate}`,
            `${rawSchema}.bookimed_website_backfill_new_orgs_${phaseDate}`,
            `${rawSchema}.bookimed_website_backfill_guardrail_${phaseDate}`,
          ],
      summary: {
        candidates: inventory.candidates,
        tier_1: inventory.tier_1_trusted_place_match,
        tier_1_cached_hits: inventory.tier_1_cached_website_hits,
        tier_2: inventory.tier_2_recoverable_bookimed_source,
        tier_3: inventory.tier_3_name_address_only,
        bookimed_pages_fetched: Object.values(readCheckpoint().bookimed_pages || {}).length,
        place_ids_resolved: placeRows.filter((row) => row.place_id).length,
        place_ids_unresolved: placeRows.filter((row) => !row.place_id).length,
        place_details_calls_made_or_checkpointed: detailRows.filter((row) => row.place_id && row.detail_source === "api").length,
        matches_written: plan.matchedWebsiteRows.length,
        place_match_trusted_acceptances: plan.trustedAcceptanceRows.length,
        mismatches: plan.mismatchRows.length,
        no_website: plan.noWebsiteRows.length,
        fetch_errors: plan.fetchErrorRows.length,
        unresolved: plan.unresolvedRows.length,
        orgs_relinked: plan.relinkRows.length,
        orgs_created: newOrgResults.length,
        org_locations_created: newOrgResults.reduce((sum, org) => sum + org.location_count, 0),
        org_guardrail: plan.orgGuardrailRows.length,
        refreshed_locations: affectedLocationIds.length,
        estimated_api_cost_before_free_usd: inventory.estimated_api_cost_before_free_usd,
        estimated_api_cost_after_free_allowance_usd: inventory.estimated_api_cost_after_free_allowance_usd,
      },
      mismatches: plan.mismatchRows.map(reportResultRow),
      no_website: plan.noWebsiteRows.map(reportResultRow),
      unresolved: plan.unresolvedRows.map(reportUnresolvedRow),
      fetch_errors: plan.fetchErrorRows.map(reportUnresolvedRow),
      place_match_trusted_acceptances: plan.trustedAcceptanceRows.map(reportResultRow),
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
          `locations_backup_${phaseDate}_bookimed_website_backfill`,
          `organizations_backup_${phaseDate}_bookimed_website_backfill`,
          `bookimed_website_backfill_location_actions_${phaseDate}`,
          `bookimed_website_backfill_org_map_${phaseDate}`,
          `bookimed_website_backfill_new_orgs_${phaseDate}`,
          `bookimed_website_backfill_guardrail_${phaseDate}`,
        ],
      ],
    );
    if (existing.rowCount) {
      throw new Error(`Refusing to run because Bookimed backfill tables already exist: ${existing.rows.map((row) => row.table_name).join(", ")}`);
    }
  }
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`locations_backup_${phaseDate}_bookimed_website_backfill`)} AS
    SELECT * FROM ${quoteIdent(schema)}.locations
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`organizations_backup_${phaseDate}_bookimed_website_backfill`)} AS
    SELECT * FROM ${quoteIdent(schema)}.organizations
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_website_backfill_location_actions_${phaseDate}`)} (
      location_id integer NOT NULL,
      place_id text,
      tier integer,
      resolution_method text,
      action text NOT NULL,
      old_website text,
      new_website text,
      old_phone text,
      new_phone text,
      api_display_name text,
      verification jsonb,
      raw_payload jsonb,
      error jsonb,
      source_urls text[],
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_website_backfill_org_map_${phaseDate}`)} (
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
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_website_backfill_new_orgs_${phaseDate}`)} (
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
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_website_backfill_guardrail_${phaseDate}`)} (
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

async function insertLocationActionRows(pgClient, plan) {
  const rows = plan.resultRows.map((row) => ({
    location_id: row.location.id,
    place_id: row.place_id,
    tier: row.tier,
    resolution_method: row.resolution_method,
    action: row.action,
    old_website: row.location.website,
    new_website: row.action === "MATCH" ? row.website : row.action === "NO_WEBSITE" ? null : row.location.website,
    old_phone: row.location.phone,
    new_phone: row.action === "MATCH" && !row.location.phone && row.phone ? row.phone : row.location.phone,
    api_display_name: row.display_name || null,
    verification: row.verification || null,
    raw_payload: row.payload || null,
    error: row.error || row.detail_error || null,
    source_urls: row.source_urls || [],
  }));
  if (!rows.length) {
    return;
  }
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_website_backfill_location_actions_${phaseDate}`)} (
      location_id, place_id, tier, resolution_method, action, old_website, new_website, old_phone, new_phone,
      api_display_name, verification, raw_payload, error, source_urls
    )
    SELECT location_id, place_id, tier, resolution_method, action, old_website, new_website, old_phone, new_phone,
           api_display_name, verification, raw_payload, error, source_urls
    FROM jsonb_to_recordset($1::jsonb) AS x(
      location_id integer,
      place_id text,
      tier integer,
      resolution_method text,
      action text,
      old_website text,
      new_website text,
      old_phone text,
      new_phone text,
      api_display_name text,
      verification jsonb,
      raw_payload jsonb,
      error jsonb,
      source_urls text[]
    )
    `,
    [JSON.stringify(rows)],
  );
}

async function writeExternalPlaceMatches(pgClient, rows) {
  const payload = rows
    .filter((row) => row.payload && row.place_id && ["MATCH", "NO_WEBSITE"].includes(row.action))
    .map((row) => ({
      location_id: row.location.id,
      provider: "google_places",
      provider_place_id: row.place_id,
      provider_url: `https://www.google.com/maps/place/?q=place_id:${row.place_id}`,
      display_name: row.display_name || extractDisplayName(row.payload),
      match_confidence: row.verification?.score ?? null,
      match_status: "matched",
      fetched_at: new Date().toISOString(),
      raw_json: row.payload,
    }));
  if (!payload.length) {
    return;
  }
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
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_website_backfill_org_map_${phaseDate}`)} (
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
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_website_backfill_org_map_${phaseDate}`)} m
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
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_website_backfill_new_orgs_${phaseDate}`)} (
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
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`bookimed_website_backfill_guardrail_${phaseDate}`)} (
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

async function acceptanceChecks(pgClient, plan, newOrgResults) {
  const bookimedRemaining = await pgClient.query(
    `
    SELECT id, slug, name, website
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
      AND status = 'active'
      AND website IS NOT NULL
      AND website ~* $1
    ORDER BY id
    `,
    [BOOKIMED_SQL_REGEX],
  );
  const maxVaishali = await pgClient.query(`
    SELECT l.id, l.slug, l.name, l.website, l.org_id, org.canonical_name AS org_name, org.website_domain AS org_domain,
           google.provider_place_id AS google_place_id, google.rating, google.review_count,
           places.provider_place_id AS google_places_place_id, places.raw_json->>'websiteUri' AS google_places_website
    FROM ${quoteIdent(schema)}.locations l
    LEFT JOIN ${quoteIdent(schema)}.organizations org ON org.id = l.org_id
    LEFT JOIN ${quoteIdent(schema)}.external_place_matches google
      ON google.location_id = l.id
     AND google.provider = 'google'
    LEFT JOIN ${quoteIdent(schema)}.external_place_matches places
      ON places.location_id = l.id
     AND places.provider = 'google_places'
    WHERE l.slug = 'max-vaishali-ghaziabad'
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
        [newOrgResults.map((org) => org.org_id), newOrgResults.map((org) => org.website_domain)],
      )
    : { rows: [] };

  const flaggedIds = new Set([
    ...plan.mismatchRows.map((row) => row.location.id),
    ...plan.unresolvedRows.map((row) => row.location.id),
    ...plan.fetchErrorRows.map((row) => row.location.id),
  ]);

  return {
    active_bookimed_remaining_count: bookimedRemaining.rowCount,
    active_bookimed_remaining_sample: bookimedRemaining.rows.slice(0, 100),
    remaining_explained_by_mismatch_fetch_error_or_unresolved: bookimedRemaining.rows.every((row) => flaggedIds.has(row.id)),
    max_vaishali_ghaziabad: maxVaishali.rows[0] || null,
    new_org_domain_conflicts: newOrgDomainConflicts.rows,
  };
}

function sampleTier1(row) {
  return {
    location_id: row.location.id,
    slug: row.location.slug,
    name: row.location.name,
    website: row.location.website,
    provider: row.match.provider,
    provider_place_id: row.match.provider_place_id,
    rating: row.match.rating,
    review_count: row.match.review_count,
    cached_payload_has_website: row.cached_payload_has_website,
  };
}

function sampleTierSource(row) {
  return {
    location_id: row.location.id,
    slug: row.location.slug,
    name: row.location.name,
    website: row.location.website,
    source_urls: row.source_urls,
  };
}

function choosePreferredMatch(matches) {
  return [...matches].sort((a, b) => {
    const aPayload = parsePlacePayload(a.raw_json);
    const bPayload = parsePlacePayload(b.raw_json);
    const aScore = (aPayload?.websiteUri ? 10 : 0) + (a.provider === "google_places" ? 2 : 0) + (a.provider_place_id ? 1 : 0);
    const bScore = (bPayload?.websiteUri ? 10 : 0) + (b.provider === "google_places" ? 2 : 0) + (b.provider_place_id ? 1 : 0);
    return bScore - aScore;
  })[0] || null;
}

function parsePlacePayload(rawJson) {
  if (!rawJson) {
    return null;
  }
  try {
    const payload = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
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

function printInventory(inventory) {
  console.log(
    `Inventory: ${inventory.candidates} active Bookimed candidates; tier1=${inventory.tier_1_trusted_place_match}, tier2=${inventory.tier_2_recoverable_bookimed_source}, tier3=${inventory.tier_3_name_address_only}.`,
  );
  console.log(
    `Estimated Google calls: ${inventory.place_details_calls_estimate} Place Details, ${inventory.text_search_id_only_calls_estimate} ID-only Text Search.`,
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
  lines.push(report.mode === "INVENTORY_ONLY" || report.mode === "BLOCKED_PREFLIGHT" ? "# Bookimed Website Backfill Preflight" : "# Bookimed Website Backfill Report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Field mask: \`${report.field_mask}\``);
  if (report.text_search_field_mask) {
    lines.push(`Text Search field mask: \`${report.text_search_field_mask}\``);
  }
  if (report.blocked_reason) {
    lines.push(`Blocked: ${report.blocked_reason}`);
  }
  if (report.summary) {
    lines.push("");
    lines.push("## Summary");
    lines.push("");
    lines.push(markdownTable(["metric", "count"], Object.entries(report.summary || {})));
  }
  lines.push("");
  lines.push("## Inventory");
  lines.push("");
  lines.push(markdownTable(["metric", "value"], Object.entries(report.inventory || {})));
  if (report.cost_model) {
    lines.push("");
    lines.push("## Cost Model");
    lines.push("");
    lines.push(markdownTable(["metric", "value"], Object.entries(report.cost_model || {})));
  }
  if (report.backup_tables?.length) {
    lines.push("");
    lines.push("## Backup and Audit Tables");
    lines.push("");
    for (const table of report.backup_tables) {
      lines.push(`- ${table}`);
    }
  }
  if (report.existing_audit_tables?.length) {
    lines.push("");
    lines.push("## Existing Audit Tables");
    lines.push("");
    for (const table of report.existing_audit_tables) {
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
  if (report.unresolved?.length) {
    lines.push("");
    lines.push("## Unresolved");
    lines.push("");
    lines.push(
      markdownTable(
        ["location_id", "location_name", "reason"],
        report.unresolved.map((row) => [row.location_id, row.location_name, row.error?.message || JSON.stringify(row.error || {})]),
      ),
    );
  }
  if (report.fetch_errors?.length) {
    lines.push("");
    lines.push("## Fetch Errors");
    lines.push("");
    lines.push(
      markdownTable(
        ["location_id", "location_name", "place_id", "reason"],
        report.fetch_errors.map((row) => [row.location_id, row.location_name, row.place_id || "", row.error?.message || JSON.stringify(row.error || {})]),
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
  lines.push("");
  lines.push("## Max Vaishali Spot Check");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.acceptance?.max_vaishali_ghaziabad || report.samples?.max_vaishali_ghaziabad_current_state || [], null, 2));
  lines.push("```");
  if (report.acceptance) {
    lines.push("");
    lines.push("## Acceptance");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(report.acceptance, null, 2));
    lines.push("```");
  }
  if (report.samples) {
    lines.push("");
    lines.push("## Samples");
    lines.push("");
    lines.push("```json");
    lines.push(
      JSON.stringify(
        {
          tier_1: report.samples?.tier_1 || [],
          tier_2: report.samples?.tier_2 || [],
          tier_3: report.samples?.tier_3 || [],
        },
        null,
        2,
      ),
    );
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
    } else if (arg === "--free-calls") {
      parsed.freeCalls = args[++index];
    } else if (arg === "--rate-limit-ms") {
      parsed.rateLimitMs = args[++index];
    } else if (arg === "--bookimed-rate-limit-ms") {
      parsed.bookimedRateLimitMs = args[++index];
    } else if (arg === "--checkpoint") {
      parsed.checkpoint = args[++index];
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
