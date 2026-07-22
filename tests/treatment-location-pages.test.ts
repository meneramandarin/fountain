import { describe, expect, test } from "vitest";
import { buildSitemap } from "../src/app/sitemap";
import { buildTreatmentHubs } from "../src/lib/treatment-hubs";
import { treatmentCityHref, treatmentCitySlug, type TreatmentCatalogItem } from "../src/lib/treatment-pages";

const treatment: TreatmentCatalogItem = {
  id: 3,
  name: "DEXA scan",
  category: "Diagnostics",
  locationCount: 5,
};

describe("treatment location pages", () => {
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

  test("routes treatment cities to structured directory searches", () => {
    const [hub] = buildTreatmentHubs([treatment], [cityRecord(2)]);
    expect(hub.cities[0].indexable).toBe(false);
    expect(hub.cities[0].href).toContain("/directory?");
    expect(hub.cities[0].href).toContain("treatment_id=3");
    expect(hub.cities[0].href).not.toContain("q=");
  });

  test("a city crossing the discovery threshold still routes to the directory and stays out of the sitemap", () => {
    const [before] = buildTreatmentHubs([treatment], [cityRecord(2)]);
    const [after] = buildTreatmentHubs([treatment], [cityRecord(3)]);
    const sitemapUrls = new Set(buildSitemap().map((entry) => new URL(entry.url).pathname));

    expect(before.cities[0].indexable).toBe(false);
    expect(after.cities[0].indexable).toBe(true);
    expect(after.cities[0].href).toContain("/directory?");
    expect(sitemapUrls).not.toContain("/treatments/dexa-scan/austin-tx");
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
