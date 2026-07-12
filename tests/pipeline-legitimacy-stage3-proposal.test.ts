import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import * as stage3Proposal from "../pipeline/lib/legitimacy-stage3-proposal.mjs";

const {
  buildLegitimacyStage3ProposalData,
  LEGITIMACY_STAGE3_EXPECTED_COUNTS,
  LEGITIMACY_STAGE3_PROPOSAL_ROWS_SQL,
  LEGITIMACY_STAGE3_PROPOSAL_SAMPLE_IDS,
  LEGITIMACY_STAGE3_PROPOSAL_SEED,
  loadLegitimacyStage3ProposalData,
  renderLegitimacyStage3Proposal,
} = stage3Proposal;

const EXACT_SAMPLE_IDS = [
  9390,
  1827,
  13641,
  13585,
  14026,
  313,
  9408,
  9441,
  9428,
  9398,
  2698,
  9979,
  5032,
  9092,
  3402,
  2038,
  7203,
  2001,
  6830,
  327,
  13306,
  7955,
  2061,
  2113,
  7774,
  4043,
  12618,
  3730,
  1474,
  7540,
  13072,
  9004,
  1877,
  12367,
  9765,
  1331,
  11673,
  11649,
  11658,
  11669,
  1631,
  12742,
  2216,
  1723,
  1706,
  8627,
  10344,
  9579,
  10295,
  5178,
];

describe("Stage 3 legitimacy proposal evidence", () => {
  test("exposes the exact fixed 50-row sample and AAI reference first", () => {
    expect(LEGITIMACY_STAGE3_PROPOSAL_SEED).toBe("pass1-stage3-proposal-v1");
    expect(LEGITIMACY_STAGE3_PROPOSAL_SAMPLE_IDS).toEqual(EXACT_SAMPLE_IDS);
    expect(LEGITIMACY_STAGE3_PROPOSAL_SAMPLE_IDS).toHaveLength(50);
    expect(new Set(LEGITIMACY_STAGE3_PROPOSAL_SAMPLE_IDS).size).toBe(50);
    expect(LEGITIMACY_STAGE3_PROPOSAL_SAMPLE_IDS[0]).toBe(9390);
    expect(Object.isFrozen(LEGITIMACY_STAGE3_PROPOSAL_SAMPLE_IDS)).toBe(true);
  });

  test("reconciles 2,156 review rows into 1,187 pooled subjects", () => {
    const data = buildLegitimacyStage3ProposalData(exactCohortRows());

    expect(data.counts).toEqual({
      reviewRows: 2_156,
      rawReviewRows: 1_704,
      subjects: 1_187,
      organizationSubjects: 1_133,
      organizationRows: 2_102,
      standaloneSubjects: 54,
      standaloneRows: 54,
      organizationConflictSubjects: 62,
      organizationConflictRows: 723,
    });
    expect(data.sampleRows.map((row: { locationId: number }) => row.locationId)).toEqual(EXACT_SAMPLE_IDS);
    expect(new Set(
      data.sampleRows.map((row: { classificationKey: string }) => row.classificationKey),
    ).size).toBe(50);
    expect(data.servingWrites).toEqual({ attempted: 0, written: 0 });
  });

  test("pools every branch and preserves organization-conflict evidence", () => {
    const data = buildLegitimacyStage3ProposalData(exactCohortRows());
    const conflicts = data.subjects.filter((subject: { organizationConflict: boolean }) => (
      subject.organizationConflict
    ));

    expect(conflicts).toHaveLength(62);
    expect(conflicts.reduce((sum: number, subject: { locationIds: number[] }) => (
      sum + subject.locationIds.length
    ), 0)).toBe(723);

    const subject = conflicts[0];
    expect(subject.classificationLevel).toBe("organization");
    expect(subject.priorClasses).toEqual(["review", "in_scope"]);
    expect(subject.branches).toHaveLength(subject.locationIds.length);
    expect(subject.pooledEvidence.offeringNames).toHaveLength(subject.locationIds.length);
    expect(subject.pooledEvidence.sourceSlugs).toHaveLength(subject.locationIds.length);
    expect(subject.branches.every((branch: { priorGateB: { class: string } }) => (
      ["review", "in_scope"].includes(branch.priorGateB.class)
    ))).toBe(true);
  });

  test("loads through one SELECT-only query and validates the frozen cohort", async () => {
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      void sql;
      void params;
      return { rows: exactCohortRows() };
    });
    const data = await loadLegitimacyStage3ProposalData({}, { query });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toBe(LEGITIMACY_STAGE3_PROPOSAL_ROWS_SQL);
    expect(sql).toMatch(/^\s*WITH\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i);
    expect(params).toEqual(["pass1_gate_b_dry_run", "pass1-legitimacy-v2"]);
    expect(data.counts).toMatchObject(LEGITIMACY_STAGE3_EXPECTED_COUNTS_TO_DATA);
  });

  test("renders zero-write evidence and requires AAI to be actually in_scope", () => {
    const data = buildLegitimacyStage3ProposalData(exactCohortRows());
    const sampleResults = proposalSampleResults(data.sampleRows);
    const markdown = renderLegitimacyStage3Proposal({
      data,
      sampleResults,
      model: MODEL_PLAN,
      projection: PROJECTION,
      discoveryPlan: DISCOVERY_PLAN,
      confidenceThreshold: 0.9,
    });

    expect(markdown).toContain("**ZERO SERVING WRITES:**");
    expect(markdown).toContain("Effective Gate B review rows | 2,156");
    expect(markdown).toContain("Classification subjects | 1,187");
    expect(markdown).toContain("Organization-conflict rows | 723");
    expect(markdown).toContain("Expected class: `in_scope`");
    expect(markdown).toContain("Actual final dry-run class: `in_scope`");
    expect(markdown).toContain("https://www.aaiclinics.com/");
    expect(markdown).toContain("Serving writes attempted/written: 0/0");
    expect(markdown).toContain("**EXECUTION AUTHORIZED — continue under the final standing orders.**");
    expect(markdown.match(/^\| \d+ \| \d+ \|/gm)).toHaveLength(50);

    const wrongAai = sampleResults.map((result) => (
      result.locationId === 9390 ? { ...result, class: "review" } : result
    ));
    expect(() => renderLegitimacyStage3Proposal({
      data,
      sampleResults: wrongAai,
      model: MODEL_PLAN,
      projection: PROJECTION,
      discoveryPlan: DISCOVERY_PLAN,
    })).toThrow(/AAI Rejuvenation.*must resolve to in_scope/);
  });

  test("refuses to claim zero writes without explicit per-result evidence", () => {
    const data = buildLegitimacyStage3ProposalData(exactCohortRows());
    const sampleResults = proposalSampleResults(data.sampleRows);
    sampleResults[3] = { ...sampleResults[3], servingWriteAttempted: true };

    expect(() => renderLegitimacyStage3Proposal({
      data,
      sampleResults,
      model: MODEL_PLAN,
      projection: PROJECTION,
      discoveryPlan: DISCOVERY_PLAN,
    })).toThrow(/lacks zero-serving-write evidence/);
  });
});

