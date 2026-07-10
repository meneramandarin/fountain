export type GeocodeLocationInput = {
  name?: string | null;
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  country_name?: string | null;
};

export type GeocodeResult = {
  query_string: string;
  latitude: number | null;
  longitude: number | null;
  location_type: string | null;
  formatted_address: string | null;
  returned_country_code: string | null;
  returned_country_name: string | null;
  low_confidence: boolean;
  needs_review: boolean;
  reason: string;
};

const apiKeyEnvNames = ["GOOGLE_GEOCODING_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY", "GOOGLE_PLACES_API_KEY"];
const writableLocationTypes = new Set(["ROOFTOP", "RANGE_INTERPOLATED", "GEOMETRIC_CENTER", "APPROXIMATE"]);
const lowConfidenceLocationTypes = new Set(["GEOMETRIC_CENTER", "APPROXIMATE"]);

export function buildLocationGeocodeQuery(location: GeocodeLocationInput) {
  const address = cleanPart(location.address);
  if (address) {
    return uniqueParts([
      address,
      location.locality,
      location.region,
      location.postal_code,
      location.country_name,
    ]).join(", ");
  }
  return uniqueParts([
    location.name,
    location.locality,
    location.country_name,
  ]).join(", ");
}

export function hasUsableCoordinates(latitude: unknown, longitude: unknown) {
  return typeof latitude === "number"
    && Number.isFinite(latitude)
    && typeof longitude === "number"
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

export async function geocodeLocationInput(location: GeocodeLocationInput): Promise<GeocodeResult> {
  const queryString = buildLocationGeocodeQuery(location);
  if (!queryString) {
    return emptyResult(queryString, "no_query");
  }

  const apiKey = apiKeyEnvNames.map((key) => process.env[key]).find(Boolean);
  if (!apiKey) {
    return emptyResult(queryString, "missing_google_geocoding_api_key");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", queryString);
  url.searchParams.set("key", apiKey);

  let payload: GoogleGeocodePayload;
  try {
    const response = await fetch(url);
    payload = await response.json() as GoogleGeocodePayload;
  } catch {
    return emptyResult(queryString, "api_error");
  }

  if (payload.status !== "OK") {
    return emptyResult(queryString, payload.status === "ZERO_RESULTS" ? "zero_results" : "api_status");
  }

  const expectedCountryCode = normalizeCountryCode(location.country_code);
  const result = chooseResult(payload.results || [], expectedCountryCode);
  const returnedCountryCode = normalizeCountryCode(countryComponent(result, "short_name"));
  const returnedCountryName = countryComponent(result, "long_name");
  const locationType = result?.geometry?.location_type || null;

  if (!expectedCountryCode || !returnedCountryCode || expectedCountryCode !== returnedCountryCode) {
    return {
      ...resultFields(queryString, result),
      returned_country_code: returnedCountryCode,
      returned_country_name: returnedCountryName,
      low_confidence: false,
      needs_review: true,
      reason: "country_mismatch",
    };
  }

  if (!writableLocationTypes.has(locationType || "")) {
    return {
      ...resultFields(queryString, result),
      returned_country_code: returnedCountryCode,
      returned_country_name: returnedCountryName,
      low_confidence: false,
      needs_review: true,
      reason: "unsupported_location_type",
    };
  }

  return {
    ...resultFields(queryString, result),
    returned_country_code: returnedCountryCode,
    returned_country_name: returnedCountryName,
    low_confidence: lowConfidenceLocationTypes.has(locationType || ""),
    needs_review: false,
    reason: lowConfidenceLocationTypes.has(locationType || "") ? "low_confidence_country_match" : "street_level_country_match",
  };
}

function chooseResult(results: GoogleGeocodeResult[], expectedCountryCode: string | null) {
  return results.find((result) => {
    const resultCountryCode = normalizeCountryCode(countryComponent(result, "short_name"));
    return expectedCountryCode && resultCountryCode === expectedCountryCode && writableLocationTypes.has(result.geometry?.location_type || "");
  }) || results.find((result) => {
    const resultCountryCode = normalizeCountryCode(countryComponent(result, "short_name"));
    return expectedCountryCode && resultCountryCode === expectedCountryCode;
  }) || results[0] || null;
}

function resultFields(queryString: string, result: GoogleGeocodeResult | null) {
  return {
    query_string: queryString,
    latitude: result?.geometry?.location?.lat ?? null,
    longitude: result?.geometry?.location?.lng ?? null,
    location_type: result?.geometry?.location_type || null,
    formatted_address: result?.formatted_address || null,
  };
}

function emptyResult(queryString: string, reason: string): GeocodeResult {
  return {
    query_string: queryString,
    latitude: null,
    longitude: null,
    location_type: null,
    formatted_address: null,
    returned_country_code: null,
    returned_country_name: null,
    low_confidence: false,
    needs_review: true,
    reason,
  };
}

function countryComponent(result: GoogleGeocodeResult | null, field: "short_name" | "long_name") {
  return result?.address_components?.find((component) => component.types.includes("country"))?.[field] || null;
}

function uniqueParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const part of parts) {
    const clean = cleanPart(part);
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      output.push(clean);
    }
  }
  return output;
}

function cleanPart(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeCountryCode(value: string | null | undefined) {
  const clean = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(clean) ? clean : null;
}

type GoogleGeocodePayload = {
  status: string;
  results?: GoogleGeocodeResult[];
};

type GoogleGeocodeResult = {
  formatted_address?: string;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  geometry?: {
    location_type?: string;
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};
