import { describe, expect, test } from "vitest";
import { buildSitemap, revalidate as sitemapRevalidate } from "../src/app/sitemap";
import { editorialArticles, editorialArticlePath } from "../src/lib/editorial-articles";
import { popularTreatmentLabel } from "../src/lib/popular-treatments";
import { buildTreatmentHubs, prepareTreatmentIndexHubs } from "../src/lib/treatment-hubs";
import {
  hyperbaricOxygenTherapy,
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
    expect(treatmentSlug(hyperbaricOxygenTherapy.name)).toBe("hyperbaric-oxygen-therapy");
  });

  test("builds clean treatment hub links", () => {
    expect(treatmentHref({ name: "NAD+ IV therapy" })).toBe("/treatments/nad-iv-therapy");
    expect(treatmentHref(hyperbaricOxygenTherapy)).toBe("/treatments/hyperbaric-oxygen-therapy");
  });

  test("expands the legacy HBOT tag label", () => {
    expect(popularTreatmentLabel(hyperbaricOxygenTherapy.legacyName)).toBe(hyperbaricOxygenTherapy.name);
  });

  test("keeps treatment pages out of the index when no city passes the threshold", () => {
    expect(isTreatmentPageIndexable(0)).toBe(false);
    expect(isTreatmentPageIndexable(1)).toBe(true);
  });

  test("adds live treatment hubs and indexable top-level pages to the sitemap", () => {
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
    expect(urls).toContain("/directory");
    expect(urls).toContain("/privacy-policy");
    expect(urls).toContain("/terms-of-service");
  });

  test("adds clean listing URLs with their own update timestamps", () => {
    const updatedAt = new Date("2026-08-01T12:00:00Z");
    const entries = buildSitemap([], [
      { slug: "example-clinic-austin", updated_at: updatedAt },
      { slug: "example-clinic-seattle", updated_at: null },
    ]);
    const listingEntries = entries.filter((entry) => entry.url.includes("/directory/locations/"));

    expect(listingEntries).toHaveLength(2);
    expect(new URL(listingEntries[0].url).pathname).toBe(
      "/directory/locations/example-clinic-austin",
    );
    expect(listingEntries[0].lastModified).toBe(updatedAt);
    expect(listingEntries[1]).not.toHaveProperty("lastModified");
    expect(listingEntries.every((entry) => !entry.url.includes("?"))).toBe(true);
  });

  test("publishes only accurate modification dates and omits ignored hints", () => {
    const entries = buildSitemap();
    const homepage = entries.find((entry) => new URL(entry.url).pathname === "/");
    const [article] = editorialArticles;
    const articleEntry = entries.find(
      (entry) => new URL(entry.url).pathname === editorialArticlePath(article.slug),
    );

    expect(homepage).not.toHaveProperty("lastModified");
    expect(articleEntry?.lastModified).toBe(article.updated);
    expect(entries.every((entry) => !("changeFrequency" in entry) && !("priority" in entry))).toBe(true);
  });

  test("refreshes the directory sitemap within an hour", () => {
    expect(sitemapRevalidate).toBe(3_600);
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

  test("keeps treatments with no eligible locations off the public index", () => {
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

    expect(hubs.map((hub) => hub.treatment.name)).toEqual(["DEXA scan"]);
  });
});
