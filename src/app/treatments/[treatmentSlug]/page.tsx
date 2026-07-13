import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DirectoryLocationCard } from "@/components/directory-location-card";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { getTreatmentCatalog, getTreatmentLandingData } from "@/lib/queries";
import { siteName, siteUrl } from "@/lib/site";
import { findPilotTreatmentLocationHref } from "@/lib/treatment-location-pages";
import {
  isTreatmentPageIndexable,
  treatmentHref,
  treatmentSlug,
  type TreatmentCatalogItem,
} from "@/lib/treatment-pages";
import styles from "../treatments.module.css";

export const revalidate = 3600;

type TreatmentPageProps = {
  params: Promise<{ treatmentSlug: string }>;
};

const loadTreatmentCatalog = cache(() => getTreatmentCatalog());
const loadTreatmentPage = cache(async (slug: string) => {
  const treatment = (await loadTreatmentCatalog()).find((candidate) => treatmentSlug(candidate.name) === slug);
  if (!treatment) {
    return null;
  }
  return { treatment, data: await getTreatmentLandingData(treatment) };
});

export async function generateMetadata({ params }: TreatmentPageProps): Promise<Metadata> {
  const landingPage = await loadTreatmentPage((await params).treatmentSlug);
  if (!landingPage) {
    return { robots: { index: false, follow: false } };
  }

  const { treatment, data } = landingPage;
  const title = `${treatment.name} Clinics, Prices & Locations`;
  const description = pageDescription(treatment, data.totalLocations, data.totalCities);
  const canonical = treatmentHref(treatment);
  const indexable = isTreatmentPageIndexable(treatment);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: true },
    openGraph: { type: "website", title: `${title} | ${siteName}`, description, url: canonical },
  };
}

export default async function TreatmentPage({ params }: TreatmentPageProps) {
  const landingPage = await loadTreatmentPage((await params).treatmentSlug);
  if (!landingPage) {
    notFound();
  }

  const { treatment, data } = landingPage;
  const priceSummary = preferredPriceSummary(data.priceSummaries);

  return (
    <main className={styles.page}>
      <LandingScrollHeader alwaysVisible />

      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/treatments">Treatments</Link>
            <span aria-hidden="true">/</span>
            <span>{treatment.name}</span>
          </nav>
          <h1>{treatment.name}</h1>
          <p className={styles.heroCopy}>{pageDescription(treatment, data.totalLocations, data.totalCities)}</p>

          <dl className={styles.stats}>
            <div>
              <dt>Clinic locations</dt>
              <dd>{data.totalLocations.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Cities</dt>
              <dd>{data.totalCities.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Lowest listed price</dt>
              <dd>{priceSummary ? formatMoney(priceSummary.minimum, priceSummary.currency) : "Ask provider"}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.contentInner}>
          <section className={styles.section} aria-labelledby="treatment-provider-title">
            <div className={styles.sectionHeading}>
              <h2 id="treatment-provider-title">Clinics offering {treatment.name}</h2>
              <p>Compare providers, locations, reviews, and available treatment information.</p>
            </div>
            <div className="result-list treatment-location-result-list">
              {data.providers.map((provider) => (
                <DirectoryLocationCard from="" key={provider.id} result={provider} />
              ))}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="treatment-city-title">
            <div className={styles.sectionHeading}>
              <h2 id="treatment-city-title">Popular locations for {treatment.name}</h2>
              <p>These cities currently have the highest number of matching clinic locations in Fountain.</p>
            </div>
            <ul className={styles.cityList}>
              {data.topCities.map((city) => {
                const pilotHref = findPilotTreatmentLocationHref({
                  treatmentId: treatment.id,
                  locality: city.locality,
                  region: city.region,
                  countryCode: city.countryCode,
                });
                const label = cityLabel(city);

                return (
                  <li key={`${city.countryCode}-${city.locality}`}>
                    {pilotHref ? <Link href={pilotHref}>{label}</Link> : <span>{label}</span>}
                    <small>{city.locationCount.toLocaleString()} locations</small>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={styles.section} aria-labelledby="treatment-price-title">
            <div className={styles.sectionHeading}>
              <h2 id="treatment-price-title">Understanding {treatment.name} prices</h2>
              <p>
                {priceSummary
                  ? `Fountain currently tracks ${priceSummary.offeringCount.toLocaleString()} published prices, ranging from ${formatMoney(priceSummary.minimum, priceSummary.currency)} to ${formatMoney(priceSummary.maximum, priceSummary.currency)}.`
                  : "Published prices are not yet available consistently for this treatment."} Prices may reflect
                different protocols, packages, consultations, and add-ons. Confirm the full price directly with the
                provider.
              </p>
            </div>
          </section>
        </div>
      </div>

      <LandingFooter />
      <script
        dangerouslySetInnerHTML={{
          __html: structuredData(treatment, data.totalLocations, data.totalCities, data.providers),
        }}
        type="application/ld+json"
      />
    </main>
  );
}

function pageDescription(treatment: TreatmentCatalogItem, locations: number, cities: number) {
  return `Compare ${locations.toLocaleString()} clinic locations offering ${treatment.name} across ${cities.toLocaleString()} cities. Review providers, locations, and published prices.`;
}

function preferredPriceSummary(
  summaries: Array<{ currency: string | null; minimum: number; maximum: number; offeringCount: number }>,
) {
  return summaries.find((summary) => summary.currency === "USD") || summaries[0] || null;
}

function formatMoney(amount: number, currency: string | null) {
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  }
  return `${currency ? `${currency} ` : "$"}${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function cityLabel(city: { locality: string; region: string | null; countryName: string | null; countryCode: string }) {
  if (city.region) {
    return `${city.locality}, ${city.region}`;
  }
  return `${city.locality}, ${city.countryName || city.countryCode}`;
}

function structuredData(
  treatment: TreatmentCatalogItem,
  totalLocations: number,
  totalCities: number,
  providers: Array<{ id: number; slug: string | null; name: string | null; org_name: string | null }>,
) {
  const url = new URL(treatmentHref(treatment), siteUrl).toString();
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: treatment.name,
        description: pageDescription(treatment, totalLocations, totalCities),
        isPartOf: { "@type": "WebSite", name: siteName, url: siteUrl.toString() },
        mainEntity: { "@id": `${url}#providers` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl.toString() },
          { "@type": "ListItem", position: 2, name: "Treatments", item: new URL("/treatments", siteUrl).toString() },
          { "@type": "ListItem", position: 3, name: treatment.name, item: url },
        ],
      },
      {
        "@type": "ItemList",
        "@id": `${url}#providers`,
        name: `${treatment.name} providers`,
        numberOfItems: totalLocations,
        itemListElement: providers.map((provider, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: provider.name || provider.org_name || "Clinic",
          url: new URL(`/directory/locations/${provider.slug || provider.id}`, siteUrl).toString(),
        })),
      },
    ],
  }).replace(/</g, "\\u003c");
}
