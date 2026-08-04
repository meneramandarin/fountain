import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import * as discovery from "../pipeline/lib/place-discovery.mjs";

const {
  buildPlaceDiscoveryPrompt,
  normalizeDiscoveredPlace,
  parsePlaceDiscoveryContent,
  runPlaceDiscovery,
} = discovery;

describe("agent place discovery", () => {
  test("builds a bounded physical-place prompt", () => {
    const prompt = buildPlaceDiscoveryPrompt({
      market: "Berkeley",
      region: "California",
      treatments: ["IV therapy", "NAD+"],
    });
    expect(prompt).toContain("Berkeley, California");
    expect(prompt).toContain("IV therapy, NAD+");
    expect(prompt).toContain("One physical branch");
    expect(prompt).toContain("\"places\"");
  });

  test("parses fenced JSON and normalizes a cited official branch", () => {
    const [place] = parsePlaceDiscoveryContent(`\`\`\`json
      {"places":[{
        "name":"Example Longevity",
        "website":"https://example.com/berkeley",
        "address":"123 Main St, Berkeley, CA 94704",
        "locality":"Berkeley",
        "region":"CA",
        "postal_code":"94704",
        "country_code":"US",
        "email":"HELLO@EXAMPLE.COM",
        "matched_treatments":["NAD+ IV"],
        "offerings":[{
          "name":"NAD+ 500mg",
          "price_amount":499,
          "price_currency":"USD",
          "source_url":"https://example.com/berkeley/menu"
        }],
        "evidence_urls":["https://example.com/berkeley"],
        "physical_location":true
      }]}
    \`\`\``);
    const normalized = normalizeDiscoveredPlace(place, {
      market: "Berkeley",
      group: "infusion_and_peptides",
      citations: [{ url: "https://example.com/berkeley", title: "Example" }],
    });
    expect(normalized).toMatchObject({
      name: "Example Longevity",
      website: "https://example.com/berkeley",
      locality: "Berkeley",
      email: "hello@example.com",
      status: "discovered",
      corroborated: true,
      matched_treatments: ["NAD+ IV"],
      discovered_markets: ["Berkeley"],
      discovered_groups: ["infusion_and_peptides"],
      offerings: [{
        name: "NAD+ 500mg",
        price_amount: 499,
        price_currency: "USD",
      }],
    });
    expect(normalized.candidate_key).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("marks uncited or addressless results for review", () => {
    const normalized = normalizeDiscoveredPlace({
      name: "Maybe Clinic",
      website: "https://maybe.example",
      locality: "Palo Alto",
      region: "CA",
      physical_location: true,
    }, {
      market: "Palo Alto",
      group: "advanced_diagnostics",
      citations: [],
    });
    expect(normalized.status).toBe("needs_review");
    expect(normalized.corroborated).toBe(false);
  });

  test("accepts a cited Canadian branch and defaults Canadian currency", () => {
    const normalized = normalizeDiscoveredPlace({
      name: "Example Vancouver Clinic",
      website: "https://example.ca/vancouver",
      address: "123 Robson St, Vancouver, BC V6B 1A1",
      locality: "Vancouver",
      region: "British Columbia",
      country_code: "CA",
      matched_treatments: ["IV therapy"],
      offerings: [{
        name: "Vitamin IV",
        price_amount: 199,
        source_url: "https://example.ca/vancouver/menu",
      }],
      evidence_urls: ["https://example.ca/vancouver"],
      physical_location: true,
    }, {
      market: "Vancouver",
      group: "iv_and_vitamins",
      citations: [{ url: "https://example.ca/vancouver" }],
      allowedRegions: ["British Columbia"],
      allowedCountries: ["CA"],
      defaultRegion: "British Columbia",
      defaultCurrency: "CAD",
    });
    expect(normalized).toMatchObject({
      status: "discovered",
      region: "BC",
      country_code: "CA",
      offerings: [{ price_currency: "CAD" }],
    });
  });

  test("accepts a corroborated international address without a street number", () => {
    const normalized = normalizeDiscoveredPlace({
      name: "Example Dubai Clinic",
      website: "https://example.ae/dubai",
      address: "Business Bay, Dubai",
      locality: "Dubai",
      region: "Dubai",
      country_code: "UAE",
      matched_treatments: ["IV therapy"],
      evidence_urls: ["https://example.ae/dubai"],
      physical_location: true,
    }, {
      market: "Dubai",
      group: "iv_and_vitamins",
      citations: [{ url: "https://example.ae/dubai" }],
      allowedRegions: ["Dubai"],
      allowedCountries: ["AE"],
      defaultRegion: "Dubai",
      defaultCurrency: "AED",
    });
    expect(normalized).toMatchObject({
      status: "discovered",
      country_code: "AE",
      region: "DUBAI",
    });
  });

  test("runs multiple agents concurrently and stages normalized candidates", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const webSearch = vi.fn(async ({ location }) => ({
      content: JSON.stringify({
        places: [{
          name: `${location.locality} Clinic`,
          website: `https://${String(location.locality).toLowerCase().replaceAll(" ", "-")}.example`,
          address: `1 Main St, ${location.locality}, CA 90000`,
          locality: location.locality,
          region: "CA",
          country_code: "US",
          matched_treatments: ["Sauna"],
          evidence_urls: [`https://${String(location.locality).toLowerCase().replaceAll(" ", "-")}.example`],
          physical_location: true,
        }],
      }),
      results: [{
        url: `https://${String(location.locality).toLowerCase().replaceAll(" ", "-")}.example`,
      }],
      model: "openai/gpt-4o-mini",
      costEstimateUsd: 0.0051,
    }));
    const result = await runPlaceDiscovery({
      campaign: "test",
      queries: [
        { id: 1, market: "Berkeley", region: "California", country_code: "US", group: "sauna", treatments: ["Sauna"] },
        { id: 2, market: "Fremont", region: "California", country_code: "US", group: "sauna", treatments: ["Sauna"] },
      ],
      runId: 44,
      apply: true,
      concurrency: 2,
    }, { query, webSearch });
    expect(result).toMatchObject({
      planned_queries: 2,
      completed_queries: 2,
      failed_queries: 0,
      candidates_returned: 2,
      candidates_inserted_or_updated: 2,
      needs_review: 0,
    });
    expect(webSearch).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("agent_discovery_searches"))).toHaveLength(2);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("agent_discovery_candidates"))).toHaveLength(2);
  });
});
