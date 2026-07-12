import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { HARD_EXCLUSION_PREDICATE_SQL, LEGITIMACY_GATE_A_CAMPAIGN, LEGITIMACY_PROMPT_VERSION, enqueueLegitimacyGateASample, loadLegitimacyGateAReportData, renderLegitimacyGateAReport } from "../pipeline/lib/legitimacy-sample.mjs";

const populationByStratum = { hyperbaric: 859, hospital: 1876, random: 10786 };
const sampleCounts = { hyperbaric: 50, hospital: 50, random: 200 };
const selectedEntityIds = Array.from({ length: 300 }, (_, index) => index + 1);

function enqueueRow(overrides = {}) {
  return {
    active_count: 13521,
    excluded_count: 0,
    eligible_count: 13521,
    population_by_stratum: populationByStratum,
    existing_count: 0,
    inserted_count: 0,
    active_conflict_count: 0,
    selected_count: 300,
    sample_counts: sampleCounts,
    selected_entity_ids: selectedEntityIds,
    inserted_entity_ids: [],
    ...overrides,
  };
}

describe("legitimacy Gate A sampling", () => {
  test("previews a deterministic, mutually exclusive 50/50/200 sample without an INSERT", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).not.toContain("INSERT INTO fountain_ops.task_queue");
      expect(sql).toContain("source.slug = 'hyperbaric_app'");
      expect(sql).toContain("l.deleted_at IS NULL");
      expect(sql).toContain("WHERE sample_stratum = 'hospital'");
      expect(sql).toContain("PARTITION BY COALESCE(NULLIF(country_code, ''), 'ZZ')");
      expect(sql).toContain("WHERE sample_stratum = 'random'");
      expect(sql).toContain("queue.payload->>'prompt_version' = $2");
      expect(params).toEqual([
        LEGITIMACY_GATE_A_CAMPAIGN,
        LEGITIMACY_PROMPT_VERSION,
        "pass1-gate-a-v1",
        0.8,
      ]);
      return { rows: [enqueueRow()] };
    });

    const result = await enqueueLegitimacyGateASample({ runId: "18" }, { query });

    expect(result).toMatchObject({
      apply: false,
      selectedCount: 300,
      insertedCount: 0,
      existingCount: 0,
      reused: false,
      populationByStratum,
      sampleCounts,
    });
    expect(result.selectedEntityIds).toHaveLength(300);
  });

  test("applies atomically with campaign/prompt idempotence and guarded payload metadata", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("pg_advisory_xact_lock");
      expect(sql).toContain("INSERT INTO fountain_ops.task_queue");
      expect(sql).toContain("'sample_stratum', selected.sample_stratum");
      expect(sql).toContain("'stage', 'stage_1'");
      expect(sql).toContain("'threshold', $4::numeric");
      expect(sql).toContain("AND (SELECT count(*) FROM existing) = 0");
      expect(sql).toContain("WHERE status IN ('pending', 'claimed')");
      expect(params).toEqual([
        LEGITIMACY_GATE_A_CAMPAIGN,
        LEGITIMACY_PROMPT_VERSION,
        "sample-seed",
        0.82,
        25,
        4,
        "19",
        true,
      ]);
      return {
        rows: [enqueueRow({
          inserted_count: 300,
          inserted_entity_ids: selectedEntityIds,
        })],
      };
    });

    const result = await enqueueLegitimacyGateASample({
      runId: 19,
      seed: "sample-seed",
      threshold: 0.82,
      priority: 25,
      maxAttempts: 4,
      apply: true,
    }, { query });

    expect(result).toMatchObject({ apply: true, selectedCount: 300, insertedCount: 300, reused: false });
    expect(result.insertedEntityIds).toHaveLength(300);
  });

  test("reuses a complete campaign/prompt sample and rejects partial cohorts", async () => {
    const reuseQuery = vi.fn(async () => ({
      rows: [enqueueRow({ existing_count: 300 })],
    }));
    await expect(enqueueLegitimacyGateASample({ runId: "20", apply: true }, { query: reuseQuery }))
      .resolves.toMatchObject({ reused: true, existingCount: 300, insertedCount: 0 });

    const partialQuery = vi.fn(async () => ({
      rows: [enqueueRow({
        selected_count: 299,
        sample_counts: { hyperbaric: 50, hospital: 49, random: 200 },
      })],
    }));
    await expect(enqueueLegitimacyGateASample({ runId: "21" }, { query: partialQuery }))
      .rejects.toThrow("requires an exact 50/50/200 sample");
  });

  test("hard exclusions cover location and organization ownership, claims, and protected fields", () => {
    expect(HARD_EXCLUSION_PREDICATE_SQL).toContain("l.owner_account_id IS NOT NULL");
    expect(HARD_EXCLUSION_PREDICATE_SQL).toContain("o.owner_account_id IS NOT NULL");
    expect(HARD_EXCLUSION_PREDICATE_SQL).toContain("fountain.clinic_claims");
    expect(HARD_EXCLUSION_PREDICATE_SQL).toContain("claim.status = 'approved'");
    expect(HARD_EXCLUSION_PREDICATE_SQL).toContain("fountain_ops.field_status");
    expect(HARD_EXCLUSION_PREDICATE_SQL).toContain("field_status.locked");
    expect(HARD_EXCLUSION_PREDICATE_SQL).toContain("'human_verified', 'owner_verified'");
  });
});

