import { countryDisplayName, iso2ToDisplay } from "@/lib/countries";

export type PlaceType = "locality" | "country";

export type CitySuggestion = {
  id: string;
  source: "inventory" | "google";
  place_type: PlaceType;
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

export function mergeCitySuggestions(suggestions: CitySuggestion[], limit: number) {
  const seen = new Set<string>();
  const merged: CitySuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = suggestionKey(suggestion);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(suggestion);
    if (merged.length >= limit) {
      break;
    }
  }
  return merged;
}

export function parseGooglePlaceLabel(label: string, placeType: PlaceType) {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  const countryName = parts.at(-1);
  const countryCode = countryName ? iso2FromDisplay(countryName) : undefined;

  if (placeType === "country") {
    const code = iso2FromDisplay(label);
    return {
      city: label,
      region: undefined,
      countryName: countryDisplayName(code, label) || label,
      countryCode: code,
    };
  }

  return {
    city: parts[0],
    region: parts.length > 2 ? parts.at(-2) : undefined,
    countryName: countryDisplayName(countryCode, countryName) || countryName,
    countryCode,
  };
}

export function normalizeSuggestionText(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function suggestionKey(suggestion: CitySuggestion) {
  if (suggestion.place_type === "country" && suggestion.country_code) {
    return `country:${suggestion.country_code}`;
  }

  const country = suggestion.country_code || iso2FromDisplay(suggestion.country_name || "") || normalizeSuggestionText(suggestion.country_name || "");
  const region = suggestion.region ? normalizeSuggestionText(suggestion.region) : "";
  return `${normalizeSuggestionText(suggestion.city)}:${country}:${region}`;
}

function iso2FromDisplay(value: string) {
  const normalized = normalizeSuggestionText(value);
  if (normalized === "usa") {
    return "US";
  }
  if (normalized === "uk") {
    return "GB";
  }
  return Object.entries(iso2ToDisplay).find(([, label]) => normalizeSuggestionText(label) === normalized)?.[0];
}
