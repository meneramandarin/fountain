import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline intentionally uses native .mjs modules.
import * as redemption from "../pipeline/lib/legitimacy-redemption.mjs";

const {
  applyLegitimacyRedemptions,
  buildLegitimacyRedemptionCohort,
  LEGITIMACY_REDEMPTION_COHORT_SQL,
  loadLegitimacyRedemptionCohort,
  parseRedemptionResponse,
  renderLegitimacyRedemptionReport,
  runLegitimacyRedemptionPass,
} = redemption;

const OWNER = "pass1_gate_b_apply_run_52";

describe("suppression redemption cohort", () => {
  test("selects only website-unevidenced, non-hard-junk rows with owned suppression pairs", () => {
    const rows = [
      cohortRow(1, { name: "Alpha Longevity", locality: "Austin" }),
      cohortRow(2, {
        website: "https://bravo.example/",
        prior_gate_b_result: classifiedResult("plain_hospital", {
          stages: { stage_2: { website: { ok: true, title: "Bravo Clinic" } } },
        }),
      }),
      cohortRow(3, {
        result: classifiedResult("plain_hospital", {
          stages: { stage_2: { website: { ok: true, title: "Charlie Clinic" } } },
        }),
      }),
      cohortRow(4, {
        result: classifiedResult("junk", { rationale: "This is a retail store, not a clinic." }),
      }),
      cohortRow(5, {
        name: "Echo Recovery",
        locality: "Denver",
        result: classifiedResult("junk", { rationale: "Prior evidence was sparse and uncertain." }),
      }),
      cohortRow(6, { suppression_owners: ["unrelated_cleanup_run_1"] }),
    ];

    const cohort = buildLegitimacyRedemptionCohort(rows);

    expect(cohort.candidates.map((row: { locationId: number }) => row.locationId)).toEqual([1, 5]);
    expect(cohort.counts).toMatchObject({
      suppressedRowsRead: 6,
      candidates: 2,
      skippedWebsiteEvidenced: 2,
      skippedHardPositiveJunk: 1,
      skippedUnowned: 1,
    });
    expect(cohort.rows.find((row: { locationId: number }) => row.locationId === 4))
      .toMatchObject({ hardPositiveJunk: true, skipReason: "hard_positive_junk" });
  });

  test("uses a read-only query scoped to applied serving-write evidence campaigns", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toBe(LEGITIMACY_REDEMPTION_COHORT_SQL);
      expect(sql).toContain("result#>>'{suppression,status}' = 'applied'");
      expect(sql).toContain("result#>>'{serving_write,written}' = 'true'");
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/iu);
      expect(params).toEqual([["pass1_gate_b_dry_run", "pass1_stage3_full"]]);
      return { rows: [cohortRow(7)] };
    });

    await expect(loadLegitimacyRedemptionCohort({}, { query }))
      .resolves.toMatchObject({ counts: { candidates: 1 } });
  });
});

