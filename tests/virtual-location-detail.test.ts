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
  test("labels virtual listings and omits directions and the map", () => {
    const markup = renderLocation({ is_virtual: true });

    expect(markup).toContain("listing-location-virtual-badge");
    expect(markup).toContain("Virtual");
    expect(markup).not.toContain("Get directions");
    expect(markup).not.toContain("listing-location-map-section");
  });

  test("keeps directions and the map for physical listings", () => {
    const markup = renderLocation({ is_virtual: false });

    expect(markup).not.toContain("listing-location-virtual-badge");
    expect(markup).toContain("Get directions");
    expect(markup).toContain("listing-location-map-section");
  });
});
