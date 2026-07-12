import { getPlacesRequestConfig } from "../config/providers.mjs";
import {
  query as defaultQuery,
  setMutationActor,
  withTransaction as defaultWithTransaction,
} from "../lib/db.mjs";
import { recordWrite as defaultRecordWrite } from "../lib/ledger.mjs";
import { createPlacesClient } from "../lib/places.mjs";

export const REVIEWS_FETCH_SCHEMA_VERSION = 1;
export const REVIEWS_FETCH_ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607120014";
export const REVIEWS_FETCH_SOURCE_SLUG = "google_places_reviews";
export const REVIEWS_FETCH_PROVIDER = "google";
export const REVIEWS_FETCH_MINIMUM_STORED_REVIEWS = 3;
export const REVIEWS_FETCH_SOURCE_LISTING_SEQUENCE =
  "fountain_raw.google_places_reviews_listing_id_seq";

// Current global Places API (New) list price, first paid volume tier:
// Place Details Enterprise + Atmosphere = $25 / 1,000 successful requests.
export const REVIEWS_FETCH_DETAILS_SKU = "Places API Place Details Enterprise + Atmosphere";
export const REVIEWS_FETCH_DETAILS_SKU_ID = "EB23-5ECC-F753";
export const REVIEWS_FETCH_DETAILS_COST_USD = 0.025;
export const REVIEWS_FETCH_ID_SEARCH_COST_USD = 0;
export const REVIEWS_FETCH_PRICING_URL =
  "https://developers.google.com/maps/billing-and-pricing/pricing";
export const REVIEWS_FETCH_FIELD_SKU_URL =
  "https://developers.google.com/maps/documentation/places/web-service/place-details";

const GOOGLE_PROVIDER_NAMES = ["google_places", "google", "google_place", "places"];
const DETAILS_FIELD_MASK = getPlacesRequestConfig("reviews_fetch", "details").fieldMask;
const SEARCH_FIELD_MASK = getPlacesRequestConfig("reviews_fetch", "searchText").fieldMask;
const NAME_STOP_WORDS = new Set([
  "and",
  "care",
  "center",
  "centre",
  "clinic",
  "clinics",
  "group",
  "health",
  "hospital",
  "medical",
  "of",
  "the",
  "wellness",
]);

export const REVIEWS_FETCH_LOAD_SQL = `
  SELECT
    location.id,
    location.name,
    location.address,
    location.locality,
    location.region,
    location.postal_code,
    location.country_code,
    location.status,
    location.deleted_at,
    organization.canonical_name AS organization_name,
    COALESCE(review_data.review_count, 0)::integer AS review_count,
    COALESCE(place_data.external_place_matches, '[]'::jsonb) AS external_place_matches,
    NOT EXISTS (
      SELECT 1
      FROM fountain.source_records source_record
      JOIN fountain.sources source ON source.id = source_record.source_id
      JOIN fountain_raw.suppressed_source_listings suppressed
        ON suppressed.source_slug = source.slug
       AND suppressed.source_listing_id = source_record.source_listing_id
      WHERE source_record.entity_type = 'location'
        AND source_record.entity_id = location.id
        AND source_record.source_listing_id IS NOT NULL
    ) AS non_suppressed
  FROM fountain.locations location
  LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS review_count
    FROM fountain.reviews review
    WHERE review.location_id = location.id
      AND review.status = 'active'
      AND review.deleted_at IS NULL
  ) review_data ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'provider', place.provider,
        'provider_place_id', place.provider_place_id,
        'display_name', place.display_name,
        'match_status', place.match_status,
        'match_confidence', place.match_confidence
      ) ORDER BY place.provider
    ) AS external_place_matches
    FROM fountain.external_place_matches place
    WHERE place.location_id = location.id
      AND nullif(btrim(place.provider_place_id), '') IS NOT NULL
  ) place_data ON true
  WHERE location.id = $1
`;

export const REVIEWS_FETCH_RECHECK_SQL = `
  SELECT
    location.id,
    location.status,
    location.deleted_at,
    COALESCE(review_data.review_count, 0)::integer AS review_count,
    COALESCE(place_data.external_place_matches, '[]'::jsonb) AS external_place_matches,
    NOT EXISTS (
      SELECT 1
      FROM fountain.source_records source_record
      JOIN fountain.sources source ON source.id = source_record.source_id
      JOIN fountain_raw.suppressed_source_listings suppressed
        ON suppressed.source_slug = source.slug
       AND suppressed.source_listing_id = source_record.source_listing_id
      WHERE source_record.entity_type = 'location'
        AND source_record.entity_id = location.id
        AND source_record.source_listing_id IS NOT NULL
    ) AS non_suppressed
  FROM fountain.locations location
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS review_count
    FROM fountain.reviews review
    WHERE review.location_id = location.id
      AND review.status = 'active'
      AND review.deleted_at IS NULL
  ) review_data ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'provider', place.provider,
        'provider_place_id', place.provider_place_id,
        'display_name', place.display_name,
        'match_status', place.match_status,
        'match_confidence', place.match_confidence
      ) ORDER BY place.provider
    ) AS external_place_matches
    FROM fountain.external_place_matches place
    WHERE place.location_id = location.id
      AND nullif(btrim(place.provider_place_id), '') IS NOT NULL
  ) place_data ON true
  WHERE location.id = $1
  FOR UPDATE OF location
`;

