import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline intentionally uses native .mjs modules.
import { buildEnrichmentCensus } from "../pipeline/lib/enrichment-census.mjs";
// @ts-expect-error The pipeline intentionally uses native .mjs modules.
import * as finalReport from "../pipeline/lib/enrichment-final-report.mjs";

const {
  assertEnrichmentFinalReconciliation,
  buildEnrichmentFinalReport,
  buildEnrichmentFinalReportData,
  ENRICHMENT_FINAL_REPORT_FILENAME,
  loadEnrichmentFinalReportData,
  normalizeFinalReportRunIds,
  renderEnrichmentFinalReport,
  summarizeFinalExternalCalls,
  summarizeFinalTaskOutcomes,
  writeEnrichmentFinalReport,
} = finalReport;

describe("final enrichment ledger report", () => {
  test("loads only selected runs and renders coverage, redemption, costs, tasks, and explicit reconciliation", async () => {
    const input = reportInput();
    const query = reportQuery();

    const data = await loadEnrichmentFinalReportData(input, { query });
    const markdown = renderEnrichmentFinalReport(data);

    expect(query).toHaveBeenCalledTimes(4);
    for (const [, params] of query.mock.calls) {
      if (Array.isArray(params) && params.length > 0) {
        expect(params[0]).toEqual(["57", "58", "60", "61", "62"]);
      }
    }
    expect(data.reconciliation.ok).toBe(true);
    expect(assertEnrichmentFinalReconciliation(data)).toBe(true);
    expect(data.external).toMatchObject({
      calls: 6,
      failedCalls: 0,
      llm: { calls: 2, byModel: [{ model: "google/gemini-3.5-flash", calls: 2 }] },
      places: {
        contact: { calls: 2 },
        reviews: { calls: 1 },
        geocode: { calls: 1 },
      },
      runPartition: { calls: 6, callsReconciled: true, costReconciled: true },
    });
    expect(data.tasks).toMatchObject({ total: 6, attempted: 4, written: 4, needsHuman: 1 });
    expect(markdown).toContain("# Fountain Pipeline Restructure — Final Enrichment Report");
    expect(markdown).toContain("**FINAL RECONCILIATION COMPLETE**");
    expect(markdown).toContain("| `website` | 1 | 33.33% | 3 | 100.00% | +2 | +66.67 |");
    expect(markdown).toContain("| Active needs_human_review | 1 |");
    expect(markdown).toContain("| 2 | Redeemed Health | `in_scope` | 0.93 | https://redeemed.example/ | 2 |");
    expect(markdown).toContain("| `google/gemini-3.5-flash` | 2 | 0 |");
    expect(markdown).toContain("| Contact / legitimacy discovery | 2 | 0 |");
    expect(markdown).toContain("| Reviews | 1 | 0 |");
    expect(markdown).toContain("### Spend by selected run/stage");
    expect(markdown).toContain("| 60 | `enrichment.contact_fill` | 1 | $0.0000 | $0.0200 |");
    expect(markdown).toContain("## Explicit ledger reconciliation");
    expect(markdown).toContain("| Active locations represented in search | 3 | 3 | OK |");
    expect(markdown).toContain("## Follow-ups");
  });

  test("convenience builder performs the same read-only load and render", async () => {
    const query = reportQuery();
    const markdown = await buildEnrichmentFinalReport(reportInput(), { query });

    expect(markdown).toContain("**FINAL RECONCILIATION COMPLETE**");
    expect(query).toHaveBeenCalledTimes(4);
  });

  test("writes the reconciled closeout to the fixed docs/runs filename", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fountain-enrichment-final-"));
    const outputDir = path.join(root, "docs", "runs");
    const data = buildEnrichmentFinalReportData({
      ...reportInput(),
      externalCalls: externalCallRows(),
      taskRows: taskRows(),
      state: servingState(),
      eventRows: eventRows(),
    });

    const reportPath = await writeEnrichmentFinalReport(data, { outputDir });

    expect(reportPath).toBe(path.join(outputDir, ENRICHMENT_FINAL_REPORT_FILENAME));
    await expect(readFile(reportPath, "utf8")).resolves.toBe(
      renderEnrichmentFinalReport(data),
    );
  });

  test("surfaces mismatches in Markdown and refuses a completion assertion", () => {
    const input = reportInput();
    const data = buildEnrichmentFinalReportData({
      ...input,
      runIds: normalizeFinalReportRunIds(input.runIds, {
        stage3: input.stage3,
        redemption: input.redemption,
      }),
      externalCalls: externalCallRows(),
      taskRows: taskRows(),
      state: { ...servingState(), search_location_rows: 2 },
      eventRows: eventRows(),
    });
    const markdown = renderEnrichmentFinalReport(data);

    expect(data.reconciliation.ok).toBe(false);
    expect(data.reconciliation.failures.map((check: { id: string }) => check.id)).toContain(
      "active_search_rows",
    );
    expect(() => assertEnrichmentFinalReconciliation(data)).toThrow(
      "active_search_rows=2/3",
    );
    expect(markdown).toContain("**FINAL RECONCILIATION ATTENTION REQUIRED**");
    expect(markdown).toContain("| Active locations represented in search | 3 | 2 | MISMATCH |");
    expect(markdown).toContain("Resolve ledger mismatches before closeout");
  });

  test("splits LLM models and Places use without losing calls or decimal costs", () => {
    const runs = normalizeFinalReportRunIds({
      contact_fill: 10,
      reviews_fetch: 11,
      geocode: 12,
    });
    const summary = summarizeFinalExternalCalls([
      externalCall({ run_id: "10", provider: "openrouter", model: "model/a", cost_estimate_usd: "0.01" }),
      externalCall({ run_id: "10", provider: "openrouter", model: "model/b", cost_estimate_usd: "0.02", status: "error" }),
      externalCall({ run_id: "10", provider: "google_places", model: null, cost_estimate_usd: "0.005" }),
      externalCall({ run_id: "11", provider: "google_places", model: null, cost_estimate_usd: "0.025" }),
      externalCall({ run_id: "12", provider: "google_places", model: null, cost_estimate_usd: "0.005" }),
      externalCall({ run_id: "12", provider: "blob", model: null, cost_estimate_usd: "0" }),
    ], runs);

    expect(summary).toMatchObject({
      calls: 6,
      failedCalls: 1,
      estimatedCostUsd: 0.065,
      llm: { calls: 2 },
      places: {
        contact: { calls: 1 },
        reviews: { calls: 1 },
        geocode: { calls: 1 },
      },
      other: { calls: 1 },
      partition: { calls: 6, callsReconciled: true, costReconciled: true },
      runPartition: { calls: 6, callsReconciled: true, costReconciled: true },
    });
    expect(summary.llm.byModel.map((row: { model: string }) => row.model)).toEqual([
      "model/a",
      "model/b",
    ]);
  });

  test("normalizes raw and aggregate task evidence into reconciled partitions", () => {
    const summary = summarizeFinalTaskOutcomes([
      {
        run_id: "1",
        task_type: "geocode",
        status: "done",
        result: { outcome: "geocoded", serving_write: { attempted: true, written: true } },
      },
      {
        run_id: "1",
        task_type: "geocode",
        status: "done",
        outcome: "needs_human_review",
        count: 2,
        attempted_count: 0,
        written_count: 0,
        needs_human_count: 2,
      },
    ]);

    expect(summary).toMatchObject({
      total: 3,
      attempted: 1,
      written: 1,
      needsHuman: 2,
      statuses: { done: 3 },
      partition: { statusesReconciled: true, outcomesReconciled: true },
    });
  });

  test("rejects unsafe or empty run selections before querying", async () => {
    expect(() => normalizeFinalReportRunIds({ report: "57/../../secrets" })).toThrow(
      "Invalid run ID",
    );
    const query = vi.fn();
    await expect(loadEnrichmentFinalReportData({
      before: reportInput().before,
      after: reportInput().after,
      runIds: {},
    }, { query })).rejects.toThrow("at least one positive run ID");
    expect(query).not.toHaveBeenCalled();
  });

  test("requires exactly one serving-state reconciliation row", async () => {
    const input = reportInput();
    const query = reportQuery({ stateRows: [] });

    await expect(loadEnrichmentFinalReportData(input, { query })).rejects.toThrow(
      "serving-state query expected one row",
    );
  });
});

