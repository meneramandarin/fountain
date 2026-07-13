import { describe, expect, test } from "vitest";
import { buildSitemap } from "../src/app/sitemap";
import {
  isTreatmentPageIndexable,
  minimumTreatmentPageLocations,
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

  test("builds treatment-only links rather than treatment-location links", () => {
    expect(treatmentHref({ name: "NAD+ IV therapy" })).toBe("/treatments/nad-iv-therapy");
  });

  test("keeps thin treatment pages out of the index until they have enough coverage", () => {
    expect(isTreatmentPageIndexable({ locationCount: minimumTreatmentPageLocations - 1 })).toBe(false);
    expect(isTreatmentPageIndexable({ locationCount: minimumTreatmentPageLocations })).toBe(true);
  });

  test("adds eligible treatment pages and the index to the sitemap", () => {
    const treatment: TreatmentCatalogItem = {
      id: 20,
      name: "Peptide therapy",
      category: "Regenerative medicine",
      locationCount: minimumTreatmentPageLocations,
    };
    const urls = new Set(buildSitemap([treatment]).map((entry) => new URL(entry.url).pathname));

    expect(urls).toContain("/treatments");
    expect(urls).toContain("/treatments/peptide-therapy");
  });
});
