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
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `location-normalization-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/location-normalization-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);
const geocodeCostPerThousandUsd = 5;
const geocodeCostGateUsd = 25;
const CONTINENTS = new Set(["north america", "south america", "europe", "asia", "africa", "oceania", "antarctica"]);
const US_REGION_CODES = new Set(["AL", "AK", "AS", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "GU", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MP", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VI", "VT", "WA", "WI", "WV", "WY"]);
const CA_REGION_CODES = new Set(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]);
const US_STATE_NAMES = new Map([
  ["alabama", "AL"], ["alaska", "AK"], ["american samoa", "AS"], ["arizona", "AZ"], ["arkansas", "AR"], ["california", "CA"],
  ["colorado", "CO"], ["connecticut", "CT"], ["delaware", "DE"], ["district of columbia", "DC"], ["florida", "FL"],
  ["georgia", "GA"], ["guam", "GU"], ["hawaii", "HI"], ["idaho", "ID"], ["illinois", "IL"], ["indiana", "IN"],
  ["iowa", "IA"], ["kansas", "KS"], ["kentucky", "KY"], ["louisiana", "LA"], ["maine", "ME"], ["maryland", "MD"],
  ["massachusetts", "MA"], ["michigan", "MI"], ["minnesota", "MN"], ["mississippi", "MS"], ["missouri", "MO"],
  ["montana", "MT"], ["nebraska", "NE"], ["nevada", "NV"], ["new hampshire", "NH"], ["new jersey", "NJ"],
  ["new mexico", "NM"], ["new york", "NY"], ["north carolina", "NC"], ["north dakota", "ND"], ["northern mariana islands", "MP"],
  ["ohio", "OH"], ["oklahoma", "OK"], ["oregon", "OR"], ["pennsylvania", "PA"], ["puerto rico", "PR"], ["rhode island", "RI"],
  ["south carolina", "SC"], ["south dakota", "SD"], ["tennessee", "TN"], ["texas", "TX"], ["utah", "UT"], ["vermont", "VT"],
  ["virginia", "VA"], ["virgin islands", "VI"], ["washington", "WA"], ["west virginia", "WV"], ["wisconsin", "WI"], ["wyoming", "WY"],
]);
const CA_PROVINCE_NAMES = new Map([
  ["alberta", "AB"], ["british columbia", "BC"], ["manitoba", "MB"], ["new brunswick", "NB"], ["newfoundland and labrador", "NL"],
  ["nova scotia", "NS"], ["northwest territories", "NT"], ["nunavut", "NU"], ["ontario", "ON"], ["prince edward island", "PE"],
  ["quebec", "QC"], ["saskatchewan", "SK"], ["yukon", "YT"],
]);
const COUNTRY_ALIASES = new Map([
  ["usa", "US"], ["us", "US"], ["u s", "US"], ["united states", "US"], ["united states of america", "US"], ["america", "US"],
  ["canada", "CA"], ["ca", "CA"],
  ["uk", "GB"], ["u k", "GB"], ["united kingdom", "GB"], ["great britain", "GB"], ["england", "GB"], ["scotland", "GB"], ["wales", "GB"],
  ["korea", "KR"], ["south korea", "KR"], ["republic of korea", "KR"],
  ["thailand", "TH"], ["switzerland", "CH"], ["belgium", "BE"], ["indonesia", "ID"], ["jamaica", "JM"], ["morocco", "MA"],
  ["montenegro", "ME"], ["portugal", "PT"], ["mexico", "MX"], ["spain", "ES"], ["france", "FR"], ["germany", "DE"], ["italy", "IT"],
  ["australia", "AU"], ["new zealand", "NZ"], ["singapore", "SG"], ["hong kong", "HK"], ["japan", "JP"], ["china", "CN"],
  ["united arab emirates", "AE"], ["uae", "AE"], ["turkey", "TR"], ["turkiye", "TR"], ["brazil", "BR"], ["denmark", "DK"],
  ["norway", "NO"], ["sweden", "SE"], ["austria", "AT"], ["greece", "GR"], ["netherlands", "NL"], ["ireland", "IE"],
  ["czech republic", "CZ"], ["czechia", "CZ"], ["poland", "PL"], ["india", "IN"], ["israel", "IL"], ["malaysia", "MY"],
  ["philippines", "PH"], ["vietnam", "VN"], ["south africa", "ZA"], ["costa rica", "CR"], ["colombia", "CO"],
]);
const WELL_KNOWN_CITY_COUNTRIES = new Map([
  ["koh samui", "TH"], ["samui", "TH"], ["bangkok", "TH"], ["chiang mai", "TH"], ["phuket", "TH"],
  ["seoul", "KR"], ["busan", "KR"], ["singapore", "SG"], ["hong kong", "HK"], ["tokyo", "JP"], ["osaka", "JP"],
  ["dubai", "AE"], ["abu dhabi", "AE"], ["zurich", "CH"], ["geneva", "CH"], ["basel", "CH"], ["copenhagen", "DK"],
  ["oslo", "NO"], ["stockholm", "SE"], ["vienna", "AT"], ["madrid", "ES"], ["barcelona", "ES"], ["berlin", "DE"],
  ["munich", "DE"], ["rome", "IT"], ["milan", "IT"], ["athens", "GR"], ["istanbul", "TR"], ["lisbon", "PT"], ["porto", "PT"],
  ["sao paulo", "BR"], ["auckland", "NZ"], ["sydney", "AU"], ["melbourne", "AU"], ["perth", "AU"], ["brisbane", "AU"],
  ["london", "GB"], ["manchester", "GB"], ["cheltenham spa", "GB"], ["esher", "GB"], ["guildford", "GB"], ["cheshire", "GB"],
  ["paris", "FR"], ["cannes", "FR"], ["merano", "IT"], ["mannheim", "DE"], ["bucharest", "RO"], ["prague", "CZ"],
  ["limassol", "CY"], ["nicosia", "CY"], ["petaling jaya", "MY"], ["kuala lumpur", "MY"], ["hyderabad", "IN"],
  ["cape town", "ZA"], ["ekero", "SE"], ["sollentuna", "SE"], ["vasteras", "SE"], ["batangas", "PH"], ["manila", "PH"],
  ["palma de mallorca", "ES"], ["ibiza", "ES"], ["metairie", "US"], ["scottsdale", "US"], ["bay harbor islands", "US"],
  ["sarasota", "US"], ["new york", "US"], ["new york city", "US"], ["nyc", "US"], ["atlanta", "US"], ["jacksonville", "US"],
  ["east brunswick", "US"], ["studio city", "US"], ["austin", "US"], ["honolulu", "US"], ["boston", "US"], ["seattle", "US"],
  ["boca raton", "US"], ["century city", "US"], ["newport beach", "US"], ["west hollywood", "US"], ["woodland hills", "US"],
  ["nashville", "US"], ["montecito", "US"], ["roanoke", "US"], ["chesapeake", "US"], ["colonial heights", "US"],
  ["radford", "US"], ["vancouver", "CA"], ["victoria", "CA"], ["st catharines", "CA"], ["toronto", "CA"], ["mississauga", "CA"],
  ["hamilton", "CA"], ["luxwoude", "NL"], ["t gooi", "NL"], ["chermside", "AU"], ["morningside", "AU"], ["newstead", "AU"],
  ["springfield", "AU"], ["queenstown", "NZ"],
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
  const before = await loadAcceptance(client);
  const plan = buildPlan(preflight);
  const report = await executePlan(client, preflight, before, plan);
  writeReports(report);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportJsonPath)}`);
  console.log(`${dryRun ? "Dry run wrote" : "Wrote"} ${path.relative(ROOT, reportMdPath)}`);
  console.log(`Summary: ${JSON.stringify(report.summary)}`);
} finally {
  await client.end();
}

