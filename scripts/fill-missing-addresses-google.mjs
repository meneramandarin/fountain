#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { closePool, query, withTransaction, setMutationActor } from "../pipeline/lib/db.mjs";
import { createPlacesClient } from "../pipeline/lib/places.mjs";
import { withRun } from "../pipeline/lib/runs.mjs";
import { requirePipelineCredentials } from "./lib/pipeline-env.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTPUT_PATH = path.join(ROOT, "tmp", "location-google-address-fill-20260723.json");
const ACTOR_ID = "0d450afb-8d47-47cf-8908-5fa3cdb8c660";
const ACTOR_LABEL = "Google Places missing-address fill 2026-07-23";
const APPLY = process.argv.includes("--apply");
const LIVE = process.argv.includes("--live");
const RESUME = process.argv.includes("--resume");
const DOMAIN_RETRY = process.argv.includes("--domain-retry");
const CONCURRENCY = 12;
const BUDGET_USD = 2;
const REVIEW_APPROVALS = new Map([
  [2388, "Exact HOOKE brand match in London"],
  [2393, "Exact Biograph name, website domain, and stored Place ID"],
  [2442, "Stored Place ID with strong clinic-name and Seoul match"],
  [4241, "Exact Optimize U branch name, domain, and coordinates"],
  [9312, "Exact Rocky Mountain Hyperbaric name and coordinates"],
  [9413, "Exact Body Therapeutic Architecture name and coordinates"],
  [9425, "Exact Zativa business name near the supplied coordinates"],
  [9435, "Stored Place ID with exact Frio name and coordinates"],
  [13892, "Exact Royal Clinics name in Riyadh near supplied coordinates"],
  [13969, "Oxygenise brand match near supplied Virginia Water coordinates"],
  [14011, "Exact official Centrum Barokomor domain and Prague match"],
  [14255, "Lundborg Clinic name and Sävedalen location match"],
  [14257, "Exact AlSharq Hospital name and official website domain"],
  [14328, "Exact Reenergon official website domain and business identity"],
  [14392, "Specialized Medical Center/SMC hospital identity in Riyadh"],
]);
const REVIEW_REJECTIONS = new Map([
  [4111, "False positive: Glendale, Arizona business does not match the Glendale, California coordinates"],
]);

requirePipelineCredentials({ database: true, places: true });
if (!LIVE) {
  throw new Error("Live Google calls require --live. No database writes occur without --apply.");
}
process.env.PLACES_LIVE = "1";

try {
  const outcome = await withRun({
    command: "fill-missing-addresses-google",
    args: { apply: APPLY, live: LIVE, resume: RESUME, domain_retry: DOMAIN_RETRY, concurrency: CONCURRENCY },
    dryRun: !APPLY,
    budgetUsd: BUDGET_USD,
  }, async (run) => {
    const places = createPlacesClient();
    const locations = await loadLocations();
    const results = RESUME
      ? await loadReviewedResults(locations)
      : await concurrentMap(locations, CONCURRENCY, (location) =>
        resolveAddress(location, places, run.id));
    results.sort((left, right) => left.location.id - right.location.id);

    const accepted = results.filter((result) => result.decision === "ready");
    const unresolved = results.filter((result) => result.decision !== "ready");
    const applied = APPLY ? await applyResults(accepted, run.id) : { updated: 0 };
    const finalCounts = await loadCounts();
    const document = {
      generated_at: new Date().toISOString(),
      run_id: String(run.id),
      apply: APPLY,
      resumed: RESUME,
      counts: {
        input: locations.length,
        cached_google_addresses: results.filter((row) => row.method === "cached_verified_google_details").length,
        live_details_by_stored_place_id: results.filter((row) => row.method === "stored_place_id_details").length,
        live_text_search_matches: results.filter((row) => row.method === "text_search_details").length,
        ready: accepted.length,
        unresolved: unresolved.length,
        updated: applied.updated,
        remaining_missing_addresses: finalCounts.missing_addresses,
        remaining_missing_coordinates: finalCounts.missing_coordinates,
      },
      estimated_live_cost_usd: RESUME
        ? 0
        : results.reduce((sum, row) => sum + (row.estimated_cost_usd || 0), 0),
      results,
    };
    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    await places.close();
    return {
      counts: document.counts,
      notes: `Google address fill; output ${OUTPUT_PATH}`,
      document,
    };
  });
  console.log(JSON.stringify({
    run_id: String(outcome.runId),
    ...outcome.document.counts,
    estimated_live_cost_usd: outcome.document.estimated_live_cost_usd,
    output: OUTPUT_PATH,
  }, null, 2));
} finally {
  await closePool();
}

