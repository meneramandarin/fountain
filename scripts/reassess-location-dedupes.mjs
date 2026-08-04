#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { closePool, query } from "../pipeline/lib/db.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTPUT = path.join(ROOT, "tmp", "location-dedupe-reassessment-20260723.json");
const CELL_DEGREES = 0.02;
const MAX_DISTANCE_KM = 1.5;

try {
  const locations = await loadLocations();
  const coordinateFrequency = new Map();
  for (const location of locations) {
    const key = coordinateKey(location);
    coordinateFrequency.set(key, (coordinateFrequency.get(key) || 0) + 1);
  }
  const pairs = candidatePairs(locations)
    .map(([left, right]) => scorePair(left, right, coordinateFrequency))
    .filter(Boolean)
    .sort(compareCandidates);
  const actionableGroups = buildGroups(pairs.filter((pair) => pair.tier !== "medium"));
  const report = {
    generated_at: new Date().toISOString(),
    methodology: {
      active_physical_locations: locations.length,
      maximum_pair_distance_km: MAX_DISTANCE_KM,
      critical: "same external provider place ID, or nearly identical identity at the same street point",
      high: "strong name/address/domain agreement within a short GPS distance",
      medium: "plausible duplicate requiring human review; shared-building and coarse-centroid penalties applied",
      note: "This is a review queue only. No locations were merged or suppressed.",
    },
    counts: {
      critical: pairs.filter((pair) => pair.tier === "critical").length,
      high: pairs.filter((pair) => pair.tier === "high").length,
      medium: pairs.filter((pair) => pair.tier === "medium").length,
      total: pairs.length,
      critical_high_groups: actionableGroups.length,
      critical_high_locations: new Set(actionableGroups.flatMap((group) => group.location_ids)).size,
    },
    critical_high_groups: actionableGroups,
    candidates: pairs,
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report.counts, output: OUTPUT }, null, 2));
} finally {
  await closePool();
}

async function loadLocations() {
  const result = await query(`
    SELECT
      location.id,
      location.slug,
      location.name,
      location.address,
      location.locality,
      location.region,
      location.postal_code,
      location.country_code,
      location.website,
      location.latitude,
      location.longitude,
      location.org_id,
      organization.canonical_name AS organization_name,
      count(DISTINCT offering.id)::integer AS offering_count,
      COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
          'provider', place.provider,
          'provider_place_id', place.provider_place_id
        )) FILTER (WHERE place.provider_place_id IS NOT NULL),
        '[]'::jsonb
      ) AS external_places
    FROM fountain.locations location
    LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
    LEFT JOIN fountain.offerings offering
      ON offering.location_id = location.id
      AND offering.status = 'active'
      AND offering.deleted_at IS NULL
    LEFT JOIN fountain.external_place_matches place
      ON place.location_id = location.id
      AND place.provider_place_id IS NOT NULL
    WHERE location.status = 'active'
      AND location.deleted_at IS NULL
      AND NOT location.is_virtual
      AND location.latitude IS NOT NULL
      AND location.longitude IS NOT NULL
    GROUP BY location.id, organization.canonical_name
    ORDER BY location.id
  `);
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    org_id: row.org_id == null ? null : Number(row.org_id),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    offering_count: Number(row.offering_count),
    external_places: Array.isArray(row.external_places) ? row.external_places : [],
  }));
}

