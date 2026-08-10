import { siteUrl } from "@/lib/site";

type OpeningPeriod = {
  day?: string | null;
  open?: string | null;
  close?: string | null;
};

type OpeningHours = OpeningPeriod[] | Record<string, OpeningPeriod[]>;

export type LocationStructuredDataInput = {
  id: number;
  slug?: string | null;
  name?: string | null;
  org_name?: string | null;
  address?: string | null;
  locality?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  opening_hours?: OpeningHours | null;
  images?: Array<{ blob_url?: string | null }>;
};

const schemaDays = new Map([
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
]);

export function buildLocationStructuredData(
  location: LocationStructuredDataInput,
  baseUrl = siteUrl,
) {
  const name = clean(location.name) || clean(location.org_name);
  const slug = clean(location.slug) || String(location.id);
  if (!name || !slug) {
    return null;
  }

  const canonicalUrl = new URL(`/directory/locations/${slug}`, baseUrl).toString();
  const address = postalAddress(location);
  const geo = geoCoordinates(location.latitude, location.longitude);
  const images = (location.images || [])
    .map((image) => publicHttpUrl(image.blob_url, baseUrl))
    .filter((url): url is string => Boolean(url));
  const sameAs = publicHttpUrl(location.website, baseUrl);
  const openingHoursSpecification = openingHours(location.opening_hours);

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${canonicalUrl}#business`,
    name,
    url: canonicalUrl,
    ...(sameAs ? { sameAs } : {}),
    ...(clean(location.phone) ? { telephone: clean(location.phone) } : {}),
    ...(clean(location.email) ? { email: clean(location.email) } : {}),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
    ...(images.length ? { image: images } : {}),
    ...(openingHoursSpecification.length ? { openingHoursSpecification } : {}),
  };
}

export function serializeStructuredData(value: object) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function postalAddress(location: LocationStructuredDataInput) {
  const values = {
    streetAddress: clean(location.address),
    addressLocality: clean(location.locality),
    addressRegion: clean(location.region),
    postalCode: clean(location.postal_code),
    addressCountry: clean(location.country_code) || clean(location.country_name),
  };
  const present = Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return Object.keys(present).length
    ? { "@type": "PostalAddress", ...present }
    : null;
}

function geoCoordinates(latitude: number | null | undefined, longitude: number | null | undefined) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { "@type": "GeoCoordinates", latitude: lat, longitude: lng };
}

function openingHours(hours?: OpeningHours | null) {
  const periods = Array.isArray(hours)
    ? hours
    : Object.entries(hours || {}).flatMap(([day, entries]) =>
        Array.isArray(entries) ? entries.map((entry) => ({ ...entry, day })) : [],
      );

  return periods.flatMap((period) => {
    const day = schemaDays.get(clean(period.day)?.toLowerCase() || "");
    const opens = clean(period.open);
    const closes = clean(period.close);
    return day && opens && closes
      ? [{
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${day}`,
          opens,
          closes,
        }]
      : [];
  });
}

function publicHttpUrl(value: string | null | undefined, baseUrl: URL) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function clean(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}
