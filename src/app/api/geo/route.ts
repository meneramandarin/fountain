import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VisitorLocationResponse = {
  location: {
    country?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    source: "vercel" | "ipapi" | "dev";
  } | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const devOverride = locationFromDevOverride(url);
  if (devOverride) {
    return geoResponse({ location: devOverride });
  }

  const headerLocation = locationFromVercelHeaders(request.headers);
  if (headerLocation) {
    return geoResponse({ location: headerLocation });
  }

  const ip = forwardedPublicIp(request.headers);
  if (!ip) {
    return geoResponse({ location: null });
  }

  const fallbackLocation = await locationFromIpApi(ip);
  return geoResponse({ location: fallbackLocation });
}

function geoResponse(payload: VisitorLocationResponse) {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function locationFromDevOverride(url: URL) {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const country = countryCode(url.searchParams.get("country"));
  if (!country) {
    return null;
  }

  return compactLocation({
    country,
    region: textValue(url.searchParams.get("region")),
    city: textValue(url.searchParams.get("city")),
    latitude: finiteNumber(url.searchParams.get("lat")),
    longitude: finiteNumber(url.searchParams.get("lng")),
    source: "dev" as const,
  });
}

function locationFromVercelHeaders(headers: Headers) {
  const country = countryCode(headers.get("x-vercel-ip-country"));
  if (!country) {
    return null;
  }

  return compactLocation({
    country,
    region: textValue(headers.get("x-vercel-ip-country-region")),
    city: textValue(decodeHeaderValue(headers.get("x-vercel-ip-city"))),
    latitude: finiteNumber(headers.get("x-vercel-ip-latitude")),
    longitude: finiteNumber(headers.get("x-vercel-ip-longitude")),
    source: "vercel" as const,
  });
}

async function locationFromIpApi(ip: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json() as {
      country_code?: string;
      region_code?: string;
      city?: string;
      latitude?: number | string;
      longitude?: number | string;
      error?: boolean;
    };
    if (data.error) {
      return null;
    }
    const country = countryCode(data.country_code || null);
    if (!country) {
      return null;
    }
    return compactLocation({
      country,
      region: textValue(data.region_code || null),
      city: textValue(data.city || null),
      latitude: finiteNumber(data.latitude),
      longitude: finiteNumber(data.longitude),
      source: "ipapi" as const,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function compactLocation<T extends { country?: string; source: "vercel" | "ipapi" | "dev" }>(location: T) {
  return location.country ? location : null;
}

function countryCode(value: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z][A-Z]$/.test(normalized) ? normalized : undefined;
}

function textValue(value: string | null | undefined) {
  return value?.trim() || undefined;
}

function finiteNumber(value: string | number | null | undefined) {
  if (value == null || value === "") {
    return undefined;
  }
  const numberValue = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function decodeHeaderValue(value: string | null) {
  if (!value) {
    return value;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function forwardedPublicIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for") || headers.get("x-real-ip") || "";
  const candidate = forwardedFor.split(",")[0]?.trim();
  if (!candidate || isPrivateIp(candidate)) {
    return null;
  }
  return candidate;
}

function isPrivateIp(ip: string) {
  return ip === "::1"
    || ip === "127.0.0.1"
    || ip.startsWith("10.")
    || ip.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    || /^fc/i.test(ip)
    || /^fd/i.test(ip);
}
