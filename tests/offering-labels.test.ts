import { describe, expect, test } from "vitest";

import { getOfferingLabels } from "../src/lib/offering-labels";

describe("offering labels", () => {
  test.each([
    ["Full Body MRI", "Full-body MRI"],
    ["Biological Age Snapshot", "Epigenetic age clock"],
    ["Epigenetic Clock Testing", "Epigenetic age clock"],
  ])("defaults to one source-facing label for %s", (rawName, treatment) => {
    expect(getOfferingLabels({ raw_name: rawName, treatment })).toEqual({
      primary: rawName,
      secondary: null,
    });
  });

  test("keeps brand taxonomy available without rendering it as a second label", () => {
    expect(getOfferingLabels({
      raw_name: "Dysport",
      treatment: "Botox",
      treatment_display_mode: "raw_and_canonical",
    })).toEqual({ primary: "Dysport", secondary: null });
  });

  test("does not repeat equivalent labels even when dual display is requested", () => {
    expect(getOfferingLabels({
      raw_name: "Full Body MRI",
      treatment: "Full-body MRI",
      treatment_display_mode: "raw_and_canonical",
    })).toEqual({ primary: "Full Body MRI", secondary: null });
  });

  test("does not replace clinic wording with a canonical label", () => {
    expect(getOfferingLabels({
      raw_name: "exercise",
      treatment: "Exercise programming",
      treatment_display_mode: "canonical_only",
    })).toEqual({ primary: "Exercise", secondary: null });
  });

  test("capitalizes the source-facing offering label without changing its casing", () => {
    expect(getOfferingLabels({ raw_name: "biological age", treatment: "Epigenetic age clock" }))
      .toEqual({ primary: "Biological age", secondary: null });
    expect(getOfferingLabels({ raw_name: "NAD+ IV Therapy", treatment: "NAD+ IV therapy" }))
      .toEqual({ primary: "NAD+ IV Therapy", secondary: null });
  });

  test("collapses exact repeated extractor breadcrumbs in the display label", () => {
    expect(getOfferingLabels({ raw_name: "Kybella - Kybella", treatment: "Kybella" }))
      .toEqual({ primary: "Kybella", secondary: null });
    expect(getOfferingLabels({ raw_name: "Myers' Cocktail – Myers' Cocktail" }))
      .toEqual({ primary: "Myers' Cocktail", secondary: null });
  });

  test("preserves genuinely different variants around a separator", () => {
    expect(getOfferingLabels({ raw_name: "Botox - Botox, Xeomin, Dysport" }))
      .toEqual({ primary: "Botox - Botox, Xeomin, Dysport", secondary: null });
  });
});
