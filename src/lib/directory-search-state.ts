import type { DirectoryState } from "@/components/directory-shell";
import { MAX_TREATMENT_FILTERS, type DirectoryParams } from "@/lib/queries";

export function directoryStateFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): DirectoryState {
  return {
    kind: "locations",
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

export function directoryParamsFromState(state: DirectoryState): DirectoryParams {
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

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}

function finiteNumber(value: string) {
  if (!value) {
    return undefined;
  }
  const numberValue = Number.parseFloat(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