const UPSERT_PLACE_DETAILS_SQL = `
  INSERT INTO fountain.external_place_matches (
    location_id,
    provider,
    provider_place_id,
    provider_url,
    display_name,
    rating,
    review_count,
    match_confidence,
    match_status,
    fetched_at,
    expires_at,
    raw_json
  )
  VALUES (
    $1,
    $2,
    $3,
    'https://www.google.com/maps/place/?q=place_id:' || $3,
    $4,
    $5,
    $6,
    1.0,
    'details_verified',
    $7::timestamptz,
    $7::timestamptz + interval '30 days',
    $8::jsonb
  )
  ON CONFLICT (location_id, provider) DO UPDATE
  SET provider_place_id = EXCLUDED.provider_place_id,
      provider_url = EXCLUDED.provider_url,
      display_name = EXCLUDED.display_name,
      rating = EXCLUDED.rating,
      review_count = EXCLUDED.review_count,
      match_confidence = EXCLUDED.match_confidence,
      match_status = EXCLUDED.match_status,
      fetched_at = EXCLUDED.fetched_at,
      expires_at = EXCLUDED.expires_at,
      raw_json = EXCLUDED.raw_json
`;

const UPSERT_RAW_REVIEWS_SQL = `
  INSERT INTO fountain_raw.source_reviews (
    source_slug,
    source_listing_id,
    review_ordinal,
    reviewer,
    rating,
    review_date,
    body,
    raw_json,
    synced_at
  )
  SELECT
    $1,
    $2,
    review.review_ordinal,
    review.reviewer,
    review.rating,
    review.review_date,
    review.body,
    review.raw_json,
    $4::timestamptz
  FROM jsonb_to_recordset($3::jsonb) AS review(
    review_ordinal integer,
    reviewer text,
    rating text,
    review_date text,
    body text,
    raw_json text
  )
  ON CONFLICT (source_slug, source_listing_id, review_ordinal) DO UPDATE
  SET reviewer = EXCLUDED.reviewer,
      rating = EXCLUDED.rating,
      review_date = EXCLUDED.review_date,
      body = EXCLUDED.body,
      raw_json = EXCLUDED.raw_json,
      synced_at = EXCLUDED.synced_at
`;

const INSERT_SERVING_REVIEWS_SQL = `
  WITH input AS (
    SELECT *
    FROM jsonb_to_recordset($1::jsonb) AS review(
      review_ordinal integer,
      reviewer text,
      rating numeric,
      review_date date,
      body text,
      provider_review_id text,
      raw_payload jsonb
    )
  ), inserted AS (
    INSERT INTO fountain.reviews (
      id,
      location_id,
      author,
      rating,
      review_date,
      text,
      source_id,
      status,
      data_origin,
      verification_status,
      created_at,
      updated_at,
      deleted_at,
      owner_account_id,
      provider,
      provider_place_id,
      fetched_at,
      raw_payload
    )
    SELECT
      nextval(pg_get_serial_sequence('fountain.reviews', 'id'))::integer,
      $2,
      input.reviewer,
      input.rating,
      input.review_date,
      input.body,
      $3,
      'active',
      'imported',
      'unverified',
      $5::timestamptz,
      $5::timestamptz,
      NULL,
      NULL,
      'google',
      $4,
      $5::timestamptz,
      input.raw_payload
    FROM input
    WHERE NOT EXISTS (
      SELECT 1
      FROM fountain.reviews existing
      WHERE existing.location_id = $2
        AND (
          (
            nullif(input.provider_review_id, '') IS NOT NULL
            AND COALESCE(
              existing.raw_payload->>'provider_review_id',
              existing.raw_payload->>'google_review_name'
            ) = input.provider_review_id
          )
          OR (
            lower(btrim(COALESCE(existing.author, ''))) = lower(btrim(COALESCE(input.reviewer, '')))
            AND lower(btrim(COALESCE(existing.text, ''))) = lower(btrim(COALESCE(input.body, '')))
          )
        )
    )
    ORDER BY input.review_ordinal
    RETURNING id
  )
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::integer[]) AS inserted_ids
  FROM inserted
`;

export function createReviewsFetchHandler(dependencies = {}) {
  return (input) => handleReviewsFetch(input, dependencies);
}

/**
 * Queue-handler-compatible Google review enrichment. Stored Google aliases are
 * tried in deterministic preference order before one ID-only search fallback,
 * and every write rechecks eligibility in a transaction after the external
 * calls.
 */
