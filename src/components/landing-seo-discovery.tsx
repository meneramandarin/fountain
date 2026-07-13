import Link from "next/link";
import {
  pilotTreatmentLocationHref,
  pilotTreatmentLocationPages,
  type PilotTreatmentLocationPage,
} from "@/lib/treatment-location-pages";
import {
  treatmentHref,
  type TreatmentCatalogItem,
} from "@/lib/treatment-pages";
import styles from "./landing-seo-discovery.module.css";

const cityOrder = [
  "new-york-ny",
  "miami-fl",
  "austin-tx",
  "san-francisco-ca",
  "los-angeles-ca",
  "san-diego-ca",
  "denver-co",
  "seattle-wa",
];
const homepageTreatmentsPerCategory = 4;

type LandingSeoDiscoveryProps = {
  treatments: TreatmentCatalogItem[];
};

export function LandingSeoDiscovery({ treatments }: LandingSeoDiscoveryProps) {
  const cityGroups = groupByCity();
  const treatmentGroups = groupTopTreatments(treatments);
  const displayedTreatmentCount = treatmentGroups.reduce(
    (total, group) => total + group.treatments.length,
    0,
  );

  return (
    <>
      <section
        className={`landing-discover ${styles.treatmentSection}`}
        aria-labelledby="explore-treatments-title"
      >
        <div className="discover-card">
          <h2 id="explore-treatments-title">Explore treatments</h2>
          <p>
            Browse {displayedTreatmentCount.toLocaleString()} popular treatments
            selected from our directory featuring dozens of treatments.{" "}
            <Link className={styles.directoryLink} href="/treatments">
              View all treatments
            </Link>
          </p>

          <div
            className={`location-search-columns ${styles.treatmentColumns}`}
            aria-label="Treatments by category"
          >
            {treatmentGroups.map((group) => (
              <div className="location-search-column" key={group.category}>
                <h3>{group.category}</h3>
                <div className="location-search-links">
                  {group.treatments.map((treatment) => (
                    <Link href={treatmentHref(treatment)} key={treatment.id}>
                      {treatment.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className={`landing-discover ${styles.locationSection}`}
        aria-labelledby="explore-by-location-title"
      >
        <div className="discover-card">
          <h2 id="explore-by-location-title">Explore by location</h2>
          <p>Browse treatment guides available by city</p>

          <div
            className="location-search-columns"
            aria-label="Treatment guides by city"
          >
            {cityGroups.map((group) => (
              <div className="location-search-column" key={group.slug}>
                <h3>{group.label}</h3>
                <div className="location-search-links">
                  {group.pages.map((page) => (
                    <Link
                      href={pilotTreatmentLocationHref(page)}
                      key={pilotTreatmentLocationHref(page)}
                    >
                      {page.treatment.searchLabel} in {page.place.locality}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

type CityGroup = {
  slug: string;
  label: string;
  pages: PilotTreatmentLocationPage[];
};

function groupByCity(): CityGroup[] {
  return cityOrder.flatMap((slug) => {
    const pages = pilotTreatmentLocationPages.filter(
      (page) => page.place.slug === slug,
    );
    const place = pages[0]?.place;
    return place
      ? [{ slug, label: `${place.locality}, ${place.region}`, pages }]
      : [];
  });
}

function groupTopTreatments(treatments: TreatmentCatalogItem[]) {
  const groups = new Map<string, TreatmentCatalogItem[]>();
  for (const treatment of treatments) {
    const group = groups.get(treatment.category) || [];
    if (group.length < homepageTreatmentsPerCategory) {
      group.push(treatment);
    }
    groups.set(treatment.category, group);
  }

  return Array.from(groups, ([category, group]) => ({
    category,
    treatments: group,
  })).sort((a, b) => a.category.localeCompare(b.category));
}