async function loadLocations() {
  const result = await query(`
    SELECT
      location.id, location.slug, location.name, location.address,
      location.locality, location.region, location.postal_code,
      location.country_code, location.country_name, location.website,
      location.latitude, location.longitude,
      place.provider, place.provider_place_id, place.display_name,
      place.match_status, place.match_confidence, place.raw_json
    FROM fountain.locations location
    LEFT JOIN LATERAL (
      SELECT match.*
      FROM fountain.external_place_matches match
      WHERE match.location_id = location.id
        AND match.provider ILIKE 'google%'
        AND NULLIF(btrim(match.provider_place_id), '') IS NOT NULL
      ORDER BY
        (match.match_status = 'details_verified') DESC,
        match.match_confidence DESC NULLS LAST,
        (match.provider = 'google_places') DESC,
        match.fetched_at DESC
      LIMIT 1
    ) place ON true
    WHERE location.status = 'active'
      AND location.deleted_at IS NULL
      AND NOT location.is_virtual
      AND NULLIF(btrim(location.address), '') IS NULL
    ORDER BY location.id
  `);
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    latitude: finiteNumber(row.latitude),
    longitude: finiteNumber(row.longitude),
    match_confidence: finiteNumber(row.match_confidence),
  }));
}

async function loadReviewedResults(locations) {
  const previous = JSON.parse(await readFile(OUTPUT_PATH, "utf8"));
  const currentById = new Map(locations.map((location) => [location.id, location]));
  return previous.results
    .filter((result) => currentById.has(result.location.id))
    .map((result) => {
      const location = currentById.get(result.location.id);
      const rejection = REVIEW_REJECTIONS.get(location.id);
      if (rejection) {
        return {
          ...result,
          location: locationSnapshot(location),
          decision: "unresolved",
          reason: "reviewed_google_false_positive",
          validation: {
            ...result.validation,
            accepted: false,
            reason: "reviewed_google_false_positive",
            review_rationale: rejection,
          },
        };
      }
      const rationale = REVIEW_APPROVALS.get(location.id);
      if (!rationale || !result.proposed_address) {
        return { ...result, location: locationSnapshot(location) };
      }
      return {
        ...result,
        location: locationSnapshot(location),
        decision: "ready",
        reason: "reviewed_google_business_identity_match",
        validation: {
          ...result.validation,
          accepted: true,
          reason: "reviewed_google_business_identity_match",
          review_rationale: rationale,
        },
      };
    });
}

