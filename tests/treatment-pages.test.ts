import { describe, expect, test } from "vitest";
import { buildSitemap } from "../src/app/sitemap";
import { buildTreatmentHubs } from "../src/lib/treatment-hubs";
import {
  isTreatmentPageIndexable,
  treatmentHref,
  treatmentRouteHref,
  treatmentSlug,
  type TreatmentCatalogItem,
} from "../src/lib/treatment-pages";

describe("treatment pages", () => {
  test("uses readable stable treatment slugs", () => {
    expect(treatmentSlug("Menopause hormone therapy (HRT)")).toBe("menopause-hormone-therapy-hrt");
    expect(treatmentSlug("NAD+ IV therapy")).toBe("nad-iv-therapy");
    expect(treatmentSlug("Emtone®")).toBe("emtone");
  });

  test("builds direct treatment directory links", () => {
    expect(treatmentHref({ name: "NAD+ IV therapy" })).toBe("/directory?q=NAD%2B+IV+therapy");
    expect(treatmentRouteHref({ name: "NAD+ IV therapy" })).toBe("/treatments/nad-iv-therapy");
  });

  test("keeps treatment pages out of the index when no city passes the threshold", () => {
    expect(isTreatmentPageIndexable(0)).toBe(false);
    expect(isTreatmentPageIndexable(1)).toBe(true);
  });

  test("keeps retired treatment pages out of the sitemap", () => {
    const urls = new Set(buildSitemap().map((entry) => new URL(entry.url).pathname));

    expect(urls).toContain("/treatments");
    expect(urls).not.toContain("/treatments/peptide-therapy");
  });

  test("builds hubs only from linkable city-index rows and sorts by location count", () => {
    const treatment: TreatmentCatalogItem = {
      id: 3,
      name: "DEXA scan",
      category: "Diagnostics",
      locationCount: 20,
    };
    const [hub] = buildTreatmentHubs([treatment], [
      {
        treatmentId: 3,
        city: "Denver",
        region: "CO",
        countryCode: "US",
        countryName: "United States",
        latitude: 39.7392,
        longitude: -104.9903,
        locationCount: 5,
      },
      {
        treatmentId: 3,
        city: "Austin",
        region: "TX",
        countryCode: "US",
        countryName: "United States",
        latitude: 30.2672,
        longitude: -97.7431,
        locationCount: 11,
      },
      {
        treatmentId: 3,
        city: "Longevity Center Poland, Switzerland",
        region: null,
        countryCode: "CH",
        countryName: "Switzerland",
        latitude: 47.3769,
        longitude: 8.5417,
        locationCount: 99,
      },
    ]);

    expect(hub.cities.map((city) => city.city)).toEqual(["Austin", "Denver"]);
    expect(hub.href).toBe("/directory?q=DEXA+scan");
    expect(hub.totalLocations).toBe(16);
    expect(hub.totalCities).toBe(2);
  });
});
