import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DirectoryLocationCard } from "@/components/directory-location-card";
import { LandingFooter } from "@/components/landing-footer";
import { SplitDirectorySearch } from "@/components/split-directory-search";
import { locationHref } from "@/lib/directory-urls";
import { getTreatmentLocationLandingData } from "@/lib/queries";
import { ogImage, siteName, siteUrl } from "@/lib/site";
import {
  findPilotTreatmentLocationPage,
  pilotPageTitle,
  pilotPlaceLabel,
  pilotTreatmentLocationHref,
  pilotTreatmentLocationPages,
  type PilotTreatmentLocationPage,
} from "@/lib/treatment-location-pages";

export const revalidate = 3600;
export const dynamicParams = false;

const minimumEligibleLocations = 2;

type TreatmentLocationRouteProps = {
  params: Promise<{ treatmentSlug: string; placeSlug: string }>;
};

const loadLandingPage = cache(async (treatmentSlug: string, placeSlug: string) => {
  const definition = findPilotTreatmentLocationPage(treatmentSlug, placeSlug);
  if (!definition) {
    return null;
  }

  const data = await getTreatmentLocationLandingData({
    treatmentId: definition.treatment.id,
    treatmentName: definition.treatment.name,
    countryCode: definition.place.countryCode,
    locality: definition.place.locality,
  });

  return { definition, data };
});

export function generateStaticParams() {
  return pilotTreatmentLocationPages.map((page) => ({
    treatmentSlug: page.treatment.slug,
    placeSlug: page.place.slug,
  }));
}

