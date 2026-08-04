import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import { reconcileDiscoveredPlaces } from "../pipeline/lib/place-reconcile.mjs";

describe("place discovery reconciliation", () => {
  test("geocodes candidates and separates existing matches from ready imports", async () => {
    const candidates = [
      {
        id: "1",
        name: "Existing Clinic",
        website: "https://existing.example",
        address: "1 Main St, Berkeley, CA 94704",
        locality: "Berkeley",
        region: "CA",
        country_code: "US",
        status: "discovered",
        address_verified: true,
        treatment_verified: true,
      },
      {
        id: "2",
        name: "New Clinic",
        website: "https://new.example",
        address: "2 Main St, Berkeley, CA 94704",
        locality: "Berkeley",
        region: "CA",
        country_code: "US",
        status: "discovered",
        address_verified: true,
        treatment_verified: true,
      },
    ];
    const query = vi.fn(async (sql: string) => (
      sql.includes("SELECT *") ? { rows: candidates } : { rows: [] }
    ));
    const geocode = vi.fn(async ({ entityId }) => ({
      outcome: "matched",
      latitude: 37.87 + entityId / 1000,
      longitude: -122.27,
    }));
    const matchLocation = vi.fn(async ({ name }) => (
      name === "Existing Clinic"
        ? { status: "matched", location_id: 44, method: "website_domain_locality", confidence: 0.98 }
        : { status: "none" }
    ));

    const result = await reconcileDiscoveredPlaces({
      campaign: "test",
      runId: 93,
      apply: true,
      concurrency: 2,
    }, { query, geocode, matchLocation });

    expect(result).toMatchObject({
      selected: 2,
      geocoded: 2,
      existing_matches: 1,
      ready: 1,
      needs_review: 0,
    });
    expect(geocode).toHaveBeenCalledTimes(2);
    expect(matchLocation).toHaveBeenCalledTimes(2);
    const statusUpdates = query.mock.calls
      .filter(([sql]) => String(sql).includes("UPDATE fountain_raw.agent_discovery_candidates")
        && String(sql).includes("match_result"))
      .map(([, values]) => values?.[1])
      .sort();
    expect(statusUpdates).toEqual(["existing_match", "ready"]);
  });

  test("retries an international no-match with a simplified address once", async () => {
    const candidates = [{
      id: "3",
      name: "Verified Clinic",
      website: "https://verified.example",
      address: "Villa 2, Al Athar Street",
      locality: "Dubai",
      region: "Dubai",
      postal_code: "00000",
      country_code: "AE",
      status: "needs_review",
      address_verified: true,
      treatment_verified: true,
      match_result: { status: "none" },
      geocode_result: {
        outcome: "no_match",
        attempted_address: "Villa 2, Al Athar Street, Dubai, Dubai, 00000, AE",
      },
    }];
    const query = vi.fn(async (sql: string) => (
      sql.includes("SELECT *") ? { rows: candidates } : { rows: [] }
    ));
    const geocode = vi.fn(async () => ({
      outcome: "matched",
      provider: "openstreetmap_nominatim",
      latitude: 25.2,
      longitude: 55.27,
    }));

    const result = await reconcileDiscoveredPlaces({
      campaign: "test",
      runId: 94,
      apply: true,
      concurrency: 1,
    }, {
      query,
      geocode,
      matchLocation: vi.fn(async () => ({ status: "none" })),
    });

    expect(result.ready).toBe(1);
    expect(geocode).toHaveBeenCalledWith(expect.objectContaining({
      address: "Villa 2, Al Athar Street, Dubai, AE",
    }));
    const geocodeUpdate = query.mock.calls.find(([sql]) => (
      String(sql).includes("geocode_provider = $4")
    ));
    expect(JSON.parse(String(geocodeUpdate?.[1]?.[4]))).toMatchObject({
      outcome: "matched",
      retry_strategy: "simplified_address",
    });
  });

  test("prefers exact official-page coordinates over an external geocoder", async () => {
    const candidates = [{
      id: "4",
      name: "Official Clinic",
      website: "https://official.example/locations/boulder",
      address: "2255 31st Street",
      locality: "Boulder",
      region: "CO",
      postal_code: "80301",
      country_code: "US",
      status: "discovered",
      address_verified: true,
      treatment_verified: true,
    }];
    const query = vi.fn(async (sql: string) => (
      sql.includes("SELECT *") ? { rows: candidates } : { rows: [] }
    ));
    const geocode = vi.fn();
    const resolveOfficialCoordinates = vi.fn(async () => ({
      outcome: "matched",
      provider: "official_site_jsonld",
      latitude: 40.02381,
      longitude: -105.25318,
      source_url: "https://official.example/locations/boulder",
    }));

    const result = await reconcileDiscoveredPlaces({
      campaign: "test",
      runId: 95,
      apply: true,
      concurrency: 1,
    }, {
      query,
      geocode,
      resolveOfficialCoordinates,
      matchLocation: vi.fn(async () => ({ status: "none" })),
    });

    expect(result).toMatchObject({ geocoded: 1, ready: 1 });
    expect(geocode).not.toHaveBeenCalled();
    const geocodeUpdate = query.mock.calls.find(([sql]) => (
      String(sql).includes("geocode_provider = $4")
    ));
    expect(geocodeUpdate?.[1]?.[3]).toBe("official_site_jsonld");
    expect(JSON.parse(String(geocodeUpdate?.[1]?.[4]))).toMatchObject({
      outcome: "matched",
      evidence_method: "exact_branch_address_jsonld",
    });
  });
});
