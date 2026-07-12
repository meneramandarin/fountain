import { describe, expect, test } from "vitest";
import {
  mergeCitySuggestions,
  parseGooglePlaceLabel,
  type CitySuggestion,
} from "../src/lib/city-suggestions";

describe("city suggestion dedupe", () => {
  test("dedupes Dublin inventory and Google Ireland suggestions by ISO country", () => {
    const google = googleLocality("google:dublin-ie", "Dublin, Ireland");
    const suggestions = mergeCitySuggestions([
      inventoryLocality("inventory:IE:dublin", "Dublin", null, "IE", "Ireland"),
      google,
    ], 6);

    expect(google.country_code).toBe("IE");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe("inventory:IE:dublin");
  });

  test("keeps London GB, ON, and KY as distinct places", () => {
    const suggestions = mergeCitySuggestions([
      googleLocality("google:london-gb", "London, UK"),
      googleLocality("google:london-on", "London, ON, Canada"),
      googleLocality("google:london-ky", "London, KY, USA"),
    ], 6);

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "google:london-gb",
      "google:london-on",
      "google:london-ky",
    ]);
  });

  test("dedupes diacritic variants in the same country", () => {
    const suggestions = mergeCitySuggestions([
      inventoryLocality("inventory:BR:sao-paulo", "São Paulo", null, "BR", "Brazil"),
      inventoryLocality("google:sao-paulo", "Sao Paulo", null, "BR", "Brazil"),
    ], 6);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].city).toBe("São Paulo");
  });
});

function googleLocality(id: string, label: string): CitySuggestion {
  const parsed = parseGooglePlaceLabel(label, "locality");
  return inventoryLocality(
    id,
    parsed.city || label,
    parsed.region || null,
    parsed.countryCode || null,
    parsed.countryName || null,
    "google",
  );
}

function inventoryLocality(
  id: string,
  city: string,
  region: string | null,
  countryCode: string | null,
  countryName: string | null,
  source: "inventory" | "google" = "inventory",
): CitySuggestion {
  return {
    id,
    source,
    place_type: "locality",
    label: [city, region, countryCode].filter(Boolean).join(", "),
    city,
    region,
    country_code: countryCode,
    country_name: countryName,
    lat: null,
    lng: null,
    has_inventory: source === "inventory",
  };
}