export async function generateMetadata({ params }: TreatmentLocationRouteProps): Promise<Metadata> {
  const { treatmentSlug, placeSlug } = await params;
  const landingPage = await loadLandingPage(treatmentSlug, placeSlug);
  if (!landingPage || landingPage.data.total < minimumEligibleLocations) {
    return { robots: { index: false, follow: false } };
  }

  const { definition, data } = landingPage;
  const title = pilotPageTitle(definition);
  const canonicalPath = pilotTreatmentLocationHref(definition);
  const description = pageDescription(definition, data.total);

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      title: `${title} | ${siteName}`,
      description,
      url: canonicalPath,
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
  const landingPage = await loadLandingPage(treatmentSlug, placeSlug);
  if (!landingPage || landingPage.data.total < minimumEligibleLocations) {
    notFound();
  }

  const { definition, data } = landingPage;
  const title = pilotPageTitle(definition);
  const place = pilotPlaceLabel(definition.place);
  const priceSummary = preferredPriceSummary(data.priceSummaries);
  const directoryUrl = directorySearchHref(definition);

  return (
    <main className="treatment-location-page">
      <section className="treatment-location-hero">
        <header className="directory-topbar treatment-location-topbar">
          <Link className="landing-brand directory-brand" href="/">
            fountain
          </Link>
          <SplitDirectorySearch className="treatment-location-search" compact />
          <button className="coming-soon-pill" type="button">
            Coming Soon <span aria-hidden="true">|</span> Join
          </button>
        </header>

        <div className="treatment-location-hero-inner">
          <nav className="treatment-location-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href={directoryUrl}>Treatments</Link>
            <span aria-hidden="true">/</span>
            <span>{definition.treatment.searchLabel}</span>
          </nav>
          <p className="treatment-location-eyebrow">Compare local providers</p>
          <h1>{title}</h1>
          <p className="treatment-location-dek">{pageDescription(definition, data.total)}</p>

          <dl className="treatment-location-stats">
            <div>
              <dt>Matching clinics</dt>
              <dd>{data.total.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Published prices</dt>
              <dd>{priceSummary ? priceSummary.offeringCount.toLocaleString() : "Not listed"}</dd>
            </div>
            <div>
              <dt>Lowest listed price</dt>
              <dd>{priceSummary ? formatMoney(priceSummary.minimum, priceSummary.currency) : "Ask provider"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="treatment-location-results" aria-labelledby="treatment-location-results-title">
        <div className="treatment-location-section-heading">
          <div>
            <p>Providers in {place}</p>
            <h2 id="treatment-location-results-title">Where to get {definition.treatment.searchLabel}</h2>
          </div>
          <Link href={directoryUrl}>Explore all {data.total.toLocaleString()} results</Link>
        </div>

        <div className="result-list treatment-location-result-list">
          {data.results.map((result) => (
            <DirectoryLocationCard from="" key={result.id} result={result} />
          ))}
        </div>
      </section>

      <section className="treatment-location-guide" aria-labelledby="treatment-location-guide-title">
        <div>
          <p className="treatment-location-eyebrow">Price guide</p>
          <h2 id="treatment-location-guide-title">What {definition.treatment.pluralLabel} cost in {definition.place.locality}</h2>
        </div>
        <div className="treatment-location-guide-copy">
          {priceSummary ? (
            <p>
              Fountain currently has {priceSummary.offeringCount.toLocaleString()} published price
              {priceSummary.offeringCount === 1 ? "" : "s"} from {priceSummary.locationCount.toLocaleString()} local
              provider{priceSummary.locationCount === 1 ? "" : "s"}. Listed prices range from{" "}
              <strong>{formatMoney(priceSummary.minimum, priceSummary.currency)}</strong> to{" "}
              <strong>{formatMoney(priceSummary.maximum, priceSummary.currency)}</strong>.
            </p>
          ) : (
            <p>
              These providers offer {definition.treatment.pluralLabel}, but we do not yet have enough published price
              information to show a reliable local range.
            </p>
          )}
          <p>
            Prices can reflect different protocols, packages, consultation fees, and add-ons. Confirm the current price,
            what is included, and medical eligibility directly with the provider before booking.
          </p>
        </div>
      </section>

      <section className="treatment-location-faq" aria-labelledby="treatment-location-faq-title">
        <h2 id="treatment-location-faq-title">Before you choose a provider</h2>
        <div className="treatment-location-faq-grid">
          <article>
            <h3>How many options are listed?</h3>
            <p>
              Fountain found {data.total.toLocaleString()} active clinics with {definition.treatment.pluralLabel} in{" "}
              {place}. Inventory changes as clinics update their services.
            </p>
          </article>
          <article>
            <h3>Are the prices guaranteed?</h3>
            <p>
              No. Published prices are comparison points, not quotes. Ask whether consultations, interpretation,
              memberships, or follow-up care cost extra.
            </p>
          </article>
          <article>
            <h3>How should I compare clinics?</h3>
            <p>
              Compare the exact service, clinician oversight, location, reviews, and the complete price—not just the
              lowest advertised number.
            </p>
          </article>
        </div>
      </section>

      <LandingFooter />
      <script
        dangerouslySetInnerHTML={{ __html: structuredData(definition, data.total, data.results) }}
        type="application/ld+json"
      />
    </main>
  );
}

function pageDescription(page: PilotTreatmentLocationPage, total: number) {
  const place = pilotPlaceLabel(page.place);
  return `Compare ${total.toLocaleString()} clinics offering ${page.treatment.searchLabel} in ${place}. Review providers, published prices, ratings, and treatment details.`;
}

function directorySearchHref(page: PilotTreatmentLocationPage) {
  const params = new URLSearchParams({
    kind: "locations",
    country: page.place.countryCode,
    locality: page.place.locality,
    q: page.treatment.name,
    treatment_id: String(page.treatment.id),
  });
  return `/directory?${params.toString()}`;
}

function preferredPriceSummary(
  summaries: Array<{ currency: string | null; minimum: number; maximum: number; offeringCount: number; locationCount: number }>,
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

function structuredData(
  page: PilotTreatmentLocationPage,
  total: number,
  results: Array<{ id: number; slug: string | null; name: string | null; org_name: string | null }>,
) {
  const path = pilotTreatmentLocationHref(page);
  const url = new URL(path, siteUrl).toString();
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: pilotPageTitle(page),
        description: pageDescription(page, total),
        isPartOf: { "@type": "WebSite", name: siteName, url: siteUrl.toString() },
        mainEntity: { "@id": `${url}#providers` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumbs`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl.toString() },
          { "@type": "ListItem", position: 2, name: "Treatments", item: new URL("/directory", siteUrl).toString() },
          { "@type": "ListItem", position: 3, name: pilotPageTitle(page), item: url },
        ],
      },
      {
        "@type": "ItemList",
        "@id": `${url}#providers`,
        name: `${page.treatment.searchLabel} providers in ${pilotPlaceLabel(page.place)}`,
        numberOfItems: total,
        itemListElement: results.map((result, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: result.name || result.org_name || "Clinic",
          url: new URL(locationHref(result), siteUrl).toString(),
        })),
      },
    ],
  };

  return JSON.stringify(graph).replace(/</g, "\\u003c");
}
