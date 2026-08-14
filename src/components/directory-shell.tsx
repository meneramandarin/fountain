"use client";

import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { DirectoryLocationCard, type DirectoryLocationCardData } from "@/components/directory-location-card";
import { DirectoryMap } from "@/components/directory-map";
import { TreatmentExternalData } from "@/components/treatment-external-data";
import { TreatmentRegulatoryStatus } from "@/components/treatment-regulatory-status";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Stethoscope } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { practitionerHref } from "@/lib/directory-urls";
import { formatLocationPlace } from "@/lib/location-display";
import {
  directorySearchResultsHeading,
  treatmentLocationResultsHeading,
} from "@/lib/treatment-location-metadata";
import type { TreatmentExternalData as TreatmentExternalDataRecord } from "@/lib/treatment-external-data";
import type { TreatmentFdaRegulatoryStatus } from "@/lib/treatment-regulatory-status";

type Kind = "locations" | "practitioners";

export type DirectoryState = {
  kind: Kind;
  q: string;
  country: string;
  locality: string;
  city_label: string;
  city_country: string;
  place_type: string;
  city_lat?: number;
  city_lng?: number;
  treatment_ids: string[];
  entity_type: string;
  care_model: string;
  page: number;
};

export type SearchPayload = {
  results: Array<LocationResultRow | PractitionerResultRow>;
  total: number;
  page: number;
  page_size: number;
  mode?: SearchMode;
  effective_radius?: number | null;
  searched_city?: string | null;
  searched_country?: string | null;
  city_total?: number | null;
  treatment_price_summaries?: Array<{
    currency: string | null;
    minimum: number;
    offeringCount: number;
    locationCount: number;
  }>;
  resolved_treatment?: {
    id: number;
    name: string;
    category: string;
  };
};

type SearchMode = "exact_radius" | "expanded_radius" | "country_fallback" | "country_search" | "cross_border" | "empty" | "map_bounds";

type MapBounds = { north: number; south: number; east: number; west: number };

type Tag = { facet: string; value: string };
type TreatmentChip = { name: string; domain: string };
type AffiliationRef = {
  id?: number;
  slug?: string | null;
  pid?: number;
  clinic?: string | null;
  locality?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  role?: string | null;
};
type LocationResultRow = {
  treatments?: TreatmentChip[];
  tags?: Tag[];
  distance_miles?: number | null;
  latitude?: number | null;
  longitude?: number | null;
} & DirectoryLocationCardData;
type PractitionerResultRow = {
  id: number;
  slug?: string | null;
  full_name?: string | null;
  primary_specialty?: string | null;
  years_experience?: number | null;
  affiliations?: AffiliationRef[];
  image?: string | null;
};
type VisitorLocation = {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
};
type CachedVisitorLocation = {
  location: VisitorLocation | null;
  cachedAt: number;
};

const visitorLocationCacheKey = "fountain.visitorLocation.v1";

