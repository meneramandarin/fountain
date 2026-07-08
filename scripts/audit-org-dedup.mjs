#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const reportDate = options.date || new Date().toISOString().slice(0, 10).replaceAll("-", "");
const COMMON_MULTI_LABEL_SUFFIXES = new Set([
  "ac.uk",
  "co.il",
  "co.in",
  "co.jp",
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

const NON_CLINIC_DOMAINS = new Set([
  "acuityscheduling.com",
  "apple.com",
  "bit.ly",
  "bookimed.com",
  "booksy.com",
  "calendly.com",
  "clientsecure.me",
  "facebook.com",
  "fresha.com",
  "g.page",
  "glossgenius.com",
  "gofundme.com",
  "goo.gl",
  "google.com",
  "health-tourism.com",
  "instagram.com",
  "linkedin.com",
  "linktr.ee",
  "maps.app.goo.gl",
  "mapquest.com",
  "mindbody.io",
  "mindbodyonline.com",
  "mymeditravel.com",
  "opencare.com",
  "patientnow.com",
  "placidway.com",
  "realself.com",
  "rymaps.xyz",
  "square.site",
  "squarespace.com",
  "tiktok.com",
  "vagaro.com",
  "webflow.io",
  "weence.com",
  "wixsite.com",
  "yelp.com",
  "youtube.com",
  "zenoti.com",
  "zoca.com",
  "zocdoc.com",
  "europepmc.org",
]);

const US_STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

const US_STATE_NAMES = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "district of columbia",
]);

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
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

