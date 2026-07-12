import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { drainTasks, parseCliArgs, runEnqueue, runReport, validateCommandArgs } from "../pipeline/cli.mjs";

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

  test("validates the legitimacy stage and fixed Gate A sample surfaces", () => {
    expect(validateCommandArgs(parseCliArgs([
      "drain",
      "--task",
      "legitimacy_check",
      "--stage",
      "all",
      "--budget",
      "3",
      "--apply",
    ]))).toMatchObject({ stage: "all" });
    expect(validateCommandArgs(parseCliArgs([
      "enqueue",
      "--task",
      "legitimacy_check",
      "--sample",
      "gate-a",
      "--apply",
    ]))).toMatchObject({ sample: "gate-a" });

    expect(() => validateCommandArgs(parseCliArgs([
      "drain", "--task", "legitimacy_check", "--stage", "stage-3",
    ]))).toThrow("stage_1, stage_2, or all");
    expect(() => validateCommandArgs(parseCliArgs([
      "drain", "--task", "noop", "--stage", "stage_1",
    ]))).toThrow("only for --task legitimacy_check");
    expect(() => validateCommandArgs(parseCliArgs([
      "drain", "--task", "legitimacy_check",
    ]))).toThrow("requires --stage");
    expect(() => validateCommandArgs(parseCliArgs([
      "drain", "--task", "legitimacy_check", "--stage", "stage_1",
    ]))).toThrow("requires an explicit --budget");
    expect(() => validateCommandArgs(parseCliArgs([
      "enqueue", "--task", "noop", "--sample", "gate-a",
    ]))).toThrow("only for --task legitimacy_check");
    expect(() => validateCommandArgs(parseCliArgs([
      "enqueue", "--task", "legitimacy_check", "--sample", "gate-a", "--where", "id > 0",
    ]))).toThrow("mutually exclusive");
    expect(() => validateCommandArgs(parseCliArgs([
      "enqueue", "--task", "noop",
    ]))).toThrow("--where is required");
    expect(validateCommandArgs(parseCliArgs([
      "report", "--campaign", "pass1_gate_a", "--run", "21", "--apply",
    ]))).toMatchObject({ campaign: "pass1_gate_a", run: "21" });
  });

  test("renders the Gate A campaign report and writes it only in apply mode", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const sampleData = {
      sampleRows: Array.from({ length: 300 }, () => ({})),
      classCounts: { in_scope: 200, review: 100 },
      actual: { spendUsd: 0.02 },
      projection: { spendUsd: 0.7 },
    };
    const loadLegitimacyGateAReportData = vi.fn(async () => sampleData);
    const renderLegitimacyGateAReport = vi.fn(() => "# sample\n");
    const writeFile = vi.fn(async () => undefined);

    const outcome = await runReport(
      { campaign: "pass1_gate_a", run: "21,22", output: "docs/runs/pass1-sample-review.md" },
      { dry_run: false },
      { loadLegitimacyGateAReportData, renderLegitimacyGateAReport, writeFile },
    );

    expect(loadLegitimacyGateAReportData).toHaveBeenCalledWith({
      campaign: "pass1_gate_a",
      promptVersion: "pass1-legitimacy-v1",
      runIds: ["21", "22"],
    });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/docs\/runs\/pass1-sample-review\.md$/u),
      "# sample\n",
      "utf8",
    );
    expect(outcome).toMatchObject({ counts: { sample_rows: 300, files_written: 1 } });
    stdout.mockRestore();
  });

  test("routes the fixed Gate A sample through its specialized helper", async () => {
    const enqueueLegitimacyGateASample = vi.fn(async () => ({
      selectedCount: 300,
      insertedCount: 0,
      insertedEntityIds: [],
      sampleCounts: { hyperbaric: 50, hospital: 50, random: 200 },
    }));

    const outcome = await runEnqueue(
      { task: "legitimacy_check", sample: "gate-a", positional: [] },
      { id: "12", dry_run: true },
      { enqueueLegitimacyGateASample },
    );

    expect(enqueueLegitimacyGateASample).toHaveBeenCalledWith({
      campaign: "pass1_gate_a",
      promptVersion: "pass1-legitimacy-v1",
      runId: "12",
      maxAttempts: 3,
      priority: 100,
      apply: false,
    });
    expect(outcome).toMatchObject({
      counts: { selected: 300, inserted: 0 },
      result: { dryRun: true, sample: "gate-a" },
    });
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

  test("settles complete and deferred outcomes from a claimed batch", async () => {
    const tasks = [{ id: "21", entity_id: 101 }, { id: "22", entity_id: 102 }];
    const claimTasks = vi.fn()
      .mockResolvedValueOnce(tasks)
      .mockResolvedValueOnce([]);
    const completeTask = vi.fn(async () => ({ status: "done" }));
    const transitionTaskStage = vi.fn(async () => ({ status: "pending" }));
    const batchHandler = vi.fn(async () => [
      { taskId: "21", disposition: "complete", result: { final: { class: "in_scope" } } },
      { taskId: "22", disposition: "defer", payload: { stage: "stage_2" } },
    ]);

    const result = await drainTasks({
      run: { id: "13" },
      taskType: "legitimacy_check",
      definition: { batchHandler, batchSizeByStage: { stage_1: 20 } },
      stage: "stage_1",
      concurrency: 1,
      budgetUsd: null,
      limit: null,
    }, {
      claimTasks,
      completeTask,
      transitionTaskStage,
      isBudgetExhausted: vi.fn(async () => ({ exhausted: false, spendUsd: 0.01 })),
      getRunSpend: vi.fn(async () => 0.01),
    });

    expect(result).toMatchObject({
      dispatched: 2,
      done: 1,
      deferred: 1,
      failed: 0,
      queueDrained: true,
    });
    expect(claimTasks).toHaveBeenNthCalledWith(1, expect.objectContaining({ stage: "stage_1", limit: 20 }));
    expect(completeTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: "21" }));
    expect(transitionTaskStage).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "22",
      payload: { stage: "stage_2" },
    }));
  });

  test("fails every claimed task when the batch handler throws", async () => {
    const tasks = [{ id: "31", entity_id: 201 }, { id: "32", entity_id: 202 }];
    const claimTasks = vi.fn()
      .mockResolvedValueOnce(tasks)
      .mockResolvedValueOnce([]);
    const failTask = vi.fn(async (args: { taskId: string }) => {
      void args;
      return { status: "failed" };
    });
    const error = new Error("structured response invalid");

    const result = await drainTasks({
      run: { id: "14" },
      taskType: "legitimacy_check",
      definition: {
        batchHandler: vi.fn(async () => { throw error; }),
        batchSize: 10,
        retryable: false,
      },
      stage: "stage_1",
      concurrency: 1,
      budgetUsd: null,
      limit: null,
    }, {
      claimTasks,
      failTask,
      isBudgetExhausted: vi.fn(async () => ({ exhausted: false, spendUsd: 0 })),
      getRunSpend: vi.fn(async () => 0),
    });

    expect(result).toMatchObject({ dispatched: 2, done: 0, failed: 2, retried: 0 });
    expect(failTask).toHaveBeenCalledTimes(2);
    expect(failTask.mock.calls.map(([args]) => args.taskId)).toEqual(["31", "32"]);
    expect(failTask).toHaveBeenCalledWith(expect.objectContaining({ error, retryable: false }));
  });

  test("drains Stage 1 fully before Stage 2 with one shared run budget", async () => {
    const stage1Task = { id: "41", entity_id: 301 };
    const stage2Task = { id: "41", entity_id: 301, payload: { stage: "stage_2" } };
    const claimedStages: string[] = [];
    const claimsByStage = {
      stage_1: [[stage1Task], []],
      stage_2: [[stage2Task], []],
    };
    const claimTasks = vi.fn(async (args) => {
      claimedStages.push(args.stage);
      return claimsByStage[args.stage as keyof typeof claimsByStage].shift() || [];
    });
    const batchHandler = vi.fn(async ({ tasks, stage }) => stage === "stage_1"
      ? [{ taskId: tasks[0].id, disposition: "defer", payload: { stage: "stage_2" } }]
      : [{ taskId: tasks[0].id, disposition: "complete", result: { final: { class: "junk" } } }]);
    const checkBudget = vi.fn(async (runId: string, budget: number) => {
      void runId;
      void budget;
      return { exhausted: false, spendUsd: 0.2 };
    });

    const result = await drainTasks({
      run: { id: "15" },
      taskType: "legitimacy_check",
      definition: {
        batchHandler,
        batchSizeByStage: { stage_1: 20, stage_2: 8 },
      },
      stage: "all",
      concurrency: 1,
      budgetUsd: 3,
      limit: null,
    }, {
      claimTasks,
      completeTask: vi.fn(async () => ({ status: "done" })),
      transitionTaskStage: vi.fn(async () => ({ status: "pending" })),
      isBudgetExhausted: checkBudget,
      getRunSpend: vi.fn(async () => 0.2),
    });

    expect(claimedStages).toEqual(["stage_1", "stage_1", "stage_2", "stage_2"]);
    expect(claimTasks.mock.calls.map(([args]) => args.limit)).toEqual([20, 20, 8, 8]);
    expect(checkBudget.mock.calls.every(([runId, budget]) => runId === "15" && budget === 3)).toBe(true);
    expect(result).toMatchObject({
      dispatched: 2,
      done: 1,
      deferred: 1,
      budgetExhausted: false,
      spendUsd: 0.2,
      queueDrained: true,
      stages: {
        stage_1: { dispatched: 1, deferred: 1, queueDrained: true },
        stage_2: { dispatched: 1, done: 1, queueDrained: true },
      },
    });
  });

  test("does not start Stage 2 after the shared budget is exhausted", async () => {
    const claimTasks = vi.fn().mockResolvedValueOnce([{ id: "51", entity_id: 401 }]);
    const checkBudget = vi.fn()
      .mockResolvedValueOnce({ exhausted: false, spendUsd: 0 })
      .mockResolvedValueOnce({ exhausted: true, spendUsd: 3.01 });

    const result = await drainTasks({
      run: { id: "16" },
      taskType: "legitimacy_check",
      definition: {
        batchHandler: vi.fn(async ({ tasks }) => [
          { taskId: tasks[0].id, disposition: "complete", result: {} },
        ]),
        batchSizeByStage: { stage_1: 20, stage_2: 8 },
      },
      stage: "all",
      concurrency: 1,
      budgetUsd: 3,
      limit: null,
    }, {
      claimTasks,
      completeTask: vi.fn(async () => ({ status: "done" })),
      isBudgetExhausted: checkBudget,
      getRunSpend: vi.fn(async () => 3.01),
    });

    expect(claimTasks).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      budgetExhausted: true,
      spendUsd: 3.01,
      stage2SkippedReason: "budget_exhausted",
      stages: { stage_1: { done: 1 } },
    });
    expect(result.stages.stage_2).toBeUndefined();
  });
});
