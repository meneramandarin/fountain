import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline runtime intentionally uses native .mjs modules.
import { createLegitimacyBatchHandler, LEGITIMACY_LOCATION_INPUT_SQL, parseLegitimacyResponse } from "../pipeline/tasks/legitimacy.mjs";

type MockLlmRequest = {
  callType: string;
  messages: Array<{ content: string }>;
  model?: string;
  responseFormat: {
    json_schema: {
      strict: boolean;
      schema: { additionalProperties: boolean };
    };
  };
};

describe("Pass 1 legitimacy classifier", () => {
  test("normalizes strict structured output and fails closed on an id-set mismatch", () => {
    const valid = parseLegitimacyResponse(JSON.stringify({
      results: [{
        location_id: 101,
        class: "plain_hospital",
        confidence: 0.94,
        rationale: Array.from({ length: 30 }, (_, index) => `word${index + 1}`).join(" "),
      }],
    }), [101]);

    expect(valid.get(101)).toMatchObject({
      class: "plain_hospital",
      confidence: 0.94,
      normalization_flags: ["rationale_truncated"],
    });
    expect(valid.get(101).rationale.split(/\s+/u)).toHaveLength(25);

    const mismatched = parseLegitimacyResponse(JSON.stringify({
      results: [
        { location_id: 101, class: "junk", confidence: 0.99, rationale: "Retail store." },
        { location_id: 999, class: "junk", confidence: 0.99, rationale: "Unknown row." },
      ],
    }), [101, 102]);
    expect([...mismatched.values()]).toEqual([
      expect.objectContaining({ class: "review", confidence: 0, normalization_flags: ["id_set_mismatch"] }),
      expect.objectContaining({ class: "review", confidence: 0, normalization_flags: ["id_set_mismatch"] }),
    ]);
  });

  test("loads only the specified capped evidence and enforces every hard-exclusion source in SQL", () => {
    expect(LEGITIMACY_LOCATION_INPUT_SQL).toContain("unnest($1::integer[])");
    expect(LEGITIMACY_LOCATION_INPUT_SQL).toContain("LIMIT 15");
    expect(LEGITIMACY_LOCATION_INPUT_SQL).toContain("LIMIT 30");
    expect(LEGITIMACY_LOCATION_INPUT_SQL).toContain("l.owner_account_id IS NOT NULL");
    expect(LEGITIMACY_LOCATION_INPUT_SQL).toContain("l.data_origin IN ('owner', 'manual')");
    expect(LEGITIMACY_LOCATION_INPUT_SQL).toContain("l.verification_status IN ('human_verified', 'owner_verified')");
    expect(LEGITIMACY_LOCATION_INPUT_SQL).toContain("claim.status = 'approved'");
    expect(LEGITIMACY_LOCATION_INPUT_SQL).toContain("field_status.locked");
    expect(LEGITIMACY_LOCATION_INPUT_SQL).toContain("field_status.verification IN ('human_verified', 'owner_verified')");
  });

  test("completes a confident Stage 1 result using only the default tier and never writes serving state", async () => {
    const llmClient = llmResponse(101, "junk", 0.91, "Retail pharmacy, not a wellness destination.");
    const query = vi.fn(async (_sql: string, params: unknown[]) => {
      expect(params).toEqual([[101]]);
      return { rows: [databaseRow(101)] };
    });
    const handler = createLegitimacyBatchHandler({
      query,
      llmClient,
      webClient: unusedWebClient(),
      now: () => new Date("2026-07-11T20:00:00.000Z"),
    });

    const [outcome] = await handler({
      tasks: [stage1Task(101)],
      run: { id: "700" },
      stage: "stage_1",
    });

    expect(outcome).toMatchObject({
      taskId: "task-101",
      disposition: "complete",
      result: {
        outcome: "classified",
        final: { class: "junk", confidence: 0.91, proposed_action: "suppress" },
        suppression_eligible: true,
        serving_write: { attempted: false, written: false },
      },
    });
    expect(llmClient.complete).toHaveBeenCalledWith(expect.objectContaining({
      runId: "700",
      entityId: null,
      tier: "default",
      callType: "legitimacy_stage_1",
      temperature: 0,
      responseFormat: expect.objectContaining({ type: "json_schema" }),
    }));
    const request = llmClient.complete.mock.calls[0]![0];
    expect(request.model).toBeUndefined();
    expect(request.responseFormat.json_schema.strict).toBe(true);
    expect(request.responseFormat.json_schema.schema.additionalProperties).toBe(false);
  });

  test("checkpoints a low-confidence Stage 1 result in the same task payload", async () => {
    const llmClient = llmResponse(102, "in_scope", 0.62, "Signals are incomplete without the website.");
    const handler = createLegitimacyBatchHandler({
      query: queryRows([databaseRow(102)]),
      llmClient,
      webClient: unusedWebClient(),
    });

    const [outcome] = await handler({
      tasks: [stage1Task(102)],
      run: { id: "701" },
      stage: "stage_1",
    });

    expect(outcome).toMatchObject({
      taskId: "task-102",
      disposition: "defer",
      payload: {
        campaign: "pass1_gate_a",
        stage: "stage_2",
        stage_1: {
          class: "in_scope",
          confidence: 0.62,
          run_id: "701",
          external_call_id: "call-1",
        },
      },
    });
  });

  test("hard exclusions complete without an LLM or website call", async () => {
    const llmClient = { complete: vi.fn() };
    const webClient = unusedWebClient();
    const handler = createLegitimacyBatchHandler({
      query: queryRows([databaseRow(103, {
        hard_exclusion_reasons: ["approved_clinic_claim", "protected_field_status"],
      })]),
      llmClient,
      webClient,
    });

    const [outcome] = await handler({
      tasks: [stage1Task(103)],
      run: { id: "702" },
      stage: "stage_1",
    });

    expect(outcome).toMatchObject({
      disposition: "complete",
      result: {
        outcome: "excluded",
        hard_exclusion_reasons: ["approved_clinic_claim", "protected_field_status"],
        suppression_eligible: false,
        serving_write: { attempted: false, written: false },
      },
    });
    expect(llmClient.complete).not.toHaveBeenCalled();
    expect(webClient.fetchHomepage).not.toHaveBeenCalled();
  });

  test("Stage 2 resumes from its checkpoint, adds cached website evidence, and accepts a confident result", async () => {
    const llmClient = llmResponse(104, "destination_medical", 0.88, "International executive health program for self-pay visitors.");
    const webClient = {
      fetchHomepage: vi.fn(async () => ({
        ok: true,
        outcome: "ok",
        requestedUrl: "https://example.test/",
        finalUrl: "https://example.test/",
        status: 200,
        title: "Executive Health",
        description: "International check-up programs",
        textExcerpt: "Self-pay visitors book comprehensive preventive medical evaluations.",
        fetchedAt: "2026-07-11T20:00:00.000Z",
        cached: true,
      })),
    };
    const handler = createLegitimacyBatchHandler({
      query: queryRows([databaseRow(104)]),
      llmClient,
      webClient,
    });

    const [outcome] = await handler({
      tasks: [stage2Task(104)],
      run: { id: "703" },
      stage: "stage_2",
    });

    expect(outcome).toMatchObject({
      disposition: "complete",
      result: {
        final: { class: "destination_medical", stage: "stage_2", proposed_action: "keep" },
        stages: {
          stage_1: { class: "review", confidence: 0.5 },
          stage_2: {
            website: { cache_status: "hit_fresh", excerpt_chars: 68 },
            classification: { class: "destination_medical", confidence: 0.88 },
          },
        },
      },
    });
    expect(webClient.fetchHomepage).toHaveBeenCalledOnce();
    const request = llmClient.complete.mock.calls[0]![0];
    expect(request.callType).toBe("legitimacy_stage_2");
    expect(request.messages[1].content).toContain("website_evidence");
    expect(request.messages[1].content).toContain("Executive Health");
  });

  test("Stage 2 forces sub-threshold output to review and no-site failures never call the model", async () => {
    const lowLlm = llmResponse(105, "in_scope", 0.72, "The site mixes clinical and ordinary fitness services.");
    const lowHandler = createLegitimacyBatchHandler({
      query: queryRows([databaseRow(105)]),
      llmClient: lowLlm,
      webClient: {
        fetchHomepage: vi.fn(async () => ({
          ok: true,
          outcome: "ok",
          requestedUrl: "https://example.test/",
          finalUrl: "https://example.test/",
          status: 200,
          title: "Mixed Center",
          description: "",
          textExcerpt: "Gym and recovery services",
          fetchedAt: "2026-07-11T20:00:00.000Z",
          cached: false,
        })),
      },
    });
    const [lowOutcome] = await lowHandler({
      tasks: [stage2Task(105)],
      run: { id: "704" },
      stage: "stage_2",
    });
    expect(lowOutcome).toMatchObject({
      result: {
        final: { class: "review", confidence: 0.72, proposed_action: "review" },
        stages: { stage_2: { classification: { class: "in_scope", confidence: 0.72 } } },
      },
    });

    const noSiteLlm = { complete: vi.fn() };
    const noSiteWeb = unusedWebClient();
    const noSiteHandler = createLegitimacyBatchHandler({
      query: queryRows([databaseRow(106, { website: null, organization_website_domain: null })]),
      llmClient: noSiteLlm,
      webClient: noSiteWeb,
    });
    const [noSiteOutcome] = await noSiteHandler({
      tasks: [stage2Task(106)],
      run: { id: "705" },
      stage: "stage_2",
    });
    expect(noSiteOutcome).toMatchObject({
      result: {
        final: { class: "review", confidence: 0 },
        stages: { stage_2: { website: { outcome: "no_website" } } },
      },
    });
    expect(noSiteLlm.complete).not.toHaveBeenCalled();
    expect(noSiteWeb.fetchHomepage).not.toHaveBeenCalled();
  });
});

