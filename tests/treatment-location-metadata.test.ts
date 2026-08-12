import { describe, expect, test } from "vitest";
import {
  directorySearchResultsHeading,
  treatmentLocationDescription,
  treatmentLocationResultsHeading,
} from "../src/lib/treatment-location-metadata";

describe("treatment location metadata", () => {
  test("describes the result count and selected treatment's lowest USD price", () => {
    expect(treatmentLocationDescription({
      total: 23,
      treatment: "Hyperbaric oxygen therapy",
      cityLabel: "Miami, FL",
      priceSummaries: [
        { currency: "USD", minimum: 199, offeringCount: 4, locationCount: 3 },
      ],
    })).toBe(
      "Compare 23 locations for Hyperbaric oxygen therapy in Miami, FL. Treatments starting at $199.",
    );
  });

  test("uses a natural plural label for DEXA location pages", () => {
    expect(treatmentLocationDescription({
      total: 12,
      treatment: "DEXA scan",
      cityLabel: "Houston, TX",
      priceSummaries: [
        { currency: "USD", minimum: 43, offeringCount: 7, locationCount: 6 },
      ],
    })).toBe(
      "Compare 12 locations for DEXA scans in Houston, TX. Treatments starting at $43.",
    );
  });

  test("omits the price claim when no preferred-currency treatment price exists", () => {
    expect(treatmentLocationDescription({
      total: 8,
      treatment: "MRI",
      cityLabel: "Denver, CO",
      priceSummaries: [],
    })).toBe("Compare 8 locations for MRI scans in Denver, CO.");

    expect(treatmentLocationDescription({
      total: 8,
      treatment: "MRI",
      cityLabel: "Denver, CO",
      priceSummaries: [
        { currency: "CAD", minimum: 299, offeringCount: 1, locationCount: 1 },
      ],
    })).toBe("Compare 8 locations for MRI scans in Denver, CO.");
  });

  test("preserves cents when the minimum is not a whole dollar", () => {
    expect(treatmentLocationDescription({
      total: 4,
      treatment: "VO2 max test",
      cityLabel: "Austin, TX",
      priceSummaries: [
        { currency: "usd", minimum: 149.5, offeringCount: 1, locationCount: 1 },
      ],
    })).toContain("Treatments starting at $149.50.");
  });

  test("adds the same live starting price to the visible results heading", () => {
    expect(treatmentLocationResultsHeading({
      total: 8,
      treatmentLabel: "DEXA scan",
      cityLabel: "Miami, FL",
      priceSummaries: [
        { currency: "USD", minimum: 59.95, offeringCount: 2, locationCount: 2 },
      ],
    })).toBe("DEXA scan in Miami, FL · 8 results · starting at $59.95");
  });

  test("keeps the visible results heading clean when no treatment price exists", () => {
    expect(treatmentLocationResultsHeading({
      total: 8,
      treatmentLabel: "DEXA scan",
      cityLabel: "Miami, FL",
    })).toBe("DEXA scan in Miami, FL · 8 results");
  });

  test("adds the live price to a top-level treatment page heading and description", () => {
    const priceSummaries = [
      { currency: "USD", minimum: 43, offeringCount: 5, locationCount: 4 },
    ];

    expect(treatmentLocationResultsHeading({
      total: 306,
      treatmentLabel: "DEXA scan",
      priceSummaries,
    })).toBe("DEXA scan · 306 results · starting at $43");
    expect(treatmentLocationDescription({
      total: 306,
      treatment: "DEXA scan",
      priceSummaries,
    })).toBe("Compare 306 locations for DEXA scans. Treatments starting at $43.");
  });

  test("preserves the user's text in a directory search heading", () => {
    expect(directorySearchResultsHeading({
      total: 424,
      query: "MRI",
      priceSummaries: [
        { currency: "USD", minimum: 249, offeringCount: 12, locationCount: 8 },
      ],
    })).toBe("424 results for MRI · starting at $249");
  });
});
