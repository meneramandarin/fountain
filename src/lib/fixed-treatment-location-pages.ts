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

export const fixedTreatmentLocationPages: readonly FixedTreatmentLocationPage[] =
  fixedTreatmentLocationCities.flatMap((city) =>
    fixedTreatmentLocationTreatments.map((treatment) => ({
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
