import { ChevronDown, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

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

const cities = [
  "Los Angeles",
  "New York",
  "Chicago",
  "Houston",
  "San Diego",
  "Las Vegas",
  "San Francisco",
  "Dallas",
  "San Jose",
  "Phoenix",
  "Philadelphia",
  "Atlanta",
  "Austin",
  "Brooklyn",
  "Seattle",
];

const topSearches = [
  "IV Therapy",
  "Hyperbaric Oxygen Therapy",
  "Full-Body MRI",
  "Stem Cell Clinic",
  "NAD+ Infusion",
  "Cryotherapy",
  "Hormone Replacement Therapy",
  "Biological Age Test",
  "Longevity Physician",
  "Red Light Therapy",
  "Functional Medicine Doctor",
  "Peptide Therapy",
];

const trendingSearches = [
  "Exosome Therapy",
  "Continuous Glucose Monitor",
  "VO2 Max Testing",
  "Cognitive Health Screening",
  "Ozone Therapy",
  "Sauna & Cold Plunge",
  "Epigenetic Clock Test",
  "Mitochondrial Health Panel",
  "Rapamycin Clinic",
  "GLP-1 Clinic",
  "Gut Microbiome Test",
  "Telomere Testing",
];

const seasonalSearches = [
  "Summer Detox Program",
  "Pre-Travel Health Panel",
  "Sports Recovery Package",
  "Hormone Panel Check-up",
];

function searchHref(term: string) {
  return `/directory?q=${encodeURIComponent(term)}`;
}

export default function HomePage() {
  const activeCity = "Los Angeles, CA";

  return (
    <main className="landing">
      <header className="landing-header">
        <Link className="landing-brand" href="/">
          fountain
        </Link>
      </header>

      <div className="landing-search-row">
        <form className="landing-search" action="/directory" role="search">
          <input name="q" type="search" placeholder="Search treatments, clinics, doctors..." />
          <button type="submit" aria-label="Search">
            <Search size={18} aria-hidden="true" />
          </button>
        </form>
      </div>

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
          <p>Discover what people are searching for in each city</p>

          <div className="city-tabs" role="tablist" aria-label="Popular cities">
            {cities.map((city) => (
              <button key={city} type="button" role="tab" aria-selected={city === "Los Angeles"}>
                {city}
              </button>
            ))}
          </div>

          <div className="search-block">
            <h3>Top searches in {activeCity}</h3>
            <div className="search-grid">
              {topSearches.map((term) => (
                <Link href={searchHref(term)} key={term}>
                  {term}
                </Link>
              ))}
            </div>
            <span className="show-more">
              Show more
              <ChevronDown size={14} aria-hidden="true" />
            </span>
          </div>

          <div className="search-block">
            <h3>Trending searches in {activeCity}</h3>
            <div className="search-grid">
              {trendingSearches.map((term) => (
                <Link href={searchHref(term)} key={term}>
                  {term}
                </Link>
              ))}
            </div>
            <span className="show-more">
              Show more
              <ChevronDown size={14} aria-hidden="true" />
            </span>
          </div>

          <div className="search-block">
            <h3>Seasonal searches in {activeCity}</h3>
            <div className="search-grid">
              {seasonalSearches.map((term) => (
                <Link href={searchHref(term)} key={term}>
                  {term}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-wordmark">fountain</div>
        <div className="footer-columns">
          <div>
            <h4>Explore Fountain</h4>
            <ul>
              <li>
                <Link href="/directory?kind=locations">Clinics &amp; Med Spas</Link>
              </li>
              <li>
                <Link href="/directory?kind=practitioners">Practitioners</Link>
              </li>
              <li>
                <Link href="/directory">Treatments</Link>
              </li>
              <li>
                <Link href="/directory">Longevity Domains</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>For Providers</h4>
            <ul>
              <li>
                <a href="#">List Your Clinic</a>
              </li>
              <li>
                <a href="#">Claim Your Listing</a>
              </li>
              <li>
                <a href="#">Advertise With Us</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li>
                <a href="#">About Fountain</a>
              </li>
              <li>
                <a href="#">Careers</a>
              </li>
              <li>
                <a href="#">Press</a>
              </li>
              <li>
                <a href="#">Contact</a>
              </li>
            </ul>
          </div>
          <div>
            <h4>Resources</h4>
            <ul>
              <li>
                <a href="#">Help Center</a>
              </li>
              <li>
                <a href="#">Privacy Policy</a>
              </li>
              <li>
                <a href="#">Terms of Service</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">© 2026 Fountain. All rights reserved.</div>
      </footer>
    </main>
  );
}
