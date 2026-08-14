import {
  DirectoryDetailPage,
  type LocationDetailRecord,
} from "@/components/directory-detail-page";
import { getLocationDetail, getRelatedTreatmentSearches } from "@/lib/queries";
import { formatLocationPlace } from "@/lib/location-display";
import { buildLocationStructuredData, serializeStructuredData } from "@/lib/location-structured-data";
import { ogImage, siteDescription } from "@/lib/site";
import { isSitemapLocationIndexable } from "@/lib/sitemap-indexability";
import { getTreatmentExternalDataForNames } from "@/lib/treatment-external-data";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

export const revalidate = 3_600;
export const dynamicParams = true;
export const runtime = "nodejs";

export function generateStaticParams() {
  return [];
}

type LocationPageProps = {
  params: Promise<{ slug: string }>;
};

const loadLocation = cache(async (slug: string) =>
  (await getLocationDetail(slug)) as LocationDetailRecord | null,
);

export async function generateMetadata({ params }: LocationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const location = await loadLocation(slug);
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
  const indexable = isLocationDetailIndexable(location);

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

export default async function LocationDetailRoute({ params }: LocationPageProps) {
  const { slug } = await params;
  const location = await loadLocation(slug);
  if (!location) {
    notFound();
  }
  const canonicalSlug = location.slug || String(location.id);
  if (slug !== canonicalSlug) {
    permanentRedirect(`/directory/locations/${canonicalSlug}`);
  }

  const [relatedSearches, treatmentExternalData] = await Promise.all([
    getRelatedTreatmentSearches({
      countryCode: location.country_code,
      countryName: location.country_name,
      locality: location.locality,
      region: location.region,
    }),
    getTreatmentExternalDataForNames(
      (location.offerings || []).map((offering) => offering.treatment),
    ),
  ]);

  const structuredData = isLocationDetailIndexable(location)
    ? buildLocationStructuredData(location)
    : null;

  return (
    <>
      <DirectoryDetailPage
        kind="locations"
        data={location}
        relatedSearches={relatedSearches}
        treatmentExternalData={treatmentExternalData}
      />
      {structuredData ? (
        <script
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
          type="application/ld+json"
        />
      ) : null}
    </>
  );
}

function isLocationDetailIndexable(location: LocationDetailRecord) {
  return isSitemapLocationIndexable({
    slug: location.slug || String(location.id),
    title: location.name || location.org_name,
    hasPlace: Boolean(location.address?.trim() || location.locality?.trim()),
    hasContact: Boolean(location.phone?.trim() || location.email?.trim() || location.website?.trim()),
    hasOffering: Boolean(location.offerings?.length),
    hasImage: Boolean(location.images?.length),
    hasHours: Boolean(location.opening_hours || location.opening_hours_note?.trim()),
  });
}
