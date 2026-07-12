import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import { estimateModelCostUsd, resolveModel } from "../pipeline/config/models.mjs";
// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import { createLlmClient } from "../pipeline/lib/llm.mjs";

type QueryCall = {
  text: string;
  values: unknown[];
};

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("pipeline OpenRouter client", () => {
  test("accepts a pg bigint run-id string, computes token cost, and logs success", async () => {
    const queryCalls: QueryCall[] = [];
    const query = vi.fn(async (text: string, values: unknown[] = []) => {
      queryCalls.push({ text, values });
      return { rows: [{ id: 91 }] };
    });
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({
      id: "generation-1",
      model: "openai/gpt-4o-mini",
      choices: [{ message: { role: "assistant", content: "ok" } }],
      usage: {
        prompt_tokens: 1_000,
        completion_tokens: 500,
        total_tokens: 1_500,
      },
    }));
    const client = createLlmClient({ apiKey: "test-key", fetchImpl, query });

    const result = await client.complete({
      runId: "12",
      entityId: 34,
      messages: [{ role: "user", content: "Reply with ok." }],
      maxAttempts: 1,
      maxTokens: 2,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0]!;
    const headers = request?.headers as Record<string, string>;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(request?.redirect).toBe("error");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: "openai/gpt-4o-mini",
      max_tokens: 2,
      usage: { include: true },
    });
    expect(result).toMatchObject({
      content: "ok",
      externalCallId: 91,
      attempts: 1,
      usage: {
        prompt_tokens: 1_000,
        completion_tokens: 500,
        total_tokens: 1_500,
      },
    });
    expect(result.costEstimateUsd).toBeCloseTo(0.00045, 10);

    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0].text).toContain("INSERT INTO fountain_ops.external_calls");
    expect(queryCalls[0].values).toMatchObject({
      0: "12",
      1: "openrouter",
      2: "chat_completion",
      3: 34,
      4: "openai/gpt-4o-mini",
      6: "ok",
      7: 200,
      9: result.costEstimateUsd,
    });
    expect(String(queryCalls[0].values[5])).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(String(queryCalls[0].values[8]))).toEqual(result.usage);
  });

  test("maxAttempts=1 makes one HTTP attempt and records the terminal failure", async () => {
    const queryCalls: QueryCall[] = [];
    const query = vi.fn(async (text: string, values: unknown[] = []) => {
      queryCalls.push({ text, values });
      return { rows: [{ id: 92 }] };
    });
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(
      { error: { message: "upstream unavailable" } },
      { status: 503 },
    ));
    const sleep = vi.fn(async () => {});
    const client = createLlmClient({ apiKey: "test-key", fetchImpl, query, sleep });

    await expect(client.complete({
      runId: 13,
      messages: [{ role: "user", content: "ok?" }],
      maxAttempts: 1,
    })).rejects.toMatchObject({
      name: "OpenRouterError",
      status: 503,
      attempts: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0].values[6]).toBe("error");
    expect(queryCalls[0].values[7]).toBe(503);
    expect(queryCalls[0].values[9]).toBe(0);
  });

  test("retries mocked 429/5xx responses and writes one logical-call ledger row", async () => {
    const responses = [
      jsonResponse({ error: { message: "rate limited" } }, { status: 429, headers: { "retry-after": "0" } }),
      jsonResponse({ error: { message: "bad gateway" } }, { status: 502 }),
      jsonResponse({
        choices: [{ message: { content: "done" } }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      }),
    ];
    const fetchImpl = vi.fn<FetchImpl>(async () => responses.shift() as Response);
    const query = vi.fn(async () => ({ rows: [{ id: 93 }] }));
    const sleep = vi.fn(async () => {});
    const client = createLlmClient({ apiKey: "test-key", fetchImpl, query, sleep });

    const result = await client.complete({
      runId: 14,
      messages: [{ role: "user", content: "finish" }],
      maxAttempts: 3,
    });

    expect(result.attempts).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
  });

  test("fingerprints reasoning config and records reasoning tokens without double-counting cost", async () => {
    const queryCalls: QueryCall[] = [];
    const query = vi.fn(async (text: string, values: unknown[] = []) => {
      queryCalls.push({ text, values });
      return { rows: [{ id: 94 + queryCalls.length }] };
    });
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({
      model: "google/gemini-3.5-flash",
      choices: [{ message: { role: "assistant", content: "classified" } }],
      usage: {
        prompt_tokens: 2_000,
        completion_tokens: 400,
        total_tokens: 2_400,
        completion_tokens_details: { reasoning_tokens: 300 },
      },
    }));
    const client = createLlmClient({ apiKey: "test-key", fetchImpl, query });

    const medium = await client.complete({
      runId: 16,
      tier: "escalation",
      messages: [{ role: "user", content: "Classify this organization." }],
      reasoning: { effort: "medium", exclude: true },
      maxAttempts: 1,
    });
    await client.complete({
      runId: 16,
      tier: "escalation",
      messages: [{ role: "user", content: "Classify this organization." }],
      reasoning: { effort: "low", exclude: true },
      maxAttempts: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body))).toMatchObject({
      model: "google/gemini-3.5-flash",
      reasoning: { effort: "medium", exclude: true },
    });
    expect(medium.usage).toEqual({
      prompt_tokens: 2_000,
      completion_tokens: 400,
      total_tokens: 2_400,
      reasoning_tokens: 300,
    });
    expect(medium.costEstimateUsd).toBeCloseTo(0.0066, 10);
    expect(JSON.parse(String(queryCalls[0].values[8]))).toEqual(medium.usage);
    expect(queryCalls[0].values[5]).not.toBe(queryCalls[1].values[5]);
  });

  test("rejects a non-object reasoning configuration before fetch", async () => {
    const fetchImpl = vi.fn();
    const query = vi.fn();
    const client = createLlmClient({ apiKey: "test-key", fetchImpl, query });

    await expect(client.complete({
      runId: 17,
      messages: [{ role: "user", content: "Do not send." }],
      reasoning: [],
    })).rejects.toThrow(/plain JSON object/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  test("prices the configured escalation tier and rejects unpriced models before fetch", async () => {
    expect(resolveModel("escalation")).toBe("google/gemini-3.5-flash");
    expect(estimateModelCostUsd("google/gemini-3.5-flash", {
      prompt_tokens: 1_000,
      completion_tokens: 500,
    })).toBeCloseTo(0.006, 10);
    expect(estimateModelCostUsd("openai/gpt-4o-mini", {
      prompt_tokens: 1_000,
      completion_tokens: 500,
    })).toBeCloseTo(0.00045, 10);

    const fetchImpl = vi.fn();
    const query = vi.fn();
    const client = createLlmClient({ apiKey: "test-key", fetchImpl, query });
    await expect(client.complete({
      runId: 15,
      model: "vendor/unpriced-model",
      messages: [{ role: "user", content: "do not send" }],
    })).rejects.toThrow(/No per-token price/);
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
