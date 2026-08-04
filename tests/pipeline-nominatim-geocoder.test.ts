import { describe, expect, test, vi } from "vitest";

import { createNominatimGeocoder } from "../pipeline/lib/nominatim-geocoder.mjs";

describe("Nominatim geocoder", () => {
  test("geocodes a Canadian address and records a zero-cost external call", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{
        lat: "49.2827",
        lon: "-123.1207",
        display_name: "Vancouver, British Columbia, Canada",
        address: { city: "Vancouver", province: "British Columbia" },
      }],
    }));
    const query = vi.fn(async () => ({ rows: [] }));
    const geocode = createNominatimGeocoder({
      fetchImpl,
      query,
      minimumIntervalMs: 0,
    });
    const result = await geocode({
      address: "123 Robson St, Vancouver, BC, Canada",
      countryCode: "CA",
      runId: 7,
      entityId: 11,
    });
    expect(result).toMatchObject({
      outcome: "matched",
      provider: "openstreetmap_nominatim",
      latitude: 49.2827,
      longitude: -123.1207,
    });
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("countrycodes")).toBe("ca");
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toContain("openstreetmap_nominatim");
  });
});
