import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { HARD_EXCLUSION_PREDICATE_SQL } from "../pipeline/lib/legitimacy-sample.mjs";
// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { LEGITIMACY_GATE_B_CAMPAIGN, LEGITIMACY_GATE_B_PROMPT_VERSION, enqueueLegitimacyGateBFull, loadLegitimacyGateBReportData, renderLegitimacyGateBReport, renderLegitimacyReviewQueue } from "../pipeline/lib/legitimacy-full.mjs";

function enqueueRow(overrides = {}) {
  return {
    active_count: 10,
    excluded_count: 2,
    eligible_count: 8,
    existing_count: 0,
    missing_count: 8,
    inserted_count: 0,
    active_conflict_count: 0,
    unexpected_count: 0,
    duplicate_entity_count: 0,
    selected_entity_ids_sample: Array.from({ length: 8 }, (_, index) => index + 1),
    inserted_entity_ids_sample: [],
    ...overrides,
  };
}

describe("legitimacy Gate B full enqueue", () => {
  test("previews every eligible row without a write and uses the exact conservative exclusions", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).not.toContain("INSERT INTO fountain_ops.task_queue");
      expect(sql).not.toContain("pg_advisory_xact_lock");
      expect(sql).toContain(HARD_EXCLUSION_PREDICATE_SQL);
      expect(sql).toContain("l.status = 'active'");
      expect(sql).toContain("l.deleted_at IS NULL");
      expect(sql).toContain("'organization:' || l.org_id::text");
      expect(sql).toContain("'location:' || l.id::text");
      expect(params).toEqual([
        LEGITIMACY_GATE_B_CAMPAIGN,
        LEGITIMACY_GATE_B_PROMPT_VERSION,
        0.8,
      ]);
      return { rows: [enqueueRow()] };
    });

    await expect(enqueueLegitimacyGateBFull({ runId: 30 }, { query })).resolves.toMatchObject({
      apply: false,
      activeCount: 10,
      excludedCount: 2,
      eligibleCount: 8,
      selectedCount: 8,
      insertedCount: 0,
    });
  });

  test("fills the deterministic v2 campaign under a lock with organization siblings adjacent", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("pg_advisory_xact_lock");
      expect(sql).toContain("INSERT INTO fountain_ops.task_queue");
      expect(sql).toContain("'stage', 'stage_1'");
      expect(sql).toContain("'threshold', $3::numeric");
      expect(sql).toContain("'org_id', eligible.org_id");
      expect(sql).toContain("'classification_level', eligible.classification_level");
      expect(sql).toContain("'classification_key', eligible.classification_key");
      expect(sql).toContain("ORDER BY COALESCE(missing.org_id, 2147483647), missing.entity_id");
      expect(sql).not.toContain("ON CONFLICT");
      expect(params).toEqual([
        LEGITIMACY_GATE_B_CAMPAIGN,
        LEGITIMACY_GATE_B_PROMPT_VERSION,
        0.8,
        25,
        4,
        "31",
      ]);
      return {
        rows: [enqueueRow({
          inserted_count: 8,
          inserted_entity_ids_sample: Array.from({ length: 8 }, (_, index) => index + 1),
        })],
      };
    });

    const result = await enqueueLegitimacyGateBFull({
      runId: "31",
      priority: 25,
      maxAttempts: 4,
      apply: true,
    }, { query });
    expect(result).toMatchObject({ selectedCount: 8, insertedCount: 8, reused: false });
  });

  test("reuses a complete campaign and refuses active cross-campaign conflicts", async () => {
    const reuse = vi.fn(async () => ({
      rows: [enqueueRow({ existing_count: 8, missing_count: 0 })],
    }));
    await expect(enqueueLegitimacyGateBFull({ runId: 32, apply: true }, { query: reuse }))
      .resolves.toMatchObject({ reused: true, existingCount: 8, insertedCount: 0 });

    const conflict = vi.fn(async () => ({
      rows: [enqueueRow({ active_conflict_count: 1 })],
    }));
    await expect(enqueueLegitimacyGateBFull({ runId: 33, apply: true }, { query: conflict }))
      .rejects.toThrow("active_conflicts=1");
  });
});

