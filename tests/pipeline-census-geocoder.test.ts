import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import {
  createCensusGeocoder,
  validateCensusAddressMatch,
} from "../pipeline/lib/census-geocoder.mjs";

describe("Census geocoder", () => {
  test("returns coordinates and records a zero-cost external call", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      result: {
        addressMatches: [{
          matchedAddress: "123 MAIN ST, BERKELEY, CA, 94704",
          coordinates: { x: -122.27, y: 37.87 },
          addressComponents: { city: "BERKELEY", state: "CA", zip: "94704" },
        }],
      },
    }), { status: 200 }));
    const geocode = createCensusGeocoder({ query, fetchImpl });
    const result = await geocode({
      address: "123 Main St, Berkeley, CA 94704",
      runId: 91,
      entityId: 12,
    });
    expect(result).toMatchObject({
      outcome: "matched",
      latitude: 37.87,
      longitude: -122.27,
    });
    const requestUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("benchmark")).toBe("Public_AR_Current");
    expect(requestUrl.searchParams.get("address")).toBe("123 Main St, Berkeley, CA 94704");
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toContain("'census_geocoder'");
    expect(query.mock.calls[0]?.[1]).toMatchObject({
      0: 91,
      1: 12,
      3: "ok",
      4: 200,
    });
  });

  test("returns no_match for an empty addressMatches array", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const geocode = createCensusGeocoder({
      query,
      fetchImpl: vi.fn(async () => new Response(
        JSON.stringify({ result: { addressMatches: [] } }),
        { status: 200 },
      )),
    });
    await expect(geocode({ address: "1 Unknown Way, CA", runId: 92 }))
      .resolves.toMatchObject({ outcome: "no_match" });
  });

  test("rejects a Census interpolation on a different street and postal code", async () => {
    expect(validateCensusAddressMatch(
      "9835 SW 72nd St, Ste 208, Miami, FL, 33173, US",
      {
        matchedAddress: "9835 SW 72ND AVE, MIAMI, FL, 33156",
        addressComponents: { city: "MIAMI", state: "FL", zip: "33156" },
      },
    )).toMatchObject({
      verified: false,
      house_number_match: true,
      street_match: false,
      locality_match: true,
      postal_match: false,
    });
  });
});
