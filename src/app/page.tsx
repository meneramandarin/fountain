import { Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CityTreatmentSearches } from "@/components/city-treatment-searches";
import { LandingExploreCarousel, type LandingExploreItem } from "@/components/landing-explore-carousel";
import { LandingFeaturedDirectoryCarousel } from "@/components/landing-featured-directory-carousel";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { getPopularTreatments, popularTreatmentLabel } from "@/lib/popular-treatments";
import {
  getFacets,
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
  { label: "Muscle Recovery", image: "/domains/musclerecovery.webp", href: searchHref("Muscle Recovery") },
  { label: "Metabolic Health", image: "/domains/nutrition.jpg", href: searchHref("Metabolic Health") },
  { label: "Ovarian Health", image: "/domains/ovarian health.jpg", href: searchHref("Ovarian Health") },
  { label: "Regenerative Medicine", image: "/domains/regenerativehealth.png", href: searchHref("Regenerative Medicine") },
  { label: "Cognitive Health", image: "/domains/cognitivehealth.jpg", href: searchHref("Cognitive Health") },
  { label: "Biological Age", image: "/domains/Biologicalage.avif", href: searchHref("Biological Age") },
];

export default async function HomePage() {
  const [countrySearches, featuredCards, nadCards, mriCards, facets] = await Promise.all([
    getLandingCityTreatmentSearches(),
    getLandingFeaturedDirectoryCards(5),
    getLandingTreatmentDirectoryCards("NAD+ IV therapy", 5, {
      countryCode: "US",
      localities: ["New York", "Brooklyn", "Long Island City", "Jackson Heights", "Rego Park", "Staten Island"],
      requireImage: false,
    }),
    getLandingTreatmentDirectoryCards("Full-body MRI", 5),
    getFacets(),
  ]);
  const treatmentFacets = facets.treatment_domains.flatMap((domain) => domain.treatments);
  const popularTreatments = getPopularTreatments(treatmentFacets);

  return (
    <main className="landing">
      <LandingScrollHeader />

      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero-topbar">
          <Link className="landing-brand landing-hero-brand" href="/">
            fountain
          </Link>
          <button className="coming-soon-pill" type="button">
            Coming Soon <span aria-hidden="true">|</span> Join
          </button>
        </div>

        <div className="landing-hero-copy">
          <h1 id="landing-hero-title">The World’s Biggest Longevity Market Place.</h1>
          <p>Discover treatments, find practitioners.</p>
        </div>

        <div className="landing-hero-search">
          <form className="landing-search" action="/directory" role="search">
            <input
              name="q"
              type="search"
              aria-label="Search treatments, clinics, doctors"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit" aria-label="Search">
              <Search size={18} aria-hidden="true" />
            </button>
          </form>
          <nav className="treatment-bubbles" aria-label="Popular treatments">
            {popularTreatments.map((treatment) => (
              <Link className="treatment-bubble" href={`/directory?treatment_id=${treatment.id}`} key={treatment.id}>
                {popularTreatmentLabel(treatment.name)}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <LandingFeaturedDirectoryCarousel cards={featuredCards} title="Top Rated Longevity Clinics" />

      <LandingFeaturedDirectoryCarousel cards={nadCards} title="NAD+ IV Therapy Near You" />

      <LandingFeaturedDirectoryCarousel cards={mriCards} title="Where to get a full body MRI" />

      <section className="landing-banner" aria-hidden="true">
        <Image src="/clinics/The Fountain of Youth.jpg" alt="" fill sizes="100vw" />
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