export async function handleReviewsFetch(
  { task, run },
  {
    query = defaultQuery,
    withTransaction = defaultWithTransaction,
    setActor = setMutationActor,
    recordWrite = defaultRecordWrite,
    placesClient = createPlacesClient(),
  } = {},
) {
  const taskId = positiveIntegerString(task?.id, "task.id");
  const locationId = positiveInteger(task?.entity_id, "task.entity_id");
  const runId = positiveIntegerString(run?.id, "run.id");
  if (task?.entity_type && task.entity_type !== "location") {
    throw new Error("reviews_fetch supports only location tasks.");
  }

  const loaded = await executeQuery(query, REVIEWS_FETCH_LOAD_SQL, [locationId]);
  const row = rowsFrom(loaded)[0];
  if (!row) return skippedResult({ taskId, runId, locationId, reason: "location_missing" });
  const location = normalizeLocation(row);
  const ineligibleReason = eligibilityReason(location);
  if (ineligibleReason) {
    return skippedResult({ taskId, runId, locationId, reason: ineligibleReason, location });
  }

  const evidence = {
    discovery: [],
    details: null,
    details_attempts: [],
    pricing: pricingEvidence(),
  };
  const storedPlaceMatches = distinctStoredGooglePlaceMatches(location.externalPlaceMatches);
  const attemptedPlaceIds = new Set();
  const providerErrors = [];
  let placeMatch = null;
  let selectedDetails = null;
  let placeMatchWrite = {
    attempted: false,
    written: false,
    reason: storedPlaceMatches.length > 0 ? "stored_provider_ids_unverified" : "not_attempted",
  };

  for (const storedPlaceMatch of storedPlaceMatches) {
    attemptedPlaceIds.add(storedPlaceMatch.providerPlaceId);
    evidence.discovery.push({
      operation: "stored_provider_id",
      outcome: "details_requested",
      provider: storedPlaceMatch.provider,
      provider_place_id: storedPlaceMatch.providerPlaceId,
      cost_estimate_usd: 0,
    });
    const candidate = await fetchAndValidateDetails({
      placesClient,
      runId,
      location,
      placeMatch: storedPlaceMatch,
      source: "stored_provider_id",
      evidence,
    });
    if (candidate.error) providerErrors.push(candidate.error);
    if (!candidate.identityValidated) continue;
    placeMatch = storedPlaceMatch;
    selectedDetails = candidate;
    placeMatchWrite = {
      attempted: false,
      written: false,
      reason: "stored_provider_id",
      provider: storedPlaceMatch.provider,
      providerPlaceId: storedPlaceMatch.providerPlaceId,
      identityValidated: true,
    };
    break;
  }

  if (!placeMatch) {
    const search = await placesClient.searchText({
      runId,
      taskType: "reviews_fetch",
      entityId: locationId,
      textQuery: placesTextQuery(location),
      ...(location.countryCode ? { regionCode: location.countryCode } : {}),
      maxResultCount: 1,
      maxAttempts: 4,
    });
    const providerPlaceId = text(search?.data?.places?.[0]?.id);
    const duplicateStoredPlaceId = providerPlaceId && attemptedPlaceIds.has(providerPlaceId);
    evidence.discovery.push({
      operation: "search_text",
      outcome: duplicateStoredPlaceId
        ? "duplicate_place_id_already_validated"
        : providerPlaceId
          ? "place_id_found"
          : "no_results",
      provider_place_id: providerPlaceId || null,
      external_call_id: search?.externalCallId ?? null,
      field_mask: search?.fieldMask || SEARCH_FIELD_MASK,
      cost_estimate_usd: number(search?.costEstimateUsd),
    });
    if (providerPlaceId && !duplicateStoredPlaceId) {
      // ID-only search has no identity fields. Keep the candidate ephemeral
      // until the paid Details response validates the business identity; the
      // verified match is then inserted atomically with raw/serving reviews.
      placeMatchWrite = {
        attempted: false,
        written: false,
        reason: "pending_details_identity_validation",
        provider: "google_places",
        providerPlaceId,
      };
      const searchedPlaceMatch = {
        provider: "google_places",
        providerPlaceId,
        providerIdSource: "id_only_search_unpersisted",
      };
      attemptedPlaceIds.add(providerPlaceId);
      const candidate = await fetchAndValidateDetails({
        placesClient,
        runId,
        location,
        placeMatch: searchedPlaceMatch,
        source: "id_only_search",
        evidence,
      });
      if (candidate.error) providerErrors.push(candidate.error);
      if (candidate.identityValidated) {
        placeMatch = searchedPlaceMatch;
        selectedDetails = candidate;
      }
    }
  }

  if (!placeMatch || !selectedDetails) {
    const retryableError = providerErrors.find((error) => !isNotFoundError(error));
    if (retryableError) throw retryableError;
    return completedResult({
      taskId,
      runId,
      location,
      outcome: evidence.details_attempts.length > 0
        ? "provider_identity_mismatch"
        : "provider_place_not_found",
      evidence,
      placeMatchWrite,
    });
  }

  const { details, detailsData } = selectedDetails;
  const normalizedReviews = normalizeGoogleReviews(detailsData.reviews);
  const persistence = await persistReviewPayload({
    taskId,
    runId,
    locationId,
    provider: placeMatch.provider,
    providerPlaceId: placeMatch.providerPlaceId,
    detailsData,
    reviews: normalizedReviews,
    externalCallId: details?.externalCallId ?? null,
  }, { withTransaction, setActor, recordWrite });

  if (persistence.skipped) {
    return skippedResult({
      taskId,
      runId,
      locationId,
      reason: persistence.reason,
      location,
      evidence,
      placeMatchWrite,
      persistence,
    });
  }
  if (placeMatchWrite.reason === "pending_details_identity_validation") {
    placeMatchWrite = {
      attempted: true,
      written: true,
      reason: null,
      provider: "google_places",
      providerPlaceId: placeMatch.providerPlaceId,
      identityValidated: true,
    };
  }
  return completedResult({
    taskId,
    runId,
    location,
    outcome: persistence.servingReviewsInserted > 0 ? "reviews_stored" : "no_new_reviews",
    evidence,
    placeMatchWrite,
    persistence,
  });
}