export function DirectoryShell({
  initialPayload,
  initialState: seededState,
  initialTreatmentLabel,
  initialTreatmentCategory,
  searchHeading,
  treatmentExternalData,
  treatmentFdaRegulatoryStatus,
}: {
  initialPayload: SearchPayload;
  initialState: DirectoryState;
  initialTreatmentLabel?: string;
  initialTreatmentCategory?: string;
  searchHeading?: {
    treatmentLabel: string;
    treatmentHref?: string;
    cityLabel?: string;
  };
  treatmentExternalData?: TreatmentExternalDataRecord | null;
  treatmentFdaRegulatoryStatus?: TreatmentFdaRegulatoryStatus | null;
}) {
  const [state, setState] = useState<DirectoryState>(seededState);
  const [payload, setPayload] = useState<SearchPayload>(initialPayload);
  const [loading, setLoading] = useState(false);
  const [visitorLocation, setVisitorLocation] = useState<VisitorLocation | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<number | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const searchRequestRef = useRef<AbortController | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("kind", state.kind);
    for (const key of ["q", "country", "locality", "entity_type", "care_model"] as const) {
      if (state[key]) {
        params.set(key, state[key]);
      }
    }
    for (const key of ["city_label", "city_country", "place_type"] as const) {
      if (state[key]) {
        params.set(key, state[key]);
      }
    }
    if (typeof state.city_lat === "number" && Number.isFinite(state.city_lat)) {
      params.set("city_lat", String(state.city_lat));
    }
    if (typeof state.city_lng === "number" && Number.isFinite(state.city_lng)) {
      params.set("city_lng", String(state.city_lng));
    }
    if (state.treatment_ids.length) {
      params.set("treatment_id", state.treatment_ids.join(","));
    }
    if (state.page) {
      params.set("page", String(state.page));
    }
    if (state.kind === "locations" && mapBounds) {
      params.set("map_north", String(mapBounds.north));
      params.set("map_south", String(mapBounds.south));
      params.set("map_east", String(mapBounds.east));
      params.set("map_west", String(mapBounds.west));
    }
    if (usesPersonalizedDefaultSort(state) && visitorLocation?.country) {
      appendVisitorLocationParams(params, visitorLocation);
    }
    return params.toString();
  }, [state, visitorLocation, mapBounds]);
  const loadedQueryStringRef = useRef(queryString);
  const mapFocusLocation = useMemo(() => {
    if (
      !usesPersonalizedDefaultSort(state)
      || typeof visitorLocation?.latitude !== "number"
      || !Number.isFinite(visitorLocation.latitude)
      || typeof visitorLocation.longitude !== "number"
      || !Number.isFinite(visitorLocation.longitude)
    ) {
      return undefined;
    }
    return { latitude: visitorLocation.latitude, longitude: visitorLocation.longitude };
  }, [state, visitorLocation]);
  const priceSummaries = payload.treatment_price_summaries;
  const payloadTreatmentMatchesState = Boolean(
    payload.resolved_treatment
      && (!state.treatment_ids.length || state.treatment_ids.includes(String(payload.resolved_treatment.id))),
  );
  const initialTreatmentMatchesState = state.treatment_ids.length > 0
    && state.treatment_ids.join(",") === seededState.treatment_ids.join(",");
  const activeTreatmentLabel = (payloadTreatmentMatchesState ? payload.resolved_treatment?.name : undefined)
    || (initialTreatmentMatchesState ? initialTreatmentLabel : undefined);
  const activeTreatmentCategory = (payloadTreatmentMatchesState ? payload.resolved_treatment?.category : undefined)
    || (initialTreatmentMatchesState ? initialTreatmentCategory : undefined);
  const showInitialTreatmentMetadata = initialTreatmentMatchesState
    && activeTreatmentLabel === initialTreatmentLabel;
  const treatmentResultsHeading = searchHeading
    ? treatmentLocationResultsHeading({
        total: payload.total,
        treatmentLabel: searchHeading.treatmentLabel,
        cityLabel: searchHeading.cityLabel,
        priceSummaries,
      })
    : null;
  const queryResultsHeading = !searchHeading && (state.q.trim() || activeTreatmentLabel)
    ? directorySearchResultsHeading({
        total: payload.total,
        query: state.q.trim() || activeTreatmentLabel!,
        priceSummaries,
      })
    : null;

  useEffect(() => {
    if (queryString === loadedQueryStringRef.current) {
      return;
    }
    searchRequestRef.current?.abort();
    const controller = new AbortController();
    searchRequestRef.current = controller;
    setLoading(true);
    fetch(`/api/search?${queryString}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Search failed with ${response.status}`);
        }
        return response.json();
      })
      .then((data: SearchPayload) => {
        loadedQueryStringRef.current = queryString;
        setPayload(data);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setPayload({ results: [], total: 0, page: 0, page_size: 18 });
        }
      })
      .finally(() => {
        if (searchRequestRef.current === controller) setLoading(false);
      });
    return () => controller.abort();
  }, [queryString]);

  useEffect(() => {
    const restoreDirectoryState = () => {
      if (!isDirectoryPath(window.location.pathname)) return;
      setLoading(true);
      setMapBounds(null);
      setPayload((current) => ({
        ...current,
        resolved_treatment: undefined,
        treatment_price_summaries: undefined,
      }));
      setState(directoryStateFromUrlSearchParams(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", restoreDirectoryState);
    return () => window.removeEventListener("popstate", restoreDirectoryState);
  }, []);

  const searchMapBounds = useCallback((bounds: MapBounds) => {
    if (state.kind !== "locations") return;
    setLoading(true);
    setMapBounds(bounds);
    setState((current) => ({ ...current, page: 0 }));
  }, [state.kind]);

  useEffect(() => {
    const cached = readCachedVisitorLocation();
    if (cached) {
      const timeout = window.setTimeout(() => setVisitorLocation(cached.location), 0);
      return () => window.clearTimeout(timeout);
    }

    const controller = new AbortController();
    fetch("/api/geo", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          return { location: null };
        }
        return response.json() as Promise<{ location: VisitorLocation | null }>;
      })
      .then((data) => {
        const location = validVisitorLocation(data.location) ? data.location : null;
        writeCachedVisitorLocation(location);
        setVisitorLocation(location);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          writeCachedVisitorLocation(null);
          setVisitorLocation(null);
        }
      });

    return () => controller.abort();
  }, []);

  const changePage = useCallback((page: number) => {
    const resultsTop = resultsRef.current?.getBoundingClientRect().top;
    if (typeof resultsTop === "number") {
      window.scrollTo({ top: Math.max(0, window.scrollY + resultsTop - 90), behavior: "smooth" });
    }
    const nextState = { ...state, page };
    const href = directoryHrefFromState(nextState);
    if (!isDirectoryPath(window.location.pathname)) {
      window.location.assign(href);
      return;
    }
    setLoading(true);
    window.history.pushState(null, "", href);
    setState(nextState);
  }, [state]);

  const submitSearch = useCallback((payload: { what: string; treatment_id?: string; city_label: string; city_country: string; place_type?: string; city_lat?: number; city_lng?: number }) => {
    const isCountry = payload.place_type === "country" && payload.city_country;
    const nextState = {
      ...emptyState(),
      kind: state.kind,
      q: payload.treatment_id ? "" : payload.what,
      country: isCountry ? payload.city_country : "",
      locality: "",
      city_label: payload.city_label,
      city_country: payload.city_country,
      place_type: isCountry ? "country" : "",
      city_lat: isCountry ? undefined : payload.city_lat,
      city_lng: isCountry ? undefined : payload.city_lng,
      treatment_ids: payload.treatment_id ? [payload.treatment_id] : [],
    };
    const href = directoryHrefFromState(nextState);
    if (!isDirectoryPath(window.location.pathname)) {
      window.location.assign(href);
      return;
    }
    setLoading(true);
    setMapBounds(null);
    setPayload((current) => ({
      ...current,
      resolved_treatment: undefined,
      treatment_price_summaries: undefined,
    }));
    window.history.pushState(null, "", href);
    setState(nextState);
  }, [state.kind]);

  return (
    <main className="directory-shell">
      <LandingScrollHeader
        key={directorySearchControlKey(state, activeTreatmentLabel, activeTreatmentCategory)}
        alwaysVisible
        initialWhat={state.q || activeTreatmentLabel}
        initialTreatmentId={state.treatment_ids.length === 1 ? state.treatment_ids[0] : undefined}
        initialWhere={state.city_label || state.locality}
        initialCityCountry={state.city_country}
        initialPlaceType={state.place_type}
        initialCityLat={state.city_lat}
        initialCityLng={state.city_lng}
        kind={state.kind}
        onSubmit={submitSearch}
      />

      <div className="directory-layout">
        <section ref={resultsRef} className="directory-results" aria-live="polite">
          <DirectorySearchBanner payload={payload} />

          <div className="resultbar">
            {searchHeading ? (
              <h1>
                {treatmentResultsHeading
                  || `${searchHeading.treatmentLabel} · ${payload.total.toLocaleString()} results`}
              </h1>
            ) : (
              <h1>
                {loading
                  ? "Searching..."
                  : queryResultsHeading
                    || `${payload.total.toLocaleString()} result${payload.total === 1 ? "" : "s"}`}
              </h1>
            )}
            {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : null}
          </div>

          {showInitialTreatmentMetadata && ((activeTreatmentLabel && treatmentFdaRegulatoryStatus) || treatmentExternalData) ? (
            <div className="treatment-meta-row">
              {activeTreatmentLabel && treatmentFdaRegulatoryStatus ? (
                <TreatmentRegulatoryStatus
                  status={treatmentFdaRegulatoryStatus}
                  treatmentName={activeTreatmentLabel}
                />
              ) : null}

              {treatmentExternalData ? (
                <TreatmentExternalData data={treatmentExternalData} />
              ) : null}
            </div>
          ) : null}

          <div className="result-list">
            {!loading && !payload.results.length ? (
              <div className="empty-state">No matches. Clear a filter or broaden the search.</div>
            ) : null}
            {state.kind === "locations"
              ? payload.results.map((result, index) => (
                  <LocationResult
                    key={result.id}
                    result={result as LocationResultRow}
                    showDistance={shouldShowDistance(payload)}
                    clinicCategory={activeTreatmentCategory}
                    treatmentName={activeTreatmentLabel}
                    resultPosition={(payload.page || 0) * payload.page_size + index + 1}
                    onActiveChange={setActiveLocationId}
                  />
                ))
              : payload.results.map((result) => (
                  <PractitionerResult
                    key={result.id}
                    result={result as PractitionerResultRow}
                  />
                ))}
          </div>

          <Pager
            payload={payload}
            loading={loading}
            onPrevious={() => changePage(Math.max(0, state.page - 1))}
            onNext={() => changePage(state.page + 1)}
          />
        </section>
        {state.kind === "locations" ? (
          <aside className="directory-map-panel" aria-label="Directory result map">
            <DirectoryMap
              locations={payload.results as LocationResultRow[]}
              activeLocationId={activeLocationId}
              focusLocation={mapFocusLocation}
              clinicCategory={activeTreatmentCategory}
              treatmentName={activeTreatmentLabel}
              onBoundsChange={searchMapBounds}
            />
          </aside>
        ) : null}
      </div>

      <LandingFooter />
    </main>
  );
}

