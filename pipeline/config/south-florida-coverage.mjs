import { CALIFORNIA_COVERAGE_TREATMENT_GROUPS } from "./california-coverage.mjs";

export const SOUTH_FLORIDA_COVERAGE_CAMPAIGN = "south_florida_coverage_20260724";

export const SOUTH_FLORIDA_COVERAGE_MARKETS = Object.freeze([
  "Miami",
  "Miami Beach",
  "South Beach",
  "Brickell",
  "Coral Gables",
  "Coconut Grove",
  "Key Biscayne",
  "Pinecrest",
  "Kendall",
  "Doral",
  "North Miami",
  "Aventura",
  "Bal Harbour",
  "Sunny Isles Beach",
  "Fort Lauderdale",
  "Hollywood",
  "Hallandale Beach",
  "Dania Beach",
  "Davie",
  "Plantation",
  "Pembroke Pines",
  "Weston",
  "Pompano Beach",
  "Deerfield Beach",
  "Boca Raton",
  "Delray Beach",
  "Boynton Beach",
  "West Palm Beach",
  "Palm Beach",
  "Wellington",
  "Jupiter",
]);

export const SOUTH_FLORIDA_COVERAGE_TREATMENT_GROUPS = CALIFORNIA_COVERAGE_TREATMENT_GROUPS;

export function buildSouthFloridaCoverageQueries() {
  return SOUTH_FLORIDA_COVERAGE_MARKETS.flatMap((market, marketIndex) => (
    SOUTH_FLORIDA_COVERAGE_TREATMENT_GROUPS.map((group, groupIndex) => ({
      id: marketIndex * SOUTH_FLORIDA_COVERAGE_TREATMENT_GROUPS.length + groupIndex + 1,
      market,
      region: "Florida",
      country_code: "US",
      group: group.key,
      treatments: [...group.treatments],
    }))
  ));
}