describe("agent-first Gemini redemption decision", () => {
  test("finishes all agent lookups before Gemini and redeems only guarded results at 0.75", async () => {
    const cohort = buildLegitimacyRedemptionCohort([
      cohortRow(11, { name: "Alpha Longevity", locality: "Austin" }),
      cohortRow(12, { name: "Beta Diagnostics", locality: "Boston" }),
    ]);
    const order: string[] = [];
    const agentLookup = vi.fn(async ({ locationId }: { locationId: number }) => {
      order.push(`agent:${locationId}`);
      return locationId === 11
        ? {
            officialWebsite: "https://alphalongevity.example/",
            title: "Alpha Longevity - Austin",
            description: "Consumer longevity care in Austin, Texas.",
            evidence: "Offers preventive longevity programs to consumers.",
            sources: [{ url: "https://alphalongevity.example/about", title: "About Alpha" }],
          }
        : {
            officialWebsite: "https://betadiagnostics.example/",
            title: "Beta Diagnostics - Boston",
            description: "Preventive diagnostics for consumers in Boston.",
            evidence: "Offers diagnostic programs for the well.",
            sources: [{ url: "https://betadiagnostics.example/", title: "Beta Diagnostics" }],
          };
    });
    const complete = vi.fn(async () => {
      order.push("gemini");
      expect(order.slice(0, 2).sort()).toEqual(["agent:11", "agent:12"]);
      return {
        content: JSON.stringify({
          results: [
            {
              location_id: 11,
              class: "in_scope",
              confidence: 0.8,
              basis: "consumer_wellness",
              positive_evidence: "Official site offers preventive longevity programs.",
              rationale: "Fresh official evidence reverses the earlier suppression.",
            },
            {
              location_id: 12,
              class: "destination_medical",
              confidence: 0.74,
              basis: "preventive_destination",
              positive_evidence: "Official site offers preventive diagnostics.",
              rationale: "Evidence is promising but below the redemption threshold.",
            },
          ],
        }),
        model: "google/gemini-3.5-flash",
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        costEstimateUsd: 0.001,
        externalCallId: 901,
        attempts: 1,
      };
    });

    const pass = await runLegitimacyRedemptionPass({
      cohort,
      runId: 70,
      agentLookup,
      batchSize: 2,
      concurrency: 2,
    }, { llmClient: { complete } });

    expect(order).toEqual(expect.arrayContaining(["agent:11", "agent:12", "gemini"]));
    expect(order.at(-1)).toBe("gemini");
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      tier: "escalation",
      callType: "legitimacy_redemption_escalation",
      reasoning: { effort: "medium", exclude: true },
    }));
    expect(pass.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locationId: 11,
        action: "redeem",
        class: "in_scope",
        officialWebsite: "https://alphalongevity.example/",
      }),
      expect.objectContaining({
        locationId: 12,
        action: "retain_suppressed",
        class: "review",
        normalizationFlags: ["below_redemption_threshold"],
      }),
    ]));
    expect(pass.counts).toMatchObject({ redeem: 1, retainSuppressed: 1, llmCalls: 1 });

    const report = renderLegitimacyRedemptionReport({ cohort, pass });
    expect(report).toContain("REDEMPTION PASS DRY RUN — NO SERVING WRITES");
    expect(report).toContain("Alpha Longevity");
    expect(report).toContain("https://alphalongevity.example/");
    expect(report).toContain("writes newly discovered blank-field websites through the field ledger");
  });

  test("fails closed on missing official-site evidence and invalid destination basis", () => {
    const parsed = parseRedemptionResponse(JSON.stringify({
      results: [
        {
          location_id: 21,
          class: "in_scope",
          confidence: 0.9,
          basis: "consumer_wellness",
          positive_evidence: "Claims wellness services.",
          rationale: "No validated official site accompanies the claim.",
        },
        {
          location_id: 22,
          class: "destination_medical",
          confidence: 0.9,
          basis: "ordinary_care",
          positive_evidence: "Provides surgery travel services.",
          rationale: "Treatment tourism is not preventive destination care.",
        },
      ],
    }), [21, 22], {
      officialWebsiteByLocation: new Map([[22, "https://example.test/"]]),
    });

    expect(parsed.get(21)).toMatchObject({
      class: "review",
      action: "retain_suppressed",
      normalizationFlags: ["missing_validated_official_website"],
    });
    expect(parsed.get(22)).toMatchObject({
      class: "review",
      action: "retain_suppressed",
      normalizationFlags: ["destination_without_preventive_basis"],
    });
  });
});

