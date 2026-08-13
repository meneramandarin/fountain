import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import {
  candidateOfferings,
  isMobileServiceCandidate,
  isNonOfficialWebsite,
  isQaDistinctLocationReviewed,
  promoteDiscoveredPlaces,
} from "../pipeline/lib/place-promotion.mjs";

describe("place discovery promotion", () => {
  test("does not manufacture menu rows from discovery-family evidence", () => {
    const treatmentMap = new Map([
      ["bpc 157", { status: "mapped", treatment_id: 101 }],
      ["peptide therapy", { status: "mapped", treatment_id: 20 }],
    ]);
    const offerings = candidateOfferings({
      website: "https://clinic.example",
      matched_treatments: ["Peptide therapy"],
      offerings: [{ name: "BPC-157", source_url: "https://clinic.example/menu" }],
    }, { treatmentMap });

    expect(offerings).toEqual([
      expect.objectContaining({ raw_name: "BPC-157", treatment_id: 101 }),
    ]);
    expect(offerings.map((offering: { raw_name: string }) => offering.raw_name))
      .not.toContain("Peptide therapy");
  });

  test("dry-run previews only ready, unpromoted candidates", async () => {
    const query = vi.fn(async () => ({
      rows: [{
        id: "7",
        name: "Ready Clinic",
        address: "7 Main St, Berkeley, CA 94704",
        locality: "Berkeley",
        website: "https://ready.example",
        phone: "+15105550100",
        email: null,
        image_url: "https://ready.example/hero.jpg",
        chain_name: "Ready Health",
        matched_treatments: ["NAD+ IV therapy"],
        offerings: [{
          name: "NAD+ IV therapy",
          price_amount: 450,
          price_currency: "USD",
        }],
      }],
    }));
    const result = await promoteDiscoveredPlaces({
      campaign: "test",
      runId: 94,
      apply: false,
    }, { query });
    expect(result).toMatchObject({
      selected: 1,
      chain_branches: 1,
      with_phone: 1,
      with_email: 0,
      with_agent_image: 1,
      with_agent_offerings: 1,
      sample: [{
        id: 7,
        name: "Ready Clinic",
        chain_name: "Ready Health",
      }],
    });
    expect(String(query.mock.calls[0]?.[0])).toContain("status = 'ready'");
  });

  test("holds marketplace and directory profiles for official-site rescue", () => {
    expect(isNonOfficialWebsite("https://longevity.haus/provider/example")).toBe(true);
    expect(isNonOfficialWebsite("https://nextmd.ai/practice/example")).toBe(true);
    expect(isNonOfficialWebsite("https://saunanearme.com/example")).toBe(true);
    expect(isNonOfficialWebsite("https://clinic.example/locations/example")).toBe(false);
  });

  test("recognizes an explicitly audited distinct-location override", () => {
    expect(isQaDistinctLocationReviewed({
      discovered_groups: ["held_rescue", "qa_distinct_location_reviewed"],
    })).toBe(true);
    expect(isQaDistinctLocationReviewed({ discovered_groups: ["held_rescue"] })).toBe(false);
  });

  test("recognizes a reviewed city-level mobile service listing", () => {
    expect(isMobileServiceCandidate({
      discovered_groups: ["mobile_service_area_reviewed"],
    })).toBe(true);
    expect(isMobileServiceCandidate({
      discovered_groups: ["qa_distinct_location_reviewed"],
    })).toBe(false);
  });
});
