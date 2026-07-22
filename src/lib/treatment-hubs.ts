import { getEligibleTreatmentCities, getTreatmentCatalog } from "@/lib/queries";
import { findPilotTreatmentLocationHref } from "@/lib/treatment-location-pages";
import {
  treatmentHref,
  treatmentSlug,
  type TreatmentCatalogItem,
  type TreatmentCityCount,
} from "@/lib/treatment-pages";

export type TreatmentHubCity = TreatmentCityCount & {
  href: string;
};

export type TreatmentHub = {
  treatment: TreatmentCatalogItem;
  href: string;
  cities: TreatmentHubCity[];
  totalLocations: number;
  totalCities: number;
};

export async function getTreatmentHubs() {
  const [treatments, cities] = await Promise.all([
    getTreatmentCatalog(),
    getEligibleTreatmentCities(),
  ]);
  return buildTreatmentHubs(treatments, cities);
}

export async function getTreatmentHub(slug: string) {
  return (await getTreatmentHubs()).find((hub) => treatmentSlug(hub.treatment.name) === slug) || null;
}

export function buildTreatmentHubs(
  treatments: TreatmentCatalogItem[],
  cities: TreatmentCityCount[],
): TreatmentHub[] {
  const citiesByTreatment = new Map<number, TreatmentHubCity[]>();

  for (const city of cities) {
    const href = findPilotTreatmentLocationHref({
      treatmentId: city.treatmentId,
      locality: city.city,
      region: city.region,
      countryCode: city.countryCode,
    });
    if (!href) {
      continue;
    }

    const treatmentCities = citiesByTreatment.get(city.treatmentId) || [];
    treatmentCities.push({ ...city, href });
    citiesByTreatment.set(city.treatmentId, treatmentCities);
  }

  return treatments.map((treatment) => {
    const treatmentCities = (citiesByTreatment.get(treatment.id) || []).sort(
      (a, b) => b.locationCount - a.locationCount || cityLabel(a).localeCompare(cityLabel(b)),
    );
    return {
      treatment,
      href: treatmentHref(treatment),
      cities: treatmentCities,
      totalLocations: treatmentCities.reduce((sum, city) => sum + city.locationCount, 0),
      totalCities: treatmentCities.length,
    };
  });
}

export function cityLabel(city: Pick<TreatmentCityCount, "city" | "region" | "countryName" | "countryCode">) {
  return `${city.city}, ${city.region || city.countryName || city.countryCode}`;
}
