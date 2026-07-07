"use client";

import { LandingFooter } from "@/components/landing-footer";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  Filter,
  Loader2,
  MapPin,
  Search,
  Star,
  Stethoscope,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { locationHref, practitionerHref } from "@/lib/directory-urls";
import { getPopularTreatments, popularTreatmentLabel } from "@/lib/popular-treatments";

type Facets = {
  countries: { code: string; name: string; n: number }[];
  localities: { country_code: string; value: string; n: number }[];
  treatment_domains: { domain: string; treatments: { id: number; name: string; n: number }[] }[];
  location_entity_types: { value: string; n: number }[];
  location_care_models: { value: string; n: number }[];
  practitioner_entity_types: { value: string; n: number }[];
  practitioner_care_models: { value: string; n: number }[];
};

type Stats = Record<string, number>;
type Kind = "locations" | "practitioners";

export type DirectoryState = {
  kind: Kind;
  q: string;
  country: string;
  locality: string;
  treatment_ids: string[];
  entity_type: string;
  care_model: string;
  page: number;
};

type SearchPayload = {
  results: Array<LocationResultRow | PractitionerResultRow>;
  total: number;
  page: number;
  page_size: number;
};

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
  id: number;
  slug?: string | null;
  name?: string | null;
  org_name?: string | null;
  locality?: string | null;
  region?: string | null;
  country_name?: string | null;
  rating?: number | null;
  review_count?: number | null;
  min_price_amount?: number | null;
  min_price_currency?: string | null;
  treatments?: TreatmentChip[];
  tags?: Tag[];
  image?: string | null;
};
type PractitionerResultRow = {
  id: number;
  slug?: string | null;
  full_name?: string | null;
  primary_specialty?: string | null;
  years_experience?: number | null;
  affiliations?: AffiliationRef[];
  image?: string | null;
};

const optionCollator = new Intl.Collator("en", { sensitivity: "base" });
const countryDividerValue = "__country-divider";

function countryLabel(country: { code: string; name: string }) {
  return country.code === "US" ? "USA" : country.name || country.code;
}

const domainTone: Record<string, { bg: string; fg: string }> = {
  "Diagnostics & testing": { bg: "#e8eaf4", fg: "#33447a" },
  "Regenerative & cellular": { bg: "#e3f0e6", fg: "#1e5c3e" },
  "IV & infusion": { bg: "#f1e8d3", fg: "#6b4e23" },
  "Hormone & metabolic": { bg: "#f1e6f0", fg: "#6a3568" },
  "Recovery & performance": { bg: "#e3eff0", fg: "#1f5860" },
  Aesthetic: { bg: "#f3e6e9", fg: "#7a2f42" },
  "Lifestyle & foundational": { bg: "#edefe0", fg: "#4b5227" },
};

