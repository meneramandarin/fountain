import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import {
  addressEvidence,
  treatmentEvidence,
  verifyCandidate,
} from "../pipeline/lib/place-verification.mjs";

describe("official-site candidate verification", () => {
  test("requires street identity evidence for numbered and unnumbered addresses", () => {
    expect(addressEvidence(
      "2598 Shattuck Avenue, Berkeley, CA 94704",
      "visit our berkeley studio at 2598 shattuck avenue",
    ).verified).toBe(true);
    expect(addressEvidence(
      "5678 Mission St, San Francisco, CA",
      "our san francisco clinic offers iv therapy",
    ).verified).toBe(false);
    expect(addressEvidence(
      "Business Bay, Dubai",
      "visit our clinic in business bay dubai",
    ).verified).toBe(true);
    expect(addressEvidence(
      "Dubai",
      "visit our clinic in dubai",
    ).verified).toBe(false);
  });

  test("matches treatment-specific evidence terms", () => {
    expect(treatmentEvidence(
      ["NAD+ IV therapy"],
      "book our nad iv infusion and intravenous vitamin therapies",
    ).verified).toBe(true);
    expect(treatmentEvidence(
      ["Full-body MRI"],
      "we provide ultrasound imaging",
    ).verified).toBe(false);
    expect(treatmentEvidence(
      ["Full-body MRI"],
      "our radiology department provides cardiac mri and brain magnetic resonance imaging",
    ).verified).toBe(false);
    expect(treatmentEvidence(
      ["Full-body CT"],
      "we provide coronary ct scans and chest computed tomography",
    ).verified).toBe(false);
    expect(treatmentEvidence(
      ["Full-body MRI", "Full-body CT"],
      "choose a whole body mri or full body ct screening",
    ).verified).toBe(true);
    expect(treatmentEvidence(
      ["Advanced blood panel"],
      "routine blood tests and lab testing are available",
    ).verified).toBe(false);
    expect(treatmentEvidence(
      ["Advanced blood panel"],
      "our comprehensive blood panel measures more than 100 markers",
    ).verified).toBe(true);
    expect(treatmentEvidence(
      ["Advanced biomarker panel"],
      "testing of 500 cellular biomarkers",
    ).verified).toBe(true);
    expect(treatmentEvidence(
      ["Cardiometabolic testing"],
      "advanced biomarker and cardio-metabolic testing",
    ).verified).toBe(true);
    expect(treatmentEvidence(
      ["Cancer screening"],
      "multi-cancer early detection blood testing",
    ).verified).toBe(true);
    expect(treatmentEvidence(
      ["Cryotherapy"],
      "die cryotherapie findet in einer kaeltekammer statt",
    ).verified).toBe(true);
  });

  test("verifies address and treatment on an official evidence page", async () => {
    const webClient = {
      fetchHomepage: vi.fn(async () => ({
        ok: true,
        outcome: "ok",
        finalUrl: "https://clinic.example/location",
        cached: false,
        textExcerpt: "Clinic Example. 10 Main Street, Berkeley CA. Book NAD+ IV therapy.",
      })),
    };
    const result = await verifyCandidate({
      website: "https://clinic.example/location",
      evidence_urls: ["https://clinic.example/location"],
      offerings: [],
      address: "10 Main Street, Berkeley, CA 94704",
      matched_treatments: ["NAD+ IV therapy"],
    }, { webClient });
    expect(result).toMatchObject({
      address_verified: true,
      treatment_verified: true,
    });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).not.toHaveProperty("text");
  });
});
