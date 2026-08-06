import { describe, expect, test } from "vitest";
import { orderTreatmentChips } from "../src/lib/treatment-chip-order";

const treatments = [
  { id: 1, name: "DEXA scan", domain: "Diagnostics" },
  { id: 2, name: "Body composition analysis", domain: "Diagnostics" },
  { id: 8, name: "VO2 max test", domain: "Diagnostics" },
  { id: 3, name: "Advanced blood panel", domain: "Diagnostics" },
];

describe("orderTreatmentChips", () => {
  test("puts the searched treatment first so it is always visible on the card", () => {
    expect(orderTreatmentChips(treatments, [8], 3).map((treatment) => treatment.name)).toEqual([
      "VO2 max test",
      "DEXA scan",
      "Body composition analysis",
    ]);
  });

  test("does not add a searched treatment that the clinic does not offer", () => {
    expect(orderTreatmentChips(treatments, [99], 3).map((treatment) => treatment.name)).toEqual([
      "DEXA scan",
      "Body composition analysis",
      "VO2 max test",
    ]);
  });

  test("preserves the selected order when more than one treatment is filtered", () => {
    expect(orderTreatmentChips(treatments, [8, 1], 3).map((treatment) => treatment.name)).toEqual([
      "VO2 max test",
      "DEXA scan",
      "Body composition analysis",
    ]);
  });
});
