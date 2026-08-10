import {
  DirectoryDetailPage,
  type LocationDetailRecord,
} from "@/components/directory-detail-page";
import { getLocationDetail, getRelatedTreatmentSearches } from "@/lib/queries";
import { formatLocationPlace } from "@/lib/location-display";
import { ogImage, siteDescription } from "@/lib/site";
import { isSitemapLocationIndexable } from "@/lib/sitemap-indexability";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LocationPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: LocationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const location = (await getLocationDetail(slug)) as LocationDetailRecord | null;
  if (!location) {
    return {};
  }

  const title = location.name || location.org_name || "Directory listing";
  const place = formatLocationPlace({
    locality: location.locality,
    region: location.region,
    countryCode: location.country_code,
    countryName: location.country_name,
  });
  const description = place ? `${title} in ${place}. ${siteDescription}` : siteDescription;
  const canonicalPath = `/directory/locations/${location.slug || location.id}`;
  const indexable = isSitemapLocationIndexable({
    slug: location.slug || String(location.id),
    title,
    hasPlace: Boolean(location.address?.trim() || location.locality?.trim()),
    hasContact: Boolean(location.phone?.trim() || location.email?.trim() || location.website?.trim()),
    hasOffering: Boolean(location.offerings?.length),
    hasImage: Boolean(location.images?.length),
    hasHours: Boolean(location.opening_hours || location.opening_hours_note?.trim()),
  });

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: { index: indexable, follow: true },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url],
    },
  };
}

export default async function LocationDetailRoute({ params, searchParams }: LocationPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const location = (await getLocationDetail(slug)) as LocationDetailRecord | null;
  if (!location) {
    notFound();
  }
  const canonicalSlug = location.slug || String(location.id);
  if (slug !== canonicalSlug || queryValue(query, "from")) {
    permanentRedirect(`/directory/locations/${canonicalSlug}`);
  }

  const relatedSearches = await getRelatedTreatmentSearches({
    countryCode: location.country_code,
    countryName: location.country_name,
    locality: location.locality,
    region: location.region,
  });

  return (
    <DirectoryDetailPage
      kind="locations"
      data={location}
      relatedSearches={relatedSearches}
    />
  );
}

function queryValue(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}
