"use client";

import type { LandingCitySearch, LandingCityTreatment, LandingCountrySearch } from "@/lib/queries";
import Link from "next/link";
import { useState } from "react";

type CityTreatmentSearchesProps = {
  countries: LandingCountrySearch[];
};

function cityKey(city: LandingCitySearch) {
  return `${city.country_code}:${city.locality}`;
}

function cityDisplayName(city: LandingCitySearch) {
  return city.region_code ? `${city.locality}, ${city.region_code}` : city.locality;
}

function citySeoName(city: LandingCitySearch) {
  return city.locality;
}

function cityDirectoryHref(city: LandingCitySearch, treatment: LandingCityTreatment) {
  const params = new URLSearchParams({ kind: "locations" });
  params.set("country", city.country_code);
  params.set("locality", city.locality);
  params.set("q", treatment.name);
  params.set("treatment_id", String(treatment.id));

  return `/directory?${params.toString()}`;
}

function countryDirectoryHref(country: LandingCountrySearch, treatment: LandingCityTreatment) {
  const params = new URLSearchParams({ kind: "locations" });
  params.set("country", country.country_code);
  params.set("q", treatment.name);
  params.set("treatment_id", String(treatment.id));

  return `/directory?${params.toString()}`;
}

export function CityTreatmentSearches({ countries }: CityTreatmentSearchesProps) {
  const [activeCountryCode, setActiveCountryCode] = useState(() => countries[0]?.country_code || "");

  if (!countries[0]) {
    return null;
  }

  return (
    <>
      <div className="browse-tabs country-tabs" role="group" aria-label="Countries">
        {countries.map((country) => {
          const isSelected = country.country_code === activeCountryCode;

          return (
            <button
              aria-label={`${country.country_name}, ${country.cities.length} cities`}
              aria-pressed={isSelected}
              key={country.country_code}
              onClick={() => setActiveCountryCode(country.country_code)}
              type="button"
            >
              {country.country_name}
            </button>
          );
        })}
      </div>

      {countries.map((country) => (
        <div
          className="location-country-panel"
          hidden={country.country_code !== activeCountryCode}
          key={country.country_code}
        >
          <div className="location-search-columns" aria-label={`Treatment searches in ${country.country_name}`}>
            <div className="location-search-column">
              <h3>Popular</h3>
              <div className="location-search-links">
                {country.treatments.map((treatment) => (
                  <Link href={countryDirectoryHref(country, treatment)} key={`${country.country_code}-${treatment.id}`}>
                    {treatment.name} in {country.country_name}
                  </Link>
                ))}
              </div>
            </div>

            {country.cities.map((city) => (
              <div className="location-search-column" key={cityKey(city)}>
                <h3>{cityDisplayName(city)}</h3>
                <div className="location-search-links">
                  {city.treatments.map((treatment) => (
                    <Link href={cityDirectoryHref(city, treatment)} key={`${cityKey(city)}-${treatment.id}`}>
                      {treatment.name} in {citySeoName(city)}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
