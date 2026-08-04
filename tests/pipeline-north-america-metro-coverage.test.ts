import { describe, expect, it } from "vitest";

import {
  buildNorthAmericaMetroCoverageQueries,
  NORTH_AMERICA_METRO_COVERAGE_MARKETS,
  NORTH_AMERICA_METRO_COVERAGE_TREATMENT_GROUPS,
} from "../pipeline/config/north-america-metro-coverage.mjs";

describe("North America metro coverage plan", () => {
  it("builds every US and Canadian market and treatment-group combination", () => {
    const queries = buildNorthAmericaMetroCoverageQueries();
    expect(queries).toHaveLength(
      NORTH_AMERICA_METRO_COVERAGE_MARKETS.length
        * NORTH_AMERICA_METRO_COVERAGE_TREATMENT_GROUPS.length,
    );
    expect(new Set(queries.map((query) => query.id)).size).toBe(queries.length);
    expect(queries.some((query) => query.market === "Vancouver" && query.country_code === "CA"))
      .toBe(true);
    expect(queries.some((query) => query.market === "Toronto" && query.currency === "CAD"))
      .toBe(true);
    expect(queries.some((query) => query.market === "Scottsdale" && query.country_code === "US"))
      .toBe(true);
    expect(queries.some((query) => query.treatments.includes("Whole-body cryotherapy"))).toBe(true);
  });
});
