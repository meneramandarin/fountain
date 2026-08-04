export const CALIFORNIA_COVERAGE_CAMPAIGN = "california_coverage_20260723";

export const CALIFORNIA_COVERAGE_MARKETS = Object.freeze([
  "Bay Area",
  "San Francisco",
  "San Jose",
  "Palo Alto",
  "Berkeley",
  "Fremont",
  "Redwood City",
  "Stanford",
  "Menlo Park",
  "Mountain View",
  "Santa Clara",
  "Los Altos",
  "Atherton",
  "Sausalito",
  "Tiburon",
  "Mill Valley",
  "Monterey",
  "Carmel-by-the-Sea",
  "Los Angeles",
  "Santa Monica",
  "Venice",
  "Marina del Rey",
  "Santa Barbara",
  "San Diego",
  "Hollywood",
  "West Hollywood",
  "Beverly Hills",
  "El Segundo",
  "Manhattan Beach",
  "Long Beach",
  "Newport Beach",
  "Laguna Beach",
  "Carlsbad",
]);

export const CALIFORNIA_COVERAGE_TREATMENT_GROUPS = Object.freeze([
  Object.freeze({
    key: "iv_and_vitamins",
    treatments: Object.freeze([
      "IV Drip",
      "IV therapy",
      "IV infusion",
      "NAD+",
      "Vitamin B",
      "vitamin D",
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
      "ketamine",
    ]),
  }),
  Object.freeze({
    key: "sauna",
    treatments: Object.freeze(["Sauna"]),
  }),
  Object.freeze({
    key: "advanced_labs",
    treatments: Object.freeze([
      "Advanced biomarker panel",
      "Advanced blood panel",
      "Telomere testing",
      "Epigenetic age clock",
      "Hormone testing",
      "Cardiometabolic testing",
    ]),
  }),
  Object.freeze({
    key: "advanced_imaging_and_screening",
    treatments: Object.freeze([
      "Full-body CT",
      "Full-body MRI",
      "Cardiac screening",
      "Cancer screening",
    ]),
  }),
  Object.freeze({
    key: "sleep_studies",
    treatments: Object.freeze([
      "Sleep study",
    ]),
  }),
]);

export function buildCaliforniaCoverageQueries() {
  return CALIFORNIA_COVERAGE_MARKETS.flatMap((market, marketIndex) => (
    CALIFORNIA_COVERAGE_TREATMENT_GROUPS.map((group, groupIndex) => ({
      id: marketIndex * CALIFORNIA_COVERAGE_TREATMENT_GROUPS.length + groupIndex + 1,
      market,
      region: "California",
      country_code: "US",
      group: group.key,
      treatments: [...group.treatments],
    }))
  ));
}
