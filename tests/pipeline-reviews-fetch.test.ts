import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline intentionally uses native .mjs modules.
import * as reviewsFetch from "../pipeline/tasks/reviews_fetch.mjs";

const {
  handleReviewsFetch,
  normalizeGoogleReviews,
  projectedReviewsFetchCost,
  REVIEWS_FETCH_DETAILS_COST_USD,
  REVIEWS_FETCH_DETAILS_SKU,
  REVIEWS_FETCH_DETAILS_SKU_ID,
  REVIEWS_FETCH_FIELD_SKU_URL,
  REVIEWS_FETCH_LOAD_SQL,
  REVIEWS_FETCH_PRICING_URL,
  REVIEWS_FETCH_RECHECK_SQL,
  validateReviewsPlaceIdentity,
} = reviewsFetch;

describe("reviews_fetch queue handler", () => {
  test("uses a stored provider ID directly and stores raw plus deduped serving reviews", async () => {
    const state = locationRow({
      id: 101,
      name: "Alpha Longevity",
      review_count: 1,
      external_place_matches: [{ provider: "google", provider_place_id: "alpha-place" }],
    });
    const harness = persistenceHarness(state, { insertedIds: [901, 902] });
    const placesClient = {
      searchText: vi.fn(),
      getDetails: vi.fn(async (request: Record<string, unknown>) => {
        expect(request).toMatchObject({
          runId: "80",
          taskType: "reviews_fetch",
          entityId: 101,
          placeId: "alpha-place",
          costEstimateUsd: 0.025,
          maxAttempts: 4,
        });
        return {
          data: detailsPayload("Alpha Longevity", 2, "alpha-place"),
          externalCallId: 7001,
          fieldMask: "id,displayName,formattedAddress,rating,userRatingCount,reviews",
          costEstimateUsd: 0.025,
        };
      }),
    };

    const result = await handleReviewsFetch({
      task: { id: "501", entity_type: "location", entity_id: 101 },
      run: { id: "80", budget_usd: 50 },
    }, {
      query: vi.fn(async () => ({ rows: [state] })),
      placesClient,
      withTransaction: harness.withTransaction,
      setActor: harness.setActor,
      recordWrite: harness.recordWrite,
    });

    expect(placesClient.searchText).not.toHaveBeenCalled();
    expect(placesClient.getDetails).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome: "reviews_stored",
      initial_review_count: 1,
      place_match_write: { attempted: false, reason: "stored_provider_id" },
      source_write: {
        source_slug: "google_places_reviews",
        source_listing_id: 1,
        raw_reviews_upserted: 2,
      },
      serving_write: {
        attempted: true,
        written: true,
        reviews_inserted: 2,
        review_ids: [901, 902],
        provenance_events_stamped: 2,
      },
    });
    expect(result.evidence.details).toMatchObject({
      sku: "Places API Place Details Enterprise + Atmosphere",
      sku_id: "EB23-5ECC-F753",
      cost_estimate_usd: 0.025,
      identity_validated: true,
    });
    expect(harness.recordWrite).toHaveBeenCalledWith(expect.objectContaining({
      entity: { entity_type: "location", entity_id: 101 },
      field: "reviews",
      verification: "agent_verified",
      actor: "reviews_fetch_run_80",
      tx: harness.tx,
    }));
    expect(harness.setActor).toHaveBeenCalledWith(expect.anything(), {
      actorId: "b5c71897-83d0-4c30-a7a3-202607120014",
      actorLabel: "reviews_fetch_run_80",
    });
    const servingCall = harness.calls.find((call) => call.sql.includes("INSERT INTO fountain.reviews"));
    expect(servingCall?.sql).toContain("provider_review_id");
    expect(servingCall?.sql).toContain("lower(btrim(COALESCE(existing.author");
    const servingRows = JSON.parse(String(servingCall?.params[0]));
    expect(servingRows[0].raw_payload).toMatchObject({
      source_slug: "google_places_reviews",
      source_listing_id: 1,
      external_call_id: 7001,
      run_id: "80",
      task_id: "501",
    });
    const rawListingCall = harness.calls.find((call) => (
      call.sql.includes("INSERT INTO fountain_raw.source_listings")
    ));
    const isolationCall = harness.calls.find((call) => (
      call.sql.includes("SET TRANSACTION ISOLATION LEVEL")
    ));
    expect(isolationCall?.sql).toContain("READ COMMITTED");
    expect(rawListingCall?.sql).toContain("$7::timestamptz");
    expect(rawListingCall?.params).toHaveLength(7);
    expect(rawListingCall?.params[4]).toBe(rawListingCall?.params[6]);
  });

  test("tries the next stored Google alias when the preferred ID mismatches", async () => {
    const state = locationRow({
      id: 107,
      name: "Foxtrot Longevity",
      external_place_matches: [
        { provider: "google", provider_place_id: "foxtrot-current" },
        { provider: "google_places", provider_place_id: "foxtrot-stale" },
      ],
    });
    const harness = persistenceHarness(state, { insertedIds: [907] });
    const attemptedIds: string[] = [];
    const placesClient = {
      searchText: vi.fn(),
      getDetails: vi.fn(async ({ placeId }: { placeId: string }) => {
        attemptedIds.push(placeId);
        return {
          data: placeId === "foxtrot-stale"
            ? detailsPayload("Unrelated Hardware", 1, placeId)
            : detailsPayload("Foxtrot Longevity", 1, placeId),
          externalCallId: placeId === "foxtrot-stale" ? 7201 : 7202,
          costEstimateUsd: 0.025,
        };
      }),
    };

    const result = await handleReviewsFetch({
      task: { id: "507", entity_type: "location", entity_id: 107 },
      run: { id: "86" },
    }, {
      query: vi.fn(async () => ({ rows: [state] })),
      placesClient,
      withTransaction: harness.withTransaction,
      setActor: harness.setActor,
      recordWrite: harness.recordWrite,
    });

    expect(attemptedIds).toEqual(["foxtrot-stale", "foxtrot-current"]);
    expect(placesClient.searchText).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      outcome: "reviews_stored",
      place_match_write: {
        reason: "stored_provider_id",
        provider: "google",
        providerPlaceId: "foxtrot-current",
      },
    });
    expect(result.evidence.details_attempts).toMatchObject([
      { source: "stored_provider_id", outcome: "identity_mismatch" },
      { source: "stored_provider_id", outcome: "ok", identity_validated: true },
    ]);
  });

  test("searches once after all stored aliases mismatch and persists only the validated result", async () => {
    const state = locationRow({
      id: 108,
      name: "Gamma Preventive",
      external_place_matches: [
        { provider: "google", provider_place_id: "gamma-stale-two" },
        { provider: "google_places", provider_place_id: "gamma-stale-one" },
      ],
    });
    const harness = persistenceHarness(state, { insertedIds: [908] });
    const order: string[] = [];
    const placesClient = {
      searchText: vi.fn(async () => {
        order.push("search");
        return {
          data: { places: [{ id: "gamma-current" }] },
          externalCallId: 7303,
          fieldMask: "places.id",
          costEstimateUsd: 0,
        };
      }),
      getDetails: vi.fn(async ({ placeId }: { placeId: string }) => {
        order.push(`details:${placeId}`);
        return {
          data: placeId === "gamma-current"
            ? detailsPayload("Gamma Preventive", 1, placeId)
            : detailsPayload("Unrelated Hardware", 1, placeId),
          externalCallId: 7300 + order.length,
          costEstimateUsd: 0.025,
        };
      }),
    };

    const result = await handleReviewsFetch({
      task: { id: "508", entity_type: "location", entity_id: 108 },
      run: { id: "87" },
    }, {
      query: vi.fn(async () => ({ rows: [state] })),
      placesClient,
      withTransaction: harness.withTransaction,
      setActor: harness.setActor,
      recordWrite: harness.recordWrite,
    });

    expect(order).toEqual([
      "details:gamma-stale-one",
      "details:gamma-stale-two",
      "search",
      "details:gamma-current",
    ]);
    expect(placesClient.searchText).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome: "reviews_stored",
      place_match_write: {
        attempted: true,
        written: true,
        providerPlaceId: "gamma-current",
      },
    });
    expect(result.evidence.details_attempts).toHaveLength(3);
    expect(state.external_place_matches).toEqual([
      { provider: "google_places", provider_place_id: "gamma-current" },
    ]);
  });

  test("deduplicates a shared stored place ID before trying the next distinct alias", async () => {
    const state = locationRow({
      id: 109,
      name: "Hotel Diagnostics",
      external_place_matches: [
        { provider: "google", provider_place_id: "shared-stale" },
        { provider: "places", provider_place_id: "hotel-current" },
        { provider: "google_places", provider_place_id: "shared-stale" },
      ],
    });
    const harness = persistenceHarness(state, { insertedIds: [909] });
    const placesClient = {
      searchText: vi.fn(),
      getDetails: vi.fn(async ({ placeId }: { placeId: string }) => ({
        data: placeId === "hotel-current"
          ? detailsPayload("Hotel Diagnostics", 1, placeId)
          : detailsPayload("Unrelated Hardware", 1, placeId),
        costEstimateUsd: 0.025,
      })),
    };

    const result = await handleReviewsFetch({
      task: { id: "509", entity_type: "location", entity_id: 109 },
      run: { id: "88" },
    }, {
      query: vi.fn(async () => ({ rows: [state] })),
      placesClient,
      withTransaction: harness.withTransaction,
      setActor: harness.setActor,
      recordWrite: harness.recordWrite,
    });

    expect(placesClient.getDetails.mock.calls.map(([request]) => request.placeId)).toEqual([
      "shared-stale",
      "hotel-current",
    ]);
    expect(placesClient.searchText).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      outcome: "reviews_stored",
      place_match_write: { provider: "places", providerPlaceId: "hotel-current" },
    });
  });

  test("keeps every failed candidate as evidence and performs no writes when none validates", async () => {
    const originalMatches = [
      { provider: "google_places", provider_place_id: "india-missing" },
      { provider: "google", provider_place_id: "india-stale" },
    ];
    const state = locationRow({
      id: 110,
      name: "India Longevity",
      external_place_matches: structuredClone(originalMatches),
    });
    const withTransaction = vi.fn();
    const placesClient = {
      searchText: vi.fn(async () => ({
        data: { places: [{ id: "india-search-mismatch" }] },
        externalCallId: 7503,
        fieldMask: "places.id",
        costEstimateUsd: 0,
      })),
      getDetails: vi.fn(async ({ placeId }: { placeId: string }) => {
        if (placeId === "india-missing") {
          throw Object.assign(new Error("Place was not found"), { status: 404, attempts: 1 });
        }
        return {
          data: detailsPayload("Unrelated Hardware", 1, placeId),
          externalCallId: placeId === "india-stale" ? 7502 : 7504,
          costEstimateUsd: 0.025,
        };
      }),
    };

    const result = await handleReviewsFetch({
      task: { id: "510", entity_type: "location", entity_id: 110 },
      run: { id: "89" },
    }, {
      query: vi.fn(async () => ({ rows: [state] })),
      placesClient,
      withTransaction,
    });

    expect(placesClient.searchText).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      outcome: "provider_identity_mismatch",
      serving_write: { attempted: false, written: false, reviews_inserted: 0 },
    });
    expect(result.evidence.details_attempts).toMatchObject([
      { provider_place_id: "india-missing", outcome: "not_found", http_status: 404 },
      { provider_place_id: "india-stale", outcome: "identity_mismatch" },
      { provider_place_id: "india-search-mismatch", outcome: "identity_mismatch" },
    ]);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(state.external_place_matches).toEqual(originalMatches);
  });

  test("does ID-only search first, persists one external match safely, then fetches reviews", async () => {
    const order: string[] = [];
    const state = locationRow({ id: 102, name: "Beacon Health", review_count: 0 });
    const harness = persistenceHarness(state, { insertedIds: [903] });
    const placesClient = {
      searchText: vi.fn(async (request: Record<string, unknown>) => {
        order.push("search");
        expect(request).toMatchObject({
          taskType: "reviews_fetch",
          entityId: 102,
          maxResultCount: 1,
        });
        return {
          data: { places: [{ id: "beacon-place" }] },
          externalCallId: 7101,
          fieldMask: "places.id",
          costEstimateUsd: 0,
        };
      }),
      getDetails: vi.fn(async ({ placeId }: { placeId: string }) => {
        order.push("details");
        expect(placeId).toBe("beacon-place");
        return {
          data: detailsPayload("Beacon Health", 1, "beacon-place"),
          externalCallId: 7102,
          costEstimateUsd: 0.025,
        };
      }),
    };

    const result = await handleReviewsFetch({
      task: { id: "502", entity_type: "location", entity_id: 102 },
      run: { id: "81" },
    }, {
      query: vi.fn(async () => ({ rows: [state] })),
      placesClient,
      withTransaction: harness.withTransaction,
      setActor: harness.setActor,
      recordWrite: harness.recordWrite,
    });

    expect(order).toEqual(["search", "details"]);
    expect(result.place_match_write).toMatchObject({
      attempted: true,
      written: true,
      provider: "google_places",
      providerPlaceId: "beacon-place",
    });
    expect(result.evidence.discovery[0]).toMatchObject({
      operation: "search_text",
      provider_place_id: "beacon-place",
      field_mask: "places.id",
      cost_estimate_usd: 0,
    });
    const unvalidatedMatchInserts = harness.calls.filter((call) => (
      call.sql.includes("INSERT INTO fountain.external_place_matches")
      && call.sql.includes("'id_only_search'")
    ));
    expect(unvalidatedMatchInserts).toHaveLength(0);
    const validatedMatchInserts = harness.calls.filter((call) => (
      call.sql.includes("INSERT INTO fountain.external_place_matches")
      && call.sql.includes("'details_verified'")
    ));
    expect(validatedMatchInserts).toHaveLength(1);
    expect(state.external_place_matches).toEqual([
      { provider: "google_places", provider_place_id: "beacon-place" },
    ]);
  });

  test("skips inactive, deleted, suppressed, or already-covered locations before calls", async () => {
    const cases = [
      [locationRow({ status: "hidden" }), "location_not_active"],
      [locationRow({ deleted_at: "2026-07-01T00:00:00Z" }), "location_not_active"],
      [locationRow({ non_suppressed: false }), "location_suppressed"],
      [locationRow({ review_count: 3 }), "review_threshold_already_met"],
    ] as const;
    for (const [state, reason] of cases) {
      const placesClient = { searchText: vi.fn(), getDetails: vi.fn() };
      const withTransaction = vi.fn();
      const result = await handleReviewsFetch({
        task: { id: "503", entity_type: "location", entity_id: state.id },
        run: { id: "82" },
      }, {
        query: vi.fn(async () => ({ rows: [state] })),
        placesClient,
        withTransaction,
      });
      expect(result).toMatchObject({ outcome: "skipped", skip_reason: reason });
      expect(placesClient.searchText).not.toHaveBeenCalled();
      expect(placesClient.getDetails).not.toHaveBeenCalled();
      expect(withTransaction).not.toHaveBeenCalled();
    }
  });

  test("rechecks coverage in the place-match transaction and refuses a concurrent third review", async () => {
    const state = locationRow({ id: 103, name: "Concurrent Clinic" });
    const placesClient = {
      searchText: vi.fn(async () => ({ data: { places: [{ id: "concurrent-place" }] } })),
      getDetails: vi.fn(async () => ({
        data: detailsPayload("Concurrent Clinic", 1, "concurrent-place"),
        costEstimateUsd: 0.025,
      })),
    };
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SET TRANSACTION ISOLATION LEVEL")) return { rows: [], rowCount: 0 };
        if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
        if (sql === REVIEWS_FETCH_RECHECK_SQL) {
          return { rows: [{
            id: 103,
            status: "active",
            deleted_at: null,
            review_count: 3,
            non_suppressed: true,
            external_place_matches: [],
          }] };
        }
        throw new Error(`Unexpected transaction SQL: ${sql}`);
      }),
    };
    const withTransaction = vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => (
      operation(tx)
    ));

    const result = await handleReviewsFetch({
      task: { id: "504", entity_type: "location", entity_id: 103 },
      run: { id: "83" },
    }, {
      query: vi.fn(async () => ({ rows: [state] })),
      placesClient,
      withTransaction,
      setActor: vi.fn(),
    });

    expect(result).toMatchObject({
      outcome: "skipped",
      skip_reason: "review_threshold_already_met",
      place_match_write: {
        written: false,
        providerPlaceId: "concurrent-place",
      },
    });
    expect(placesClient.getDetails).toHaveBeenCalledOnce();
  });

  test("rejects mismatched detail identity without raw or serving writes", async () => {
    const state = locationRow({
      id: 104,
      name: "Delta Longevity",
      external_place_matches: [{ provider: "google", provider_place_id: "stale-place" }],
    });
    const withTransaction = vi.fn();
    const result = await handleReviewsFetch({
      task: { id: "505", entity_type: "location", entity_id: 104 },
      run: { id: "84" },
    }, {
      query: vi.fn(async () => ({ rows: [state] })),
      placesClient: {
        searchText: vi.fn(),
        getDetails: vi.fn(async () => ({
          data: detailsPayload("Unrelated Hardware Store"),
          costEstimateUsd: 0.025,
        })),
      },
      withTransaction,
    });

    expect(result).toMatchObject({
      outcome: "provider_identity_mismatch",
      serving_write: { attempted: false, written: false },
    });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  test("never persists an ID-only search candidate whose Details identity mismatches", async () => {
    const state = locationRow({ id: 105, name: "Echo Longevity" });
    const withTransaction = vi.fn();
    const placesClient = {
      searchText: vi.fn(async () => ({
        data: { places: [{ id: "wrong-place" }] },
        fieldMask: "places.id",
        costEstimateUsd: 0,
      })),
      getDetails: vi.fn(async () => ({
        data: detailsPayload("Echo Longevity", 1, "wrong-place", {
          formattedAddress: "99 Other Road, Elsewhere, NY 10001, US",
        }),
        costEstimateUsd: 0.025,
      })),
    };

    const result = await handleReviewsFetch({
      task: { id: "506", entity_type: "location", entity_id: 105 },
      run: { id: "85" },
    }, {
      query: vi.fn(async () => ({ rows: [state] })),
      placesClient,
      withTransaction,
    });

    expect(result).toMatchObject({
      outcome: "provider_identity_mismatch",
      place_match_write: {
        attempted: false,
        written: false,
        reason: "pending_details_identity_validation",
        providerPlaceId: "wrong-place",
      },
      serving_write: { attempted: false, written: false },
    });
    expect(withTransaction).not.toHaveBeenCalled();
    expect(state.external_place_matches).toEqual([]);
  });
});

