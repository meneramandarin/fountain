import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { DirectoryDetailPage, type LocationDetailRecord } from "../src/components/directory-detail-page";

function renderLocation(overrides: Partial<LocationDetailRecord> = {}) {
  return renderToStaticMarkup(createElement(DirectoryDetailPage, {
    kind: "locations",
    data: {
      id: 1,
      slug: "example-clinic",
      name: "Example Clinic",
      locality: "Austin",
      region: "TX",
      latitude: 30.2672,
      longitude: -97.7431,
      offerings: [],
      ...overrides,
    },
  }));
}

describe("virtual location detail", () => {
  test("labels virtual listings in the metadata row and omits physical location details", () => {
    const markup = renderLocation({ is_virtual: true });
    const metadataIndex = markup.indexOf("listing-location-meta");
    const virtualBadgeIndex = markup.indexOf("listing-location-virtual-badge");
    const clinicFactsStart = markup.indexOf("clinic-details-facts");
    const clinicFactsEnd = markup.indexOf("</div>", clinicFactsStart);
    const clinicFacts = markup.slice(clinicFactsStart, clinicFactsEnd);

    expect(virtualBadgeIndex).toBeGreaterThan(metadataIndex);
    expect(markup).toContain("Virtual");
    expect(clinicFacts).toContain("Virtual");
    expect(clinicFacts).not.toContain("Austin");
    expect(markup).not.toContain("Austin, TX");
    expect(markup).not.toContain("Get directions");
    expect(markup).not.toContain("listing-location-map-section");
  });

  test("keeps directions and the map for physical listings", () => {
    const markup = renderLocation({ is_virtual: false });

    expect(markup).not.toContain("listing-location-virtual-badge");
    expect(markup).toContain("Austin, TX");
    expect(markup).toContain("Get directions");
    expect(markup).toContain("listing-location-map-section");
  });
});