export async function persistReviewPayload(
  {
    taskId,
    runId,
    locationId,
    provider,
    providerPlaceId,
    detailsData,
    reviews,
    externalCallId = null,
  },
  {
    withTransaction = defaultWithTransaction,
    setActor = setMutationActor,
    recordWrite = defaultRecordWrite,
  } = {},
) {
  const normalizedTaskId = positiveIntegerString(taskId, "taskId");
  const normalizedRunId = positiveIntegerString(runId, "runId");
  const normalizedLocationId = positiveInteger(locationId, "locationId");
  const normalizedProvider = GOOGLE_PROVIDER_NAMES.includes(text(provider).toLowerCase())
    ? text(provider).toLowerCase()
    : "google_places";
  const normalizedPlaceId = nonemptyString(providerPlaceId, "providerPlaceId");
  if (!Array.isArray(reviews)) throw new TypeError("reviews must be an array.");
  const actorLabel = `reviews_fetch_run_${normalizedRunId}`;

  return withTransaction(async (tx) => {
    // Each location is locked explicitly below. Raw source ids come from a
    // dedicated sequence and source URLs are unique, so READ COMMITTED retains
    // the ledger recheck without avoidable cross-location serialization.
    await tx.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [`reviews_fetch:location:${normalizedLocationId}`],
    );
    const stateResult = await tx.query(REVIEWS_FETCH_RECHECK_SQL, [normalizedLocationId]);
    const state = normalizeRecheck(rowsFrom(stateResult)[0]);
    const reason = eligibilityReason(state);
    if (reason) return { skipped: true, reason };

    const guarded = await recordWrite({
      entity: { entity_type: "location", entity_id: normalizedLocationId },
      field: "reviews",
      verification: "agent_verified",
      actor: actorLabel,
      tx,
      mutate: async (guardedTx) => {
    const sourceResult = await guardedTx.query(
      "SELECT id FROM fountain.sources WHERE slug = $1",
      [REVIEWS_FETCH_SOURCE_SLUG],
    );
    const sourceId = positiveInteger(
      rowsFrom(sourceResult)[0]?.id,
      `${REVIEWS_FETCH_SOURCE_SLUG} source id; apply the source migration first`,
    );
    await setActor(guardedTx, { actorId: REVIEWS_FETCH_ACTOR_ID, actorLabel });
    const timestampResult = await guardedTx.query("SELECT transaction_timestamp() AS fetched_at");
    const fetchedAt = rowsFrom(timestampResult)[0]?.fetched_at;
    if (!fetchedAt) throw new Error("reviews_fetch transaction timestamp is unavailable.");
    const fetchedAtIso = new Date(fetchedAt).toISOString();
    const displayName = text(detailsData?.displayName?.text ?? detailsData?.displayName);
    const rating = nullableRating(detailsData?.rating);
    const reviewCount = nullableNonnegativeInteger(detailsData?.userRatingCount);
    await guardedTx.query(UPSERT_PLACE_DETAILS_SQL, [
      normalizedLocationId,
      normalizedProvider,
      normalizedPlaceId,
      displayName || null,
      rating,
      reviewCount,
      fetchedAtIso,
      JSON.stringify(detailsData || {}),
    ]);

    const sourceUrl = googleMapsPlaceUrl(normalizedPlaceId);
    const listingResult = await ensureRawSourceListing(guardedTx, {
      sourceUrl,
      placeId: normalizedPlaceId,
      displayName,
      detailsData,
      fetchedAtIso,
    });
    const sourceListingId = positiveInteger(
      listingResult.sourceListingId,
      "source listing id",
    );
    await ensureSourceRecord(guardedTx, {
      sourceId,
      sourceListingId,
      sourceUrl,
      placeId: normalizedPlaceId,
      locationId: normalizedLocationId,
    });

    const rawRows = reviews.map((review) => ({
      review_ordinal: review.reviewOrdinal,
      reviewer: review.reviewer,
      rating: review.rating == null ? null : String(review.rating),
      review_date: review.reviewDate,
      body: review.body,
      raw_json: JSON.stringify(review.raw),
    }));
    await guardedTx.query(UPSERT_RAW_REVIEWS_SQL, [
      REVIEWS_FETCH_SOURCE_SLUG,
      sourceListingId,
      JSON.stringify(rawRows),
      fetchedAtIso,
    ]);

    const servingRows = reviews.map((review) => ({
      review_ordinal: review.reviewOrdinal,
      reviewer: review.reviewer,
      rating: review.rating,
      review_date: review.reviewDate,
      body: review.body,
      provider_review_id: review.providerReviewId,
      raw_payload: {
        source_slug: REVIEWS_FETCH_SOURCE_SLUG,
        source_listing_id: sourceListingId,
        review_ordinal: review.reviewOrdinal,
        provider_review_id: review.providerReviewId,
        google_review_name: review.providerReviewId,
        google_maps_uri: review.googleMapsUri,
        external_call_id: externalCallId,
        run_id: normalizedRunId,
        task_id: normalizedTaskId,
        expires_at: new Date(Date.parse(fetchedAtIso) + 30 * 24 * 60 * 60 * 1_000).toISOString(),
        raw: review.raw,
      },
    }));
    const servingResult = await guardedTx.query(INSERT_SERVING_REVIEWS_SQL, [
      JSON.stringify(servingRows),
      normalizedLocationId,
      sourceId,
      normalizedPlaceId,
      fetchedAtIso,
    ]);
    const insertedIds = integerArray(rowsFrom(servingResult)[0]?.inserted_ids);
    if (insertedIds.length > 0) {
      const eventResult = await guardedTx.query(`
        UPDATE fountain.entity_change_events event
        SET reason = 'reviews_fetch:google_places',
            metadata = event.metadata || jsonb_build_object(
              'run_id', $1::bigint,
              'task_id', $2::bigint,
              'campaign', 'reviews_fetch',
              'provider', 'google',
              'provider_place_id', $3::text,
              'source_slug', $4::text,
              'source_listing_id', $5::integer,
              'verification', 'unverified'
            )
        WHERE event.entity_type = 'reviews'
          AND event.entity_id = ANY($6::integer[])
          AND event.action = 'insert'
          AND event.actor_id = $7::uuid
          AND event.created_at >= $8::timestamptz
          AND NOT (event.metadata ? 'run_id')
      `, [
        normalizedRunId,
        normalizedTaskId,
        normalizedPlaceId,
        REVIEWS_FETCH_SOURCE_SLUG,
        sourceListingId,
        insertedIds,
        REVIEWS_FETCH_ACTOR_ID,
        fetchedAtIso,
      ]);
      assertCount("review provenance events", eventResult, insertedIds.length);
    }
    await guardedTx.query(`
      UPDATE fountain_raw.source_databases source_database
      SET listing_count = (
            SELECT count(*) FROM fountain_raw.source_listings listing
            WHERE listing.source_slug = source_database.source_slug
          ),
          review_count = (
            SELECT count(*) FROM fountain_raw.source_reviews review
            WHERE review.source_slug = source_database.source_slug
          ),
          last_synced_at = $2::timestamptz,
          sync_status = 'complete',
          updated_at = now()
      WHERE source_database.source_slug = $1
    `, [REVIEWS_FETCH_SOURCE_SLUG, fetchedAtIso]);
    return {
      skipped: false,
      sourceSlug: REVIEWS_FETCH_SOURCE_SLUG,
      sourceId,
      sourceListingId,
      rawReviewsUpserted: rawRows.length,
      servingReviewsInserted: insertedIds.length,
      servingReviewIds: insertedIds,
      placeMatchUpdated: true,
      fetchedAt: fetchedAtIso,
    };
      },
    });
    if (!guarded?.written) {
      return {
        skipped: true,
        reason: `reviews_field_${guarded?.reason || "ledger_refused"}`,
      };
    }
    return guarded.result;
  });
}

