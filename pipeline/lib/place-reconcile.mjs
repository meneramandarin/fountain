import { createCensusGeocoder } from "./census-geocoder.mjs";
import { createGoogleMapsGeocoder } from "./google-maps-geocoder.mjs";
import { createNominatimGeocoder } from "./nominatim-geocoder.mjs";
import { query as defaultQuery } from "./db.mjs";
import { matchLocation as defaultMatchLocation } from "./matcher.mjs";
import {
  isOfficialChainSync,
  matchOfficialChainLocation,
} from "./official-chain-match.mjs";
import { resolveOfficialPageCoordinates } from "./official-coordinate-evidence.mjs";
import { readCachedWebPage } from "./web.mjs";

export const PLACE_RECONCILE_DEFAULT_CONCURRENCY = 10;

export async function reconcileDiscoveredPlaces({
  campaign,
  runId,
  apply = false,
  concurrency = PLACE_RECONCILE_DEFAULT_CONCURRENCY,
  limit = null,
  googleFallback = false,
}, operations = {}) {
  const query = operations.query || defaultQuery;
  const candidates = await loadCandidates({ campaign, limit, googleFallback }, { query });
  if (!apply) {
    return {
      selected: candidates.length,
      geocode_needed: candidates.filter((candidate) => !hasCoordinates(candidate)).length,
      match_needed: candidates.length,
      sample: candidates.slice(0, 10).map(publicCandidate),
    };
  }

  const geocode = operations.geocode || createCountryAwareGeocoder({ query });
  const googleGeocode = googleFallback
    ? (operations.googleGeocode || createGoogleMapsGeocoder({ query }))
    : null;
  const resolveOfficialCoordinates = operations.resolveOfficialCoordinates
    || resolveCachedOfficialCoordinates;
  const matchLocation = operations.matchLocation || ((input) => defaultMatchLocation(input, { query }));
  const results = new Array(candidates.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) return;
      const candidate = candidates[index];
      results[index] = await reconcileCandidate({
        candidate,
        runId,
        query,
        geocode,
        googleGeocode,
        resolveOfficialCoordinates,
        matchLocation,
      });
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(positiveInteger(concurrency, "concurrency"), Math.max(1, candidates.length)) },
    () => worker(),
  ));
  return {
    selected: candidates.length,
    geocoded: count(results, "geocoded"),
    geocode_no_match: count(results, "geocode_no_match"),
    geocode_errors: count(results, "geocode_error"),
    existing_matches: count(results, "existing_match"),
    matcher_reviews: count(results, "matcher_review"),
    ready: count(results, "ready"),
    needs_review: count(results, "needs_review"),
    results,
  };
}

async function reconcileCandidate({
  candidate,
  runId,
  query,
  geocode,
  googleGeocode,
  resolveOfficialCoordinates,
  matchLocation,
}) {
  let latitude = numberOrNull(candidate.latitude);
  let longitude = numberOrNull(candidate.longitude);
  let geocodeResult = candidate.geocode_result || null;
  let geocodeOutcome = hasCoordinates(candidate) ? "cached" : "not_attempted";

  if (!hasCoordinates(candidate) && candidate.address) {
    try {
      const officialResult = await resolveOfficialCoordinates(candidate);
      if (officialResult?.outcome === "matched") {
        geocodeResult = {
          ...officialResult,
          evidence_method: "exact_branch_address_jsonld",
        };
      } else {
        const retryStrategy = shouldRetryNominatimAddress(candidate)
          ? "simplified_address"
          : null;
        const attemptedAddress = retryStrategy
          ? candidateSimplifiedGeocodeAddress(candidate)
          : candidateGeocodeAddress(candidate);
        const useGoogleDirectly = Boolean(
          googleGeocode
          && candidate?.geocode_result?.outcome === "no_match"
          && candidate?.geocode_provider !== "google_maps_geocoding_api"
        );
        geocodeResult = useGoogleDirectly
          ? await googleGeocode({
              address: attemptedAddress,
              runId,
              entityId: Number(candidate.id),
              countryCode: candidate.country_code,
              locality: candidate.locality,
              postalCode: candidate.postal_code,
            })
          : await geocode({
              address: attemptedAddress,
              runId,
              entityId: Number(candidate.id),
              countryCode: candidate.country_code,
            });
        if (googleGeocode && geocodeResult?.outcome === "no_match" && !useGoogleDirectly) {
          geocodeResult = await googleGeocode({
            address: attemptedAddress,
            runId,
            entityId: Number(candidate.id),
            countryCode: candidate.country_code,
            locality: candidate.locality,
            postalCode: candidate.postal_code,
          });
        }
        geocodeResult = {
          ...geocodeResult,
          attempted_address: attemptedAddress,
          ...(retryStrategy ? { retry_strategy: retryStrategy } : {}),
          ...(officialResult?.outcome && officialResult.outcome !== "no_match"
            ? { official_coordinate_evidence: officialResult }
            : {}),
        };
      }
      geocodeOutcome = geocodeResult.outcome;
      if (geocodeResult.outcome === "matched") {
        latitude = geocodeResult.latitude;
        longitude = geocodeResult.longitude;
      }
      await query(
        `
          UPDATE fountain_raw.agent_discovery_candidates
          SET latitude = $2,
              longitude = $3,
              geocode_provider = $4,
              geocode_result = $5::jsonb,
              updated_at = now()
          WHERE id = $1
        `,
        [
          candidate.id,
          latitude,
          longitude,
          geocodeResult.provider || geocodeProviderForCountry(candidate.country_code),
          JSON.stringify(geocodeResult),
        ],
      );
    } catch (error) {
      geocodeOutcome = "error";
      geocodeResult = { outcome: "error", error: errorMessage(error).slice(0, 1_000) };
      await query(
        `
          UPDATE fountain_raw.agent_discovery_candidates
          SET geocode_provider = $2,
              geocode_result = $3::jsonb,
              status = 'needs_review',
              updated_at = now()
          WHERE id = $1
        `,
        [
          candidate.id,
          geocodeProviderForCountry(candidate.country_code),
          JSON.stringify(geocodeResult),
        ],
      );
    }
  }

  let matchResult = { status: "none" };
  try {
    matchResult = isOfficialChainSync(candidate)
      ? await matchOfficialChainLocation(candidate, { query })
      : await matchLocation({
          name: candidate.name,
          website: candidate.website,
          address: candidate.address,
          locality: candidate.locality,
          region: candidate.region,
          postal_code: candidate.postal_code,
          country_code: candidate.country_code,
          latitude,
          longitude,
        });
  } catch (error) {
    matchResult = { status: "review", guardrail: "matcher_error", error: errorMessage(error) };
  }

  const status = matchResult.status === "matched"
    ? "existing_match"
    : matchResult.status === "review"
      ? "needs_review"
      : latitude != null
          && longitude != null
          && candidate.address_verified === true
          && candidate.treatment_verified === true
        ? "ready"
        : "needs_review";
  await query(
    `
      UPDATE fountain_raw.agent_discovery_candidates
      SET status = $2,
          match_result = $3::jsonb,
          updated_at = now()
      WHERE id = $1
    `,
    [candidate.id, status, JSON.stringify(matchResult)],
  );
  return {
    candidate_id: Number(candidate.id),
    status,
    geocode_outcome: geocodeOutcome,
    geocoded: geocodeOutcome === "matched" ? 1 : 0,
    geocode_no_match: geocodeOutcome === "no_match" ? 1 : 0,
    geocode_error: geocodeOutcome === "error" ? 1 : 0,
    existing_match: status === "existing_match" ? 1 : 0,
    matcher_review: matchResult.status === "review" ? 1 : 0,
    ready: status === "ready" ? 1 : 0,
    needs_review: status === "needs_review" ? 1 : 0,
    match_result: matchResult,
  };
}

