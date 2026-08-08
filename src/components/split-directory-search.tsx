"use client";

import Image from "next/image";
import { MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type SuggestedCity = {
  id: string;
  source: "inventory" | "google";
  place_type?: "locality" | "country";
  label: string;
  city: string;
  region?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  lat?: number | null;
  lng?: number | null;
  has_inventory: boolean;
  place_id?: string;
};

type SplitSearchSubmit = {
  what: string;
  treatment_id?: string;
  where: string;
  country: string;
  city_label: string;
  city_country: string;
  place_type?: string;
  city_lat?: number;
  city_lng?: number;
};

type SplitDirectorySearchProps = {
  className?: string;
  initialWhat?: string;
  initialTreatmentId?: string;
  initialWhere?: string;
  initialCityCountry?: string;
  initialPlaceType?: string;
  initialCityLat?: number;
  initialCityLng?: number;
  kind?: "locations" | "practitioners";
  compact?: boolean;
  expandOnFocus?: boolean;
  onExpandedChange?: (isExpanded: boolean) => void;
  onSubmit?: (payload: SplitSearchSubmit) => void;
};

type TreatmentCategory = "Measure" | "Optimize" | "Recover" | "Regenerate" | "Rejuvenate";
type TreatmentSuggestion = {
  id: number;
  label: string;
  category: TreatmentCategory;
  locationCount: number;
};

const categoryIconPaths: Record<TreatmentCategory, string> = {
  Measure: "/category%20icons/Measure.png",
  Optimize: "/category%20icons/Optimize.png",
  Recover: "/category%20icons/Recover.png",
  Regenerate: "/category%20icons/Regenerate.png",
  Rejuvenate: "/category%20icons/Rejuvenate.png?v=rotated-90",
};

export function SplitDirectorySearch({
  className = "",
  initialWhat = "",
  initialTreatmentId,
  initialWhere = "",
  initialCityCountry = "",
  initialPlaceType = "",
  initialCityLat,
  initialCityLng,
  kind,
  compact = false,
  expandOnFocus = compact,
  onExpandedChange,
  onSubmit,
}: SplitDirectorySearchProps) {
  const [what, setWhat] = useState(initialWhat);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState(initialTreatmentId || "");
  const [treatmentSuggestions, setTreatmentSuggestions] = useState<TreatmentSuggestion[]>([]);
  const [where, setWhere] = useState(initialWhere);
  const [activeField, setActiveField] = useState<"what" | "where" | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<SuggestedCity[]>([]);
  const [cityError, setCityError] = useState("");
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);
  const [selectedCity, setSelectedCity] = useState<SuggestedCity | null>(() =>
    initialWhere && (initialPlaceType === "country" || (initialCityLat != null && initialCityLng != null))
      ? {
          id: `initial:${initialCityCountry}:${initialWhere}`,
          source: "inventory",
          place_type: initialPlaceType === "country" ? "country" : "locality",
          label: initialWhere,
          city: initialWhere,
          country_code: initialCityCountry || null,
          lat: initialCityLat,
          lng: initialCityLng,
          has_inventory: true,
        }
      : null,
  );
  const [citySessionToken, setCitySessionToken] = useState<string | null>(null);
  const shellRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    onExpandedChange?.(expandOnFocus && activeField !== null);
  }, [activeField, expandOnFocus, onExpandedChange]);

  useEffect(() => {
    if (!activeField) {
      return;
    }

    function collapseOnScroll() {
      setActiveField(null);
    }

    window.addEventListener("scroll", collapseOnScroll, { passive: true });
    return () => window.removeEventListener("scroll", collapseOnScroll);
  }, [activeField]);

  useEffect(() => {
    if (activeField !== "what") {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ q: what.trim() });
      fetch(`/api/treatments/suggest?${params.toString()}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { suggestions: [] })
        .then((data: { suggestions?: unknown[] }) => {
          const suggestions = (data.suggestions || []).filter(isTreatmentSuggestion);
          setTreatmentSuggestions(suggestions);
        })
        .catch((error) => {
          if (error.name !== "AbortError") {
            setTreatmentSuggestions([]);
          }
        });
    }, 150);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeField, what]);

  useEffect(() => {
    if (activeField !== "where") {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set("q", where.trim());
      if (citySessionToken) {
        params.set("session_token", citySessionToken);
      }
      fetch(`/api/cities/suggest?${params.toString()}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { suggestions: [] })
        .then((data: { suggestions?: SuggestedCity[] }) => setCitySuggestions(data.suggestions || []))
        .catch((error) => {
          if (error.name !== "AbortError") {
            setCitySuggestions([]);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeField, citySessionToken, where]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isResolvingPlace) {
      return;
    }

    const whereDraft = where.trim();
    setCityError("");
    setIsResolvingPlace(true);
    let city = selectedCity;
    if (!city && whereDraft) {
      city = await cityFromTypedQuery(whereDraft, citySessionToken);
    }
    city = await resolvedSelectedCity(city, citySessionToken);
    if (whereDraft && !isUsableCity(city)) {
      setCityError("Choose a suggested city or country.");
      setActiveField("where");
      setIsResolvingPlace(false);
      return;
    }
    const payload = payloadFromDrafts(what, selectedTreatmentId, where, city);
    setActiveField(null);
    setCitySessionToken(null);
    setIsResolvingPlace(false);
    trackSearch(payload, kind);

    if (onSubmit) {
      onSubmit(payload);
      return;
    }

    const params = new URLSearchParams();
    if (kind) {
      params.set("kind", kind);
    }
    if (payload.treatment_id) {
      params.set("treatment_id", payload.treatment_id);
    } else if (payload.what) {
      params.set("q", payload.what);
    }
    if (payload.place_type === "country" && payload.city_country) {
      params.set("country", payload.city_country);
      params.set("city_label", payload.city_label);
      params.set("city_country", payload.city_country);
      params.set("place_type", "country");
    } else if (payload.city_lat != null && payload.city_lng != null) {
      params.set("city_label", payload.city_label);
      params.set("city_country", payload.city_country);
      params.set("city_lat", String(payload.city_lat));
      params.set("city_lng", String(payload.city_lng));
    }
    const query = params.toString();
    window.location.assign(query ? `/directory?${query}` : "/directory");
  }

  function handleBlur(event: React.FocusEvent<HTMLFormElement>) {
    if (!shellRef.current?.contains(event.relatedTarget as Node | null)) {
      setActiveField(null);
    }
  }

  function collapseExpandedSearch() {
    shellRef.current?.querySelector<HTMLElement>("input:focus")?.blur();
    setActiveField(null);
  }

  function selectTreatment(treatment: TreatmentSuggestion) {
    setWhat(treatment.label);
    setSelectedTreatmentId(String(treatment.id));
    setActiveField(null);
  }

  function selectCity(city: SuggestedCity) {
    setWhere(city.place_type === "country" ? city.label : city.city || city.label);
    setSelectedCity(city);
    setCityError("");
    if (city.source === "inventory") {
      setCitySessionToken(null);
    }
    setActiveField(null);
  }

  function focusWhere() {
    setActiveField("where");
    setCitySessionToken((current) => current || createSessionToken());
  }

  const whatIsActive = activeField === "what";
  const whereIsActive = activeField === "where";
  const isExpanded = compact && expandOnFocus && activeField !== null;
  const isCompact = compact && !isExpanded;
  const hasServedQuery = Boolean(initialWhat.trim() || initialWhere.trim());

  return (
    <>
      {isExpanded ? createPortal(
        <button
          className="split-search-scrim"
          type="button"
          tabIndex={-1}
          aria-label="Close expanded search"
          onPointerDown={(event) => {
            event.preventDefault();
            collapseExpandedSearch();
          }}
        />,
        document.body,
      ) : null}
      <form
        ref={shellRef}
        className={[
          "split-search",
          isCompact ? "split-search-compact" : "",
          compact && expandOnFocus ? "split-search-expandable" : "",
          isExpanded ? "is-expanded" : "",
          hasServedQuery ? "has-served-query" : "",
          whatIsActive ? "is-what-active" : "",
          whereIsActive ? "is-where-active" : "",
          className,
        ].filter(Boolean).join(" ")}
        role="search"
        onSubmit={submit}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "Escape" && activeField) {
            setActiveField(null);
            shellRef.current?.querySelector<HTMLElement>("input:focus")?.blur();
          }
        }}
      >
      <div className="split-search-fields">
        <label className="split-search-segment split-search-what">
          <span>What</span>
          <input
            value={what}
            onChange={(event) => {
              setWhat(event.target.value);
              setSelectedTreatmentId("");
            }}
            onFocus={() => setActiveField("what")}
            type="search"
            aria-label="Search treatments"
            placeholder="Treatments or clinics"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {what ? (
            <button
              className="split-search-clear"
              type="button"
              aria-label="Clear treatment"
              onClick={() => {
                setWhat("");
                setSelectedTreatmentId("");
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <span className="split-search-divider" aria-hidden="true" />

        <div className="split-search-tail">
          <label className="split-search-segment split-search-where">
            <span>Where</span>
            <input
              value={where}
              onChange={(event) => {
                setWhere(event.target.value);
                setSelectedCity(null);
                setCityError("");
              }}
              onFocus={focusWhere}
              type="search"
              aria-label="Search places"
              placeholder="City or country"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {where ? (
              <button
                className="split-search-clear"
                type="button"
                aria-label="Clear place"
                onClick={() => {
                  setWhere("");
                  setSelectedCity(null);
                  setCityError("");
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </label>

          <button className="split-search-submit" type="submit" aria-label="Search" disabled={isResolvingPlace}>
            <Search size={isCompact ? 16 : 18} aria-hidden="true" />
            <span>Search</span>
          </button>
        </div>
      </div>

      {whatIsActive ? (
        <div className="split-search-menu split-search-menu-what">
          <p>Suggested treatments</p>
          <div
            className="split-search-suggestions split-search-treatment-suggestions"
            role="listbox"
            aria-label="Suggested treatments"
          >
            {treatmentSuggestions.map((treatment) => (
              <button
                type="button"
                role="option"
                aria-selected={what.toLowerCase() === treatment.label.toLowerCase()}
                key={treatment.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectTreatment(treatment)}
              >
                <span className="split-search-suggestion-icon split-search-treatment-icon">
                  <Image
                    src={categoryIconPaths[treatment.category]}
                    alt=""
                    width={27}
                    height={27}
                    unoptimized
                    aria-hidden="true"
                  />
                </span>
                <span className="split-search-treatment-text">
                  <strong>{treatment.label}</strong>
                  <small>
                    {treatment.locationCount.toLocaleString()} {treatment.locationCount === 1 ? "location" : "locations"}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {whereIsActive ? (
        <div className="split-search-menu split-search-menu-where">
          <p>{cityError || (isResolvingPlace ? "Finding that place…" : "Suggested Places")}</p>
          <div
            className="split-search-suggestions split-search-place-suggestions"
            role="listbox"
            aria-label="Suggested places"
          >
            {citySuggestions.map((city) => (
              <button
                type="button"
                role="option"
                aria-selected={selectedCity?.id === city.id}
                key={city.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCity(city)}
              >
                <span className="split-search-suggestion-icon split-search-place-icon">
                  <MapPin size={27} aria-hidden="true" />
                </span>
                <span>{highlightPrefix(city.label, where)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      </form>
    </>
  );
}

function trackSearch(
  payload: SplitSearchSubmit,
  kind?: "locations" | "practitioners",
) {
  window.gtag?.("event", "search", {
    search_term: payload.what || "all treatments",
    search_location: payload.where || "any location",
    search_kind: kind || "locations",
    source_page: `${window.location.pathname}${window.location.search}`,
    transport_type: "beacon",
  });
}

async function cityFromTypedQuery(query: string, sessionToken: string | null) {
  const params = new URLSearchParams({ q: query });
  if (sessionToken) {
    params.set("session_token", sessionToken);
  }
  try {
    const response = await fetch(`/api/cities/suggest?${params.toString()}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json() as { suggestions?: SuggestedCity[] };
    const suggestions = data.suggestions || [];
    const normalizedQuery = normalizePlace(query);
    return suggestions.find((suggestion) =>
      normalizePlace(suggestion.city) === normalizedQuery
      || normalizePlace(suggestion.label) === normalizedQuery
    ) || suggestions[0] || null;
  } catch {
    return null;
  }
}

function isUsableCity(city: SuggestedCity | null) {
  return Boolean(
    city
    && (
      (city.place_type === "country" && city.country_code)
      || (finiteNumber(city.lat) !== undefined && finiteNumber(city.lng) !== undefined)
    ),
  );
}

function normalizePlace(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function isTreatmentSuggestion(value: unknown): value is TreatmentSuggestion {
  if (!value || typeof value !== "object") {
    return false;
  }
  const suggestion = value as Partial<TreatmentSuggestion>;
  return typeof suggestion.label === "string"
    && typeof suggestion.id === "number"
    && Number.isInteger(suggestion.id)
    && typeof suggestion.locationCount === "number"
    && Number.isInteger(suggestion.locationCount)
    && suggestion.locationCount >= 0
    && isTreatmentCategory(suggestion.category);
}

function isTreatmentCategory(value: unknown): value is TreatmentCategory {
  return value === "Measure"
    || value === "Optimize"
    || value === "Recover"
    || value === "Regenerate"
    || value === "Rejuvenate";
}

async function resolvedSelectedCity(city: SuggestedCity | null, sessionToken: string | null) {
  if (!city?.place_id || (city.lat != null && city.lng != null)) {
    return city;
  }
  const params = new URLSearchParams({ place_id: city.place_id });
  if (sessionToken) {
    params.set("session_token", sessionToken);
  }
  try {
    const response = await fetch(`/api/cities/resolve?${params.toString()}`);
    if (!response.ok) {
      return city;
    }
    const data = await response.json() as { city?: SuggestedCity | null };
    return data.city || city;
  } catch {
    return city;
  }
}

function payloadFromDrafts(
  whatDraft: string,
  treatmentId: string,
  whereDraft: string,
  city: SuggestedCity | null,
): SplitSearchSubmit {
  const what = whatDraft.trim();
  const where = whereDraft.trim();

  return {
    what,
    treatment_id: treatmentId || undefined,
    where,
    country: city?.country_code || "",
    city_label: city?.label || where,
    city_country: city?.country_code || "",
    place_type: city?.place_type,
    city_lat: finiteNumber(city?.lat),
    city_lng: finiteNumber(city?.lng),
  };
}

function highlightPrefix(label: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed || !label.toLowerCase().startsWith(trimmed.toLowerCase())) {
    return label;
  }
  return (
    <>
      <b className="split-search-match">{label.slice(0, trimmed.length)}</b>
      {label.slice(trimmed.length)}
    </>
  );
}

function createSessionToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
