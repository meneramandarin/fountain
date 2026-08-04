import { createHash } from "node:crypto";

import { query as defaultQuery } from "./db.mjs";

export const GOOGLE_MAPS_GEOCODER_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
export const GOOGLE_MAPS_GEOCODER_UNIT_COST_USD = 0.005;

const API_KEY_ENV_NAMES = [
  "GOOGLE_GEOCODING_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_PLACES_API_KEY",
];
const PRECISE_LOCATION_TYPES = new Set(["ROOFTOP", "RANGE_INTERPOLATED"]);

export function createGoogleMapsGeocoder({
  endpoint = GOOGLE_MAPS_GEOCODER_ENDPOINT,
  fetchImpl = globalThis.fetch,
  query = defaultQuery,
  apiKey = googleApiKey(),
  unitCostUsd = GOOGLE_MAPS_GEOCODER_UNIT_COST_USD,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function.");
  if (typeof query !== "function") throw new TypeError("query must be a function.");
  if (!apiKey) throw new Error("Missing Google Maps geocoding API key.");

  return async function geocode({
    address,
    runId,
    entityId = null,
    countryCode,
    locality = null,
    postalCode = null,
    signal,
  }) {
    const normalizedAddress = nonemptyText(address, "address");
    const expectedCountry = normalizedCountryCode(countryCode);
    const url = new URL(endpoint);
    url.searchParams.set("address", normalizedAddress);
    if (expectedCountry) url.searchParams.set("components", `country:${expectedCountry}`);
    url.searchParams.set("key", apiKey);
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ endpoint, address: normalizedAddress, country: expectedCountry }))
      .digest("hex");
    let httpStatus = null;

    try {
      const response = await fetchImpl(url, { signal });
      httpStatus = Number(response.status);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`Google Maps geocoder failed (${httpStatus}): ${response.statusText || "unknown error"}`);
      }
      const selected = selectExactAddressResult(body?.results, {
        address: normalizedAddress,
        countryCode: expectedCountry,
        locality,
        postalCode,
      });
      await insertCall({
        query,
        runId,
        entityId,
        requestFingerprint,
        status: body?.status === "OK" ? "ok" : "no_match",
        httpStatus,
        matched: Boolean(selected),
        unitCostUsd,
      });
      if (!selected) {
        return {
          outcome: "no_match",
          provider: "google_maps_geocoding_api",
          api_status: body?.status || null,
          request_fingerprint: requestFingerprint,
        };
      }
      return {
        outcome: "matched",
        provider: "google_maps_geocoding_api",
        latitude: selected.latitude,
        longitude: selected.longitude,
        matched_address: selected.formattedAddress,
        location_type: selected.locationType,
        place_id: selected.placeId,
        validation: selected.validation,
        request_fingerprint: requestFingerprint,
      };
    } catch (error) {
      await insertCall({
        query,
        runId,
        entityId,
        requestFingerprint,
        status: "error",
        httpStatus: validHttpStatus(httpStatus) ? httpStatus : null,
        matched: false,
        unitCostUsd,
      });
      throw error;
    }
  };
}

