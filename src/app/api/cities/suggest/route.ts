import { rows } from "@/lib/db";
import { countryDisplayName } from "@/lib/countries";
import { mergeCitySuggestions, parseGooglePlaceLabel, type CitySuggestion } from "@/lib/city-suggestions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CityIndexRow = {
  city: string;
  region: string | null;
  country_code: string;
  country_name: string | null;
  latitude: number;
  longitude: number;
  listing_count: number;
  image_coverage: number;
};

type CountryIndexRow = {
  country_code: string;
  country_name: string | null;
  listing_count: number;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const sessionToken = cleanToken(url.searchParams.get("session_token"));

  const inventoryPromise = query ? inventoryPrefixSuggestions(query, 3) : topInventoryCities(request.headers, 8);
  const countryPromise = query ? inventoryCountrySuggestions(query, 4) : Promise.resolve([]);
  const googlePromise = query ? googleCitySuggestions(query, sessionToken) : Promise.resolve([]);
  const [inventory, countries, google] = await Promise.all([inventoryPromise, countryPromise, googlePromise]);

  const suggestions = mergeCitySuggestions([
    ...inventory.map(cityRowToSuggestion),
    ...google.filter((suggestion) => suggestion.place_type !== "country"),
    ...countries.map(countryRowToSuggestion),
    ...google.filter((suggestion) => suggestion.place_type === "country"),
  ], query ? 6 : 8);

  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function inventoryPrefixSuggestions(query: string, limit: number) {
  const normalized = query.toLowerCase();
  return rows<CityIndexRow>(
    `
    SELECT city, region, country_code, country_name, latitude, longitude, listing_count, image_coverage
    FROM city_index
    WHERE lower(city) LIKE ? || '%'
    ORDER BY listing_count DESC, image_coverage DESC, city
    LIMIT ?
  `,
    [normalized, limit],
  );
}

async function inventoryCountrySuggestions(query: string, limit: number) {
  const normalized = query.toLowerCase();
  return rows<CountryIndexRow>(
    `
    SELECT country_code, MAX(country_name) AS country_name, SUM(listing_count)::int AS listing_count
    FROM city_index
    GROUP BY country_code
    HAVING lower(COALESCE(MAX(country_name), country_code)) LIKE ? || '%'
       OR lower(country_code) LIKE ? || '%'
    ORDER BY SUM(listing_count) DESC, COALESCE(MAX(country_name), country_code)
    LIMIT ?
  `,
    [normalized, normalized, limit],
  );
}

async function topInventoryCities(headers: Headers, limit: number) {
  const cities = await rows<CityIndexRow>(
    `
    SELECT city, region, country_code, country_name, latitude, longitude, listing_count, image_coverage
    FROM city_index
    ORDER BY listing_count DESC, image_coverage DESC, city
    LIMIT ?
  `,
    [limit],
  );
  const visitor = visitorPoint(headers);
  if (!visitor || cities.length < 2) {
    return cities;
  }
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < cities.length; index += 1) {
    const distance = haversineMiles(visitor.lat, visitor.lng, cities[index].latitude, cities[index].longitude);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  if (nearestIndex <= 0) {
    return cities;
  }
  const nearest = cities[nearestIndex];
  return [nearest, ...cities.slice(0, nearestIndex), ...cities.slice(nearestIndex + 1)];
}

function cityRowToSuggestion(row: CityIndexRow): CitySuggestion {
  return {
    id: `inventory:${row.country_code}:${row.city.toLowerCase()}`,
    source: "inventory",
    place_type: "locality",
    label: cityLabel(row.city, row.region, row.country_code),
    city: row.city,
    region: row.region,
    country_code: row.country_code,
    country_name: row.country_name,
    lat: row.latitude,
    lng: row.longitude,
    has_inventory: true,
  };
}

function countryRowToSuggestion(row: CountryIndexRow): CitySuggestion {
  const displayName = countryDisplayName(row.country_code, row.country_name) || row.country_code;
  return {
    id: `inventory-country:${row.country_code}`,
    source: "inventory",
    place_type: "country",
    label: displayName,
    city: displayName,
    region: null,
    country_code: row.country_code,
    country_name: displayName,
    lat: null,
    lng: null,
    has_inventory: true,
  };
}

async function googleCitySuggestions(query: string, sessionToken: string | null): Promise<CitySuggestion[]> {
  const apiKey = googleApiKey();
  if (!apiKey) {
    return [];
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.types",
      },
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: ["locality", "country"],
        languageCode: "en",
        ...(sessionToken ? { sessionToken } : {}),
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json() as {
      suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string }; types?: string[] } }[];
    };
    return (data.suggestions || [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is { placeId: string; text?: { text?: string }; types?: string[] } => Boolean(prediction?.placeId))
      .slice(0, 5)
      .map((prediction) => {
        const label = prediction.text?.text || "Unknown city";
        const placeType = prediction.types?.includes("country") ? "country" : "locality";
        const parsed = parseGooglePlaceLabel(label, placeType);
        return {
          id: `google:${prediction.placeId}`,
          source: "google",
          place_type: placeType,
          label,
          city: parsed.city || label,
          region: parsed.region,
          country_code: parsed.countryCode,
          country_name: parsed.countryName,
          lat: null,
          lng: null,
          has_inventory: false,
          place_id: prediction.placeId,
        };
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function cityLabel(city: string, region: string | null | undefined, countryCode: string | null | undefined) {
  return [city, region, countryCode === "US" ? "USA" : countryCode].filter(Boolean).join(", ");
}

function visitorPoint(headers: Headers) {
  const lat = finiteNumber(headers.get("x-vercel-ip-latitude"));
  const lng = finiteNumber(headers.get("x-vercel-ip-longitude"));
  return lat !== undefined && lng !== undefined ? { lat, lng } : null;
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function finiteNumber(value: string | number | null | undefined) {
  if (value == null || value === "") {
    return undefined;
  }
  const numberValue = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function cleanToken(value: string | null) {
  const trimmed = value?.trim();
  return trimmed && /^[A-Za-z0-9_-]{8,128}$/.test(trimmed) ? trimmed : null;
}

function googleApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || "";
}
