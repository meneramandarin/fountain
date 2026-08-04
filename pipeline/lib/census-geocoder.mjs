import { createHash } from "node:crypto";

import { query as defaultQuery } from "./db.mjs";

export const CENSUS_GEOCODER_ENDPOINT = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
export const CENSUS_GEOCODER_BENCHMARK = "Public_AR_Current";

export function createCensusGeocoder({
  endpoint = CENSUS_GEOCODER_ENDPOINT,
  benchmark = CENSUS_GEOCODER_BENCHMARK,
  fetchImpl = globalThis.fetch,
  query = defaultQuery,
  userAgent = "Fountain directory research/1.0 (https://fountain.clinic)",
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function.");
  if (typeof query !== "function") throw new TypeError("query must be a function.");

  return async function geocode({ address, runId, entityId = null, signal }) {
    const normalizedAddress = nonemptyText(address, "address");
    const url = new URL(endpoint);
    url.searchParams.set("address", normalizedAddress);
    url.searchParams.set("benchmark", benchmark);
    url.searchParams.set("format", "json");
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({ endpoint, benchmark, address: normalizedAddress }))
      .digest("hex");
    let response;
    let body = {};
    let status = null;
    try {
      response = await fetchImpl(url, {
        headers: { "User-Agent": userAgent, "Accept": "application/json" },
        signal,
      });
      status = Number(response.status);
      body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`Census geocoder failed (${status}): ${response.statusText || "unknown error"}`);
      }
      const match = firstMatch(body, normalizedAddress);
      await insertCall({
        query,
        runId,
        entityId,
        requestFingerprint,
        status: "ok",
        httpStatus: status,
        tokens: { matches: match ? 1 : 0 },
      });
      return match
        ? {
            outcome: "matched",
            latitude: match.coordinates.y,
            longitude: match.coordinates.x,
            matched_address: match.matchedAddress || null,
            address_components: match.addressComponents || {},
            tiger_line: match.tigerLine || null,
            request_fingerprint: requestFingerprint,
          }
        : {
            outcome: "no_match",
            request_fingerprint: requestFingerprint,
          };
    } catch (error) {
      await insertCall({
        query,
        runId,
        entityId,
        requestFingerprint,
        status: "error",
        httpStatus: validHttpStatus(status) ? status : null,
        tokens: {},
      });
      throw error;
    }
  };
}

function firstMatch(body, requestedAddress) {
  const matches = body?.result?.addressMatches;
  if (!Array.isArray(matches)) return null;
  const match = matches.find((candidate) => (
    validateCensusAddressMatch(requestedAddress, candidate).verified
  ));
  if (!match) return null;
  const latitude = Number(match?.coordinates?.y);
  const longitude = Number(match?.coordinates?.x);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return {
    ...match,
    coordinates: { x: longitude, y: latitude },
    validation: validateCensusAddressMatch(requestedAddress, match),
  };
}

export function validateCensusAddressMatch(requestedAddress, match) {
  const requested = parsedAddress(requestedAddress);
  const returned = parsedAddress(match?.matchedAddress);
  const returnedComponents = match?.addressComponents || {};
  const houseNumberMatch = Boolean(
    requested.houseNumber
    && returned.houseNumber
    && requested.houseNumber === returned.houseNumber
  );
  const streetMatch = Boolean(
    requested.street
    && returned.street
    && requested.street === returned.street
  );
  const postalMatch = Boolean(
    requested.postal
    && returnedComponents.zip
    && requested.postal === normalizedPostal(returnedComponents.zip)
  );
  const localityMatch = Boolean(
    requested.localities.length
    && returnedComponents.city
    && requested.localities.some((value) => (
      normalizedText(value) === normalizedText(returnedComponents.city)
    ))
  );
  return {
    verified: Boolean(
      houseNumberMatch
      && (requested.postal
        ? postalMatch
        : streetMatch && localityMatch)
    ),
    house_number_match: houseNumberMatch,
    street_match: streetMatch,
    locality_match: localityMatch,
    postal_match: postalMatch,
    requested_street: requested.street,
    returned_street: returned.street,
  };
}

function parsedAddress(value) {
  const text = String(value || "");
  const segments = text.split(",").map((item) => item.trim()).filter(Boolean);
  const streetSegment = segments[0] || "";
  const houseNumber = streetSegment.match(/(?:^|\s)(\d+[A-Za-z]?)(?=\s|$)/u)?.[1]
    ?.toLowerCase() || null;
  const street = canonicalStreet(streetSegment);
  const postalMatches = [...text.matchAll(/\b\d{5}(?:-\d{4})?\b/gu)];
  const postal = normalizedPostal(postalMatches.at(-1)?.[0]);
  const localities = segments.slice(1);
  return { houseNumber, street, postal, localities };
}

function canonicalStreet(value) {
  const withoutUnit = String(value || "")
    .replace(/\b(?:suite|ste|unit|floor|fl|level|building|bldg|room|office)\b.*$/iu, "")
    .replace(/#\s*\w+.*$/u, "");
  return normalizedText(withoutUnit)
    .replace(/^\d+(?:\s*-\s*[a-z0-9]+)?\s+/u, "")
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
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizedPostal(value) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, 5) : null;
}

function normalizedText(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/gu, " ").replace(/\s+/gu, " ").trim();
}

async function insertCall({
  query,
  runId,
  entityId,
  requestFingerprint,
  status,
  httpStatus,
  tokens,
}) {
  await query(
    `
      INSERT INTO fountain_ops.external_calls (
        run_id, provider, call_type, entity_id, model, request_fingerprint,
        status, http_status, tokens, cost_estimate_usd
      )
      VALUES ($1, 'census_geocoder', 'address_geocode', $2, NULL, $3, $4, $5, $6::jsonb, 0)
    `,
    [runId, entityId, requestFingerprint, status, httpStatus, JSON.stringify(tokens)],
  );
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
