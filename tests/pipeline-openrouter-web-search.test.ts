import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import * as websiteDiscovery from "../pipeline/lib/website-discovery.mjs";
// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import * as openRouterWebSearch from "../pipeline/lib/openrouter-web-search.mjs";

const { discoverWebsiteForLocation } = websiteDiscovery;
const { createOpenRouterAgentWebSearch, extractUrlCitationResults } = openRouterWebSearch;

type QueryCall = {
  text: string;
  values: unknown[];
};

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("OpenRouter agent website search", () => {
  test("uses the bounded Exa server tool and meters model plus search-request cost", async () => {
    const queryCalls: QueryCall[] = [];
    const query = vi.fn(async (text: string, values: unknown[] = []) => {
      queryCalls.push({ text, values });
      return { rows: [{ id: 801 }] };
    });
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({
      model: "openai/gpt-4o-mini",
      choices: [{
        message: {
          role: "assistant",
          content: "The first result is the official clinic site.",
          annotations: [
            {
              type: "url_citation",
              url_citation: {
                url: "https://www.aaiclinics.com/",
                title: "AAI Rejuvenation Clinic | Fort Lauderdale",
                content: "AAI Clinics in Fort Lauderdale provides age-management care.",
              },
            },
          ],
        },
      }],
      usage: {
        input_tokens: 1_000,
        output_tokens: 100,
        total_tokens: 1_100,
        server_tool_use: { web_search_requests: 2 },
      },
    }));
    const webSearch = createOpenRouterAgentWebSearch({
      apiKey: "test-key",
      fetchImpl,
      query,
      defaultMaxAttempts: 1,
    });

    const result = await webSearch({
      query: "\"AAI Rejuvenation\" Fort Lauderdale, FL official website",
      runId: "71",
      entityId: 9390,
      location: { name: "AAI Rejuvenation", locality: "Fort Lauderdale", region: "FL" },
    });

    const [url, request] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(request?.body));
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body).toMatchObject({
      model: "openai/gpt-4o-mini",
      tools: [{
        type: "openrouter:web_search",
        parameters: {
          engine: "exa",
          max_results: 3,
          max_total_results: 3,
          max_characters: 2_000,
        },
      }],
      max_tokens: 350,
      usage: { include: true },
    });
    expect(result).toMatchObject({
      externalCallId: 801,
      webSearchRequests: 2,
      modelCostUsd: 0.00021,
      webSearchCostUsd: 0.01,
      costEstimateUsd: 0.01021,
      results: [{
        url: "https://www.aaiclinics.com/",
        title: "AAI Rejuvenation Clinic | Fort Lauderdale",
      }],
      usage: {
        prompt_tokens: 1_000,
        completion_tokens: 100,
        total_tokens: 1_100,
        web_search_requests: 2,
        web_search_results: 1,
      },
    });

    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0].text).toContain("INSERT INTO fountain_ops.external_calls");
    expect(queryCalls[0].values).toMatchObject({
      0: "71",
      1: "website_discovery_web_search",
      2: 9390,
      3: "openai/gpt-4o-mini",
      5: "ok",
      6: 200,
      8: result.costEstimateUsd,
    });
    expect(String(queryCalls[0].values[4])).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.parse(String(queryCalls[0].values[7]))).toEqual(result.usage);
  });

  test("is directly usable as website-discovery's web-search fallback", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: 802 }] }));
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({
      choices: [{
        message: {
          content: "Official site found.",
          annotations: [{
            type: "url_citation",
            url_citation: {
              url: "https://www.aaiclinics.com/",
              title: "AAI Rejuvenation Clinic | Fort Lauderdale",
              content: "AAI Clinics serves patients in Fort Lauderdale, Florida.",
            },
          }],
        },
      }],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 30,
        total_tokens: 230,
        server_tool_use: { web_search_requests: 1 },
      },
    }));
    const webSearch = createOpenRouterAgentWebSearch({
      apiKey: "test-key",
      fetchImpl,
      query,
      defaultMaxAttempts: 1,
    });

    const result = await discoverWebsiteForLocation({
      location: {
        id: 9390,
        name: "AAI Rejuvenation",
        locality: "Fort Lauderdale",
        region: "FL",
        country_code: "US",
      },
      runId: 72,
    }, { webSearch });

    expect(result).toMatchObject({
      outcome: "official_website_found",
      source: "web_search",
      would_write_website: "https://www.aaiclinics.com/",
      validation: {
        official: true,
        domain: "aaiclinics.com",
        location_match: true,
      },
    });
  });

  test("logs a terminal provider failure and does not invent search cost", async () => {
    const queryCalls: QueryCall[] = [];
    const query = vi.fn(async (text: string, values: unknown[] = []) => {
      queryCalls.push({ text, values });
      return { rows: [{ id: 803 }] };
    });
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(
      { error: { message: "tool unavailable" } },
      { status: 503 },
    ));
    const sleep = vi.fn(async () => {});
    const webSearch = createOpenRouterAgentWebSearch({
      apiKey: "test-key",
      fetchImpl,
      query,
      sleep,
      defaultMaxAttempts: 1,
    });

    await expect(webSearch({ query: "official site", runId: 73 }))
      .rejects.toMatchObject({ name: "OpenRouterWebSearchError", status: 503, attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(queryCalls[0].values[5]).toBe("error");
    expect(queryCalls[0].values[8]).toBe(0);
  });

  test("deduplicates and bounds URL citation annotations", () => {
    expect(extractUrlCitationResults({
      choices: [{ message: { annotations: [
        { url_citation: { url: "https://example.com", title: "First" } },
        { url_citation: { url: "https://example.com/", title: "Duplicate" } },
        { url_citation: { url: "javascript:alert(1)", title: "Invalid" } },
        { url_citation: { url: "https://second.example", title: "Second" } },
      ] } }],
    }, 2)).toEqual([
      { url: "https://example.com/", title: "First", snippet: null },
      { url: "https://second.example/", title: "Second", snippet: null },
    ]);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