function emptyState(): DirectoryState {
  return {
    kind: "locations",
    q: "",
    country: "",
    locality: "",
    city_label: "",
    city_country: "",
    place_type: "",
    city_lat: undefined,
    city_lng: undefined,
    treatment_ids: [],
    entity_type: "",
    care_model: "",
    page: 0,
  };
}

function directoryStateFromUrlSearchParams(params: URLSearchParams): DirectoryState {
  const kind = params.get("kind") === "practitioners" ? "practitioners" : "locations";
  const treatmentIds = (params.get("treatment_id") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 25);
  const page = Number.parseInt(params.get("page") || "0", 10);
  return {
    kind,
    q: params.get("q") || "",
    country: params.get("country") || "",
    locality: params.get("locality") || "",
    city_label: params.get("city_label") || "",
    city_country: params.get("city_country") || "",
    place_type: params.get("place_type") || "",
    city_lat: finiteSearchNumber(params.get("city_lat")),
    city_lng: finiteSearchNumber(params.get("city_lng")),
    treatment_ids: treatmentIds,
    entity_type: params.get("entity_type") || "",
    care_model: params.get("care_model") || "",
    page: Number.isFinite(page) && page > 0 ? page : 0,
  };
}

function directoryHrefFromState(state: DirectoryState) {
  const params = new URLSearchParams();
  params.set("kind", state.kind);
  for (const key of ["q", "country", "locality", "city_label", "city_country", "place_type", "entity_type", "care_model"] as const) {
    if (state[key]) params.set(key, state[key]);
  }
  if (typeof state.city_lat === "number" && Number.isFinite(state.city_lat)) {
    params.set("city_lat", String(state.city_lat));
  }
  if (typeof state.city_lng === "number" && Number.isFinite(state.city_lng)) {
    params.set("city_lng", String(state.city_lng));
  }
  if (state.treatment_ids.length) params.set("treatment_id", state.treatment_ids.join(","));
  if (state.page) params.set("page", String(state.page));
  return `/directory?${params.toString()}`;
}

