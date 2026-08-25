import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  DirectoryDetailPage,
  type LocationDetailRecord,
} from "../src/components/directory-detail-page";
import { locationHref } from "../src/lib/directory-urls";
import { groupOfferingsByCategory } from "../src/components/treatment-menu";

const offerings = [
  { raw_name: "Red light", domain: "Recover" },
  { raw_name: "Blood panel", domain: "Measure" },
  { raw_name: "IV infusion", domain: "Optimize" },
  { raw_name: "DEXA scan", domain: "measure" },
  { raw_name: "Cryotherapy", domain: "Recover" },
];

function renderLocation(
  menu: LocationDetailRecord["offerings"],
  focusedTreatment?: string,
) {
  return renderToStaticMarkup(createElement(DirectoryDetailPage, {
    kind: "locations",
    data: {
      id: 1,
      name: "Example Clinic",
      offerings: menu,
    },
    focusedTreatment,
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

  test("groups membership plans under Other without changing ordinary monthly protocols", () => {
    const groups = groupOfferingsByCategory([
      {
        raw_name: "Core Membership",
        domain: "Optimize",
        price_unit: "month",
        price_context: "Official monthly membership price.",
      },
      {
        raw_name: "BHL Access Pass",
        domain: "Optimize",
        price_unit: "month",
        price_context: "Published monthly membership price.",
      },
      {
        raw_name: "Longevity Protocol - 4 Sessions per Month",
        domain: "Recover",
        price_unit: "month",
        price_context: "Official monthly HBOT protocol price.",
      },
    ]);

    expect(groups.map((group) => group.category)).toEqual(["Recover", "Other"]);
    expect(groups[0].offerings.map(({ offering }) => offering.raw_name)).toEqual([
      "Longevity Protocol - 4 Sessions per Month",
    ]);
    expect(groups[1].offerings.map(({ offering }) => offering.raw_name)).toEqual([
      "Core Membership",
      "BHL Access Pass",
    ]);
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

  test("selects the focused treatment category and moves that treatment to the top", () => {
    const menu = [
      ...offerings,
      {
        raw_name: "Hyperbaric Chamber",
        treatment: "Hyperbaric Oxygen Therapy",
        domain: "Recover",
      },
    ];
    const groups = groupOfferingsByCategory(menu, "Hyperbaric Oxygen Therapy");
    const recover = groups.find((group) => group.category === "Recover");
    const markup = renderLocation(menu, "Hyperbaric Oxygen Therapy");

    expect(recover?.offerings.map(({ offering }) => offering.raw_name)).toEqual([
      "Hyperbaric Chamber",
      "Red light",
      "Cryotherapy",
    ]);
    expect(markup).toMatch(/aria-selected="true"[^>]*role="tab"[^>]*>Recover<\/button>/);
    expect(markup.indexOf("Hyperbaric Chamber")).toBeLessThan(markup.indexOf("Red light"));
  });

  test("moves a focused treatment first even when the clinic has no category tabs", () => {
    const markup = renderLocation([
      { raw_name: "Cryotherapy", treatment: "Cryotherapy", domain: "Recover" },
      { raw_name: "NAD+", treatment: "NAD+ IV Therapy", domain: "Optimize" },
      { raw_name: "Red light", treatment: "Red Light Therapy", domain: "Recover" },
    ], "NAD+ IV Therapy");

    expect(markup).not.toContain('role="tablist"');
    expect(markup.indexOf("NAD+")).toBeLessThan(markup.indexOf("Cryotherapy"));
  });

  test("adds treatment context to clinic links without changing ordinary links", () => {
    const location = { id: 12, slug: "example-clinic" };

    expect(locationHref(location)).toBe("/directory/locations/example-clinic");
    expect(locationHref(location, { treatment: "NAD+ IV Therapy" })).toBe(
      "/directory/locations/example-clinic?treatment=NAD%2B+IV+Therapy",
    );
  });
});