const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const jsonOut = options.jsonOut || `org-dedup-audit-report-${reportDate}.json`;
const mdOut = options.mdOut || `docs/org-dedup-audit-report-${reportDate}.md`;
const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  const report = await buildReport(client);
  writeFileSync(path.resolve(ROOT, jsonOut), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.resolve(ROOT, mdOut), renderMarkdown(report));
  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${mdOut}`);
  console.log(`Actions: ${JSON.stringify(report.action_counts)}`);
  console.log(`Contaminated orgs: ${report.contaminated_orgs.length}`);
  console.log(`Mismatches: ${report.mismatches.length}`);
  console.log(`Chain naming candidates: ${report.chain_naming_candidates.length}`);
} finally {
  await client.end();
}

async function buildReport(pgClient) {
  await pgClient.query("BEGIN READ ONLY");
  await pgClient.query(`SET LOCAL search_path TO ${quoteIdent(schema)}, public`);

  try {
    const orgResult = await pgClient.query(`
        SELECT
          id,
          canonical_name,
          name_normalized,
          website_domain,
          dedup_key,
          status,
          data_origin,
          verification_status,
          deleted_at
        FROM ${quoteIdent(schema)}.organizations
        ORDER BY id
      `);
    const locationResult = await pgClient.query(`
        SELECT
          l.id,
          l.name,
          l.website,
          l.address,
          l.locality,
          l.region,
          l.country_code,
          l.status,
          l.dedup_key AS location_dedup_key,
          l.org_id,
          org.canonical_name AS org_name,
          org.website_domain AS org_website_domain,
          org.dedup_key AS org_dedup_key,
          org.name_normalized AS org_name_normalized
        FROM ${quoteIdent(schema)}.locations l
        LEFT JOIN ${quoteIdent(schema)}.organizations org ON org.id = l.org_id
        WHERE l.deleted_at IS NULL
        ORDER BY l.id
      `);
    const sourceRecordResult = await pgClient.query(`
        SELECT entity_type, COUNT(*)::int AS count
        FROM ${quoteIdent(schema)}.source_records
        GROUP BY entity_type
        ORDER BY entity_type
      `);
    const tableCountResult = await pgClient.query(`
        SELECT
          (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.organizations WHERE deleted_at IS NULL) AS active_orgs,
          (SELECT COUNT(*)::int FROM ${quoteIdent(schema)}.locations WHERE deleted_at IS NULL) AS active_locations
      `);
    const elitraResult = await pgClient.query(`
        SELECT
          org.id AS org_id,
          org.canonical_name AS org_name,
          org.website_domain AS org_domain,
          org.dedup_key AS org_dedup_key,
          l.id AS location_id,
          l.name AS location_name,
          l.website AS location_website,
          l.locality,
          l.region
        FROM ${quoteIdent(schema)}.organizations org
        JOIN ${quoteIdent(schema)}.locations l ON l.org_id = org.id
        WHERE org.canonical_name ILIKE 'Elitra Health'
          AND l.deleted_at IS NULL
        ORDER BY l.id
        LIMIT 80
      `);

    await pgClient.query("COMMIT");

    const organizations = orgResult.rows.map((org) => ({
      ...org,
      normalized_domain: normalizeWebsiteToRegistrableDomain(org.website_domain),
      raw_host: normalizeWebsiteToHost(org.website_domain),
      is_deleted: Boolean(org.deleted_at),
    }));
    const activeOrganizations = organizations.filter((org) => !org.is_deleted);
    const orgById = new Map(activeOrganizations.map((org) => [org.id, org]));
    const orgsByDomain = new Map();

    for (const org of activeOrganizations) {
      if (!org.normalized_domain || isNonClinicDomain(org.normalized_domain)) {
        continue;
      }
      const bucket = orgsByDomain.get(org.normalized_domain) || [];
      bucket.push(org);
      orgsByDomain.set(org.normalized_domain, bucket);
    }

    const locations = locationResult.rows.map((location) => {
      const locationDomain = normalizeWebsiteToRegistrableDomain(location.website);
      const orgDomain = normalizeWebsiteToRegistrableDomain(location.org_website_domain);
      return {
        ...location,
        location_domain: locationDomain,
        location_host: normalizeWebsiteToHost(location.website),
        org_domain: orgDomain,
        location_domain_kind: domainKind(locationDomain),
        org_domain_kind: domainKind(orgDomain),
      };
    });

    const actionRows = locations.map((location) => classifyLocation(location, orgsByDomain));
    const actionCounts = countBy(actionRows, "action");
    const locationsByOrg = groupBy(locations.filter((location) => location.org_id), "org_id");

    const contaminatedOrgs = [];
    for (const [orgId, childLocations] of locationsByOrg.entries()) {
      const org = orgById.get(Number(orgId));
      if (!org) {
        continue;
      }
      const clinicDomainCounts = countDomains(childLocations, (location) =>
        location.location_domain && !isNonClinicDomain(location.location_domain) ? location.location_domain : null,
      );
      if (clinicDomainCounts.length < 2) {
        continue;
      }
      contaminatedOrgs.push({
        org_id: org.id,
        canonical_name: org.canonical_name,
        website_domain: org.website_domain,
        normalized_org_domain: org.normalized_domain,
        dedup_key: org.dedup_key,
        location_count: childLocations.length,
        distinct_location_domains: clinicDomainCounts.length,
        domains: clinicDomainCounts.slice(0, 30),
        sample_locations: childLocations.slice(0, 15).map(locationSummary),
      });
    }
    contaminatedOrgs.sort(
      (a, b) =>
        b.location_count - a.location_count ||
        b.distinct_location_domains - a.distinct_location_domains ||
        a.canonical_name.localeCompare(b.canonical_name),
    );

    const mismatches = locations
      .filter(
        (location) =>
          location.location_domain &&
          location.org_domain &&
          location.location_domain !== location.org_domain,
      )
      .map((location) => ({
        location_id: location.id,
        location_name: location.name,
        location_website: location.website,
        location_domain: location.location_domain,
        org_id: location.org_id,
        org_name: location.org_name,
        org_website_domain: location.org_website_domain,
        org_domain: location.org_domain,
        locality: location.locality,
        region: location.region,
        action: actionRows.find((row) => row.location_id === location.id)?.action,
      }))
      .sort((a, b) => (a.org_id || 0) - (b.org_id || 0) || a.location_id - b.location_id);

    const chainNamingCandidates = [];
    for (const [orgId, childLocations] of locationsByOrg.entries()) {
      const org = orgById.get(Number(orgId));
      if (!org) {
        continue;
      }
      if (childLocations.length < 2) {
        continue;
      }
      const suffix = parseCityStateSuffix(org.canonical_name);
      if (!suffix) {
        continue;
      }
      const childCityStates = unique(
        childLocations
          .map((location) => cityState(location.locality, location.region))
          .filter(Boolean),
      );
      const childOtherCities = childCityStates.filter((value) => value !== cityState(suffix.city, suffix.region));
      if (!childOtherCities.length) {
        continue;
      }
      chainNamingCandidates.push({
        org_id: org.id,
        canonical_name: org.canonical_name,
        proposed_brand_name: suffix.brandName,
        suffix_city: suffix.city,
        suffix_region: suffix.region,
        website_domain: org.website_domain,
        location_count: childLocations.length,
        child_city_states: childCityStates.slice(0, 30),
        other_child_city_states: childOtherCities.slice(0, 30),
        sample_locations: childLocations.slice(0, 15).map(locationSummary),
      });
    }
    chainNamingCandidates.sort((a, b) => b.location_count - a.location_count || a.canonical_name.localeCompare(b.canonical_name));

    const duplicateOrgDomains = [...orgsByDomain.entries()]
      .filter(([, orgs]) => orgs.length > 1)
      .map(([domain, orgs]) => ({
        domain,
        org_count: orgs.length,
        orgs: orgs.map((org) => ({
          org_id: org.id,
          canonical_name: org.canonical_name,
          website_domain: org.website_domain,
          dedup_key: org.dedup_key,
        })),
      }))
      .sort((a, b) => b.org_count - a.org_count || a.domain.localeCompare(b.domain));

    const rootCauseEvidence = buildRootCauseEvidence({
      organizations: activeOrganizations,
      contaminatedOrgs,
      mismatches,
      elitraRows: elitraResult.rows,
    });

    return {
      generated_at: new Date().toISOString(),
      mode: "AUDIT_ONLY_READ_ONLY",
      database: {
        schema,
        counts: tableCountResult.rows[0],
        source_record_counts: sourceRecordResult.rows,
      },
      domain_normalization: {
        method:
          "Lowercase URL host, strip leading www/wwwN, remove port/path/query, then approximate eTLD+1 using common multi-label public suffixes.",
        non_clinic_domains_treated_as_ambiguous: [...NON_CLINIC_DOMAINS].sort(),
      },
      root_cause: rootCauseEvidence,
      action_counts: actionCounts,
      top_20_worst_orgs: contaminatedOrgs.slice(0, 20),
      contaminated_orgs: contaminatedOrgs,
      mismatches,
      chain_naming_candidates: chainNamingCandidates,
      duplicate_org_domains: duplicateOrgDomains,
      proposed_actions: actionRows.sort(actionSort),
    };
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

function classifyLocation(location, orgsByDomain) {
  const base = {
    location_id: location.id,
    location_name: location.name,
    location_website: location.website,
    location_domain: location.location_domain,
    location_domain_kind: location.location_domain_kind,
    locality: location.locality,
    region: location.region,
    country_code: location.country_code,
    current_org_id: location.org_id,
    current_org_name: location.org_name,
    current_org_domain: location.org_domain,
    current_org_website_domain: location.org_website_domain,
    current_org_dedup_key: location.org_dedup_key,
  };

  if (!location.org_id) {
    return {
      ...base,
      action: "AMBIGUOUS",
      reason: "Location has no current org_id; this audit is scoped to org mis-linking, not first-time org assignment.",
      candidate_orgs: [],
    };
  }

  if (!location.location_domain) {
    return {
      ...base,
      action: "AMBIGUOUS",
      reason: "Location has no usable website domain.",
      candidate_orgs: [],
    };
  }

  if (isNonClinicDomain(location.location_domain)) {
    return {
      ...base,
      action: "AMBIGUOUS",
      reason: `Location website resolves to non-clinic/profile/marketplace domain ${location.location_domain}.`,
      candidate_orgs: [],
    };
  }

  if (location.org_domain === location.location_domain) {
    return {
      ...base,
      action: "KEEP",
      reason: "Location website domain matches current org website_domain.",
      candidate_orgs: summarizeCandidateOrgs(orgsByDomain.get(location.location_domain) || []),
    };
  }

  const candidates = (orgsByDomain.get(location.location_domain) || []).filter((org) => org.id !== location.org_id);
  if (candidates.length === 1) {
    return {
      ...base,
      action: "RELINK",
      reason: "Location domain exactly matches one different existing org domain.",
      target_org_id: candidates[0].id,
      target_org_name: candidates[0].canonical_name,
      target_org_domain: candidates[0].normalized_domain,
      candidate_orgs: summarizeCandidateOrgs(candidates),
    };
  }
  if (candidates.length > 1) {
    return {
      ...base,
      action: "AMBIGUOUS",
      reason: "Multiple different existing orgs share the location domain.",
      candidate_orgs: summarizeCandidateOrgs(candidates),
    };
  }

  return {
    ...base,
    action: "NEW_ORG",
    reason: "Location has a clinic-like domain that matches no existing org website_domain.",
    proposed_org_name: location.name,
    proposed_org_domain: location.location_domain,
    proposed_dedup_key: `org:${location.location_domain}`,
    candidate_orgs: [],
  };
}

function buildRootCauseEvidence({ organizations, contaminatedOrgs, mismatches, elitraRows }) {
  const dedupKeyShape = countBy(
    organizations.map((org) => ({
      shape:
        org.dedup_key === null
          ? "null"
          : org.dedup_key === ""
            ? "empty_string"
            : org.normalized_domain && org.dedup_key?.includes(org.normalized_domain)
              ? "contains_domain"
              : "other",
    })),
    "shape",
  );

  const orgsWithEmptyDomainAndDedup = organizations
    .filter((org) => !org.normalized_domain && org.dedup_key)
    .slice(0, 25)
    .map((org) => ({
      org_id: org.id,
      canonical_name: org.canonical_name,
      website_domain: org.website_domain,
      dedup_key: org.dedup_key,
      name_normalized: org.name_normalized,
    }));

  const orgsWithDomainMismatchChildren = contaminatedOrgs.length;
  const elitraChildren = elitraRows.map((row) => ({
    org_id: row.org_id,
    org_name: row.org_name,
    org_domain: normalizeWebsiteToRegistrableDomain(row.org_domain),
    org_dedup_key: row.org_dedup_key,
    location_id: row.location_id,
    location_name: row.location_name,
    location_domain: normalizeWebsiteToRegistrableDomain(row.location_website),
    locality: row.locality,
    region: row.region,
  }));

  return {
    local_importer_code_found: false,
    local_importer_code_note:
      "No importer code that inserts organizations or assigns locations.org_id was found in this checkout. Search terms used: dedup_key, website_domain, org_id, name_normalized, INSERT INTO organizations, UPDATE org_id.",
    db_supported_findings: [
      "organizations.dedup_key is unique, so any importer using the same non-null fallback key will collapse records into the first matching org.",
      `${orgsWithDomainMismatchChildren} active orgs currently parent locations across 2+ distinct clinic-like registrable domains.`,
      `${mismatches.length} active locations have both a location website domain and an org website_domain, and the two domains differ.`,
      "The Elitra Health sample confirms one org parent currently links to unrelated location domains.",
    ],
    dedup_key_shape_counts: dedupKeyShape,
    orgs_with_no_domain_but_nonempty_dedup_key_examples: orgsWithEmptyDomainAndDedup,
    elitra_health_child_examples: elitraChildren,
    inference:
      "Because the importer code is absent, the exact branch cannot be proven from source here. The DB state is consistent with org lookup being keyed too broadly when source domain data was missing, malformed, or normalized to a shared fallback, then writing the resulting org id onto unrelated locations.",
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Organization Dedup Audit Report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push("");
  lines.push("No database rows were modified. This report was generated from read-only SELECT queries.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Active organizations: ${report.database.counts.active_orgs}`);
  lines.push(`- Active locations: ${report.database.counts.active_locations}`);
  lines.push(`- Contaminated orgs with 2+ clinic-like location domains: ${report.contaminated_orgs.length}`);
  lines.push(`- Location/org domain mismatches: ${report.mismatches.length}`);
  lines.push(`- Chain naming candidates: ${report.chain_naming_candidates.length}`);
  lines.push(`- Duplicate org domains: ${report.duplicate_org_domains.length}`);
  lines.push("");
  lines.push("Action counts:");
  lines.push("");
  lines.push(markdownTable(["action", "count"], Object.entries(report.action_counts).map(([action, count]) => [action, count])));
  lines.push("");
  lines.push("## Root Cause");
  lines.push("");
  lines.push(`Importer code found locally: ${report.root_cause.local_importer_code_found ? "yes" : "no"}`);
  lines.push("");
  lines.push(report.root_cause.local_importer_code_note);
  lines.push("");
  lines.push("DB-supported findings:");
  lines.push("");
  for (const finding of report.root_cause.db_supported_findings) {
    lines.push(`- ${finding}`);
  }
  lines.push("");
  lines.push(`Inference: ${report.root_cause.inference}`);
  lines.push("");
  lines.push("Dedup key shape counts:");
  lines.push("");
  lines.push(markdownTable(["shape", "count"], Object.entries(report.root_cause.dedup_key_shape_counts).map(([shape, count]) => [shape, count])));
  lines.push("");
  lines.push("Elitra Health child examples:");
  lines.push("");
  lines.push(
    markdownTable(
      ["location_id", "location_name", "location_domain", "org_domain", "city", "region"],
      report.root_cause.elitra_health_child_examples.slice(0, 25).map((row) => [
        row.location_id,
        row.location_name,
        row.location_domain,
        row.org_domain,
        row.locality,
        row.region,
      ]),
    ),
  );
  lines.push("");
  lines.push("## Top 20 Worst Orgs");
  lines.push("");
  lines.push(
    markdownTable(
      ["org_id", "canonical_name", "org_domain", "locations", "distinct_domains", "top_domains"],
      report.top_20_worst_orgs.map((org) => [
        org.org_id,
        org.canonical_name,
        org.normalized_org_domain,
        org.location_count,
        org.distinct_location_domains,
        org.domains.slice(0, 8).map((domain) => `${domain.domain} (${domain.count})`).join(", "),
      ]),
    ),
  );
  lines.push("");
  lines.push("## Chain Naming Candidates");
  lines.push("");
  lines.push(
    markdownTable(
      ["org_id", "canonical_name", "proposed_brand_name", "suffix", "locations", "other_child_cities"],
      report.chain_naming_candidates.slice(0, 50).map((org) => [
        org.org_id,
        org.canonical_name,
        org.proposed_brand_name,
        cityState(org.suffix_city, org.suffix_region),
        org.location_count,
        org.other_child_city_states.slice(0, 8).join(", "),
      ]),
    ),
  );
  lines.push("");
  lines.push("## Mismatch Samples");
  lines.push("");
  lines.push(
    markdownTable(
      ["location_id", "location_name", "location_domain", "org_id", "org_name", "org_domain", "action"],
      report.mismatches.slice(0, 100).map((row) => [
        row.location_id,
        row.location_name,
        row.location_domain,
        row.org_id,
        row.org_name,
        row.org_domain,
        row.action,
      ]),
    ),
  );
  lines.push("");
  lines.push("## Proposed Action Samples");
  lines.push("");
  for (const action of ["RELINK", "NEW_ORG", "AMBIGUOUS", "KEEP"]) {
    const sample = report.proposed_actions.filter((row) => row.action === action).slice(0, 50);
    lines.push(`### ${action}`);
    lines.push("");
    lines.push(
      markdownTable(
        ["location_id", "location_name", "location_domain", "current_org", "current_org_domain", "target/proposed", "reason"],
        sample.map((row) => [
          row.location_id,
          row.location_name,
          row.location_domain,
          row.current_org_name,
          row.current_org_domain,
          row.target_org_name || row.proposed_org_name || "",
          row.reason,
        ]),
      ),
    );
    lines.push("");
  }
  lines.push("## Full JSON");
  lines.push("");
  lines.push(`The full per-location proposed action list is in \`${path.basename(jsonOut)}\`.`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function normalizeWebsiteToHost(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  let text = value.trim().toLowerCase();
  if (!text) {
    return null;
  }
  text = text.replace(/^mailto:/, "").replace(/^tel:/, "");
  if (text.includes("@") && !text.includes("/")) {
    text = text.split("@").pop();
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    text = `https://${text}`;
  }
  try {
    const url = new URL(text);
    let host = url.hostname.toLowerCase();
    host = host.replace(/\.$/, "");
    host = host.replace(/^www\d?\./, "");
    return host || null;
  } catch {
    const host = text
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .split(/[/?#]/)[0]
      .split(":")[0]
      .replace(/^www\d?\./, "")
      .replace(/\.$/, "");
    return host || null;
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
  const lastThreeSuffix = parts.slice(-3).join(".");
  if (COMMON_MULTI_LABEL_SUFFIXES.has(lastThreeSuffix) && parts.length >= 4) {
    return parts.slice(-4).join(".");
  }
  return lastTwo;
}

function domainKind(domain) {
  if (!domain) {
    return "missing";
  }
  if (isNonClinicDomain(domain)) {
    return "non_clinic_or_marketplace";
  }
  return "clinic_like";
}

function isNonClinicDomain(domain) {
  return NON_CLINIC_DOMAINS.has(domain);
}

function parseCityStateSuffix(name) {
  if (!name) {
    return null;
  }
  const match = name.match(/^(.+)\s[-–—]\s*([^,]{2,80}),\s*([A-Z]{2}|[A-Za-z][A-Za-z .]{2,40})$/);
  if (!match) {
    return null;
  }
  const region = match[3].trim();
  if (!US_STATE_CODES.has(region.toUpperCase()) && !US_STATE_NAMES.has(region.toLowerCase())) {
    return null;
  }
  return {
    brandName: match[1].trim(),
    city: match[2].trim(),
    region,
  };
}

function cityState(city, region) {
  const normalizedCity = city?.trim();
  const normalizedRegion = region?.trim();
  if (!normalizedCity && !normalizedRegion) {
    return "";
  }
  return [normalizedCity, normalizedRegion].filter(Boolean).join(", ");
}

function locationSummary(location) {
  return {
    location_id: location.id,
    name: location.name,
    website: location.website,
    location_domain: location.location_domain,
    locality: location.locality,
    region: location.region,
  };
}

function countDomains(rows, domainForRow) {
  const counts = new Map();
  for (const row of rows) {
    const domain = domainForRow(row);
    if (!domain) {
      continue;
    }
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

function summarizeCandidateOrgs(orgs) {
  return orgs.map((org) => ({
    org_id: org.id,
    canonical_name: org.canonical_name,
    website_domain: org.website_domain,
    normalized_domain: org.normalized_domain,
    dedup_key: org.dedup_key,
  }));
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    if (value === null || value === undefined) {
      continue;
    }
    const bucket = groups.get(value) || [];
    bucket.push(row);
    groups.set(value, bucket);
  }
  return groups;
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function unique(values) {
  return [...new Set(values)];
}

function actionSort(a, b) {
  const order = { RELINK: 0, NEW_ORG: 1, AMBIGUOUS: 2, KEEP: 3 };
  return (order[a.action] ?? 99) - (order[b.action] ?? 99) || a.location_id - b.location_id;
}

function markdownTable(headers, rows) {
  const escapedRows = rows.map((row) => row.map(markdownCell));
  return [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...escapedRows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function markdownCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function parseArgs(args) {
  const parsed = { envFile: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--database-url") {
      parsed.databaseUrl = next;
      index += 1;
    } else if (arg === "--schema") {
      parsed.schema = next;
      index += 1;
    } else if (arg === "--env-file") {
      parsed.envFile.push(next);
      index += 1;
    } else if (arg === "--json-out") {
      parsed.jsonOut = next;
      index += 1;
    } else if (arg === "--md-out") {
      parsed.mdOut = next;
      index += 1;
    } else if (arg === "--date") {
      parsed.date = next;
      index += 1;
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
