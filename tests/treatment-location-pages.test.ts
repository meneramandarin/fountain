import { describe, expect, test } from "vitest";
import { buildSitemap } from "../src/app/sitemap";
import {
  findPilotTreatmentLocationHref,
  findPilotTreatmentLocationPage,
  pilotTreatmentHref,
  pilotTreatmentLocationHref,
  pilotTreatmentLocationPages,
} from "../src/lib/treatment-location-pages";

describe("treatment location SEO pilot", () => {
  test("contains exactly 20 unique canonical pages", () => {
    const paths = pilotTreatmentLocationPages.map(pilotTreatmentLocationHref);

    expect(paths).toHaveLength(20);
    expect(new Set(paths).size).toBe(20);
  });

  test("includes the agreed high-intent examples", () => {
    expect(findPilotTreatmentLocationPage("dexa-scan", "miami-fl")).toBeTruthy();
    expect(findPilotTreatmentLocationPage("dexa-scan", "austin-tx")).toBeTruthy();
    expect(findPilotTreatmentLocationPage("iv-drip", "san-francisco-ca")).toBeTruthy();
  });

  test("maps matching city links to canonical pilot routes", () => {
    expect(findPilotTreatmentLocationHref({
      treatmentId: 3,
      locality: "Austin",
      region: "TX",
      countryCode: "US",
    })).toBe("/treatments/dexa-scan/austin-tx");

    expect(findPilotTreatmentLocationHref({
      treatmentId: 21,
      locality: "San Francisco",
      region: null,
      countryCode: "US",
    })).toBe("/treatments/iv-drip/san-francisco-ca");
  });

  test("maps pilot pages back to their parent treatment page", () => {
    const page = findPilotTreatmentLocationPage("dexa-scan", "miami-fl");

    expect(page && pilotTreatmentHref(page)).toBe("/treatments/dexa-scan");
  });

  test("adds all 20 pilot routes to the sitemap", () => {
    const sitemapUrls = new Set(buildSitemap().map((entry) => new URL(entry.url).pathname));
    for (const page of pilotTreatmentLocationPages) {
      expect(sitemapUrls.has(pilotTreatmentLocationHref(page))).toBe(true);
    }
  });
});