async function loadPreflight(pgClient) {
  const locations = await pgClient.query(`
    SELECT id, name, slug, address, locality, region, postal_code, country_code, country_name, website, latitude, longitude
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
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
        `locations_backup_${phaseDate}_location_normalization`,
        `location_normalization_audit_${phaseDate}`,
        `location_normalization_review_${phaseDate}`,
      ],
    ],
  );
  return {
    locations: locations.rows,
    existingTables: existingTables.rows.map((row) => row.table_name),
  };
}

async function loadAcceptance(pgClient) {
  const counts = await pgClient.query(`
    SELECT
      COUNT(*)::int AS total_locations,
      COUNT(*) FILTER (WHERE lower(trim(COALESCE(locality, ''))) = 'usa')::int AS locality_usa,
      COUNT(*) FILTER (
        WHERE region IS NOT NULL
          AND (
            region LIKE '%,%'
            OR lower(trim(region)) IN ('north america', 'south america', 'europe', 'asia', 'africa', 'oceania', 'antarctica')
          )
      )::int AS bad_region,
      COUNT(*) FILTER (WHERE COALESCE(country_code, '') = '')::int AS no_country_code,
      COUNT(*) FILTER (
        WHERE COALESCE(country_code, '') <> ''
          AND (COALESCE(country_name, '') = '' OR upper(trim(country_name)) = upper(trim(country_code)))
      )::int AS bad_country_name,
      COUNT(*) FILTER (
        WHERE website ~* '([?&](utm_[^=&]+|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi)=)'
      )::int AS tracking_websites,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::int AS coordinate_coverage,
      COUNT(*) FILTER (
        WHERE latitude IS NULL
          AND longitude IS NULL
          AND COALESCE(address, '') <> ''
          AND address LIKE '%,%'
      )::int AS geocode_candidates,
      COUNT(*) FILTER (
        WHERE country_code IN ('US', 'CA')
          AND region IS NOT NULL
          AND trim(region) <> ''
          AND NOT (
            (country_code = 'US' AND upper(trim(region)) = ANY($1::text[]))
            OR (country_code = 'CA' AND upper(trim(region)) = ANY($2::text[]))
          )
      )::int AS invalid_us_ca_regions
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
  `, [Array.from(US_REGION_CODES), Array.from(CA_REGION_CODES)]);

  const noCountryLeftovers = await pgClient.query(`
    SELECT id, name, address, locality, region, country_code, country_name
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
      AND COALESCE(country_code, '') = ''
    ORDER BY id
    LIMIT 250
  `);
  const contradictionLeftovers = await pgClient.query(`
    SELECT id, name, address, locality, region, country_code, country_name
    FROM ${quoteIdent(schema)}.locations
    WHERE deleted_at IS NULL
      AND (
        lower(trim(COALESCE(locality, ''))) = 'usa'
        OR region LIKE '%,%'
        OR lower(trim(COALESCE(region, ''))) IN ('north america', 'south america', 'europe', 'asia', 'africa', 'oceania', 'antarctica')
        OR (
          country_code IN ('US', 'CA')
          AND region IS NOT NULL
          AND trim(region) <> ''
          AND NOT (
            (country_code = 'US' AND upper(trim(region)) = ANY($1::text[]))
            OR (country_code = 'CA' AND upper(trim(region)) = ANY($2::text[]))
          )
        )
      )
    ORDER BY id
    LIMIT 250
  `, [Array.from(US_REGION_CODES), Array.from(CA_REGION_CODES)]);

  return {
    ...counts.rows[0],
    estimated_geocode_cost_usd: Number(counts.rows[0].geocode_candidates) * geocodeCostPerThousandUsd / 1000,
    no_country_leftovers: noCountryLeftovers.rows,
    contradiction_leftovers: contradictionLeftovers.rows,
  };
}

function buildPlan(preflight) {
  if (!dryRun && preflight.existingTables.length) {
    throw new Error(`Refusing to run because location normalization tables already exist: ${preflight.existingTables.join(", ")}`);
  }

  const updates = [];
  const audit = [];
  const review = [];

  for (const location of preflight.locations) {
    const next = {
      id: location.id,
      address: location.address,
      locality: location.locality,
      region: location.region,
      postal_code: location.postal_code,
      country_code: location.country_code,
      country_name: location.country_name,
      website: location.website,
    };
    const parsed = parseAddress(location.address);
    const normalizedCountryCode = normalizeCountryCode(location.country_code);
    const addressCountryCode = parsed.countryCode;
    const localCityCountry = cityCountryCode(location.locality) || cityCountryCode(parsed.city);
    const inferredRegionCountry = !normalizedCountryCode && regionCountryCode(location.region);
    const chosenCountryCode = chooseCountryCode(location, parsed, localCityCountry, inferredRegionCountry);

    setField(next, location, audit, "address", trimOrNull(location.address), "address_trim");

    if (chosenCountryCode && normalizedCountryCode !== chosenCountryCode) {
      if (!normalizedCountryCode || countryContradictsAddress(location, chosenCountryCode, parsed, localCityCountry)) {
        setField(next, location, audit, "country_code", chosenCountryCode, "country_code_from_address_or_city");
      } else {
        addReview(review, location, "country_contradiction_unresolved", { parsed_country_code: chosenCountryCode, current_country_code: normalizedCountryCode });
      }
    } else if (normalizedCountryCode && location.country_code !== normalizedCountryCode) {
      setField(next, location, audit, "country_code", normalizedCountryCode, "country_code_normalized");
    }

    const effectiveCountryCode = next.country_code || normalizedCountryCode || chosenCountryCode;
    const expectedCountryName = countryNameForCode(effectiveCountryCode);
    if (effectiveCountryCode && expectedCountryName && location.country_name !== expectedCountryName) {
      setField(next, location, audit, "country_name", expectedCountryName, "country_name_iso3166");
    }

    const regionRepair = repairRegion(location.region, effectiveCountryCode, parsed);
    if (regionRepair.shouldWrite) {
      setField(next, location, audit, "region", regionRepair.value, regionRepair.rule);
    } else if (regionRepair.review) {
      addReview(review, location, regionRepair.review, { region: location.region, country_code: effectiveCountryCode, parsed });
    }

    const localityRepair = repairLocality(location.locality, next.region, effectiveCountryCode, parsed);
    if (localityRepair.shouldWrite) {
      setField(next, location, audit, "locality", localityRepair.value, localityRepair.rule);
    } else if (localityRepair.review) {
      addReview(review, location, localityRepair.review, { locality: location.locality, parsed_city: parsed.city, parsed_country_code: parsed.countryCode });
    }

    if ((!location.postal_code || !String(location.postal_code).trim()) && parsed.postalCode) {
      setField(next, location, audit, "postal_code", parsed.postalCode, "postal_code_from_address");
    }

    const cleanedWebsite = sanitizeUrl(location.website);
    if (cleanedWebsite !== location.website) {
      setField(next, location, audit, "website", cleanedWebsite, "website_tracking_params_removed");
    }

    if (effectiveCountryCode && localCityCountry && localCityCountry !== effectiveCountryCode && !addressCountryCode) {
      addReview(review, location, "locality_country_possible_mismatch", {
        locality_country_code: localCityCountry,
        current_country_code: effectiveCountryCode,
      });
    }

    if (parsed.city && location.locality && !isJunkLocality(location.locality, effectiveCountryCode, next.region)) {
      const normalizedCurrentLocality = normalizeText(location.locality);
      const normalizedParsedCity = normalizeText(parsed.city);
      if (normalizedCurrentLocality !== normalizedParsedCity && !normalizedParsedCity.includes(normalizedCurrentLocality) && !normalizedCurrentLocality.includes(normalizedParsedCity)) {
        addReview(review, location, "address_city_differs_from_locality", { locality: location.locality, parsed_city: parsed.city });
      }
    }

    if (!effectiveCountryCode) {
      addReview(review, location, "country_unresolved", {
        address: location.address,
        locality: location.locality,
        region: location.region,
      });
    }

    if (JSON.stringify(next) !== JSON.stringify({
      id: location.id,
      address: location.address,
      locality: location.locality,
      region: location.region,
      postal_code: location.postal_code,
      country_code: location.country_code,
      country_name: location.country_name,
      website: location.website,
    })) {
      updates.push(next);
    }
  }

  return {
    updates,
    audit,
    review: dedupeReview(review),
    geocoding: {
      attempted: false,
      reason: "Coordinate backfill is cost-gated. Estimated cost is calculated in the report; no Google Geocoding API calls were made.",
      low_confidence: [],
    },
  };
}

async function executePlan(pgClient, preflight, before, plan) {
  await pgClient.query("BEGIN");
  try {
    await ensureBackupAndReportTables(pgClient);
    await insertAuditAndReview(pgClient, plan);
    await withGenericAuditTriggerDisabled(pgClient, () => applyLocationUpdates(pgClient, plan.updates));
    await refreshSearchIndex(pgClient, plan.updates.map((row) => row.id));
    const after = await loadAcceptance(pgClient);
    if (dryRun) {
      await pgClient.query("ROLLBACK");
    } else {
      await pgClient.query("COMMIT");
    }
    return buildReport(preflight, before, after, plan);
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

async function withGenericAuditTriggerDisabled(pgClient, callback) {
  await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations DISABLE TRIGGER trg_audit_entity_change`);
  try {
    return await callback();
  } finally {
    await pgClient.query(`ALTER TABLE ${quoteIdent(schema)}.locations ENABLE TRIGGER trg_audit_entity_change`);
  }
}

