"use client";

import { LandingFooter } from "@/components/landing-footer";
import { LandingScrollHeader } from "@/components/landing-scroll-header";
import { DirectoryLocationCard, type DirectoryLocationCardData } from "@/components/directory-location-card";
import { DirectoryMap } from "@/components/directory-map";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Stethoscope } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { practitionerHref } from "@/lib/directory-urls";
import { SplitDirectorySearch } from "@/components/split-directory-search";
import { formatLocationPlace } from "@/lib/location-display";

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
};

type SearchMode = "exact_radius" | "expanded_radius" | "country_fallback" | "country_search" | "cross_border" | "empty";

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
}: {
  initialPayload: SearchPayload;
  initialState: DirectoryState;
}) {
  const router = useRouter();
  const [state, setState] = useState<DirectoryState>(seededState);
  const [payload, setPayload] = useState<SearchPayload>(initialPayload);
  const [loading, setLoading] = useState(false);
  const [visitorLocation, setVisitorLocation] = useState<VisitorLocation | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<number | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

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
    if (usesPersonalizedDefaultSort(state) && visitorLocation?.country) {
      appendVisitorLocationParams(params, visitorLocation);
    }
    return params.toString();
  }, [state, visitorLocation]);
  const initialQueryString = useRef(queryString);

  useEffect(() => {
    if (queryString === initialQueryString.current) {
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/search?${queryString}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Search failed with ${response.status}`);
        }
        return response.json();
      })
      .then((data: SearchPayload) => setPayload(data))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setPayload({ results: [], total: 0, page: 0, page_size: 18 });
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [queryString]);

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

  const updateState = useCallback((patch: Partial<DirectoryState>) => {
    setLoading(true);
    setState((current) => ({ ...current, ...patch, page: patch.page ?? 0 }));
  }, []);

  const changePage = useCallback((page: number) => {
    const resultsTop = resultsRef.current?.getBoundingClientRect().top;
    if (typeof resultsTop === "number") {
      window.scrollTo({ top: Math.max(0, window.scrollY + resultsTop - 90), behavior: "smooth" });
    }
    updateState({ page });
  }, [updateState]);

  const submitSearch = useCallback((payload: { what: string; city_label: string; city_country: string; place_type?: string; city_lat?: number; city_lng?: number }) => {
    const isCountry = payload.place_type === "country" && payload.city_country;
    const nextState = {
      ...emptyState(),
      kind: state.kind,
      q: payload.what,
      country: isCountry ? payload.city_country : "",
      locality: "",
      city_label: payload.city_label,
      city_country: payload.city_country,
      place_type: isCountry ? "country" : "",
      city_lat: isCountry ? undefined : payload.city_lat,
      city_lng: isCountry ? undefined : payload.city_lng,
    };
    const params = new URLSearchParams();
    params.set("kind", nextState.kind);
    if (nextState.q) {
      params.set("q", nextState.q);
    }
    if (isCountry) {
      params.set("country", nextState.country);
      params.set("city_label", nextState.city_label);
      params.set("city_country", nextState.city_country);
      params.set("place_type", "country");
    } else if (nextState.city_lat != null && nextState.city_lng != null) {
      params.set("city_label", nextState.city_label);
      params.set("city_country", nextState.city_country);
      params.set("city_lat", String(nextState.city_lat));
      params.set("city_lng", String(nextState.city_lng));
    }

    setLoading(true);
    setState(nextState);
    router.push(`/directory?${params.toString()}`);
  }, [router, state.kind]);

  return (
    <main className="directory-shell">
      <LandingScrollHeader />
      <section className="directory-hero" aria-label="Directory search">
        <header className="directory-topbar">
          <Link className="landing-brand directory-brand" href="/">
            fountain
          </Link>
          <button className="coming-soon-pill" type="button">
            Coming Soon <span aria-hidden="true">|</span> Join
          </button>
        </header>

        <div className="directory-search-row">
          <SplitDirectorySearch
            key={`${state.kind}:${state.q}:${state.country}:${state.locality}:${state.city_label}:${state.city_country}:${state.place_type}:${state.city_lat}:${state.city_lng}`}
            className="directory-search"
            initialWhat={state.q}
            initialWhere={state.city_label || state.locality}
            initialCityCountry={state.city_country}
            initialPlaceType={state.place_type}
            initialCityLat={state.city_lat}
            initialCityLng={state.city_lng}
            kind={state.kind}
            onSubmit={submitSearch}
          />
        </div>

      </section>

      <div className="directory-layout">
        <section ref={resultsRef} className="directory-results" aria-live="polite">
          <DirectorySearchBanner payload={payload} />

          <div className="resultbar">
            <span>
              {loading ? "Searching..." : `${payload.total.toLocaleString()} Result${payload.total === 1 ? "" : "s"}`}
            </span>
            {loading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : null}
          </div>

          <div className="result-list">
            {!loading && !payload.results.length ? (
              <div className="empty-state">No matches. Clear a filter or broaden the search.</div>
            ) : null}
            {state.kind === "locations"
              ? payload.results.map((result) => (
                  <LocationResult
                    key={result.id}
                    result={result as LocationResultRow}
                    showDistance={shouldShowDistance(payload)}
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
            <DirectoryMap locations={payload.results as LocationResultRow[]} activeLocationId={activeLocationId} />
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
  onActiveChange,
}: {
  result: LocationResultRow;
  showDistance: boolean;
  onActiveChange: (id: number | null) => void;
}) {
  return <DirectoryLocationCard result={showDistance ? result : { ...result, distance_miles: null }} onActiveChange={onActiveChange} />;
}

function DirectorySearchBanner({ payload }: { payload: SearchPayload }) {
  const mode = payload.mode;
  if (!mode || (mode === "exact_radius" && payload.effective_radius === 25)) {
    return null;
  }

  let message = "";
  if (mode === "expanded_radius") {
    message = `No clinics in ${payload.searched_city || "that city"} yet. Showing options nearby.`;
  } else if (mode === "country_fallback") {
    message = `Showing all clinics in ${payload.searched_country || "this country"}.`;
  } else if (mode === "country_search") {
    message = `All clinics in ${payload.searched_country || "this country"}.`;
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
    <Link className="result-card practitioner-card" href={`${practitionerHref(result)}?from=search`}>
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
