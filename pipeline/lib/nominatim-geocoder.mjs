import { createHash } from "node:crypto";

import { query as defaultQuery } from "./db.mjs";

export const NOMINATIM_GEOCODER_ENDPOINT = "https://nominatim.openstreetmap.org/search";

export function createNominatimGeocoder({
  endpoint = NOMINATIM_GEOCODER_ENDPOINT,
  fetchImpl = globalThis.fetch,
  query = defaultQuery,
  userAgent = "Fountain directory research/1.0 (https://fountain.clinic/contact)",
  minimumIntervalMs = 1_100,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function.");
  if (typeof query !== "function") throw new TypeError("query must be a function.");
  let queue = Promise.resolve();
  let nextRequestAt = 0;

  return function geocode(input) {
    const task = queue.catch(() => {}).then(async () => {
      const delay = Math.max(0, nextRequestAt - Date.now());
      if (delay > 0) await wait(delay);
      nextRequestAt = Date.now() + minimumIntervalMs;
      return executeNominatimGeocode(input, {
        endpoint,
        fetchImpl,
        query,
        userAgent,
      });
    });
    queue = task.then(() => undefined, () => undefined);
    return task;
  };
}

async function executeNominatimGeocode({
  address,
  runId,
  entityId = null,
  countryCode = "CA",
  signal,
}, {
  endpoint,
  fetchImpl,
  query,
  userAgent,
}) {
  const normalizedAddress = nonemptyText(address, "address");
  const normalizedCountry = String(countryCode || "CA").trim().toLowerCase();
  const url = new URL(endpoint);
  url.searchParams.set("q", normalizedAddress);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", normalizedCountry);
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify({ endpoint, address: normalizedAddress, country: normalizedCountry }))
    .digest("hex");
  let status = null;
  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": userAgent, "Accept": "application/json" },
      signal,
    });
    status = Number(response.status);
    const body = await response.json().catch(() => []);
    if (!response.ok) {
      throw new Error(`Nominatim geocoder failed (${status}): ${response.statusText || "unknown error"}`);
    }
    const match = firstMatch(body);
    await insertCall({
      query,
      runId,
      entityId,
      requestFingerprint,
      status: "ok",
      httpStatus: status,
      matched: Boolean(match),
    });
    return match
      ? {
          outcome: "matched",
          provider: "openstreetmap_nominatim",
          latitude: match.latitude,
          longitude: match.longitude,
          matched_address: match.display_name,
          address_components: match.address || {},
          request_fingerprint: requestFingerprint,
        }
      : {
          outcome: "no_match",
          provider: "openstreetmap_nominatim",
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
      matched: false,
    });
    throw error;
  }
}

function firstMatch(body) {
  if (!Array.isArray(body) || !body[0]) return null;
  const latitude = Number(body[0].lat);
  const longitude = Number(body[0].lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { ...body[0], latitude, longitude };
}

async function insertCall({
  query,
  runId,
  entityId,
  requestFingerprint,
  status,
  httpStatus,
  matched,
}) {
  await query(
    `
      INSERT INTO fountain_ops.external_calls (
        run_id, provider, call_type, entity_id, model, request_fingerprint,
        status, http_status, tokens, cost_estimate_usd
      )
      VALUES ($1, 'openstreetmap_nominatim', 'address_geocode', $2, NULL, $3, $4, $5, $6::jsonb, 0)
    `,
    [
      runId,
      entityId,
      requestFingerprint,
      status,
      httpStatus,
      JSON.stringify({ matches: matched ? 1 : 0 }),
    ],
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
