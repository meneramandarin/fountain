import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

type SearchPayload = {
  mode?: string;
  searched_city?: string | null;
  searched_country?: string | null;
  results?: Array<{
    id?: number;
    slug?: string | null;
    name?: string | null;
    country_code?: string | null;
  }>;
};

describe("Ireland country and Dublin radius search", () => {
  beforeAll(() => {
    loadEnvFile(path.join(process.cwd(), ".env.local"));
    loadEnvFile(path.join(process.cwd(), ".env.production.local"));
  });

  test("autocomplete returns Ireland as a country option", async () => {
    const { GET } = await import("../src/app/api/cities/suggest/route");
    const response = await GET(new Request("http://test.local/api/cities/suggest?q=irel"));
    expect(response.ok).toBe(true);

    const payload = await response.json() as {
      suggestions?: Array<{ place_type?: string; country_code?: string | null; label?: string }>;
    };
    const ireland = payload.suggestions?.find(
      (suggestion) => suggestion.place_type === "country" && suggestion.country_code === "IE",
    );

    expect(ireland).toBeTruthy();
    expect(ireland?.label).toBe("Ireland");
  });

  test("country search returns Ireland inventory with Oxymed and one ReWell", async () => {
    const { parseDirectoryParams, searchLocations } = await import("../src/lib/queries");
    const params = parseDirectoryParams(new URLSearchParams({
      kind: "locations",
      country: "IE",
      city_label: "Ireland",
      city_country: "IE",
      place_type: "country",
    }));
    const payload = await searchLocations(params) as SearchPayload;
    const results = payload.results || [];

    expect(payload.mode).toBe("country_search");
    expect(payload.searched_country).toBe("Ireland");
    expect(results.some((result) => result.id === 3250)).toBe(true);
    expect(results.some((result) => result.slug === "dublin-ireland")).toBe(false);
    expect(results.every((result) => result.country_code === "IE")).toBe(true);
    expect(results.filter((result) => /rewell/i.test(String(result.name || "")))).toHaveLength(1);
  });

  test("Dublin radius search includes Oxymed and excludes dublin-ireland", async () => {
    const { parseDirectoryParams, searchLocations } = await import("../src/lib/queries");
    const params = parseDirectoryParams(new URLSearchParams({
      kind: "locations",
      city_label: "Dublin",
      city_country: "IE",
      city_lat: "53.3498053",
      city_lng: "-6.2603097",
    }));
    const payload = await searchLocations(params) as SearchPayload;
    const results = payload.results || [];

    expect(payload.mode).toBe("exact_radius");
    expect(payload.searched_city).toBe("Dublin");
    expect(results.some((result) => result.id === 3250)).toBe(true);
    expect(results.some((result) => result.slug === "dublin-ireland")).toBe(false);
  });
});

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = unquoteEnvValue(match[2].trim());
  }
}

function unquoteEnvValue(value: string) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
