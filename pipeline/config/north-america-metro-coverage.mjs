export const NORTH_AMERICA_METRO_COVERAGE_CAMPAIGN = "north_america_metro_coverage_20260724";

export const NORTH_AMERICA_METRO_COVERAGE_MARKETS = Object.freeze([
  Object.freeze({ market: "Vancouver", region: "British Columbia", country_code: "CA", country_name: "Canada" }),
  Object.freeze({ market: "Seattle", region: "Washington", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Denver", region: "Colorado", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Boulder", region: "Colorado", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Phoenix", region: "Arizona", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Scottsdale", region: "Arizona", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Las Vegas", region: "Nevada", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Chicago", region: "Illinois", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Atlanta", region: "Georgia", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Charlotte", region: "North Carolina", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Washington", region: "District of Columbia", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Boston", region: "Massachusetts", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Philadelphia", region: "Pennsylvania", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Houston", region: "Texas", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Dallas", region: "Texas", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Baltimore", region: "Maryland", country_code: "US", country_name: "United States" }),
  Object.freeze({ market: "Montreal", region: "Quebec", country_code: "CA", country_name: "Canada" }),
  Object.freeze({ market: "Toronto", region: "Ontario", country_code: "CA", country_name: "Canada" }),
]);

export const NORTH_AMERICA_METRO_COVERAGE_TREATMENT_GROUPS = Object.freeze([
  Object.freeze({
    key: "iv_and_vitamins",
    treatments: Object.freeze([
      "IV Drip",
      "IV therapy",
      "IV infusion",
      "NAD+",
      "Vitamin B",
      "vitamin D IV",
    ]),
  }),
  Object.freeze({
    key: "peptides",
    treatments: Object.freeze([
      "Peptide therapy",
      "BPC-157",
      "MOTS-c",
    ]),
  }),
  Object.freeze({
    key: "ketamine",
    treatments: Object.freeze([
      "ketamine therapy",
      "ketamine IV",
    ]),
  }),
  Object.freeze({
    key: "sauna",
    treatments: Object.freeze(["Sauna"]),
  }),
  Object.freeze({
    key: "advanced_labs_and_hormones",
    treatments: Object.freeze([
      "Advanced biomarker panel",
      "Advanced blood panel",
      "Telomere testing",
      "Epigenetic age clock",
      "Hormone testing",
      "Hormone optimization",
    ]),
  }),
  Object.freeze({
    key: "advanced_imaging",
    treatments: Object.freeze([
      "Full-body CT",
      "Full-body MRI",
    ]),
  }),
  Object.freeze({
    key: "cryo",
    treatments: Object.freeze([
      "Cryotherapy",
      "Whole-body cryotherapy",
    ]),
  }),
]);

export function buildNorthAmericaMetroCoverageQueries() {
  return NORTH_AMERICA_METRO_COVERAGE_MARKETS.flatMap((location, marketIndex) => (
    NORTH_AMERICA_METRO_COVERAGE_TREATMENT_GROUPS.map((group, groupIndex) => ({
      id: marketIndex * NORTH_AMERICA_METRO_COVERAGE_TREATMENT_GROUPS.length + groupIndex + 1,
      ...location,
      currency: location.country_code === "CA" ? "CAD" : "USD",
      group: group.key,
      treatments: [...group.treatments],
    }))
  ));
}