function reportInput() {
  return {
    before: beforeCensus(),
    after: afterCensus(),
    stage3: stage3Summary(),
    redemption: redemptionSummary(),
    runIds: {
      enrichment: {
        contact_fill: 60,
        reviews_fetch: 61,
        geocode: 62,
      },
    },
    generatedAt: "2026-07-12T12:00:00.000Z",
  };
}

function beforeCensus() {
  return buildEnrichmentCensus([
    coverageRow({ id: 1, has_website: true }),
    coverageRow({ id: 2 }),
    coverageRow({ id: 3 }),
  ], { label: "before", capturedAt: "2026-07-12T01:00:00.000Z" });
}

function afterCensus() {
  return buildEnrichmentCensus([
    coverageRow({ id: 1, complete: true }),
    coverageRow({ id: 2, complete: true }),
    coverageRow({ id: 3, complete: true }),
  ], { label: "after", capturedAt: "2026-07-12T11:00:00.000Z" });
}

function coverageRow({
  id,
  complete = false,
  ...overrides
}: {
  id: number;
  complete?: boolean;
  [key: string]: unknown;
}) {
  return {
    id,
    name: `Location ${id}`,
    country_code: "US",
    is_virtual: false,
    source_slugs: ["fixture"],
    has_website: complete,
    has_phone: complete,
    has_email: complete,
    has_address: complete,
    has_locality: complete,
    has_region: complete,
    has_postal_code: complete,
    has_country_code: complete,
    has_latitude: complete,
    has_longitude: complete,
    has_geocode: complete,
    image_count: complete ? 1 : 0,
    menu_count: complete ? 1 : 0,
    review_count: complete ? 3 : 0,
    place_match_count: complete ? 1 : 0,
    ...overrides,
  };
}

