import Image from "next/image";
import { headers } from "next/headers";
import { LandingExploreCarousel, type LandingExploreItem } from "@/components/landing-explore-carousel";
import { LandingFeaturedDirectoryCarousel } from "@/components/landing-featured-directory-carousel";
import { LandingFooter } from "@/components/landing-footer";
import { LandingGeoHeading } from "@/components/landing-geo-heading";
import { LandingSeoDiscovery } from "@/components/landing-seo-discovery";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { LandingTopbar } from "@/components/landing-topbar";
import { SplitDirectorySearch } from "@/components/split-directory-search";
import { fixedTreatmentLocationPages } from "@/lib/fixed-treatment-location-pages";
import {
  getLandingTreatmentDirectoryCards,
  getTreatmentCatalog,
  type VisitorLocationParams,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function searchHref(term: string) {
  return `/directory?q=${encodeURIComponent(term)}`;
}

async function safeLandingSection<T>(label: string, load: () => Promise<T[]>) {
  try {
    return await load();
  } catch (error) {
    console.error(`[landing] ${label} failed`, error);
    return [];
  }
}

const exploreItems: LandingExploreItem[] = [
  { label: "The Grey Zone - Peptides, Reclassified", image: "/domains/peptides.webp", href: "/peptide-regulation.html" },
  { label: "On Microdosing GLP-1s", image: "/domains/microdosing.png", href: "/glp1-microdosing.html" },
  { label: "The Clinic and the Spa Are Merging", image: "/domains/aman-japan-longevity.jpg", href: "/clinic-spa-merge.html" },
  {
    label: "The Most Occult Longevity Treatments Currently Available",
    image: "/domains/longevitytreatments.png",
    href: "/occult-longevity-treatments.html",
  },
  { label: "Your Biological Age Is a Marketing Number", image: "/domains/epigeneticage.jpg", href: "/biological-age.html" },
  { label: "Menopause, Optional", image: "/domains/ovarian health.jpg", href: "/ovarian-longevity.html" },
  { label: "The Ten Years Nobody Plans For", image: "/domains/Biologicalage.avif", href: "/healthspan-vs-lifespan.html" },
];

const fallbackNearMeLocalities = ["New York", "Brooklyn", "Long Island City", "Jackson Heights", "Rego Park", "Staten Island"];

export default async function HomePage() {
  const visitorLocation = landingVisitorLocation(await headers());
  const [dexaCards, ivCards, mriCards, treatments] = await Promise.all([
    safeLandingSection("DEXA scan cards", () =>
      getLandingTreatmentDirectoryCards("DEXA scan", 10, {
        countryCode: "US",
        localities: fallbackNearMeLocalities,
        requireImage: false,
        visitor: visitorLocation,
      }),
    ),
    safeLandingSection("IV drip cards", () =>
      getLandingTreatmentDirectoryCards(74, 10, {
        countryCode: "US",
        localities: fallbackNearMeLocalities,
        requireImage: false,
        visitor: visitorLocation,
      }),
    ),
    safeLandingSection("full-body MRI cards", () =>
      getLandingTreatmentDirectoryCards("Full-body MRI", 10, {
        countryCode: "US",
        localities: fallbackNearMeLocalities,
        requireImage: false,
        visitor: visitorLocation,
      }),
    ),
    safeLandingSection("treatment catalog", () => getTreatmentCatalog()),
  ]);

  return (
    <main className="landing">
      <LandingScrollHeader />

      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <LandingTopbar />

        <div className="landing-hero-copy">
          <h1 id="landing-hero-title">The pursuit of a longer life starts here.</h1>
          <LandingGeoHeading initialCity={visitorLocation?.city} />
        </div>

        <div className="landing-hero-search">
          <SplitDirectorySearch />
        </div>
      </section>

      <LandingFeaturedDirectoryCarousel
        cards={dexaCards}
        title="Book a DEXA Scan Today"
        treatmentName="DEXA scan"
        clinicCategory="Measure"
      />

      <LandingFeaturedDirectoryCarousel
        cards={ivCards}
        title="IV Drip Clinics Near Me"
        treatmentName="IV Infusions"
        clinicCategory="Optimize"
      />

      <LandingFeaturedDirectoryCarousel
        cards={mriCards}
        title="Get an MRI Scan in Your Area"
        treatmentName="Full-body MRI"
        clinicCategory="Measure"
      />

      <section className="landing-banner" aria-hidden="true">
        <Image src="/fountainofyouth.jpg" alt="" fill sizes="100vw" />
      </section>

      <section className="landing-quote" aria-label="Health quote">
        <blockquote>
          “When health is absent, wisdom cannot reveal itself, art cannot become manifest, strength cannot fight,
          wealth becomes useless, and reason is powerless.” - Herophilus
        </blockquote>
      </section>

      <LandingExploreCarousel items={exploreItems} />

      <LandingSeoDiscovery
        treatments={treatments}
        locationPages={fixedTreatmentLocationPages.map((page) => ({
          href: page.href,
          treatmentLabel: page.treatment.name,
          cityLabel: `${page.city.city}, ${page.city.region}`,
          city: page.city.city,
        }))}
      />

      <LandingFooter />
    </main>
  );
}

function landingVisitorLocation(requestHeaders: Pick<Headers, "get">): VisitorLocationParams | undefined {
  const location = {
    country: countryCode(requestHeaders.get("x-vercel-ip-country")),
    region: textValue(requestHeaders.get("x-vercel-ip-country-region")),
    city: textValue(decodeHeaderValue(requestHeaders.get("x-vercel-ip-city"))),
    latitude: finiteNumber(requestHeaders.get("x-vercel-ip-latitude")),
    longitude: finiteNumber(requestHeaders.get("x-vercel-ip-longitude")),
  };

  return location.country || location.region || location.city || location.latitude !== undefined || location.longitude !== undefined
    ? location
    : undefined;
}

function countryCode(value: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z][A-Z]$/.test(normalized) ? normalized : undefined;
}

function textValue(value: string | null | undefined) {
  return value?.trim() || undefined;
}

function finiteNumber(value: string | null | undefined) {
  if (value == null || value === "") {
    return undefined;
  }
  const numberValue = Number.parseFloat(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function decodeHeaderValue(value: string | null) {
  if (!value) {
    return value;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
