import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TreatmentRegulatoryStatus } from "../src/components/treatment-regulatory-status";
import {
  treatmentFdaRegulatoryStatuses,
  treatmentFdaRegulatoryStatusCopy,
} from "../src/lib/treatment-regulatory-status";

describe("treatment FDA regulatory status", () => {
  test("has one bounded copy definition for every allowed database code", () => {
    expect(Object.keys(treatmentFdaRegulatoryStatusCopy).sort()).toEqual(
      [...treatmentFdaRegulatoryStatuses].sort(),
    );

    for (const copy of Object.values(treatmentFdaRegulatoryStatusCopy)) {
      expect(copy.heading.length).toBeLessThanOrEqual(56);
      expect(copy.menu.length).toBeLessThanOrEqual(48);
      expect(`${copy.heading}${copy.menu}`).not.toContain("\n");
      expect(copy).not.toHaveProperty("detail");
    }
  });

  test("renders only the fixed approved-drug wording", () => {
    const html = renderToStaticMarkup(createElement(TreatmentRegulatoryStatus, {
      status: "approved_drug",
      treatmentName: "Rapamycin",
    }));

    expect(html).toContain("FDA-approved drug products available");
    expect(html).not.toContain("Approval applies to specific products, formulations, and uses.");
    expect(html).not.toContain("<p>");
    expect(html).not.toContain("Rapamycin is FDA approved");
  });

  test("keeps non-product services out of the frontend", () => {
    const html = renderToStaticMarkup(createElement(TreatmentRegulatoryStatus, {
      status: "not_applicable",
      treatmentName: "Massage therapy",
    }));

    expect(html).toBe("");
  });

  test("uses the shorter fixed wording on menu items", () => {
    const html = renderToStaticMarkup(createElement(TreatmentRegulatoryStatus, {
      status: "approved_drug_discontinued",
      treatmentName: "Sermorelin",
      variant: "menu",
    }));

    expect(html).toContain("Historical FDA drug approval");
    expect(html).toContain("/treatments/sermorelin");
  });
});