function stage3Summary() {
  return {
    execution: {
      runId: "57",
      plan: {
        counts: {
          cohortRows: 3,
          keepRows: 1,
          suppressionRows: 1,
          humanReviewRows: 1,
        },
      },
    },
    suppression: {
      apply: true,
      applyRunId: "57",
      expectedSuppressionCount: 1,
      preflight: {
        sourceRecordFanout: 2,
        hardExcludedCandidateCount: 0,
      },
      verification: {
        hiddenCount: 1,
        runSuppressionLedgerRows: 2,
        suppressionLedgerAfter: 10,
        stampedEventCount: 1,
        remainingSearchRows: 0,
        activeLocationsAfter: 2,
        hiddenLocationsAfter: 1,
      },
    },
  };
}

function redemptionSummary() {
  const decision = {
    locationId: 2,
    name: "Redeemed Health",
    class: "in_scope",
    confidence: 0.93,
    action: "redeem",
    officialWebsite: "https://redeemed.example/",
  };
  return {
    cohort: { counts: { candidates: 1 } },
    pass: {
      runId: "58",
      counts: { redeem: 1, retainSuppressed: 0 },
      decisions: [decision],
    },
    apply: {
      apply: true,
      runId: "58",
      expectedRedemptionCount: 1,
      preflight: { ownedSuppressionCount: 2, suppressionLedgerBefore: 10 },
      verification: {
        activeCount: 1,
        searchIndexCount: 1,
        eventCount: 1,
        taskEvidenceCount: 1,
        statusLedgerCount: 1,
        suppressionLedgerAfter: 8,
      },
      applied: [{ ...decision, deletedSuppressionRows: 2 }],
    },
  };
}

function reportQuery({ stateRows = [servingState()] } = {}) {
  return vi.fn(async (sql: string, params: unknown[] = []) => {
    void params;
    if (sql.includes("FROM fountain_ops.external_calls external_call")) {
      return { rows: externalCallRows() };
    }
    if (sql.includes("FROM fountain_ops.task_queue task")) return { rows: taskRows() };
    if (sql.includes("WITH location_state AS MATERIALIZED")) return { rows: stateRows };
    if (sql.includes("FROM fountain.entity_change_events event")) return { rows: eventRows() };
    throw new Error(`Unexpected final-report query: ${sql}`);
  });
}

function externalCallRows() {
  return [
    externalCall({ run_id: "57", provider: "openrouter", model: "google/gemini-3.5-flash", cost_estimate_usd: "0.10" }),
    externalCall({ run_id: "58", provider: "openrouter", model: "google/gemini-3.5-flash", cost_estimate_usd: "0.05" }),
    externalCall({ run_id: "57", provider: "google_places", model: null, cost_estimate_usd: "0.02" }),
    externalCall({ run_id: "60", provider: "google_places", model: null, cost_estimate_usd: "0.02" }),
    externalCall({ run_id: "61", provider: "google_places", model: null, cost_estimate_usd: "0.025" }),
    externalCall({ run_id: "62", provider: "google_places", model: null, cost_estimate_usd: "0.005" }),
  ];
}

function externalCall(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    run_id: "57",
    provider: "openrouter",
    call_type: "chat.completions",
    model: "google/gemini-3.5-flash",
    status: "ok",
    tokens: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    cost_estimate_usd: "0.01",
    run_command: "drain",
    run_args: {},
    ...overrides,
  };
}

function taskRows() {
  return [
    {
      run_id: "57",
      task_type: "legitimacy_check",
      status: "done",
      outcome: "_none",
      count: 3,
      attempted_count: 1,
      written_count: 1,
      needs_human_count: 1,
    },
    {
      run_id: "60",
      task_type: "contact_fill",
      status: "done",
      outcome: "contact_filled",
      count: 2,
      attempted_count: 2,
      written_count: 2,
      needs_human_count: 0,
    },
    {
      run_id: "61",
      task_type: "reviews_fetch",
      status: "done",
      outcome: "reviews_fetched",
      count: 1,
      attempted_count: 1,
      written_count: 1,
      needs_human_count: 0,
    },
  ];
}

function servingState() {
  return {
    nondeleted_locations: 3,
    active_locations: 3,
    hidden_locations: 0,
    other_nondeleted_locations: 0,
    deleted_locations: 1,
    suppression_ledger_rows: 8,
    suppressed_locations: 0,
    search_location_rows: 3,
    location_field_status_rows: 5,
  };
}

function eventRows() {
  return [
    { run_id: "57", entity_type: "locations", action: "update", reason: "pass1_stage3_legitimacy_suppression", count: 1 },
    { run_id: "57", entity_type: "locations", action: "update", reason: "contact_fill:website", count: 1 },
    { run_id: "58", entity_type: "locations", action: "update", reason: "legitimacy_redemption: in_scope", count: 1 },
    { run_id: "60", entity_type: "locations", action: "update", reason: "contact_fill:website", count: 2 },
  ];
}
