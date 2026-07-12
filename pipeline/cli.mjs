#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getTaskDefinition } from "./config/tasks.mjs";
import { inspectCityIndex, refreshCityIndex } from "./lib/city-index.mjs";
import { closePool, withTransaction } from "./lib/db.mjs";
import {
  enqueueLegitimacyGateASample,
  LEGITIMACY_GATE_A_CAMPAIGN,
  LEGITIMACY_PROMPT_VERSION,
  loadLegitimacyGateAReportData,
  renderLegitimacyGateAReport,
} from "./lib/legitimacy-sample.mjs";
import { executeMigrationSql, loadMigrationFile } from "./lib/migrations.mjs";
import {
  claimTask,
  claimTasks,
  completeTask,
  enqueueTasks,
  failTask,
  previewDrain,
  previewEnqueue,
  taskBacklogSummary,
  taskCountsForRun,
  transitionTaskStage,
} from "./lib/queue.mjs";
import { loadRunReport, writeRunReport } from "./lib/report.mjs";
import { getRun, getRunSpend, isBudgetExhausted, withRun } from "./lib/runs.mjs";
import { DEFAULT_SCHEMAS, regenerateStructureDocument } from "./lib/structure-doc.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseCliArgs(argv);
  validateCommandArgs(parsed);
  const dryRun = !parsed.apply;
  const budgetUsd = parsed.budget == null ? null : nonnegativeNumber(parsed.budget, "--budget");
  const runArgs = redactArgs(parsed);

  try {
    const outcome = await withRun(
      { command: parsed.command, args: runArgs, dryRun, budgetUsd },
      async (run) => dispatchCommand(parsed, run),
    );
    const finalizedRun = await getRun(outcome.runId);
    const payload = { run: finalizedRun, ...withoutLifecycleFields(outcome) };
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  } finally {
    await closePool();
  }
}

export function parseCliArgs(argv) {
  if (!Array.isArray(argv) || !argv[0]) throw new Error(usage());
  const parsed = { command: argv[0], positional: [] };
  const seenFlags = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      parsed.positional.push(arg);
      continue;
    }
    const equals = arg.indexOf("=");
    const key = camelCaseFlag(equals === -1 ? arg.slice(2) : arg.slice(2, equals));
    if (seenFlags.has(key)) throw new Error(`--${flagCase(key)} may only be provided once.`);
    seenFlags.add(key);
    if (["apply", "dryRun"].includes(key)) {
      if (equals !== -1) throw new Error(`${arg.slice(0, equals)} does not accept a value.`);
      parsed[key] = true;
      continue;
    }
    const value = equals === -1 ? argv[++index] : arg.slice(equals + 1);
    if (value == null || value.startsWith("--")) throw new Error(`--${flagCase(key)} requires a value.`);
    parsed[key] = value;
  }
  if (parsed.apply && parsed.dryRun) throw new Error("--apply and --dry-run are mutually exclusive.");
  return parsed;
}

export function validateCommandArgs(parsed) {
  const allowedByCommand = {
    enqueue: new Set(["task", "where", "sample", "entityType", "priority", "limit", "apply", "dryRun"]),
    drain: new Set(["task", "stage", "concurrency", "budget", "limit", "apply", "dryRun"]),
    report: new Set(["run", "campaign", "output", "apply", "dryRun"]),
    migrate: new Set(["file", "apply", "dryRun"]),
    census: new Set(["apply", "dryRun"]),
    maintain: new Set(["schema", "output", "apply", "dryRun"]),
  };
  const allowed = allowedByCommand[parsed.command];
  if (!allowed) throw new Error(`Unknown command: ${parsed.command}\n${usage()}`);
  for (const key of Object.keys(parsed)) {
    if (["command", "positional"].includes(key)) continue;
    if (!allowed.has(key)) throw new Error(`Unknown option for ${parsed.command}: --${flagCase(key)}`);
  }
  validateCampaignOptions(parsed);
  const positional = parsed.positional || [];
  if (parsed.command === "maintain") {
    if (positional.length !== 1) {
      throw new Error("maintain requires exactly one subcommand: regen-structure-doc or refresh-city-index.");
    }
    const subcommand = positional[0];
    if (!["regen-structure-doc", "refresh-city-index"].includes(subcommand)) {
      throw new Error(`Unknown maintain subcommand: ${subcommand}`);
    }
    if (subcommand === "refresh-city-index" && parsed.output != null) {
      throw new Error("Unknown option for maintain refresh-city-index: --output");
    }
  } else if (positional.length > 0) {
    throw new Error(`${parsed.command} does not accept positional arguments.`);
  }
  return parsed;
}

