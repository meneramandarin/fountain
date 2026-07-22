import Link from "next/link";
import {
  treatmentHref,
  type TreatmentCatalogItem,
} from "@/lib/treatment-pages";
import styles from "./landing-seo-discovery.module.css";

const homepageTreatmentsPerCategory = 4;

export type TreatmentLocationDiscoveryLink = {
  href: string;
  treatmentLabel: string;
  cityLabel: string;
  city: string;
};

type LandingSeoDiscoveryProps = {
  treatments: TreatmentCatalogItem[];
  locationPages: TreatmentLocationDiscoveryLink[];
};

export function LandingSeoDiscovery({ treatments, locationPages }: LandingSeoDiscoveryProps) {
  const cityGroups = groupByCity(locationPages);
  const treatmentGroups = groupTopTreatments(treatments);

  return (
    <>
      <section
        className={`landing-discover ${styles.treatmentSection}`}
        aria-labelledby="explore-treatments-title"
      >
        <div className="discover-card">
          <h2 id="explore-treatments-title">Explore treatments</h2>
          <p>
            Browse popular treatments or{" "}
            <Link className={styles.directoryLink} href="/treatments">
              view all treatments here.
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
                      href={page.href}
                      key={page.href}
                    >
                      {page.treatmentLabel} in {page.city}
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
  pages: TreatmentLocationDiscoveryLink[];
};

function groupByCity(pages: TreatmentLocationDiscoveryLink[]): CityGroup[] {
  const groups = new Map<string, CityGroup>();
  for (const page of pages) {
    const group = groups.get(page.cityLabel) || { slug: page.cityLabel, label: page.cityLabel, pages: [] };
    group.pages.push(page);
    groups.set(page.cityLabel, group);
  }
  return Array.from(groups.values());
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