async function resolveAddress(location, places, runId) {
  const cachedAddress = cleanText(location.raw_json?.formattedAddress);
  if (
    cachedAddress
    && location.match_status === "details_verified"
    && (location.match_confidence ?? 0) >= 0.95
  ) {
    return readyResult(location, {
      method: "cached_verified_google_details",
      address: cachedAddress,
      placeId: location.provider_place_id,
      details: location.raw_json,
      validation: {
        accepted: true,
        reason: "previously_details_verified_google_match",
        match_confidence: location.match_confidence,
      },
      estimatedCostUsd: 0,
    });
  }

  try {
    if (location.provider_place_id && location.match_status !== "low_confidence") {
      const response = await places.getDetails({
        runId,
        taskType: "contact_fill",
        entityId: location.id,
        placeId: location.provider_place_id,
        regionCode: location.country_code || undefined,
      });
      return resultFromDetails(location, response, {
        method: "stored_place_id_details",
        placeId: location.provider_place_id,
        storedIdentity: true,
        estimatedCostUsd: response.costEstimateUsd,
      });
    }

    const search = await places.searchText({
      runId,
      taskType: "contact_fill",
      entityId: location.id,
      textQuery: searchQuery(location),
      regionCode: location.country_code || undefined,
      maxResultCount: 1,
      locationBias: coordinateBias(location),
    });
    const placeId = cleanText(search.data?.places?.[0]?.id);
    if (!placeId) return unresolvedResult(location, "google_text_search_no_result", 0);
    const details = await places.getDetails({
      runId,
      taskType: "contact_fill",
      entityId: location.id,
      placeId,
      regionCode: location.country_code || undefined,
    });
    return resultFromDetails(location, details, {
      method: "text_search_details",
      placeId,
      storedIdentity: false,
      estimatedCostUsd: (search.costEstimateUsd || 0) + (details.costEstimateUsd || 0),
    });
  } catch (error) {
    return unresolvedResult(location, `google_error: ${error.message}`, 0);
  }
}

function resultFromDetails(location, response, {
  method, placeId, storedIdentity, estimatedCostUsd,
}) {
  const details = response.data || {};
  const address = cleanText(details.formattedAddress);
  const validation = validateDetails(location, details, { storedIdentity });
  if (!address || !validation.accepted) {
    return {
      location: locationSnapshot(location),
      decision: "unresolved",
      reason: address ? validation.reason : "google_formatted_address_missing",
      method,
      provider_place_id: placeId,
      proposed_address: address,
      validation,
      google_details: detailsSnapshot(details),
      estimated_cost_usd: estimatedCostUsd || 0,
    };
  }
  return readyResult(location, {
    method,
    address,
    placeId,
    details,
    validation,
    estimatedCostUsd,
  });
}

function validateDetails(location, details, { storedIdentity }) {
  const address = cleanText(details.formattedAddress);
  const displayName = cleanText(details.displayName?.text || details.displayName);
  const returnedLatitude = finiteNumber(details.location?.latitude);
  const returnedLongitude = finiteNumber(details.location?.longitude);
  const distanceKm = haversineKm(
    location.latitude, location.longitude, returnedLatitude, returnedLongitude);
  const nameSimilarity = tokenDice(location.name, displayName);
  const localityMatch = includesNormalized(address, location.locality);
  const countryMatch = includesCountry(address, location);
  const websiteDomainMatch = sameDomain(location.website, details.websiteUri);
  const nearEnough = distanceKm != null && distanceKm <= 50;
  const strongName = nameSimilarity >= 0.6;
  const adequateName = nameSimilarity >= 0.35;
  const accepted = Boolean(
    address
    && countryMatch !== false
    && (
      (storedIdentity && nearEnough)
      || (websiteDomainMatch && (nearEnough || localityMatch))
      || (strongName && (nearEnough || localityMatch))
      || (adequateName && localityMatch && nearEnough)
    )
  );
  return {
    accepted,
    reason: accepted ? "google_identity_and_location_match" : "google_identity_or_location_ambiguous",
    display_name: displayName,
    name_similarity: round(nameSimilarity, 3),
    locality_match: localityMatch,
    country_match: countryMatch,
    website_domain_match: websiteDomainMatch,
    distance_km: distanceKm == null ? null : round(distanceKm, 3),
  };
}

