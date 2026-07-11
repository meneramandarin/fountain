import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { handleLlmSmoke } from "../pipeline/tasks/llm_smoke.mjs";

describe("Gate B LLM smoke task", () => {
  test("a recorded smoke call blocks all later network attempts", async () => {
    const complete = vi.fn();
    const createClient = vi.fn(() => ({ complete }));
    const transact = fakeTransaction([{ rows: [] }, {
      rows: [{ id: "1", run_id: "7", status: "ok", tokens: { total_tokens: 12 }, cost_estimate_usd: "0.00000225" }],
    }]);

    await expect(handleLlmSmoke({
      task: { entity_id: 1994 },
      run: { id: "11" },
      createClient,
      transact,
    })).resolves.toMatchObject({
      ok: true,
      skipped: true,
      reason: "gate_b_smoke_already_recorded",
      external_call_id: "1",
    });

    expect(createClient).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  test("uses one non-retrying request and requires positive usage", async () => {
    const complete = vi.fn(async () => ({
      model: "openai/gpt-4o-mini",
      usage: { prompt_tokens: 11, completion_tokens: 1, total_tokens: 12 },
      costEstimateUsd: 0.00000225,
    }));
    const createClient = vi.fn(() => ({ complete }));
    const transact = fakeTransaction([{ rows: [] }, { rows: [] }]);

    await expect(handleLlmSmoke({
      task: { entity_id: 997 },
      run: { id: "7" },
      createClient,
      transact,
    })).resolves.toMatchObject({ ok: true, cost_estimate_usd: 0.00000225 });

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ maxAttempts: 1, maxTokens: 1 }));
  });

  test("rejects a nominal success without positive token usage", async () => {
    const createClient = vi.fn(() => ({
      complete: vi.fn(async () => ({
        model: "openai/gpt-4o-mini",
        usage: { total_tokens: 0 },
        costEstimateUsd: 0,
      })),
    }));

    await expect(handleLlmSmoke({
      task: { entity_id: 997 },
      run: { id: "7" },
      createClient,
      transact: fakeTransaction([{ rows: [] }, { rows: [] }]),
    })).rejects.toThrow("returned no positive token usage");
  });
});

function fakeTransaction(results: Array<{ rows: unknown[] }>) {
  return async (operation: (tx: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
    const query = vi.fn(async () => results.shift() || { rows: [] });
    return operation({ query });
  };
}