export function DirectoryShell({
  initialFacets,
  initialState: seededState,
}: {
  initialFacets: Facets;
  initialStats: Stats;
  initialState: DirectoryState;
}) {
  const [state, setState] = useState<DirectoryState>(seededState);
  const [payload, setPayload] = useState<SearchPayload>({ results: [], total: 0, page: 0, page_size: 25 });
  const [loading, setLoading] = useState(true);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("kind", state.kind);
    for (const key of ["q", "country", "locality", "entity_type", "care_model"] as const) {
      if (state[key]) {
        params.set(key, state[key]);
      }
    }
    if (state.treatment_ids.length) {
      params.set("treatment_id", state.treatment_ids.join(","));
    }
    if (state.page) {
      params.set("page", String(state.page));
    }
    return params.toString();
  }, [state]);

  useEffect(() => {
    const controller = new AbortController();
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
          setPayload({ results: [], total: 0, page: 0, page_size: 25 });
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [queryString]);

  const updateState = useCallback((patch: Partial<DirectoryState>) => {
    setLoading(true);
    setState((current) => ({ ...current, ...patch, page: patch.page ?? 0 }));
  }, []);

  const toggleTreatment = useCallback((id: string) => {
    if (!id) {
      return;
    }
    setLoading(true);
    setState((current) => {
      const selected = current.treatment_ids.includes(id)
        ? current.treatment_ids.filter((existing) => existing !== id)
        : [...current.treatment_ids, id];
      return { ...current, treatment_ids: selected, page: 0 };
    });
  }, []);

  const entityTypes = state.kind === "locations" ? initialFacets.location_entity_types : initialFacets.practitioner_entity_types;
  const careModels = state.kind === "locations" ? initialFacets.location_care_models : initialFacets.practitioner_care_models;
  const allTreatments = useMemo(
    () => initialFacets.treatment_domains.flatMap((domain) => domain.treatments),
    [initialFacets.treatment_domains],
  );
  const treatmentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const treatment of allTreatments) {
      map.set(String(treatment.id), treatment.name);
    }
    return map;
  }, [allTreatments]);
  const popularTreatments = useMemo(
    () =>
      getPopularTreatments(allTreatments),
    [allTreatments],
  );
  const countryOptions = useMemo(() => {
    const usCountry = initialFacets.countries.find((country) => country.code === "US");
    const otherCountries = initialFacets.countries
      .filter((country) => country.code !== "US")
      .sort((a, b) => optionCollator.compare(countryLabel(a), countryLabel(b)));
    return { usCountry, otherCountries };
  }, [initialFacets.countries]);
  const localityOptions = useMemo(
    () =>
      initialFacets.localities
        .filter((locality) => locality.country_code === state.country)
        .sort((a, b) => optionCollator.compare(a.value, b.value)),
    [initialFacets.localities, state.country],
  );

  return (
    <main className="directory-shell">
      <section className="directory-hero" aria-label="Directory search">
        <header className="directory-topbar">
          <Link className="landing-brand directory-brand" href="/">
            fountain
          </Link>
          <button className="coming-soon-pill" type="button">
            Coming Soon <span aria-hidden="true">|</span> Join
          </button>
        </header>

        <div className="kind-tabs directory-kind-tabs" role="tablist" aria-label="Directory type">
          <button
            type="button"
            role="tab"
            aria-selected={state.kind === "locations"}
            onClick={() => updateState({ kind: "locations", entity_type: "", care_model: "" })}
          >
            <Building2 size={17} aria-hidden="true" />
            Clinics & Med Spas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={state.kind === "practitioners"}
            onClick={() => updateState({ kind: "practitioners", entity_type: "", care_model: "" })}
          >
            <Stethoscope size={17} aria-hidden="true" />
            Doctors & practitioners
          </button>
        </div>

        <div className="directory-search-row">
          <form
            className="landing-search directory-search"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <input
              name="q"
              value={state.q}
              onChange={(event) => updateState({ q: event.target.value })}
              aria-label="Search treatments, clinics, doctors"
              type="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button type="submit" aria-label="Search">
              <Search size={18} aria-hidden="true" />
            </button>
          </form>
        </div>

        <div className="treatment-bubbles" role="group" aria-label="Popular treatments">
          {popularTreatments.map((treatment) => {
            const id = String(treatment.id);
            const selected = state.treatment_ids.includes(id);
            return (
              <button
                type="button"
                className="treatment-bubble"
                key={treatment.id}
                aria-pressed={selected}
                onClick={() => toggleTreatment(id)}
              >
                {popularTreatmentLabel(treatment.name)}
              </button>
            );
          })}
        </div>
      </section>

      <div className="directory-layout">
        <aside className="filter-panel">
          <div className="filter-heading">
            <Filter size={18} aria-hidden="true" />
            <span>Filters</span>
          </div>
          <label className="field">
            <span>Country</span>
            <span className="select-wrap">
              <select value={state.country} onChange={(event) => updateState({ country: event.target.value, locality: "" })}>
                <option value="">All countries</option>
                {countryOptions.usCountry ? (
                  <option value={countryOptions.usCountry.code}>
                    {countryLabel(countryOptions.usCountry)} ({countryOptions.usCountry.n.toLocaleString()})
                  </option>
                ) : null}
                {countryOptions.usCountry && countryOptions.otherCountries.length ? (
                  <option value={countryDividerValue} disabled>
                    -----------
                  </option>
                ) : null}
                {countryOptions.otherCountries.map((country) => (
                  <option value={country.code} key={country.code}>
                    {countryLabel(country)} ({country.n.toLocaleString()})
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </span>
          </label>
          <label className="field">
            <span>City</span>
            <span className="select-wrap">
              <select
                value={state.locality}
                onChange={(event) => updateState({ locality: event.target.value })}
                disabled={!state.country || !localityOptions.length}
              >
                <option value="">{state.country ? "All cities" : "Select a country first"}</option>
                {localityOptions.map((locality) => (
                  <option value={locality.value} key={`${locality.country_code}-${locality.value}`}>
                    {locality.value} ({locality.n.toLocaleString()})
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </span>
          </label>
          <label className="field">
            <span>Treatment</span>
            {state.treatment_ids.length ? (
              <div className="selected-treatments">
                {state.treatment_ids.map((id) => (
                  <button type="button" key={id} onClick={() => toggleTreatment(id)}>
                    {treatmentNameById.get(id) || id}
                    <X size={12} aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}
            <span className="select-wrap">
              <select value="" onChange={(event) => toggleTreatment(event.target.value)}>
                <option value="">Add a treatment</option>
                {initialFacets.treatment_domains.map((domain) => (
                  <optgroup label={domain.domain} key={domain.domain}>
                    {domain.treatments.map((treatment) => (
                      <option value={treatment.id} key={treatment.id} disabled={state.treatment_ids.includes(String(treatment.id))}>
                        {treatment.name} ({treatment.n.toLocaleString()})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </span>
          </label>

          <FacetButtons
            label="Type"
            options={entityTypes}
            value={state.entity_type}
            onChange={(value) => updateState({ entity_type: value })}
          />
          <FacetButtons
            label="Care model"
            options={careModels}
            value={state.care_model}
            onChange={(value) => updateState({ care_model: value })}
          />
          <button
            className="clear-button"
            type="button"
            onClick={() => {
              setLoading(true);
              setState({ ...emptyState(), kind: state.kind });
            }}
          >
            Clear filters
          </button>
        </aside>

        <section className="directory-results" aria-live="polite">
          <div className="resultbar">
            <span>
              {loading ? "Searching..." : `${payload.total.toLocaleString()} result${payload.total === 1 ? "" : "s"}`}
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
            onPrevious={() => updateState({ page: Math.max(0, state.page - 1) })}
            onNext={() => updateState({ page: state.page + 1 })}
          />
        </section>
      </div>

      <LandingFooter />
    </main>
  );
}

function emptyState(): DirectoryState {
  return { kind: "locations", q: "", country: "", locality: "", treatment_ids: [], entity_type: "", care_model: "", page: 0 };
}

function FacetButtons({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; n: number }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="facet-group">
      <span>{label}</span>
      <div className="facet-buttons">
        {options.slice(0, 8).map((option) => (
          <button
            type="button"
            aria-pressed={value === option.value}
            key={option.value}
            onClick={() => onChange(value === option.value ? "" : option.value)}
          >
            {option.value}
            <small>{option.n.toLocaleString()}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function LocationResult({ result }: { result: LocationResultRow }) {
  const [imageFailed, setImageFailed] = useState(false);
  const place = [result.locality, result.region, result.country_name].filter(Boolean).join(", ");
  const type = result.tags?.find((tag) => tag.facet === "entity_type");
  const price = formatPrice(result.min_price_amount, result.min_price_currency);
  return (
    <Link className="result-card" href={`${locationHref(result)}?from=search`}>
      <span className="result-photo">
        {result.image && !imageFailed ? (
          <Image
            src={imageSource(result.image)}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 640px) 92vw, (max-width: 980px) 46vw, 360px"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="result-photo-fallback" aria-hidden="true">
            <Building2 size={26} aria-hidden="true" />
          </span>
        )}
        {result.rating ? (
          <span className="result-rating-badge">
            <Star size={12} aria-hidden="true" />
            {Number(result.rating).toFixed(1)}
          </span>
        ) : null}
      </span>
      <span className="result-body">
        <span className="result-main">
          <b>{result.name || result.org_name || "Unnamed location"}</b>
          <small>
            <MapPin size={14} aria-hidden="true" />
            {place || "Location unavailable"}
          </small>
        </span>
        <span className="result-side">
          {type ? <em>{type.value}</em> : null}
          {price ? <small>From {price}</small> : null}
          {result.review_count ? <small>{Number(result.review_count).toLocaleString()} reviews</small> : null}
        </span>
        <span className="treatment-row">
          {(result.treatments || []).slice(0, 3).map((treatment) => {
            const tone = domainTone[treatment.domain] || { bg: "#eef2f0", fg: "#39443e" };
            return (
              <span key={`${result.id}-${treatment.name}`} style={{ background: tone.bg, color: tone.fg }}>
                {treatment.name}
              </span>
            );
          })}
        </span>
      </span>
    </Link>
  );
}

function PractitionerResult({ result }: { result: PractitionerResultRow }) {
  const [imageFailed, setImageFailed] = useState(false);
  const affiliation = result.affiliations?.[0];
  const place = affiliation
    ? [affiliation.clinic, affiliation.locality, affiliation.country_name || affiliation.country_code].filter(Boolean).join(", ")
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

function imageSource(src: string) {
  return src;
}

function formatPrice(amount?: number | null, currency?: string | null) {
  if (amount == null || !Number.isFinite(Number(amount))) {
    return null;
  }

  const value = Number(amount);
  const trimmedCurrency = currency?.trim();
  const maximumFractionDigits = Number.isInteger(value) ? 0 : 2;

  if (trimmedCurrency && /^[A-Z]{3}$/.test(trimmedCurrency)) {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: trimmedCurrency,
      maximumFractionDigits,
    }).format(value);
  }

  const formatted = value.toLocaleString("en", { maximumFractionDigits });
  if (!trimmedCurrency) {
    return formatted;
  }
  if (/^[^\dA-Za-z\s]+$/.test(trimmedCurrency)) {
    return `${trimmedCurrency}${formatted}`;
  }
  return `${formatted} ${trimmedCurrency}`;
}
