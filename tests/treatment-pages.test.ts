import { describe, expect, test } from "vitest";
import { buildSitemap } from "../src/app/sitemap";
import { buildTreatmentHubs, prepareTreatmentIndexHubs } from "../src/lib/treatment-hubs";
import {
  isTreatmentPageIndexable,
  treatmentHref,
  treatmentSlug,
  type TreatmentCatalogItem,
} from "../src/lib/treatment-pages";

describe("treatment pages", () => {
  test("uses readable stable treatment slugs", () => {
    expect(treatmentSlug("Menopause hormone therapy (HRT)")).toBe("menopause-hormone-therapy-hrt");
    expect(treatmentSlug("NAD+ IV therapy")).toBe("nad-iv-therapy");
    expect(treatmentSlug("Emtone®")).toBe("emtone");
  });

  test("builds clean treatment hub links", () => {
    expect(treatmentHref({ name: "NAD+ IV therapy" })).toBe("/treatments/nad-iv-therapy");
  });

  test("keeps treatment pages out of the index when no city passes the threshold", () => {
    expect(isTreatmentPageIndexable(0)).toBe(false);
    expect(isTreatmentPageIndexable(1)).toBe(true);
  });

  test("adds live treatment hubs but no unrelated surface types to the sitemap", () => {
    const treatment: TreatmentCatalogItem = {
      id: 20,
      name: "Peptide therapy",
      category: "Regenerative medicine",
      locationCount: 3,
    };
    const [hub] = buildTreatmentHubs([treatment], [{
      treatmentId: 20,
      city: "Seattle",
      region: "WA",
      countryCode: "US",
      countryName: "United States",
      latitude: 47.6062,
      longitude: -122.3321,
      locationCount: 3,
    }]);
    const urls = new Set(buildSitemap([hub]).map((entry) => new URL(entry.url).pathname));

    expect(urls).toContain("/treatments");
    expect(urls).toContain("/treatments/peptide-therapy");
    expect(urls).not.toContain("/directory");
    expect(urls).not.toContain("/privacy-policy");
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
    expect(hub.href).toBe("/treatments/dexa-scan");
    expect(hub.totalLocations).toBe(16);
    expect(hub.totalCities).toBe(2);
  });

  test("keeps treatments with no eligible locations available to the index", () => {
    const treatments: TreatmentCatalogItem[] = [
      {
        id: 3,
        name: "DEXA scan",
        category: "Measure",
        locationCount: 1,
      },
      {
        id: 64,
        name: "Vestibular rehabilitation therapy",
        category: "Recover",
        locationCount: 0,
      },
    ];

    const hubs = prepareTreatmentIndexHubs(buildTreatmentHubs(treatments, [{
      treatmentId: 3,
      city: "Austin",
      region: "TX",
      countryCode: "US",
      countryName: "United States",
      latitude: 30.2672,
      longitude: -97.7431,
      locationCount: 1,
    }]));

    expect(hubs.map((hub) => hub.treatment.name)).toEqual([
      "DEXA scan",
      "Vestibular rehabilitation therapy",
    ]);
    expect(hubs[1]).toMatchObject({
      href: "/treatments/vestibular-rehabilitation-therapy",
      totalLocations: 0,
      totalCities: 0,
    });
  });
});