async function resolveCachedOfficialCoordinates(candidate) {
  const pages = [];
  for (const page of candidate?.official_site_verification?.pages || []) {
    if (page?.ok !== true || !page?.url) continue;
    const cached = await readCachedWebPage(page.url);
    if (cached) pages.push(cached);
  }
  if (pages.length === 0) {
    return {
      outcome: "no_match",
      provider: "official_site_jsonld",
      considered: 0,
      exact_branch_matches: 0,
      unique_coordinate_pairs: 0,
      pages_rejected_for_host: 0,
    };
  }
  return resolveOfficialPageCoordinates(candidate, pages);
}

async function loadCandidates({ campaign, limit, googleFallback }, { query }) {
  const params = [campaign, Boolean(googleFallback)];
  const limitClause = limit == null ? "" : `LIMIT $${params.push(positiveInteger(limit, "limit"))}`;
  const result = await query(
    `
      SELECT *
      FROM fountain_raw.agent_discovery_candidates
      WHERE campaign = $1
        AND promoted_location_id IS NULL
        AND (
          status = 'discovered'
          OR (
            status = 'needs_review'
            AND address_verified = true
            AND treatment_verified = true
            AND latitude IS NULL
            AND longitude IS NULL
            AND match_result->>'status' = 'none'
            AND geocode_result->>'outcome' = 'no_match'
            AND (
              (
                $2::boolean = true
                AND coalesce(geocode_provider, '') <> 'google_maps_geocoding_api'
              )
              OR NOT (geocode_result ? 'attempted_address')
              OR (
                upper(coalesce(country_code, '')) <> 'US'
                AND NOT (geocode_result ? 'retry_strategy')
              )
            )
          )
        )
      ORDER BY id
      ${limitClause}
    `,
    params,
  );
  return result.rows || [];
}

function publicCandidate(candidate) {
  return {
    id: Number(candidate.id),
    name: candidate.name,
    address: candidate.address,
    locality: candidate.locality,
    website: candidate.website,
    status: candidate.status,
  };
}

function hasCoordinates(candidate) {
  return numberOrNull(candidate?.latitude) != null && numberOrNull(candidate?.longitude) != null;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function candidateGeocodeAddress(candidate) {
  return [
    candidate.address,
    candidate.locality,
    candidate.region,
    candidate.postal_code,
    candidate.country_code,
  ].filter(Boolean).join(", ");
}

function candidateSimplifiedGeocodeAddress(candidate) {
  const parts = [candidate.address, candidate.locality, candidate.country_code];
  return parts
    .filter((value, index) => (
      value
      && parts.findIndex((candidateValue) => (
        String(candidateValue || "").trim().toLowerCase()
        === String(value).trim().toLowerCase()
      )) === index
    ))
    .join(", ");
}

function shouldRetryNominatimAddress(candidate) {
  return (
    String(candidate?.country_code || "").toUpperCase() !== "US"
    && candidate?.geocode_result?.outcome === "no_match"
    && candidate.geocode_result.attempted_address
    && !candidate.geocode_result.retry_strategy
  );
}

function createCountryAwareGeocoder({ query }) {
  const census = createCensusGeocoder({ query });
  const nominatim = createNominatimGeocoder({ query });
  return (input) => (
    String(input.countryCode || "US").toUpperCase() === "US"
      ? census(input)
      : nominatim(input)
  );
}

function geocodeProviderForCountry(countryCode) {
  return String(countryCode || "US").toUpperCase() === "US"
    ? "census_geocoder"
    : "openstreetmap_nominatim";
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}

function count(results, field) {
  return results.reduce((total, result) => total + Number(result?.[field] || 0), 0);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
