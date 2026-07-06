#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const GOOGLE_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
const GOOGLE_LEGACY_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_LEGACY_PLACE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const PROVIDER = "google";

let googleApiMode = "new";
let legacyFallbackLogged = false;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key]) {
      continue;
    }
    let value = rest.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const options = {
    db: process.env.CANONICAL_DB_PATH || "canonical.db",
    limit: 25,
    minConfidence: 0.6,
    staleDays: 30,
    aggregateOnly: true,
    onlyMissingReviews: true,
    dryRun: false,
    quiet: false,
    ids: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--db" && next) {
      options.db = next;
      index += 1;
    } else if (arg === "--limit" && next) {
      options.limit = Math.max(1, Number.parseInt(next, 10) || options.limit);
      index += 1;
    } else if (arg === "--min-confidence" && next) {
      options.minConfidence = Math.min(1, Math.max(0, Number.parseFloat(next) || options.minConfidence));
      index += 1;
    } else if (arg === "--stale-days" && next) {
      options.staleDays = Math.max(1, Number.parseInt(next, 10) || options.staleDays);
      index += 1;
    } else if (arg === "--ids" && next) {
      options.ids = next
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter(Number.isFinite);
      index += 1;
    } else if (arg === "--all") {
      options.onlyMissingReviews = false;
    } else if (arg === "--include-unrated") {
      options.aggregateOnly = false;
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help") {
      printHelp();
      process.exit(0);
    }
  }
  return options;
}