function stage1Task(entityId: number) {
  return {
    id: `task-${entityId}`,
    entity_id: entityId,
    payload: {
      schema_version: 1,
      campaign: "pass1_gate_a",
      prompt_version: "pass1-legitimacy-v1",
      sample_stratum: "random",
      stage: "stage_1",
      threshold: 0.8,
    },
  };
}

function stage2Task(entityId: number) {
  return {
    ...stage1Task(entityId),
    payload: {
      ...stage1Task(entityId).payload,
      stage: "stage_2",
      stage_1: { class: "review", confidence: 0.5, rationale: "More evidence is required." },
    },
  };
}

function databaseRow(entityId: number, overrides: Record<string, unknown> = {}) {
  return {
    requested_id: entityId,
    id: entityId,
    org_id: entityId + 1_000,
    name: `Location ${entityId}`,
    locality: "Los Angeles",
    region: "California",
    country_code: "US",
    website: "https://example.test/",
    organization_name: `Organization ${entityId}`,
    organization_website_domain: "example.test",
    source_slugs: ["fixture_source"],
    offering_names: ["Executive physical"],
    tags: [{ facet: "focus", value: "longevity" }],
    hard_exclusion_reasons: [],
    ...overrides,
  };
}

function queryRows(rows: unknown[]) {
  return vi.fn(async () => ({ rows }));
}

function llmResponse(
  locationId: number,
  className: string,
  confidence: number,
  rationale: string,
) {
  return {
    complete: vi.fn(async (request: MockLlmRequest) => {
      void request;
      return {
        content: JSON.stringify({
          results: [{ location_id: locationId, class: className, confidence, rationale }],
        }),
        model: "openai/gpt-4o-mini",
        usage: { prompt_tokens: 500, completion_tokens: 50, total_tokens: 550 },
        costEstimateUsd: 0.000105,
        externalCallId: "call-1",
      };
    }),
  };
}

function unusedWebClient() {
  return { fetchHomepage: vi.fn() };
}
