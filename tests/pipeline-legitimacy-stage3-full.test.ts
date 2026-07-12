import { describe, expect, test } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import * as stage3Full from "../pipeline/lib/legitimacy-stage3-full.mjs";

const {
  buildLegitimacyStage3FullCommands,
  buildLegitimacyStage3FullPlan,
  LEGITIMACY_STAGE3_DISCOVERY_ORDER,
  LEGITIMACY_STAGE3_FULL_CONFIDENCE_THRESHOLD,
  LEGITIMACY_STAGE3_FULL_CONCURRENCY,
  LEGITIMACY_STAGE3_FULL_PREREQUISITES,
  renderLegitimacyStage3FullReport,
  renderLegitimacyStage3HumanReview,
} = stage3Full;

const EXPECTED_COUNTS = { reviewRows: 6, subjects: 5 };

describe("Stage 3 full-cohort planner", () => {
  test("partitions every row at 0.75 and fans one pooled organization verdict out", () => {
    const plan = buildPlan();

    expect(LEGITIMACY_STAGE3_FULL_CONFIDENCE_THRESHOLD).toBe(0.75);
    expect(LEGITIMACY_STAGE3_FULL_CONCURRENCY).toBe(24);
    expect(plan.confidenceThreshold).toBe(0.75);
    expect(plan.concurrency).toBe(24);
    expect(plan.counts).toMatchObject({
      cohortRows: 6,
      subjects: 5,
      keepRows: 2,
      suppressionRows: 1,
      humanReviewRows: 3,
      taskResolutionPlans: 6,
    });
    expect(plan.counts.classCountsBySubject).toEqual({
      junk: 2,
      plain_hospital: 1,
      review: 0,
      destination_medical: 1,
      in_scope: 1,
      invalid: 0,
    });
    expect(plan.counts.classCountsByRow.plain_hospital).toBe(2);
    expect(plan.reconciliation).toMatchObject({
      valid: true,
      cohortRows: 6,
      partitionRows: 6,
      taskResolutionRows: 6,
      subjectResults: 5,
    });

    const pooled = plan.subjectPlans.find((item: { classificationKey: string }) => (
      item.classificationKey === "organization:1"
    ));
    expect(pooled).toMatchObject({
      evidencePooledAcrossAllLocations: true,
      locationIds: [1, 2],
      rawClass: "plain_hospital",
      disposition: "mixed_suppress_and_review",
    });
    expect(plan.suppressionCandidates.map((item: { locationId: number }) => item.locationId))
      .toEqual([1]);
    expect(plan.humanReviewRows.find((item: { locationId: number }) => item.locationId === 2))
      .toMatchObject({
        rawClass: "plain_hospital",
        reviewReasons: ["hard_exclusion", "hard_exclusion:protected_system"],
        staysActive: true,
      });
  });

  test("resolves keep tasks and holds below-threshold or invalid-basis results", () => {
    const plan = buildPlan();
    const inScope = plan.taskResolutionPlans.find((item: { locationId: number }) => (
      item.locationId === 3
    ));
    const belowThreshold = plan.taskResolutionPlans.find((item: { locationId: number }) => (
      item.locationId === 4
    ));
    const invalidJunk = plan.taskResolutionPlans.find((item: { locationId: number }) => (
      item.locationId === 5
    ));

    expect(inScope).toMatchObject({
      queueStatus: "done",
      resultOutcome: "classified",
      finalClass: "in_scope",
      resolution: "keep",
      suppressionEligible: false,
      servingWrite: { attempted: false, written: false },
    });
    expect(belowThreshold).toMatchObject({
      finalClass: "review",
      proposedClass: "junk",
      resolution: "needs_human_review",
      reviewReasons: ["below_confidence_threshold"],
    });
    expect(invalidJunk).toMatchObject({
      finalClass: "review",
      proposedClass: "junk",
      reviewReasons: ["junk_without_affirmative_basis"],
    });
  });

  test("plans only verified null-field website writes with ledger guards", () => {
    const plan = buildPlan();

    expect(LEGITIMACY_STAGE3_DISCOVERY_ORDER).toEqual([
      "stored_provider_id_contact_details_exception",
      "agent_web_search",
      "places_search_then_contact_details_fallback",
    ]);
    expect(plan.websiteWritePlans.map((item: { locationId: number }) => item.locationId))
      .toEqual([1, 3, 4]);
    expect(plan.websiteWritePlans[0]).toMatchObject({
      locationId: 1,
      website: "https://one.example/",
      source: "web_search",
      ledgerGuard: {
        entityType: "location",
        field: "website",
        expectedCurrentValue: null,
        lockLocationRow: true,
        recheckBlankAfterLock: true,
        recordWriteRequired: true,
      },
      applyAttempted: false,
      databaseMutated: false,
    });
    expect(plan.websiteWriteSkips).toEqual([
      {
        locationId: 2,
        website: "https://replacement.example/",
        reason: "stored_website_present",
      },
    ]);
  });

  test("rejects Places-first discovery when no provider id is stored", () => {
    const discoveryResults = discoveries();
    discoveryResults[0] = {
      ...discoveryResults[0],
      attempts: [
        { source: "google_places_search", outcome: "place_id_found" },
        { source: "google_places", outcome: "accepted" },
        { source: "web_search", outcome: "no_results" },
      ],
    };

    expect(() => buildLegitimacyStage3FullPlan({
      data: cohort(),
      subjectResults: results(),
      discoveryResults,
      hardExclusions: [{ locationId: 2, reason: "protected_system" }],
      expectedCounts: EXPECTED_COUNTS,
    })).toThrow(/violated agent-first ordering/);
  });

  test("requires exactly one result per pooled subject", () => {
    const missing = results().slice(0, -1);
    expect(() => buildLegitimacyStage3FullPlan({
      data: cohort(),
      subjectResults: missing,
      expectedCounts: EXPECTED_COUNTS,
    })).toThrow(/subject results do not reconcile/);

    const duplicate = [...results(), results()[0]];
    expect(() => buildLegitimacyStage3FullPlan({
      data: cohort(),
      subjectResults: duplicate,
      expectedCounts: EXPECTED_COUNTS,
    })).toThrow(/Duplicate Stage 3 result/);
  });

  test("renders explicit dry-run evidence, human rows, and future commands", () => {
    const plan = buildPlan();
    const report = renderLegitimacyStage3FullReport(plan, {
      model: {
        id: "google/gemini-3.5-flash",
        inputUsdPerMillion: 1.5,
        outputUsdPerMillion: 9,
      },
      projectedCost: {
        inputTokens: 1_600_000,
        outputTokens: 604_000,
        modelUsd: 7.84,
        providerUsd: 1.5,
        totalUsd: 9.34,
        budgetUsd: 12,
      },
    });
    const human = renderLegitimacyStage3HumanReview(plan);
    const commands = buildLegitimacyStage3FullCommands({
      runId: 88,
      budgetUsd: 12,
      suppressionCount: 1,
    });

    expect(report).toContain("**NOT APPLIED:**");
    expect(report).toContain("confidence threshold: 0.75; concurrency: 24");
    expect(report).toContain("Row partition: 2 + 1 + 3 = 6 (reconciled)");
    expect(report).toContain("use agent web search first");
    expect(report).toContain("Database apply executed: no");
    expect(human.match(/^\| [245] \|/gm)).toHaveLength(3);
    expect(human).toContain("below_confidence_threshold");
    expect(commands.drain).toBe(
      "PLACES_LIVE=1 node pipeline/cli.mjs drain --task legitimacy_check --stage stage_3 --campaign pass1_stage3_full --prompt-version pass1-legitimacy-v3-full --concurrency 24 --budget 12 --apply",
    );
    expect(commands.suppressPreview).toContain("--expected 1 --dry-run");
    expect(commands.requiresCliWiring).toBe(true);
    expect(LEGITIMACY_STAGE3_FULL_PREREQUISITES).toContain(
      "Resolve keep-class tasks without changing serving visibility; hold review/invalid/below-threshold rows for humans.",
    );
  });
});

