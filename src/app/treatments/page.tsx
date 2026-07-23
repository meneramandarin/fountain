import type { Metadata } from "next";
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
const treatmentCategories = ["Measure", "Optimize", "Recover", "Regenerate", "Rejuvenate"] as const;

export default async function TreatmentsPage() {
  const hubs = (await loadTreatmentHubs())
    .filter((hub) => hub.totalCities > 0)
    .sort((a, b) => a.treatment.name.localeCompare(b.treatment.name));

  return (
    <main className={styles.page}>
      <LandingScrollHeader alwaysVisible />
      <div className={styles.index}>
        <h1>Treatments</h1>
        <div className={styles.categoryList}>
          {treatmentCategories.map((category) => {
            const categoryHubs = hubs.filter((hub) => hub.treatment.category === category);

            if (categoryHubs.length === 0) {
              return null;
            }

            return (
              <section className={styles.category} key={category}>
                <h2>{category}</h2>
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
