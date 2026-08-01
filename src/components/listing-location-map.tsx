"use client";

import { useEffect, useRef } from "react";

export function ListingLocationMap({
  latitude,
  longitude,
  title,
  address,
}: {
  latitude: number;
  longitude: number;
  title: string;
  address: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map: import("maplibre-gl").Map | null = null;

    void import("maplibre-gl").then((maplibregl) => {
      if (cancelled) return;

      map = new maplibregl.Map({
        container,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [longitude, latitude],
        zoom: 13,
        bearing: 0,
        pitch: 0,
        maxPitch: 0,
      });

      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.on("style.load", () => {
        for (const layer of map?.getStyle().layers || []) {
          if (layer.type === "fill-extrusion") {
            map?.setLayoutProperty(layer.id, "visibility", "none");
          }
        }
      });

      const markerButton = document.createElement("button");
      markerButton.className = "listing-location-map-marker";
      markerButton.type = "button";
      markerButton.setAttribute("aria-label", `${title} location`);

      const markerPin = document.createElement("span");
      markerPin.setAttribute("aria-hidden", "true");
      markerButton.append(markerPin);

      const popupContent = document.createElement("div");
      popupContent.className = "listing-location-map-popup";
      const popupTitle = document.createElement("strong");
      popupTitle.textContent = title;
      const popupAddress = document.createElement("span");
      popupAddress.textContent = address;
      popupContent.append(popupTitle, popupAddress);

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: true,
        offset: 24,
      }).setDOMContent(popupContent);

      new maplibregl.Marker({ element: markerButton, anchor: "bottom" })
        .setLngLat([longitude, latitude])
        .setPopup(popup)
        .addTo(map);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [address, latitude, longitude, title]);

  return (
    <div
      ref={containerRef}
      className="listing-location-map"
      aria-label={`Map showing ${title}`}
    />
  );
}
