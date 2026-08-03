export type FixedTreatmentLocationTreatment = {
  id: number;
  name: string;
  slug: string;
};

export type FixedTreatmentLocationCity = {
  city: string;
  region: string;
  countryCode: "US";
  slug: string;
};

export type FixedTreatmentLocationPage = {
  treatment: FixedTreatmentLocationTreatment;
  city: FixedTreatmentLocationCity;
  href: string;
};

export const fixedTreatmentLocationTreatments = [
  { id: 3, name: "DEXA scan", slug: "dexa-scan" },
  { id: 8, name: "VO2 max test", slug: "vo2-max-test" },
  { id: 74, name: "IV Infusions", slug: "iv-infusions" },
  { id: 27, name: "Hyperbaric oxygen therapy", slug: "hyperbaric-oxygen-therapy" },
  { id: 1, name: "Full-body MRI", slug: "full-body-mri" },
] as const satisfies readonly FixedTreatmentLocationTreatment[];

export const fixedTreatmentLocationCities = [
  { city: "New York", region: "NY", countryCode: "US", slug: "new-york-ny" },
  { city: "Los Angeles", region: "CA", countryCode: "US", slug: "los-angeles-ca" },
  { city: "San Francisco", region: "CA", countryCode: "US", slug: "san-francisco-ca" },
  { city: "Miami", region: "FL", countryCode: "US", slug: "miami-fl" },
  { city: "Denver", region: "CO", countryCode: "US", slug: "denver-co" },
  { city: "Austin", region: "TX", countryCode: "US", slug: "austin-tx" },
] as const satisfies readonly FixedTreatmentLocationCity[];

const houston = { city: "Houston", region: "TX", countryCode: "US", slug: "houston-tx" } as const;
const sanDiego = { city: "San Diego", region: "CA", countryCode: "US", slug: "san-diego-ca" } as const;
const chicago = { city: "Chicago", region: "IL", countryCode: "US", slug: "chicago-il" } as const;
const lasVegas = { city: "Las Vegas", region: "NV", countryCode: "US", slug: "las-vegas-nv" } as const;

const newYork = fixedTreatmentLocationCities[0];
const austin = fixedTreatmentLocationCities[5];

// Launch order from the Aug 2026 market-opportunity study's measured DEXA demand
// ranking (NYC, Austin, Houston, San Diego, Chicago, Las Vegas) rather than the
// shared default city set used by the other fixed treatments.
const dexaScanLaunchCities = [newYork, austin, houston, sanDiego, chicago, lasVegas] as const;

const citiesByTreatmentSlug: Record<string, readonly FixedTreatmentLocationCity[]> = {
  "dexa-scan": dexaScanLaunchCities,
};

export const fixedTreatmentLocationPages: readonly FixedTreatmentLocationPage[] =
  fixedTreatmentLocationTreatments.flatMap((treatment) =>
    (citiesByTreatmentSlug[treatment.slug] ?? fixedTreatmentLocationCities).map((city) => ({
      treatment,
      city,
      href: `/treatments/${treatment.slug}/${city.slug}`,
    })),
  );

export function findFixedTreatmentLocationPage(treatmentSlug: string, citySlug: string) {
  return fixedTreatmentLocationPages.find(
    (page) => page.treatment.slug === treatmentSlug && page.city.slug === citySlug,
  ) || null;
}

export function isFixedTreatmentLocationPage(treatmentId: number, citySlug: string) {
  return fixedTreatmentLocationPages.some(
    (page) => page.treatment.id === treatmentId && page.city.slug === citySlug,
  );
}