async function ensureBackupAndReportTables(pgClient) {
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`locations_backup_${phaseDate}_location_normalization`)} AS
    SELECT * FROM ${quoteIdent(schema)}.locations
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`location_normalization_audit_${phaseDate}`)} (
      location_id integer NOT NULL,
      field text NOT NULL,
      old_value text,
      new_value text,
      rule text NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);
  await pgClient.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(`location_normalization_review_${phaseDate}`)} (
      location_id integer NOT NULL,
      name text,
      reason text NOT NULL,
      detail jsonb,
      created_at timestamptz DEFAULT now()
    )
  `);
}

async function insertAuditAndReview(pgClient, plan) {
  if (plan.audit.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_normalization_audit_${phaseDate}`)}
        (location_id, field, old_value, new_value, rule)
      SELECT location_id, field, old_value, new_value, rule
      FROM jsonb_to_recordset($1::jsonb) AS x(location_id integer, field text, old_value text, new_value text, rule text)
      `,
      [JSON.stringify(plan.audit)],
    );
  }
  if (plan.review.length) {
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(`location_normalization_review_${phaseDate}`)}
        (location_id, name, reason, detail)
      SELECT location_id, name, reason, detail
      FROM jsonb_to_recordset($1::jsonb) AS x(location_id integer, name text, reason text, detail jsonb)
      `,
      [JSON.stringify(plan.review)],
    );
  }
}