async function ensureRawSourceListing(tx, {
  sourceUrl,
  placeId,
  displayName,
  detailsData,
  fetchedAtIso,
}) {
  const upserted = await tx.query(`
    INSERT INTO fountain_raw.source_listings (
      source_slug, source_listing_id, source_url, name, extracted_at, payload, synced_at
    )
    VALUES (
      $1,
      nextval('fountain_raw.google_places_reviews_listing_id_seq'),
      $2,
      $3,
      $4,
      $5::jsonb,
      $6::timestamptz
    )
    ON CONFLICT (source_slug, source_url) DO UPDATE
    SET name = EXCLUDED.name,
        extracted_at = EXCLUDED.extracted_at,
        payload = EXCLUDED.payload,
        synced_at = EXCLUDED.synced_at
    RETURNING source_listing_id
  `, [
    REVIEWS_FETCH_SOURCE_SLUG,
    sourceUrl,
    displayName || null,
    fetchedAtIso,
    JSON.stringify({ provider: "google_places", provider_place_id: placeId, details: detailsData }),
    fetchedAtIso,
  ]);
  assertCount("Google reviews raw source listing", upserted, 1);
  return {
    sourceListingId: positiveInteger(
      rowsFrom(upserted)[0]?.source_listing_id,
      "Google reviews source listing id",
    ),
  };
}

