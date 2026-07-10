import { rows } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CitySuggestion = {
  id: string;
  source: "inventory" | "google";
  label: string;
  city: string;
  region?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  has_inventory: boolean;
  place_id?: string;
};

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const sessionToken = cleanToken(url.searchParams.get("session_token"));

  const inventoryPromise = query ? inventoryPrefixSuggestions(query, 3) : topInventoryCities(request.headers, 8);
  const googlePromise = query ? googleCitySuggestions(query, sessionToken) : Promise.resolve([]);
  const [inventory, google] = await Promise.all([inventoryPromise, googlePromise]);

  const suggestions = mergeSuggestions([
    ...inventory.map(cityRowToSuggestion),
    ...google,
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
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      },
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: ["locality"],
        languageCode: "en",
        ...(sessionToken ? { sessionToken } : {}),
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json() as {
      suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
    };
    return (data.suggestions || [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is { placeId: string; text?: { text?: string } } => Boolean(prediction?.placeId))
      .slice(0, 5)
      .map((prediction) => {
        const label = prediction.text?.text || "Unknown city";
        const parsed = parseGoogleLabel(label);
        return {
          id: `google:${prediction.placeId}`,
          source: "google",
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

function mergeSuggestions(suggestions: CitySuggestion[], limit: number) {
  const seen = new Set<string>();
  const merged: CitySuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = `${normalizeText(suggestion.city)}:${suggestion.country_code || normalizeText(suggestion.country_name || "")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(suggestion);
    if (merged.length >= limit) {
      break;
    }
  }
  return merged;
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

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseGoogleLabel(label: string) {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  const countryName = parts.at(-1);
  return {
    city: parts[0],
    region: parts.length > 2 ? parts.at(-2) : undefined,
    countryName,
    countryCode: countryName === "USA" || countryName === "United States" ? "US" : undefined,
  };
}
