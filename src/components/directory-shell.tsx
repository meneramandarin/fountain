"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ExternalLink,
  Filter,
  Loader2,
  MapPin,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Facets = {
  countries: { code: string; name: string; n: number }[];
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
type SourceRef = { source?: string | null; source_slug?: string | null; source_url?: string | null };
type ReviewRef = { reviewer?: string | null; rating?: string | number | null; review_date?: string | null; body?: string | null };
type OfferingRef = {
  raw_name?: string | null;
  price_amount?: number | null;
  price_currency?: string | null;
  source_offer_url?: string | null;
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
  review_count?: number | null;
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
  sources?: SourceRef[];
  practitioners?: { id: number; full_name: string; primary_specialty?: string | null; role?: string | null }[];
};
type PractitionerDetailRecord = PractitionerResultRow & {
  credentials?: string | null;
  languages?: string | null;
  tags?: Tag[];
  images?: ImageRef[];
  sources?: SourceRef[];
};
type DrawerState =
  | { kind: "locations"; data: LocationDetailRecord }
  | { kind: "practitioners"; data: PractitionerDetailRecord };

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
  initialStats,
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
    for (const key of ["q", "country", "treatment_id", "entity_type", "care_model"] as const) {
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
      <header className="directory-topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">F</span>
          <span>Fountain</span>
        </Link>
        <div className="directory-stats">
          <b>{Number(initialStats.locations).toLocaleString()}</b> clinics
          <span />
          <b>{Number(initialStats.practitioners).toLocaleString()}</b> practitioners
          <span />
          <b>{Number(initialStats.offerings).toLocaleString()}</b> offerings
        </div>
      </header>

      <div className="directory-layout">
        <aside className="filter-panel">
          <div className="filter-heading">
            <Filter size={18} aria-hidden="true" />
            <span>Filters</span>
          </div>
          <label className="field">
            <span>Search</span>
            <div className="input-wrap">
              <Search size={16} aria-hidden="true" />
              <input
                value={state.q}
                onChange={(event) => updateState({ q: event.target.value })}
                placeholder="name, treatment, place"
                type="search"
              />
            </div>
          </label>
          <label className="field">
            <span>Country</span>
            <select value={state.country} onChange={(event) => updateState({ country: event.target.value })}>
              <option value="">All countries</option>
              {initialFacets.countries.map((country) => (
                <option value={country.code} key={country.code}>
                  {country.name} ({country.n.toLocaleString()})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Treatment</span>
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
          <div className="kind-tabs" role="tablist" aria-label="Directory type">
            <button
              type="button"
              role="tab"
              aria-selected={state.kind === "locations"}
              onClick={() => updateState({ kind: "locations", entity_type: "", care_model: "" })}
            >
              <Building2 size={17} aria-hidden="true" />
              Clinics & locations
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

      {drawer ? <DetailDrawer drawer={drawer} onClose={() => setDrawer(null)} /> : null}
    </main>
  );
}

function emptyState(): DirectoryState {
  return { kind: "locations", q: "", country: "", treatment_id: "", entity_type: "", care_model: "", page: 0 };
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
      <TagList tags={data.tags || []} />
      <ReviewList reviews={data.reviews || []} />
      <SourceList sources={data.sources || []} />
    </>
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
      <SourceList sources={data.sources || []} />
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
            {offering.price_amount ? (
              <b>
                {Number(offering.price_amount).toLocaleString()} {offering.price_currency || ""}
              </b>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function TagList({ tags }: { tags: Tag[] }) {
  const visible = tags.filter((tag) => ["entity_type", "care_model", "trust", "price_tier", "source_tag"].includes(tag.facet));
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

function SourceList({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) {
    return null;
  }
  return (
    <section className="detail-section">
      <h3>Sources</h3>
      {sources.map((source, index) =>
        source.source_url ? (
          <a href={source.source_url} target="_blank" rel="noreferrer" key={`${source.source_slug}-${index}`}>
            {source.source} <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : (
          <p key={`${source.source_slug}-${index}`}>{source.source}</p>
        ),
      )}
    </section>
  );
}
