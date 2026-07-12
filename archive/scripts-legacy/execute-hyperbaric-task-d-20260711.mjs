#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const ACTOR_ID = "7f94c2c4-57dd-4b9a-a905-7083e8d8a4ff";
const ACTOR_LABEL = "hyperbaric_cleanup_v2_20260711";
const LOCKED_SLUG = "o3-wellness-center-dubai";
const SOURCE_ID_HYPERBARIC_APP = 255;
const CLINIC_SOURCE_SLUG = "clinic_websites";
const CACHE_ROOT = path.join(ROOT, ".cache", "hyperbaric_cleanup_v2");
const options = parseArgs(process.argv.slice(2));
const limit = Number.parseInt(options.limit || "0", 10);
const llmConcurrency = Math.max(1, Number.parseInt(options.llmConcurrency || "4", 10));
const phase = options.phase || "all";
const placesDelayMs = Number.parseInt(options.placesDelayMs || "1000", 10);
const fetchTimeoutMs = Number.parseInt(options.fetchTimeoutMs || "15000", 10);
const model = options.model || "openai/gpt-4o-mini";
const apiUrl = options.apiUrl || "https://openrouter.ai/api/v1/chat/completions";
const maxWebsiteChars = Number.parseInt(options.maxWebsiteChars || "14000", 10);

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

const connectionString = normalizePostgresConnectionString(
  process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING,
);
const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
const llmKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

if (!connectionString) throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
if (!googleApiKey) throw new Error("Missing GOOGLE_PLACES_API_KEY, GOOGLE_MAPS_API_KEY, or GOOGLE_API_KEY.");
if (!llmKey) throw new Error("Missing OPENROUTER_API_KEY or OPENAI_API_KEY.");

mkdirSync(CACHE_ROOT, { recursive: true });
const client = new Client({ connectionString });
let lastPlacesCallAt = 0;
let clinicWebsiteSourceId = null;

const summary = {
  startedAt: null,
  d1: {
    rowsWithExistingPlaceId: 0,
    rowsWithoutPlaceId: 0,
    textSearchCalls: 0,
    detailsCalls: 0,
    newExternalMatches: 0,
    websiteFills: 0,
    phoneFills: 0,
    skippedNoConfidentMatch: 0,
    errors: 0,
  },
  d2: {
    locationsWithPlaceId: 0,
    detailsCalls: 0,
    reviewsSeen: 0,
    reviewsInserted: 0,
    reviewsDeduped: 0,
    errors: 0,
  },
  d3: {
    locationsProcessed: 0,
    llmCalls: 0,
    llmOk: 0,
    llmErrors: 0,
    extractedRawOfferings: 0,
    cappedLocations: 0,
    offeringsInserted: 0,
    offeringsDeduped: 0,
    unmappedTerms: 0,
    sourceRecordsInserted: 0,
    sourceRecordsExisting: 0,
  },
};

await client.connect();
try {
  summary.startedAt = (await one("SELECT clock_timestamp() AS ts")).ts;
  await createRawTablesAndSource();
  if (phase === "all" || phase === "d1") await runD1ContactBackfill();
  if (phase === "all" || phase === "d2") await runD2ReviewBackfill();
  if (phase === "all" || phase === "d3") await runD3OfferingExpansion();
  await printReport();
} finally {
  await client.end();
}

async function setActor() {
  await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2)", [ACTOR_ID, ACTOR_LABEL]);
}

