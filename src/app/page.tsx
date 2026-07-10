import Image from "next/image";
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
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function searchHref(term: string) {
  return `/directory?q=${encodeURIComponent(term)}`;
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

export default async function HomePage() {
  const [countrySearches, featuredCards, nadCards, mriCards] = await Promise.all([
    getLandingCityTreatmentSearches(),
    getLandingFeaturedDirectoryCards(5),
    getLandingTreatmentDirectoryCards("NAD+ IV therapy", 5, {
      countryCode: "US",
      localities: ["New York", "Brooklyn", "Long Island City", "Jackson Heights", "Rego Park", "Staten Island"],
      requireImage: false,
    }),
    getLandingTreatmentDirectoryCards("Full-body MRI", 5),
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

      <LandingFeaturedDirectoryCarousel cards={nadCards} title="NAD+ IV Therapy Near You" />

      <LandingFeaturedDirectoryCarousel cards={mriCards} title="Where to get a full body MRI" />

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