const LEGITIMACY_STAGE3_EXPECTED_COUNTS_TO_DATA = {
  reviewRows: LEGITIMACY_STAGE3_EXPECTED_COUNTS.gateBReviewRows,
  rawReviewRows: LEGITIMACY_STAGE3_EXPECTED_COUNTS.rawReviewRows,
  subjects: LEGITIMACY_STAGE3_EXPECTED_COUNTS.subjects,
  organizationSubjects: LEGITIMACY_STAGE3_EXPECTED_COUNTS.organizationSubjects,
  organizationRows: LEGITIMACY_STAGE3_EXPECTED_COUNTS.organizationRows,
  standaloneSubjects: LEGITIMACY_STAGE3_EXPECTED_COUNTS.standaloneSubjects,
  standaloneRows: LEGITIMACY_STAGE3_EXPECTED_COUNTS.standaloneRows,
  organizationConflictSubjects: LEGITIMACY_STAGE3_EXPECTED_COUNTS.organizationConflictSubjects,
  organizationConflictRows: LEGITIMACY_STAGE3_EXPECTED_COUNTS.organizationConflictRows,
};

const MODEL_PLAN = {
  id: "x-ai/grok-4.20",
  tier: "escalation",
  reasoning: "medium",
  inputUsdPerMillion: 1.25,
  outputUsdPerMillion: 2.5,
};

const PROJECTION = {
  inputTokens: 782_789,
  outputTokens: 166_180,
  modelCostUsd: 1.394,
  placesCostUsd: 1.2,
  webSearchCostUsd: 0.3,
  totalCostUsd: 3.5,
  budgetUsd: 5,
};

const DISCOVERY_PLAN = {
  missingLocationWebsites: 60,
  existingProviderIds: 11,
  textSearchCandidates: 49,
  placesUnitCostUsd: 0.02,
  placesMaxCostUsd: 1.2,
  webSearchFallback: "OpenRouter openrouter:web_search with Exa, maximum three results",
  ledgerGuard: "fountain_ops.field_status recordWrite()",
};

type FixtureRow = ReturnType<typeof fixtureRow>;