async function createRawTablesAndSource() {
  await client.query("BEGIN");
  try {
    await setActor();
    await client.query(`
      CREATE TABLE IF NOT EXISTS fountain_raw.hyperbaric_task_d_contact_fills_20260711 (
        location_id integer NOT NULL,
        field_name text NOT NULL,
        new_value text,
        provider_place_id text,
        source text NOT NULL,
        filled_at timestamptz NOT NULL DEFAULT now(),
        actor_label text NOT NULL,
        PRIMARY KEY (location_id, field_name)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS fountain_raw.hyperbaric_task_d_review_backfill_20260711 (
        location_id integer NOT NULL,
        provider_place_id text NOT NULL,
        reviews_seen integer NOT NULL,
        reviews_inserted integer NOT NULL,
        reviews_deduped integer NOT NULL,
        status text NOT NULL,
        error_message text,
        processed_at timestamptz NOT NULL DEFAULT now(),
        actor_label text NOT NULL,
        PRIMARY KEY (location_id, provider_place_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS fountain_raw.clinic_website_offering_extractions_20260711 (
        location_id integer PRIMARY KEY,
        source_listing_id bigint,
        website text,
        status text NOT NULL,
        raw_offering_count integer NOT NULL DEFAULT 0,
        capped boolean NOT NULL DEFAULT false,
        extraction_json jsonb,
        error_message text,
        processed_at timestamptz NOT NULL DEFAULT now(),
        actor_label text NOT NULL
      )
    `);
    await client.query(`
      INSERT INTO fountain.sources (slug, trust_weight)
      VALUES ($1, 1)
      ON CONFLICT (slug) DO UPDATE SET trust_weight=EXCLUDED.trust_weight
    `, [CLINIC_SOURCE_SLUG]);
    const source = await one(`SELECT id FROM fountain.sources WHERE slug=$1`, [CLINIC_SOURCE_SLUG]);
    clinicWebsiteSourceId = source.id;
    const cacheStat = statSync(CACHE_ROOT);
    await client.query(`
      INSERT INTO fountain_raw.source_databases (
        source_slug, source_db_path, file_size_bytes, file_mtime_ms, file_sha256,
        listing_count, image_count, review_count, field_count, page_count,
        metadata, last_synced_at, sync_status, updated_at
      )
      VALUES ($1,$2,0,$3,NULL,0,0,0,0,0,$4::jsonb,now(),'synced',now())
      ON CONFLICT (source_slug) DO UPDATE
      SET source_db_path=EXCLUDED.source_db_path,
          file_mtime_ms=EXCLUDED.file_mtime_ms,
          metadata=EXCLUDED.metadata,
          last_synced_at=now(),
          sync_status='synced',
          updated_at=now()
    `, [
      CLINIC_SOURCE_SLUG,
      CACHE_ROOT,
      Math.round(cacheStat.mtimeMs),
      JSON.stringify({ phase: ACTOR_LABEL, source: "cached clinic website text" }),
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runD1ContactBackfill() {
  const rows = await many(`
    SELECT q.location_id, q.source_listing_id, l.name, l.address, l.locality, l.region, l.country_code,
           l.latitude, l.longitude, l.website, l.phone, l.slug,
           epm.provider_place_id
    FROM fountain_raw.hyperbaric_cleanup_queue_20260711 q
    JOIN fountain.locations l ON l.id=q.location_id
    LEFT JOIN fountain.external_place_matches epm
      ON epm.location_id=l.id AND epm.provider='google_places'
    WHERE l.status='active'
      AND l.slug <> $1
      AND (nullif(btrim(l.website),'') IS NULL OR nullif(btrim(l.phone),'') IS NULL)
    ORDER BY q.location_id
    ${limit > 0 ? `LIMIT ${limit}` : ""}
  `, [LOCKED_SLUG]);

  for (const row of rows) {
    try {
      let details = null;
      let source = "existing_place_id";
      if (row.provider_place_id) {
        summary.d1.rowsWithExistingPlaceId += 1;
        details = await googlePlaceDetails(row, row.provider_place_id, "contact");
      } else {
        summary.d1.rowsWithoutPlaceId += 1;
        const textSearch = await googleTextSearch(row, "d1_text_search_contact");
        const candidate = textSearch.results?.[0] || null;
        if (!candidate?.place_id) {
          summary.d1.skippedNoConfidentMatch += 1;
          continue;
        }
        details = await googlePlaceDetails(row, candidate.place_id, "contact");
        if (!isConfidentPlaceMatch(row, details.result)) {
          summary.d1.skippedNoConfidentMatch += 1;
          continue;
        }
        const inserted = await insertExternalPlaceMatch(row, details.result);
        if (inserted) summary.d1.newExternalMatches += 1;
        source = "text_search_then_details";
      }
      await fillNullContactFields(row, details.result, source);
    } catch (error) {
      summary.d1.errors += 1;
      await logCall({
        locationId: row.location_id,
        callType: "d1_contact_error",
        provider: "task_d",
        requestFingerprint: "contact_backfill",
        status: "error",
        errorMessage: error.message,
        responseSummary: { location_id: row.location_id },
      });
    }
  }
}

async function fillNullContactFields(row, place, source) {
  const website = stripTrackingParams(place?.website || null);
  const phone = place?.international_phone_number || null;
  const assignments = [];
  const params = [];
  const fills = [];
  if (!normalizeValue(row.website) && website) {
    params.push(website);
    assignments.push(`website=$${params.length}`);
    fills.push({ field: "website", value: website });
  }
  if (!normalizeValue(row.phone) && phone) {
    params.push(phone);
    assignments.push(`phone=$${params.length}`);
    fills.push({ field: "phone", value: phone });
  }
  if (!fills.length) return;
  await client.query("BEGIN");
  try {
    await setActor();
    params.push(row.location_id);
    await client.query(
      `
      UPDATE fountain.locations
      SET ${assignments.join(", ")}, updated_at=now()
      WHERE id=$${params.length}
        AND slug <> '${LOCKED_SLUG}'
        AND status='active'
      `,
      params,
    );
    for (const fill of fills) {
      await client.query(
        `
        INSERT INTO fountain_raw.hyperbaric_task_d_contact_fills_20260711 (
          location_id, field_name, new_value, provider_place_id, source, actor_label
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (location_id, field_name) DO UPDATE
        SET new_value=EXCLUDED.new_value,
            provider_place_id=EXCLUDED.provider_place_id,
            source=EXCLUDED.source,
            actor_label=EXCLUDED.actor_label
        `,
        [row.location_id, fill.field, fill.value, place?.place_id || row.provider_place_id || null, source, ACTOR_LABEL],
      );
      if (fill.field === "website") summary.d1.websiteFills += 1;
      if (fill.field === "phone") summary.d1.phoneFills += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runD2ReviewBackfill() {
  const rows = await many(`
    SELECT q.location_id, l.name, l.slug, epm.provider_place_id
    FROM fountain_raw.hyperbaric_cleanup_queue_20260711 q
    JOIN fountain.locations l ON l.id=q.location_id
    JOIN fountain.external_place_matches epm
      ON epm.location_id=l.id AND epm.provider='google_places'
    WHERE l.status='active'
      AND l.slug <> $1
      AND NOT EXISTS (SELECT 1 FROM fountain.reviews rv WHERE rv.location_id=l.id)
    ORDER BY q.location_id
    ${limit > 0 ? `LIMIT ${limit}` : ""}
  `, [LOCKED_SLUG]);
  summary.d2.locationsWithPlaceId = rows.length;

  for (const row of rows) {
    try {
      const details = await googlePlaceDetails(row, row.provider_place_id, "reviews");
      const reviews = Array.isArray(details.result?.reviews) ? details.result.reviews : [];
      summary.d2.reviewsSeen += reviews.length;
      const existing = await existingReviewKeys(row.location_id);
      let inserted = 0;
      let deduped = 0;
      for (const review of reviews) {
        const parsed = parseGoogleReview(review);
        const key = reviewDedupKey(parsed.author, parsed.review_date, parsed.text);
        if (existing.has(key)) {
          deduped += 1;
          continue;
        }
        await client.query("BEGIN");
        try {
          await setActor();
          await client.query(
            `
            INSERT INTO fountain.reviews (
              location_id, author, rating, review_date, text, source_id, status, data_origin,
              verification_status, provider, provider_place_id, fetched_at, raw_payload
            )
            VALUES ($1,$2,$3,$4,$5,$6,'active','scraped','unverified','google',$7,now(),$8::jsonb)
            `,
            [
              row.location_id,
              parsed.author,
              parsed.rating,
              parsed.review_date,
              parsed.text,
              SOURCE_ID_HYPERBARIC_APP,
              row.provider_place_id,
              JSON.stringify({ place_details: details.raw, review }),
            ],
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
        existing.add(key);
        inserted += 1;
      }
      await client.query("BEGIN");
      try {
        await setActor();
        await client.query(
          `
          INSERT INTO fountain_raw.hyperbaric_task_d_review_backfill_20260711 (
            location_id, provider_place_id, reviews_seen, reviews_inserted, reviews_deduped, status, actor_label
          )
          VALUES ($1,$2,$3,$4,$5,'ok',$6)
          ON CONFLICT (location_id, provider_place_id) DO UPDATE
          SET reviews_seen=EXCLUDED.reviews_seen,
              reviews_inserted=EXCLUDED.reviews_inserted,
              reviews_deduped=EXCLUDED.reviews_deduped,
              status='ok',
              error_message=NULL,
              processed_at=now(),
              actor_label=EXCLUDED.actor_label
          `,
          [row.location_id, row.provider_place_id, reviews.length, inserted, deduped, ACTOR_LABEL],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      summary.d2.reviewsInserted += inserted;
      summary.d2.reviewsDeduped += deduped;
    } catch (error) {
      summary.d2.errors += 1;
      await logReviewError(row, error);
    }
  }
}

async function runD3OfferingExpansion() {
  const mappings = await loadTreatmentMappings();
  const rows = await many(`
    SELECT q.location_id, q.source_listing_id, l.name, l.locality, l.country_code, l.website
    FROM fountain_raw.hyperbaric_cleanup_queue_20260711 q
    JOIN fountain.locations l ON l.id=q.location_id
    WHERE l.status='active'
      AND l.slug <> $1
      AND q.website_outcome='ok'
      AND NOT EXISTS (
        SELECT 1
        FROM fountain_raw.clinic_website_offering_extractions_20260711 e
        WHERE e.location_id=q.location_id AND e.status='ok'
      )
    ORDER BY q.location_id
    ${limit > 0 ? `LIMIT ${limit}` : ""}
  `, [LOCKED_SLUG]);

  let cursor = 0;
  const workers = Array.from({ length: llmConcurrency }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      await processOfferingExtraction(row, mappings);
      if (summary.d3.locationsProcessed % 25 === 0) {
        console.log(JSON.stringify({ progress: "d3", locationsProcessed: summary.d3.locationsProcessed, llmOk: summary.d3.llmOk, llmErrors: summary.d3.llmErrors }));
      }
    }
  });
  await Promise.all(workers);
}

async function processOfferingExtraction(row, mappings) {
  summary.d3.locationsProcessed += 1;
  const pages = await loadWebsiteText(row.location_id);
  const startedAt = Date.now();
  let extraction = null;
  let status = "ok";
  let errorMessage = null;
  let httpStatus = null;
  try {
    extraction = await callOfferingLlm(row, pages);
    httpStatus = extraction.httpStatus;
    summary.d3.llmOk += 1;
  } catch (error) {
    status = "error";
    errorMessage = error.message;
    summary.d3.llmErrors += 1;
  }
  summary.d3.llmCalls += 1;
  await logCall({
    locationId: row.location_id,
    callType: "d3_llm_offering_extraction",
    provider: "openrouter",
    requestFingerprint: model,
    status,
    httpStatus,
    errorMessage,
    responseSummary: {
      elapsed_ms: Date.now() - startedAt,
      model,
      offering_count: extraction?.offerings?.length || 0,
    },
  });
  if (status !== "ok") {
    await upsertExtraction(row, status, [], false, null, errorMessage);
    return;
  }

  const distinct = dedupeOfferings(extraction.offerings || []);
  const capped = distinct.length > 60;
  const offerings = capped ? distinct.slice(0, 60) : distinct;
  if (capped) summary.d3.cappedLocations += 1;
  summary.d3.extractedRawOfferings += distinct.length;
  await upsertExtraction(row, "ok", offerings, capped, extraction.rawJson, null, distinct.length);
  await insertMappedOfferings(row, offerings, mappings);
}

async function insertMappedOfferings(row, offerings, mappings) {
  let yieldedMappedOffering = false;
  for (const offering of offerings) {
    const rawName = cleanRawName(offering.raw_name);
    if (!rawName) continue;
    const normalized = normalizeTerm(rawName);
    const treatmentId = mappings.get(normalized);
    if (!treatmentId) {
      await logUnmappedTerm(rawName);
      summary.d3.unmappedTerms += 1;
      continue;
    }
    const price = parseOfferingPrice(offering.price);
    await client.query("BEGIN");
    try {
      await setActor();
      const inserted = await client.query(
        `
        INSERT INTO fountain.offerings (
          location_id, treatment_id, raw_name, price_amount, price_currency,
          source_offer_url, source_id, status, data_origin, verification_status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,'active','scraped','unverified')
        ON CONFLICT (location_id, source_id, raw_name) DO NOTHING
        `,
        [
          row.location_id,
          treatmentId,
          rawName,
          price?.amount ?? null,
          price?.currency ?? null,
          offering.source_url || row.website || null,
          clinicWebsiteSourceId,
        ],
      );
      await client.query("COMMIT");
      if (inserted.rowCount > 0) summary.d3.offeringsInserted += 1;
      else summary.d3.offeringsDeduped += 1;
      yieldedMappedOffering = true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  if (yieldedMappedOffering) await linkClinicSourceRecord(row);
}

async function linkClinicSourceRecord(row) {
  await client.query("BEGIN");
  try {
    await setActor();
    const inserted = await client.query(
      `
      INSERT INTO fountain.source_records (source_id, entity_type, entity_id, source_listing_id, source_url, raw_ref)
      SELECT $1, 'location', $2, $3, $4, $5
      WHERE NOT EXISTS (
        SELECT 1 FROM fountain.source_records
        WHERE source_id=$1 AND entity_type='location' AND entity_id=$2 AND source_listing_id=$3
      )
      `,
      [clinicWebsiteSourceId, row.location_id, row.location_id, row.website || null, `clinic_website:${row.location_id}`],
    );
    await client.query("COMMIT");
    if (inserted.rowCount > 0) summary.d3.sourceRecordsInserted += 1;
    else summary.d3.sourceRecordsExisting += 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function googleTextSearch(row, callType) {
  await throttlePlaces();
  summary.d1.textSearchCalls += 1;
  const query = [row.name, row.locality, row.region, row.country_code].filter(Boolean).join(" ");
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", googleApiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs) });
  const json = await response.json();
  await logCall({
    locationId: row.location_id,
    callType,
    provider: "google_places",
    requestFingerprint: redactKey(url),
    status: json.status === "OK" || json.status === "ZERO_RESULTS" ? "ok" : "error",
    httpStatus: response.status,
    errorMessage: json.error_message || null,
    responseSummary: {
      status: json.status,
      result_count: json.results?.length || 0,
      top_place_id: json.results?.[0]?.place_id || null,
      top_name: json.results?.[0]?.name || null,
    },
  });
  if (!response.ok || !["OK", "ZERO_RESULTS"].includes(json.status)) throw new Error(json.error_message || json.status || `HTTP ${response.status}`);
  return json;
}

async function googlePlaceDetails(row, placeId, purpose) {
  await throttlePlaces();
  const callType = purpose === "reviews" ? "d2_place_details_reviews" : "d1_place_details_contact";
  if (purpose === "reviews") summary.d2.detailsCalls += 1;
  else summary.d1.detailsCalls += 1;
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    purpose === "reviews"
      ? "name,url,rating,user_ratings_total,reviews"
      : "name,url,geometry,formatted_address,international_phone_number,website,rating,user_ratings_total,business_status,types",
  );
  url.searchParams.set("key", googleApiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs) });
  const json = await response.json();
  if (json.result) json.result.place_id = placeId;
  await logCall({
    locationId: row.location_id,
    callType,
    provider: "google_places",
    requestFingerprint: redactKey(url),
    status: json.status === "OK" ? "ok" : "error",
    httpStatus: response.status,
    errorMessage: json.error_message || null,
    responseSummary: {
      status: json.status,
      place_id: placeId,
      name: json.result?.name || null,
      has_website: Boolean(json.result?.website),
      has_phone: Boolean(json.result?.international_phone_number),
      reviews: json.result?.reviews?.length || 0,
    },
  });
  if (!response.ok || json.status !== "OK") throw new Error(json.error_message || json.status || `HTTP ${response.status}`);
  return { result: json.result, raw: json };
}

async function insertExternalPlaceMatch(row, place) {
  const distance = distanceMeters(row.latitude, row.longitude, place.geometry?.location?.lat, place.geometry?.location?.lng);
  const similarity = nameSimilarity(row.name || "", place.name || "");
  const raw = {
    provider: "google_places",
    phase: ACTOR_LABEL,
    task: "D1 contact backfill",
    place,
    match: { distance_meters: distance, name_similarity: similarity },
  };
  await client.query("BEGIN");
  try {
    await setActor();
    const result = await client.query(
      `
      INSERT INTO fountain.external_place_matches (
        location_id, provider, provider_place_id, provider_url, display_name, rating, review_count,
        match_confidence, match_status, fetched_at, raw_json
      )
      VALUES ($1,'google_places',$2,$3,$4,$5,$6,$7,'matched',now(),$8::jsonb)
      ON CONFLICT (location_id, provider) DO NOTHING
      `,
      [
        row.location_id,
        place.place_id || place.id,
        place.url || null,
        place.name || null,
        place.rating ?? null,
        place.user_ratings_total ?? null,
        Math.max(0, Math.min(1, similarity * 0.65 + (distance === null ? 0 : Math.max(0, 1 - distance / 500) * 0.35))),
        JSON.stringify(raw),
      ],
    );
    await client.query("COMMIT");
    return result.rowCount > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function existingReviewKeys(locationId) {
  const rows = await many(
    `SELECT author, review_date, text FROM fountain.reviews WHERE location_id=$1`,
    [locationId],
  );
  return new Set(rows.map((row) => reviewDedupKey(row.author, row.review_date, row.text || "")));
}

function parseGoogleReview(review) {
  const reviewDate = review.time ? new Date(Number(review.time) * 1000).toISOString().slice(0, 10) : null;
  return {
    author: review.author_name || review.author || null,
    rating: review.rating ?? null,
    review_date: reviewDate,
    text: review.text || null,
  };
}

function reviewDedupKey(author, reviewDate, text) {
  const normalizedAuthor = String(author || "").toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
  const normalizedDate = reviewDate ? String(reviewDate).slice(0, 10) : "";
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim().slice(0, 120).toLowerCase();
  return `${normalizedAuthor}|${normalizedDate}|${normalizedText}`;
}

async function logReviewError(row, error) {
  await client.query("BEGIN");
  try {
    await setActor();
    await client.query(
      `
      INSERT INTO fountain_raw.hyperbaric_task_d_review_backfill_20260711 (
        location_id, provider_place_id, reviews_seen, reviews_inserted, reviews_deduped, status, error_message, actor_label
      )
      VALUES ($1,$2,0,0,0,'error',$3,$4)
      ON CONFLICT (location_id, provider_place_id) DO UPDATE
      SET status='error',
          error_message=EXCLUDED.error_message,
          processed_at=now(),
          actor_label=EXCLUDED.actor_label
      `,
      [row.location_id, row.provider_place_id || "unknown", error.message, ACTOR_LABEL],
    );
    await client.query("COMMIT");
  } catch (inner) {
    await client.query("ROLLBACK");
    throw inner;
  }
}

async function loadWebsiteText(locationId) {
  const rows = await many(
    `
    SELECT requested_url, final_url, page_role, outcome, title, text_path
    FROM fountain_raw.hyperbaric_cleanup_website_fetches_20260711
    WHERE location_id=$1 AND outcome='ok'
    ORDER BY id
    LIMIT 3
    `,
    [locationId],
  );
  let remaining = maxWebsiteChars;
  const pages = [];
  for (const row of rows) {
    let text = "";
    if (row.text_path && remaining > 0) {
      const resolved = path.resolve(ROOT, row.text_path);
      if (resolved.startsWith(CACHE_ROOT) && existsSync(resolved)) {
        text = readFileSync(resolved, "utf8").slice(0, remaining);
        remaining -= text.length;
      }
    }
    pages.push({
      requested_url: row.requested_url,
      final_url: row.final_url,
      page_role: row.page_role,
      title: row.title,
      text,
    });
  }
  return pages;
}

async function callOfferingLlm(row, pages) {
  const prompt = [
    "Extract clinic website offerings from the supplied website text.",
    "Return strict JSON only: {\"offerings\":[{\"raw_name\":\"...\",\"price\":{\"amount\":number,\"currency\":\"ISO_or_symbol\",\"unit\":\"...\",\"raw_text\":\"...\"}|null,\"source_url\":\"...\"}]}",
    "Include distinct treatments, services, therapies, diagnostics, wellness protocols, and named programs the clinic offers.",
    "Do not include navigation labels, generic words like 'Contact', blog titles, team names, testimonials, memberships unless they are a sellable service, or duplicate names.",
    "Use only observed website text. If price is not explicit, price must be null.",
    `Location: ${row.name || ""} ${row.locality || ""} ${row.country_code || ""}`,
    `Website: ${row.website || ""}`,
    "Pages:",
    JSON.stringify(pages),
  ].join("\n\n");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${llmKey}`,
      "content-type": "application/json",
      "http-referer": "https://fountain.local",
      "x-title": "Fountain Hyperbaric Task D Offering Extraction",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You extract structured clinic offerings from provided text. Return JSON only and never invent services." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`LLM response envelope not JSON: ${bodyText.slice(0, 500)}`);
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`LLM missing content: ${JSON.stringify(body).slice(0, 500)}`);
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`LLM content not JSON: ${content.slice(0, 500)}`);
    parsed = JSON.parse(match[0]);
  }
  return {
    httpStatus: response.status,
    offerings: Array.isArray(parsed.offerings) ? parsed.offerings : [],
    rawJson: parsed,
  };
}

function dedupeOfferings(offerings) {
  const seen = new Set();
  const out = [];
  for (const offering of offerings) {
    const rawName = cleanRawName(offering?.raw_name);
    if (!rawName) continue;
    const key = normalizeTerm(rawName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      raw_name: rawName,
      price: offering?.price && typeof offering.price === "object" ? offering.price : null,
      source_url: offering?.source_url || null,
    });
  }
  return out;
}

async function upsertExtraction(row, status, offerings, capped, rawJson, errorMessage, rawOfferingCount = offerings.length) {
  await client.query("BEGIN");
  try {
    await setActor();
    await client.query(
      `
      INSERT INTO fountain_raw.clinic_website_offering_extractions_20260711 (
        location_id, source_listing_id, website, status, raw_offering_count, capped,
        extraction_json, error_message, actor_label
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
      ON CONFLICT (location_id) DO UPDATE
      SET source_listing_id=EXCLUDED.source_listing_id,
          website=EXCLUDED.website,
          status=EXCLUDED.status,
          raw_offering_count=EXCLUDED.raw_offering_count,
          capped=EXCLUDED.capped,
          extraction_json=EXCLUDED.extraction_json,
          error_message=EXCLUDED.error_message,
          processed_at=now(),
          actor_label=EXCLUDED.actor_label
      `,
      [
        row.location_id,
        row.source_listing_id,
        row.website,
        status,
        rawOfferingCount,
        capped,
        JSON.stringify(rawJson || { offerings }),
        errorMessage,
        ACTOR_LABEL,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function loadTreatmentMappings() {
  const mappings = new Map();
  const treatments = await many(`SELECT id, canonical_name FROM fountain.treatments`);
  for (const row of treatments) mappings.set(normalizeTerm(row.canonical_name), row.id);
  const aliases = await many(`SELECT treatment_id, alias_text, alias_normalized FROM fountain_raw.treatment_aliases`);
  for (const row of aliases) {
    const normalized = row.alias_normalized || normalizeTerm(row.alias_text);
    if (!mappings.has(normalized)) mappings.set(normalized, row.treatment_id);
  }
  return mappings;
}

async function logUnmappedTerm(term) {
  await client.query("BEGIN");
  try {
    await setActor();
    await client.query(
      `
      INSERT INTO fountain_raw.unmapped_terms (term, source_slug, occurrences)
      VALUES ($1,$2,1)
      ON CONFLICT (term, source_slug) DO UPDATE
      SET occurrences=fountain_raw.unmapped_terms.occurrences + 1
      `,
      [term, CLINIC_SOURCE_SLUG],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function parseOfferingPrice(price) {
  if (!price || typeof price !== "object") return null;
  const amount = Number(price.amount);
  const currency = typeof price.currency === "string" ? normalizeCurrency(price.currency) : "";
  if (!Number.isFinite(amount) || amount <= 0 || !currency) return null;
  return { amount, currency };
}

function normalizeCurrency(currency) {
  const trimmed = currency.trim().toUpperCase();
  const symbols = { "$": "USD", "€": "EUR", "£": "GBP", "AED": "AED" };
  return symbols[trimmed] || trimmed.slice(0, 3);
}

function cleanRawName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function normalizeTerm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function logCall({ locationId, callType, provider, requestFingerprint, status, httpStatus = null, errorMessage = null, responseSummary = null }) {
  await client.query("BEGIN");
  try {
    await setActor();
    await client.query(
      `
      INSERT INTO fountain_raw.hyperbaric_cleanup_call_ledger_20260711 (
        location_id, call_type, provider, request_fingerprint, status, http_status, error_message, response_summary
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      `,
      [locationId, callType, provider, requestFingerprint, status, httpStatus, errorMessage, responseSummary ? JSON.stringify(responseSummary) : null],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function isConfidentPlaceMatch(row, place) {
  const distance = distanceMeters(row.latitude, row.longitude, place.geometry?.location?.lat, place.geometry?.location?.lng);
  const similarity = nameSimilarity(row.name || "", place.name || "");
  return distance !== null && distance < 500 && similarity >= 0.5;
}

function nameSimilarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const token of ta) if (tb.has(token)) overlap++;
  const jaccard = overlap / new Set([...ta, ...tb]).size;
  const subset = overlap / Math.min(ta.size, tb.size);
  return Math.max(jaccard, subset * 0.85);
}

function tokens(value) {
  const stop = new Set(["a", "an", "and", "at", "by", "for", "of", "the", "with", "clinic", "center", "centre", "medical", "wellness", "health", "therapy", "llc", "inc", "pllc"]);
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 1 && !stop.has(token)));
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v === null || v === undefined || Number.isNaN(Number(v)))) return null;
  const r = 6371000;
  const dLat = radians(Number(lat2) - Number(lat1));
  const dLon = radians(Number(lon2) - Number(lon1));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(Number(lat1))) * Math.cos(radians(Number(lat2))) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.asin(Math.sqrt(a));
}

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function stripTrackingParams(value) {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        ["gclid", "fbclid", "msclkid", "wbraid", "gbraid", "yclid", "_hsenc", "_hsmi"].includes(lower)
      ) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function redactKey(url) {
  const clone = new URL(url.toString());
  if (clone.searchParams.has("key")) clone.searchParams.set("key", "REDACTED");
  return clone.toString();
}

async function throttlePlaces() {
  const elapsed = Date.now() - lastPlacesCallAt;
  if (elapsed < placesDelayMs) await sleep(placesDelayMs - elapsed);
  lastPlacesCallAt = Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeValue(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

async function printReport() {
  const post = await one(`
    WITH scope AS (
      SELECT q.location_id
      FROM fountain_raw.hyperbaric_cleanup_queue_20260711 q
      JOIN fountain.locations l ON l.id=q.location_id
      WHERE l.status='active'
        AND l.slug <> $1
    )
    SELECT
      count(*)::int AS active_non_hidden_queue_members,
      count(*) FILTER (WHERE nullif(btrim(l.website),'') IS NULL)::int AS website_is_null,
      count(*) FILTER (WHERE nullif(btrim(l.phone),'') IS NULL)::int AS phone_is_null,
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM fountain.reviews rv WHERE rv.location_id=l.id))::int AS zero_reviews_rows,
      count(*) FILTER (WHERE epm.provider_place_id IS NOT NULL)::int AS existing_external_place_matches_place_id
    FROM scope s
    JOIN fountain.locations l ON l.id=s.location_id
    LEFT JOIN fountain.external_place_matches epm ON epm.location_id=l.id AND epm.provider='google_places'
  `, [LOCKED_SLUG]);
  const ledgers = await many(`
    SELECT call_type, provider, status, count(*)::int AS calls
    FROM fountain_raw.hyperbaric_cleanup_call_ledger_20260711
    WHERE call_type LIKE 'd1_%'
       OR call_type LIKE 'd2_%'
       OR call_type LIKE 'd3_%'
    GROUP BY 1,2,3 ORDER BY 1,2,3
  `);
  const eventCounts = await many(`
    SELECT entity_type, action, count(*)::int AS events
    FROM fountain.entity_change_events
    WHERE actor_id=$1::uuid
      AND actor_type=$2
      AND created_at >= $3::timestamptz
    GROUP BY 1,2 ORDER BY 1,2
  `, [ACTOR_ID, ACTOR_LABEL, summary.startedAt]);
  const mappedDistribution = await many(`
    SELECT o.treatment_id, t.canonical_name, count(*)::int AS offerings
    FROM fountain.offerings o
    JOIN fountain.treatments t ON t.id=o.treatment_id
    WHERE o.source_id=$1
    GROUP BY 1,2 ORDER BY offerings DESC, t.canonical_name
  `, [clinicWebsiteSourceId]);
  const flagged = await many(`
    SELECT e.location_id, l.name, e.raw_offering_count, e.capped
    FROM fountain_raw.clinic_website_offering_extractions_20260711 e
    JOIN fountain.locations l ON l.id=e.location_id
    WHERE e.capped=true
    ORDER BY e.raw_offering_count DESC, e.location_id
  `);
  const extractionCounts = await many(`
    SELECT status, count(*)::int AS rows, coalesce(sum(raw_offering_count),0)::int AS raw_offerings
    FROM fountain_raw.clinic_website_offering_extractions_20260711
    WHERE actor_label=$1
    GROUP BY 1 ORDER BY 1
  `, [ACTOR_LABEL]);
  const unmapped = await one(`
    SELECT count(*)::int AS terms, coalesce(sum(occurrences),0)::int AS occurrences
    FROM fountain_raw.unmapped_terms
    WHERE source_slug=$1
  `, [CLINIC_SOURCE_SLUG]);
  console.log(JSON.stringify({ summary, post, ledgers, eventCounts, mappedDistribution, flagged, extractionCounts, unmapped }, null, 2));
}

async function one(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

async function many(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--limit") parsed.limit = args[++index];
    else if (arg.startsWith("--limit=")) parsed.limit = arg.slice("--limit=".length);
    else if (arg === "--phase") parsed.phase = args[++index];
    else if (arg.startsWith("--phase=")) parsed.phase = arg.slice("--phase=".length);
    else if (arg === "--llm-concurrency") parsed.llmConcurrency = args[++index];
    else if (arg.startsWith("--llm-concurrency=")) parsed.llmConcurrency = arg.slice("--llm-concurrency=".length);
    else if (arg === "--places-delay-ms") parsed.placesDelayMs = args[++index];
    else if (arg.startsWith("--places-delay-ms=")) parsed.placesDelayMs = arg.slice("--places-delay-ms=".length);
    else if (arg === "--fetch-timeout-ms") parsed.fetchTimeoutMs = args[++index];
    else if (arg.startsWith("--fetch-timeout-ms=")) parsed.fetchTimeoutMs = arg.slice("--fetch-timeout-ms=".length);
    else if (arg === "--model") parsed.model = args[++index];
    else if (arg.startsWith("--model=")) parsed.model = arg.slice("--model=".length);
    else if (arg === "--api-url") parsed.apiUrl = args[++index];
    else if (arg.startsWith("--api-url=")) parsed.apiUrl = arg.slice("--api-url=".length);
    else if (arg === "--max-website-chars") parsed.maxWebsiteChars = args[++index];
    else if (arg.startsWith("--max-website-chars=")) parsed.maxWebsiteChars = arg.slice("--max-website-chars=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function normalizePostgresConnectionString(value) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode"))) url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  } catch {
    return value;
  }
}
