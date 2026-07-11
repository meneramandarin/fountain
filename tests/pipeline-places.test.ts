import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import { getPlacesFieldMask } from "../pipeline/config/providers.mjs";
// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import { createPlacesClient } from "../pipeline/lib/places.mjs";

type QueryCall = {
  text: string;
  values: unknown[];
};

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("pipeline Google Places client", () => {
  test("blocks before fetch or ledger access unless PLACES_LIVE=1", async () => {
    const fetchImpl = vi.fn();
    const query = vi.fn();
    const client = createPlacesClient({
      apiKey: "test-key",
      env: {},
      fetchImpl,
      query,
    });

    await expect(client.getDetails({
      runId: 21,
      taskType: "contact_fill",
      entityId: 44,
      placeId: "place-1",
      maxAttempts: 1,
    })).rejects.toThrow(/PLACES_LIVE=1/);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test("accepts a pg bigint run-id string, uses the task mask, and logs cost", async () => {
    const queryCalls: QueryCall[] = [];
    const query = vi.fn(async (text: string, values: unknown[] = []) => {
      queryCalls.push({ text, values });
      return { rows: [{ id: 101 }] };
    });
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({
      id: "place-1",
      displayName: { text: "Example Clinic" },
      websiteUri: "https://example.test",
    }));
    const client = createPlacesClient({
      apiKey: "test-key",
      env: { PLACES_LIVE: "1" },
      fetchImpl,
      query,
    });

    const result = await client.getDetails({
      runId: "22",
      taskType: "contact_fill",
      entityId: 45,
      placeId: "place/with slash",
      languageCode: "en",
      maxAttempts: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0]!;
    const headers = request?.headers as Record<string, string>;
    expect(url).toBe("https://places.googleapis.com/v1/places/place%2Fwith%20slash?languageCode=en");
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toBe(getPlacesFieldMask("contact_fill", "details"));
    expect(result).toMatchObject({
      externalCallId: 101,
      costEstimateUsd: 0.02,
      attempts: 1,
      httpStatus: 200,
      data: { id: "place-1" },
    });

    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0].text).toContain("INSERT INTO fountain_ops.external_calls");
    expect(queryCalls[0].values).toMatchObject({
      0: "22",
      1: "place_details",
      2: 45,
      4: "ok",
      5: 200,
      6: 0.02,
    });
    expect(String(queryCalls[0].values[3])).toMatch(/^[a-f0-9]{64}$/);
  });

  test("uses an ID-only per-task mask for text search", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: 102 }] }));
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({ places: [{ id: "place-2" }] }));
    const client = createPlacesClient({
      apiKey: "test-key",
      env: { PLACES_LIVE: "1" },
      fetchImpl,
      query,
    });

    const result = await client.searchText({
      runId: 23,
      taskType: "geocode",
      entityId: 46,
      textQuery: "Example Clinic, Seattle",
      maxResultCount: 1,
      maxAttempts: 1,
    });

    const [, request] = fetchImpl.mock.calls[0]!;
    const headers = request?.headers as Record<string, string>;
    expect(headers["X-Goog-FieldMask"]).toBe("places.id");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      textQuery: "Example Clinic, Seattle",
      maxResultCount: 1,
    });
    expect(result.costEstimateUsd).toBe(0);
  });

  test("logs terminal provider failures and does not retry with maxAttempts=1", async () => {
    const queryCalls: QueryCall[] = [];
    const query = vi.fn(async (text: string, values: unknown[] = []) => {
      queryCalls.push({ text, values });
      return { rows: [{ id: 103 }] };
    });
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(
      { error: { message: "invalid place" } },
      { status: 400 },
    ));
    const sleep = vi.fn(async () => {});
    const client = createPlacesClient({
      apiKey: "test-key",
      env: { PLACES_LIVE: "1" },
      fetchImpl,
      query,
      sleep,
    });

    await expect(client.getDetails({
      runId: 24,
      taskType: "contact_fill",
      placeId: "bad-place",
      maxAttempts: 1,
    })).rejects.toMatchObject({
      name: "PlacesError",
      status: 400,
      attempts: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0].values[4]).toBe("error");
    expect(queryCalls[0].values[5]).toBe(400);
    expect(queryCalls[0].values[6]).toBe(0);
  });

  test("requires explicit pricing for deferred review details before fetch", async () => {
    const fetchImpl = vi.fn();
    const query = vi.fn();
    const client = createPlacesClient({
      apiKey: "test-key",
      env: { PLACES_LIVE: "1" },
      fetchImpl,
      query,
    });

    await expect(client.getDetails({
      runId: 25,
      taskType: "reviews_fetch",
      placeId: "place-3",
    })).rejects.toThrow(/No approved Google Places cost estimate/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
