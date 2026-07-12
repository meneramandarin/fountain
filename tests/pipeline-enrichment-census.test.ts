import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import * as census from "../pipeline/lib/enrichment-census.mjs";

const {
  assertEnrichmentEnqueuePlan,
  assertImageClassifyEnqueuePlan,
  assertMenuPricesEnqueuePlan,
  assertPostContactEnqueuePlan,
  buildEnrichmentCensus,
  buildEnrichmentEnqueuePlan,
  buildImageClassifyEnqueuePlan,
  buildMenuPricesEnqueuePlan,
  buildPostContactEnqueuePlan,
  compareEnrichmentCensuses,
  ENRICHMENT_CENSUS_SQL,
  ENRICHMENT_ENQUEUE_SQL,
  ENRICHMENT_IMAGE_CLASSIFY_ENQUEUE_SQL,
  ENRICHMENT_MENU_PRICES_ACTIVE_TASKS_SQL,
  ENRICHMENT_MENU_PRICES_ENQUEUE_SQL,
  ENRICHMENT_POST_CONTACT_CANDIDATES_SQL,
  ENRICHMENT_POST_CONTACT_ENQUEUE_SQL,
  enqueueEnrichmentPlan,
  enqueueImageClassifyPlan,
  enqueueMenuPricesPlan,
  enqueuePostContactPlan,
  loadMenuPricesEnqueuePlan,
  loadPostContactEnqueuePlan,
  renderEnrichmentCensusReport,
  renderImageClassifyEnqueueReport,
  renderMenuPricesEnqueueReport,
  renderPostContactEnqueueReport,
} = census;

const ALL_TASKS = [
  "contact_fill",
  "geocode",
  "image_harvest",
  "menu_extract",
  "reviews_fetch",
];