async function ensureSourceRecord(tx, {
  sourceId,
  sourceListingId,
  sourceUrl,
  placeId,
  locationId,
}) {
  const inserted = await tx.query(`
    INSERT INTO fountain.source_records (
      id, source_id, entity_type, entity_id, source_listing_id, source_url, raw_ref
    )
    SELECT
      nextval(pg_get_serial_sequence('fountain.source_records', 'id'))::integer,
      $1,
      'location',
      $2,
      $3,
      $4,
      $5
    WHERE NOT EXISTS (
      SELECT 1
      FROM fountain.source_records existing
      WHERE existing.source_id = $1
        AND existing.entity_type = 'location'
        AND existing.entity_id = $2
        AND existing.source_listing_id = $3
    )
  `, [sourceId, locationId, sourceListingId, sourceUrl, placeId]);
  if (![0, 1].includes(number(inserted.rowCount))) {
    throw new Error(`Google reviews source-record insert returned ${inserted.rowCount} rows.`);
  }
}

export function normalizeGoogleReviews(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const reviews = [];
  for (const raw of value) {
    const reviewer = text(raw?.authorAttribution?.displayName);
    const body = text(raw?.text?.text ?? raw?.originalText?.text);
    const rating = nullableRating(raw?.rating);
    const reviewDate = reviewDateFrom(raw?.publishTime);
    const providerReviewId = text(raw?.name);
    const key = providerReviewId
      ? `id:${providerReviewId}`
      : `content:${reviewer.toLowerCase()}\0${body.toLowerCase()}\0${rating ?? ""}\0${reviewDate || ""}`;
    if (seen.has(key) || (!reviewer && !body && rating == null)) continue;
    seen.add(key);
    reviews.push({
      reviewOrdinal: reviews.length + 1,
      reviewer: reviewer || null,
      rating,
      reviewDate,
      body: body || null,
      providerReviewId: providerReviewId || null,
      googleMapsUri: text(raw?.googleMapsUri) || null,
      raw: object(raw),
    });
  }
  return reviews;
}

export function validateReviewsPlaceIdentity(location, details) {
  const displayName = text(details?.displayName?.text ?? details?.displayName);
  const expectedNames = [location?.name, location?.organizationName]
    .map(text)
    .filter(Boolean);
  if (!displayName || expectedNames.length === 0) return false;
  const actual = normalizeIdentityText(displayName);
  const nameMatches = expectedNames.some((expectedName) => {
    const expected = normalizeIdentityText(expectedName);
    if (expected === actual) return true;
    const tokens = meaningfulNameTokens(expected);
    return tokens.length > 0 && tokens.some((token) => containsToken(actual, token));
  });
  if (!nameMatches) return false;

  const expectedAddress = normalizeIdentityText(location?.address);
  const expectedLocality = normalizeIdentityText(location?.locality);
  const expectedPostalCode = normalizeIdentityText(location?.postalCode);
  if (!expectedAddress && !expectedLocality && !expectedPostalCode) return true;

  const actualAddress = normalizeIdentityText(details?.formattedAddress);
  if (!actualAddress) return false;
  if (expectedPostalCode && containsToken(actualAddress, expectedPostalCode)) return true;
  if (expectedLocality && containsToken(actualAddress, expectedLocality)) return true;

  const addressTokens = expectedAddress.match(/[a-z0-9]{2,}/gu) || [];
  const matchedTokens = addressTokens.filter((token) => containsToken(actualAddress, token));
  return matchedTokens.length >= Math.min(2, addressTokens.length);
}

export function projectedReviewsFetchCost({
  detailsCalls,
  remainingMonthlyFreeCalls = 0,
} = {}) {
  const calls = nonnegativeInteger(detailsCalls, "detailsCalls");
  const free = nonnegativeInteger(remainingMonthlyFreeCalls, "remainingMonthlyFreeCalls");
  const billableCalls = Math.max(0, calls - free);
  return {
    detailsCalls: calls,
    remainingMonthlyFreeCalls: free,
    billableCalls,
    unitCostUsd: REVIEWS_FETCH_DETAILS_COST_USD,
    projectedCostUsd: billableCalls * REVIEWS_FETCH_DETAILS_COST_USD,
    formula: "max(0, details_calls - remaining_monthly_free_calls) * 0.025",
  };
}

