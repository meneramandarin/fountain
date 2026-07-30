"use client";

import { useEffect, useState } from "react";

type VisitorLocation = {
  city?: string;
};

export function LandingGeoHeading({ initialCity }: { initialCity?: string }) {
  const [city, setCity] = useState(() => cleanCity(initialCity));

  useEffect(() => {
    if (city) {
      return;
    }

    const controller = new AbortController();
    fetch("/api/geo", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { location: null })
      .then((data: { location?: VisitorLocation | null }) => {
        setCity(cleanCity(data.location?.city));
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setCity("");
        }
      });

    return () => controller.abort();
  }, [city]);

  return (
    <h2 aria-live="polite">
      {city
        ? `Discover longevity treatments and clinics in ${city}.`
        : "Discover longevity treatments and clinics nearby."}
    </h2>
  );
}

function cleanCity(value?: string) {
  return value?.trim().slice(0, 120) || "";
}
