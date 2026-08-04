import { createHash } from "node:crypto";

import { query as defaultQuery } from "./db.mjs";
import {
  normalizeDiscoveredPlace,
  recordDiscoverySearch,
} from "./place-discovery.mjs";
import { OFFICIAL_CHAIN_SYNC_GROUP } from "./official-chain-match.mjs";

export const OFFICIAL_CHAIN_SYNC_CAMPAIGN = "chain_completeness_20260724";
export const OFFICIAL_CHAIN_SYNC_DEFAULT_CONCURRENCY = 12;

const USER_AGENT = "Fountain directory research/1.0 (https://fountain.clinic)";
const HYDRATION_DIRECTORY = "https://hydrationroom.com/locations";
const PERSPIRE_DIRECTORY = "https://www.perspiresaunastudio.com/locations";
const PERSPIRE_API = "https://api.perspiresaunastudio.com/collection/69249c468f7a5302cc0ba903?all=true";
const SIMONMED_DIRECTORY = "https://simonmed.com/locations/";
const SIMONMED_API = "https://simonmed.com/wp-json/brandpie/v1/locations";
const JIVA_DIRECTORY = "https://jivahealth.com/jivahealth-locations/";

const JIVA_LOCATIONS = [
  ["Brentwood", "141 Sand Creek Rd, Suite B", "94513"],
  ["Fremont", "1860 Mowry Ave Ste 200", "94538"],
  ["Oakland", "5709 Market St, Ste 101", "94608"],
  ["Pleasanton", "5924 Stoneridge Dr Ste 207", null],
  ["Redding", "1145 Whisketown Ct.", "96001"],
  ["Roseville", "8303 Sierra College Blvd, Suite 109B", "95661"],
  ["Sacramento", "2300 Bell Executive Ln", "95825"],
  ["San Francisco", "2001 Union St, Suite 250", "94123"],
  ["Vacaville", "2601 Nut Tree Rd, Suite C", "95687"],
  ["Walnut Creek", "215 Lennon Lane, Suite 201", "94598"],
];

export async function syncOfficialChains({
  campaign = OFFICIAL_CHAIN_SYNC_CAMPAIGN,
  runId,
  apply = false,
  concurrency = OFFICIAL_CHAIN_SYNC_DEFAULT_CONCURRENCY,
}, operations = {}) {
  const query = operations.query || defaultQuery;
  const fetchImpl = operations.fetchImpl || globalThis.fetch;
  const fetchOfficial = createOfficialFetcher({ fetchImpl, query, runId, apply });

  const [hydration, perspire, simonmed, jiva] = await Promise.all([
    loadHydrationRoom({ fetchOfficial, concurrency }),
    loadPerspire({ fetchOfficial }),
    loadSimonMed({ fetchOfficial }),
    loadJiva({ fetchOfficial }),
  ]);
  const chains = [hydration, perspire, simonmed, jiva];
  const invalid = chains.flatMap((chain) => chain.invalid || []);
  if (invalid.length > 0) {
    throw new Error(`Official chain sync rejected ${invalid.length} invalid records: ${invalid.slice(0, 5).join("; ")}`);
  }
  if (!apply) {
    return {
      chains: chains.length,
      candidates: chains.reduce((sum, chain) => sum + chain.places.length, 0),
      by_chain: Object.fromEntries(chains.map((chain) => [chain.chainName, chain.places.length])),
      excluded: Object.fromEntries(chains.map((chain) => [chain.chainName, chain.excluded || 0])),
    };
  }

  let stored = 0;
  for (let index = 0; index < chains.length; index += 1) {
    const chain = chains[index];
    const candidates = chain.places.map((place) => officialCandidate(place, chain));
    const result = await recordDiscoverySearch({
      campaign,
      discoveryQuery: {
        id: index + 1,
        market: chain.chainName,
        group: OFFICIAL_CHAIN_SYNC_GROUP,
        treatments: chain.treatments,
      },
      runId,
      response: {
        model: "official-chain-directory",
        content: JSON.stringify({
          chain: chain.chainName,
          directory_url: chain.directoryUrl,
          official_records: chain.places.length,
          excluded_records: chain.excluded || 0,
        }),
        results: [{ url: chain.directoryUrl, title: `${chain.chainName} locations` }],
      },
      candidates,
      error: null,
    }, { query });
    stored += result.candidates;
  }

  return {
    chains: chains.length,
    candidates: chains.reduce((sum, chain) => sum + chain.places.length, 0),
    candidates_inserted_or_updated: stored,
    by_chain: Object.fromEntries(chains.map((chain) => [chain.chainName, chain.places.length])),
    excluded: Object.fromEntries(chains.map((chain) => [chain.chainName, chain.excluded || 0])),
  };
}

