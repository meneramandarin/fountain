import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DirectoryShell, type DirectoryState, type SearchPayload } from "@/components/directory-shell";
import { directoryParamsFromState } from "@/lib/directory-search-state";
import { getCityIndexPlace, searchLocations } from "@/lib/queries";
import { ogImage, siteName, siteUrl } from "@/lib/site";
import {
  findPilotTreatmentLocationPage,
  pilotPlaceLabel,
  pilotTreatmentHref,
  pilotTreatmentLocationHref,
  pilotTreatmentLocationPages,
} from "@/lib/treatment-location-pages";

export const revalidate = 3600;
export const dynamicParams = false;

const minimumEligibleLocations = 2;

type TreatmentLocationRouteProps = {
  params: Promise<{ treatmentSlug: string; placeSlug: string }>;
};

const loadSearchPage = cache(async (treatmentSlug: string, placeSlug: string) => {
  const definition = findPilotTreatmentLocationPage(treatmentSlug, placeSlug);
  if (!definition) {
    return null;
  }

  const city = await getCityIndexPlace({
    city: definition.place.locality,
    region: definition.place.region,
    countryCode: definition.place.countryCode,
  });
  if (!city) {
    return null;
  }

  const cityLabel = pilotPlaceLabel({
    ...definition.place,
    locality: city.city,
    region: city.region || definition.place.region,
  });
  const state: DirectoryState = {
    kind: "locations",
    q: definition.treatment.name,
    country: "",
    locality: "",
    city_label: cityLabel,
    city_country: city.countryCode,
    place_type: "",
    city_lat: city.latitude,
    city_lng: city.longitude,
    treatment_ids: [],
    entity_type: "",
    care_model: "",
    page: 0,
  };
  const query = directoryParamsFromState(state);
  const payload = await searchLocations(query, state.page);

  return { definition, cityLabel, state, payload };
});

export function generateStaticParams() {
  return pilotTreatmentLocationPages.map((page) => ({
    treatmentSlug: page.treatment.slug,
    placeSlug: page.place.slug,
  }));
}

export async function generateMetadata({ params }: TreatmentLocationRouteProps): Promise<Metadata> {
  const { treatmentSlug, placeSlug } = await params;
  const page = await loadSearchPage(treatmentSlug, placeSlug);
  if (!page || page.payload.total < minimumEligibleLocations) {
    return { robots: { index: false, follow: false } };
  }

  const treatment = page.definition.treatment.searchLabel;
  const title = `${treatment} in ${page.cityLabel}`;
  const description = pageDescription(treatment, page.cityLabel, page.payload.total);
  const canonical = pilotTreatmentLocationHref(page.definition);

  return {
    title,
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
  if (!page || page.payload.total < minimumEligibleLocations) {
    notFound();
  }

  const treatment = page.definition.treatment.searchLabel;
  return (
    <>
      <DirectoryShell
        key={`${treatmentSlug}:${placeSlug}`}
        initialPayload={page.payload as SearchPayload}
        initialState={page.state}
        searchHeading={{
          treatmentLabel: treatment,
          treatmentHref: pilotTreatmentHref(page.definition),
          cityLabel: page.cityLabel,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: breadcrumbStructuredData(page.definition, page.cityLabel),
        }}
        type="application/ld+json"
      />
    </>
  );
}

function pageDescription(treatment: string, city: string, total: number) {
  return `${total.toLocaleString()} locations for ${treatment} are listed in ${city}.`;
}

function breadcrumbStructuredData(
  page: NonNullable<ReturnType<typeof findPilotTreatmentLocationPage>>,
  cityLabel: string,
) {
  const canonical = new URL(pilotTreatmentLocationHref(page), siteUrl).toString();
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
        name: page.treatment.searchLabel,
        item: new URL(pilotTreatmentHref(page), siteUrl).toString(),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: cityLabel,
        item: canonical,
      },
    ],
  }).replace(/</g, "\\u003c");
}
