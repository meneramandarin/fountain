import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TreatmentExternalData } from "../src/components/treatment-external-data";
import {
  hasTreatmentExternalData,
  type TreatmentExternalData as TreatmentExternalDataRecord,
} from "../src/lib/treatment-external-data";

const sourceData: TreatmentExternalDataRecord = {
  treatmentName: "Sermorelin",
  clinicalTrials: {
    total: 27,
    recruiting: 1,
    withResults: 11,
    statusCounts: { RECRUITING: 1, COMPLETED: 20 },
    sourceUrl: "https://clinicaltrials.gov/search?intr=sermorelin",
    updatedAt: "2026-08-13T09:00:04",
    records: [
      {
        nctId: "NCT06554717",
        title: "Tesamorelin as an Adjunct to Exercise",
        status: "RECRUITING",
        phases: ["PHASE2"],
        enrollment: 100,
        hasResults: false,
        updatedAt: "2026-08-12",
      },
    ],
  },
};

describe("external treatment source data", () => {
  test("limits the mock to the two reviewed canonical names", () => {
    expect(hasTreatmentExternalData("Sermorelin")).toBe(true);
    expect(hasTreatmentExternalData("rapamycin")).toBe(true);
    expect(hasTreatmentExternalData("NAD+ IV therapy")).toBe(false);
  });

  test("renders API fields and source records without an authored summary", () => {
    const markup = renderToStaticMarkup(createElement(TreatmentExternalData, { data: sourceData }));

    expect(markup).toContain("27 clinical trials on ClinicalTrials.gov");
    expect(markup).toContain("1 recruiting");
    expect(markup).toContain("11 with results");
    expect(markup).toContain("NCT06554717");
  });

  test("keeps the clinic-menu variant to one compact research link", () => {
    const markup = renderToStaticMarkup(createElement(TreatmentExternalData, {
      data: sourceData,
      variant: "menu",
    }));

    expect(markup).toContain("clinic-treatment-source-facts");
    expect(markup).toContain("ClinicalTrials.gov");
    expect(markup).not.toContain("View source records");
  });
});
