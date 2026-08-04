import { describe, expect, it } from "vitest";
import { buildClinicClickParameters } from "../src/lib/clinic-click-analytics";

describe("clinic click analytics", () => {
  it("uses explicit search context and preserves all clinic categories", () => {
    expect(
      buildClinicClickParameters({
        locationId: 42,
        locationSlug: "example-clinic",
        clinicCategory: "Measure",
        treatmentName: "DEXA scan",
        clickSurface: "search_results",
        resultPosition: 3,
        treatments: [
          { name: "DEXA scan", domain: "Measure" },
          { name: "IV therapy", domain: "Optimize" },
          { name: "Vitamin infusion", domain: "Optimize" },
        ],
      }),
    ).toEqual({
      location_id: 42,
      location_slug: "example-clinic",
      clinic_category: "Measure",
      clinic_categories: "Measure | Optimize",
      treatment_name: "DEXA scan",
      click_surface: "search_results",
      result_position: 3,
    });
  });

  it("falls back to the card's first treatment context", () => {
    expect(
      buildClinicClickParameters({
        locationId: 7,
        clickSurface: "map",
        treatments: [{ name: "IV therapy", domain: "Optimize" }],
      }),
    ).toMatchObject({
      location_slug: "7",
      clinic_category: "Optimize",
      treatment_name: "IV therapy",
      result_position: undefined,
    });
  });

  it("keeps multi-category clinics honest when there is no selected treatment", () => {
    expect(
      buildClinicClickParameters({
        locationId: 9,
        clickSurface: "search",
        treatments: [
          { name: "DEXA scan", domain: "Measure" },
          { name: "IV therapy", domain: "Optimize" },
        ],
      }).clinic_category,
    ).toBe("Measure | Optimize");
  });
});