async function applyLocationUpdates(pgClient, updates) {
  if (!updates.length) {
    return;
  }
  await pgClient.query(
    `
    UPDATE ${quoteIdent(schema)}.locations l
    SET
      address = x.address,
      locality = x.locality,
      region = x.region,
      postal_code = x.postal_code,
      country_code = x.country_code,
      country_name = x.country_name,
      website = x.website
    FROM jsonb_to_recordset($1::jsonb) AS x(
      id integer,
      address text,
      locality text,
      region text,
      postal_code text,
      country_code text,
      country_name text,
      website text
    )
    WHERE l.id = x.id
    `,
    [JSON.stringify(updates)],
  );
}

async function refreshSearchIndex(pgClient, locationIds) {
  if (!locationIds.length) {
    return;
  }
  const exists = await pgClient.query(`SELECT to_regprocedure($1) AS proc`, [`${schema}.refresh_search_index_for_location(integer)`]);
  if (!exists.rows[0].proc) {
    return;
  }
  await pgClient.query(
    `
    SELECT ${quoteIdent(schema)}.refresh_search_index_for_location(id)
    FROM unnest($1::int[]) AS ids(id)
    `,
    [unique(locationIds)],
  );
}

function buildReport(preflight, before, after, plan) {
  const changesByField = countBy(plan.audit, "field");
  const changesByRule = countBy(plan.audit, "rule");
  const reviewByReason = countBy(plan.review, "reason");
  return {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    schema,
    raw_schema: rawSchema,
    backup_table: `${rawSchema}.locations_backup_${phaseDate}_location_normalization`,
    audit_table: `${rawSchema}.location_normalization_audit_${phaseDate}`,
    review_table: `${rawSchema}.location_normalization_review_${phaseDate}`,
    summary: {
      total_locations: before.total_locations,
      changed_locations: plan.updates.length,
      audited_field_changes: plan.audit.length,
      review_rows: plan.review.length,
      tracking_websites_cleaned: changesByRule.website_tracking_params_removed || 0,
      geocode_candidates: before.geocode_candidates,
      estimated_geocode_cost_usd: Number(before.estimated_geocode_cost_usd.toFixed(2)),
      geocoding_attempted: false,
      geocoding_blocked_by_cost_gate: before.estimated_geocode_cost_usd > geocodeCostGateUsd,
    },
    before,
    after,
    changes_by_field: changesByField,
    changes_by_rule: changesByRule,
    review_by_reason: reviewByReason,
    review_rows: plan.review.slice(0, 500),
    no_country_leftovers: after.no_country_leftovers,
    contradiction_leftovers: after.contradiction_leftovers,
    low_confidence_geocoding: plan.geocoding.low_confidence,
    geocoding: {
      ...plan.geocoding,
      cost_gate_usd: geocodeCostGateUsd,
      cost_per_1000_usd: geocodeCostPerThousandUsd,
      estimated_cost_usd: Number(before.estimated_geocode_cost_usd.toFixed(2)),
    },
    notes: [
      "Address strings were only trimmed; internal address content was not rewritten.",
      "Offerings, reviews, tags, organizations, and practitioners were not updated by this script.",
    ],
    sample_changed_location_ids: plan.updates.slice(0, 80).map((row) => row.id),
    source_location_count: preflight.locations.length,
  };
}

