import Image from "next/image";
import { headers } from "next/headers";
import { LandingExploreCarousel, type LandingExploreItem } from "@/components/landing-explore-carousel";
import { LandingFeaturedDirectoryCarousel } from "@/components/landing-featured-directory-carousel";
import { LandingFooter } from "@/components/landing-footer";
import { LandingSeoDiscovery } from "@/components/landing-seo-discovery";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { LandingTopbar } from "@/components/landing-topbar";
import { SplitDirectorySearch } from "@/components/split-directory-search";
import { fixedTreatmentLocationPages } from "@/lib/fixed-treatment-location-pages";
import { editorialArticlePath } from "@/lib/editorial-articles";
import {
  getLandingTreatmentDirectoryCards,
  getTreatmentCatalog,
  type VisitorLocationParams,
} from "@/lib/queries";
import { hyperbaricOxygenTherapy } from "@/lib/treatment-pages";

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
  {
    label: "The Grey Zone - Peptides, Reclassified",
    image: "/domains/peptides.webp",
    href: editorialArticlePath("peptide-regulation.html"),
  },
  {
    label: "On Microdosing GLP-1s",
    image: "/domains/microdosing.png",
    href: editorialArticlePath("glp1-microdosing.html"),
  },
  {
    label: "The Clinic and the Spa Are Merging",
    image: "/domains/aman-japan-longevity.jpg",
    href: editorialArticlePath("clinic-spa-merge.html"),
  },
  {
    label: "The Most Occult Longevity Treatments Currently Available",
    image: "/domains/longevitytreatments.png",
    href: editorialArticlePath("occult-longevity-treatments.html"),
  },
  { label: "Your Biological Age Is a Marketing Number", image: "/domains/epigeneticage.jpg", href: editorialArticlePath("biological-age.html") },
  { label: "Menopause, Optional", image: "/domains/ovarian health.jpg", href: editorialArticlePath("ovarian-longevity.html") },
  {
    label: "The Ten Years Nobody Plans For",
    image: "/domains/Biologicalage.avif",
    href: editorialArticlePath("healthspan-vs-lifespan.html"),
  },
];

const fallbackNearMeLocalities = ["New York", "Brooklyn", "Long Island City", "Jackson Heights", "Rego Park", "Staten Island"];
const peptideTreatmentId = 20;
const botoxTreatmentId = 34;

export default async function HomePage() {
  const visitorLocation = landingVisitorLocation(await headers());
  const [dexaCards, ivCards, recoverCards, regenerateCards, rejuvenateCards, treatments] = await Promise.all([
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
    safeLandingSection("hyperbaric oxygen cards", () =>
      getLandingTreatmentDirectoryCards(hyperbaricOxygenTherapy.id, 10, {
        countryCode: "US",
        localities: fallbackNearMeLocalities,
        requireImage: false,
        visitor: visitorLocation,
      }),
    ),
    safeLandingSection("peptide therapy cards", () =>
      getLandingTreatmentDirectoryCards(peptideTreatmentId, 10, {
        countryCode: "US",
        localities: fallbackNearMeLocalities,
        requireImage: false,
        visitor: visitorLocation,
      }),
    ),
    safeLandingSection("botox cards", () =>
      getLandingTreatmentDirectoryCards(botoxTreatmentId, 10, {
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
          <h1 id="landing-hero-title">Your Personal Longevity Concierge</h1>
          <h2>
            Explore the evolving world of longevity care, from emerging treatments to the practitioners and clinics behind them.
          </h2>
        </div>

        <div className="landing-hero-search">
          <SplitDirectorySearch />
        </div>
      </section>

      <LandingFeaturedDirectoryCarousel
        cards={dexaCards}
        eyebrow="Measure"
        title="Know exactly what you’re made of"
        subtitle="Full-body DEXA scans measure bone density, muscle, and fat in one visit."
        treatmentName="DEXA scan"
        clinicCategory="Measure"
      />

      <LandingFeaturedDirectoryCarousel
        cards={ivCards}
        eyebrow="Optimize"
        title="Hydration and energy, on demand"
        subtitle="IV drip clinics for hydration, energy, and immunity, near you."
        treatmentName="IV Infusions"
        clinicCategory="Optimize"
      />

      <LandingFeaturedDirectoryCarousel
        cards={recoverCards}
        eyebrow="Recover"
        title="More oxygen, faster healing"
        subtitle="Hyperbaric oxygen therapy (HBOT) pushes oxygen deep into tissue to speed recovery and repair."
        treatmentName={hyperbaricOxygenTherapy.name}
        clinicCategory="Recover"
      />

      <LandingFeaturedDirectoryCarousel
        cards={regenerateCards}
        eyebrow="Regenerate"
        title="Rebuild from the inside out"
        subtitle="Peptide therapy signals your body to repair tissue, build muscle, and recover faster."
        treatmentName="Peptide therapy"
        clinicCategory="Regenerate"
      />

      <LandingFeaturedDirectoryCarousel
        cards={rejuvenateCards}
        eyebrow="Rejuvenate"
        title="Small changes, visible results"
        subtitle="Botox and other rejuvenation treatments to soften lines without surgery."
        treatmentName="Botox"
        clinicCategory="Rejuvenate"
      />

      <section className="landing-banner" aria-hidden="true">
        <Image src="/fountainofyouth.webp" alt="" fill sizes="100vw" unoptimized />
      </section>

      <section className="landing-quote" aria-label="Health quote">
        <blockquote>
          “When health is absent, wisdom cannot reveal itself, art cannot become manifest, strength cannot fight,
          wealth becomes useless, and reason is powerless.” - Herophilus
        </blockquote>
      </section>

      <LandingSeoDiscovery
        treatments={treatments}
        locationPages={fixedTreatmentLocationPages.map((page) => ({
          href: page.href,
          treatmentLabel: page.treatment.name,
          cityLabel: `${page.city.city}, ${page.city.region}`,
          city: page.city.city,
        }))}
      />

      <LandingExploreCarousel items={exploreItems} />

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