async function dispatchCommand(parsed, run) {
  switch (parsed.command) {
    case "enqueue":
      return runEnqueue(parsed, run);
    case "drain":
      return runDrain(parsed, run);
    case "report":
      return runReport(parsed, run);
    case "migrate":
      return runMigrate(parsed, run);
    case "maintain":
      return runMaintenance(parsed, run);
    case "census":
      return {
        status: "completed",
        counts: { implemented: 0 },
        notes: `${parsed.command} not implemented`,
        result: { message: "not implemented" },
      };
    default:
      throw new Error(`Unknown command: ${parsed.command}\n${usage()}`);
  }
}

export async function runEnqueue(parsed, run, operations = {}) {
  const taskType = required(parsed.task, "--task");
  const definition = getTaskDefinition(taskType);
  const limit = optionalPositiveInteger(parsed.limit, "--limit");
  const entityType = parsed.entityType || "location";
  if (entityType !== "location") throw new Error("Phase B enqueue supports only --entity-type location.");
  const priority = parsed.priority == null ? 100 : integer(parsed.priority, "--priority");
  if (parsed.sample === "gate-a") {
    const enqueueSample = operations.enqueueLegitimacyGateASample || enqueueLegitimacyGateASample;
    const result = await enqueueSample({
      campaign: LEGITIMACY_GATE_A_CAMPAIGN,
      promptVersion: LEGITIMACY_PROMPT_VERSION,
      runId: run.id,
      maxAttempts: definition.maxAttempts,
      priority,
      apply: !run.dry_run,
    });
    return {
      status: "completed",
      counts: {
        selected: Number(result.selectedCount ?? result.selected_count ?? 0),
        inserted: Number(result.insertedCount ?? result.inserted_count ?? 0),
      },
      result: {
        dryRun: Boolean(run.dry_run),
        taskType,
        entityType,
        sample: parsed.sample,
        ...result,
      },
    };
  }

  const where = required(parsed.where, "--where");
  if (run.dry_run) {
    const preview = await withTransaction(async (tx) => {
      await tx.query("SET TRANSACTION READ ONLY");
      return previewEnqueue({ where, limit }, { query: tx.query.bind(tx) });
    });
    return {
      status: "completed",
      counts: { selected: preview.count, inserted: 0 },
      result: { dryRun: true, taskType, entityType, ...preview },
    };
  }
  const result = await enqueueTasks({
    taskType,
    where,
    entityType,
    priority,
    limit,
    runId: run.id,
    maxAttempts: definition.maxAttempts,
  });
  return {
    status: "completed",
    counts: { selected: result.selectedCount, inserted: result.insertedCount },
    result: { dryRun: false, taskType, entityType, ...result },
  };
}

async function runDrain(parsed, run) {
  const taskType = required(parsed.task, "--task");
  const stage = parsed.stage || null;
  const limit = optionalPositiveInteger(parsed.limit, "--limit");
  const concurrency = parsed.concurrency == null ? 1 : positiveInteger(parsed.concurrency, "--concurrency");
  const budgetUsd = parsed.budget == null ? null : nonnegativeNumber(parsed.budget, "--budget");
  if (run.dry_run) {
    const tasks = await previewDrainStages({ taskType, stage, limit: limit || 10 });
    return {
      status: "completed",
      counts: { claimable_preview: tasks.length },
      result: { dryRun: true, taskType, stage, tasks },
    };
  }
  const definition = getTaskDefinition(taskType);
  requireTaskHandler(taskType, definition);
  const drained = await drainTasks({
    run,
    taskType,
    definition,
    stage,
    concurrency,
    budgetUsd,
    limit,
  });
  const queueCounts = await taskCountsForRun(run.id);
  const backlog = await taskBacklogSummary(taskType);
  const retryPending = Math.max(0, Number(queueCounts.pending || 0) - Number(drained.deferred || 0));
  const status = drained.budgetExhausted
    ? "budget_exhausted"
    : drained.failed > 0 || retryPending > 0
      ? "failed"
      : "completed";
  return {
    status,
    counts: { ...drained, retryPending, queue: queueCounts, backlog },
    result: { dryRun: false, taskType, stage, ...drained, retryPending, queueCounts, backlog },
  };
}