describe("review normalization, cost, and schema contracts", () => {
  test("normalizes dates and deduplicates provider IDs before persistence", () => {
    const payload = detailsPayload("Example Clinic").reviews;
    const reviews = normalizeGoogleReviews([payload[0], payload[0], payload[1]]);

    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({
      reviewOrdinal: 1,
      reviewer: "Ada One",
      rating: 5,
      reviewDate: "2026-07-01",
      providerReviewId: "places/example/reviews/one",
    });
    expect(reviews[1].reviewOrdinal).toBe(2);
  });

  test("uses the current Enterprise + Atmosphere unit price and free-cap formula", () => {
    expect(REVIEWS_FETCH_DETAILS_SKU).toBe(
      "Places API Place Details Enterprise + Atmosphere",
    );
    expect(REVIEWS_FETCH_DETAILS_SKU_ID).toBe("EB23-5ECC-F753");
    expect(REVIEWS_FETCH_DETAILS_COST_USD).toBe(0.025);
    expect(REVIEWS_FETCH_PRICING_URL).toContain("developers.google.com/maps/billing-and-pricing/pricing");
    expect(REVIEWS_FETCH_FIELD_SKU_URL).toContain("place-details");
    expect(projectedReviewsFetchCost({
      detailsCalls: 1_500,
      remainingMonthlyFreeCalls: 1_000,
    })).toEqual({
      detailsCalls: 1_500,
      remainingMonthlyFreeCalls: 1_000,
      billableCalls: 500,
      unitCostUsd: 0.025,
      projectedCostUsd: 12.5,
      formula: "max(0, details_calls - remaining_monthly_free_calls) * 0.025",
    });
  });

  test("encodes active/nondeleted/non-suppressed and source-review provenance guards", () => {
    expect(REVIEWS_FETCH_LOAD_SQL).toContain("review.status = 'active'");
    expect(REVIEWS_FETCH_LOAD_SQL).toContain("review.deleted_at IS NULL");
    expect(REVIEWS_FETCH_LOAD_SQL).toContain("fountain_raw.suppressed_source_listings");
    expect(REVIEWS_FETCH_RECHECK_SQL).toContain("FOR UPDATE OF location");
    expect(validateReviewsPlaceIdentity(
      { name: "AAI Rejuvenation", organizationName: "AAI Clinics" },
      { displayName: { text: "AAI Rejuvenation Clinic" } },
    )).toBe(true);
    expect(validateReviewsPlaceIdentity(
      {
        name: "AAI Rejuvenation",
        organizationName: "AAI Clinics",
        address: "9390 Main Street",
        locality: "Boston",
        postalCode: "02110",
      },
      {
        displayName: { text: "AAI Rejuvenation Clinic" },
        formattedAddress: "100 Other Street, Austin, TX 78701, US",
      },
    )).toBe(false);

    const migration = readFileSync(path.resolve(
      process.cwd(),
      "migrations/20260711_google_places_reviews_source.sql",
    ), "utf8");
    expect(migration).toContain("'google_places_reviews'");
    expect(migration).toContain("fountain_raw.source_databases");
    expect(migration).toContain("ON CONFLICT (source_slug) DO NOTHING");
  });
});

