import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import * as stage3Execute from "../pipeline/lib/legitimacy-stage3-execute.mjs";

const { assertFailureRate, executeLegitimacyStage3Full } = stage3Execute;

describe("Stage 3 full executor", () => {
  test("runs agent-first discovery and one pooled result per subject without writes in preview", async () => {
    const data = fixtureData();
    const discoverWebsite = vi.fn(async () => ({
      location_id: 9390,
      outcome: "official_website_found",
      source: "web_search",
      would_write_website: "https://www.aaiclinics.com/",
      validation: { official: true, domain: "aaiclinics.com" },
      attempts: [{ source: "web_search", outcome: "accepted" }],
      write_attempted: false,
      database_mutated: false,
    }));
    const llmClient = {
      complete: vi.fn(async ({ messages }: { messages: Array<{ content: string }> }) => {
        const input = JSON.parse(messages[1]!.content);
        const results = input.subjects.map((subject: { classification_key: string }) => ({
          classification_key: subject.classification_key,
          class: subject.classification_key === "organization:4308" ? "in_scope" : "plain_hospital",
          confidence: 0.95,
          basis: subject.classification_key === "organization:4308" ? "consumer_wellness" : "ordinary_care",
          positive_evidence: "Affirmative supplied evidence.",
          rationale: "Evidence-backed classification.",
        }));
        return {
          content: JSON.stringify({ results }),
          model: "google/gemini-3.5-flash",
          externalCallId: "90",
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          costEstimateUsd: 0.001,
          attempts: 1,
        };
      }),
    };
    const result = await executeLegitimacyStage3Full({
      data,
      runId: 90,
      webSearch: vi.fn(),
      apply: false,
      concurrency: 24,
      batchSize: 2,
      expectedCounts: { reviewRows: 2, subjects: 2 },
      expectedBlankWebsiteCount: 1,
    }, {
      llmClient,
      placesClient: {},
      webClient: { fetchHomepage: vi.fn(async () => ({ ok: true, title: "AAI", textExcerpt: "Fort Lauderdale" })) },
      discoverWebsite,
      query: vi.fn(async () => ({ rows: [] })),
    });

    expect(discoverWebsite).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      counts: {
        cohortRows: 2,
        subjects: 2,
        keepRows: 1,
        suppressionRows: 1,
        humanReviewRows: 0,
        discoveryRows: 1,
      },
      persistence: { applied: false, tasksInserted: 0 },
    });
    expect(result.subjectResults.find((item: { classificationKey: string }) => (
      item.classificationKey === "organization:4308"
    ))).toMatchObject({ class: "in_scope" });
  });

  test("halts only when a complete rolling 500-task window exceeds 25 percent failures", () => {
    const safe = Array.from({ length: 500 }, (_, index) => ({ providerFailure: index < 125 }));
    const unsafe = Array.from({ length: 500 }, (_, index) => ({ providerFailure: index < 126 }));
    expect(assertFailureRate(safe)).toBe(true);
    expect(() => assertFailureRate(unsafe)).toThrow(/rolling failure rate exceeded/);
    expect(assertFailureRate([{ providerFailure: true }])).toBe(true);
  });
});

function fixtureData() {
  const aaiBranch = branch(9390, "AAI Rejuvenation", "", []);
  const hospitalBranch = branch(2, "Ordinary Hospital", "https://hospital.example/", []);
  return {
    counts: { reviewRows: 2, subjects: 2 },
    rows: [{ locationId: 9390 }, { locationId: 2 }],
    subjects: [
      subject("organization:4308", 4308, aaiBranch),
      subject("organization:2", 2, hospitalBranch),
    ],
  };
}

function subject(classificationKey: string, orgId: number, value: ReturnType<typeof branch>) {
  return {
    classificationKey,
    classificationLevel: "organization",
    orgId,
    organizationEvidence: { name: value.name, websiteDomain: "", description: "" },
    organizationConflict: false,
    priorClasses: ["review"],
    normalizationFlags: [],
    locationIds: [value.locationId],
    branches: [value],
    pooledEvidence: { sourceSlugs: ["source"], offeringNames: [], tags: [], websites: [] },
  };
}

function branch(locationId: number, name: string, website: string, externalPlaceMatches: unknown[]) {
  return {
    locationId,
    name,
    address: "1 Main Street",
    locality: "Fort Lauderdale",
    region: "FL",
    postalCode: "33301",
    countryCode: "US",
    website,
    sourceSlugs: ["source"],
    offeringNames: [],
    tags: [],
    externalPlaceMatches,
    priorGateB: { class: "review", confidence: 0.5, rationale: "Unclear." },
    websiteEvidence: null,
  };
}