function printHelp() {
  console.log(`
Usage: npm run enrich:google-reviews -- [options]

Options:
  --limit <n>        Max listings to process. Defaults to 25.
  --min-confidence <n>
                     Minimum match confidence to store reviews. Defaults to 0.6.
  --ids <ids>        Comma-separated location ids to process.
  --db <path>        SQLite DB path. Defaults to canonical.db.
  --stale-days <n>   Skip rows fetched more recently than this. Defaults to 30.
  --include-unrated  Include listings without an existing rating/review count.
  --all              Include listings that already have first-party review rows.
  --quiet            Print progress summaries instead of every listing.
  --dry-run          Match and log without writing Google data.
`);
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS external_place_matches (
      location_id        INTEGER NOT NULL REFERENCES locations(id),
      provider           TEXT NOT NULL,
      provider_place_id  TEXT NOT NULL,
      provider_url       TEXT,
      display_name       TEXT,
      rating             REAL,
      review_count       INTEGER,
      match_confidence   REAL,
      match_status       TEXT,
      fetched_at         TEXT NOT NULL,
      expires_at         TEXT,
      raw_json           TEXT,
      PRIMARY KEY(location_id, provider)
    );

    CREATE TABLE IF NOT EXISTS external_reviews (
      id                 INTEGER PRIMARY KEY,
      location_id        INTEGER NOT NULL REFERENCES locations(id),
      provider           TEXT NOT NULL,
      provider_review_id TEXT NOT NULL,
      reviewer           TEXT,
      rating             REAL,
      review_date        TEXT,
      body               TEXT,
      source_url         TEXT,
      fetched_at         TEXT NOT NULL,
      expires_at         TEXT,
      raw_json           TEXT,
      UNIQUE(provider, provider_review_id)
    );

    CREATE INDEX IF NOT EXISTS idx_external_place_matches_location
      ON external_place_matches(location_id);
    CREATE INDEX IF NOT EXISTS idx_external_reviews_location_provider
      ON external_reviews(location_id, provider);
  `);
}

function targetLocations(db, options) {
  const values = [];
  const where = [
    "l.name IS NOT NULL",
    "TRIM(l.name) <> ''",
    "NOT EXISTS (SELECT 1 FROM external_place_matches epm WHERE epm.location_id = l.id AND epm.provider = ? AND epm.fetched_at >= datetime('now', ?))",
  ];
  values.push(PROVIDER, `-${options.staleDays} days`);

  if (options.aggregateOnly) {
    where.push("(l.rating IS NOT NULL OR COALESCE(l.review_count, 0) > 0)");
  }
  if (options.onlyMissingReviews) {
    where.push("NOT EXISTS (SELECT 1 FROM reviews r WHERE r.location_id = l.id)");
  }
  if (options.ids.length) {
    where.push(`l.id IN (${options.ids.map(() => "?").join(",")})`);
    values.push(...options.ids);
  }

  values.push(options.limit);
  return db
    .prepare(
      `
      SELECT
        l.id,
        l.name,
        l.address,
        l.locality,
        l.region,
        l.country_code,
        l.country_name,
        l.website,
        l.rating,
        l.review_count,
        org.canonical_name AS org_name
      FROM locations l
      LEFT JOIN organizations org ON org.id = l.org_id
      WHERE ${where.join(" AND ")}
      ORDER BY
        (l.review_count IS NULL),
        l.review_count DESC,
        (l.rating IS NULL),
        l.rating DESC,
        l.id
      LIMIT ?
    `,
    )
    .all(...values);
}

function normalized(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalized(value).split(/\s+/).filter((token) => token.length > 2));
}

const genericNameTokens = new Set([
  "and",
  "the",
  "clinic",
  "clinics",
  "center",
  "centre",
  "medical",
  "health",
  "wellness",
  "spa",
  "day",
  "care",
  "group",
  "new",
  "york",
  "jersey",
]);

function firstDistinctiveToken(value) {
  return normalized(value)
    .split(/\s+/)
    .find((token) => token.length > 2 && !genericNameTokens.has(token)) || null;
}

function hasDistinctiveNameSignal(location, place) {
  const token = location.name ? firstDistinctiveToken(location.name) : firstDistinctiveToken(location.org_name);
  if (!token) {
    return true;
  }
  return tokens(place.displayName?.text || "").has(token);
}

function overlapScore(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) {
    return 0;
  }
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(left.size, right.size);
}

function searchTextForLocation(location) {
  const pieces = [
    location.name || location.org_name,
    location.address,
    location.locality,
    location.region,
    location.country_name || location.country_code,
  ];
  return pieces.filter(Boolean).join(", ");
}

function confidenceFor(location, place) {
  const displayName = place.displayName?.text || "";
  const formattedAddress = place.formattedAddress || "";
  const nameScore = Math.max(overlapScore(location.name, displayName), overlapScore(location.org_name, displayName));
  const localityScore = normalized(formattedAddress).includes(normalized(location.locality)) ? 0.18 : 0;
  const countryScore =
    normalized(formattedAddress).includes(normalized(location.country_name)) ||
    normalized(formattedAddress).includes(normalized(location.country_code))
      ? 0.12
      : 0;
  const addressScore = location.address && overlapScore(location.address, formattedAddress) > 0.25 ? 0.2 : 0;
  const score = Math.min(1, nameScore * 0.5 + localityScore + countryScore + addressScore);
  return hasDistinctiveNameSignal(location, place) ? score : Math.min(score, 0.55);
}

async function googleFetch(url, options, apiKey) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      ...options.headers,
    },
  });
  const body = await response.text();
  let parsed = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = { raw: body };
  }
  if (!response.ok) {
    throw new Error(`Google API ${response.status}: ${JSON.stringify(parsed).slice(0, 500)}`);
  }
  return parsed;
}

function shouldFallbackToLegacy(error) {
  const message = error?.message || "";
  return (
    message.includes("SERVICE_DISABLED") ||
    message.includes("Places API (New)") ||
    message.includes("places.googleapis.com")
  );
}

function normalizeLegacyPlace(place) {
  if (!place) {
    return null;
  }
  return {
    id: place.place_id,
    displayName: { text: place.name || "" },
    formattedAddress: place.formatted_address || "",
    rating: place.rating ?? null,
    userRatingCount: place.user_ratings_total ?? null,
    googleMapsUri: place.url || (place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : null),
    reviews: (place.reviews || []).map((review) => ({
      authorAttribution: { displayName: review.author_name || null },
      rating: review.rating ?? null,
      publishTime: review.time ? new Date(review.time * 1000).toISOString() : null,
      text: { text: review.text || "" },
      googleMapsUri: place.url || null,
      legacy_relative_time_description: review.relative_time_description || null,
    })),
  };
}

async function googleLegacyFetch(url, params, apiKey) {
  const requestUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      requestUrl.searchParams.set(key, String(value));
    }
  }
  requestUrl.searchParams.set("key", apiKey);
  const response = await fetch(requestUrl);
  const payload = await response.json();
  if (!response.ok || !["OK", "ZERO_RESULTS"].includes(payload.status)) {
    throw new Error(`Google legacy API ${response.status} ${payload.status || ""}: ${payload.error_message || "request failed"}`);
  }
  return payload;
}

async function searchGooglePlaceLegacy(location, apiKey) {
  const payload = await googleLegacyFetch(
    GOOGLE_LEGACY_TEXT_SEARCH_URL,
    { query: searchTextForLocation(location) },
    apiKey,
  );
  const places = (payload.results || []).map(normalizeLegacyPlace).filter(Boolean);
  return places
    .map((place) => ({ place, confidence: confidenceFor(location, place) }))
    .sort((a, b) => b.confidence - a.confidence)[0] || null;
}

async function fetchGoogleDetailsLegacy(placeId, apiKey) {
  const payload = await googleLegacyFetch(
    GOOGLE_LEGACY_PLACE_DETAILS_URL,
    {
      place_id: placeId,
      fields: "place_id,name,formatted_address,rating,user_ratings_total,url,reviews",
    },
    apiKey,
  );
  return normalizeLegacyPlace(payload.result);
}

function logLegacyFallback() {
  if (!legacyFallbackLogged) {
    console.log("Places API (New) is unavailable for this key; falling back to legacy Google Places endpoints.");
    legacyFallbackLogged = true;
  }
}

function logResult(options, message) {
  if (!options.quiet) {
    console.log(message);
  }
}

async function searchGooglePlace(location, apiKey) {
  if (googleApiMode === "legacy") {
    return searchGooglePlaceLegacy(location, apiKey);
  }
  const payload = await googleFetch(
    GOOGLE_TEXT_SEARCH_URL,
    {
      method: "POST",
      headers: {
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri",
      },
      body: JSON.stringify({
        textQuery: searchTextForLocation(location),
        maxResultCount: 5,
      }),
    },
    apiKey,
  );
  const places = payload.places || [];
  return places
    .map((place) => ({ place, confidence: confidenceFor(location, place) }))
    .sort((a, b) => b.confidence - a.confidence)[0] || null;
}

async function fetchGoogleDetails(placeId, apiKey) {
  if (googleApiMode === "legacy") {
    return fetchGoogleDetailsLegacy(placeId, apiKey);
  }
  return googleFetch(
    `${GOOGLE_PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,rating,userRatingCount,googleMapsUri,reviews",
      },
    },
    apiKey,
  );
}