async function applyResults(results, runId) {
  return withTransaction(async (client) => {
    await setMutationActor(client, { actorId: ACTOR_ID, actorLabel: ACTOR_LABEL });
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS fountain_raw;
      CREATE TABLE IF NOT EXISTS fountain_raw.google_address_fill_locations_backup_20260723
      AS SELECT * FROM fountain.locations WHERE false;
      CREATE TABLE IF NOT EXISTS fountain_raw.google_address_fill_audit_20260723 (
        location_id integer PRIMARY KEY,
        run_id bigint NOT NULL,
        method text NOT NULL,
        provider_place_id text,
        previous_address text,
        proposed_address text NOT NULL,
        validation jsonb NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const ids = results.map((row) => row.location.id);
    await client.query(`
      INSERT INTO fountain_raw.google_address_fill_locations_backup_20260723
      SELECT location.*
      FROM fountain.locations location
      WHERE location.id = ANY($1::integer[])
        AND NOT EXISTS (
          SELECT 1
          FROM fountain_raw.google_address_fill_locations_backup_20260723 backup
          WHERE backup.id = location.id
        )
    `, [ids]);

    let updated = 0;
    for (const result of results) {
      await client.query(`
        INSERT INTO fountain_raw.google_address_fill_audit_20260723(
          location_id, run_id, method, provider_place_id,
          previous_address, proposed_address, validation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        ON CONFLICT (location_id) DO UPDATE SET
          run_id = EXCLUDED.run_id,
          method = EXCLUDED.method,
          provider_place_id = EXCLUDED.provider_place_id,
          previous_address = EXCLUDED.previous_address,
          proposed_address = EXCLUDED.proposed_address,
          validation = EXCLUDED.validation,
          recorded_at = now()
      `, [
        result.location.id,
        runId,
        result.method,
        result.provider_place_id,
        result.location.address,
        result.proposed_address,
        JSON.stringify(result.validation),
      ]);
      const write = await client.query(`
        UPDATE fountain.locations
        SET address = $2
        WHERE id = $1
          AND status = 'active'
          AND deleted_at IS NULL
          AND NULLIF(btrim(address), '') IS NULL
      `, [result.location.id, result.proposed_address]);
      if (write.rowCount) {
        updated += 1;
        await client.query(`
          UPDATE fountain.locations
          SET latitude = $2, longitude = $3
          WHERE id = $1
        `, [result.location.id, result.location.latitude, result.location.longitude]);
      }
      if (result.method === "text_search_details" && result.provider_place_id) {
        await client.query(`
          INSERT INTO fountain.external_place_matches(
            location_id, provider, provider_place_id, provider_url,
            display_name, match_confidence, match_status, fetched_at, expires_at, raw_json
          )
          VALUES (
            $1, 'google_places', $2,
            'https://www.google.com/maps/place/?q=place_id:' || $2,
            $3, $4, 'address_verified', now(), now() + interval '30 days', $5::jsonb
          )
          ON CONFLICT (location_id, provider) DO UPDATE SET
            provider_place_id = EXCLUDED.provider_place_id,
            provider_url = EXCLUDED.provider_url,
            display_name = EXCLUDED.display_name,
            match_confidence = EXCLUDED.match_confidence,
            match_status = EXCLUDED.match_status,
            fetched_at = EXCLUDED.fetched_at,
            expires_at = EXCLUDED.expires_at,
            raw_json = EXCLUDED.raw_json
        `, [
          result.location.id,
          result.provider_place_id,
          result.google_details.display_name,
          result.validation.name_similarity,
          JSON.stringify(result.google_details.raw),
        ]);
      }
    }
    return { updated };
  });
}

async function loadCounts() {
  const result = await query(`
    SELECT
      count(*) FILTER (
        WHERE status='active' AND deleted_at IS NULL AND NOT is_virtual
          AND NULLIF(btrim(address),'') IS NULL
      )::integer AS missing_addresses,
      count(*) FILTER (
        WHERE status='active' AND deleted_at IS NULL AND NOT is_virtual
          AND (latitude IS NULL OR longitude IS NULL OR (latitude=0 AND longitude=0))
      )::integer AS missing_coordinates
    FROM fountain.locations
  `);
  return result.rows[0];
}

function readyResult(location, {
  method, address, placeId, details, validation, estimatedCostUsd,
}) {
  return {
    location: locationSnapshot(location),
    decision: "ready",
    reason: validation.reason,
    method,
    provider_place_id: placeId,
    proposed_address: address,
    validation,
    google_details: detailsSnapshot(details),
    estimated_cost_usd: estimatedCostUsd || 0,
  };
}

function unresolvedResult(location, reason, estimatedCostUsd) {
  return {
    location: locationSnapshot(location),
    decision: "unresolved",
    reason,
    method: null,
    provider_place_id: location.provider_place_id || null,
    proposed_address: null,
    validation: null,
    google_details: null,
    estimated_cost_usd: estimatedCostUsd || 0,
  };
}

function locationSnapshot(location) {
  return {
    id: location.id,
    slug: location.slug,
    name: location.name,
    address: location.address,
    locality: location.locality,
    region: location.region,
    country_code: location.country_code,
    country_name: location.country_name,
    website: location.website,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function detailsSnapshot(details) {
  const snapshot = {
    id: cleanText(details?.id),
    display_name: cleanText(details?.displayName?.text || details?.displayName),
    formatted_address: cleanText(details?.formattedAddress),
    website: cleanText(details?.websiteUri),
    latitude: finiteNumber(details?.location?.latitude),
    longitude: finiteNumber(details?.location?.longitude),
  };
  return { ...snapshot, raw: snapshot };
}

function searchQuery(location) {
  return [
    location.name,
    location.locality,
    location.region,
    location.country_name || location.country_code,
    DOMAIN_RETRY ? hostname(location.website) : null,
  ].map(cleanText).filter(Boolean).join(", ");
}

function coordinateBias(location) {
  if (location.latitude == null || location.longitude == null) return undefined;
  return {
    circle: {
      center: { latitude: location.latitude, longitude: location.longitude },
      radius: 50_000,
    },
  };
}

async function concurrentMap(items, concurrency, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await operation(items[index], index);
    }
  }));
  return results;
}

