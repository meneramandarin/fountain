import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- pipeline runtime intentionally uses native .mjs modules.
import * as taxonomyModule from "../pipeline/lib/taxonomy-presentation.mjs";

const {
  buildDeterministicPresentation,
  classifyTaxonomyPresentationBatch,
  normalizeTaxonomyTerm,
  runTaxonomyPresentationClassification,
  TAXONOMY_PRESENTATION_RESPONSE_FORMAT,
} = taxonomyModule;

describe("taxonomy presentation classification", () => {
  test("normalizes the same formatting variants used by the taxonomy mapper", () => {
    expect(normalizeTaxonomyTerm("Full-body MRI®")).toBe("full body mri");
    expect(normalizeTaxonomyTerm("NAD+ IV Therapy")).toBe("nad iv therapy");
  });

  test("classifies canonical formatting variants without an LLM", () => {
    expect(buildDeterministicPresentation(term({
      display_term: "Full Body MRI",
      term_normalized: "full body mri",
      canonical_name: "Full-body MRI",
    }))).toMatchObject({
      relationship_type: "format_variant",
      display_mode: "raw_only",
      mapping_valid: true,
      confidence: 1,
      model: null,
      review_status: "auto_approved",
    });
  });

  test("uses structured OpenRouter output and derives safe display modes", async () => {
    const complete = vi.fn(async () => ({
      content: JSON.stringify({
        classifications: [
          {
            term_normalized: "dysport",
            relationship: "brand",
            mapping_valid: true,
            confidence: 0.98,
            rationale: "Named botulinum toxin brand.",
          },
          {
            term_normalized: "thread lift",
            relationship: "suspect",
            mapping_valid: false,
            confidence: 0.99,
            rationale: "Unrelated procedure.",
          },
        ],
      }),
      model: "openai/gpt-4o-mini",
    }));
    const result = await classifyTaxonomyPresentationBatch({
      terms: [
        term({ display_term: "Dysport", term_normalized: "dysport", canonical_name: "Botox" }),
        term({ display_term: "Thread Lift", term_normalized: "thread lift", canonical_name: "Botox" }),
      ],
      runId: "17",
      llmClient: { complete },
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        term_normalized: "dysport",
        relationship_type: "brand",
        display_mode: "raw_and_canonical",
        mapping_valid: true,
        review_status: "auto_approved",
      }),
      expect.objectContaining({
        term_normalized: "thread lift",
        relationship_type: "suspect",
        display_mode: "raw_only",
        mapping_valid: false,
        review_status: "needs_review",
      }),
    ]);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      callType: "taxonomy_presentation",
      responseFormat: TAXONOMY_PRESENTATION_RESPONSE_FORMAT,
      temperature: 0,
    }));
  });

  test("dry-run previews pending aliases without spending or writing", async () => {
    const query = vi.fn(async () => ({ rows: [term({
      display_term: "Full Body MRI",
      term_normalized: "full body mri",
      canonical_name: "Full-body MRI",
    })] }));
    const complete = vi.fn();
    const result = await runTaxonomyPresentationClassification({
      runId: "18",
      apply: false,
      query,
      llmClient: { complete },
    });

    expect(result).toMatchObject({ pending: 1, deterministic: 1, llm_terms: 0, written: 0 });
    expect(query).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });
});

function term(overrides: Record<string, unknown> = {}) {
  return {
    treatment_id: 34,
    canonical_name: "Botox",
    category: "Aesthetic",
    term_normalized: "botox",
    display_term: "Botox",
    alias_rows: 1,
    active_offerings: 5,
    ...overrides,
  };
}
