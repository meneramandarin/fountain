import type { Metadata } from "next";
import { DirectoryShell, type DirectoryState, type SearchPayload } from "@/components/directory-shell";
import { getFacets, getStats, MAX_TREATMENT_FILTERS, searchLocations, searchPractitioners, type DirectoryParams } from "@/lib/queries";
import { ogImage, siteDescription } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Longevity Directory",
  description: siteDescription,
  alternates: {
    canonical: "/directory",
  },
  openGraph: {
    title: "Longevity Directory | Fountain",
    description: siteDescription,
    url: "/directory",
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Longevity Directory | Fountain",
    description: siteDescription,
    images: [ogImage.url],
  },
};

type DirectoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  const params = await searchParams;
  const initialState = stateFromSearchParams(params);
  const initialParams = paramsFromState(initialState);
  const initialPayloadPromise = initialState.kind === "practitioners"
    ? searchPractitioners(initialParams, initialState.page)
    : searchLocations(initialParams, initialState.page);
  const [facets, stats, initialPayload] = await Promise.all([getFacets(), getStats(), initialPayloadPromise]);
  return (
    <DirectoryShell
      key={stateKey(initialState)}
      initialFacets={facets}
      initialStats={stats}
      initialPayload={initialPayload as SearchPayload}
      initialState={initialState}
    />
  );
}

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}

function stateFromSearchParams(params: Record<string, string | string[] | undefined>): DirectoryState {
  return {
    kind: value(params, "kind") === "practitioners" ? "practitioners" : "locations",
    q: value(params, "q"),
    country: value(params, "country"),
    locality: value(params, "locality"),
    city_label: value(params, "city_label"),
    city_country: value(params, "city_country"),
    place_type: value(params, "place_type"),
    city_lat: finiteNumber(value(params, "city_lat")),
    city_lng: finiteNumber(value(params, "city_lng")),
    treatment_ids: value(params, "treatment_id")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, MAX_TREATMENT_FILTERS),
    entity_type: value(params, "entity_type"),
    care_model: value(params, "care_model"),
    page: Math.max(0, Number.parseInt(value(params, "page") || "0", 10) || 0),
  };
}

function paramsFromState(state: DirectoryState): DirectoryParams {
  const treatmentIds = state.treatment_ids
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isFinite(id));

  return {
    kind: state.kind,
    q: state.q || undefined,
    country: state.country || undefined,
    locality: state.locality || undefined,
    city_label: state.city_label || undefined,
    city_country: state.city_country || undefined,
    place_type: state.place_type || undefined,
    city_lat: state.city_lat,
    city_lng: state.city_lng,
    treatment_ids: treatmentIds.length ? treatmentIds : undefined,
    entity_type: state.entity_type || undefined,
    care_model: state.care_model || undefined,
  };
}

function stateKey(state: DirectoryState) {
  return JSON.stringify([
    state.kind,
    state.q,
    state.country,
    state.locality,
    state.city_label,
    state.city_country,
    state.place_type,
    state.city_lat,
    state.city_lng,
    state.treatment_ids.join(","),
    state.entity_type,
    state.care_model,
    state.page,
  ]);
}

function finiteNumber(value: string) {
  if (!value) {
    return undefined;
  }
  const numberValue = Number.parseFloat(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
