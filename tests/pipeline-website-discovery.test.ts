import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import * as websiteDiscovery from "../pipeline/lib/website-discovery.mjs";

const {
  buildOfficialWebsiteSearchQuery,
  buildPlacesTextQuery,
  discoverWebsiteForLocation,
  selectGooglePlaceMatch,
  validateOfficialWebsiteCandidate,
} = websiteDiscovery;

const AAI = {
  id: 9390,
  name: "AAI Rejuvenation",
  address: null,
  locality: "Fort Lauderdale",
  region: "FL",
  postal_code: null,
  country_code: "US",
  website: null,
};

describe("Stage 3 website discovery evidence", () => {
  test("uses a stored Google provider id and the contact-only Places details interface first", async () => {
    const getDetails = vi.fn(async () => ({
      data: {
        id: "places/official-clinic",
        displayName: { text: "Harbor Longevity" },
        formattedAddress: "125 Pine Street, Seattle, WA 98101",
        websiteUri: "https://harborlongevity.example/",
      },
      externalCallId: 701,
    }));
    const searchText = vi.fn();
    const webSearch = vi.fn();

    const result = await discoverWebsiteForLocation({
      location: {
        id: 44,
        name: "Harbor Longevity",
        locality: "Seattle",
        region: "WA",
      },
      externalPlaceMatches: [
        { provider: "google", provider_place_id: "google-old" },
        { provider: "google_places", provider_place_id: "google-preferred" },
      ],
      runId: "61",
    }, {
      placesClient: { getDetails, searchText },
      webSearch,
    });

    expect(getDetails).toHaveBeenCalledWith({
      runId: "61",
      taskType: "contact_fill",
      entityId: 44,
      placeId: "google-preferred",
      maxAttempts: 1,
    });
    expect(searchText).not.toHaveBeenCalled();
    expect(webSearch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      location_id: 44,
      outcome: "official_website_found",
      source: "google_places",
      would_write_website: "https://harborlongevity.example/",
      provider: "google_places",
      provider_place_id: "google-preferred",
      write_attempted: false,
      database_mutated: false,
    });
    expect(result.validation).toMatchObject({ official: true, location_match: true });
  });

  test("AAI Rejuvenation resolves aaiclinics.com through agent-first web search", async () => {
    const searchText = vi.fn();
    const getDetails = vi.fn();
    const webSearch = vi.fn(async () => ({
      results: [
        {
          url: "https://www.aaiclinics.com/",
          title: "AAI Rejuvenation Clinic | Fort Lauderdale",
          snippet: "Visit AAI Clinics in Fort Lauderdale, Florida for age-management care.",
        },
      ],
    }));

    const result = await discoverWebsiteForLocation({
      location: AAI,
      externalPlaceMatches: [],
      runId: 62,
    }, { placesClient: { searchText, getDetails }, webSearch });

    expect(searchText).not.toHaveBeenCalled();
    expect(getDetails).not.toHaveBeenCalled();

    expect(webSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: "AAI Rejuvenation Fort Lauderdale",
      runId: 62,
      entityId: 9390,
    }));
    expect(result).toMatchObject({
      location_id: 9390,
      outcome: "official_website_found",
      source: "web_search",
      would_write_website: "https://www.aaiclinics.com/",
      write_attempted: false,
      database_mutated: false,
      validation: {
        official: true,
        domain: "aaiclinics.com",
        domain_name_match: true,
        location_match: true,
      },
    });
    expect(result.attempts[0]).toMatchObject({ source: "web_search", outcome: "accepted" });
  });

  test("uses ID-only Places text search and details after agent search fails", async () => {
    const searchText = vi.fn(async () => ({
      data: { places: [{ id: "searched-place-id" }] },
      externalCallId: 703,
    }));
    const getDetails = vi.fn(async () => ({
      data: {
        displayName: { text: "Beacon Diagnostics" },
        formattedAddress: "80 Summer Street, Boston, MA 02110",
        websiteUri: "https://beacondiagnostics.example/",
      },
      externalCallId: 704,
    }));
    const webSearch = vi.fn(async () => ({ results: [] }));

    const result = await discoverWebsiteForLocation({
      location: {
        id: 49,
        name: "Beacon Diagnostics",
        address: "80 Summer Street",
        locality: "Boston",
        region: "MA",
        postal_code: "02110",
        country_code: "US",
      },
      runId: 66,
    }, { placesClient: { searchText, getDetails }, webSearch });

    expect(searchText).toHaveBeenCalledWith({
      runId: 66,
      taskType: "contact_fill",
      entityId: 49,
      textQuery: "Beacon Diagnostics, 80 Summer Street, Boston, MA, 02110, US",
      regionCode: "US",
      maxResultCount: 1,
      maxAttempts: 1,
    });
    expect(getDetails).toHaveBeenCalledWith({
      runId: 66,
      taskType: "contact_fill",
      entityId: 49,
      placeId: "searched-place-id",
      maxAttempts: 1,
    });
    expect(webSearch).toHaveBeenCalledWith(expect.objectContaining({
      query: "Beacon Diagnostics Boston",
    }));
    expect(webSearch.mock.invocationCallOrder[0]).toBeLessThan(searchText.mock.invocationCallOrder[0]);
    expect(searchText.mock.invocationCallOrder[0]).toBeLessThan(getDetails.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({
      source: "google_places",
      provider: "google_places",
      provider_place_id: "searched-place-id",
      would_write_website: "https://beacondiagnostics.example/",
    });
    expect(result.attempts[0]).toMatchObject({
      source: "web_search",
      outcome: "no_results",
    });
    expect(result.attempts[1]).toMatchObject({
      source: "google_places_search",
      outcome: "place_id_found",
      provider_place_id: "searched-place-id",
    });
    expect(result.attempts[2]).toMatchObject({
      source: "google_places",
      provider_id_source: "text_search",
      outcome: "accepted",
    });
  });

  test("falls back to agent search after stored-ID details returns an unvalidated website", async () => {
    const getDetails = vi.fn(async () => ({
      data: {
        displayName: { text: "Unrelated Supply Company" },
        formattedAddress: "Chicago, IL",
        websiteUri: "https://unrelated.example/",
      },
    }));
    const webSearch = vi.fn(async () => [
      {
        link: "https://northstarrecovery.example/",
        name: "Northstar Recovery - Denver",
        description: "Northstar Recovery studio in Denver, Colorado.",
      },
    ]);

    const result = await discoverWebsiteForLocation({
      location: { id: 45, name: "Northstar Recovery", locality: "Denver", region: "CO" },
      externalPlaceMatches: [{ provider: "google", provider_place_id: "stale-place" }],
      runId: 63,
    }, { placesClient: { getDetails }, webSearch });

    expect(result.source).toBe("web_search");
    expect(result.would_write_website).toBe("https://northstarrecovery.example/");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toMatchObject({
      source: "google_places",
      outcome: "domain_name_mismatch",
    });
    expect(result.attempts[1]).toMatchObject({ source: "web_search", outcome: "accepted" });
  });

  test("rejects directory domains and candidates without locality or address evidence", () => {
    expect(validateOfficialWebsiteCandidate({
      location: { id: 46, name: "Solace Longevity", locality: "Austin" },
      candidate: {
        url: "https://www.yelp.com/biz/solace-longevity-austin",
        title: "Solace Longevity",
        snippet: "Austin, Texas",
      },
    })).toMatchObject({ official: false, reason: "generic_or_directory_domain" });

    expect(validateOfficialWebsiteCandidate({
      location: { id: 46, name: "Solace Longevity", locality: "Austin" },
      candidate: {
        url: "https://solacelongevity.example/",
        title: "Solace Longevity",
        snippet: "Personalized care in Portland, Oregon.",
      },
    })).toMatchObject({
      official: false,
      reason: "locality_or_address_evidence_mismatch",
      domain_name_match: true,
      location_match: false,
    });

    expect(validateOfficialWebsiteCandidate({
      location: { id: 46, name: "Solace Longevity", locality: "Austin" },
      candidate: {
        url: "https://unrelated.example/",
        title: "Solace Longevity",
        snippet: "Solace Longevity in Austin, Texas.",
      },
    })).toMatchObject({
      official: false,
      reason: "domain_name_mismatch",
      evidence_name_match: true,
      location_match: true,
    });
  });

  test("does not call discovery providers when a website is already stored", async () => {
    const getDetails = vi.fn();
    const webSearch = vi.fn();
    const result = await discoverWebsiteForLocation({
      location: {
        id: 47,
        name: "Existing Clinic",
        locality: "Boston",
        website: "https://existing.example/",
      },
      externalPlaceMatches: [{ provider: "google", provider_place_id: "place-existing" }],
      runId: 64,
    }, { placesClient: { getDetails }, webSearch });

    expect(result).toMatchObject({
      outcome: "stored_website_present",
      would_write_website: null,
      write_attempted: false,
      database_mutated: false,
    });
    expect(getDetails).not.toHaveBeenCalled();
    expect(webSearch).not.toHaveBeenCalled();
  });

  test("treats an unparseable non-empty stored website as protected from overwrite", async () => {
    const getDetails = vi.fn();
    const webSearch = vi.fn();
    const result = await discoverWebsiteForLocation({
      location: {
        id: 48,
        name: "Legacy Clinic",
        locality: "Boston",
        website: "legacy-clinic.example",
      },
      externalPlaceMatches: [{ provider: "google", provider_place_id: "place-legacy" }],
      runId: 65,
    }, { placesClient: { getDetails }, webSearch });

    expect(result.outcome).toBe("stored_website_present");
    expect(getDetails).not.toHaveBeenCalled();
    expect(webSearch).not.toHaveBeenCalled();
  });

  test("selects provider ids deterministically and constructs a bounded official-site query", () => {
    expect(selectGooglePlaceMatch([
      { provider: "bing", provider_place_id: "ignore" },
      { provider: "google", provider_place_id: "legacy-google" },
      { provider: "google_places", provider_place_id: "preferred-google" },
    ])).toMatchObject({
      provider: "google_places",
      providerPlaceId: "preferred-google",
    });
    expect(buildOfficialWebsiteSearchQuery(AAI)).toBe(
      "AAI Rejuvenation Fort Lauderdale",
    );
    expect(buildPlacesTextQuery(AAI)).toBe(
      "AAI Rejuvenation, Fort Lauderdale, FL, US",
    );
  });
});