export function selectExactAddressResult(results, {
  address,
  countryCode,
  locality = null,
  postalCode = null,
} = {}) {
  for (const result of Array.isArray(results) ? results : []) {
    const latitude = Number(result?.geometry?.location?.lat);
    const longitude = Number(result?.geometry?.location?.lng);
    const locationType = String(result?.geometry?.location_type || "");
    const returnedCountry = component(result, "country", "short_name")?.toUpperCase() || null;
    const returnedPostal = component(result, "postal_code", "long_name");
    const returnedLocalities = [
      component(result, "locality", "long_name"),
      component(result, "postal_town", "long_name"),
      component(result, "sublocality", "long_name"),
      component(result, "administrative_area_level_2", "long_name"),
    ].filter(Boolean);
    const expectedHouseNumber = houseNumber(address);
    const returnedHouseNumber = component(result, "street_number", "long_name")
      || houseNumber(result?.formatted_address);
    const expectedStreet = canonicalStreet(String(address || "").split(",")[0]);
    const returnedStreet = canonicalStreet(component(result, "route", "long_name"));
    const postalMatch = Boolean(postalCode && returnedPostal
      && normalizedText(postalCode) === normalizedText(returnedPostal));
    const localityMatch = Boolean(locality && returnedLocalities.some((value) => (
      normalizedText(value) === normalizedText(locality)
      || normalizedText(value).includes(normalizedText(locality))
      || normalizedText(locality).includes(normalizedText(value))
    )));
    const validation = {
      precise_location_type: PRECISE_LOCATION_TYPES.has(locationType),
      country_match: Boolean(countryCode && returnedCountry === countryCode),
      house_number_match: Boolean(
        expectedHouseNumber
        && returnedHouseNumber
        && expectedHouseNumber === returnedHouseNumber
      ),
      street_match: Boolean(expectedStreet && returnedStreet && expectedStreet === returnedStreet),
      locality_match: localityMatch,
      postal_match: postalMatch,
    };
    if (
      Number.isFinite(latitude)
      && latitude >= -90
      && latitude <= 90
      && Number.isFinite(longitude)
      && longitude >= -180
      && longitude <= 180
      && !(latitude === 0 && longitude === 0)
      && validation.precise_location_type
      && validation.country_match
      && validation.house_number_match
      && validation.street_match
      && (validation.locality_match || validation.postal_match)
    ) {
      return {
        latitude,
        longitude,
        formattedAddress: result.formatted_address || null,
        locationType,
        placeId: result.place_id || null,
        validation,
      };
    }
  }
  return null;
}

async function insertCall({
  query,
  runId,
  entityId,
  requestFingerprint,
  status,
  httpStatus,
  matched,
  unitCostUsd,
}) {
  await query(
    `
      INSERT INTO fountain_ops.external_calls (
        run_id, provider, call_type, entity_id, model, request_fingerprint,
        status, http_status, tokens, cost_estimate_usd
      )
      VALUES ($1, 'google_maps_geocoding_api', 'address_geocode', $2, NULL, $3, $4, $5, $6::jsonb, $7)
    `,
    [
      runId,
      entityId,
      requestFingerprint,
      status,
      httpStatus,
      JSON.stringify({ matches: matched ? 1 : 0 }),
      unitCostUsd,
    ],
  );
}

function component(result, type, field) {
  return result?.address_components
    ?.find((item) => Array.isArray(item?.types) && item.types.includes(type))
    ?.[field] || null;
}

function houseNumber(value) {
  return String(value || "").match(/(?:^|[^\p{L}\p{N}])(\d+[A-Za-z]?)(?=$|[^\p{L}\p{N}])/u)?.[1]
    ?.toLowerCase() || null;
}

function canonicalStreet(value) {
  return normalizedText(String(value || "")
    .replace(/\b(?:suite|ste|unit|floor|fl|level|building|bldg|room|office)\b.*$/iu, "")
    .replace(/#\s*\w+.*$/u, ""))
    .replace(/^\d+(?:\s*-\s*[a-z0-9]+)?\s+/u, "")
    .replace(/\b(?:northeast)\b/gu, "ne")
    .replace(/\b(?:northwest)\b/gu, "nw")
    .replace(/\b(?:southeast)\b/gu, "se")
    .replace(/\b(?:southwest)\b/gu, "sw")
    .replace(/\b(?:north)\b/gu, "n")
    .replace(/\b(?:south)\b/gu, "s")
    .replace(/\b(?:east)\b/gu, "e")
    .replace(/\b(?:west)\b/gu, "w")
    .replace(/\b(?:street)\b/gu, "st")
    .replace(/\b(?:avenue)\b/gu, "ave")
    .replace(/\b(?:road)\b/gu, "rd")
    .replace(/\b(?:boulevard)\b/gu, "blvd")
    .replace(/\b(?:drive)\b/gu, "dr")
    .replace(/\b(?:lane)\b/gu, "ln")
    .replace(/\b(?:court)\b/gu, "ct")
    .replace(/\b(?:highway)\b/gu, "hwy")
    .replace(/^state\s+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizedText(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function normalizedCountryCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(normalized) ? normalized : null;
}

function googleApiKey() {
  return API_KEY_ENV_NAMES.map((name) => process.env[name]).find(Boolean) || null;
}

function nonemptyText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function validHttpStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599;
}