describe("legitimacy Gate B dry-run reporting", () => {
  test("reconciles the full cohort, fails organization conflicts closed, and renders both reports", async () => {
    const taskRows = buildTaskRows();
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("AS duplicate_entity_count") && sql.includes("missing_count")) {
        expect(params).toEqual([LEGITIMACY_GATE_B_CAMPAIGN, LEGITIMACY_GATE_B_PROMPT_VERSION]);
        return { rows: [{
          active_count: 7,
          excluded_count: 1,
          eligible_count: 6,
          task_count: 6,
          missing_count: 0,
          unexpected_count: 0,
          duplicate_entity_count: 0,
        }] };
      }
      if (sql.includes("queue.id AS task_id")) {
        expect(sql).toContain("FROM fountain.external_place_matches place_match");
        expect(sql).toContain("GREATEST(");
        expect(sql).toContain("FROM fountain.reviews review");
        expect(sql).toContain("FROM fountain.offerings offering");
        return { rows: taskRows };
      }
      if (sql.includes("FROM fountain_ops.external_calls external_call")) {
        expect(params).toEqual([["40", "41"]]);
        return { rows: [
          { call_type: "legitimacy_stage_1", status: "ok", tokens: { prompt_tokens: 100, completion_tokens: 20 }, cost_estimate_usd: "0.01" },
          { call_type: "legitimacy_stage_2", status: "ok", tokens: { prompt_tokens: 40, completion_tokens: 10 }, cost_estimate_usd: "0.005" },
        ] };
      }
      if (sql.includes("WITH cohort_window AS")) {
        expect(params).toEqual([
          LEGITIMACY_GATE_B_CAMPAIGN,
          LEGITIMACY_GATE_B_PROMPT_VERSION,
          ["40", "41"],
        ]);
        return { rows: [
          { id: "39", command: "drain", args: { task: "legitimacy_check", stage: "stage_1", concurrency: "16" }, status: "completed", budget_usd: "25", spent_usd_estimate: "0.02", dry_run: false },
          { id: "40", command: "drain", args: { task: "legitimacy_check", stage: "stage_1", concurrency: "24" }, status: "completed", budget_usd: "25", spent_usd_estimate: "0.01", dry_run: false },
          { id: "41", command: "drain", args: { task: "legitimacy_check", stage: "stage_2", concurrency: "24" }, status: "completed", budget_usd: "15", spent_usd_estimate: "0.005", dry_run: false },
        ] };
      }
      if (sql.includes("args->>'operation' = 'legitimacy_rubric_policy_replay'")) {
        expect(params).toEqual([
          LEGITIMACY_GATE_B_CAMPAIGN,
          LEGITIMACY_GATE_B_PROMPT_VERSION,
          ["40", "41"],
        ]);
        return { rows: [{
          id: "42",
          command: "maintain",
          args: {
            operation: "legitimacy_rubric_policy_replay",
            reason: "research_positive_evidence_guard",
            sourceRuns: ["40", "41"],
          },
          status: "completed",
          counts: { selected: 2, updated: 1 },
          dry_run: false,
        }] };
      }
      if (sql.includes("FROM fountain_ops.runs")) {
        return { rows: [
          { id: "40", command: "drain", args: { task: "legitimacy_check", stage: "stage_1", concurrency: "24" }, status: "completed", budget_usd: "25", spent_usd_estimate: "0.01", dry_run: false },
          { id: "41", command: "drain", args: { task: "legitimacy_check", stage: "stage_2", concurrency: "24" }, status: "completed", budget_usd: "15", spent_usd_estimate: "0.005", dry_run: false },
        ] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const data = await loadLegitimacyGateBReportData({ runIds: [40, "41", 40] }, { query });
    expect(data.runIds).toEqual(["40", "41"]);
    expect(data.rawClassCounts).toEqual({
      junk: 2,
      plain_hospital: 2,
      review: 1,
      destination_medical: 0,
      in_scope: 1,
    });
    expect(data.classCounts).toEqual({
      junk: 1,
      plain_hospital: 1,
      review: 3,
      destination_medical: 0,
      in_scope: 1,
    });
    expect(data).toMatchObject({
      suppressionCount: 2,
      organizationConflictCount: 1,
      organizationConflictLocationCount: 2,
      normalizationFlagCounts: {
        ambiguous_research_to_review: 1,
        destination_treatment_to_plain_hospital: 1,
        destination_without_qualifying_program: 1,
        in_scope_ordinary_rehab_to_plain_hospital: 1,
        junk_ordinary_care_to_plain_hospital: 1,
        junk_without_positive_evidence: 1,
        research_without_consumer_care: 1,
        unexpected_policy_flag: 1,
      },
    });
    expect(data.topSuppressions.map((row: { entityId: number }) => row.entityId)).toEqual([4, 3]);
    expect(data.randomSuppressions).toHaveLength(2);
    expect(data.reviewRows.map((row: { entityId: number }) => row.entityId).sort()).toEqual([1, 2, 5]);
    expect(data.actual).toMatchObject({
      budgetUsd: 40,
      calls: 2,
      stage1Calls: 1,
      stage2Calls: 1,
      inputTokens: 140,
      outputTokens: 30,
      spendUsd: 0.015,
      stage2Candidates: 1,
      websiteFetches: 1,
      networkFetches: 1,
    });
    expect(data.attemptActual).toMatchObject({
      runs: 3,
      failedRuns: 0,
      supersededRuns: 1,
      supersededSpendUsd: 0.02,
    });
    expect(data.attemptActual.spendUsd).toBeCloseTo(0.035);
    expect(data.policyReplayActual).toEqual({ runs: 1, selected: 2, updated: 1 });

    const report = renderLegitimacyGateBReport(data);
    expect(report).toContain("GATE B AWAITING APPROVAL");
    expect(report).toContain("What was done:");
    expect(report).toContain("Evidence:");
    expect(report).toContain("Deviations from rubric/plan:");
    expect(report).toContain("Open questions:");
    expect(report).toContain("**Total would-be suppressions: 2.**");
    expect(report).toContain("| review | 3 |");
    expect(report).toContain("## Rubric guard outcomes");
    expect(report).toContain("Junk without positive evidence → review");
    expect(report).toContain("Treatment destination → plain_hospital");
    expect(report).toContain("Unexpected policy flag");
    expect(report).toContain("All-attempt run-recorded spend | $0.0350");
    expect(report).toContain("| 39 | superseded calibration | stage_1 | completed | 16 |");
    expect(report).toContain("| 42 | completed | research_positive_evidence_guard | 40, 41 | 2 | 1 | false |");
    expect(report).not.toContain("stage_1_should_not_count");
    expect(report.indexOf("Large Plain Hospital")).toBeLessThan(report.indexOf("Standalone Junk"));
    expect(report).toContain("**STOP — AWAITING CONFIRMATION BEFORE SUPPRESSION APPLY.**");

    const queue = renderLegitimacyReviewQueue(data);
    expect(queue).toContain("organization class conflict");
    expect(queue).toContain("organization:10");
    expect(queue).toContain("Model Review");
  });

  test("refuses unreconciled, incomplete, and serving-write cohorts", async () => {
    const reconcileQuery = vi.fn(async () => ({ rows: [{
      active_count: 6,
      excluded_count: 0,
      eligible_count: 6,
      task_count: 5,
      missing_count: 1,
      unexpected_count: 0,
      duplicate_entity_count: 0,
    }] }));
    await expect(loadLegitimacyGateBReportData({ runIds: [40] }, { query: reconcileQuery }))
      .rejects.toThrow("does not reconcile");

    for (const resultOverride of [
      { status: "pending" },
      { result: { ...classified("junk"), serving_write: { attempted: true, written: false } } },
    ]) {
      let call = 0;
      const query = vi.fn(async () => {
        call += 1;
        if (call === 1) return { rows: [{
          active_count: 1, excluded_count: 0, eligible_count: 1, task_count: 1,
          missing_count: 0, unexpected_count: 0, duplicate_entity_count: 0,
        }] };
        if (call === 2) return { rows: [taskRow(1, "junk", { ...resultOverride })] };
        return { rows: [] };
      });
      await expect(loadLegitimacyGateBReportData({ runIds: [40] }, { query }))
        .rejects.toThrow(/incomplete|serving-write/);
    }
  });
});

function buildTaskRows() {
  return [
    taskRow(1, "junk", { orgId: 10, name: "Org Branch A" }),
    taskRow(2, "plain_hospital", {
      orgId: 10,
      name: "Org Branch B",
      stage1Flags: ["in_scope_ordinary_rehab_to_plain_hospital"],
    }),
    taskRow(3, "junk", {
      name: "Standalone Junk",
      reviews: 5,
      offerings: 8,
      stage1Flags: ["research_without_consumer_care"],
    }),
    taskRow(4, "plain_hospital", {
      name: "Large Plain Hospital",
      reviews: 10,
      offerings: 1,
      stage1Flags: [
        "junk_ordinary_care_to_plain_hospital",
        "destination_treatment_to_plain_hospital",
      ],
    }),
    taskRow(5, "review", {
      name: "Model Review",
      stage1Flags: [
        "ambiguous_research_to_review",
        "junk_without_positive_evidence",
        "junk_without_positive_evidence",
        "destination_without_qualifying_program",
      ],
    }),
    taskRow(6, "in_scope", {
      name: "Keep Me",
      stage2: true,
      stage1Flags: ["stage_1_should_not_count"],
      stage2Flags: ["unexpected_policy_flag"],
    }),
  ];
}

function taskRow(id: number, className: string, options: Record<string, unknown> = {}) {
  const orgId = options.orgId == null ? null : Number(options.orgId);
  const level = orgId == null ? "location" : "organization";
  const key = `${level}:${orgId ?? id}`;
  const result = options.result || classified(className, {
    stage2: Boolean(options.stage2),
    stage1Flags: options.stage1Flags,
    stage2Flags: options.stage2Flags,
  });
  return {
    task_id: String(1000 + id),
    entity_id: id,
    task_status: options.status || "done",
    payload: {
      campaign: LEGITIMACY_GATE_B_CAMPAIGN,
      prompt_version: LEGITIMACY_GATE_B_PROMPT_VERSION,
      classification_level: level,
      classification_key: key,
      stage: "stage_1",
      threshold: 0.8,
    },
    result,
    org_id: orgId,
    name: options.name || `Location ${id}`,
    organization_name: orgId == null ? null : "Test Organization",
    locality: "Testville",
    region: "CA",
    country_code: "US",
    review_count: options.reviews || 0,
    offering_count: options.offerings || 0,
  };
}

function classified(
  className: string,
  options: boolean | { stage2?: boolean; stage1Flags?: unknown; stage2Flags?: unknown } = false,
) {
  const normalized = typeof options === "boolean" ? { stage2: options } : options;
  const stage2 = Boolean(normalized.stage2);
  const stage1Flags = Array.isArray(normalized.stage1Flags) ? normalized.stage1Flags : [];
  const stage2Flags = Array.isArray(normalized.stage2Flags) ? normalized.stage2Flags : [];
  return {
    outcome: "classified",
    final: { class: className, confidence: 0.91, rationale: `${className} evidence.` },
    stages: {
      stage_1: {
        class: className,
        confidence: stage2 ? 0.7 : 0.91,
        normalization_flags: stage1Flags,
      },
      stage_2: stage2 ? {
        classification: {
          class: className,
          confidence: 0.91,
          normalization_flags: stage2Flags,
        },
        website: { outcome: "ok", cache_status: "miss_fetched" },
      } : null,
    },
    serving_write: { attempted: false, written: false },
  };
}
