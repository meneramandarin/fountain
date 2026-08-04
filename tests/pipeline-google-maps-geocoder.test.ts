import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import {
  createGoogleMapsGeocoder,
  selectExactAddressResult,
} from "../pipeline/lib/google-maps-geocoder.mjs";

const exactResult = {
  formatted_address: "2255 31st St, Boulder, CO 80301, USA",
  place_id: "place-1",
  address_components: [
    { long_name: "2255", short_name: "2255", types: ["street_number"] },
    { long_name: "31st Street", short_name: "31st St", types: ["route"] },
    { long_name: "Boulder", short_name: "Boulder", types: ["locality"] },
    { long_name: "80301", short_name: "80301", types: ["postal_code"] },
    { long_name: "United States", short_name: "US", types: ["country"] },
  ],
  geometry: {
    location_type: "ROOFTOP",
    location: { lat: 40.02381, lng: -105.25318 },
  },
};

describe("Google Maps geocoder fallback", () => {
  test("accepts only a precise same-country exact-address result", () => {
    expect(selectExactAddressResult([exactResult], {
      address: "2255 31st Street, Suite 110, Boulder, CO 80301, US",
      countryCode: "US",
      locality: "Boulder",
      postalCode: "80301",
    })).toMatchObject({
      latitude: 40.02381,
      longitude: -105.25318,
      locationType: "ROOFTOP",
      validation: {
        precise_location_type: true,
        country_match: true,
        house_number_match: true,
        street_match: true,
        locality_match: true,
        postal_match: true,
      },
    });
    expect(selectExactAddressResult([{
      ...exactResult,
      geometry: { ...exactResult.geometry, location_type: "APPROXIMATE" },
    }], {
      address: "2255 31st Street",
      countryCode: "US",
      locality: "Boulder",
      postalCode: "80301",
    })).toBeNull();
  });

  test("records a ledger call without exposing the API key", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "OK", results: [exactResult] }),
    }));
    const geocode = createGoogleMapsGeocoder({
      apiKey: "secret-test-key",
      fetchImpl,
      query,
    });
    const result = await geocode({
      address: "2255 31st Street, Boulder, CO 80301, US",
      runId: 10,
      entityId: 22,
      countryCode: "US",
      locality: "Boulder",
      postalCode: "80301",
    });

    expect(result).toMatchObject({
      outcome: "matched",
      provider: "google_maps_geocoding_api",
      place_id: "place-1",
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(query.mock.calls)).not.toContain("secret-test-key");
  });

  test("normalizes spelled-out diagonal street directions", () => {
    const selected = selectExactAddressResult([{
      formatted_address: "9835 SW 72nd St Ste 208, Miami, FL 33173, USA",
      place_id: "covalent",
      address_components: [
        { long_name: "9835", short_name: "9835", types: ["street_number"] },
        { long_name: "Southwest 72nd Street", short_name: "SW 72nd St", types: ["route"] },
        { long_name: "Miami", short_name: "Miami", types: ["locality"] },
        { long_name: "33173", short_name: "33173", types: ["postal_code"] },
        { long_name: "United States", short_name: "US", types: ["country"] },
      ],
      geometry: {
        location_type: "ROOFTOP",
        location: { lat: 25.7021183, lng: -80.35285 },
      },
    }], {
      address: "9835 SW 72nd St, Ste 208, Miami, FL 33173",
      countryCode: "US",
      locality: "Miami",
      postalCode: "33173",
    });

    expect(selected).toMatchObject({
      placeId: "covalent",
      validation: {
        house_number_match: true,
        street_match: true,
        locality_match: true,
        postal_match: true,
      },
    });
  });

  test("normalizes a state-highway route prefix", () => {
    const selected = selectExactAddressResult([{
      formatted_address: "4055 State Hwy 6 N, Houston, TX 77084, USA",
      place_id: "gangnam-spa",
      address_components: [
        { long_name: "4055", short_name: "4055", types: ["street_number"] },
        { long_name: "State Highway 6 North", short_name: "State Hwy 6 N", types: ["route"] },
        { long_name: "Houston", short_name: "Houston", types: ["locality"] },
        { long_name: "77084", short_name: "77084", types: ["postal_code"] },
        { long_name: "United States", short_name: "US", types: ["country"] },
      ],
      geometry: {
        location_type: "ROOFTOP",
        location: { lat: 29.83237, lng: -95.64657 },
      },
    }], {
      address: "4055 Highway 6 North, Houston, TX 77084",
      countryCode: "US",
      locality: "Houston",
      postalCode: "77084",
    });

    expect(selected).toMatchObject({
      placeId: "gangnam-spa",
      validation: { street_match: true },
    });
  });
});
