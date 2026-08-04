import { describe, expect, it } from "vitest";

import {
  buildInternationalMetroCoverageQueries,
  INTERNATIONAL_METRO_COVERAGE_MARKETS,
  INTERNATIONAL_METRO_COVERAGE_TREATMENT_GROUPS,
} from "../pipeline/config/international-metro-coverage.mjs";

describe("international metro coverage plan", () => {
  it("builds every requested market and treatment-group combination", () => {
    const queries = buildInternationalMetroCoverageQueries();
    expect(queries).toHaveLength(
      INTERNATIONAL_METRO_COVERAGE_MARKETS.length
        * INTERNATIONAL_METRO_COVERAGE_TREATMENT_GROUPS.length,
    );
    expect(new Set(queries.map((query) => query.id)).size).toBe(queries.length);
    expect(queries.some((query) => (
      query.market === "Abu Dhabi" && query.country_code === "AE"
    ))).toBe(true);
    expect(queries.some((query) => (
      query.market === "London" && query.currency === "GBP"
    ))).toBe(true);
    expect(queries.some((query) => (
      query.market === "Bangkok" && query.currency === "THB"
    ))).toBe(true);
    expect(queries.some((query) => query.treatments.includes("Hormone optimization"))).toBe(true);
  });
});
