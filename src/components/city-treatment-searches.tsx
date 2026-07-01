"use client";

import type { LandingCitySearch, LandingCityTreatment } from "@/lib/queries";
import Link from "next/link";
import { useState } from "react";

type CityTreatmentSearchesProps = {
  cities: LandingCitySearch[];
};

function cityKey(city: LandingCitySearch) {
  return `${city.country_code}:${city.locality}`;
}

function cityDisplayName(city: LandingCitySearch) {
  return city.region_code ? `${city.locality}, ${city.region_code}` : city.locality;
}

function directoryHref(city: LandingCitySearch, treatment?: LandingCityTreatment) {
  const params = new URLSearchParams({ kind: "locations" });
  params.set("country", city.country_code);
  params.set("locality", city.locality);

  if (treatment) {
    params.set("q", treatment.name);
    params.set("treatment_id", String(treatment.id));
  }

  return `/directory?${params.toString()}`;
}

export function CityTreatmentSearches({ cities }: CityTreatmentSearchesProps) {
  const [activeCityKey, setActiveCityKey] = useState(() => (cities[0] ? cityKey(cities[0]) : ""));
  const activeCity = cities.find((city) => cityKey(city) === activeCityKey) || cities[0];

  if (!activeCity) {
    return null;
  }

  const activeCityName = cityDisplayName(activeCity);

  return (
    <>
      <div className="city-tabs" role="group" aria-label="Popular cities">
        {cities.map((city) => {
          const key = cityKey(city);
          const isSelected = key === activeCityKey;

          return (
            <button
              aria-pressed={isSelected}
              key={key}
              onClick={() => setActiveCityKey(key)}
              type="button"
            >
              {cityDisplayName(city)}
            </button>
          );
        })}
      </div>

      <div className="city-selected-searches">
        <div className="city-selected-heading">
          <h3>Treatments in {activeCityName}</h3>
        </div>
        <div className="city-treatment-links" aria-label={`Treatments available in ${activeCityName}`}>
          {activeCity.treatments.map((treatment) => (
            <Link href={directoryHref(activeCity, treatment)} key={`${activeCity.country_code}-${activeCity.locality}-${treatment.id}`}>
              {treatment.name}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
