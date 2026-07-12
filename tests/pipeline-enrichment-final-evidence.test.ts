import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline intentionally uses native .mjs modules.
import * as evidence from "../pipeline/lib/enrichment-final-evidence.mjs";

const {
  FINAL_REDEMPTION_ACTOR,
  FINAL_REDEMPTION_EVIDENCE_SQL,
  FINAL_REDEEMED_LOCATIONS_SQL,
  FINAL_STAGE3_ACTOR,
  FINAL_STAGE3_EVIDENCE_SQL,
  loadPersistedLegitimacyCloseout,
} = evidence;

describe("persisted final legitimacy evidence", () => {
  test("reconstructs exact Stage 3 run 57 and redemption run 61 summaries", async () => {
    const query = evidenceQuery();

    const result = await loadPersistedLegitimacyCloseout({}, { query });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledWith(FINAL_STAGE3_EVIDENCE_SQL, [
      "57",
      "61",
      FINAL_STAGE3_ACTOR,
      FINAL_REDEMPTION_ACTOR,
    ]);
    expect(query).toHaveBeenCalledWith(FINAL_REDEMPTION_EVIDENCE_SQL, [
      "61",
      FINAL_REDEMPTION_ACTOR,
    ]);
    expect(query).toHaveBeenCalledWith(FINAL_REDEEMED_LOCATIONS_SQL, ["61"]);
    expect(result.stage3).toMatchObject({
      execution: {
        runId: "57",
        plan: { counts: { cohortRows: 3, keepRows: 1, suppressionRows: 1, humanReviewRows: 1 } },
      },
      suppression: {
        apply: true,
        applyRunId: "57",
        preflight: { sourceRecordFanout: 2, hardExcludedCandidateCount: 0 },
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
    });
    expect(result.redemption).toMatchObject({
      cohort: { counts: { candidates: 1 } },
      pass: {
        runId: "61",
        counts: { redeem: 1, retainSuppressed: 0 },
        decisions: [{
          locationId: 2,
          name: "Redeemed Health",
          class: "in_scope",
          action: "redeem",
          deletedSuppressionRows: 2,
        }],
      },
      apply: {
        apply: true,
        runId: "61",
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
      },
    });
  });

  test("refuses persisted Stage 3 drift before constructing a report", async () => {
    const query = evidenceQuery({ stage: { ...stageEvidenceRow(), event_count: 0 } });

    await expect(loadPersistedLegitimacyCloseout({}, { query })).rejects.toThrow(
      "Persisted Stage 3 closeout evidence did not reconcile: suppression events=0/1",
    );
  });

  test("refuses any run IDs other than the approved exact closeout runs", async () => {
    const query = vi.fn();

    await expect(loadPersistedLegitimacyCloseout({
      stage3RunId: "58",
      redemptionRunId: "61",
    }, { query })).rejects.toThrow("Stage 3 closeout is fixed to run 57");
    await expect(loadPersistedLegitimacyCloseout({
      stage3RunId: "57",
      redemptionRunId: "62",
    }, { query })).rejects.toThrow("redemption closeout is fixed to run 61");
    expect(query).not.toHaveBeenCalled();
  });
});

function evidenceQuery({
  stage = stageEvidenceRow(),
  redemption = redemptionEvidenceRow(),
  redeemed = [redeemedLocationRow()],
} = {}) {
  return vi.fn(async (sql: string) => {
    if (sql === FINAL_STAGE3_EVIDENCE_SQL) return { rows: [stage] };
    if (sql === FINAL_REDEMPTION_EVIDENCE_SQL) return { rows: [redemption] };
    if (sql === FINAL_REDEEMED_LOCATIONS_SQL) return { rows: redeemed };
    throw new Error("Unexpected persisted-evidence query.");
  });
}

function stageEvidenceRow() {
  return {
    run_count: 1,
    run_command: "stage3",
    run_status: "completed",
    run_dry_run: false,
    run_counts: {
      cohort_rows: 3,
      keep: 1,
      suppressed: 1,
      needs_human_review: 1,
      source_suppressions: 2,
    },
    task_count: 3,
    keep_count: 1,
    suppress_count: 1,
    needs_human_count: 1,
    task_write_count: 1,
    hard_excluded_suppression_count: 0,
    event_count: 1,
    distinct_event_count: 1,
    target_active_count: 1,
    target_hidden_count: 0,
    target_other_count: 0,
    target_search_count: 1,
    redeemed_stage_target_count: 1,
    redeemed_stage_search_count: 1,
    redeemed_stage_suppression_rows: 2,
    stage_suppression_rows_current: 0,
    stage_status_ledger_current: 0,
    redemption_status_ledger_count: 1,
    global_active_current: 3,
    global_hidden_current: 0,
    suppression_ledger_current: 8,
  };
}

function redemptionEvidenceRow() {
  return {
    run_count: 1,
    run_command: "redemption",
    run_status: "completed",
    run_dry_run: false,
    run_counts: {
      lookup_candidates: 1,
      redeemed: 1,
      retained_suppressed: 0,
    },
    task_evidence_count: 1,
    event_count: 1,
    distinct_event_count: 1,
    task_suppression_rows_deleted: 2,
    event_suppression_rows_deleted: 2,
    active_count: 1,
    search_index_count: 1,
    status_ledger_count: 1,
    owned_suppression_rows_remaining: 0,
    suppression_ledger_current: 8,
  };
}

function redeemedLocationRow() {
  return {
    source_task_id: "900",
    location_id: 2,
    name: "Redeemed Health",
    prior_final: { class: "plain_hospital" },
    redemption: {
      class: "in_scope",
      confidence: 0.93,
      basis: "positive",
      positive_evidence: "Official consumer longevity program.",
      rationale: "The official website establishes scope.",
      official_website: "https://redeemed.example/",
      model: "google/gemini-3.5-flash",
      external_call_id: 500,
      suppression_owner: "pass1_stage3_apply_run_57",
      suppression_rows_deleted: 2,
      agent_lookup: { outcome: "official_website_found" },
    },
  };
}
