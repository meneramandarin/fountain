import { Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CityTreatmentSearches } from "@/components/city-treatment-searches";
import { LandingExploreCarousel, type LandingExploreItem } from "@/components/landing-explore-carousel";
import { LandingFooter } from "@/components/landing-footer";
import { getPopularTreatments, popularTreatmentLabel } from "@/lib/popular-treatments";
import { getFacets, getLandingCityTreatmentSearches } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function searchHref(term: string) {
  return `/directory?q=${encodeURIComponent(term)}`;
}

const exploreItems: LandingExploreItem[] = [
  { label: "DEXA Scan", image: "/treatments/DEXA.png", href: searchHref("DEXA Scan") },
  { label: "Clinique La Prairie", image: "/clinics/Clinique La Prairie, Switzerland.png", href: searchHref("Clinique La Prairie") },
  { label: "Muscle Recovery", image: "/domains/musclerecovery.webp", href: searchHref("Muscle Recovery") },
  { label: "Metabolic Health", image: "/domains/nutrition.jpg", href: searchHref("Metabolic Health") },
  { label: "Hyperbaric Oxygen Therapy (HBOT)", image: "/treatments/Hbot.png", href: searchHref("Hyperbaric Oxygen Therapy") },
  { label: "Chi Longevity", image: "/clinics/chi longevity, singapore.jpg", href: searchHref("Chi Longevity") },
  { label: "Stemcell Therapy", image: "/treatments/Stemcelltherapy.png", href: searchHref("Stemcell Therapy") },
  { label: "Ovarian Health", image: "/domains/ovarian health.jpg", href: searchHref("Ovarian Health") },
  { label: "SHA Wellness Clinic", image: "/clinics/shawellness, spain.webp", href: searchHref("SHA Wellness Clinic") },
  { label: "VO2 Max Test", image: "/treatments/VO2max.png", href: searchHref("VO2 Max Test") },
  { label: "Regenerative Medicine", image: "/domains/regenerativehealth.png", href: searchHref("Regenerative Medicine") },
  { label: "Sheba Longevity", image: "/clinics/Sheba, Israel.jpg", href: searchHref("Sheba Longevity") },
  { label: "Full-body MRI", image: "/treatments/MRI.png", href: searchHref("Full-body MRI") },
  { label: "Cognitive Health", image: "/domains/cognitivehealth.jpg", href: searchHref("Cognitive Health") },
  { label: "The Hundred", image: "/clinics/the hundred, japan.webp", href: searchHref("The Hundred") },
  { label: "IV Therapy", image: "/treatments/IV.png", href: searchHref("IV Therapy") },
  { label: "Biological Age", image: "/domains/Biologicalage.avif", href: searchHref("Biological Age") },
  { label: "Fountain Life", image: "/clinics/fountain life, dallas.webp", href: searchHref("Fountain Life") },
];

export default function HomePage() {
  const citySearches = getLandingCityTreatmentSearches(18, 100);
  const treatmentFacets = getFacets().treatment_domains.flatMap((domain) => domain.treatments);
  const popularTreatments = getPopularTreatments(treatmentFacets);

  return (
    <main className="landing">
      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero-copy">
          <Link className="landing-brand landing-hero-brand" href="/">
            fountain
          </Link>
          <h1 id="landing-hero-title">The World’s Biggest Longevity Market Place.</h1>
          <p>Discover treatments, find practitioners.</p>
        </div>

        <div className="landing-hero-search">
          <form className="landing-search" action="/directory" role="search">
            <input name="q" type="search" aria-label="Search treatments, clinics, doctors" />
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

      <LandingExploreCarousel items={exploreItems} />

      <section className="landing-banner" aria-hidden="true">
        <Image src="/clinics/The Fountain of Youth.jpg" alt="" fill sizes="100vw" />
      </section>

      <section className="landing-discover">
        <div className="discover-card">
          <h2>Explore searches in popular cities</h2>
          <p>Browse treatments currently offered by city</p>

          <CityTreatmentSearches cities={citySearches} />
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}
