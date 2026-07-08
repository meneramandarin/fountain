const hiddenRegionNames = new Set([
  "africa",
  "antarctica",
  "asia",
  "europe",
  "north america",
  "oceania",
  "south america",
]);

type LocationPlaceInput = {
  locality?: string | null;
  region?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
};

export function formatLocationPlace({ locality, region, countryCode, countryName }: LocationPlaceInput) {
  const cleanLocality = cleanPart(locality);
  const cleanRegion = visibleRegion(region, countryCode, countryName);
  const cleanCountry = cleanPart(countryName) || cleanPart(countryCode);

  return [cleanLocality, cleanRegion, cleanCountry].filter(Boolean).join(", ");
}

function visibleRegion(region?: string | null, countryCode?: string | null, countryName?: string | null) {
  const cleanRegion = cleanPart(region);
  if (!cleanRegion) {
    return null;
  }

  const normalizedRegion = normalize(cleanRegion);
  if (
    hiddenRegionNames.has(normalizedRegion) ||
    cleanRegion.includes(",") ||
    normalizedRegion === normalize(countryName) ||
    normalizedRegion === normalize(countryCode)
  ) {
    return null;
  }

  return cleanRegion;
}

function cleanPart(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalize(value?: string | null) {
  return cleanPart(value)?.toLowerCase() || "";
}