function completedResult({
  taskId,
  runId,
  location,
  outcome,
  evidence,
  placeMatchWrite,
  persistence = null,
}) {
  return {
    schema_version: REVIEWS_FETCH_SCHEMA_VERSION,
    outcome,
    task_id: taskId,
    run_id: runId,
    location_id: location.id,
    initial_review_count: location.reviewCount,
    evidence,
    place_match_write: placeMatchWrite,
    source_write: persistence
      ? {
          source_slug: persistence.sourceSlug,
          source_listing_id: persistence.sourceListingId,
          raw_reviews_upserted: persistence.rawReviewsUpserted,
        }
      : { source_slug: REVIEWS_FETCH_SOURCE_SLUG, raw_reviews_upserted: 0 },
    serving_write: {
      attempted: Boolean(persistence),
      written: Number(persistence?.servingReviewsInserted || 0) > 0,
      reviews_inserted: Number(persistence?.servingReviewsInserted || 0),
      review_ids: persistence?.servingReviewIds || [],
      dedupe_count: persistence
        ? Math.max(0, Number(persistence.rawReviewsUpserted || 0)
          - Number(persistence.servingReviewsInserted || 0))
        : 0,
      provenance_events_stamped: Number(persistence?.servingReviewsInserted || 0),
    },
  };
}

function skippedResult({
  taskId,
  runId,
  locationId,
  reason,
  location = null,
  evidence = null,
  placeMatchWrite = null,
  persistence = null,
}) {
  return {
    schema_version: REVIEWS_FETCH_SCHEMA_VERSION,
    outcome: "skipped",
    task_id: taskId,
    run_id: runId,
    location_id: locationId,
    skip_reason: reason,
    initial_review_count: location?.reviewCount ?? null,
    evidence,
    place_match_write: placeMatchWrite,
    source_write: persistence,
    serving_write: {
      attempted: false,
      written: false,
      reviews_inserted: 0,
      review_ids: [],
      dedupe_count: 0,
      provenance_events_stamped: 0,
    },
  };
}

function pricingEvidence() {
  return {
    search_sku: "Places API Text Search Essentials (IDs Only)",
    search_field_mask: SEARCH_FIELD_MASK,
    search_unit_cost_usd: REVIEWS_FETCH_ID_SEARCH_COST_USD,
    details_sku: REVIEWS_FETCH_DETAILS_SKU,
    details_sku_id: REVIEWS_FETCH_DETAILS_SKU_ID,
    details_field_mask: DETAILS_FIELD_MASK,
    details_unit_cost_usd: REVIEWS_FETCH_DETAILS_COST_USD,
    pricing_url: REVIEWS_FETCH_PRICING_URL,
    field_sku_url: REVIEWS_FETCH_FIELD_SKU_URL,
  };
}