function buildPlan() {
  return buildLegitimacyStage3FullPlan({
    data: cohort(),
    subjectResults: results(),
    discoveryResults: discoveries(),
    hardExclusions: [{ locationId: 2, reason: "protected_system" }],
    expectedCounts: EXPECTED_COUNTS,
  });
}

function cohort() {
  const subjects = [
    subject("organization:1", "organization", [
      branch(1, "Ordinary Care North"),
      branch(2, "Ordinary Care South", {
        website: "https://stored.example/",
      }),
    ], { orgId: 1, organizationConflict: true }),
    subject("organization:2", "organization", [
      branch(3, "Wellness Group", {
        externalPlaceMatches: [{
          provider: "google_places",
          provider_place_id: "stored-place-3",
        }],
      }),
    ], { orgId: 2 }),
    subject("location:4", "location", [branch(4, "Weak Junk Result")]),
    subject("location:5", "location", [branch(5, "Bad Junk Basis")]),
    subject("location:6", "location", [branch(6, "Preventive Retreat")]),
  ];
  return {
    counts: { reviewRows: 6, subjects: 5 },
    subjects,
  };
}

function subject(
  classificationKey: string,
  classificationLevel: "organization" | "location",
  branches: ReturnType<typeof branch>[],
  options: { orgId?: number; organizationConflict?: boolean } = {},
) {
  return {
    classificationKey,
    classificationLevel,
    orgId: options.orgId ?? null,
    organizationConflict: options.organizationConflict ?? false,
    locationIds: branches.map((item) => item.locationId),
    branches,
    organizationEvidence: {},
    pooledEvidence: {},
  };
}