export async function drainTasks(
  { run, taskType, definition, stage = null, concurrency, budgetUsd, limit },
  operations = {},
) {
  if (stage === "all") {
    return drainAllTaskStages({
      run,
      taskType,
      definition,
      concurrency,
      budgetUsd,
      limit,
    }, operations);
  }
  return drainTaskStage({
    run,
    taskType,
    definition,
    stage,
    concurrency,
    budgetUsd,
    limit,
  }, operations);
}

async function drainAllTaskStages(args, operations) {
  const stage1 = await drainTaskStage({ ...args, stage: "stage_1" }, operations);
  const remainingLimit = args.limit == null ? null : Math.max(0, args.limit - stage1.dispatched);
  const canStartStage2 = !stage1.budgetExhausted
    && stage1.queueDrained
    && remainingLimit !== 0;
  const stage2 = canStartStage2
    ? await drainTaskStage({ ...args, stage: "stage_2", limit: remainingLimit }, operations)
    : null;

  return {
    dispatched: stage1.dispatched + Number(stage2?.dispatched || 0),
    done: stage1.done + Number(stage2?.done || 0),
    deferred: stage1.deferred + Number(stage2?.deferred || 0),
    failed: stage1.failed + Number(stage2?.failed || 0),
    retried: stage1.retried + Number(stage2?.retried || 0),
    budgetExhausted: stage1.budgetExhausted || Boolean(stage2?.budgetExhausted),
    spendUsd: Number(stage2?.spendUsd ?? stage1.spendUsd),
    queueDrained: Boolean(stage2?.queueDrained),
    stages: {
      stage_1: stage1,
      ...(stage2 ? { stage_2: stage2 } : {}),
    },
    ...(stage2
      ? {}
      : {
          stage2SkippedReason: stage1.budgetExhausted
            ? "budget_exhausted"
            : stage1.queueDrained
              ? "dispatch_limit_reached"
              : "stage_1_not_drained",
        }),
  };
}

