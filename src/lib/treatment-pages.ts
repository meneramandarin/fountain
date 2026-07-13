export const minimumTreatmentPageLocations = 10;

export type TreatmentCatalogItem = {
  id: number;
  name: string;
  category: string;
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

export function isTreatmentPageIndexable(treatment: Pick<TreatmentCatalogItem, "locationCount">) {
  return treatment.locationCount >= minimumTreatmentPageLocations;
}
