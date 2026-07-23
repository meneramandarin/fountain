import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { getTreatmentHubs } from "@/lib/treatment-hubs";
import styles from "./treatments.module.css";

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "Treatments",
  description: "Treatments with clinic locations listed by city.",
  alternates: { canonical: "/treatments" },
  robots: { index: true, follow: true },
};

const loadTreatmentHubs = cache(getTreatmentHubs);

const chapters = [
  {
    category: "Measure",
    roman: "I",
    headline: "First, Know Thyself",
    dek: "Every practice in this catalogue begins with an honest accounting. The scans, panels, and clocks — instruments for establishing where the body stands before anything is asked of it.",
    icon: IconMeasure,
    caption: "Calipers, for the taking of measure.",
  },
  {
    category: "Optimize",
    roman: "II",
    headline: "The Daily Alchemy",
    dek: "The slow work of adjustment: hormones balanced, nutrition tuned, deficiencies corrected. Not transformation but calibration, repeated until it holds.",
    icon: IconOptimize,
    caption: "Vessel and retort, the instruments of daily calibration.",
  },
  {
    category: "Recover",
    roman: "III",
    headline: "Taking the Waters",
    dek: "The oldest chapter in the book. Heat, cold, pressure, touch, and rest — rituals of repair practiced for millennia, now with better instrumentation.",
    icon: IconRecover,
    caption: "A basin for the oldest cures: heat, water, rest.",
  },
  {
    category: "Regenerate",
    roman: "IV",
    headline: "The Frontier",
    dek: "The shortest chapter, for now. Cellular and biologic therapies that aim not to maintain the body but to rebuild it — the newest and least settled science in the index.",
    icon: IconRegenerate,
    caption: "New growth, uncoiling — emblem of the frontier chapter.",
  },
  {
    category: "Rejuvenate",
    roman: "V",
    headline: "The Face of It",
    dek: "Longevity, made visible. The needles, lasers, and light of wearing the years well.",
    icon: IconRejuvenate,
    caption: "The hand mirror, longevity's oldest instrument of judgment.",
  },
] as const;

export default async function TreatmentsPage() {
  const hubs = (await loadTreatmentHubs())
    .filter((hub) => hub.totalCities > 0)
    .sort((a, b) => a.treatment.name.localeCompare(b.treatment.name));
  const clinicCount = hubs.reduce((total, hub) => total + hub.totalLocations, 0);
  const cityCount = new Set(
    hubs.flatMap((hub) =>
      hub.cities.map((city) => [city.city, city.region, city.countryCode].join("|")),
    ),
  ).size;

  return (
    <main className={styles.page}>
      <LandingScrollHeader alwaysVisible />
      <header className={styles.masthead}>
        <Image
          className={styles.heroImage}
          src="/treatments-index-hero.png?v=3"
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
        />
        <h1 className={styles.visuallyHidden}>The Fountain Index</h1>
        <div className={styles.heroCopy}>
          <p className={styles.heroKicker}>A Catalogue of the Longevity Arts</p>
          <p className={styles.mastheadDek}>
            Everything you can presently do for a longer life — {hubs.length.toLocaleString()} treatments across{" "}
            {clinicCount.toLocaleString()} clinics in {cityCount.toLocaleString()} cities.
          </p>
        </div>
      </header>

      <div className={styles.index}>
        <div className={styles.categoryList}>
          {chapters.map((chapter, chapterIndex) => {
            const categoryHubs = hubs.filter((hub) => hub.treatment.category === chapter.category);

            if (categoryHubs.length === 0) {
              return null;
            }

            const ChapterIcon = chapter.icon;

            return (
              <section
                className={`${styles.category} ${chapterIndex % 2 === 1 ? styles.categoryReverse : ""}`}
                key={chapter.category}
              >
                <div className={styles.chapterOpening}>
                  <div className={styles.chapterCopy}>
                    <p className={styles.chapterKicker}>
                      Chapter {chapter.roman} · {chapter.category}
                    </p>
                    <h2>{chapter.headline}</h2>
                    <p className={styles.chapterDek}>{chapter.dek}</p>
                  </div>

                  <figure className={styles.iconPlate}>
                    <div className={styles.iconPlateFrame}>
                      <ChapterIcon />
                    </div>
                    <figcaption>
                      Plate {chapter.roman} — {chapter.caption}
                    </figcaption>
                  </figure>
                </div>

                <ul className={styles.treatmentList}>
                  {categoryHubs.map((hub) => (
                    <li key={hub.treatment.id}>
                      <Link href={hub.href}>
                        <span>{hub.treatment.name}</span>
                        <small>
                          {hub.totalLocations.toLocaleString()} {hub.totalLocations === 1 ? "location" : "locations"}
                        </small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      <LandingFooter />
    </main>
  );
}

function ChapterIcon({ src }: { src: string }) {
  return (
    <Image
      className={styles.chapterIcon}
      src={src}
      alt=""
      width={320}
      height={320}
      unoptimized
      aria-hidden="true"
    />
  );
}

function IconMeasure() {
  return <ChapterIcon src="/category%20icons/Measure.png" />;
}

function IconOptimize() {
  return <ChapterIcon src="/category%20icons/Optimize.png" />;
}

function IconRecover() {
  return <ChapterIcon src="/category%20icons/Recover.png" />;
}

function IconRegenerate() {
  return <ChapterIcon src="/category%20icons/Regenerate.png" />;
}

function IconRejuvenate() {
  return <ChapterIcon src="/category%20icons/Rejuvenate.png?v=rotated-90" />;
}
