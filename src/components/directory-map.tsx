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
  tags?: { facet: string; value: string }[];
  latitude?: number | null;
  longitude?: number | null;
};

type MapBounds = { north: number; south: number; east: number; west: number };
type MapFocusLocation = { latitude: number; longitude: number };

const VISITOR_MAP_ZOOM = 9.5;

export function DirectoryMap({
  locations,
  activeLocationId,
  focusLocation,
  onBoundsChange,
}: {
  locations: MapLocation[];
  activeLocationId: number | null;
  focusLocation?: MapFocusLocation;
  onBoundsChange: (bounds: MapBounds) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const mapLoadedRef = useRef(false);
  const didSetInitialViewRef = useRef(false);
  const didApplyFocusRef = useRef(false);
  const userMovedMapRef = useRef(false);
  const focusLocationRef = useRef(focusLocation);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const markerElements = useRef(new Map<number, HTMLButtonElement>());
  const mapMarkers = useRef(new Map<number, import("maplibre-gl").Marker>());
  const openPopupRef = useRef<import("maplibre-gl").Popup | null>(null);
  const syncMarkersRef = useRef<() => void>(() => undefined);
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
    onBoundsChangeRef.current = onBoundsChange;
  }, [onBoundsChange]);

  useEffect(() => {
    focusLocationRef.current = focusLocation;
    const map = mapRef.current;
    if (!mapLoadedRef.current || !map || !focusLocation || didApplyFocusRef.current || userMovedMapRef.current) {
      return;
    }
    didApplyFocusRef.current = true;
    didSetInitialViewRef.current = true;
    focusMapOnVisitor(map, focusLocation, onBoundsChangeRef.current);
  }, [focusLocation]);

  useEffect(() => {
    const container = containerRef.current;
    const markerElementMap = markerElements.current;
    const markerMap = mapMarkers.current;
    if (!container || mapRef.current) {
      return;
    }
    let cancelled = false;

    void import("maplibre-gl").then((maplibregl) => {
      if (cancelled) {
        return;
      }
      maplibreRef.current = maplibregl;
      const first = mappedLocations[0];
      const map = new maplibregl.Map({
        container,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: first ? [first.longitude, first.latitude] : [0, 20],
        zoom: first ? 10 : 1.5,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        mapLoadedRef.current = true;
        const focus = focusLocationRef.current;
        if (focus && !userMovedMapRef.current) {
          didApplyFocusRef.current = true;
          didSetInitialViewRef.current = true;
          focusMapOnVisitor(map, focus, onBoundsChangeRef.current);
        }
        syncMarkersRef.current();
      });
      map.on("moveend", (event) => {
        // Programmatic fitBounds calls have no original browser event.
        if (!event.originalEvent) return;
        userMovedMapRef.current = true;
        const bounds = map.getBounds();
        onBoundsChangeRef.current(mapBoundsValue(bounds));
      });
    });

    return () => {
      cancelled = true;
      markerElementMap.clear();
      markerMap.clear();
      openPopupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is intentionally mounted once; results are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappedLocations]);

  function syncMarkers() {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !maplibregl || !mapLoadedRef.current) return;

    openPopupRef.current?.remove();
    for (const marker of mapMarkers.current.values()) marker.remove();
    mapMarkers.current.clear();
    markerElements.current.clear();
    const bounds = new maplibregl.LngLatBounds();
    for (const location of mappedLocations) {
      bounds.extend([location.longitude, location.latitude]);
      const element = document.createElement("button");
      element.type = "button";
      element.className = "directory-map-marker";
      element.classList.toggle("is-active", activeLocationIdRef.current === location.id);
      element.setAttribute("aria-label", `View ${location.name || location.org_name || "clinic"}`);
      element.title = location.name || location.org_name || "Clinic";
      element.addEventListener("click", () => {
        openPopupRef.current?.remove();
        element.classList.add("is-active");
        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, className: "directory-map-popup", offset: 18 })
          .setLngLat([location.longitude, location.latitude])
          .setDOMContent(createPopupContent(location))
          .addTo(map);
        openPopupRef.current = popup;
        popup.on("close", () => element.classList.remove("is-active"));
      });
      markerElements.current.set(location.id, element);
      mapMarkers.current.set(location.id, new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([location.longitude, location.latitude]).addTo(map));
    }
    if (!didSetInitialViewRef.current && mappedLocations.length) {
      didSetInitialViewRef.current = true;
      if (mappedLocations.length > 1) map.fitBounds(bounds, { padding: 72, maxZoom: 13, duration: 0 });
      else map.jumpTo({ center: [mappedLocations[0].longitude, mappedLocations[0].latitude], zoom: 10 });
    }
  }

  useEffect(() => {
    syncMarkersRef.current = syncMarkers;
  });

  useEffect(() => {
    for (const [id, marker] of markerElements.current) {
      marker.classList.toggle("is-active", id === activeLocationId);
    }
  }, [activeLocationId]);

  return (
    <div className="directory-map-wrap">
      <div ref={containerRef} className="directory-map" aria-label="Map of directory results" />
      {!mappedLocations.length ? <div className="directory-map-empty">No listings in this map area.</div> : null}
    </div>
  );
}

function focusMapOnVisitor(
  map: import("maplibre-gl").Map,
  focus: MapFocusLocation,
  onBoundsChange: (bounds: MapBounds) => void,
) {
  map.jumpTo({ center: [focus.longitude, focus.latitude], zoom: VISITOR_MAP_ZOOM });
  onBoundsChange(mapBoundsValue(map.getBounds()));
}

function mapBoundsValue(bounds: import("maplibre-gl").LngLatBounds) {
  return {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  };
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
    location.tags?.some(
      (tag) => tag.facet === "care_model" && tag.value.toLowerCase() === "mobile service",
    ) ? "Mobile service" : "",
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
