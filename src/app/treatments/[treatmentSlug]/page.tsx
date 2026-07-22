import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SplitDirectorySearch } from "@/components/split-directory-search";
import { cityLabel, getTreatmentHub } from "@/lib/treatment-hubs";
import { siteUrl } from "@/lib/site";
import { isTreatmentPageIndexable } from "@/lib/treatment-pages";
import styles from "../treatments.module.css";

export const revalidate = 86_400;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

type TreatmentPageProps = {
  params: Promise<{ treatmentSlug: string }>;
};

const loadTreatmentHub = cache(getTreatmentHub);

export async function generateMetadata({ params }: TreatmentPageProps): Promise<Metadata> {
  const hub = await loadTreatmentHub((await params).treatmentSlug);
  if (!hub) {
    return { robots: { index: false, follow: false } };
  }

  const title = `${hub.treatment.name} Clinics & Locations | Fountain`;
  const description = pageDescription(hub.totalLocations, hub.totalCities);
  const canonical = hub.href;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: { index: isTreatmentPageIndexable(hub.totalCities), follow: true },
    openGraph: { type: "website", title, description, url: canonical },
  };
}

export default async function TreatmentPage({ params }: TreatmentPageProps) {
  const hub = await loadTreatmentHub((await params).treatmentSlug);
  if (!hub) {
    notFound();
  }

  return (
    <main className={styles.page}>
      <div className={styles.hub}>
        <h1>{hub.treatment.name}</h1>

        <SplitDirectorySearch
          className={styles.hubSearch}
          initialWhat={hub.treatment.name}
          initialTreatmentId={String(hub.treatment.id)}
          initialWhere=""
          kind="locations"
        />

        <ul className={styles.cityList}>
          {hub.cities.map((city) => (
            <li key={city.href}>
              <Link href={city.href}>
                <span>
                  {cityLabel(city)} · {city.locationCount.toLocaleString()} locations
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <script
        dangerouslySetInnerHTML={{ __html: breadcrumbStructuredData(hub.treatment.name, hub.href) }}
        type="application/ld+json"
      />
    </main>
  );
}

function pageDescription(locations: number, cities: number) {
  return `${locations.toLocaleString()} locations across ${cities.toLocaleString()} cities.`;
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
