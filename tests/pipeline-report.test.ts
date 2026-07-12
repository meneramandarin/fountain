import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { loadRunReport, renderRunReport, summarizeExternalCalls, writeRunReport } from "../pipeline/lib/report.mjs";

const run = {
  id: "42",
  command: "drain",
  args: { concurrency: 1, task: "llm_smoke" },
  started_at: "2026-07-11T20:00:00.000Z",
  finished_at: "2026-07-11T20:00:01.500Z",
  status: "budget_exhausted",
  counts: { claimed: 1, done: 1 },
  budget_usd: "0.0005",
  spent_usd_estimate: "0.0013",
  notes: "bounded | overshoot",
  dry_run: false,
};

const externalCalls = [
  {
    id: "100",
    run_id: "42",
    provider: "openrouter",
    call_type: "chat.completions",
    status: "succeeded",
    http_status: 200,
    model: "openai/gpt-4o-mini",
    tokens: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    cost_estimate_usd: "0.0012",
    created_at: "2026-07-11T20:00:01.000Z",
  },
  {
    id: "101",
    run_id: "42",
    provider: "openrouter",
    call_type: "chat.completions",
    status: "failed",
    http_status: 500,
    model: "openai/gpt-4o-mini",
    tokens: null,
    cost_estimate_usd: "0.0001",
    created_at: "2026-07-11T20:00:01.250Z",
  },
];

const changeEvents = [
  {
    entity_type: "locations",
    action: "update",
    reason: "contact_fill:website",
    count: 2,
  },
  {
    entity_type: "locations",
    action: "update",
    reason: "contact_fill:phone",
    count: 1,
  },
];

describe("pipeline run reports", () => {
  test("pure renderer includes task outcomes and external call totals", () => {
    const markdown = renderRunReport({
      run,
      externalCalls,
      taskSummary: { done: 1, pending: 1 },
      backlogSummary: { taskType: "llm_smoke", counts: { done: 1, pending: 1 } },
      changeEvents,
    });

    expect(markdown).toContain("# Pipeline Run 42");
    expect(markdown).toContain("| Status | budget_exhausted |");
    expect(markdown).toContain("| Notes | bounded \\| overshoot |");
    expect(markdown).toContain("| pending | 1 |");
    expect(markdown).toContain("| done | 1 |");
    expect(markdown).toContain("## Current `llm_smoke` backlog");
    expect(markdown).toContain("## Entity change events");
    expect(markdown).toContain("| locations | update | contact_fill:website | 2 |");
    expect(markdown).toContain("| **Total** |  |  | **3** |");
    expect(markdown).toContain("| Calls | 2 |");
    expect(markdown).toContain("| Input tokens | 10 |");
    expect(markdown).toContain("| Output tokens | 5 |");
    expect(markdown).toContain("| Total tokens | 15 |");
    expect(markdown).toContain("| Estimated cost | $0.0013 |");
    expect(markdown).toContain("| openrouter | 2 | $0.0013 |");
    expect(markdown).toContain('"concurrency": 1');
  });

  test("aggregates common OpenRouter token shapes and decimal-string costs", () => {
    const totals = summarizeExternalCalls([
      { provider: "openrouter", status: "ok", tokens: { input_tokens: 4, output_tokens: 3 }, cost_estimate_usd: "0.02" },
      { provider: "openrouter", status: "ok", tokens: { input: 2, output: 1, total: 3 }, cost_estimate_usd: "0.03" },
    ]);

    expect(totals).toMatchObject({
      calls: 2,
      inputTokens: 6,
      outputTokens: 4,
      totalTokens: 10,
      estimatedCostUsd: 0.05,
      byStatus: { ok: 2 },
    });
  });

  test("does not render a small positive budget as zero", () => {
    const markdown = renderRunReport({
      run: { ...run, budget_usd: "0.0000000001" },
      externalCalls: [],
      taskSummary: [],
    });

    expect(markdown).toContain("| Budget | $0.0000000001 |");
  });

  test("loads run, calls, and task status counts through an injected query", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("FROM fountain_ops.runs")) return { rows: [run] };
      if (sql.includes("FROM fountain_ops.external_calls")) return { rows: externalCalls };
      if (sql.includes("FROM fountain.entity_change_events")) {
        expect(params).toEqual(["42"]);
        return { rows: changeEvents };
      }
      if (sql.includes("WHERE run_id = $1")) {
        expect(params).toEqual(["42"]);
        return { rows: [{ status: "done", count: 1 }, { status: "pending", count: 1 }] };
      }
      if (sql.includes("WHERE task_type = $1")) {
        expect(params).toEqual(["llm_smoke"]);
        return { rows: [{ status: "done", count: 1 }, { status: "pending", count: 1 }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const markdown = await loadRunReport(42, { query });

    expect(query).toHaveBeenCalledTimes(5);
    expect(markdown).toContain("# Pipeline Run 42");
    expect(markdown).toContain("| done | 1 |");
    expect(markdown).toContain("| pending | 1 |");
    expect(markdown).toContain("## Current `llm_smoke` backlog");
    expect(markdown).toContain("| locations | update | contact_fill:phone | 1 |");
    expect(markdown).toContain("| Estimated cost | $0.0013 |");
  });

  test("accepts a pg-style query client and reports a missing run", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };

    await expect(loadRunReport("404", { query: client })).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
      message: "Pipeline run 404 was not found.",
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test("writes docs/runs/run-<id>.md only through the explicit helper", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fountain-pipeline-report-"));
    const outputDir = path.join(root, "docs", "runs");
    const markdown = renderRunReport({ run, externalCalls: [], taskSummary: [] });

    const reportPath = await writeRunReport("42", markdown, { outputDir });

    expect(reportPath).toBe(path.join(outputDir, "run-42.md"));
    await expect(readFile(reportPath, "utf8")).resolves.toBe(markdown);
  });

  test("rejects unsafe run ids before querying or writing", async () => {
    const query = vi.fn();
    await expect(loadRunReport("42/../../secrets", { query })).rejects.toThrow("Invalid pipeline run id");
    expect(query).not.toHaveBeenCalled();
  });
});