function writeReports(report) {
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
}

function renderMarkdown(report) {
  const after = report.after;
  const before = report.before;
  const lines = [
    `# Location Normalization Report (${phaseDate})`,
    "",
    `Mode: ${report.dry_run ? "dry run" : "live write"}`,
    "",
    "## Summary",
    "",
    `- Locations scanned: ${report.summary.total_locations}`,
    `- Locations changed: ${report.summary.changed_locations}`,
    `- Audited field changes: ${report.summary.audited_field_changes}`,
    `- Review rows: ${report.summary.review_rows}`,
    `- Website tracking URLs cleaned: ${report.summary.tracking_websites_cleaned}`,
    `- Coordinate coverage: ${before.coordinate_coverage} before, ${after.coordinate_coverage} after`,
    `- Geocode candidates: ${before.geocode_candidates}`,
    `- Estimated geocoding cost: $${report.geocoding.estimated_cost_usd.toFixed(2)} at $${geocodeCostPerThousandUsd}/1k`,
    `- Geocoding attempted: ${report.summary.geocoding_attempted ? "yes" : "no"}`,
    `- Geocoding cost gate: ${report.summary.geocoding_blocked_by_cost_gate ? "blocked pending confirmation" : "not blocked"}`,
    "",
    "## Acceptance Counts",
    "",
    "| Check | Before | After |",
    "| --- | ---: | ---: |",
    `| locality = USA | ${before.locality_usa} | ${after.locality_usa} |`,
    `| bad region comma/continent | ${before.bad_region} | ${after.bad_region} |`,
    `| invalid US/CA region values | ${before.invalid_us_ca_regions} | ${after.invalid_us_ca_regions} |`,
    `| country_code missing | ${before.no_country_code} | ${after.no_country_code} |`,
    `| bad country_name | ${before.bad_country_name} | ${after.bad_country_name} |`,
    `| websites with tracking params | ${before.tracking_websites} | ${after.tracking_websites} |`,
    "",
    "## Changes By Field",
    "",
    renderCountTable(report.changes_by_field),
    "",
    "## Changes By Rule",
    "",
    renderCountTable(report.changes_by_rule),
    "",
    "## Review Reasons",
    "",
    renderCountTable(report.review_by_reason),
    "",
    "## Remaining No-Country Rows",
    "",
    renderRows(report.no_country_leftovers, ["id", "name", "address", "locality", "region"], 80),
    "",
    "## Contradiction / Cleanup Leftovers",
    "",
    renderRows(report.contradiction_leftovers, ["id", "name", "address", "locality", "region", "country_code", "country_name"], 80),
    "",
    "## Audit Tables",
    "",
    `- Backup: \`${report.backup_table}\``,
    `- Field audit: \`${report.audit_table}\``,
    `- Review list: \`${report.review_table}\``,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function renderCountTable(counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    return "_None._";
  }
  return ["| Value | Count |", "| --- | ---: |", ...entries.map(([key, value]) => `| ${escapeMd(key)} | ${value} |`)].join("\n");
}

function renderRows(rows, columns, limit) {
  if (!rows.length) {
    return "_None._";
  }
  const visible = rows.slice(0, limit);
  return [
    `Showing ${visible.length}${rows.length > visible.length ? ` of ${rows.length}` : ""}.`,
    "",
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...visible.map((row) => `| ${columns.map((column) => escapeMd(row[column] ?? "")).join(" | ")} |`),
  ].join("\n");
}

function parseAddress(address) {
  const trimmed = trimOrNull(address);
  if (!trimmed) {
    return {};
  }
  const stripped = trimmed.replace(/\s+MAP\.?$/i, "").trim();
  const rawParts = stripped.split(",").map((part) => part.trim()).filter(Boolean);
  if (!rawParts.length) {
    return {};
  }

  const countryPartIndex = findCountryPartIndex(rawParts);
  const countryCode = countryPartIndex >= 0 ? countryCodeFromText(rawParts[countryPartIndex]) : countryCodeFromText(rawParts.at(-1));
  const parts = countryPartIndex >= 0 ? rawParts.slice(0, countryPartIndex) : [...rawParts];
  const result = { countryCode };

  if (!countryCode) {
    const usGuess = parseUsParts(parts);
    if (usGuess.region && usGuess.postalCode) {
      return { countryCode: "US", ...usGuess };
    }
    const caGuess = parseCaParts(parts);
    if (caGuess.region && caGuess.postalCode) {
      return { countryCode: "CA", ...caGuess };
    }
  }

  if (countryCode === "US") {
    const us = parseUsParts(parts);
    return { ...result, ...us };
  }
  if (countryCode === "CA") {
    const ca = parseCaParts(parts);
    return { ...result, ...ca };
  }

  const embeddedCountry = countryCodeFromText(stripped);
  if (!result.countryCode && embeddedCountry) {
    result.countryCode = embeddedCountry;
  }

  const korean = parseKoreanAddress(stripped, parts);
  if (korean) {
    return { ...result, countryCode: result.countryCode || "KR", ...korean };
  }

  const last = parts.at(-1);
  if (last) {
    const cityFromLast = cityFromLoosePart(last);
    if (cityFromLast) {
      result.city = cityFromLast;
    } else if (!looksLikeStreet(last)) {
      result.city = cleanCity(last);
    }
  }
  if (!result.city && parts.length >= 2) {
    const maybeCity = cleanCity(parts.at(-2));
    if (maybeCity && !looksLikeStreet(maybeCity)) {
      result.city = maybeCity;
    }
  }

  if (!result.countryCode && result.city) {
    result.countryCode = cityCountryCode(result.city);
  }
  return result;
}

function parseUsParts(parts) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    const combined = part.match(/\b([A-Z]{2}|[A-Za-z][A-Za-z .'-]+)\s+(\d{5}(?:-\d{4})?)\b/);
    if (combined) {
      const region = normalizeRegionCode(combined[1], "US");
      if (region) {
        return {
          city: cleanCity(parts[index - 1]),
          region,
          postalCode: combined[2],
        };
      }
    }
    const region = normalizeRegionCode(part, "US");
    if (region) {
      const postalPart = parts[index + 1] || "";
      const postal = postalPart.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || part.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || null;
      return {
        city: cleanCity(parts[index - 1]),
        region,
        postalCode: postal,
      };
    }
  }
  return {};
}

function parseCaParts(parts) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    const postal = part.match(/[A-Z]\d[A-Z][ -]?\d[A-Z]\d/i)?.[0]?.toUpperCase();
    const provinceMatch = part.match(/\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Nova Scotia|Northwest Territories|Nunavut|Ontario|Prince Edward Island|Quebec|Saskatchewan|Yukon)\b/i);
    const region = provinceMatch ? normalizeRegionCode(provinceMatch[1], "CA") : null;
    if (region) {
      return {
        city: cleanCity(parts[index - 1]),
        region,
        postalCode: postal || null,
      };
    }
  }
  return {};
}