function exactCohortRows() {
  const rows: FixtureRow[] = [];
  const usedIds = new Set(EXACT_SAMPLE_IDS);
  let nextLocationId = 100_000;
  let taskId = 1;

  const fillerId = () => {
    while (usedIds.has(nextLocationId)) nextLocationId += 1;
    const id = nextLocationId;
    usedIds.add(id);
    nextLocationId += 1;
    return id;
  };

  // 1,071 non-conflicting organization subjects covering 1,379 rows.
  for (let subjectIndex = 0; subjectIndex < 1_071; subjectIndex += 1) {
    const size = subjectIndex < 308 ? 2 : 1;
    const orgId = subjectIndex === 0 ? 4_308 : 50_000 + subjectIndex;
    for (let branchIndex = 0; branchIndex < size; branchIndex += 1) {
      const sampleId = branchIndex === 0 ? EXACT_SAMPLE_IDS[subjectIndex] : undefined;
      const locationId = sampleId ?? fillerId();
      if (sampleId !== undefined) usedIds.add(sampleId);
      rows.push(fixtureRow({
        taskId: taskId++,
        locationId,
        orgId,
        rawClass: "review",
        branchIndex,
      }));
    }
  }

  // 62 organization-conflict subjects covering 723 rows. Exactly 271 of
  // those rows are raw review, leaving 452 confident sibling classifications.
  let remainingConflictReviews = 271;
  for (let subjectIndex = 0; subjectIndex < 62; subjectIndex += 1) {
    const size = subjectIndex < 61 ? 11 : 52;
    const orgId = 70_000 + subjectIndex;
    const reviewCount = Math.min(size - 1, Math.max(1, remainingConflictReviews - (61 - subjectIndex)));
    remainingConflictReviews -= reviewCount;
    for (let branchIndex = 0; branchIndex < size; branchIndex += 1) {
      rows.push(fixtureRow({
        taskId: taskId++,
        locationId: fillerId(),
        orgId,
        rawClass: branchIndex < reviewCount ? "review" : "in_scope",
        branchIndex,
        organizationConflict: true,
      }));
    }
  }
  expect(remainingConflictReviews).toBe(0);

  // 54 standalone review subjects/rows.
  for (let index = 0; index < 54; index += 1) {
    rows.push(fixtureRow({
      taskId: taskId++,
      locationId: fillerId(),
      orgId: null,
      rawClass: "review",
      branchIndex: index,
    }));
  }

  return rows;
}

function fixtureRow({
  taskId,
  locationId,
  orgId,
  rawClass,
  branchIndex,
  organizationConflict = false,
}: {
  taskId: number;
  locationId: number;
  orgId: number | null;
  rawClass: "review" | "in_scope";
  branchIndex: number;
  organizationConflict?: boolean;
}) {
  const classificationLevel = orgId == null ? "location" : "organization";
  const classificationKey = `${classificationLevel}:${orgId ?? locationId}`;
  const isAai = locationId === 9390;
  return {
    task_id: taskId,
    entity_id: locationId,
    task_status: "done",
    payload: {
      campaign: "pass1_gate_b_dry_run",
      prompt_version: "pass1-legitimacy-v2",
      classification_level: classificationLevel,
      classification_key: classificationKey,
    },
    result: {
      outcome: "classified",
      final: {
        class: rawClass,
        confidence: rawClass === "review" ? 0.8 : 0.95,
        rationale: rawClass === "review" ? "Needs stronger evidence." : "Consumer wellness care is explicit.",
      },
      stages: {
        stage_1: { normalization_flags: rawClass === "review" ? ["fixture_review"] : [] },
        stage_2: null,
      },
    },
    raw_class: rawClass,
    org_id: orgId,
    name: isAai ? "AAI Rejuvenation" : `Location ${locationId}`,
    address: isAai ? null : `${branchIndex} Example Street`,
    locality: isAai ? "Fort Lauderdale" : "Example City",
    region: isAai ? "FL" : "CA",
    postal_code: isAai ? null : "00000",
    country_code: "US",
    latitude: null,
    longitude: null,
    website: null,
    organization_name: isAai ? "AAI Rejuvenation" : `Organization ${orgId ?? locationId}`,
    organization_website_domain: null,
    organization_description: null,
    source_slugs: [`source-${locationId}`],
    offering_names: [`Offering ${locationId}`],
    tags: [{ facet: "fixture", value: `tag-${locationId}` }],
    external_place_matches: [],
    organization_conflict: organizationConflict,
    conflict_classes: organizationConflict ? ["in_scope", "review"] : [],
  };
}

function proposalSampleResults(sampleRows: Array<{ locationId: number }>) {
  return sampleRows.map((row) => ({
    locationId: row.locationId,
    class: "in_scope",
    confidence: row.locationId === 9390 ? 0.99 : 0.93,
    rationale: row.locationId === 9390
      ? "Official site offers anti-aging, hormone, peptide, BHRT, and weight-management programs."
      : "Supplied pooled evidence establishes elective consumer wellness care.",
    discoveryOutcome: row.locationId === 9390 ? "web_search_official_match" : "stored_website",
    wouldWriteWebsite: row.locationId === 9390 ? "https://www.aaiclinics.com/" : null,
    servingWriteAttempted: false,
    servingWritten: false,
  }));
}