function isDirectoryPath(pathname: string) {
  return pathname === "/directory" || pathname === "/directory/";
}

function directorySearchControlKey(
  state: DirectoryState,
  treatmentLabel?: string,
  treatmentCategory?: string,
) {
  return JSON.stringify([
    state.kind,
    state.q,
    state.city_label,
    state.city_country,
    state.place_type,
    state.city_lat,
    state.city_lng,
    state.treatment_ids.join(","),
    treatmentLabel,
    treatmentCategory,
  ]);
}

function finiteSearchNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function usesPersonalizedDefaultSort(state: DirectoryState) {
  return state.kind === "locations"
    && !state.q
    && !state.country
    && !state.locality
    && !state.city_lat
    && !state.city_lng
    && !state.treatment_ids.length
    && !state.entity_type
    && !state.care_model;
}

function appendVisitorLocationParams(params: URLSearchParams, location: VisitorLocation) {
  appendParam(params, "geo_country", location.country);
  appendParam(params, "geo_region", location.region);
  appendParam(params, "geo_city", location.city);
  appendNumberParam(params, "geo_lat", location.latitude);
  appendNumberParam(params, "geo_lng", location.longitude);
}

function appendParam(params: URLSearchParams, key: string, value?: string) {
  if (value) {
    params.set(key, value);
  }
}

function appendNumberParam(params: URLSearchParams, key: string, value?: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    params.set(key, String(value));
  }
}

