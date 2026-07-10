"use client";

import { MapPin, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  initialWhere?: string;
  initialCityCountry?: string;
  initialPlaceType?: string;
  initialCityLat?: number;
  initialCityLng?: number;
  kind?: "locations" | "practitioners";
  compact?: boolean;
  onSubmit?: (payload: SplitSearchSubmit) => void;
};

const treatmentSuggestions = ["HBOT", "DEXA", "VO2Max", "IV Therapy", "Full-body MRI"];

export function SplitDirectorySearch({
  className = "",
  initialWhat = "",
  initialWhere = "",
  initialCityCountry = "",
  initialPlaceType = "",
  initialCityLat,
  initialCityLng,
  kind,
  compact = false,
  onSubmit,
}: SplitDirectorySearchProps) {
  const [what, setWhat] = useState(initialWhat);
  const [where, setWhere] = useState(initialWhere);
  const [activeField, setActiveField] = useState<"what" | "where" | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<SuggestedCity[]>([]);
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
    const city = await resolvedSelectedCity(selectedCity, citySessionToken);
    const payload = payloadFromDrafts(what, where, city);
    setActiveField(null);
    setCitySessionToken(null);

    if (onSubmit) {
      onSubmit(payload);
      return;
    }

    const params = new URLSearchParams();
    if (kind) {
      params.set("kind", kind);
    }
    if (payload.what) {
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

  function selectTreatment(treatment: string) {
    setWhat(treatment);
  }

  function selectCity(city: SuggestedCity) {
    setWhere(city.place_type === "country" ? city.label : city.city || city.label);
    setSelectedCity(city);
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

  return (
    <form
      ref={shellRef}
      className={[
        "split-search",
        compact ? "split-search-compact" : "",
        whatIsActive ? "is-what-active" : "",
        whereIsActive ? "is-where-active" : "",
        className,
      ].filter(Boolean).join(" ")}
      role="search"
      onSubmit={submit}
      onBlur={handleBlur}
    >
      <div className="split-search-fields">
        <label className="split-search-segment split-search-what">
          <span>What</span>
          <input
            value={what}
            onChange={(event) => setWhat(event.target.value)}
            onFocus={() => setActiveField("what")}
            type="search"
            aria-label="Search treatments"
            placeholder="Treatments"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {what ? (
            <button className="split-search-clear" type="button" aria-label="Clear treatment" onClick={() => setWhat("")}>
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
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </label>

          <button className="split-search-submit" type="submit" aria-label="Search">
            <Search size={compact ? 16 : 18} aria-hidden="true" />
            <span>Search</span>
          </button>
        </div>
      </div>

      {whatIsActive ? (
        <div className="split-search-menu split-search-menu-what">
          <p>Suggested treatments</p>
          <div className="split-search-suggestions" role="listbox" aria-label="Suggested treatments">
            {treatmentSuggestions.map((treatment) => (
              <button
                type="button"
                role="option"
                aria-selected={what.toLowerCase() === treatment.toLowerCase()}
                key={treatment}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectTreatment(treatment)}
              >
                <span className="split-search-suggestion-icon">
                  <Sparkles size={compact ? 15 : 17} aria-hidden="true" />
                </span>
                <span>{treatment}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {whereIsActive ? (
        <div className="split-search-menu split-search-menu-where">
          <p>Suggested Places</p>
          <div className="split-search-suggestions" role="listbox" aria-label="Suggested places">
            {citySuggestions.map((city) => (
              <button
                type="button"
                role="option"
                aria-selected={selectedCity?.id === city.id}
                key={city.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCity(city)}
              >
                <span className="split-search-suggestion-icon">
                  <MapPin size={compact ? 15 : 17} aria-hidden="true" />
                </span>
                <span>{highlightPrefix(city.label, where)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
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

function payloadFromDrafts(whatDraft: string, whereDraft: string, city: SuggestedCity | null): SplitSearchSubmit {
  const what = whatDraft.trim();
  const where = whereDraft.trim();

  return {
    what,
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