type Call = { sql: string; params: unknown[] };

function persistenceHarness(
  state: Record<string, unknown>,
  { insertedIds = [] as number[] } = {},
) {
  const calls: Call[] = [];
  const setActor = vi.fn(async () => undefined);
  const tx = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("SET TRANSACTION ISOLATION LEVEL")) return { rows: [], rowCount: 0 };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      if (sql === REVIEWS_FETCH_RECHECK_SQL) {
        return { rows: [{
          id: state.id,
          status: state.status,
          deleted_at: state.deleted_at,
          review_count: state.review_count,
          non_suppressed: state.non_suppressed,
          external_place_matches: state.external_place_matches,
        }] };
      }
      if (sql.includes("SELECT id FROM fountain.sources")) return { rows: [{ id: 267 }] };
      if (sql.includes("transaction_timestamp")) {
        return { rows: [{ fetched_at: "2026-07-11T20:00:00.000Z" }] };
      }
      if (sql.includes("'details_verified'")) {
        state.external_place_matches = [{
          provider: params[1],
          provider_place_id: params[2],
        }];
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM fountain_raw.source_listings") && sql.includes("source_url = $2")) {
        return { rows: [] };
      }
      if (sql.includes("max(source_listing_id)")) return { rows: [{ next_id: 1 }] };
      if (sql.includes("INSERT INTO fountain_raw.source_listings")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO fountain.source_records")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO fountain_raw.source_reviews")) return { rows: [], rowCount: 2 };
      if (sql.includes("INSERT INTO fountain.reviews")) {
        return { rows: [{ inserted_ids: insertedIds }] };
      }
      if (sql.includes("UPDATE fountain.entity_change_events")) {
        return { rows: [], rowCount: insertedIds.length };
      }
      if (sql.includes("UPDATE fountain_raw.source_databases")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected persistence SQL: ${sql}`);
    }),
  };
  const withTransaction = vi.fn(async (
    operation: (client: typeof tx) => Promise<unknown>,
  ) => operation(tx));
  const recordWrite = vi.fn(async (options: {
    mutate: (client: typeof tx) => Promise<unknown>;
  }) => ({ written: true, result: await options.mutate(tx) }));
  return { calls, recordWrite, setActor, tx, withTransaction };
}

function locationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Test Clinic",
    organization_name: null,
    address: "1 Main Street",
    locality: "Testville",
    region: "CA",
    postal_code: "90001",
    country_code: "US",
    status: "active",
    deleted_at: null,
    review_count: 0,
    non_suppressed: true,
    external_place_matches: [],
    ...overrides,
  };
}

function detailsPayload(
  displayName: string,
  count = 2,
  placeId = "example-place",
  { formattedAddress = "1 Main Street, Testville, CA 90001, US" } = {},
) {
  const reviews = [
    {
      name: "places/example/reviews/one",
      rating: 5,
      text: { text: "Excellent preventive care." },
      publishTime: "2026-07-01T10:30:00Z",
      authorAttribution: { displayName: "Ada One" },
      googleMapsUri: "https://maps.google.com/review/one",
    },
    {
      name: "places/example/reviews/two",
      rating: 4,
      text: { text: "Thoughtful team and clear testing." },
      publishTime: "2026-06-15T09:00:00Z",
      authorAttribution: { displayName: "Ben Two" },
      googleMapsUri: "https://maps.google.com/review/two",
    },
  ].slice(0, count);
  return {
    id: placeId,
    displayName: { text: displayName },
    formattedAddress,
    rating: 4.8,
    userRatingCount: 120,
    reviews,
  };
}
