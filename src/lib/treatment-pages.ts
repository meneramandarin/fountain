export const minimumTreatmentCityLocations = 3;

export type TreatmentCatalogItem = {
  id: number;
  name: string;
  category: string;
  locationCount: number;
};

export type TreatmentCityCount = {
  treatmentId: number;
  city: string;
  region: string | null;
  countryCode: string;
  countryName: string | null;
  latitude: number;
  longitude: number;
  locationCount: number;
};

export function treatmentSlug(name: string) {
  return name
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function treatmentHref(treatment: Pick<TreatmentCatalogItem, "name">) {
  return `/treatments/${treatmentSlug(treatment.name)}`;
}

export function treatmentCitySlug(city: Pick<TreatmentCityCount, "city" | "region" | "countryCode">) {
  const place = city.countryCode === "US" && city.region
    ? `${city.city}-${city.region}`
    : `${city.city}-${city.region ? `${city.region}-` : ""}${city.countryCode}`;
  return treatmentSlug(place);
}

export function treatmentCityHref(
  treatment: Pick<TreatmentCatalogItem, "name">,
  city: Pick<TreatmentCityCount, "city" | "region" | "countryCode">,
) {
  return `${treatmentHref(treatment)}/${treatmentCitySlug(city)}`;
}

export function isTreatmentPageIndexable(cityCount: number) {
  return cityCount > 0;
}
