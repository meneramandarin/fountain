"use client";

import { LandingFooter } from "@/components/landing-footer";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  ExternalLink,
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
  treatment_id: string;
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
type ImageRef = { image_url?: string | null; local_path?: string | null; alt?: string | null };
type ReviewRef = { reviewer?: string | null; rating?: string | number | null; review_date?: string | null; body?: string | null };
type OfferingRef = {
  raw_name?: string | null;
  price_amount?: number | null;
  price_currency?: string | null;
  treatment?: string | null;
  domain?: string | null;
};
type AffiliationRef = {
  id?: number;
  pid?: number;
  clinic?: string | null;
  locality?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  role?: string | null;
};
type LocationResultRow = {
  id: number;
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
};
type PractitionerResultRow = {
  id: number;
  full_name: string;
  primary_specialty?: string | null;
  years_experience?: number | null;
  affiliations?: AffiliationRef[];
};
type LocationDetailRecord = LocationResultRow & {
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  offerings?: OfferingRef[];
  images?: ImageRef[];
  reviews?: ReviewRef[];
  practitioners?: { id: number; full_name: string; primary_specialty?: string | null; role?: string | null }[];
};
type PractitionerDetailRecord = PractitionerResultRow & {
  credentials?: string | null;
  languages?: string | null;
  tags?: Tag[];
  images?: ImageRef[];
};
type DrawerState =
  | { kind: "locations"; data: LocationDetailRecord }
  | { kind: "practitioners"; data: PractitionerDetailRecord };

const optionCollator = new Intl.Collator("en", { sensitivity: "base" });
const countryDividerValue = "__country-divider";

function countryLabel(country: { code: string; name: string }) {
  return country.code === "US" ? "USA" : country.name || country.code;
}

