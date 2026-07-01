import { Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CityTreatmentSearches } from "@/components/city-treatment-searches";
import { LandingFooter } from "@/components/landing-footer";
import { getLandingCityTreatmentSearches } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const treatments = [
  { label: "Hyperbaric Oxygen Therapy (HBOT)", image: "/treatments/Hbot.png" },
  { label: "DEXA Scan", image: "/treatments/DEXA.png" },
  { label: "Stemcell Therapy", image: "/treatments/Stemcelltherapy.png" },
  { label: "VO2 Max Test", image: "/treatments/VO2max.png" },
  { label: "Full-body MRI", image: "/treatments/MRI.png" },
  { label: "IV Therapy", image: "/treatments/IV.png" },
];

const clinics = [
  {
    name: "Clinique La Prairie",
    location: "Montreux, Switzerland",
    image: "/clinics/Clinique La Prairie, Switzerland.png",
  },
  { name: "Chi Longevity", location: "Singapore", image: "/clinics/chi longevity, singapore.jpg" },
  { name: "Sheba Longevity", location: "Ramat Gan, Israel", image: "/clinics/Sheba, Israel.jpg" },
  { name: "SHA Wellness Clinic", location: "Alfaz del Pi, Spain", image: "/clinics/shawellness, spain.webp" },
  { name: "The Hundred", location: "Tokyo, Japan", image: "/clinics/the hundred, japan.webp" },
  { name: "Fountain Life", location: "Dallas, USA", image: "/clinics/fountain life, dallas.webp" },
];

const domains = [
  { label: "Ovarian Health", image: "/domains/ovarian health.jpg" },
  { label: "Metabolic Health", image: "/domains/nutrition.jpg" },
  { label: "Muscle Recovery", image: "/domains/musclerecovery.webp" },
  { label: "Regenerative Medicine", image: "/domains/regenerativehealth.png" },
  { label: "Cognitive Health", image: "/domains/cognitivehealth.jpg" },
  { label: "Biological Age", image: "/domains/Biologicalage.avif" },
];

function searchHref(term: string) {
  return `/directory?q=${encodeURIComponent(term)}`;
}

export default function HomePage() {
  const citySearches = getLandingCityTreatmentSearches(18, 100);

  return (
    <main className="landing">
      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="landing-hero-copy">
          <Link className="landing-brand landing-hero-brand" href="/">
            fountain
          </Link>
          <h1 id="landing-hero-title">Find the right Longevity Treatments close to you.</h1>
          <p>From Stem Cell Therapy &amp; PRP to HBOT.</p>
        </div>

        <div className="landing-hero-search">
          <form className="landing-search" action="/directory" role="search">
            <input name="q" type="search" placeholder="Search treatments, clinics, doctors..." />
            <button type="submit" aria-label="Search">
              <Search size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>

      <section className="landing-rail" aria-label="Explore Proven Longevity Treatments">
        <div className="rail-header">
          <h2 className="rail-heading">Explore Proven Longevity Treatments</h2>
          <Link className="rail-more" href="/directory?q=therapy">
            More
          </Link>
        </div>
        <div className="rail-grid">
          {treatments.map((tile) => (
            <Link className="rail-tile" href={searchHref(tile.label)} key={tile.label}>
              <span className="rail-thumb">
                <Image src={tile.image} alt="" fill sizes="(max-width: 640px) 45vw, (max-width: 980px) 30vw, 280px" />
              </span>
              <span className="rail-caption">{tile.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-rail" aria-label="Discover the World's Leading clinics and med spas">
        <div className="rail-header">
          <h2 className="rail-heading">Discover the World&apos;s Leading Clinics &amp; Med Spas</h2>
          <Link className="rail-more" href="/directory?kind=locations&q=clinic">
            More
          </Link>
        </div>
        <div className="rail-grid">
          {clinics.map((tile) => (
            <Link className="rail-tile" href={searchHref(tile.name)} key={tile.name}>
              <span className="rail-thumb">
                <Image src={tile.image} alt="" fill sizes="(max-width: 640px) 45vw, (max-width: 980px) 30vw, 280px" />
              </span>
              <span className="rail-caption">
                {tile.name}
                <small>{tile.location}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-rail" aria-label="Dive Deeper into Regenerative Medicine and Longevity Domains">
        <div className="rail-header">
          <h2 className="rail-heading">Dive Deeper into Regenerative Medicine and Longevity Domains</h2>
          <Link className="rail-more" href="/directory?q=longevity">
            More
          </Link>
        </div>
        <div className="rail-grid">
          {domains.map((tile) => (
            <Link className="rail-tile" href={searchHref(tile.label)} key={tile.label}>
              <span className="rail-thumb">
                {tile.image ? (
                  <Image src={tile.image} alt="" fill sizes="(max-width: 640px) 45vw, (max-width: 980px) 30vw, 280px" />
                ) : null}
              </span>
              <span className="rail-caption">{tile.label}</span>
            </Link>
          ))}
        </div>
      </section>

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
