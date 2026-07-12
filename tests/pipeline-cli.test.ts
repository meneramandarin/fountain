import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { drainTasks, parseCliArgs, validateCommandArgs } from "../pipeline/cli.mjs";

describe("pipeline CLI parsing", () => {
  test("defaults to dry-run by leaving apply false", () => {
    const parsed = parseCliArgs(["enqueue", "--task", "noop", "--where", "id > 0"]);

    expect(parsed).toMatchObject({
      command: "enqueue",
      task: "noop",
      where: "id > 0",
    });
    expect(parsed.apply).toBeUndefined();
  });

  test("supports equals syntax and camel-cases flags", () => {
    expect(parseCliArgs(["drain", "--task=noop", "--dry-run", "--entity-type=location"])).toMatchObject({
      command: "drain",
      task: "noop",
      dryRun: true,
      entityType: "location",
    });
  });

  test("rejects contradictory execution flags", () => {
    expect(() => parseCliArgs(["drain", "--apply", "--dry-run"])).toThrow(
      "--apply and --dry-run are mutually exclusive",
    );
  });

  test("rejects unknown, duplicate, and unexpected arguments before execution", () => {
    expect(() => validateCommandArgs(parseCliArgs(["drain", "--task", "noop", "--budegt", "1", "--apply"])))
      .toThrow("Unknown option for drain: --budegt");
    expect(() => parseCliArgs(["drain", "--task", "noop", "--task", "llm_smoke"]))
      .toThrow("--task may only be provided once");
    expect(() => validateCommandArgs(parseCliArgs(["report", "surprise", "--run", "7"])))
      .toThrow("report does not accept positional arguments");
  });

  test("validates maintenance subcommands and their scoped options", () => {
    expect(validateCommandArgs(parseCliArgs([
      "maintain",
      "regen-structure-doc",
      "--schema=fountain,fountain_raw",
      "--output",
      "docs/schema.md",
    ]))).toMatchObject({ positional: ["regen-structure-doc"] });
    expect(validateCommandArgs(parseCliArgs([
      "maintain",
      "refresh-city-index",
      "--schema",
      "fountain",
    ]))).toMatchObject({ positional: ["refresh-city-index"] });

    expect(() => validateCommandArgs(parseCliArgs(["maintain"])))
      .toThrow("maintain requires exactly one subcommand");
    expect(() => validateCommandArgs(parseCliArgs(["maintain", "unknown"])))
      .toThrow("Unknown maintain subcommand: unknown");
    expect(() => validateCommandArgs(parseCliArgs([
      "maintain",
      "refresh-city-index",
      "--output",
      "unused.md",
    ]))).toThrow("Unknown option for maintain refresh-city-index: --output");
  });

  test("budget exhaustion prevents a second claim without a dispatch cap", async () => {
    const claimTask = vi.fn()
      .mockResolvedValueOnce({ id: "1", entity_id: 997 })
      .mockResolvedValueOnce({ id: "2", entity_id: 1994 });
    const completeTask = vi.fn(async () => ({ status: "done" }));
    const isBudgetExhausted = vi.fn()
      .mockResolvedValueOnce({ exhausted: false, spendUsd: 0 })
      .mockResolvedValueOnce({ exhausted: true, spendUsd: 0.00000225 });
    const getRunSpend = vi.fn(async () => 0.00000225);
    const handler = vi.fn(async () => ({ ok: true }));

    const result = await drainTasks({
      run: { id: "7" },
      taskType: "llm_smoke",
      definition: { handler, maxAttempts: 1, retryable: false },
      concurrency: 1,
      budgetUsd: 0.0000000001,
      limit: 2,
    }, { claimTask, completeTask, isBudgetExhausted, getRunSpend });

    expect(result).toMatchObject({
      dispatched: 1,
      done: 1,
      budgetExhausted: true,
      spendUsd: 0.00000225,
    });
    expect(claimTask).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  test("non-retryable handler failure is terminal and does not claim task two", async () => {
    const claimTask = vi.fn().mockResolvedValueOnce({ id: "1", entity_id: 997 });
    const failTask = vi.fn(async (args) => ({ status: args.retryable ? "pending" : "failed" }));
    const handler = vi.fn(async () => { throw new Error("smoke failed"); });

    const result = await drainTasks({
      run: { id: "8" },
      taskType: "llm_smoke",
      definition: { handler, maxAttempts: 1, retryable: false },
      concurrency: 1,
      budgetUsd: null,
      limit: 1,
    }, {
      claimTask,
      failTask,
      isBudgetExhausted: vi.fn(async () => ({ exhausted: false, spendUsd: 0 })),
      getRunSpend: vi.fn(async () => 0),
    });

    expect(result).toMatchObject({ dispatched: 1, failed: 1, retried: 0 });
    expect(failTask).toHaveBeenCalledWith(expect.objectContaining({ retryable: false }));
  });

  test("null concurrent claims do not consume retry dispatch limit", async () => {
    let claimCall = 0;
    const task = { id: "1", entity_id: 997 };
    const claimTask = vi.fn(async () => {
      claimCall += 1;
      if (claimCall === 1 || claimCall === 3) return task;
      return null;
    });
    let handlerCall = 0;
    const handler = vi.fn(async () => {
      handlerCall += 1;
      if (handlerCall === 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        throw new Error("retry once");
      }
      return { ok: true };
    });
    const failTask = vi.fn(async () => ({ status: "pending" }));
    const completeTask = vi.fn(async () => ({ status: "done" }));

    const result = await drainTasks({
      run: { id: "9" },
      taskType: "noop",
      definition: { handler, retryable: true },
      concurrency: 2,
      budgetUsd: null,
      limit: 2,
    }, {
      claimTask,
      failTask,
      completeTask,
      isBudgetExhausted: vi.fn(async () => ({ exhausted: false, spendUsd: 0 })),
      getRunSpend: vi.fn(async () => 0),
    });

    expect(result).toMatchObject({ dispatched: 2, done: 1, failed: 0, retried: 1 });
    expect(claimTask).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(completeTask).toHaveBeenCalledOnce();
  });
});