const domainTone: Record<string, { bg: string; fg: string }> = {
  "Diagnostics & testing": { bg: "#e9f1fb", fg: "#244a72" },
  "Regenerative & cellular": { bg: "#e8f4eb", fg: "#24563b" },
  "IV & infusion": { bg: "#f7ecdb", fg: "#77501c" },
  "Hormone & metabolic": { bg: "#f4e9f4", fg: "#603b63" },
  "Recovery & performance": { bg: "#e8f5f6", fg: "#225d64" },
  Aesthetic: { bg: "#f8e9e6", fg: "#7b3e35" },
  "Lifestyle & foundational": { bg: "#eef0e5", fg: "#4d5630" },
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
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("kind", state.kind);
    for (const key of ["q", "country", "locality", "treatment_id", "entity_type", "care_model"] as const) {
      if (state[key]) {
        params.set(key, state[key]);
      }
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

  const entityTypes = state.kind === "locations" ? initialFacets.location_entity_types : initialFacets.practitioner_entity_types;
  const careModels = state.kind === "locations" ? initialFacets.location_care_models : initialFacets.practitioner_care_models;
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

  async function openDetail(kind: Kind, id: number) {
    const endpoint = kind === "locations" ? `/api/location/${id}` : `/api/practitioner/${id}`;
    const response = await fetch(endpoint);
    if (response.ok) {
      const data = await response.json();
      setDrawer(
        kind === "locations"
          ? { kind, data: data as LocationDetailRecord }
          : { kind, data: data as PractitionerDetailRecord },
      );
    }
  }

  return (
    <main className="directory-shell">
      <section className="directory-hero" aria-label="Directory search">
        <header className="directory-topbar">
          <Link className="landing-brand directory-brand" href="/">
            fountain
          </Link>
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
              placeholder="Search treatments, clinics, doctors..."
              type="search"
            />
            <button type="submit" aria-label="Search">
              <Search size={18} aria-hidden="true" />
            </button>
          </form>
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
            <span className="select-wrap">
              <select value={state.treatment_id} onChange={(event) => updateState({ treatment_id: event.target.value })}>
                <option value="">Any treatment</option>
                {initialFacets.treatment_domains.map((domain) => (
                  <optgroup label={domain.domain} key={domain.domain}>
                    {domain.treatments.map((treatment) => (
                      <option value={treatment.id} key={treatment.id}>
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
                    onOpen={() => openDetail("locations", result.id)}
                  />
                ))
              : payload.results.map((result) => (
                  <PractitionerResult
                    key={result.id}
                    result={result as PractitionerResultRow}
                    onOpen={() => openDetail("practitioners", result.id)}
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
      {drawer ? <DetailDrawer drawer={drawer} onClose={() => setDrawer(null)} /> : null}
    </main>
  );
}

function emptyState(): DirectoryState {
  return { kind: "locations", q: "", country: "", locality: "", treatment_id: "", entity_type: "", care_model: "", page: 0 };
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

function LocationResult({ result, onOpen }: { result: LocationResultRow; onOpen: () => void }) {
  const place = [result.locality, result.region, result.country_name].filter(Boolean).join(", ");
  const type = result.tags?.find((tag) => tag.facet === "entity_type");
  const price = formatPrice(result.min_price_amount, result.min_price_currency);
  return (
    <button className="result-card" type="button" onClick={onOpen}>
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
        {result.rating ? (
          <small>
            <Star size={13} aria-hidden="true" />
            {Number(result.rating).toFixed(1)}
          </small>
        ) : null}
        {result.review_count ? <small>{Number(result.review_count).toLocaleString()} reviews</small> : null}
      </span>
      <span className="treatment-row">
        {(result.treatments || []).slice(0, 5).map((treatment) => {
          const tone = domainTone[treatment.domain] || { bg: "#eef2f0", fg: "#39443e" };
          return (
            <span key={`${result.id}-${treatment.name}`} style={{ background: tone.bg, color: tone.fg }}>
              {treatment.name}
            </span>
          );
        })}
      </span>
    </button>
  );
}

function PractitionerResult({ result, onOpen }: { result: PractitionerResultRow; onOpen: () => void }) {
  const affiliation = result.affiliations?.[0];
  const place = affiliation
    ? [affiliation.clinic, affiliation.locality, affiliation.country_name || affiliation.country_code].filter(Boolean).join(", ")
    : "";
  return (
    <button className="result-card practitioner-card" type="button" onClick={onOpen}>
      <span className="result-main">
        <b>{result.full_name}</b>
        <small>{result.primary_specialty || "Specialty unavailable"}</small>
      </span>
      <span className="result-side">
        {result.years_experience ? <em>{result.years_experience} yrs</em> : null}
        {place ? <small>{place}</small> : null}
      </span>
    </button>
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

function DetailDrawer({ drawer, onClose }: { drawer: DrawerState; onClose: () => void }) {
  if (drawer.kind === "locations") {
    const data = drawer.data;
    const title = data.name || data.org_name;
    const subtitle = [data.locality, data.region, data.country_name].filter(Boolean).join(", ");

    return (
      <>
        <button className="drawer-overlay" type="button" aria-label="Close detail drawer" onClick={onClose} />
        <aside className="detail-drawer" aria-label="Directory detail">
          <header>
            <div>
              <h2>{title || "Directory record"}</h2>
              <p>{subtitle}</p>
            </div>
            <button type="button" aria-label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className="drawer-content">
            <ImageStrip images={data.images || []} />
            <LocationDetail data={data} />
          </div>
        </aside>
      </>
    );
  }

  const data = drawer.data;
  const subtitle = [data.primary_specialty, data.years_experience ? `${data.years_experience} yrs` : ""].filter(Boolean).join(" · ");

  return (
    <>
      <button className="drawer-overlay" type="button" aria-label="Close detail drawer" onClick={onClose} />
      <aside className="detail-drawer" aria-label="Directory detail">
        <header>
          <div>
            <h2>{data.full_name || "Directory record"}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="drawer-content">
          <ImageStrip images={data.images || []} />
          <PractitionerDetail data={data} />
        </div>
      </aside>
    </>
  );
}

function ImageStrip({ images }: { images: ImageRef[] }) {
  const usable = images.map((image) => image.image_url || image.local_path).filter(Boolean).slice(0, 4) as string[];
  if (!usable.length) {
    return null;
  }
  return (
    <div className="image-strip">
      {usable.map((src) => (
        <Image src={imageSource(src)} alt="" width={180} height={156} unoptimized key={src} />
      ))}
    </div>
  );
}

function imageSource(src: string) {
  if (src.startsWith("data/media/")) {
    return `/media/${src.replace(/^data\/media\//, "")}`;
  }
  return src;
}

function LocationDetail({ data }: { data: LocationDetailRecord }) {
  return (
    <>
      <section className="detail-section">
        <h3>Contact</h3>
        <p>{data.address || "Address unavailable"}</p>
        {data.phone ? <p>{data.phone}</p> : null}
        {data.website ? (
          <a href={data.website} target="_blank" rel="noreferrer">
            Website <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
      </section>
      <Offerings offerings={data.offerings || []} />
      <LocationPractitioners practitioners={data.practitioners || []} />
      <TagList tags={data.tags || []} />
      <ReviewList reviews={data.reviews || []} />
    </>
  );
}

function LocationPractitioners({
  practitioners,
}: {
  practitioners: { id: number; full_name: string; primary_specialty?: string | null; role?: string | null }[];
}) {
  if (!practitioners.length) {
    return null;
  }
  return (
    <section className="detail-section">
      <h3>Practitioners</h3>
      {practitioners.slice(0, 12).map((practitioner) => {
        const detail = [practitioner.primary_specialty, practitioner.role].filter(Boolean).join(" · ");
        return (
          <p key={practitioner.id}>
            <b>{practitioner.full_name}</b>
            {detail ? <span> · {detail}</span> : null}
          </p>
        );
      })}
    </section>
  );
}

function PractitionerDetail({ data }: { data: PractitionerDetailRecord }) {
  return (
    <>
      <section className="detail-section">
        <h3>Profile</h3>
        <p>{data.credentials || data.primary_specialty || "Profile details unavailable"}</p>
        {data.languages ? <p>Languages: {data.languages}</p> : null}
      </section>
      <section className="detail-section">
        <h3>Affiliations</h3>
        {(data.affiliations || []).length ? (
          (data.affiliations || []).map((affiliation) => (
            <p key={`${affiliation.id}-${affiliation.clinic}`}>
              {affiliation.clinic} · {[affiliation.locality, affiliation.country_name].filter(Boolean).join(", ")}
            </p>
          ))
        ) : (
          <p>No linked clinic in canonical data.</p>
        )}
      </section>
      <TagList tags={data.tags || []} />
    </>
  );
}

function Offerings({ offerings }: { offerings: OfferingRef[] }) {
  if (!offerings.length) {
    return null;
  }
  return (
    <section className="detail-section">
      <h3>Offerings</h3>
      <div className="offer-list">
        {offerings.slice(0, 40).map((offering, index) => (
          <div className="offer-item" key={`${offering.raw_name}-${index}`}>
            <span>{offering.treatment || offering.raw_name}</span>
            {offering.price_amount != null ? <b>{formatPrice(offering.price_amount, offering.price_currency)}</b> : null}
          </div>
        ))}
      </div>
    </section>
  );
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

function TagList({ tags }: { tags: Tag[] }) {
  const visible = tags.filter((tag) => ["entity_type", "care_model", "trust", "price_tier"].includes(tag.facet));
  if (!visible.length) {
    return null;
  }
  return (
    <section className="detail-section">
      <h3>Tags</h3>
      <div className="drawer-tags">
        {visible.slice(0, 30).map((tag) => (
          <span key={`${tag.facet}-${tag.value}`}>{tag.value}</span>
        ))}
      </div>
    </section>
  );
}

function ReviewList({ reviews }: { reviews: ReviewRef[] }) {
  if (!reviews.length) {
    return null;
  }
  return (
    <section className="detail-section">
      <h3>Reviews</h3>
      {reviews.slice(0, 5).map((review, index) => (
        <blockquote key={`${review.review_date}-${index}`}>
          <b>{review.reviewer || "Anonymous"}</b>
          {review.rating ? <span>{String(review.rating)}</span> : null}
          <p>{review.body || "No review body provided."}</p>
        </blockquote>
      ))}
    </section>
  );
}