function parseKoreanAddress(address, parts) {
  if (!/\b(korea|republic of korea|south korea)\b/i.test(address) && !/\bseoul\b/i.test(address) && !/[가-힣]/.test(address)) {
    return null;
  }
  const city = /\bseoul\b/i.test(address) || /서울/.test(address) ? "Seoul" : cleanCity(parts.at(-1));
  const district = parts.find((part) => /-gu\b/i.test(part) || /\bgu\b/i.test(part) || /강남/.test(part));
  return {
    city,
    region: district ? cleanCity(district) : null,
  };
}

function chooseCountryCode(location, parsed, localCityCountry, inferredRegionCountry) {
  const current = normalizeCountryCode(location.country_code);
  if (parsed.countryCode) {
    return parsed.countryCode;
  }
  if (!current && inferredRegionCountry) {
    return inferredRegionCountry;
  }
  if (!current && localCityCountry) {
    return localCityCountry;
  }
  if (current && localCityCountry && countryNameOrCodeJunk(location.country_name, current)) {
    return localCityCountry;
  }
  return current;
}

function countryContradictsAddress(location, chosenCountryCode, parsed, localCityCountry) {
  const current = normalizeCountryCode(location.country_code);
  if (!current) {
    return true;
  }
  if (parsed.countryCode && parsed.countryCode !== current) {
    return true;
  }
  if (localCityCountry && localCityCountry !== current && isWellKnownCity(location.locality)) {
    return true;
  }
  return false;
}