async function drainTaskStage(
  { run, taskType, definition, stage, concurrency, budgetUsd, limit },
  operations,
) {
  const claim = operations.claimTask || claimTask;
  const claimBatch = operations.claimTasks || claimTasks;
  const complete = operations.completeTask || completeTask;
  const transition = operations.transitionTaskStage || transitionTaskStage;
  const fail = operations.failTask || failTask;
  const checkBudget = operations.isBudgetExhausted || isBudgetExhausted;
  const loadSpend = operations.getRunSpend || getRunSpend;
  const usesBatchHandler = typeof definition.batchHandler === "function";
  const configuredBatchSize = usesBatchHandler ? taskBatchSize(definition, stage) : 1;
  const state = {
    reserved: 0,
    dispatched: 0,
    done: 0,
    deferred: 0,
    failed: 0,
    retried: 0,
    budgetExhausted: false,
    spendUsd: 0,
    queueDrained: false,
  };
  const reserve = (requested) => {
    if (state.budgetExhausted) return 0;
    const remaining = limit == null ? requested : Math.min(requested, limit - state.reserved);
    if (remaining <= 0) return 0;
    state.reserved += remaining;
    return remaining;
  };

  const recordFailure = (failed) => {
    if (failed.status === "pending") state.retried += 1;
    else state.failed += 1;
  };

  async function checkRunBudget() {
    const budget = await checkBudget(run.id, budgetUsd);
    state.spendUsd = budget.spendUsd;
    if (budget.exhausted) state.budgetExhausted = true;
    return budget;
  }

  async function failClaimedTask(task, workerId, error) {
    const failed = await fail({
      taskId: task.id,
      workerId,
      runId: run.id,
      error,
      retryable: definition.retryable !== false,
    });
    recordFailure(failed);
  }

  async function processSingleTask(task, workerId) {
    try {
      const result = await definition.handler({ task, run, workerId, stage });
      await complete({ taskId: task.id, workerId, runId: run.id, result });
      state.done += 1;
    } catch (error) {
      await failClaimedTask(task, workerId, error);
    }
  }

  async function processBatch(tasks, workerId) {
    let outcomes;
    try {
      const rawOutcomes = await definition.batchHandler({ tasks, run, workerId, stage });
      outcomes = validateBatchOutcomes(tasks, rawOutcomes);
    } catch (error) {
      const failures = await Promise.allSettled(
        tasks.map((task) => failClaimedTask(task, workerId, error)),
      );
      const rejected = failures.filter((failure) => failure.status === "rejected");
      if (rejected.length > 0) {
        throw new AggregateError(
          rejected.map((failure) => failure.reason),
          `Could not fail all ${tasks.length} tasks after a batch handler error.`,
        );
      }
      return;
    }

    for (const outcome of outcomes) {
      const task = outcome.task;
      try {
        if (outcome.disposition === "complete") {
          await complete({
            taskId: task.id,
            workerId,
            runId: run.id,
            result: outcome.result,
          });
          state.done += 1;
        } else {
          await transition({
            taskId: task.id,
            workerId,
            runId: run.id,
            payload: outcome.payload,
          });
          state.deferred += 1;
        }
      } catch (error) {
        await failClaimedTask(task, workerId, error);
      }
    }
  }

  async function worker(index) {
    const workerId = `${process.env.HOSTNAME || "local"}:${process.pid}:${run.id}:${index}`;
    while (true) {
      const reserved = reserve(configuredBatchSize);
      if (reserved === 0) break;
      if (budgetUsd != null) {
        const budget = await checkRunBudget();
        if (budget.exhausted) {
          state.reserved -= reserved;
          break;
        }
      }

      const claimArgs = { taskType, workerId, runId: run.id };
      if (stage != null) claimArgs.stage = stage;
      const tasks = usesBatchHandler
        ? await claimBatch({ ...claimArgs, limit: reserved })
        : [await claim(claimArgs)].filter(Boolean);
      state.reserved -= reserved - tasks.length;
      if (tasks.length === 0) {
        state.queueDrained = true;
        break;
      }
      state.dispatched += tasks.length;
      if (usesBatchHandler) await processBatch(tasks, workerId);
      else await processSingleTask(tasks[0], workerId);
      await checkRunBudget();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));
  state.spendUsd = await loadSpend(run.id);
  return {
    dispatched: state.dispatched,
    done: state.done,
    deferred: state.deferred,
    failed: state.failed,
    retried: state.retried,
    budgetExhausted: state.budgetExhausted,
    spendUsd: state.spendUsd,
    queueDrained: state.queueDrained,
  };
}

async function previewDrainStages({ taskType, stage, limit }) {
  if (stage !== "all") {
    return previewDrain({ taskType, stage, limit });
  }

  const stage1 = await previewDrain({ taskType, stage: "stage_1", limit });
  const remaining = limit - stage1.length;
  if (remaining <= 0) return stage1;
  const stage2 = await previewDrain({ taskType, stage: "stage_2", limit: remaining });
  return [...stage1, ...stage2];
}

function taskBatchSize(definition, stage) {
  const configured = definition.batchSizeByStage?.[stage] ?? definition.batchSize;
  if (!Number.isInteger(configured) || configured <= 0) {
    throw new Error(`Batch task has no positive batch size configured for stage ${stage || "default"}.`);
  }
  return configured;
}

function validateBatchOutcomes(tasks, outcomes) {
  if (!Array.isArray(outcomes)) {
    throw new Error("Batch handler must return an array of per-task outcomes.");
  }
  const tasksById = new Map(tasks.map((task) => [String(task.id), task]));
  if (tasksById.size !== tasks.length) {
    throw new Error("Claimed batch contains duplicate task ids.");
  }
  const seen = new Set();
  const normalized = outcomes.map((outcome) => {
    if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) {
      throw new Error("Each batch outcome must be an object.");
    }
    const key = String(outcome.taskId ?? "");
    const task = tasksById.get(key);
    if (!task) throw new Error(`Batch handler returned an unknown task id: ${key || "<missing>"}.`);
    if (seen.has(key)) throw new Error(`Batch handler returned task ${key} more than once.`);
    seen.add(key);
    if (!["complete", "defer"].includes(outcome.disposition)) {
      throw new Error(`Batch outcome ${key} has an invalid disposition.`);
    }
    if (
      outcome.disposition === "defer"
      && (!outcome.payload || typeof outcome.payload !== "object" || Array.isArray(outcome.payload))
    ) {
      throw new Error(`Deferred batch outcome ${key} requires an object payload.`);
    }
    return {
      task,
      disposition: outcome.disposition,
      result: outcome.result ?? {},
      payload: outcome.payload,
    };
  });
  if (seen.size !== tasks.length) {
    const missing = tasks.filter((task) => !seen.has(String(task.id))).map((task) => task.id);
    throw new Error(`Batch handler omitted task ids: ${missing.join(", ")}.`);
  }
  return normalized;
}

