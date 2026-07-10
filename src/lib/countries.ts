export const iso2ToDisplay: Record<string, string> = {
  AE: "United Arab Emirates",
  AT: "Austria",
  AU: "Australia",
  AZ: "Azerbaijan",
  BE: "Belgium",
  BR: "Brazil",
  BY: "Belarus",
  CA: "Canada",
  CH: "Switzerland",
  CN: "China",
  CO: "Colombia",
  CR: "Costa Rica",
  CY: "Cyprus",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  DO: "Dominican Republic",
  EG: "Egypt",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  GR: "Greece",
  HK: "Hong Kong",
  HU: "Hungary",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IT: "Italy",
  JM: "Jamaica",
  JP: "Japan",
  KR: "South Korea",
  LV: "Latvia",
  MA: "Morocco",
  ME: "Montenegro",
  MX: "Mexico",
  MY: "Malaysia",
  NL: "Netherlands",
  NO: "Norway",
  NZ: "New Zealand",
  PA: "Panama",
  PH: "Philippines",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SE: "Sweden",
  SG: "Singapore",
  TH: "Thailand",
  TR: "Türkiye",
  UA: "Ukraine",
  US: "United States",
  ZA: "South Africa",
};

export function countryDisplayName(countryCode?: string | null, countryName?: string | null) {
  const cleanName = countryName?.trim();
  if (cleanName) {
    return cleanName;
  }
  const code = countryCode?.trim().toUpperCase();
  if (!code) {
    return null;
  }
  return iso2ToDisplay[code] || null;
}
