import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { BackPillLink } from "@/components/back-pill-link";
import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { getTreatmentCatalog } from "@/lib/queries";
import { treatmentHref } from "@/lib/treatment-pages";
import styles from "./treatments.module.css";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Explore Longevity Treatments",
  description: "Browse longevity treatments and compare clinics, locations, and published prices on Fountain.",
  alternates: { canonical: "/treatments" },
  robots: { index: true, follow: true },
};

const loadTreatmentCatalog = cache(() => getTreatmentCatalog());

export default async function TreatmentsPage() {
  const treatments = await loadTreatmentCatalog();
  const groups = groupTreatments(treatments);

  return (
    <main className={styles.page}>
      <LandingScrollHeader alwaysVisible />

      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <BackPillLink href="/">Home</BackPillLink>
          <h1>Explore treatments</h1>
          <p className={styles.heroCopy}>
            Browse {treatments.length.toLocaleString()} treatments and compare clinics, locations, and published
            prices.
          </p>
        </div>
      </header>

      <div className={styles.content}>
        <div className={`${styles.contentInner} ${styles.catalog}`}>
          {groups.map((group) => (
            <section className={styles.catalogGroup} key={group.category}>
              <h2>{group.category}</h2>
              <ul className={styles.treatmentList}>
                {group.treatments.map((treatment) => (
                  <li key={treatment.id}>
                    <Link href={treatmentHref(treatment)}>
                      <span>{treatment.name}</span>
                      <small>{treatment.locationCount.toLocaleString()} locations</small>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <LandingFooter />
    </main>
  );
}

function groupTreatments<Treatment extends { category: string; name: string }>(treatments: Treatment[]) {
  const grouped = new Map<string, Treatment[]>();
  for (const treatment of treatments) {
    const group = grouped.get(treatment.category) || [];
    group.push(treatment);
    grouped.set(treatment.category, group);
  }

  return Array.from(grouped, ([category, group]) => ({
    category,
    treatments: group.sort((a, b) => a.name.localeCompare(b.name)),
  })).sort((a, b) => a.category.localeCompare(b.category));
}
