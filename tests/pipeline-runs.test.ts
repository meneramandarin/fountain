import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { createRun, finalizeRun, getRunSpend, isBudgetExhausted, withRun } from "../pipeline/lib/runs.mjs";

describe("pipeline run lifecycle", () => {
  test("creates dry-run rows with structured arguments", async () => {
    const query = vi.fn(async (_sql: string, params: unknown[]) => ({
      rows: [{ id: "4", command: params[0], args: JSON.parse(String(params[1])), dry_run: params[2] }],
    }));

    await expect(createRun({
      command: "enqueue",
      args: { task: "noop" },
      dryRun: true,
    }, { query })).resolves.toMatchObject({
      id: "4",
      command: "enqueue",
      args: { task: "noop" },
      dry_run: true,
    });
  });

  test("finalization refreshes spend from the immutable external-call ledger", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("sum(ec.cost_estimate_usd)");
      expect(params).toEqual(["4", "budget_exhausted", JSON.stringify({ done: 1 }), "cap reached"]);
      return { rows: [{ id: "4", status: "budget_exhausted", spent_usd_estimate: "0.001" }] };
    });

    await expect(finalizeRun("4", {
      status: "budget_exhausted",
      counts: { done: 1 },
      notes: "cap reached",
    }, { query })).resolves.toMatchObject({ status: "budget_exhausted" });
  });

  test("budget comparison uses greater-than-or-equal", async () => {
    const query = vi.fn(async () => ({ rows: [{ spend: "0.0002" }] }));

    await expect(getRunSpend("9", { query })).resolves.toBe(0.0002);
    await expect(isBudgetExhausted("9", 0.0002, { query })).resolves.toEqual({
      exhausted: true,
      spendUsd: 0.0002,
    });
  });

  test("withRun finalizes thrown errors and preserves the run id", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("INSERT INTO fountain_ops.runs")) {
        return { rows: [{ id: "15", status: "running", dry_run: true }] };
      }
      if (sql.includes("UPDATE fountain_ops.runs")) {
        expect(params[1]).toBe("failed");
        expect(String(params[3])).toContain("operation exploded");
        return { rows: [{ id: "15", status: "failed" }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const close = vi.fn(async () => {});

    const promise = withRun({ command: "drain", dryRun: true }, async () => {
      throw new Error("operation exploded");
    }, { query, close });

    await expect(promise).rejects.toMatchObject({ message: "operation exploded", runId: "15" });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
