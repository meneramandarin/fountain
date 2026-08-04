import {
  NORTH_AMERICA_METRO_COVERAGE_TREATMENT_GROUPS,
} from "./north-america-metro-coverage.mjs";

export const INTERNATIONAL_METRO_COVERAGE_CAMPAIGN = "international_metro_coverage_20260724";

export const INTERNATIONAL_METRO_COVERAGE_MARKETS = Object.freeze([
  Object.freeze({
    market: "Dubai",
    region: "Dubai",
    allowed_regions: ["Dubai"],
    country_code: "AE",
    country_name: "United Arab Emirates",
    currency: "AED",
  }),
  Object.freeze({
    market: "Qatar",
    region: "Doha",
    allowed_regions: ["Doha", "Qatar"],
    country_code: "QA",
    country_name: "Qatar",
    currency: "QAR",
  }),
  Object.freeze({
    market: "Abu Dhabi",
    region: "Abu Dhabi",
    allowed_regions: ["Abu Dhabi"],
    country_code: "AE",
    country_name: "United Arab Emirates",
    currency: "AED",
  }),
  Object.freeze({
    market: "Munich",
    region: "Bavaria",
    allowed_regions: ["Bavaria", "Bayern"],
    country_code: "DE",
    country_name: "Germany",
    currency: "EUR",
  }),
  Object.freeze({
    market: "Berlin",
    region: "Berlin",
    allowed_regions: ["Berlin"],
    country_code: "DE",
    country_name: "Germany",
    currency: "EUR",
  }),
  Object.freeze({
    market: "London",
    region: "Greater London",
    allowed_regions: ["Greater London", "London"],
    country_code: "GB",
    country_name: "United Kingdom",
    currency: "GBP",
  }),
  Object.freeze({
    market: "Ibiza",
    region: "Balearic Islands",
    allowed_regions: ["Balearic Islands", "Illes Balears", "Ibiza"],
    country_code: "ES",
    country_name: "Spain",
    currency: "EUR",
  }),
  Object.freeze({
    market: "Paris",
    region: "Île-de-France",
    allowed_regions: ["Île-de-France", "Ile-de-France", "Paris"],
    country_code: "FR",
    country_name: "France",
    currency: "EUR",
  }),
  Object.freeze({
    market: "Bali",
    region: "Bali",
    allowed_regions: ["Bali"],
    country_code: "ID",
    country_name: "Indonesia",
    currency: "IDR",
  }),
  Object.freeze({
    market: "Bangkok",
    region: "Bangkok",
    allowed_regions: ["Bangkok"],
    country_code: "TH",
    country_name: "Thailand",
    currency: "THB",
  }),
  Object.freeze({
    market: "Tulum",
    region: "Quintana Roo",
    allowed_regions: ["Quintana Roo"],
    country_code: "MX",
    country_name: "Mexico",
    currency: "MXN",
  }),
  Object.freeze({
    market: "Mexico City",
    region: "Mexico City",
    allowed_regions: ["Mexico City", "Ciudad de México", "CDMX"],
    country_code: "MX",
    country_name: "Mexico",
    currency: "MXN",
  }),
  Object.freeze({
    market: "Cape Town",
    region: "Western Cape",
    allowed_regions: ["Western Cape"],
    country_code: "ZA",
    country_name: "South Africa",
    currency: "ZAR",
  }),
  Object.freeze({
    market: "Lisbon",
    region: "Lisbon",
    allowed_regions: ["Lisbon", "Lisboa"],
    country_code: "PT",
    country_name: "Portugal",
    currency: "EUR",
  }),
  Object.freeze({
    market: "Singapore",
    region: "Singapore",
    allowed_regions: ["Singapore"],
    country_code: "SG",
    country_name: "Singapore",
    currency: "SGD",
  }),
]);

export const INTERNATIONAL_METRO_COVERAGE_TREATMENT_GROUPS =
  NORTH_AMERICA_METRO_COVERAGE_TREATMENT_GROUPS;

export function buildInternationalMetroCoverageQueries() {
  return INTERNATIONAL_METRO_COVERAGE_MARKETS.flatMap((location, marketIndex) => (
    INTERNATIONAL_METRO_COVERAGE_TREATMENT_GROUPS.map((group, groupIndex) => ({
      id: marketIndex * INTERNATIONAL_METRO_COVERAGE_TREATMENT_GROUPS.length + groupIndex + 1,
      ...location,
      group: group.key,
      treatments: [...group.treatments],
    }))
  ));
}
