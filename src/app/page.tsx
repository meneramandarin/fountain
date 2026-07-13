import Image from "next/image";
import { headers } from "next/headers";
import { CityTreatmentSearches } from "@/components/city-treatment-searches";
import { LandingExploreCarousel, type LandingExploreItem } from "@/components/landing-explore-carousel";
import { LandingFeaturedDirectoryCarousel } from "@/components/landing-featured-directory-carousel";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { LandingTopbar } from "@/components/landing-topbar";
import { SplitDirectorySearch } from "@/components/split-directory-search";
import {
  getLandingCityTreatmentSearches,
  getLandingFeaturedDirectoryCards,
  getLandingTreatmentDirectoryCards,
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
  { label: "Your Biological Age Is a Marketing Number", image: "/domains/epigeneticage.jpg", href: "/biological-age.html" },
  { label: "Explore Metabolic Health", image: "/domains/nutrition.jpg", href: searchHref("Metabolic Health") },
  { label: "Menopause, Optional", image: "/domains/ovarian health.jpg", href: "/ovarian-longevity.html" },
  { label: "Muscle Recovery", image: "/domains/musclerecovery.webp", href: searchHref("Muscle Recovery") },
  { label: "Regenerative Medicine", image: "/domains/regenerativehealth.png", href: searchHref("Regenerative Medicine") },
  { label: "Cognitive Health", image: "/domains/cognitivehealth.jpg", href: searchHref("Cognitive Health") },
  { label: "Biological Age", image: "/domains/Biologicalage.avif", href: searchHref("Biological Age") },
];

const fallbackNearMeLocalities = ["New York", "Brooklyn", "Long Island City", "Jackson Heights", "Rego Park", "Staten Island"];

export default async function HomePage() {
  const visitorLocation = landingVisitorLocation(await headers());
  const [countrySearches, featuredCards, ivCards, mriCards] = await Promise.all([
    safeLandingSection("city treatment searches", () => getLandingCityTreatmentSearches()),
    safeLandingSection("featured directory cards", () => getLandingFeaturedDirectoryCards(10)),
    safeLandingSection("IV drip cards", () =>
      getLandingTreatmentDirectoryCards("IV nutrient therapy", 10, {
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
  ]);

  return (
    <main className="landing">
      <LandingScrollHeader />

      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <LandingTopbar />

        <div className="landing-hero-copy">
          <h1 id="landing-hero-title">The pursuit of a longer life starts here.</h1>
          <p>Thousands of treatments. Hundreds of cities. One place.</p>
        </div>

        <div className="landing-hero-search">
          <SplitDirectorySearch />
        </div>
      </section>

      <LandingFeaturedDirectoryCarousel cards={featuredCards} title="Top Rated Longevity Clinics" />

      <LandingFeaturedDirectoryCarousel cards={ivCards} title="IV Drip Clinics Near Me" />

      <LandingFeaturedDirectoryCarousel cards={mriCards} title="Get an MRI Scan in Your Area" />

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

      <section className="landing-discover">
        <div className="discover-card">
          <h2>Explore searches by location</h2>
          <p>Browse treatments by country and city</p>

          <CityTreatmentSearches countries={countrySearches} />
        </div>
      </section>

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
