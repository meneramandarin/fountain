import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { getTreatmentIndexData } from "@/lib/queries";
import { treatmentHref } from "@/lib/treatment-pages";
import styles from "./treatments.module.css";

// Treatment supply changes throughout the day as provider menus are reconciled.
// Keep the public index close to the canonical catalog instead of serving a
// day-old treatment count after data-only updates.
export const revalidate = 300;

const loadTreatmentIndexData = cache(getTreatmentIndexData);

export async function generateMetadata(): Promise<Metadata> {
  const { treatments, clinicCount, cityCount } = await loadTreatmentIndexData();
  const title = "The Fountain Index — Longevity Treatments | Fountain";
  const description =
    `A catalogue of the longevity arts: ${treatments.length.toLocaleString()} treatments ` +
    `across ${clinicCount.toLocaleString()} clinics in ${cityCount.toLocaleString()} cities. ` +
    "Compare locations and prices for DEXA scans, HBOT, peptides, and more.";

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/treatments" },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
    },
    twitter: {
      title,
      description,
    },
  };
}

const chapters = [
  { category: "Measure", tagline: "First, know thyself", icon: IconMeasure },
  { category: "Optimize", tagline: "The daily alchemy", icon: IconOptimize },
  { category: "Recover", tagline: "Taking the waters", icon: IconRecover },
  { category: "Regenerate", tagline: "The frontier", icon: IconRegenerate },
  { category: "Rejuvenate", tagline: "The face of it", icon: IconRejuvenate },
] as const;

export default async function TreatmentsPage() {
  const { treatments, clinicCount, cityCount } = await loadTreatmentIndexData();

  return (
    <main className={styles.page}>
      <LandingScrollHeader alwaysVisible />
      <header className={styles.masthead}>
        <Image
          className={styles.heroImage}
          src="/treatments-index-hero.webp"
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
        />
        <h1 className={styles.visuallyHidden}>The Fountain Index</h1>
        <div className={styles.heroCopy}>
          <p className={styles.mastheadDek}>
            Everything you can presently do for a longer life — {treatments.length.toLocaleString()} treatments across{" "}
            {clinicCount.toLocaleString()} clinics in {cityCount.toLocaleString()} cities.
          </p>
        </div>
      </header>

      <div className={styles.index}>
        <div className={styles.categoryList}>
          {chapters.map((chapter) => {
            const categoryTreatments = treatments.filter((treatment) => treatment.category === chapter.category);

            if (categoryTreatments.length === 0) {
              return null;
            }

            const ChapterIcon = chapter.icon;

            return (
              <section className={styles.category} key={chapter.category}>
                <div className={styles.categoryHeader}>
                  <ChapterIcon />
                  <div>
                    <h2>{chapter.category}</h2>
                    <p className={styles.categoryTagline}>{chapter.tagline}</p>
                  </div>
                </div>

                <ul className={styles.treatmentList}>
                  {categoryTreatments.map((treatment) => (
                    <li key={treatment.id}>
                      <Link href={treatmentHref(treatment)} prefetch={false}>
                        <span>{treatment.name}</span>
                        <small>
                          {treatment.locationCount.toLocaleString()} {treatment.locationCount === 1 ? "location" : "locations"}
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
      width={96}
      height={96}
      unoptimized
      aria-hidden="true"
    />
  );
}

function IconMeasure() {
  return <ChapterIcon src="/category%20icons/Measure.webp" />;
}

function IconOptimize() {
  return <ChapterIcon src="/category%20icons/Optimize.webp" />;
}

function IconRecover() {
  return <ChapterIcon src="/category%20icons/Recover.webp" />;
}

function IconRegenerate() {
  return <ChapterIcon src="/category%20icons/Regenerate.webp" />;
}

function IconRejuvenate() {
  return <ChapterIcon src="/category%20icons/Rejuvenate.webp" />;
}