function repairRegion(region, countryCode, parsed) {
  const trimmed = trimOrNull(region);
  if (countryCode === "US" || countryCode === "CA") {
    const parsedRegion = parsed.region ? normalizeRegionCode(parsed.region, countryCode) : null;
    const currentRegion = normalizeRegionCode(trimmed, countryCode);
    if (parsedRegion && currentRegion !== parsedRegion) {
      return { shouldWrite: true, value: parsedRegion, rule: "region_from_address" };
    }
    if (currentRegion && trimmed !== currentRegion) {
      return { shouldWrite: true, value: currentRegion, rule: "region_normalized_to_code" };
    }
    if (trimmed && !currentRegion) {
      return { shouldWrite: true, value: null, rule: "invalid_us_ca_region_cleared" };
    }
    return { shouldWrite: false };
  }

  if (!trimmed) {
    return parsed.region && !isContinent(parsed.region) ? { shouldWrite: true, value: parsed.region, rule: "region_from_address_non_us_ca" } : { shouldWrite: false };
  }
  if (isContinent(trimmed)) {
    return { shouldWrite: true, value: null, rule: "continent_region_cleared" };
  }
  if (trimmed.includes(",")) {
    return { shouldWrite: true, value: parsed.region && !isContinent(parsed.region) ? parsed.region : null, rule: "compound_region_cleared" };
  }
  if (countryNameForCode(countryCode) && normalizeText(trimmed) === normalizeText(countryNameForCode(countryCode))) {
    return { shouldWrite: true, value: null, rule: "region_equal_country_cleared" };
  }
  return { shouldWrite: false };
}

