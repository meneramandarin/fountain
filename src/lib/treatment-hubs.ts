import { findFixedTreatmentLocationPage, isFixedTreatmentLocationPage } from "@/lib/fixed-treatment-location-pages";
import {
  getCityIndexPlace,
  getCityIndexPlaces,
  getEligibleTreatmentCities,
  getTreatmentCatalog,
  getTreatmentRouteItem,
} from "@/lib/queries";
import {
  treatmentCityHref,
  treatmentCitySlug,
  treatmentHref,
  treatmentSlug,
  type CityIndexPlace,
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
  return hubs
    .filter((hub) => hub.totalCities > 0)
    .sort((a, b) => a.treatment.name.localeCompare(b.treatment.name));
}

export async function getTreatmentCityPage(treatmentSlugValue: string, citySlugValue: string) {
  const fixedPage = findFixedTreatmentLocationPage(treatmentSlugValue, citySlugValue);
  if (fixedPage) {
    const [treatment, place] = await Promise.all([
      getTreatmentRouteItem(treatmentSlugValue),
      getCityIndexPlace({
        city: fixedPage.city.city,
        region: fixedPage.city.region,
        countryCode: fixedPage.city.countryCode,
      }),
    ]);
    if (!treatment || !place || treatment.id !== fixedPage.treatment.id) {
      return null;
    }
    return treatmentCityPageResult(treatment, place, true, fixedPage.href);
  }

  const [treatment, places] = await Promise.all([
    getTreatmentRouteItem(treatmentSlugValue),
    getCityIndexPlaces(),
  ]);
  if (!treatment) {
    return null;
  }

  const place = places.find((candidate) =>
    isUsableCityName(candidate.city) && treatmentCitySlug(candidate) === citySlugValue,
  );
  if (!place) {
    return null;
  }

  return treatmentCityPageResult(
    treatment,
    place,
    false,
    directoryTreatmentCityHref(treatment, place),
  );
}

function treatmentCityPageResult(
  treatment: TreatmentCatalogItem,
  place: CityIndexPlace,
  indexable: boolean,
  href: string,
) {
  const city: TreatmentHubCity = {
    ...place,
    treatmentId: treatment.id,
    locationCount: 0,
    indexable,
    href,
  };
  const hub: TreatmentHub = {
    treatment,
    href: treatmentHref(treatment),
    cities: [city],
    totalLocations: 0,
    totalCities: 1,
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
