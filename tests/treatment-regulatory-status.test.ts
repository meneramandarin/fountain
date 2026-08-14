import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TreatmentRegulatoryStatus } from "../src/components/treatment-regulatory-status";
import {
  treatmentFdaRegulatoryStatuses,
  treatmentFdaRegulatoryStatusCopy,
} from "../src/lib/treatment-regulatory-status";
// @ts-expect-error The refresh job is an ESM JavaScript script without declarations.
import {
  classifyDevice,
  treatmentDeviceQueries,
} from "../scripts/refresh-treatment-fda-statuses.mjs";

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

  test.each([
    ["Body composition analysis", "MNW"],
    ["Colonoscopy", "FDF"],
    ["Compression therapy", "JOW"],
    ["CT", "JAK"],
    ["DEXA scan", "KGI"],
    ["Dialysis", "KDI"],
    ["Echocardiography", "DXK"],
    ["Electrical muscle stimulation", "IPF"],
    ["Electrocardiography", "DPS"],
    ["Endoscopy", "GCQ"],
    ["Fluoroscopy", "JAA"],
    ["Hyperbaric oxygen therapy", "CBF"],
    ["Mammography", "MUE"],
    ["Microneedling", "QAI"],
    ["MRI", "LNH"],
    ["Nuclear medicine imaging", "JWM"],
    ["Peripheral nerve stimulation", "GZF"],
    ["PET scan", "KPS"],
    ["Pulmonary function testing", "BZG"],
    ["Sleep study", "OLV"],
    ["Spinal cord stimulation", "GZB"],
    ["Transcranial magnetic stimulation", "OBP"],
    ["Ultrasound imaging", "IYO"],
    ["VO2 max test", "BZL"],
    ["Whole-body MRI", "LNH"],
    ["X-ray", "KPR"],
  ])("matches %s through its exact FDA device product code", async (treatmentName, productCode) => {
    const query = treatmentDeviceQueries.get(treatmentName);
    const requestedUrls: URL[] = [];
    const status = await classifyDevice(query, async (url: URL) => {
      requestedUrls.push(url);
      return url.pathname.endsWith("/510k.json") ? { results: [{}] } : null;
    });

    expect(status).toBe("cleared_or_approved_device");
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[1].pathname).toBe("/device/510k.json");
    expect(requestedUrls[1].searchParams.get("search")).toBe(`product_code:\"${productCode}\"`);
  });

  test("shows device records on the treatment page and mini menu", () => {
    const pageHtml = renderToStaticMarkup(createElement(TreatmentRegulatoryStatus, {
      status: "cleared_or_approved_device",
      treatmentName: "DEXA scan",
    }));
    const menuHtml = renderToStaticMarkup(createElement(TreatmentRegulatoryStatus, {
      status: "cleared_or_approved_device",
      treatmentName: "Hyperbaric oxygen therapy",
      variant: "menu",
    }));

    expect(pageHtml).toContain("FDA-cleared or approved device records found");
    expect(menuHtml).toContain("FDA-cleared or approved device records found");
    expect(menuHtml).toContain("/treatments/hyperbaric-oxygen-therapy");
  });
});