describe("legitimacy Gate A reporting", () => {
  test("loads actual usage and produces a stratum-weighted full-run projection", async () => {
    const sampleRows = buildSampleRows();
    const externalCalls = buildExternalCalls(sampleRows);
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("FROM stratified")) {
        expect(params).toEqual([]);
        return {
          rows: [{
            active_count: 13521,
            excluded_count: 0,
            eligible_count: 13521,
            population_by_stratum: populationByStratum,
          }],
        };
      }
      if (sql.includes("queue.id AS task_id")) {
        expect(params).toEqual([LEGITIMACY_GATE_A_CAMPAIGN, LEGITIMACY_PROMPT_VERSION]);
        return { rows: sampleRows };
      }
      if (sql.includes("FROM fountain_ops.external_calls external_call")) {
        expect(sql).toContain("external_call.call_type IN ('legitimacy_stage_1', 'legitimacy_stage_2')");
        expect(params).toEqual([["22", "23"]]);
        return { rows: externalCalls };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const data = await loadLegitimacyGateAReportData({ runIds: [22, "23", 22] }, { query });

    expect(data.runIds).toEqual(["22", "23"]);
    expect(data.sampleCounts).toEqual(sampleCounts);
    expect(data.classCounts).toEqual({ junk: 1, plain_hospital: 1, in_scope: 298 });
    expect(data.actual).toMatchObject({
      calls: 330,
      stage1Calls: 300,
      stage2Calls: 30,
      websiteFetches: 30,
      cacheHits: 15,
      networkFetches: 15,
    });
    expect(data.actual.spendUsd).toBeCloseTo(0.285, 10);
    expect(data.projection.spendUsd).toBeCloseTo(11.19585, 8);
    expect(data.projection.remainingSpendUsd).toBeCloseTo(10.91085, 8);
    expect(data.projection.websiteFetches).toBeCloseTo(1086.3, 8);

    expect(() => renderLegitimacyGateAReport({
      ...data,
      sampleRows: data.sampleRows.map((row: Record<string, unknown>, index: number) => (
        index === 0 ? { ...row, taskStatus: "pending" } : row
      )),
    })).toThrow("incomplete or unclassified");
    expect(() => renderLegitimacyGateAReport({
      ...data,
      sampleRows: data.sampleRows.map((row: Record<string, unknown>, index: number) => (
        index === 0 ? { ...row, class: "unclassified" } : row
      )),
    })).toThrow("incomplete or unclassified");

    const markdown = renderLegitimacyGateAReport(data);
    expect(markdown).toContain("**GATE A AWAITING APPROVAL**");
    expect(markdown).toContain("## Step 0 housekeeping (pre-approved)");
    expect(markdown).toContain("0 serving-write attempts");
    expect(markdown).toContain("| junk | 1 |");
    expect(markdown).toContain("| plain_hospital | 1 |");
    expect(markdown).toContain("| External calls | 330 |");
    expect(markdown).toContain("| Total estimated spend | $11.1959 |");
    expect(markdown).toContain("| Website fetch attempts | 1,086.3 |");
    expect(markdown.indexOf("Zulu Junk")).toBeLessThan(markdown.indexOf("Alpha Hospital"));
    expect(markdown).toContain("**STOP — AWAITING APPROVAL.**");
  });

  test("requires explicit drain/resume run ids for exact call-ledger attribution", async () => {
    await expect(loadLegitimacyGateAReportData({ runIds: [] }, { query: vi.fn() }))
      .rejects.toThrow("runIds must contain every Gate A drain/resume run id");
  });
});