function reviewId(locationId, review) {
  const stable = [
    PROVIDER,
    locationId,
    review.publishTime,
    review.authorAttribution?.displayName,
    review.text?.text || review.originalText?.text,
  ].join("|");
  return crypto.createHash("sha256").update(stable).digest("hex");
}

function upsertGoogleData(db, location, match, details, confidence, fetchedAt, expiresAt) {
  const writePlace = db.prepare(`
    INSERT INTO external_place_matches (
      location_id, provider, provider_place_id, provider_url, display_name, rating,
      review_count, match_confidence, match_status, fetched_at, expires_at, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(location_id, provider) DO UPDATE SET
      provider_place_id = excluded.provider_place_id,
      provider_url = excluded.provider_url,
      display_name = excluded.display_name,
      rating = excluded.rating,
      review_count = excluded.review_count,
      match_confidence = excluded.match_confidence,
      match_status = excluded.match_status,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at,
      raw_json = excluded.raw_json
  `);
  const deleteReviews = db.prepare("DELETE FROM external_reviews WHERE location_id = ? AND provider = ?");
  const writeReview = db.prepare(`
    INSERT INTO external_reviews (
      location_id, provider, provider_review_id, reviewer, rating, review_date,
      body, source_url, fetched_at, expires_at, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_review_id) DO UPDATE SET
      location_id = excluded.location_id,
      reviewer = excluded.reviewer,
      rating = excluded.rating,
      review_date = excluded.review_date,
      body = excluded.body,
      source_url = excluded.source_url,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at,
      raw_json = excluded.raw_json
  `);

  const tx = db.transaction(() => {
    writePlace.run(
      location.id,
      PROVIDER,
      details.id || match.place.id,
      details.googleMapsUri || match.place.googleMapsUri || null,
      details.displayName?.text || match.place.displayName?.text || null,
      details.rating ?? match.place.rating ?? null,
      details.userRatingCount ?? match.place.userRatingCount ?? null,
      confidence,
      "matched",
      fetchedAt,
      expiresAt,
      JSON.stringify(details),
    );
    deleteReviews.run(location.id, PROVIDER);
    for (const review of details.reviews || []) {
      const body = review.text?.text || review.originalText?.text || null;
      writeReview.run(
        location.id,
        PROVIDER,
        reviewId(location.id, review),
        review.authorAttribution?.displayName || null,
        review.rating ?? null,
        review.publishTime || null,
        body,
        review.googleMapsUri || details.googleMapsUri || null,
        fetchedAt,
        expiresAt,
        JSON.stringify(review),
      );
    }
  });
  tx();
}