function tokenDice(left, right) {
  const a = meaningfulTokens(left);
  const b = meaningfulTokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function meaningfulTokens(value) {
  const stop = new Set([
    "and", "at", "care", "center", "centre", "clinic", "clinics", "health",
    "hospital", "medical", "of", "spa", "the", "therapy", "wellness", "hbot",
  ]);
  return new Set(normalize(value).split(" ")
    .filter((token) => token.length >= 3 && !stop.has(token)));
}

function includesNormalized(haystack, needle) {
  const value = normalize(needle);
  return value ? ` ${normalize(haystack)} `.includes(` ${value} `) : false;
}

function includesCountry(address, location) {
  const values = [
    location.country_name,
    countryName(location.country_code),
    ...countryAliases(location.country_code),
  ].filter(Boolean);
  if (!values.length) return null;
  return values.some((value) => includesNormalized(address, value)) ? true : null;
}

function countryName(code) {
  return new Map([
    ["US", "United States"], ["AE", "United Arab Emirates"], ["GB", "United Kingdom"],
    ["KR", "South Korea"], ["CZ", "Czechia"], ["SA", "Saudi Arabia"],
    ["AU", "Australia"], ["IL", "Israel"], ["PL", "Poland"], ["CH", "Switzerland"],
    ["ES", "Spain"], ["MX", "Mexico"], ["CA", "Canada"], ["DE", "Germany"],
    ["PA", "Panama"], ["SE", "Sweden"], ["SG", "Singapore"], ["TH", "Thailand"],
    ["TR", "Türkiye"],
  ]).get(String(code || "").toUpperCase()) || "";
}

function countryAliases(code) {
  return new Map([
    ["US", ["USA", "United States of America"]],
    ["AE", ["UAE"]],
    ["GB", ["UK", "England", "Scotland", "Wales", "Northern Ireland"]],
    ["KR", ["Republic of Korea", "Korea"]],
    ["CZ", ["Czech Republic"]],
    ["TR", ["Turkey", "Turkiye"]],
  ]).get(String(code || "").toUpperCase()) || [];
}

function sameDomain(left, right) {
  const a = hostname(left);
  const b = hostname(right);
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));
}

function hostname(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((value) => value == null)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function cleanText(value) {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  return text || null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
