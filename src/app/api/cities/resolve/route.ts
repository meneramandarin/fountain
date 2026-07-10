import { NextResponse } from "next/server";
import { countryDisplayName } from "@/lib/countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const placeId = cleanPlaceId(url.searchParams.get("place_id"));
  const sessionToken = cleanToken(url.searchParams.get("session_token"));
  const apiKey = googleApiKey();

  if (!placeId || !apiKey) {
    return NextResponse.json({ city: null }, { status: placeId ? 200 : 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : ""}`, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents,types",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ city: null });
    }
    const data = await response.json() as {
      id?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
      types?: string[];
    };
    const country = component(data.addressComponents, "country");
    const region = component(data.addressComponents, "administrative_area_level_1");
    const countryCode = country?.shortText && /^[A-Z][A-Z]$/.test(country.shortText) ? country.shortText : undefined;
    const placeType = data.types?.includes("country") ? "country" : "locality";
    const countryName = countryDisplayName(countryCode, country?.longText) || country?.longText || null;
    const city = placeType === "country"
      ? countryName || data.formattedAddress?.split(",")[0]?.trim()
      : component(data.addressComponents, "locality") || data.formattedAddress?.split(",")[0]?.trim();
    const label = placeType === "country"
      ? countryName || data.formattedAddress || [city, countryCode].filter(Boolean).join(", ")
      : data.formattedAddress || [city, region?.shortText, countryCode].filter(Boolean).join(", ");
    return NextResponse.json({
      city: placeType === "country" || (data.location?.latitude != null && data.location?.longitude != null) ? {
        id: `google:${data.id || placeId}`,
        source: "google",
        place_type: placeType,
        label,
        city: city || label,
        region: region?.shortText || region?.longText || null,
        country_code: countryCode || null,
        country_name: countryName,
        lat: placeType === "country" ? null : data.location?.latitude,
        lng: placeType === "country" ? null : data.location?.longitude,
        has_inventory: false,
        place_id: placeId,
      } : null,
    });
  } catch {
    return NextResponse.json({ city: null });
  } finally {
    clearTimeout(timeout);
  }
}

function component(components: { longText?: string; shortText?: string; types?: string[] }[] | undefined, type: string) {
  return components?.find((item) => item.types?.includes(type));
}

function cleanPlaceId(value: string | null) {
  const trimmed = value?.trim();
  return trimmed && /^[A-Za-z0-9_-]{8,256}$/.test(trimmed) ? trimmed : null;
}

function cleanToken(value: string | null) {
  const trimmed = value?.trim();
  return trimmed && /^[A-Za-z0-9_-]{8,128}$/.test(trimmed) ? trimmed : null;
}

function googleApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || "";
}