export function distinctStoredGooglePlaceMatches(matches = []) {
  if (!Array.isArray(matches)) {
    throw new TypeError("externalPlaceMatches must be an array.");
  }
  const candidates = matches
    .map((match, index) => {
      if (!match || typeof match !== "object" || Array.isArray(match)) return null;
      const provider = text(match.provider).toLowerCase();
      const priority = GOOGLE_PROVIDER_NAMES.indexOf(provider);
      const providerPlaceId = text(
        match.provider_place_id ?? match.providerPlaceId ?? match.place_id ?? match.placeId,
      );
      if (priority < 0 || !providerPlaceId) return null;
      return {
        provider,
        providerPlaceId,
        providerIdSource: "stored_match",
        priority,
        index,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.priority - right.priority
      || left.providerPlaceId.localeCompare(right.providerPlaceId, "en-US")
      || left.index - right.index
    ));
  const seenPlaceIds = new Set();
  return candidates.filter((candidate) => {
    if (seenPlaceIds.has(candidate.providerPlaceId)) return false;
    seenPlaceIds.add(candidate.providerPlaceId);
    return true;
  });
}

async function fetchAndValidateDetails({
  placesClient,
  runId,
  location,
  placeMatch,
  source,
  evidence,
}) {
  let details;
  try {
    details = await placesClient.getDetails({
      runId,
      taskType: "reviews_fetch",
      entityId: location.id,
      placeId: placeMatch.providerPlaceId,
      costEstimateUsd: REVIEWS_FETCH_DETAILS_COST_USD,
      maxAttempts: 4,
    });
  } catch (error) {
    const attempt = {
      operation: "place_details",
      source,
      outcome: isNotFoundError(error) ? "not_found" : "error",
      provider: placeMatch.provider,
      provider_place_id: placeMatch.providerPlaceId,
      returned_provider_place_id: null,
      external_call_id: error?.externalCallId ?? null,
      field_mask: DETAILS_FIELD_MASK,
      sku: REVIEWS_FETCH_DETAILS_SKU,
      sku_id: REVIEWS_FETCH_DETAILS_SKU_ID,
      cost_estimate_usd: 0,
      returned_reviews: 0,
      identity_validated: false,
      http_status: Number.isInteger(Number(error?.status)) ? Number(error.status) : null,
      attempts: Number.isInteger(Number(error?.attempts)) ? Number(error.attempts) : null,
      error: errorMessage(error),
    };
    evidence.details_attempts.push(attempt);
    evidence.details = attempt;
    return {
      details: null,
      detailsData: null,
      identityValidated: false,
      error,
    };
  }

  const detailsData = object(details?.data);
  const returnedPlaceId = text(detailsData.id);
  const exactPlaceId = returnedPlaceId === placeMatch.providerPlaceId;
  const identityValidated = exactPlaceId
    && validateReviewsPlaceIdentity(location, detailsData);
  const attempt = {
    operation: "place_details",
    source,
    outcome: identityValidated
      ? "ok"
      : exactPlaceId
        ? "identity_mismatch"
        : "provider_place_id_mismatch",
    provider: placeMatch.provider,
    provider_place_id: placeMatch.providerPlaceId,
    returned_provider_place_id: returnedPlaceId || null,
    external_call_id: details?.externalCallId ?? null,
    field_mask: details?.fieldMask || DETAILS_FIELD_MASK,
    sku: REVIEWS_FETCH_DETAILS_SKU,
    sku_id: REVIEWS_FETCH_DETAILS_SKU_ID,
    cost_estimate_usd: number(
      details?.costEstimateUsd ?? REVIEWS_FETCH_DETAILS_COST_USD,
    ),
    returned_reviews: Array.isArray(detailsData.reviews) ? detailsData.reviews.length : 0,
    identity_validated: identityValidated,
  };
  evidence.details_attempts.push(attempt);
  evidence.details = attempt;
  return {
    details,
    detailsData,
    identityValidated,
    error: null,
  };
}

function isNotFoundError(error) {
  return Number(error?.status) === 404;
}

function errorMessage(error) {
  return text(error instanceof Error ? error.message : error).slice(0, 1_000);
}

function normalizeLocation(row) {
  return {
    id: positiveInteger(row.id, "location.id"),
    name: text(row.name || row.organization_name),
    organizationName: text(row.organization_name),
    address: text(row.address),
    locality: text(row.locality),
    region: text(row.region),
    postalCode: text(row.postal_code),
    countryCode: text(row.country_code).toUpperCase(),
    status: text(row.status),
    deletedAt: row.deleted_at ?? null,
    reviewCount: nonnegativeInteger(row.review_count, "location review count"),
    nonSuppressed: row.non_suppressed === true,
    externalPlaceMatches: objectArray(row.external_place_matches),
  };
}

function normalizeRecheck(row) {
  if (!row) {
    return {
      id: null,
      status: "missing",
      deletedAt: null,
      reviewCount: 0,
      nonSuppressed: false,
      externalPlaceMatches: [],
    };
  }
  return {
    id: positiveInteger(row.id, "recheck location.id"),
    status: text(row.status),
    deletedAt: row.deleted_at ?? null,
    reviewCount: nonnegativeInteger(row.review_count, "recheck review count"),
    nonSuppressed: row.non_suppressed === true,
    externalPlaceMatches: objectArray(row.external_place_matches),
  };
}

function eligibilityReason(location) {
  if (!location?.id) return "location_missing";
  if (location.status !== "active" || location.deletedAt) return "location_not_active";
  if (!location.nonSuppressed) return "location_suppressed";
  if (location.reviewCount >= REVIEWS_FETCH_MINIMUM_STORED_REVIEWS) {
    return "review_threshold_already_met";
  }
  return null;
}

function placesTextQuery(location) {
  return [
    location.name,
    location.address,
    location.locality,
    location.region,
    location.postalCode,
    location.countryCode,
  ].filter(Boolean).join(", ");
}

function googleMapsPlaceUrl(placeId) {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

function reviewDateFrom(value) {
  const raw = text(value);
  if (!raw) return null;
  const milliseconds = Date.parse(raw);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString().slice(0, 10) : null;
}

function normalizeIdentityText(value) {
  return text(value).normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function meaningfulNameTokens(value) {
  return normalizeIdentityText(value)
    .match(/[a-z0-9]{3,}/gu)
    ?.filter((token) => !NAME_STOP_WORDS.has(token)) || [];
}

function containsToken(haystack, token) {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegex(token)}(?:$|[^a-z0-9])`, "u").test(haystack);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function nullableRating(value) {
  if (value == null || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 && normalized <= 5
    ? normalized
    : null;
}

function nullableNonnegativeInteger(value) {
  if (value == null || value === "") return null;
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : null;
}

function objectArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
  if (typeof value === "string") {
    try {
      return objectArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function integerArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => positiveInteger(item, "review id"));
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .trim();
}

function nonemptyString(value, label) {
  const normalized = text(value);
  if (!normalized) throw new TypeError(`${label} must be non-empty.`);
  return normalized;
}

function positiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return normalized;
}

function nonnegativeInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a nonnegative integer.`);
  }
  return normalized;
}

function positiveIntegerString(value, label) {
  const normalized = String(value ?? "");
  if (!/^[1-9]\d*$/u.test(normalized)) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return normalized;
}

function number(value) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function assertCount(label, result, expected) {
  const actual = Number(result?.rowCount ?? rowsFrom(result).length);
  if (actual !== expected) throw new Error(`${label} affected ${actual} rows; expected ${expected}.`);
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or pg-compatible client.");
}

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}
