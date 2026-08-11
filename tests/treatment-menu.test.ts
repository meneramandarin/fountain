import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  DirectoryDetailPage,
  type LocationDetailRecord,
} from "../src/components/directory-detail-page";
import { groupOfferingsByCategory } from "../src/components/treatment-menu";

const offerings = [
  { raw_name: "Red light", domain: "Recover" },
  { raw_name: "Blood panel", domain: "Measure" },
  { raw_name: "IV infusion", domain: "Optimize" },
  { raw_name: "DEXA scan", domain: "measure" },
  { raw_name: "Cryotherapy", domain: "Recover" },
];

function renderLocation(menu: LocationDetailRecord["offerings"]) {
  return renderToStaticMarkup(createElement(DirectoryDetailPage, {
    kind: "locations",
    data: {
      id: 1,
      name: "Example Clinic",
      offerings: menu,
    },
  }));
}

describe("treatment menu categories", () => {
  test("groups offerings in Fountain category order while preserving menu order", () => {
    const groups = groupOfferingsByCategory([
      ...offerings,
      { raw_name: "Custom service", domain: null },
    ]);

    expect(groups.map((group) => group.category)).toEqual(["Measure", "Optimize", "Recover", "Other"]);
    expect(groups[0].offerings.map(({ offering }) => offering.raw_name)).toEqual(["Blood panel", "DEXA scan"]);
    expect(groups[2].offerings.map(({ offering }) => offering.raw_name)).toEqual(["Red light", "Cryotherapy"]);
  });

  test("renders category tabs only when a listing has more than four menu items", () => {
    const largeMenu = renderLocation(offerings);
    const smallMenu = renderLocation(offerings.slice(0, 4));

    expect(largeMenu).toContain('role="tablist"');
    expect(largeMenu).toContain(">Measure</button>");
    expect(largeMenu).toContain(">Optimize</button>");
    expect(largeMenu).toContain(">Recover</button>");
    expect(smallMenu).not.toContain('role="tablist"');
  });
});
