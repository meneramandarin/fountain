import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { applyLegitimacyGateBSuppression, previewLegitimacyGateBSuppression, renderLegitimacyGateBCompletion } from "../pipeline/lib/legitimacy-suppression.mjs";

const CAMPAIGN = "pass1_gate_b_dry_run";
const PROMPT = "pass1-legitimacy-v2";

function preflightRow(overrides = {}) {
  return {
    campaign_task_count: 6,
    classified_task_count: 6,
    organization_conflict_count: 1,
    candidate_count: 2,
    active_candidate_count: 2,
    hard_excluded_candidate_count: 0,
    duplicate_entity_count: 0,
    source_record_fanout: 3,
    null_source_listing_count: 0,
    existing_suppression_overlap: 0,
    distinct_source_pair_count: 3,
    locations_without_source_records: 0,
    existing_status_ledger_count: 0,
    suppression_ledger_before: 10,
    candidate_search_rows: 2,
    class_counts: { junk: 1, plain_hospital: 1 },
    ...overrides,
  };
}

describe("Gate B atomic suppression", () => {
  test("previews the exact effective cohort without writes and includes the hard guards", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("organization_conflicts");
      expect(sql).toContain("owner_account_id IS NOT NULL");
      expect(sql).toContain("field_status.locked");
      expect(sql).toContain("suppressed_source_listings");
      expect(params).toEqual([CAMPAIGN, PROMPT]);
      return { rows: [preflightRow()] };
    });

    await expect(previewLegitimacyGateBSuppression({
      campaign: CAMPAIGN,
      promptVersion: PROMPT,
      expectedSuppressionCount: 2,
    }, { query })).resolves.toMatchObject({
      apply: false,
      candidateCount: 2,
      sourceRecordFanout: 3,
      hardExcludedCandidateCount: 0,
    });
  });

  test("fails closed on cohort drift, exclusions, or an existing suppression overlap", async () => {
    for (const override of [
      { candidate_count: 1, active_candidate_count: 1 },
      { hard_excluded_candidate_count: 1 },
      { existing_suppression_overlap: 1 },
      { distinct_source_pair_count: 2 },
      { locations_without_source_records: 1 },
      { existing_status_ledger_count: 1 },
    ]) {
      const query = vi.fn(async () => ({ rows: [preflightRow(override)] }));
      await expect(previewLegitimacyGateBSuppression({
        campaign: CAMPAIGN,
        promptVersion: PROMPT,
        expectedSuppressionCount: 2,
      }, { query })).rejects.toThrow("preflight refused apply");
    }
  });

  test("applies every mutation and evidence row in one serializable guarded transaction", async () => {
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("transaction_timestamp")) {
          return { rows: [{ apply_started_at: "2026-07-12T05:00:00.000Z" }] };
        }
        if (sql.includes("FOR UPDATE OF location")) return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
        if (sql.includes("WITH candidate_state AS")) return { rows: [preflightRow()] };
        if (sql.includes("INSERT INTO fountain_raw.suppressed_source_listings")) return { rows: [], rowCount: 3 };
        if (sql.includes("UPDATE fountain.locations location")) return { rows: [], rowCount: 2 };
        if (sql.includes("UPDATE fountain.entity_change_events event")) {
          expect(sql).toContain("'campaign', $2::text");
          expect(sql).toContain("'prompt_version', $3::text");
          return { rows: [], rowCount: 2 };
        }
        if (sql.includes("UPDATE fountain_ops.task_queue queue")) return { rows: [], rowCount: 2 };
        if (sql.includes("INSERT INTO fountain_ops.field_status")) return { rows: [], rowCount: 2 };
        if (sql.includes("AS hidden_count")) {
          return { rows: [{
            hidden_count: 2,
            remaining_search_rows: 0,
            run_suppression_ledger_rows: 3,
            suppression_ledger_after: 13,
            stamped_event_count: 2,
            task_evidence_count: 2,
            status_ledger_count: 2,
            active_locations_after: 4,
            hidden_locations_after: 2,
          }] };
        }
        if (sql.includes("ORDER BY md5")) {
          return { rows: [{
            entity_id: 1,
            name: "Retail Artifact",
            locality: "Testville",
            region: "CA",
            country_code: "US",
            class: "junk",
            confidence: "0.95",
            model: "openai/gpt-4o-mini",
            rationale: "Retail business.",
            source_records: 2,
          }] };
        }
        if (sql.includes("sum(run.budget_usd)")) {
          return { rows: [{ budget_usd: "40", spend_usd: "0.8", run_count: 2 }] };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const withTransaction = vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx));
    const setActor = vi.fn(async () => undefined);

    const result = await applyLegitimacyGateBSuppression({
      campaign: CAMPAIGN,
      promptVersion: PROMPT,
      runId: 50,
      classificationRunIds: [39, 40],
      expectedSuppressionCount: 2,
    }, { withTransaction, setActor });

    expect(withTransaction).toHaveBeenCalledOnce();
    expect(setActor).toHaveBeenCalledWith(tx, expect.objectContaining({
      actorLabel: "pass1_gate_b_apply_run_50",
    }));
    expect(tx.query).toHaveBeenCalledWith("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    expect(result).toMatchObject({
      apply: true,
      applyRunId: "50",
      preflight: { candidateCount: 2, sourceRecordFanout: 3 },
      verification: { hiddenCount: 2, stampedEventCount: 2 },
      usage: { budgetUsd: 40, spendUsd: 0.8 },
    });

    const report = renderLegitimacyGateBCompletion(result);
    expect(report).toContain("**GATE B COMPLETE**");
    expect(report).toContain("| Approved suppressions | 2 | 2 |");
    expect(report).toContain("| Source-record fan-out / suppression-ledger delta | 3 | 3 |");
    expect(report).toContain("Retail Artifact");
    expect(report).toContain("Restore recipe");
  });

  test("aborts before any serving update when the locked candidate count drifts", async () => {
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("transaction_timestamp")) {
          return { rows: [{ apply_started_at: "2026-07-12T05:00:00.000Z" }] };
        }
        if (sql.includes("FOR UPDATE OF location")) return { rows: [{ id: 1 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };
    const withTransaction = vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx));

    await expect(applyLegitimacyGateBSuppression({
      campaign: CAMPAIGN,
      promptVersion: PROMPT,
      runId: 50,
      classificationRunIds: [39, 40],
      expectedSuppressionCount: 2,
    }, { withTransaction, setActor: vi.fn(async () => undefined) }))
      .rejects.toThrow("row lock drifted");
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE fountain.locations")))
      .toBe(false);
  });
});
