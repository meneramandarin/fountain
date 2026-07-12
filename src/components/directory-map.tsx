"use client";

import { useEffect, useRef } from "react";
import { locationHref } from "@/lib/directory-urls";

type MapLocation = {
  id: number;
  slug?: string | null;
  name?: string | null;
  org_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function DirectoryMap({ locations }: { locations: MapLocation[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mappedLocations = locations.filter(
    (location): location is MapLocation & { latitude: number; longitude: number } =>
      Number.isFinite(location.latitude) && Number.isFinite(location.longitude),
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mappedLocations.length) {
      return;
    }

    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;

    void import("maplibre-gl").then((maplibregl) => {
      if (cancelled) {
        return;
      }

      map = new maplibregl.Map({
        container,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [mappedLocations[0].longitude, mappedLocations[0].latitude],
        zoom: 10,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      const bounds = new maplibregl.LngLatBounds();
      for (const location of mappedLocations) {
        bounds.extend([location.longitude, location.latitude]);
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "directory-map-marker";
        marker.setAttribute("aria-label", `View ${location.name || location.org_name || "clinic"}`);
        marker.title = location.name || location.org_name || "Clinic";
        marker.addEventListener("click", () => {
          window.location.assign(locationHref(location));
        });
        new maplibregl.Marker({ element: marker, anchor: "center" })
          .setLngLat([location.longitude, location.latitude])
          .addTo(map);
      }

      if (mappedLocations.length > 1) {
        map.fitBounds(bounds, { padding: 72, maxZoom: 13, duration: 0 });
      }
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [mappedLocations]);

  if (!mappedLocations.length) {
    return <div className="directory-map-empty">Map locations aren’t available for these results yet.</div>;
  }

  return <div ref={containerRef} className="directory-map" aria-label="Map of directory results" />;
}
