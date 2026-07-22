import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { DirectoryShell, type DirectoryState, type SearchPayload } from "@/components/directory-shell";
import { directoryParamsFromState } from "@/lib/directory-search-state";
import { cityLabel, getTreatmentCityPage } from "@/lib/treatment-hubs";
import { searchLocations } from "@/lib/queries";
import { ogImage, siteName, siteUrl } from "@/lib/site";

export const revalidate = 86_400;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

type TreatmentLocationRouteProps = {
  params: Promise<{ treatmentSlug: string; placeSlug: string }>;
};

const loadSearchPage = cache(async (treatmentSlug: string, placeSlug: string) => {
  const resolved = await getTreatmentCityPage(treatmentSlug, placeSlug);
  if (!resolved) {
    return null;
  }
  if (!resolved.city.indexable) {
    permanentRedirect(resolved.city.href);
  }

  const label = cityLabel(resolved.city);
  const state: DirectoryState = {
    kind: "locations",
    q: "",
    country: "",
    locality: "",
    city_label: label,
    city_country: resolved.city.countryCode,
    place_type: "",
    city_lat: resolved.city.latitude,
    city_lng: resolved.city.longitude,
    treatment_ids: [String(resolved.hub.treatment.id)],
    entity_type: "",
    care_model: "",
    page: 0,
  };
  const payload = await searchLocations(directoryParamsFromState(state), state.page);
  return { ...resolved, cityLabel: label, state, payload };
});

export async function generateMetadata({ params }: TreatmentLocationRouteProps): Promise<Metadata> {
  const { treatmentSlug, placeSlug } = await params;
  const page = await loadSearchPage(treatmentSlug, placeSlug);
  if (!page) {
    return { robots: { index: false, follow: false } };
  }

  const treatment = page.hub.treatment.name;
  const title = `${treatment} in ${page.cityLabel}`;
  const description = `${page.payload.total.toLocaleString()} locations for ${treatment} are listed in ${page.cityLabel}.`;
  const canonical = page.city.href;

  return {
    title: { absolute: `${title} | ${siteName}` },
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      title: `${title} | ${siteName}`,
      description,
      url: canonical,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${siteName}`,
      description,
      images: [ogImage.url],
    },
  };
}

export default async function TreatmentLocationPage({ params }: TreatmentLocationRouteProps) {
  const { treatmentSlug, placeSlug } = await params;
  const page = await loadSearchPage(treatmentSlug, placeSlug);
  if (!page) {
    notFound();
  }

  const treatment = page.hub.treatment.name;
  return (
    <>
      <DirectoryShell
        key={`${treatmentSlug}:${placeSlug}`}
        initialPayload={page.payload as SearchPayload}
        initialState={page.state}
        initialTreatmentLabel={treatment}
        searchHeading={{
          treatmentLabel: treatment,
          treatmentHref: page.hub.href,
          cityLabel: page.cityLabel,
        }}
      />
      <script
        dangerouslySetInnerHTML={{ __html: breadcrumbStructuredData(page.hub.href, page.city.href, treatment, page.cityLabel) }}
        type="application/ld+json"
      />
    </>
  );
}

function breadcrumbStructuredData(treatmentHref: string, cityHref: string, treatment: string, city: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "All treatments", item: new URL("/treatments", siteUrl) },
      { "@type": "ListItem", position: 2, name: treatment, item: new URL(treatmentHref, siteUrl) },
      { "@type": "ListItem", position: 3, name: city, item: new URL(cityHref, siteUrl) },
    ],
  }).replace(/</g, "\\u003c");
}
