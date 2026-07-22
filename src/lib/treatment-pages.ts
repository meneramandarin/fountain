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

export function isTreatmentPageIndexable(cityCount: number) {
  return cityCount > 0;
}