function requireTaskHandler(taskType, definition) {
  if (typeof definition.handler !== "function" && typeof definition.batchHandler !== "function") {
    throw new Error(`Task type ${taskType} is not implemented.`);
  }
}

export async function runReport(parsed, run, operations = {}) {
  const targetRunId = required(parsed.run, "--run");
  if (parsed.campaign === LEGITIMACY_GATE_A_CAMPAIGN) {
    const loadSample = operations.loadLegitimacyGateAReportData || loadLegitimacyGateAReportData;
    const renderSample = operations.renderLegitimacyGateAReport || renderLegitimacyGateAReport;
    const write = operations.writeFile || writeFile;
    const runIds = parseRunIds(targetRunId);
    const data = await loadSample({
      campaign: LEGITIMACY_GATE_A_CAMPAIGN,
      promptVersion: LEGITIMACY_PROMPT_VERSION,
      runIds,
    });
    const markdown = renderSample(data);
    const outputPath = run.dry_run
      ? null
      : path.resolve(ROOT, parsed.output || "docs/runs/pass1-sample-review.md");
    if (outputPath) await write(outputPath, markdown, "utf8");
    process.stdout.write(`${markdown}\n`);
    return {
      status: "completed",
      counts: {
        reports_rendered: 1,
        files_written: outputPath ? 1 : 0,
        sample_rows: data.sampleRows.length,
      },
      result: {
        dryRun: run.dry_run,
        campaign: parsed.campaign,
        targetRunIds: runIds,
        outputPath,
        classCounts: data.classCounts,
        actual: data.actual,
        projection: data.projection,
      },
    };
  }

  const markdown = await loadRunReport(targetRunId);
  let outputPath = null;
  if (!run.dry_run) {
    outputPath = await writeRunReport(targetRunId, markdown, {
      outputDir: path.join(ROOT, "docs", "runs"),
    });
  }
  process.stdout.write(`${markdown}\n`);
  return {
    status: "completed",
    counts: { reports_rendered: 1, files_written: outputPath ? 1 : 0 },
    result: { dryRun: run.dry_run, targetRunId, outputPath },
  };
}

export async function runMigrate(parsed, run, operations = {}) {
  const file = path.resolve(ROOT, parsed.file || "migrations/20260711_fountain_ops.sql");
  const load = operations.loadMigrationFile || loadMigrationFile;
  const execute = operations.executeMigrationSql || executeMigrationSql;
  const sql = load(file);
  if (run.dry_run) {
    return {
      status: "completed",
      counts: { migrations_applied: 0 },
      result: { dryRun: true, file: path.relative(ROOT, file), bytes: Buffer.byteLength(sql) },
    };
  }
  await execute(sql);
  return {
    status: "completed",
    counts: { migrations_applied: 1 },
    result: { dryRun: false, file: path.relative(ROOT, file) },
  };
}