describe("enrichment coverage census", () => {
  test("defines the serving-safe population and exact coverage joins", () => {
    expect(ENRICHMENT_CENSUS_SQL).toContain("location.status = 'active'");
    expect(ENRICHMENT_CENSUS_SQL).toContain("location.deleted_at IS NULL");
    expect(ENRICHMENT_CENSUS_SQL).toContain("fountain_raw.suppressed_source_listings");
    expect(ENRICHMENT_CENSUS_SQL).toContain("fountain.images");
    expect(ENRICHMENT_CENSUS_SQL).toContain("fountain.offerings");
    expect(ENRICHMENT_CENSUS_SQL).toContain("fountain.reviews");
    expect(ENRICHMENT_CENSUS_SQL).toContain("fountain.external_place_matches");
    expect(ENRICHMENT_CENSUS_SQL).toContain("image.image_kind IS NULL");
    expect(ENRICHMENT_ENQUEUE_SQL).toContain("NOT has_email OR NOT has_address");
    expect(ENRICHMENT_ENQUEUE_SQL).toContain("review_count < 3");
  });

  test("computes deterministic overall, country, source, and actionable gap cohorts", () => {
    const first = buildEnrichmentCensus(fixtureRows(), {
      label: "before",
      capturedAt: "2026-07-12T06:00:00Z",
    });
    const reordered = buildEnrichmentCensus([...fixtureRows()].reverse().map((row) => ({
      ...row,
      source_slugs: [...row.source_slugs].reverse(),
    })), {
      label: "before",
      capturedAt: "2026-07-12T06:00:00Z",
    });

    expect(first.digest).toBe(reordered.digest);
    expect(first.population).toEqual({ eligible: 4, virtual: 1, nonVirtual: 3 });
    expect(first.coverage.overall.fields.website).toMatchObject({
      covered: 2,
      missing: 2,
      coveragePct: 50,
    });
    expect(first.coverage.byCountry.map((group: { key: string; total: number }) => [group.key, group.total]))
      .toEqual([["CA", 1], ["GB", 1], ["US", 2]]);
    expect(first.coverage.bySource.map((group: { key: string; total: number }) => [group.key, group.total]))
      .toEqual([["_unattributed", 1], ["alpha", 2], ["beta", 2]]);

    expect(first.gaps.contact_fill).toMatchObject({
      ids: [2, 3, 4],
      actionableIds: [2, 3, 4],
      blockedIds: [],
    });
    expect(first.gaps.geocode).toMatchObject({ ids: [2], actionableIds: [2] });
    expect(first.gaps.image_harvest).toMatchObject({ ids: [2], actionableIds: [2] });
    expect(first.gaps.menu_extract).toMatchObject({
      ids: [2, 3],
      actionableIds: [2],
      blockedIds: [3],
    });
    expect(first.gaps.reviews_fetch).toMatchObject({
      ids: [2, 3, 4],
      actionableIds: [2, 3, 4],
      blockedIds: [],
    });
    expect(first.imageClassification).toEqual({
      ids: [1],
      locationCount: 1,
      imageCount: 1,
      digest: expect.any(String),
    });
  });

  test("compares exact before/after coverage and renders deterministically", () => {
    const before = buildEnrichmentCensus(fixtureRows(), {
      label: "before",
      capturedAt: "2026-07-12T06:00:00Z",
    });
    const afterRows = fixtureRows().map((row) => row.id === 2 ? {
      ...row,
      has_phone: true,
      has_email: true,
      has_geocode: true,
      has_latitude: true,
      has_longitude: true,
      image_count: 1,
      menu_count: 2,
      priced_count: 1,
      review_count: 3,
    } : row);
    const after = buildEnrichmentCensus(afterRows, {
      label: "after",
      capturedAt: "2026-07-12T07:00:00Z",
    });
    const comparison = compareEnrichmentCensuses(before, after);

    expect(comparison.coverage.overall.fields.phone).toMatchObject({
      beforeCovered: 2,
      afterCovered: 3,
      coveredDelta: 1,
      percentagePointDelta: 25,
    });
    expect(comparison.gaps.contact_fill.resolvedIds).toEqual([2]);
    expect(comparison.gaps.image_harvest.resolvedIds).toEqual([2]);
    expect(comparison.gaps.reviews_fetch.resolvedIds).toEqual([2]);

    const plan = buildEnrichmentEnqueuePlan(after);
    const rendered = renderEnrichmentCensusReport({ before, after, plan });
    expect(renderEnrichmentCensusReport({ before, after, plan })).toBe(rendered);
    expect(rendered).toContain("# Enrichment Coverage Census");
    expect(rendered).toContain("Source groups are multi-attribution");
    expect(rendered).toContain("| contact_fill | 3 | 2 | 2 | 0 |");
    expect(rendered).toContain("## Coverage by country");
    expect(rendered).toContain("## Coverage by source");
    expect(rendered).toContain("Apply remains guarded");

    const frozenBeforeShape = structuredClone(before);
    delete frozenBeforeShape.menuPrices;
    for (const location of frozenBeforeShape.locations) {
      delete location.pricedCount;
      delete location.menuMissingAttempted;
      delete location.pricesMissingAttempted;
    }
    expect(() => buildEnrichmentEnqueuePlan(frozenBeforeShape)).not.toThrow();
    expect(() => compareEnrichmentCensuses(frozenBeforeShape, after)).not.toThrow();
    expect(() => renderEnrichmentCensusReport({ before: frozenBeforeShape, after })).not.toThrow();
  });

  test("enforces exact snapshot candidates and explicit task-handler readiness", () => {
    const snapshot = buildEnrichmentCensus(fixtureRows(), { label: "live" });
    const plan = buildEnrichmentEnqueuePlan(snapshot, {
      priority: 80,
      maxAttempts: 2,
    });

    expect(() => buildEnrichmentEnqueuePlan(snapshot, { campaign: "retry_wave" }))
      .toThrow("retries require an explicit non-census enqueue");

    expect(plan.expectedInsertions).toBe(9);
    expect(plan.tasks.find((task: { taskType: string }) => task.taskType === "menu_extract"))
      .toMatchObject({ gapCount: 2, candidateCount: 1, blockedCount: 1 });
    expect(() => assertEnrichmentEnqueuePlan(plan, snapshot))
      .toThrow("Task handler contact_fill is not implemented");
    expect(assertEnrichmentEnqueuePlan(plan, snapshot, { implementedTaskTypes: ALL_TASKS }))
      .toBe(true);

    const drifted = buildEnrichmentCensus(fixtureRows().map((row) => row.id === 2
      ? { ...row, has_phone: true }
      : row), { label: "live" });
    expect(() => assertEnrichmentEnqueuePlan(plan, drifted, { implementedTaskTypes: ALL_TASKS }))
      .toThrow("Enrichment census drifted");
  });

  test("previews without SQL and atomically reconciles an applied plan", async () => {
    const snapshot = buildEnrichmentCensus(fixtureRows(), { label: "live" });
    const plan = buildEnrichmentEnqueuePlan(snapshot);
    const query = vi.fn(async (text: string, params: unknown[] = []) => {
      void text;
      void params;
      return { rows: [{
        ready: true,
        expected_count: plan.expectedInsertions,
        live_count: plan.expectedInsertions,
        drift_count: 0,
        active_conflict_count: 0,
        inserted_count: plan.expectedInsertions,
        inserted_by_task: Object.fromEntries(plan.tasks.map((task: { taskType: string; candidateCount: number }) => [
          task.taskType,
          task.candidateCount,
        ])),
      }] };
    });

    const preview = await enqueueEnrichmentPlan({
      plan,
      liveSnapshot: snapshot,
      runId: "81",
      implementedTaskTypes: ALL_TASKS,
      apply: false,
    }, { query });
    expect(preview).toMatchObject({ apply: false, expectedCount: 9, insertedCount: 0 });
    expect(query).not.toHaveBeenCalled();

    const applied = await enqueueEnrichmentPlan({
      plan,
      liveSnapshot: snapshot,
      runId: "81",
      implementedTaskTypes: ALL_TASKS,
      apply: true,
    }, { query });
    expect(applied).toMatchObject({ apply: true, ready: true, insertedCount: 9 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toBe(ENRICHMENT_ENQUEUE_SQL);
    const firstCall = query.mock.calls[0]!;
    const queryParams = firstCall[1] || [];
    const expectedRows = JSON.parse(String(queryParams[0]));
    expect(expectedRows).toHaveLength(9);
    expect(expectedRows[0]).toMatchObject({
      task_type: "contact_fill",
      entity_id: 2,
      payload: {
        campaign: "enrichment_census_v1",
        census_snapshot: snapshot.digest,
      },
    });
    expect(ENRICHMENT_ENQUEUE_SQL).toContain("pg_advisory_xact_lock");
    expect(ENRICHMENT_ENQUEUE_SQL).toContain("EXCEPT");
    expect(ENRICHMENT_ENQUEUE_SQL).toContain("active_conflicts");
    expect(ENRICHMENT_ENQUEUE_SQL).not.toContain("DO NOTHING");
  });

  test("fails closed when the atomic enqueue reconciliation drifts", async () => {
    const snapshot = buildEnrichmentCensus(fixtureRows(), { label: "live" });
    const plan = buildEnrichmentEnqueuePlan(snapshot);
    const query = vi.fn(async (text: string, params: unknown[] = []) => {
      void text;
      void params;
      return { rows: [{
        ready: false,
        expected_count: plan.expectedInsertions,
        live_count: plan.expectedInsertions + 1,
        drift_count: 1,
        active_conflict_count: 0,
        inserted_count: 0,
        inserted_by_task: {},
      }] };
    });

    await expect(enqueueEnrichmentPlan({
      plan,
      liveSnapshot: snapshot,
      runId: 82,
      implementedTaskTypes: ALL_TASKS,
      apply: true,
    }, { query })).rejects.toThrow("Enrichment enqueue reconciliation failed");
  });

  test("plans and atomically enqueues image classification only after harvest", async () => {
    const snapshot = buildEnrichmentCensus(fixtureRows(), { label: "post_harvest" });
    const plan = buildImageClassifyEnqueuePlan(snapshot);

    expect(plan).toMatchObject({
      taskType: "image_classify",
      expectedInsertions: 1,
      unclassifiedImageCount: 1,
      tasks: [{ taskType: "image_classify", candidateIds: [1] }],
    });
    expect(() => assertImageClassifyEnqueuePlan(plan, snapshot))
      .toThrow("Task handler image_classify is not implemented");
    expect(assertImageClassifyEnqueuePlan(plan, snapshot, {
      implementedTaskTypes: ["image_classify"],
    })).toBe(true);

    const query = vi.fn(async (...args: [string, unknown[]]) => {
      void args;
      return { rows: [{
        ready: true,
        expected_count: 1,
        live_count: 1,
        drift_count: 0,
        active_conflict_count: 0,
        inserted_count: 1,
      }] };
    });
    const preview = await enqueueImageClassifyPlan({
      plan,
      liveSnapshot: snapshot,
      runId: 90,
      implementedTaskTypes: ["image_classify"],
      apply: false,
    }, { query });
    expect(preview).toMatchObject({ apply: false, expectedCount: 1, insertedCount: 0 });
    expect(query).not.toHaveBeenCalled();

    const applied = await enqueueImageClassifyPlan({
      plan,
      liveSnapshot: snapshot,
      runId: 90,
      implementedTaskTypes: ["image_classify"],
      apply: true,
    }, { query });
    expect(applied).toMatchObject({ apply: true, insertedCount: 1 });
    expect(query.mock.calls[0]?.[0]).toBe(ENRICHMENT_IMAGE_CLASSIFY_ENQUEUE_SQL);
    const expectedRows = JSON.parse(String(query.mock.calls[0]?.[1]?.[0]));
    expect(expectedRows).toEqual([expect.objectContaining({
      task_type: "image_classify",
      entity_id: 1,
      payload: expect.objectContaining({ campaign: "enrichment_image_classify_v1" }),
    })]);
    expect(ENRICHMENT_IMAGE_CLASSIFY_ENQUEUE_SQL).toContain("unclassified_image_count > 0");
    expect(ENRICHMENT_IMAGE_CLASSIFY_ENQUEUE_SQL).toContain("active_conflicts");
    expect(renderImageClassifyEnqueueReport({ snapshot, plan, enqueue: applied }))
      .toContain("1 inserted");
  });

  test("refreshes only newly unlocked post-contact downstream candidates", async () => {
    const snapshot = buildEnrichmentCensus(fixtureRows().map((item) => item.id === 4
      ? { ...item, has_website: true, menu_count: 1, priced_count: 0 }
      : item), { label: "post_contact" });
    const candidateRows = [
      { task_type: "menu_extract", entity_id: 2 },
      { task_type: "menu_extract", entity_id: 4, gap_kind: "prices_missing" },
      { task_type: "geocode", entity_id: 2 },
      { task_type: "image_harvest", entity_id: 2 },
    ];
    const plan = buildPostContactEnqueuePlan(snapshot, candidateRows);
    expect(plan).toMatchObject({
      stage: "post_contact_refresh",
      campaign: "enrichment_census_v1",
      expectedInsertions: 4,
      tasks: [
        { taskType: "geocode", candidateIds: [2] },
        { taskType: "image_harvest", candidateIds: [2] },
        {
          taskType: "menu_extract",
          candidateIds: [2, 4],
          candidateGapKinds: { 2: "menu_missing", 4: "prices_missing" },
        },
      ],
    });
    expect(assertPostContactEnqueuePlan(plan, snapshot, {
      implementedTaskTypes: ["geocode", "image_harvest", "menu_extract"],
    })).toBe(true);

    const loadQuery = vi.fn(async () => ({ rows: candidateRows }));
    const loaded = await loadPostContactEnqueuePlan(snapshot, {}, { query: loadQuery });
    expect(loaded.expectedInsertions).toBe(4);
    expect(loadQuery).toHaveBeenCalledWith(
      ENRICHMENT_POST_CONTACT_CANDIDATES_SQL,
      ["enrichment_census_v1"],
    );

    const enqueueQuery = vi.fn(async (...args: [string, unknown[]]) => {
      void args;
      return { rows: [{
        ready: true,
        expected_count: 4,
        live_count: 4,
        drift_count: 0,
        active_conflict_count: 0,
        inserted_count: 4,
        inserted_by_task: { geocode: 1, image_harvest: 1, menu_extract: 2 },
      }] };
    });
    const applied = await enqueuePostContactPlan({
      plan,
      liveSnapshot: snapshot,
      runId: 91,
      implementedTaskTypes: ["geocode", "image_harvest", "menu_extract"],
      apply: true,
    }, { query: enqueueQuery });
    expect(applied).toMatchObject({
      insertedCount: 4,
      insertedByTask: { geocode: 1, image_harvest: 1, menu_extract: 2 },
    });
    expect(enqueueQuery.mock.calls[0]?.[0]).toBe(ENRICHMENT_POST_CONTACT_ENQUEUE_SQL);
    expect(enqueueQuery.mock.calls[0]?.[1]?.[3]).toBe("enrichment_census_v1");
    expect(ENRICHMENT_POST_CONTACT_CANDIDATES_SQL).toContain("queue.payload->>'campaign' = $1");
    expect(ENRICHMENT_POST_CONTACT_CANDIDATES_SQL).toContain("priced_count = 0");
    expect(ENRICHMENT_POST_CONTACT_CANDIDATES_SQL).toContain("prompt_version");
    expect(ENRICHMENT_POST_CONTACT_ENQUEUE_SQL).toContain("queue.payload->>'campaign' = $4");
    expect(renderPostContactEnqueueReport({ snapshot, plan, enqueue: applied }))
      .toContain("4 inserted");
  });

  test("adopts existing menu gaps and atomically inserts only zero-priced menu gaps", async () => {
    const rows = [
      row({
        id: 101,
        has_website: true,
        menu_count: 0,
        priced_count: 0,
        menu_missing_attempted: true,
      }),
      row({
        id: 102,
        has_website: true,
        menu_count: 3,
        priced_count: 0,
      }),
      row({
        id: 103,
        has_website: true,
        menu_count: 3,
        priced_count: 1,
      }),
      row({
        id: 104,
        has_website: false,
        menu_count: 2,
        priced_count: 0,
      }),
      row({
        id: 105,
        has_website: false,
        menu_count: 0,
        priced_count: 0,
      }),
    ];
    const snapshot = buildEnrichmentCensus(rows, { label: "menu_prices" });
    expect(snapshot.menuPrices).toMatchObject({
      menuMissing: {
        ids: [101, 105],
        actionableIds: [101],
        attemptedUnresolvedIds: [101],
        enqueueableIds: [],
      },
      pricesMissing: {
        ids: [102, 104],
        actionableIds: [102],
        attemptedUnresolvedIds: [],
        enqueueableIds: [102],
      },
    });
    const plan = buildMenuPricesEnqueuePlan(snapshot, [{
      task_id: "7001",
      entity_id: 101,
      status: "pending",
      run_id: "69",
      payload: {
        campaign: "enrichment_census_v1",
        census_snapshot: "original-run-69-snapshot",
        candidate_digest: "original-run-69-digest",
      },
    }]);
    expect(plan).toMatchObject({
      stage: "menu_prices_refresh",
      campaign: "enrichment_census_v1",
      promptVersion: "menu-extract-v1",
      expectedAdoptions: 1,
      expectedInsertions: 1,
      expectedTasks: 2,
      menuMissing: { candidateIds: [101], adoptions: [{ taskId: "7001", runId: "69" }] },
      pricesMissing: { candidateIds: [102] },
    });
    expect(assertMenuPricesEnqueuePlan(plan, snapshot, {
      implementedTaskTypes: ["menu_extract"],
    })).toBe(true);
    const loadQuery = vi.fn(async () => ({ rows: [{
      task_id: "7001",
      entity_id: 101,
      status: "pending",
      run_id: "69",
      payload: { campaign: "enrichment_census_v1" },
    }] }));
    expect((await loadMenuPricesEnqueuePlan(snapshot, {}, { query: loadQuery })).expectedTasks)
      .toBe(2);
    expect(loadQuery).toHaveBeenCalledWith(ENRICHMENT_MENU_PRICES_ACTIVE_TASKS_SQL);

    const query = vi.fn(async (...args: [string, unknown[]]) => {
      void args;
      return { rows: [{
        ready: true,
        expected_adoption_count: 1,
        expected_insertion_count: 1,
        live_menu_count: 1,
        live_prices_count: 1,
        invalid_expected_count: 0,
        overlap_count: 0,
        adoption_drift_count: 0,
        insertion_drift_count: 0,
        adoption_queue_drift_count: 0,
        adoption_payload_conflict_count: 0,
        active_conflict_count: 0,
        price_history_conflict_count: 0,
        adopted_count: 1,
        inserted_count: 1,
      }] };
    });
    const applied = await enqueueMenuPricesPlan({
      plan,
      liveSnapshot: snapshot,
      runId: "92",
      implementedTaskTypes: ["menu_extract"],
      apply: true,
    }, { query });
    expect(applied).toMatchObject({ adoptedCount: 1, insertedCount: 1 });
    expect(query.mock.calls[0]?.[0]).toBe(ENRICHMENT_MENU_PRICES_ENQUEUE_SQL);
    const expectedRows = JSON.parse(String(query.mock.calls[0]?.[1]?.[0]));
    expect(expectedRows).toEqual([
      expect.objectContaining({ operation: "adopt", task_id: "7001", entity_id: 101 }),
      expect.objectContaining({
        operation: "insert",
        entity_id: 102,
        payload: expect.objectContaining({
          campaign: "enrichment_census_v1",
          prompt_version: "menu-extract-v1",
          gap_kind: "prices_missing",
          census_snapshot: snapshot.digest,
          candidate_digest: plan.pricesMissing.candidateDigest,
        }),
      }),
    ]);
    expect(ENRICHMENT_MENU_PRICES_ACTIVE_TASKS_SQL).toContain("status IN ('pending', 'claimed')");
    expect(ENRICHMENT_MENU_PRICES_ENQUEUE_SQL).toContain("pg_advisory_xact_lock");
    expect(ENRICHMENT_MENU_PRICES_ENQUEUE_SQL).toContain("menu_count > 0");
    expect(ENRICHMENT_MENU_PRICES_ENQUEUE_SQL).toContain("priced_count = 0");
    expect(ENRICHMENT_MENU_PRICES_ENQUEUE_SQL).toContain("adoption_queue_drift");
    expect(ENRICHMENT_MENU_PRICES_ENQUEUE_SQL).toContain("price_history_conflicts");
    expect(ENRICHMENT_MENU_PRICES_ENQUEUE_SQL).toContain("queue.payload || jsonb_build_object");
    expect(ENRICHMENT_MENU_PRICES_ENQUEUE_SQL).not.toContain("SET run_id =");
    const report = renderMenuPricesEnqueueReport({ snapshot, plan, enqueue: applied });
    expect(report).toContain("Partially priced locations are intentionally excluded");
    expect(report).toContain("1 adopted; 1 inserted");

    const canonical = buildEnrichmentEnqueuePlan(snapshot);
    expect(canonical.tasks.find((task: { taskType: string }) => task.taskType === "menu_extract"))
      .toMatchObject({
        candidateIds: [102],
        candidateGapKinds: { 102: "prices_missing" },
        attemptedUnresolvedCount: 1,
      });
    const attemptedSnapshot = buildEnrichmentCensus(rows.map((item) => item.id === 102
      ? { ...item, prices_missing_attempted: true }
      : item), { label: "future_before" });
    expect(attemptedSnapshot.menuPrices.pricesMissing).toMatchObject({
      actionableIds: [102],
      attemptedUnresolvedIds: [102],
      enqueueableIds: [],
    });
    expect(buildEnrichmentEnqueuePlan(attemptedSnapshot).tasks
      .find((task: { taskType: string }) => task.taskType === "menu_extract"))
      .toMatchObject({ candidateIds: [], attemptedUnresolvedCount: 2 });

    const transitionedMenuGap = buildEnrichmentCensus(rows.map((item) => item.id === 101
      ? { ...item, menu_count: 2, priced_count: 0 }
      : item), { label: "post_menu_attempt" });
    expect(transitionedMenuGap.menuPrices.pricesMissing).toMatchObject({
      actionableIds: [101, 102],
      attemptedUnresolvedIds: [101],
      enqueueableIds: [102],
    });
  });

  test("fails closed on adoption, overlap, and insertion reconciliation conflicts", async () => {
    const snapshot = buildEnrichmentCensus([
      row({
        id: 201,
        has_website: true,
        menu_missing_attempted: true,
      }),
      row({ id: 202, has_website: true, menu_count: 2, priced_count: 0 }),
    ], { label: "menu_prices" });
    expect(() => buildMenuPricesEnqueuePlan(snapshot, []))
      .toThrow("Expected exactly one active menu_missing task");
    expect(() => buildMenuPricesEnqueuePlan(snapshot, [{
      task_id: "1",
      entity_id: 201,
      status: "claimed",
      run_id: "69",
      payload: { campaign: "enrichment_census_v1" },
    }])).toThrow("is claimed, not pending");

    const plan = buildMenuPricesEnqueuePlan(snapshot, [{
      task_id: "1",
      entity_id: 201,
      status: "pending",
      run_id: "69",
      payload: { campaign: "enrichment_census_v1" },
    }]);
    const query = vi.fn(async () => ({ rows: [{
      ready: false,
      expected_adoption_count: 1,
      expected_insertion_count: 1,
      live_menu_count: 1,
      live_prices_count: 1,
      invalid_expected_count: 0,
      overlap_count: 0,
      adoption_drift_count: 0,
      insertion_drift_count: 0,
      adoption_queue_drift_count: 0,
      adoption_payload_conflict_count: 0,
      active_conflict_count: 1,
      price_history_conflict_count: 0,
      adopted_count: 0,
      inserted_count: 0,
    }] }));
    await expect(enqueueMenuPricesPlan({
      plan,
      liveSnapshot: snapshot,
      runId: 93,
      implementedTaskTypes: ["menu_extract"],
      apply: true,
    }, { query })).rejects.toThrow("Menu-prices enqueue reconciliation failed");
  });
});

function fixtureRows() {
  return [
    row({
      id: 1,
      country_code: "US",
      source_slugs: ["alpha"],
      has_website: true,
      has_phone: true,
      has_email: true,
      has_address: true,
      has_locality: true,
      has_region: true,
      has_postal_code: true,
      has_country_code: true,
      has_latitude: true,
      has_longitude: true,
      has_geocode: true,
      image_count: 2,
      unclassified_image_count: 1,
      menu_count: 3,
      priced_count: 1,
      review_count: 4,
      place_match_count: 1,
    }),
    row({
      id: 2,
      country_code: "US",
      source_slugs: ["beta", "alpha"],
      has_website: true,
      has_phone: false,
      has_address: true,
      has_locality: true,
      has_country_code: true,
      place_match_count: 1,
    }),
    row({
      id: 3,
      country_code: "CA",
      is_virtual: true,
      source_slugs: [],
      has_country_code: true,
    }),
    row({
      id: 4,
      country_code: "GB",
      source_slugs: ["beta"],
      has_phone: true,
      has_locality: true,
      has_country_code: true,
      has_latitude: true,
      has_longitude: true,
      has_geocode: true,
      image_count: 1,
      menu_count: 1,
      priced_count: 1,
      review_count: 2,
    }),
  ];
}

function row(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: "Example Clinic",
    country_code: "US",
    is_virtual: false,
    source_slugs: [],
    has_website: false,
    has_phone: false,
    has_email: false,
    has_address: false,
    has_locality: false,
    has_region: false,
    has_postal_code: false,
    has_country_code: false,
    has_latitude: false,
    has_longitude: false,
    has_geocode: false,
    image_count: 0,
    unclassified_image_count: 0,
    menu_count: 0,
    priced_count: 0,
    review_count: 0,
    place_match_count: 0,
    ...overrides,
  };
}
