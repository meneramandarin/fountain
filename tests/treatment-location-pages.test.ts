import { describe, expect, test } from "vitest";
import { buildSitemap } from "../src/app/sitemap";
import {
  fixedTreatmentLocationCities,
  fixedTreatmentLocationPages,
  fixedTreatmentLocationTreatments,
} from "../src/lib/fixed-treatment-location-pages";
import { buildTreatmentHubs } from "../src/lib/treatment-hubs";
import { treatmentCityHref, treatmentCitySlug, type TreatmentCatalogItem } from "../src/lib/treatment-pages";

const treatment: TreatmentCatalogItem = {
  id: 3,
  name: "DEXA scan",
  category: "Diagnostics",
  locationCount: 5,
};

describe("treatment location pages", () => {
  test("routes DEXA scan to the shared default cities plus its extra measured-demand cities", () => {
    expect(fixedTreatmentLocationPages).toHaveLength(34);
    expect(new Set(fixedTreatmentLocationPages.map((page) => page.href)).size).toBe(34);

    const defaultCitySlugs = fixedTreatmentLocationCities.map((city) => city.slug);

    const dexaCitySlugs = fixedTreatmentLocationPages
      .filter((page) => page.treatment.slug === "dexa-scan")
      .map((page) => page.city.slug);
    expect(dexaCitySlugs).toEqual([
      ...defaultCitySlugs,
      "houston-tx",
      "san-diego-ca",
      "chicago-il",
      "las-vegas-nv",
    ]);

    for (const treatment of fixedTreatmentLocationTreatments) {
      if (treatment.slug === "dexa-scan") continue;
      const citySlugs = fixedTreatmentLocationPages
        .filter((page) => page.treatment.slug === treatment.slug)
        .map((page) => page.city.slug);
      expect(citySlugs).toEqual(defaultCitySlugs);
    }
  });

  test("builds stable clean city URLs from live treatment and city records", () => {
    const city = cityRecord(3);
    expect(treatmentCitySlug(city)).toBe("austin-tx");
    expect(treatmentCityHref(treatment, city)).toBe("/treatments/dexa-scan/austin-tx");
  });

  test("keeps non-US city slugs distinct from matching US city slugs", () => {
    expect(treatmentCitySlug({
      ...cityRecord(3),
      city: "San Diego",
      region: "CA",
      countryCode: "MX",
    })).toBe("san-diego-ca-mx");
  });

  test("routes allowlisted treatment cities to clean pages regardless of count", () => {
    const [hub] = buildTreatmentHubs([treatment], [cityRecord(2)]);
    expect(hub.cities[0].indexable).toBe(true);
    expect(hub.cities[0].href).toBe("/treatments/dexa-scan/austin-tx");
  });

  test("routes every non-allowlisted treatment city to a structured directory search", () => {
    const [hub] = buildTreatmentHubs([treatment], [{
      ...cityRecord(99),
      city: "Seattle",
      region: "WA",
    }]);

    expect(hub.cities[0].indexable).toBe(false);
    expect(hub.cities[0].href).toContain("/directory?");
    expect(hub.cities[0].href).toContain("treatment_id=3");
    expect(hub.cities[0].href).not.toContain("q=");
  });

  test("adds only the fixed city pages to the sitemap", () => {
    const urls = buildSitemap().map((entry) => new URL(entry.url).pathname);
    const cityUrls = urls.filter((url) => url.split("/").filter(Boolean).length === 3);
    expect(cityUrls).toEqual(fixedTreatmentLocationPages.map((page) => page.href));
  });
});

function cityRecord(locationCount: number) {
  return {
    treatmentId: 3,
    city: "Austin",
    region: "TX",
    countryCode: "US",
    countryName: "United States",
    latitude: 30.2672,
    longitude: -97.7431,
    locationCount,
  };
}
