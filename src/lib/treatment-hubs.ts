import { isFixedTreatmentLocationPage } from "@/lib/fixed-treatment-location-pages";
import { getCityIndexPlaces, getEligibleTreatmentCities, getTreatmentCatalog } from "@/lib/queries";
import {
  treatmentCityHref,
  treatmentCitySlug,
  treatmentHref,
  treatmentSlug,
  type TreatmentCatalogItem,
  type TreatmentCityCount,
} from "@/lib/treatment-pages";

export type TreatmentHubCity = TreatmentCityCount & {
  href: string;
  indexable: boolean;
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
    getTreatmentCatalog(0),
    getEligibleTreatmentCities(1),
  ]);
  return buildTreatmentHubs(treatments, cities);
}

export async function getTreatmentHub(slug: string) {
  return (await getTreatmentHubs()).find((hub) => treatmentSlug(hub.treatment.name) === slug) || null;
}

export function prepareTreatmentIndexHubs(hubs: TreatmentHub[]) {
  return [...hubs].sort((a, b) => a.treatment.name.localeCompare(b.treatment.name));
}

export async function getTreatmentCityPage(treatmentSlugValue: string, citySlugValue: string) {
  const [hub, places] = await Promise.all([
    getTreatmentHub(treatmentSlugValue),
    getCityIndexPlaces(),
  ]);
  if (!hub) {
    return null;
  }
  const countedCity = hub.cities.find((candidate) => treatmentCitySlug(candidate) === citySlugValue);
  if (countedCity) {
    return { hub, city: countedCity };
  }

  const place = places.find((candidate) =>
    isUsableCityName(candidate.city) && treatmentCitySlug(candidate) === citySlugValue,
  );
  if (!place) {
    return null;
  }

  const indexable = isFixedTreatmentLocationPage(hub.treatment.id, citySlugValue);
  const city: TreatmentHubCity = {
    ...place,
    treatmentId: hub.treatment.id,
    locationCount: 0,
    indexable,
    href: indexable
      ? treatmentCityHref(hub.treatment, place)
      : directoryTreatmentCityHref(hub.treatment, place),
  };
  return { hub, city };
}

export function buildTreatmentHubs(
  treatments: TreatmentCatalogItem[],
  cities: TreatmentCityCount[],
): TreatmentHub[] {
  const citiesByTreatment = new Map<number, TreatmentHubCity[]>();

  for (const city of cities) {
    if (!isUsableCityName(city.city)) {
      continue;
    }
    const treatment = treatments.find((candidate) => candidate.id === city.treatmentId);
    if (!treatment) {
      continue;
    }
    const indexable = isFixedTreatmentLocationPage(treatment.id, treatmentCitySlug(city));
    const href = indexable
      ? treatmentCityHref(treatment, city)
      : directoryTreatmentCityHref(treatment, city);
    const treatmentCities = citiesByTreatment.get(city.treatmentId) || [];
    treatmentCities.push({ ...city, href, indexable });
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

export function directoryTreatmentCityHref(
  treatment: Pick<TreatmentCatalogItem, "id">,
  city: Pick<TreatmentCityCount, "city" | "region" | "countryName" | "countryCode" | "latitude" | "longitude">,
) {
  const params = new URLSearchParams({
    kind: "locations",
    treatment_id: String(treatment.id),
    city_label: cityLabel(city),
    city_country: city.countryCode,
    city_lat: String(city.latitude),
    city_lng: String(city.longitude),
  });
  return `/directory?${params.toString()}`;
}

export function cityLabel(city: Pick<TreatmentCityCount, "city" | "region" | "countryName" | "countryCode">) {
  if (city.countryCode === "US" && city.region) {
    return `${city.city}, ${city.region}`;
  }
  return `${city.city}${city.region ? `, ${city.region}` : ""}, ${city.countryName || city.countryCode}`;
}

function isUsableCityName(city: string) {
  const value = city.trim();
  return Boolean(value && !value.includes(",") && !/\b(?:virtual|various|unknown)\b/i.test(value));
}