function readCachedVisitorLocation() {
  try {
    const raw = window.sessionStorage.getItem(visitorLocationCacheKey);
    if (!raw) {
      return null;
    }
    const cached = JSON.parse(raw) as CachedVisitorLocation;
    return typeof cached.cachedAt === "number" ? cached : null;
  } catch {
    return null;
  }
}

function writeCachedVisitorLocation(location: VisitorLocation | null) {
  try {
    window.sessionStorage.setItem(
      visitorLocationCacheKey,
      JSON.stringify({ location, cachedAt: Date.now() } satisfies CachedVisitorLocation),
    );
  } catch {
    // Session storage can be unavailable in private browsing; personalization is optional.
  }
}

function validVisitorLocation(location: VisitorLocation | null | undefined): location is VisitorLocation {
  return Boolean(location?.country && /^[A-Z][A-Z]$/.test(location.country));
}

function shouldShowDistance(payload: SearchPayload) {
  return Boolean(payload.mode && !(payload.mode === "exact_radius" && payload.effective_radius === 25));
}

function LocationResult({
  result,
  showDistance,
  clinicCategory,
  treatmentName,
  resultPosition,
  onActiveChange,
}: {
  result: LocationResultRow;
  showDistance: boolean;
  clinicCategory?: string;
  treatmentName?: string;
  resultPosition: number;
  onActiveChange: (id: number | null) => void;
}) {
  return (
    <DirectoryLocationCard
      result={showDistance ? result : { ...result, distance_miles: null }}
      clinicCategory={clinicCategory}
      treatmentName={treatmentName}
      resultPosition={resultPosition}
      onActiveChange={onActiveChange}
    />
  );
}

function DirectorySearchBanner({ payload }: { payload: SearchPayload }) {
  const mode = payload.mode;
  if (
    !mode
    || mode === "country_search"
    || mode === "country_fallback"
    || mode === "map_bounds"
    || (mode === "exact_radius" && payload.effective_radius === 25)
  ) {
    return null;
  }

  let message = "";
  if (mode === "expanded_radius") {
    const city = payload.searched_city || "that city";
    message = payload.city_total ? "" : `No clinics in ${city} yet. Showing options nearby.`;
  } else if (mode === "cross_border") {
    message = `No clinics in ${payload.searched_country || "that country"} yet. Showing options nearby.`;
  } else if (mode === "empty") {
    message = `No clinics near ${payload.searched_city || "that city"} yet.`;
  }

  return message ? <div className="directory-search-banner">{message}</div> : null;
}

function PractitionerResult({ result }: { result: PractitionerResultRow }) {
  const [imageFailed, setImageFailed] = useState(false);
  const affiliation = result.affiliations?.[0];
  const place = affiliation
    ? [affiliation.clinic, formatLocationPlace({
      locality: affiliation.locality,
      countryCode: affiliation.country_code,
      countryName: affiliation.country_name,
    })].filter(Boolean).join(", ")
    : "";
  const initials = (result.full_name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <Link className="result-card practitioner-card" href={practitionerHref(result)}>
      <span className="practitioner-avatar-band">
        <span className="practitioner-avatar">
          {result.image && !imageFailed ? (
            <Image src={imageSource(result.image)} alt="" fill unoptimized sizes="96px" onError={() => setImageFailed(true)} />
          ) : (
            <span className="practitioner-avatar-fallback" aria-hidden="true">
              {initials || <Stethoscope size={22} aria-hidden="true" />}
            </span>
          )}
        </span>
      </span>
      <span className="result-body">
        <span className="result-main practitioner-main">
          <b>{result.full_name || "Unnamed practitioner"}</b>
          <small>{result.primary_specialty || "Specialty unavailable"}</small>
        </span>
        <span className="result-side practitioner-side">
          {result.years_experience ? <em>{result.years_experience} yrs experience</em> : null}
          {place ? (
            <small>
              <MapPin size={14} aria-hidden="true" />
              {place}
            </small>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function imageSource(src: string) {
  return src;
}

function Pager({
  payload,
  loading,
  onPrevious,
  onNext,
}: {
  payload: SearchPayload;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const pages = Math.max(1, Math.ceil(payload.total / payload.page_size));
  if (payload.total <= payload.page_size) {
    return null;
  }
  return (
    <div className="pager">
      <button type="button" disabled={loading || payload.page <= 0} onClick={onPrevious}>
        <ArrowLeft size={16} aria-hidden="true" />
        Previous
      </button>
      <span>
        Page {payload.page + 1} of {pages}
      </span>
      <button type="button" disabled={loading || payload.page + 1 >= pages} onClick={onNext}>
        Next
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