function markLowConfidence(db, location, match, fetchedAt, expiresAt) {
  db.prepare(
    `
    INSERT INTO external_place_matches (
      location_id, provider, provider_place_id, provider_url, display_name, rating,
      review_count, match_confidence, match_status, fetched_at, expires_at, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(location_id, provider) DO UPDATE SET
      provider_place_id = excluded.provider_place_id,
      provider_url = excluded.provider_url,
      display_name = excluded.display_name,
      rating = excluded.rating,
      review_count = excluded.review_count,
      match_confidence = excluded.match_confidence,
      match_status = excluded.match_status,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at,
      raw_json = excluded.raw_json
  `,
  ).run(
    location.id,
    PROVIDER,
    match?.place?.id || `unmatched-${location.id}`,
    match?.place?.googleMapsUri || null,
    match?.place?.displayName?.text || null,
    match?.place?.rating ?? null,
    match?.place?.userRatingCount ?? null,
    match?.confidence || 0,
    "low_confidence",
    fetchedAt,
    expiresAt,
    JSON.stringify(match?.place || null),
  );
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY. Add it to .env.local or the shell environment.");
  }

  const db = new Database(options.db);
  db.pragma("busy_timeout = 10000");
  ensureSchema(db);
  const targets = targetLocations(db, options);
  console.log(`Google review enrichment: ${targets.length} location(s), dryRun=${options.dryRun}`);

  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + options.staleDays * 24 * 60 * 60 * 1000).toISOString();
  let matched = 0;
  let lowConfidence = 0;
  let failed = 0;

  for (const location of targets) {
    try {
      let match;
      try {
        match = await searchGooglePlace(location, apiKey);
      } catch (error) {
        if (googleApiMode === "new" && shouldFallbackToLegacy(error)) {
          googleApiMode = "legacy";
          logLegacyFallback();
          match = await searchGooglePlace(location, apiKey);
        } else {
          throw error;
        }
      }
      if (!match || match.confidence < options.minConfidence) {
        lowConfidence += 1;
        if (!options.dryRun) {
          markLowConfidence(db, location, match, fetchedAt, expiresAt);
        }
        logResult(options, `low-confidence ${location.id}: ${location.name} (${(match?.confidence || 0).toFixed(2)})`);
        continue;
      }
      let details;
      try {
        details = await fetchGoogleDetails(match.place.id, apiKey);
      } catch (error) {
        if (googleApiMode === "new" && shouldFallbackToLegacy(error)) {
          googleApiMode = "legacy";
          logLegacyFallback();
          details = await fetchGoogleDetails(match.place.id, apiKey);
        } else {
          throw error;
        }
      }
      matched += 1;
      if (!options.dryRun) {
        upsertGoogleData(db, location, match, details, match.confidence, fetchedAt, expiresAt);
      }
      logResult(
        options,
        `matched ${location.id}: ${location.name} -> ${details.displayName?.text || match.place.displayName?.text} (${match.confidence.toFixed(2)}, ${details.reviews?.length || 0} reviews)`,
      );
    } catch (error) {
      failed += 1;
      logResult(options, `failed ${location.id}: ${location.name}: ${error.message}`);
    }

    const processed = matched + lowConfidence + failed;
    if (options.quiet && (processed % 50 === 0 || processed === targets.length)) {
      console.log(`progress ${processed}/${targets.length}: matched=${matched}, lowConfidence=${lowConfidence}, failed=${failed}`);
    }
  }

  db.close();
  console.log(`Done. matched=${matched}, lowConfidence=${lowConfidence}, failed=${failed}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