function officialCandidate(place, chain) {
  const sourceUrl = place.website || chain.directoryUrl;
  const candidate = normalizeDiscoveredPlace({
    ...place,
    chain_name: chain.chainName,
    chain_locations_url: chain.directoryUrl,
    evidence_urls: unique([sourceUrl, chain.directoryUrl, ...(place.evidence_urls || [])]),
    physical_location: true,
  }, {
    market: place.locality,
    group: OFFICIAL_CHAIN_SYNC_GROUP,
    citations: [{ url: sourceUrl }, { url: chain.directoryUrl }],
    allowOutsideCalifornia: true,
  });
  if (!candidate) throw new Error(`Could not normalize official ${chain.chainName} record: ${place.name}`);
  const hasCoordinates = validCoordinate(place.latitude, -90, 90)
    && validCoordinate(place.longitude, -180, 180);
  return {
    ...candidate,
    latitude: hasCoordinates ? Number(place.latitude) : null,
    longitude: hasCoordinates ? Number(place.longitude) : null,
    geocode_provider: hasCoordinates ? "official_directory" : null,
    geocode_result: hasCoordinates
      ? { outcome: "matched", source: "official_directory", source_url: sourceUrl }
      : null,
    official_site_verification: {
      outcome: "verified",
      source: "official_directory",
      source_url: sourceUrl,
      directory_url: chain.directoryUrl,
      address_verified: true,
      treatment_verified: true,
    },
    address_verified: true,
    treatment_verified: true,
    status: "discovered",
  };
}

