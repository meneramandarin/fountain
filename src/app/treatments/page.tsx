import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
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

export default async function TreatmentsPage() {
  const hubs = (await loadTreatmentHubs())
    .filter((hub) => hub.totalCities > 0)
    .sort((a, b) => a.treatment.name.localeCompare(b.treatment.name));

  return (
    <main className={styles.page}>
      <div className={styles.index}>
        <h1>Treatments</h1>
        <ul className={styles.treatmentList}>
          {hubs.map((hub) => (
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
      </div>
    </main>
  );
}