describe("guarded atomic redemption apply", () => {
  test("reactivates through recordWrite, deletes only actor-owned rows, and stamps rationale evidence", async () => {
    const decision = redemptionDecision();
    const pass = passResult([decision]);
    const tx = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("transaction_timestamp")) {
          return { rows: [{ applied_at: "2026-07-12T08:00:00.000Z" }] };
        }
        if (sql.includes("FOR UPDATE OF location")) return { rows: [{ id: 31 }], rowCount: 1 };
        if (sql.includes("AS target_count")) return { rows: [applyPreflight()] };
        if (sql.includes("COALESCE((SELECT hard_excluded FROM state)")) {
          return { rows: [locationApplyState()] };
        }
        if (sql.includes("DELETE FROM fountain_raw.suppressed_source_listings")) {
          expect(sql).toContain("suppressed.suppressed_by = $2");
          expect(params).toEqual([31, OWNER]);
          return { rows: [], rowCount: 2 };
        }
        if (sql.includes("UPDATE fountain.locations")) return { rows: [], rowCount: 1 };
        if (sql.includes("UPDATE fountain.entity_change_events")) {
          expect(sql).toContain("'rationale', $3::text");
          expect(params[2]).toBe(decision.rationale);
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("UPDATE fountain_ops.task_queue")) return { rows: [], rowCount: 1 };
        if (sql.includes("AS active_count")) {
          return { rows: [{
            active_count: 1,
            search_index_count: 1,
            event_count: 1,
            task_evidence_count: 1,
            status_ledger_count: 1,
            owned_suppression_rows_remaining: 0,
            suppression_ledger_after: 98,
          }] };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const recordWrite = vi.fn(async (options: {
      field: string;
      tx: typeof tx;
      mutate: (inner: typeof tx) => Promise<unknown>;
    }) => {
      expect(options.field).toBe("status");
      expect(options.tx).toBe(tx);
      return { written: true, result: await options.mutate(tx) };
    });
    const withTransaction = vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx));
    const setActor = vi.fn(async () => undefined);

    const applied = await applyLegitimacyRedemptions({
      pass,
      runId: 71,
      expectedRedemptionCount: 1,
    }, { withTransaction, setActor, recordWrite });

    expect(recordWrite).toHaveBeenCalledOnce();
    expect(setActor).toHaveBeenCalledWith(tx, expect.objectContaining({
      actorLabel: "pass1_redemption_apply_run_71",
    }));
    expect(applied).toMatchObject({
      apply: true,
      preflight: { ownedSuppressionCount: 2 },
      verification: { activeCount: 1, ownedSuppressionRowsRemaining: 0 },
      applied: [{ locationId: 31, deletedSuppressionRows: 2 }],
    });

    const report = renderLegitimacyRedemptionReport({
      cohort: cohortForDecision(decision),
      pass,
      apply: applied,
    });
    expect(report).toContain("REDEMPTION PASS COMPLETE");
    expect(report).toContain("Owned suppression rows deleted | 2 | 2");
    expect(report).toContain("Foreign suppression rows deleted | 0 | 0");
  });

  test("refuses low-confidence decisions before opening a transaction", async () => {
    const decision = { ...redemptionDecision(), confidence: 0.74 };
    const withTransaction = vi.fn();
    await expect(applyLegitimacyRedemptions({
      pass: passResult([decision]),
      runId: 72,
      expectedRedemptionCount: 1,
    }, { withTransaction })).rejects.toThrow("below the redemption threshold");
    expect(withTransaction).not.toHaveBeenCalled();
  });

  test("rolls back before recordWrite when ownership or hard-exclusion preflight fails", async () => {
    const pass = passResult([redemptionDecision()]);
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("transaction_timestamp")) {
          return { rows: [{ applied_at: "2026-07-12T08:00:00.000Z" }] };
        }
        if (sql.includes("FOR UPDATE OF location")) return { rows: [{ id: 31 }], rowCount: 1 };
        if (sql.includes("AS target_count")) {
          return { rows: [{
            ...applyPreflight(),
            hard_excluded_count: 1,
            owned_suppression_count: 1,
            foreign_suppression_count: 1,
          }] };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const recordWrite = vi.fn();
    const withTransaction = vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx));

    await expect(applyLegitimacyRedemptions({
      pass,
      runId: 73,
      expectedRedemptionCount: 1,
    }, {
      withTransaction,
      setActor: vi.fn(async () => undefined),
      recordWrite,
    })).rejects.toThrow(/hard_excluded=1.*foreign_suppressions=1/u);
    expect(recordWrite).not.toHaveBeenCalled();
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE fountain.locations")))
      .toBe(false);
  });

  test("refuses a forged redeem decision without validated agent evidence", async () => {
    const decision = {
      ...redemptionDecision(),
      agentLookup: {
        outcome: "official_website_not_validated",
        officialWebsite: "https://clinic31.example/",
        validation: { official: false },
      },
    };
    const withTransaction = vi.fn();
    await expect(applyLegitimacyRedemptions({
      pass: passResult([decision]),
      runId: 74,
      expectedRedemptionCount: 1,
    }, { withTransaction })).rejects.toThrow("lacks validated agent website evidence");
    expect(withTransaction).not.toHaveBeenCalled();
  });
});

function cohortRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    task_id: 1_000 + id,
    entity_id: id,
    payload: { campaign: "pass1_gate_b_dry_run", prompt_version: "pass1-legitimacy-v2" },
    result: classifiedResult("plain_hospital"),
    source_campaign: "pass1_gate_b_dry_run",
    source_prompt_version: "pass1-legitimacy-v2",
    org_id: null,
    name: `Clinic ${id}`,
    address: null,
    locality: "Testville",
    region: "CA",
    postal_code: null,
    country_code: "US",
    latitude: null,
    longitude: null,
    website: null,
    location_status: "hidden",
    deleted_at: null,
    organization_name: null,
    organization_website_domain: null,
    organization_description: null,
    source_slugs: ["test_source"],
    source_record_count: 1,
    suppression_row_count: 1,
    suppression_owners: [OWNER],
    offering_names: [],
    tags: [],
    external_place_matches: [],
    ...overrides,
  };
}

function classifiedResult(className: string, overrides: Record<string, unknown> = {}) {
  const { rationale, ...rest } = overrides;
  return {
    outcome: "classified",
    final: {
      class: className,
      confidence: 0.9,
      rationale: rationale || "Prior classification rationale.",
    },
    stages: { stage_1: {}, stage_2: null },
    suppression: { status: "applied", run_id: 52 },
    serving_write: { written: true, run_id: 52 },
    ...rest,
  };
}

function redemptionDecision() {
  return {
    locationId: 31,
    name: "Clinic 31",
    sourceTaskId: "1031",
    sourceCampaign: "pass1_gate_b_dry_run",
    suppressionOwner: OWNER,
    priorClass: "plain_hospital",
    priorRationale: "Prior evidence lacked a website.",
    class: "in_scope",
    confidence: 0.82,
    basis: "consumer_wellness",
    positiveEvidence: "Official site offers consumer longevity care.",
    rationale: "Independent lookup and Gemini confirm a consumer longevity clinic.",
    normalizationFlags: [],
    action: "redeem",
    officialWebsite: "https://clinic31.example/",
    agentLookup: {
      outcome: "official_website_validated",
      officialWebsite: "https://clinic31.example/",
      validation: { official: true },
    },
    model: "google/gemini-3.5-flash",
    externalCallId: "901",
  };
}

function passResult(decisions: ReturnType<typeof redemptionDecision>[]) {
  return {
    runId: "70",
    campaign: "pass1_stage3_redemption",
    promptVersion: "pass1-stage3-redemption-v1",
    confidenceThreshold: 0.75,
    decisions,
    calls: [],
    counts: {
      cohortCandidates: decisions.length,
      lookupAttempts: decisions.length,
      officialWebsites: decisions.length,
      llmCalls: 1,
      llmSubjects: decisions.length,
      redeem: decisions.length,
      redeemInScope: decisions.length,
      redeemDestinationMedical: 0,
      retainSuppressed: 0,
      spendUsd: 0.001,
    },
  };
}

function applyPreflight() {
  return {
    target_count: 1,
    hidden_count: 1,
    hard_excluded_count: 0,
    source_pair_count: 2,
    distinct_source_pair_count: 2,
    null_source_listing_count: 0,
    owned_suppression_count: 2,
    missing_suppression_count: 0,
    foreign_suppression_count: 0,
    shared_hidden_pair_count: 0,
    suppression_ledger_before: 100,
  };
}

function locationApplyState() {
  return {
    status: "hidden",
    deleted_at: null,
    hard_excluded: false,
    source_pair_count: 2,
    null_source_listing_count: 0,
    owned_suppression_count: 2,
    missing_suppression_count: 0,
    foreign_suppression_count: 0,
    shared_hidden_pair_count: 0,
  };
}

function cohortForDecision(decision: ReturnType<typeof redemptionDecision>) {
  return {
    candidates: [{ locationId: decision.locationId }],
    skipped: [],
    counts: {
      suppressedRowsRead: 1,
      candidates: 1,
      skipped: 0,
      skippedWebsiteEvidenced: 0,
      skippedHardPositiveJunk: 0,
      skippedUnowned: 0,
      skippedOther: 0,
    },
  };
}