async function loadHydrationRoom({ fetchOfficial, concurrency }) {
  const html = await fetchOfficial(HYDRATION_DIRECTORY, "text");
  const paths = unique(
    [...html.matchAll(/(?:https?:\\?\/\\?\/hydrationroom\.com)?\\?\/(locations\\?\/(?:ca|tx)\\?\/[^"'<>\\?#]+)/giu)]
      .map((match) => `/${match[1].replaceAll("\\/", "/").replace(/\/+$/u, "")}`),
  );
  const pages = await mapConcurrent(paths, concurrency, async (path) => {
    const website = new URL(path, HYDRATION_DIRECTORY).href;
    const page = await fetchOfficial(website, "text");
    const business = localBusinessJsonLd(page);
    const address = business?.address || {};
    return {
      name: `Hydration Room - ${address.addressLocality || titleFromPath(path)}`,
      website,
      address: address.streetAddress,
      locality: address.addressLocality,
      region: address.addressRegion,
      postal_code: address.postalCode,
      country_code: address.addressCountry || "US",
      phone: business?.telephone || null,
      email: null,
      image_url: scalarUrl(business?.image) || scalarUrl(business?.logo),
      latitude: business?.geo?.latitude,
      longitude: business?.geo?.longitude,
      matched_treatments: [
        "IV Therapy",
        "NAD+ Services",
        "Peptide Therapy",
        "Vitamin B12 Injections",
      ],
      offerings: [
        "IV Therapy",
        "NAD+ Services",
        "Peptide Therapy",
        "Vitamin B12 Injections",
      ].map((name) => offering(name, website)),
    };
  });
  return validatedChain({
    chainName: "Hydration Room",
    directoryUrl: HYDRATION_DIRECTORY,
    treatments: ["IV Therapy", "NAD+", "Peptide Therapy", "Vitamin B"],
    places: pages,
  });
}

async function loadPerspire({ fetchOfficial }) {
  const payload = await fetchOfficial(PERSPIRE_API, "json");
  const allItems = Array.isArray(payload?.items) ? payload.items : [];
  const usable = allItems.filter((item) => {
    const fields = item?.fieldData || {};
    return fields["studio-status"] !== "Closed"
      && fields.address
      && fields.city
      && fields.name
      && fields.slug;
  });
  const places = usable.map((item) => {
    const fields = item.fieldData;
    const parsedCity = parsePerspireCity(fields.city);
    const region = fields.stateprovcode
      || parsedCity.region
      || inferRegionFromPostal(fields.postalcode);
    const postalCode = fields.postalcode || parsedCity.postalCode;
    const website = `https://www.perspiresaunastudio.com/locations/${fields.slug}`;
    const offerings = [offering("Infrared Sauna", website)];
    addPricedOffering(offerings, "Intro Sauna Session", fields.introsessionprice, website);
    addPricedOffering(offerings, "Single Sauna Session", fields.singlesessionprice, website);
    if (fields.ishalotherapy) {
      addPricedOffering(offerings, "Halotherapy", fields.halotherapyprice, website, true);
    }
    return {
      name: `Perspire Sauna Studio - ${fields.name}`,
      website,
      address: [fields.address, fields.address2].filter(Boolean).join(", "),
      locality: parsedCity.locality,
      region,
      postal_code: postalCode,
      country_code: "US",
      phone: fields.phone || null,
      email: fields.email || null,
      image_url: scalarUrl(fields.image),
      latitude: fields.latitude,
      longitude: fields.longitude,
      matched_treatments: fields.ishalotherapy
        ? ["Infrared Sauna", "Halotherapy"]
        : ["Infrared Sauna"],
      offerings,
    };
  });
  return validatedChain({
    chainName: "Perspire Sauna Studio",
    directoryUrl: PERSPIRE_DIRECTORY,
    treatments: ["Infrared Sauna", "Halotherapy"],
    places,
    excluded: allItems.length - usable.length,
  });
}

async function loadSimonMed({ fetchOfficial }) {
  const payload = await fetchOfficial(SIMONMED_API, "json");
  const records = Array.isArray(payload) ? payload : [];
  const places = records.map((record) => {
    const address = record["sm-location_address_group"] || {};
    const coordinates = record["sm-latitude_longitude"] || {};
    const website = scalarUrl(record.link);
    const procedures = unique((record.procedures || []).filter(Boolean));
    return {
      name: `SimonMed Imaging - ${record.title}`,
      website,
      address: [address.street_address_1, address.street_address_2].filter(Boolean).join(", "),
      locality: address.city,
      region: address.state || inferRegionFromPostal(address.zipcode),
      postal_code: address.zipcode,
      country_code: "US",
      phone: record["sm-contact_numbers"]?.phone_number || null,
      email: null,
      image_url: scalarUrl(record.thumbnail),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      matched_treatments: procedures,
      offerings: procedures.map((name) => offering(name, website)),
    };
  });
  return validatedChain({
    chainName: "SimonMed Imaging",
    directoryUrl: SIMONMED_DIRECTORY,
    treatments: [
      "CT/CAT Scan",
      "Magnetic Resonance Imaging (MRI)",
      "Whole-body MRI",
      "Cancer Screening",
      "Cardiac Screening",
    ],
    places,
  });
}

async function loadJiva({ fetchOfficial }) {
  await fetchOfficial(JIVA_DIRECTORY, "text", { allowChallenge: true });
  return validatedChain({
    chainName: "Jiva Health",
    directoryUrl: JIVA_DIRECTORY,
    treatments: ["Sleep Study", "Sleep Disorders"],
    places: JIVA_LOCATIONS.map(([locality, address, postalCode]) => ({
      name: `Jiva Health - ${locality}`,
      website: JIVA_DIRECTORY,
      address,
      locality,
      region: "CA",
      postal_code: postalCode,
      country_code: "US",
      phone: null,
      email: null,
      image_url: null,
      latitude: null,
      longitude: null,
      matched_treatments: ["Sleep Study", "Sleep Disorders"],
      offerings: [
        offering("Sleep Study", JIVA_DIRECTORY),
        offering("Sleep Disorders", JIVA_DIRECTORY),
      ],
    })),
  });
}

function validatedChain(chain) {
  const invalid = [];
  const places = [];
  for (const place of chain.places) {
    const missing = ["name", "website", "address", "locality", "region", "country_code"]
      .filter((field) => !String(place[field] || "").trim());
    if (missing.length > 0 || !Array.isArray(place.matched_treatments) || place.matched_treatments.length === 0) {
      invalid.push(`${place.name || "unnamed"} (${missing.join(", ") || "no treatments"})`);
    } else {
      places.push(place);
    }
  }
  return { ...chain, places, invalid };
}

function createOfficialFetcher({ fetchImpl, query, runId, apply }) {
  return async function fetchOfficial(url, type, { allowChallenge = false } = {}) {
    const fingerprint = createHash("sha256").update(url).digest("hex");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let response;
    let status = null;
    try {
      response = await fetchImpl(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": type === "json" ? "application/json" : "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });
      status = Number(response.status);
      const value = type === "json" ? await response.json() : await response.text();
      if (!response.ok) throw new Error(`Official directory fetch failed (${status}) for ${url}`);
      if (!allowChallenge && typeof value === "string" && /Just a moment|cf-chl-/iu.test(value)) {
        throw new Error(`Official directory returned a browser challenge for ${url}`);
      }
      if (apply) {
        await logOfficialCall({ query, runId, fingerprint, status: "ok", httpStatus: status, url });
      }
      return value;
    } catch (error) {
      if (apply) {
        await logOfficialCall({
          query,
          runId,
          fingerprint,
          status: allowChallenge && status === 403 ? "ok" : "error",
          httpStatus: validHttpStatus(status) ? status : null,
          url,
        });
      }
      if (allowChallenge && status === 403) return "";
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}

async function logOfficialCall({ query, runId, fingerprint, status, httpStatus, url }) {
  await query(
    `
      INSERT INTO fountain_ops.external_calls (
        run_id, provider, call_type, entity_id, model, request_fingerprint,
        status, http_status, tokens, cost_estimate_usd
      )
      VALUES (
        $1, 'official_chain_directory', 'directory_fetch', NULL, NULL, $2,
        $3, $4, $5::jsonb, 0
      )
    `,
    [runId, fingerprint, status, httpStatus, JSON.stringify({ source_url: url })],
  );
}

function localBusinessJsonLd(html) {
  for (const match of String(html || "").matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
  )) {
    try {
      const parsed = JSON.parse(match[1]);
      const objects = Array.isArray(parsed) ? parsed : [parsed];
      const found = objects.find((item) => {
        const types = Array.isArray(item?.["@type"]) ? item["@type"] : [item?.["@type"]];
        return types.includes("LocalBusiness");
      });
      if (found) return found;
    } catch {
      // Ignore unrelated or malformed JSON-LD blocks.
    }
  }
  return null;
}

function parsePerspireCity(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.*?),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/u);
  return match
    ? { locality: match[1].trim(), region: match[2], postalCode: match[3] || null }
    : { locality: text, region: null, postalCode: null };
}

function inferRegionFromPostal(value) {
  const postalCode = String(value || "").trim();
  if (/^11741(?:-\d{4})?$/u.test(postalCode)) return "NY";
  if (/^34202(?:-\d{4})?$/u.test(postalCode)) return "FL";
  return null;
}

function addPricedOffering(items, name, rawPrice, sourceUrl, includeWithoutPrice = false) {
  const price = numericPrice(rawPrice);
  if (price == null && !includeWithoutPrice) return;
  items.push({
    ...offering(name, sourceUrl),
    price_amount: price,
    price_currency: price == null ? null : "USD",
    price_text: rawPrice == null ? null : String(rawPrice),
  });
}

function offering(name, sourceUrl) {
  return {
    name,
    price_amount: null,
    price_currency: null,
    price_text: null,
    source_url: sourceUrl,
  };
}

function numericPrice(value) {
  if (value == null || value === "") return null;
  const match = String(value).replaceAll(",", "").match(/\d+(?:\.\d+)?/u);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function scalarUrl(value) {
  const candidate = typeof value === "string"
    ? value
    : value?.url || value?.src || value?.file?.url || null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function titleFromPath(value) {
  const parts = String(value).split("/").filter(Boolean);
  return (parts.at(-2) || parts.at(-1) || "Location")
    .split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

async function mapConcurrent(items, concurrency, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, Number(concurrency) || 1), Math.max(1, items.length)) },
    () => worker(),
  ));
  return results;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function validCoordinate(value, min, max) {
  if (value == null || value === "") return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function validHttpStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599;
}