function candidatePairs(locations) {
  const grid = new Map();
  const pairs = [];
  for (const location of locations) {
    const x = Math.floor(location.latitude / CELL_DEGREES);
    const y = Math.floor(location.longitude / CELL_DEGREES);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of grid.get(`${x + dx}:${y + dy}`) || []) {
          const distance = haversineKm(location, other);
          if (distance <= MAX_DISTANCE_KM) pairs.push([other, location]);
        }
      }
    }
    const key = `${x}:${y}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(location);
  }
  return pairs;
}

function scorePair(left, right, coordinateFrequency) {
  const distanceKm = haversineKm(left, right);
  const nameSimilarity = trigramSimilarity(identityName(left), identityName(right));
  const rawNameSimilarity = trigramSimilarity(left.name, right.name);
  const addressSimilarity = trigramSimilarity(addressKey(left.address), addressKey(right.address));
  const exactAddress = Boolean(
    addressKey(left.address)
    && addressKey(left.address) === addressKey(right.address),
  );
  const exactPostal = Boolean(
    normalize(left.postal_code)
    && normalize(left.postal_code) === normalize(right.postal_code),
  );
  const domainLeft = domain(left.website);
  const domainRight = domain(right.website);
  const sameDomain = Boolean(domainLeft && domainLeft === domainRight);
  const sharedExternalPlace = sharedPlace(left.external_places, right.external_places);
  const sameOrganization = left.org_id != null && left.org_id === right.org_id;
  const sameCoordinate = coordinateKey(left) === coordinateKey(right);
  const coarseCoordinate = sameCoordinate && (coordinateFrequency.get(coordinateKey(left)) || 0) >= 3;

  let score = 0;
  const reasons = [];
  if (sharedExternalPlace) {
    score += 100;
    reasons.push(`same_${sharedExternalPlace.provider}_place_id`);
  }
  if (nameSimilarity >= 0.9) {
    score += 38;
    reasons.push("near_identical_name");
  } else if (nameSimilarity >= 0.72) {
    score += 28;
    reasons.push("strong_name_match");
  } else if (nameSimilarity >= 0.5) {
    score += 14;
    reasons.push("moderate_name_match");
  }
  if (exactAddress) {
    score += 35;
    reasons.push("exact_normalized_address");
  } else if (addressSimilarity >= 0.75) {
    score += 24;
    reasons.push("strong_address_match");
  }
  if (sameDomain) {
    score += 24;
    reasons.push("same_website_domain");
  }
  if (sameOrganization) {
    score += 12;
    reasons.push("same_organization");
  }
  if (sameCoordinate) {
    score += coarseCoordinate ? 2 : 15;
    reasons.push(coarseCoordinate ? "shared_coarse_coordinate" : "same_coordinate");
  } else if (distanceKm <= 0.03) {
    score += 15;
    reasons.push("within_30m");
  } else if (distanceKm <= 0.1) {
    score += 10;
    reasons.push("within_100m");
  } else if (distanceKm <= 0.25) {
    score += 5;
    reasons.push("within_250m");
  }
  if (exactPostal) score += 4;

  // A shared building alone is not a duplicate signal.
  if (exactAddress && nameSimilarity < 0.3 && !sameDomain && !sameOrganization && !sharedExternalPlace) {
    return null;
  }
  // City centroids often collapse unrelated records onto one point.
  if (coarseCoordinate && !left.address && !right.address && !sameDomain && nameSimilarity < 0.8) {
    return null;
  }

  let tier = null;
  if (
    (
      sharedExternalPlace
      && distanceKm <= 0.15
      && (addressSimilarity >= 0.5 || sameCoordinate || exactAddress)
    )
    || (exactAddress && nameSimilarity >= 0.7)
    || (score >= 100 && distanceKm <= 0.1)
  ) {
    tier = "critical";
  } else if (
    (sharedExternalPlace && distanceKm <= 0.5)
    || (score >= 85 && distanceKm <= 0.25)
    || (exactAddress && nameSimilarity >= 0.5)
  ) {
    tier = "high";
  } else if (sharedExternalPlace || score >= 62) {
    tier = "medium";
    if (sharedExternalPlace && distanceKm > 0.5) reasons.push("provider_match_distance_anomaly");
  }
  if (!tier) return null;

  return {
    tier,
    score,
    reasons,
    distance_meters: Math.round(distanceKm * 1_000),
    signals: {
      name_similarity: round(nameSimilarity),
      raw_name_similarity: round(rawNameSimilarity),
      address_similarity: round(addressSimilarity),
      exact_address: exactAddress,
      same_domain: sameDomain,
      same_organization: sameOrganization,
      same_coordinate: sameCoordinate,
      coarse_coordinate_cluster: coarseCoordinate,
      shared_external_place: sharedExternalPlace,
    },
    left: summarizeLocation(left),
    right: summarizeLocation(right),
  };
}

function buildGroups(pairs) {
  const parent = new Map();
  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    const value = parent.get(id);
    if (value !== id) parent.set(id, find(value));
    return parent.get(id);
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };
  for (const pair of pairs) union(pair.left.id, pair.right.id);
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()].map((ids) => {
    ids.sort((a, b) => a - b);
    const relevant = pairs.filter((pair) => ids.includes(pair.left.id) && ids.includes(pair.right.id));
    return {
      location_ids: ids,
      pair_count: relevant.length,
      maximum_tier: relevant.some((pair) => pair.tier === "critical") ? "critical" : "high",
      maximum_score: Math.max(...relevant.map((pair) => pair.score)),
    };
  }).sort((left, right) => (
    (left.maximum_tier === "critical" ? 0 : 1) - (right.maximum_tier === "critical" ? 0 : 1)
    || right.maximum_score - left.maximum_score
    || left.location_ids[0] - right.location_ids[0]
  ));
}

function summarizeLocation(location) {
  return {
    id: location.id,
    slug: location.slug,
    name: location.name,
    organization: location.organization_name,
    address: location.address,
    locality: location.locality,
    region: location.region,
    postal_code: location.postal_code,
    country_code: location.country_code,
    website: location.website,
    latitude: location.latitude,
    longitude: location.longitude,
    offering_count: location.offering_count,
    external_places: location.external_places,
  };
}

function identityName(location) {
  return normalize(`${location.organization_name || ""} ${location.name || ""}`)
    .replace(/\b(clinic|center|centre|health|medical|wellness|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressKey(value) {
  return normalize(value)
    .replace(/\b(suite|ste|unit|floor|fl)\s*[a-z0-9-]+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(street)\b/g, " st ")
    .replace(/\b(road)\b/g, " rd ")
    .replace(/\b(avenue)\b/g, " ave ")
    .replace(/\b(boulevard)\b/g, " blvd ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigramSimilarity(left, right) {
  const a = trigrams(normalize(left));
  const b = trigrams(normalize(right));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}

function trigrams(value) {
  const padded = `  ${value}  `;
  const output = new Set();
  for (let index = 0; index <= padded.length - 3; index += 1) {
    output.add(padded.slice(index, index + 3));
  }
  return output;
}

function sharedPlace(left, right) {
  const values = new Map(left.map((place) => [
    `${place.provider}:${place.provider_place_id}`,
    place,
  ]));
  for (const place of right) {
    const match = values.get(`${place.provider}:${place.provider_place_id}`);
    if (match) return match;
  }
  return null;
}

function domain(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function coordinateKey(location) {
  return `${location.latitude.toFixed(6)}:${location.longitude.toFixed(6)}`;
}

function haversineKm(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(right.latitude - left.latitude);
  const dLon = radians(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(left.latitude))
    * Math.cos(radians(right.latitude))
    * Math.sin(dLon / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function compareCandidates(left, right) {
  const tierOrder = { critical: 0, high: 1, medium: 2 };
  return tierOrder[left.tier] - tierOrder[right.tier]
    || right.score - left.score
    || left.distance_meters - right.distance_meters
    || left.left.id - right.left.id
    || left.right.id - right.right.id;
}

function round(value) {
  return Number(value.toFixed(3));
}
