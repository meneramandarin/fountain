"use client";

import { useEffect, useMemo, useRef } from "react";
import { locationHref } from "@/lib/directory-urls";

type MapLocation = {
  id: number;
  slug?: string | null;
  name?: string | null;
  org_name?: string | null;
  locality?: string | null;
  region?: string | null;
  country_name?: string | null;
  image?: string | null;
  image_kind?: string | null;
  rating?: number | null;
  review_count?: number | null;
  treatments?: { name: string; domain: string }[];
  latitude?: number | null;
  longitude?: number | null;
};

export function DirectoryMap({ locations, activeLocationId }: { locations: MapLocation[]; activeLocationId: number | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markerElements = useRef(new Map<number, HTMLButtonElement>());
  const activeLocationIdRef = useRef(activeLocationId);
  const mappedLocations = useMemo(
    () => locations.filter(
      (location): location is MapLocation & { latitude: number; longitude: number } =>
        Number.isFinite(location.latitude) && Number.isFinite(location.longitude),
    ),
    [locations],
  );

  useEffect(() => {
    activeLocationIdRef.current = activeLocationId;
  }, [activeLocationId]);

  useEffect(() => {
    const container = containerRef.current;
    const markers = markerElements.current;
    if (!container || !mappedLocations.length) {
      return;
    }

    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    let openPopup: import("maplibre-gl").Popup | undefined;
    let activeMarker: HTMLButtonElement | undefined;

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
      markers.clear();

      const bounds = new maplibregl.LngLatBounds();
      for (const location of mappedLocations) {
        bounds.extend([location.longitude, location.latitude]);
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "directory-map-marker";
        marker.classList.toggle("is-active", activeLocationIdRef.current === location.id);
        marker.setAttribute("aria-label", `View ${location.name || location.org_name || "clinic"}`);
        marker.title = location.name || location.org_name || "Clinic";
        marker.addEventListener("click", () => {
          openPopup?.remove();
          marker.classList.add("is-active");
          activeMarker = marker;
          openPopup = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: false,
            className: "directory-map-popup",
            offset: 18,
          })
            .setLngLat([location.longitude, location.latitude])
            .setDOMContent(createPopupContent(location))
            .addTo(map!);
          openPopup.on("close", () => {
            marker.classList.remove("is-active");
            if (activeMarker === marker) {
              activeMarker = undefined;
              openPopup = undefined;
            }
          });
        });
        markers.set(location.id, marker);
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
      markers.clear();
      openPopup?.remove();
      map?.remove();
    };
  }, [mappedLocations]);

  useEffect(() => {
    for (const [id, marker] of markerElements.current) {
      marker.classList.toggle("is-active", id === activeLocationId);
    }
  }, [activeLocationId]);

  if (!mappedLocations.length) {
    return <div className="directory-map-empty">Map locations aren’t available for these results yet.</div>;
  }

  return <div ref={containerRef} className="directory-map" aria-label="Map of directory results" />;
}

function createPopupContent(location: MapLocation) {
  const card = document.createElement("a");
  card.className = "directory-map-popup-card";
  card.href = locationHref(location);

  if (location.image) {
    const isContainedGraphic = location.image_kind === "text_graphic" || location.image_kind === "logo";
    if (isContainedGraphic) {
      const frame = document.createElement("span");
      frame.className = "directory-map-popup-image-frame image-frame-text-graphic";

      const backdrop = document.createElement("img");
      backdrop.className = "directory-map-popup-image image-frame-backdrop";
      backdrop.src = location.image;
      backdrop.alt = "";
      backdrop.setAttribute("aria-hidden", "true");
      frame.append(backdrop);

      const image = document.createElement("img");
      image.className = "directory-map-popup-image image-frame-content";
      image.src = location.image;
      image.alt = "";
      frame.append(image);

      card.append(frame);
    } else {
      const image = document.createElement("img");
      image.className = "directory-map-popup-image";
      image.src = location.image;
      image.alt = "";
      card.append(image);
    }
  }

  const body = document.createElement("span");
  body.className = "directory-map-popup-body";

  const title = document.createElement("strong");
  title.textContent = location.name || location.org_name || "Unnamed clinic";
  body.append(title);

  const place = [location.locality, location.region || location.country_name].filter(Boolean).join(", ");
  if (place) {
    const locationText = document.createElement("span");
    locationText.className = "directory-map-popup-location";
    locationText.textContent = place;
    body.append(locationText);
  }

  const details = [
    location.rating ? `★ ${Number(location.rating).toFixed(1)}${location.review_count ? ` (${Number(location.review_count).toLocaleString()})` : ""}` : "",
    ...(location.treatments || []).slice(0, 2).map((treatment) => treatment.name),
  ].filter(Boolean);
  if (details.length) {
    const detailText = document.createElement("span");
    detailText.className = "directory-map-popup-details";
    detailText.textContent = details.join(" · ");
    body.append(detailText);
  }

  card.append(body);
  return card;
}
