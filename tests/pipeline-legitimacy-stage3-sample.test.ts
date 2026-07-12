import { describe, expect, test } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { parseStage3Response } from "../pipeline/lib/legitimacy-stage3-sample.mjs";

function response(results: unknown[]) {
  return JSON.stringify({ results });
}

describe("Stage 3 escalation sample guards", () => {
  test("accepts evidence-backed high-confidence classes", () => {
    const parsed = parseStage3Response(response([
      {
        classification_key: "organization:4308",
        class: "in_scope",
        confidence: 0.98,
        basis: "consumer_wellness",
        positive_evidence: "Official site offers hormone and age-management care.",
        rationale: "Consumer anti-aging clinic.",
      },
      {
        classification_key: "organization:5",
        class: "plain_hospital",
        confidence: 0.95,
        basis: "ordinary_care",
        positive_evidence: "All branches provide ordinary physical therapy.",
        rationale: "Ordinary rehabilitation network.",
      },
    ]), ["organization:4308", "organization:5"]);

    expect(parsed.get("organization:4308")).toMatchObject({
      class: "in_scope",
      basis: "consumer_wellness",
      normalizationFlags: [],
    });
    expect(parsed.get("organization:5")?.class).toBe("plain_hospital");
  });

  test("fails junk and destination classes closed without their required positive basis", () => {
    const parsed = parseStage3Response(response([
      {
        classification_key: "location:1",
        class: "junk",
        confidence: 0.99,
        basis: "insufficient",
        positive_evidence: "Sparse fields.",
        rationale: "Unclear.",
      },
      {
        classification_key: "location:2",
        class: "destination_medical",
        confidence: 0.99,
        basis: "ordinary_care",
        positive_evidence: "Markets surgery internationally.",
        rationale: "Treatment tourism.",
      },
    ]), ["location:1", "location:2"]);

    expect(parsed.get("location:1")).toMatchObject({
      class: "review",
      normalizationFlags: ["junk_without_affirmative_basis"],
    });
    expect(parsed.get("location:2")).toMatchObject({
      class: "review",
      normalizationFlags: ["destination_without_qualifying_basis"],
    });
  });

  test("forces sub-threshold answers and malformed id sets to review", () => {
    const low = parseStage3Response(response([{
      classification_key: "location:1",
      class: "in_scope",
      confidence: 0.89,
      basis: "consumer_wellness",
      positive_evidence: "Offers IV therapy.",
      rationale: "Wellness clinic.",
    }]), ["location:1"]);
    expect(low.get("location:1")).toMatchObject({
      class: "review",
      normalizationFlags: ["forced_review_below_threshold"],
    });

    const mismatch = parseStage3Response(response([{
      classification_key: "wrong:key",
      class: "review",
      confidence: 0,
      basis: "insufficient",
      positive_evidence: "",
      rationale: "Missing evidence.",
    }]), ["location:1"]);
    expect(mismatch.get("location:1")).toMatchObject({
      class: "review",
      normalizationFlags: ["id_set_mismatch"],
    });
  });
});
