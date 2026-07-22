import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DirectoryShell, type DirectoryState, type SearchPayload } from "@/components/directory-shell";
import { directoryParamsFromState } from "@/lib/directory-search-state";
import { getTreatmentCatalog, searchLocations } from "@/lib/queries";
import { siteUrl } from "@/lib/site";
import { treatmentHref, treatmentSlug } from "@/lib/treatment-pages";

export const revalidate = 86_400;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

type TreatmentPageProps = {
  params: Promise<{ treatmentSlug: string }>;
};

const loadTreatmentPage = cache(async (slug: string) => {
  const treatment = (await getTreatmentCatalog(0)).find((candidate) => treatmentSlug(candidate.name) === slug);
  if (!treatment) {
    return null;
  }

  const state: DirectoryState = {
    kind: "locations",
    q: "",
    country: "",
    locality: "",
    city_label: "",
    city_country: "",
    place_type: "",
    city_lat: undefined,
    city_lng: undefined,
    treatment_ids: [String(treatment.id)],
    entity_type: "",
    care_model: "",
    page: 0,
  };
  const payload = await searchLocations(directoryParamsFromState(state), state.page);
  return { treatment, state, payload };
});

export async function generateMetadata({ params }: TreatmentPageProps): Promise<Metadata> {
  const page = await loadTreatmentPage((await params).treatmentSlug);
  if (!page) {
    return { robots: { index: false, follow: false } };
  }

  const title = `${page.treatment.name} Clinics & Locations | Fountain`;
  const description = `${page.payload.total.toLocaleString()} locations for ${page.treatment.name} are listed on Fountain.`;
  const canonical = treatmentHref(page.treatment);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: { index: page.payload.total > 0, follow: true },
    openGraph: { type: "website", title, description, url: canonical },
  };
}

export default async function TreatmentPage({ params }: TreatmentPageProps) {
  const page = await loadTreatmentPage((await params).treatmentSlug);
  if (!page) {
    notFound();
  }

  return (
    <>
      <DirectoryShell
        key={String(page.treatment.id)}
        initialPayload={page.payload as SearchPayload}
        initialState={page.state}
        initialTreatmentLabel={page.treatment.name}
        searchHeading={{ treatmentLabel: page.treatment.name }}
      />
      <script
        dangerouslySetInnerHTML={{ __html: breadcrumbStructuredData(page.treatment.name, treatmentHref(page.treatment)) }}
        type="application/ld+json"
      />
    </>
  );
}

function breadcrumbStructuredData(treatment: string, canonical: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "All treatments",
        item: new URL("/treatments", siteUrl).toString(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: treatment,
        item: new URL(canonical, siteUrl).toString(),
      },
    ],
  }).replace(/</g, "\\u003c");
}