export async function runMaintenance(parsed, run, operations = {}) {
  const subcommand = parsed.positional[0];
  if (subcommand === "regen-structure-doc") {
    const regenerate = operations.regenerateStructureDocument || regenerateStructureDocument;
    const outputPath = path.resolve(ROOT, parsed.output || "docs/NEON_DATABASE_STRUCTURE_CURRENT.md");
    const schemas = parsed.schema
      ? String(parsed.schema).split(",").map((value) => value.trim()).filter(Boolean)
      : DEFAULT_SCHEMAS;
    const generated = await regenerate({
      outputPath,
      schemas,
      apply: !run.dry_run,
    });
    return {
      status: "completed",
      counts: { documents_generated: 1, files_written: run.dry_run ? 0 : 1 },
      result: {
        dryRun: run.dry_run,
        output: path.relative(ROOT, outputPath),
        schemas,
        bytes: generated.bytes,
      },
    };
  }

  const schema = parsed.schema || "fountain";
  const inspect = operations.inspectCityIndex || inspectCityIndex;
  const refresh = operations.refreshCityIndex || refreshCityIndex;
  const cityIndex = run.dry_run
    ? await inspect({ schema })
    : await refresh({ schema });
  return {
    status: "completed",
    counts: { refreshes_applied: run.dry_run ? 0 : 1, cities_indexed: cityIndex.count },
    result: { dryRun: run.dry_run, ...cityIndex },
  };
}

function redactArgs(parsed) {
  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([key]) => !["command"].includes(key))
      .map(([key, value]) => [key, /key|token|secret|password/i.test(key) ? "[redacted]" : value]),
  );
}

function withoutLifecycleFields(outcome) {
  const result = { ...outcome };
  delete result.runId;
  delete result.status;
  delete result.counts;
  delete result.notes;
  return result;
}

function camelCaseFlag(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function flagCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function required(value, flag) {
  if (value == null || value === "") throw new Error(`${flag} is required.`);
  return value;
}

function integer(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} must be an integer.`);
  return parsed;
}

function positiveInteger(value, flag) {
  const parsed = integer(value, flag);
  if (parsed <= 0) throw new Error(`${flag} must be greater than zero.`);
  return parsed;
}

function optionalPositiveInteger(value, flag) {
  return value == null ? null : positiveInteger(value, flag);
}

function validateCampaignOptions(parsed) {
  if (parsed.command === "enqueue") {
    if (parsed.sample == null) {
      if (parsed.where == null) throw new Error("--where is required unless using the legitimacy Gate A sample.");
      return;
    }
    if (parsed.sample !== "gate-a") throw new Error("--sample must be gate-a.");
    if (parsed.task !== "legitimacy_check") {
      throw new Error("--sample gate-a is supported only for --task legitimacy_check.");
    }
    if (parsed.where != null) throw new Error("--sample gate-a and --where are mutually exclusive.");
    if (parsed.limit != null) throw new Error("--sample gate-a always selects its fixed 300-row cohort; omit --limit.");
  }

  if (parsed.command === "drain") {
    if (parsed.stage == null) {
      if (parsed.task === "legitimacy_check") {
        throw new Error("--task legitimacy_check requires --stage stage_1, stage_2, or all.");
      }
      return;
    }
    if (!["stage_1", "stage_2", "all"].includes(parsed.stage)) {
      throw new Error("--stage must be stage_1, stage_2, or all.");
    }
    if (parsed.task !== "legitimacy_check") {
      throw new Error("--stage is currently supported only for --task legitimacy_check.");
    }
    if (parsed.budget == null) {
      throw new Error("--task legitimacy_check requires an explicit --budget.");
    }
  }

  if (parsed.command === "report") {
    if (parsed.campaign == null) {
      if (parsed.output != null) {
        throw new Error("--output is supported only with --campaign pass1_gate_a.");
      }
      return;
    }
    if (parsed.campaign !== LEGITIMACY_GATE_A_CAMPAIGN) {
      throw new Error(`--campaign must be ${LEGITIMACY_GATE_A_CAMPAIGN}.`);
    }
  }
}

function parseRunIds(value) {
  const values = String(value).split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0 || values.some((item) => !/^[1-9]\d*$/u.test(item))) {
    throw new Error("--run must be a comma-separated list of positive run ids.");
  }
  return [...new Set(values)];
}

function nonnegativeNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a nonnegative number.`);
  return parsed;
}

function usage() {
  return [
    "Usage: node pipeline/cli.mjs <command> [options]",
    "Commands: enqueue, drain, report, migrate, census, maintain",
    "Maintenance: regen-structure-doc, refresh-city-index",
    "Persistent side effects require --apply; dry-run is the default.",
  ].join("\n");
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch(async (error) => {
    console.error(error?.stack || error);
    if (error?.runId) console.error(`RUN_ID=${error.runId}`);
    await closePool().catch(() => {});
    process.exitCode = 1;
  });
}
