import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { LandingSeoDiscovery } from "../src/components/landing-seo-discovery";
import {
  treatmentHref,
  type TreatmentCatalogItem,
} from "../src/lib/treatment-pages";

const treatments: TreatmentCatalogItem[] = [
  {
    id: 1,
    name: "DEXA scan",
    category: "Diagnostics & testing",
    locationCount: 20,
  },
  {
    id: 2,
    name: "NAD+ IV therapy",
    category: "IV & infusion",
    locationCount: 40,
  },
  {
    id: 3,
    name: "Hyperbaric oxygen therapy",
    category: "Recovery & performance",
    locationCount: 30,
  },
  {
    id: 4,
    name: "Recovery treatment one",
    category: "Recovery & performance",
    locationCount: 20,
  },
  {
    id: 5,
    name: "Recovery treatment two",
    category: "Recovery & performance",
    locationCount: 19,
  },
  {
    id: 6,
    name: "Recovery treatment three",
    category: "Recovery & performance",
    locationCount: 18,
  },
  {
    id: 7,
    name: "Lower-coverage recovery treatment",
    category: "Recovery & performance",
    locationCount: 1,
  },
];

describe("landing SEO discovery", () => {
  test("links every live indexable city page once through the city-first section", () => {
    const markup = renderDiscovery();

    for (const page of locationPages) {
      const href = `href="${page.href}"`;
      expect(markup.split(href)).toHaveLength(2);
    }
  });

  test("links every displayed treatment to its treatment-only page", () => {
    const markup = renderDiscovery();

    for (const treatment of treatments.slice(0, 6)) {
      expect(markup).toContain(`href="${treatmentHref(treatment)}"`);
    }
    expect(markup).not.toContain(`href="${treatmentHref(treatments[6])}"`);
    expect(markup).toContain('href="/treatments"');
  });

  test("contains no parameterized directory-search links", () => {
    const markup = renderDiscovery();

    expect(markup).toContain("Explore by location");
    expect(markup).toContain("Explore treatments");
    expect(markup).toContain("Browse 6 popular treatments");
    expect(markup).toContain("Browse treatment guides available by city");
    expect(markup).not.toContain("currently available by city");
    expect(markup).not.toContain("/directory?");
    expect(markup).not.toContain("eyebrow");
  });

  test("uses flat text columns without reusing editorial imagery", () => {
    const markup = renderDiscovery();

    expect(markup.match(/class="location-search-column"/g)).toHaveLength(5);
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("/domains/");
    expect(markup).not.toContain("cityShortcuts");
  });
});

function renderDiscovery() {
  return renderToStaticMarkup(
    createElement(LandingSeoDiscovery, { treatments, locationPages }),
  );
}

const locationPages = [
  {
    href: "/treatments/dexa-scan/austin-tx",
    treatmentLabel: "DEXA scan",
    cityLabel: "Austin, TX",
    city: "Austin",
    locationCount: 7,
  },
  {
    href: "/treatments/nad-iv-therapy/miami-fl",
    treatmentLabel: "NAD+ IV therapy",
    cityLabel: "Miami, FL",
    city: "Miami",
    locationCount: 5,
  },
];
