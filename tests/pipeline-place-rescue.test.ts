import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import {
  buildRescueJobs,
  normalizeRescueProposal,
  parsePlaceRescueContent,
  rescueHeldPlaces,
} from "../pipeline/lib/place-rescue.mjs";

function heldCandidate(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id: String(id),
    campaign: "test_campaign",
    name: `Restore Hyper Wellness ${id}`,
    website: "https://www.restore.com/locations/test",
    address: null,
    locality: "Austin",
    region: "TX",
    postal_code: null,
    country_code: "US",
    matched_treatments: ["IV therapy"],
    evidence_urls: ["https://www.restore.com/locations/test"],
    discovered_markets: ["Austin"],
    discovered_groups: ["iv"],
    official_site_verification: null,
    address_verified: false,
    treatment_verified: false,
    match_result: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

describe("held place rescue", () => {
  test("groups official-domain candidates and chunks large groups", () => {
    const candidates = Array.from({ length: 11 }, (_, index) => heldCandidate(index + 1));
    const jobs = buildRescueJobs(candidates, { batchSize: 5 });
    expect(jobs).toHaveLength(3);
    expect(jobs.map((job: { candidates: unknown[] }) => job.candidates.length).sort())
      .toEqual([1, 5, 5]);
  });

  test("parses strict JSON and rejects unknown source IDs and directories", () => {
    expect(parsePlaceRescueContent('{"places":[],"unresolved":[]}')).toEqual({
      places: [],
      unresolved: [],
    });
    const job = buildRescueJobs([heldCandidate(1)], { batchSize: 10 })[0];
    const base = {
      source_candidate_ids: [999],
      name: "Restore Hyper Wellness 1",
      website: "https://www.restore.com/locations/test",
      address: "100 Main Street",
      locality: "Austin",
      region: "TX",
      postal_code: "78701",
      country_code: "US",
      evidence_urls: ["https://www.restore.com/locations/test"],
      offerings: [],
      physical_location: true,
    };
    expect(normalizeRescueProposal(base, job, [{
      url: "https://www.restore.com/locations/test",
    }])).toBeNull();
    expect(normalizeRescueProposal({
      ...base,
      source_candidate_ids: [1],
      website: "https://www.healthgrades.com/provider/example",
      evidence_urls: ["https://www.healthgrades.com/provider/example"],
    }, job, [{ url: "https://www.healthgrades.com/provider/example" }])).toBeNull();
  });

  test("accepts a cited official repair tied to the supplied identity", () => {
    const job = buildRescueJobs([heldCandidate(1)], { batchSize: 10 })[0];
    const candidate = normalizeRescueProposal({
      source_candidate_ids: [1],
      name: "Restore Hyper Wellness 1",
      website: "https://locations.restore.com/test",
      address: "100 Main Street",
      locality: "Austin",
      region: "TX",
      postal_code: "78701",
      country_code: "US",
      evidence_urls: ["https://locations.restore.com/test"],
      offerings: [{
        name: "IV Therapy",
        price_amount: null,
        price_currency: null,
        price_text: null,
        source_url: "https://locations.restore.com/test",
      }],
      physical_location: true,
    }, job, [{ url: "https://locations.restore.com/test" }]);
    expect(candidate).toMatchObject({
      status: "discovered",
      address: "100 Main Street",
      country_code: "US",
      matched_treatments: ["IV therapy"],
    });
  });

  test("dry-run plans jobs without making agent calls or writes", async () => {
    const webSearch = vi.fn();
    const query = vi.fn(async () => ({ rows: [heldCandidate(1), heldCandidate(2)] }));
    const result = await rescueHeldPlaces({
      campaign: "test_campaign",
      runId: 7,
      apply: false,
      concurrency: 48,
      batchSize: 10,
    }, { query, webSearch });
    expect(result).toMatchObject({ candidates: 2, planned_queries: 1 });
    expect(webSearch).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
