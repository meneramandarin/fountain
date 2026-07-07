import {
  DirectoryDetailPage,
  type LocationDetailRecord,
} from "@/components/directory-detail-page";
import { getLocationDetail, getRelatedTreatmentSearches } from "@/lib/queries";
import { ogImage, siteDescription } from "@/lib/site";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

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
  const place = [location.locality, location.region, location.country_name].filter(Boolean).join(", ");
  const description = place ? `${title} in ${place}. ${siteDescription}` : siteDescription;
  const canonicalPath = `/directory/locations/${location.slug || location.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
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
  if (location.slug && slug !== location.slug) {
    const suffix = queryValue(query, "from") === "search" ? "?from=search" : "";
    redirect(`/directory/locations/${location.slug}${suffix}`);
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
      showBackLink={queryValue(query, "from") === "search"}
    />
  );
}

function queryValue(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}