function repairLocality(locality, region, countryCode, parsed) {
  const trimmed = trimOrNull(locality);
  const parsedCity = parsed.city ? cleanCity(parsed.city) : null;
  if (isJunkLocality(trimmed, countryCode, region)) {
    return {
      shouldWrite: true,
      value: parsedCity || null,
      rule: parsedCity ? "locality_from_address" : "junk_locality_cleared",
    };
  }
  if (!trimmed && parsedCity) {
    return { shouldWrite: true, value: parsedCity, rule: "locality_from_address" };
  }
  return { shouldWrite: false };
}

function setField(next, original, audit, field, value, rule) {
  const normalizedValue = value === "" ? null : value;
  const oldValue = original[field] === "" ? null : original[field];
  if (oldValue === normalizedValue) {
    return;
  }
  next[field] = normalizedValue;
  audit.push({
    location_id: original.id,
    field,
    old_value: oldValue == null ? null : String(oldValue),
    new_value: normalizedValue == null ? null : String(normalizedValue),
    rule,
  });
}

function addReview(review, location, reason, detail) {
  review.push({
    location_id: location.id,
    name: location.name || null,
    reason,
    detail,
  });
}

function dedupeReview(review) {
  const seen = new Set();
  const result = [];
  for (const row of review) {
    const key = `${row.location_id}:${row.reason}:${JSON.stringify(row.detail)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(row);
  }
  return result;
}

function countryCodeFromText(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  if (COUNTRY_ALIASES.has(normalized)) {
    return COUNTRY_ALIASES.get(normalized);
  }
  const compact = normalized.replace(/^the /, "");
  return COUNTRY_ALIASES.get(compact) || null;
}

function findCountryPartIndex(parts) {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (countryCodeFromText(parts[index])) {
      return index;
    }
  }
  return -1;
}

function normalizeCountryCode(value) {
  const trimmed = trimOrNull(value);
  if (!trimmed) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

function countryNameForCode(code) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) {
    return null;
  }
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) || null;
  } catch {
    return null;
  }
}

function countryNameOrCodeJunk(name, code) {
  const trimmed = trimOrNull(name);
  return !trimmed || trimmed.toUpperCase() === normalizeCountryCode(code);
}

function normalizeRegionCode(value, countryCode) {
  const trimmed = trimOrNull(value);
  if (!trimmed) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  if (countryCode === "US") {
    if (US_REGION_CODES.has(upper)) {
      return upper;
    }
    return US_STATE_NAMES.get(normalizeText(trimmed)) || null;
  }
  if (countryCode === "CA") {
    if (CA_REGION_CODES.has(upper)) {
      return upper;
    }
    return CA_PROVINCE_NAMES.get(normalizeText(trimmed)) || null;
  }
  return null;
}

function regionCountryCode(region) {
  const trimmed = trimOrNull(region);
  if (!trimmed) {
    return null;
  }
  if (normalizeRegionCode(trimmed, "US")) {
    return "US";
  }
  if (normalizeRegionCode(trimmed, "CA")) {
    return "CA";
  }
  return null;
}

function isJunkLocality(locality, countryCode, region) {
  const normalized = normalizeText(locality);
  if (!normalized) {
    return true;
  }
  if (["usa", "united states", "united states of america", "north america", "south america", "europe", "asia", "africa", "oceania"].includes(normalized)) {
    return true;
  }
  const countryName = countryNameForCode(countryCode);
  if (countryName && normalized === normalizeText(countryName)) {
    return true;
  }
  if (region && normalized === normalizeText(region)) {
    return true;
  }
  return false;
}

function isContinent(value) {
  return CONTINENTS.has(normalizeText(value));
}

function cityCountryCode(value) {
  const normalized = normalizeText(value);
  return WELL_KNOWN_CITY_COUNTRIES.get(normalized) || null;
}

function isWellKnownCity(value) {
  return Boolean(cityCountryCode(value));
}

function cleanCity(value) {
  const trimmed = trimOrNull(value);
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\s+MAP\.?$/i, "").replace(/\s+/g, " ").trim();
}

function cityFromLoosePart(value) {
  const trimmed = cleanCity(value);
  if (!trimmed) {
    return null;
  }
  const normalized = normalizeText(trimmed);
  if (WELL_KNOWN_CITY_COUNTRIES.has(normalized)) {
    return trimmed;
  }
  return null;
}

function looksLikeStreet(value) {
  const normalized = normalizeText(value);
  return /\d/.test(value) || /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|suite|ste|floor|fl|building|bldg|way|court|ct|place|pl|highway|hwy|parkway|pkwy|circle|cir)\b/.test(normalized);
}

function trimOrNull(value) {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeText(value) {
  return trimOrNull(value)?.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim() || "";
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    counts[row[key]] = (counts[row[key]] || 0) + 1;
  }
  return counts;
}

function unique(values) {
  return Array.from(new Set(values));
}

function escapeMd(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
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