function branch(
  locationId: number,
  name: string,
  options: {
    website?: string;
    externalPlaceMatches?: Array<Record<string, unknown>>;
  } = {},
) {
  return {
    locationId,
    name,
    website: options.website ?? "",
    externalPlaceMatches: options.externalPlaceMatches ?? [],
  };
}

function results() {
  return [
    result("organization:1", "plain_hospital", 0.8, "ordinary_care"),
    result("organization:2", "in_scope", 0.75, "consumer_wellness"),
    result("location:4", "junk", 0.74, "non_wellness_business"),
    result("location:5", "junk", 0.9, "insufficient"),
    result("location:6", "destination_medical", 0.9, "preventive_destination"),
  ];
}

function result(
  classificationKey: string,
  className: string,
  confidence: number,
  basis: string,
) {
  return {
    classificationKey,
    class: className,
    confidence,
    basis,
    positiveEvidence: `${classificationKey} has affirmative evidence.`,
    rationale: `${classificationKey} rationale.`,
    model: "google/gemini-3.5-flash",
    externalCallId: `call-${classificationKey}`,
  };
}

function discoveries() {
  return [
    discovery(1, "https://one.example/", "web_search", [
      { source: "web_search", outcome: "accepted" },
    ]),
    discovery(2, "https://replacement.example/", "web_search", [
      { source: "web_search", outcome: "accepted" },
    ]),
    discovery(3, "https://three.example/", "google_places", [
      { source: "google_places", outcome: "accepted", provider_id_source: "stored_match" },
    ]),
    discovery(4, "https://four.example/", "google_places", [
      { source: "web_search", outcome: "no_results" },
      { source: "google_places_search", outcome: "place_id_found" },
      { source: "google_places", outcome: "accepted", provider_id_source: "text_search" },
    ]),
  ];
}

function discovery(
  locationId: number,
  website: string,
  source: string,
  attempts: Array<Record<string, unknown>>,
) {
  return {
    location_id: locationId,
    outcome: "official_website_found",
    source,
    would_write_website: website,
    validation: { official: true, reason: "official_evidence_match" },
    attempts,
    write_attempted: false,
    database_mutated: false,
  };
}
