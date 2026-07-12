import { describe, expect, test } from "vitest";

// @ts-expect-error -- pipeline runtime intentionally uses native .mjs modules.
import * as reviewModule from "../pipeline/lib/taxonomy-mapping-review.mjs";

const {
  reconcileMappingReviews,
  TAXONOMY_MAPPING_REVIEW_MIN_CONFIDENCE,
} = reviewModule;

const term = {
  old_treatment_id: 1,
  old_treatment_name: "Full-body MRI",
  term_normalized: "endermologie lpg lpg",
  display_term: "Endermologie LPG - LPG",
  alias_ids: [3533],
  offering_ids: [8749],
  examples: [],
};
const treatments = [
  { id: 1, canonical_name: "Full-body MRI", category: "Diagnostics" },
  { id: 88, canonical_name: "Cellulite Reduction", category: "Aesthetics" },
];

describe("taxonomy mapping review consensus", () => {
  test("accepts two sufficiently confident passes that select the same valid remap", () => {
    const first = new Map([[term.term_normalized, decision("remap_existing", 88, TAXONOMY_MAPPING_REVIEW_MIN_CONFIDENCE)]]);
    const second = new Map([[term.term_normalized, decision("remap_existing", 88, 0.98)]]);
    const [row] = reconcileMappingReviews([term], first, second, treatments, "openai/gpt-5.5");
    expect(row).toMatchObject({
      final_decision: "remap_existing",
      proposed_treatment_id: 88,
      review_status: "consensus",
    });
  });

  test("leaves disagreements and low-confidence decisions unresolved", () => {
    const first = new Map([[term.term_normalized, decision("remap_existing", 88, 0.99)]]);
    const disagreement = new Map([[term.term_normalized, decision("unmap_valid_service", null, 0.99)]]);
    const lowConfidence = new Map([[term.term_normalized, decision("remap_existing", 88, 0.5)]]);
    expect(reconcileMappingReviews([term], first, disagreement, treatments, "model")[0].final_decision)
      .toBe("unresolved");
    expect(reconcileMappingReviews([term], first, lowConfidence, treatments, "model")[0].final_decision)
      .toBe("unresolved");
  });
});

function decision(decisionName: string, target: number | null, confidence: number) {
  return { decision: decisionName, target_treatment_id: target, confidence, rationale: "test" };
}