function buildSampleRows() {
  const rows = [];
  let entityId = 1;
  for (const [stratum, count] of Object.entries(sampleCounts)) {
    for (let index = 0; index < count; index += 1) {
      const classification = stratum === "hyperbaric" && index === 0
        ? { class: "junk", confidence: 0.98, rationale: "Directory shell, not a clinic." }
        : stratum === "hospital" && index === 0
          ? { class: "plain_hospital", confidence: 0.96, rationale: "Ordinary hospital department." }
          : { class: "in_scope", confidence: 0.91, rationale: "Consumer wellness destination." };
      rows.push({
        task_id: String(entityId + 1000),
        entity_id: entityId,
        task_status: "done",
        payload: {
          campaign: LEGITIMACY_GATE_A_CAMPAIGN,
          prompt_version: LEGITIMACY_PROMPT_VERSION,
          sample_stratum: stratum,
          threshold: 0.8,
        },
        result: {
          final: classification,
          stages: {
            stage_1: allocatedEvidence(index < 10 ? 0.7 : 0.9, stratum),
            stage_2: index < 10
              ? {
                  classification: allocatedEvidence(classification.confidence, stratum),
                  website: {
                    ok: true,
                    outcome: "ok",
                    cache_status: index < 5 ? "hit_fresh" : "miss_fetched",
                  },
                }
              : null,
          },
        },
        name: stratum === "hyperbaric" && index === 0
          ? "Zulu Junk"
          : stratum === "hospital" && index === 0
            ? "Alpha Hospital"
            : `${stratum} ${String(index).padStart(3, "0")}`,
        organization_name: null,
        locality: "Testville",
        region: "CA",
        country_code: "US",
        source_slugs: stratum === "hyperbaric" ? ["hyperbaric_app"] : ["test_source"],
      });
      entityId += 1;
    }
  }
  return rows;
}

function buildExternalCalls(sampleRows: ReturnType<typeof buildSampleRows>) {
  const calls = [];
  let callId = 1;
  const seen = { hyperbaric: 0, hospital: 0, random: 0 };
  for (const row of sampleRows) {
    const stratum = row.payload.sample_stratum as keyof typeof seen;
    const cost = stratum === "hyperbaric" ? 0.001 : stratum === "hospital" ? 0.002 : 0.0005;
    calls.push(externalCall(callId++, "legitimacy_stage_1", cost));
    if (seen[stratum] < 10) {
      calls.push(externalCall(callId++, "legitimacy_stage_2", cost));
    }
    seen[stratum] += 1;
  }
  return calls;
}

function externalCall(id: number, callType: string, cost: number) {
  return {
    id: String(id),
    run_id: callType.endsWith("stage_1") ? "22" : "23",
    entity_id: null,
    call_type: callType,
    status: "ok",
    tokens: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    cost_estimate_usd: String(cost),
    created_at: new Date(2026, 6, 11, 12, 0, id).toISOString(),
  };
}

function allocatedEvidence(confidence: number, stratum: string) {
  const cost = stratum === "hyperbaric" ? 0.001 : stratum === "hospital" ? 0.002 : 0.0005;
  return {
    confidence,
    external_call_id: "allocated-batch-call",
    allocated_tokens: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    allocated_cost_usd: cost,
  };
}
