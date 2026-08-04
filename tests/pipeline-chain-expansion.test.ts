import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import { expandDiscoveredChains } from "../pipeline/lib/chain-expansion.mjs";

describe("chain expansion", () => {
  test("plans four US and one Canadian region agent per evidenced chain", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          ordinal: "0",
          chain_name: "Example Health",
          chain_locations_url: "https://example.test/locations",
          treatments: ["NAD+ IV therapy", "Sauna"],
          discovered_branches: 2,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await expandDiscoveredChains({
      campaign: "test",
      runId: 95,
      apply: false,
    }, { query });
    expect(result).toMatchObject({
      chains: 1,
      planned_queries: 5,
      regions_per_chain: 5,
    });
    expect(result.sample).toHaveLength(5);
    expect(result.sample[0]).toMatchObject({
      chain_name: "Example Health",
      treatments: ["NAD+ IV therapy", "Sauna"],
    });
    expect(result.sample.at(-1)).toMatchObject({ region: "canada" });
  });

  test("plans global regions for an international campaign", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          ordinal: "0",
          chain_name: "Global Health",
          chain_locations_url: "https://global.example/locations",
          treatments: ["Sauna"],
          discovered_branches: 2,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await expandDiscoveredChains({
      campaign: "international_metro_test",
      runId: 96,
      apply: false,
    }, { query });
    expect(result).toMatchObject({
      chains: 1,
      planned_queries: 6,
      regions_per_chain: 6,
    });
    expect(result.sample.map((item) => item.region)).toEqual([
      "north_america",
      "europe",
      "middle_east",
      "asia_pacific",
      "latin_america",
      "africa",
    ]);
  });
});
