import { describe, expect, it } from "vitest";

import {
  buildSouthFloridaCoverageQueries,
  SOUTH_FLORIDA_COVERAGE_MARKETS,
  SOUTH_FLORIDA_COVERAGE_TREATMENT_GROUPS,
} from "../pipeline/config/south-florida-coverage.mjs";

describe("South Florida coverage plan", () => {
  it("builds every market and treatment-group combination", () => {
    const queries = buildSouthFloridaCoverageQueries();
    expect(queries).toHaveLength(
      SOUTH_FLORIDA_COVERAGE_MARKETS.length * SOUTH_FLORIDA_COVERAGE_TREATMENT_GROUPS.length,
    );
    expect(new Set(queries.map((query) => query.id)).size).toBe(queries.length);
    expect(queries.every((query) => query.region === "Florida")).toBe(true);
    expect(queries.some((query) => query.market === "Miami")).toBe(true);
    expect(queries.some((query) => query.market === "Fort Lauderdale")).toBe(true);
    expect(queries.some((query) => query.market === "Palm Beach")).toBe(true);
  });
});
