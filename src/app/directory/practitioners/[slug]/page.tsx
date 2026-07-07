import {
  DirectoryDetailPage,
  type PractitionerDetailRecord,
} from "@/components/directory-detail-page";
import { getPractitionerDetail, getRelatedTreatmentSearches } from "@/lib/queries";
import { ogImage, siteDescription } from "@/lib/site";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PractitionerPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PractitionerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const practitioner = (await getPractitionerDetail(slug)) as PractitionerDetailRecord | null;
  if (!practitioner) {
    return {};
  }

  const title = practitioner.full_name || "Directory listing";
  const specialty = practitioner.primary_specialty ? `${practitioner.primary_specialty}. ` : "";
  const description = `${specialty}${siteDescription}`;
  const canonicalPath = `/directory/practitioners/${practitioner.slug || practitioner.id}`;

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

export default async function PractitionerDetailRoute({ params, searchParams }: PractitionerPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const practitioner = (await getPractitionerDetail(slug)) as PractitionerDetailRecord | null;
  if (!practitioner) {
    notFound();
  }
  if (practitioner.slug && slug !== practitioner.slug) {
    const suffix = queryValue(query, "from") === "search" ? "?from=search" : "";
    redirect(`/directory/practitioners/${practitioner.slug}${suffix}`);
  }

  const affiliation = practitioner.affiliations?.[0];
  const relatedSearches = await getRelatedTreatmentSearches({
    countryCode: affiliation?.country_code,
    countryName: affiliation?.country_name,
    locality: affiliation?.locality,
    region: affiliation?.region,
  });

  return (
    <DirectoryDetailPage
      kind="practitioners"
      data={practitioner}
      relatedSearches={relatedSearches}
      showBackLink={queryValue(query, "from") === "search"}
    />
  );
}

function queryValue(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}
