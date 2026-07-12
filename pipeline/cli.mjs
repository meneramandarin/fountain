#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getTaskDefinition } from "./config/tasks.mjs";
import { inspectCityIndex, refreshCityIndex } from "./lib/city-index.mjs";
import { closePool, withTransaction } from "./lib/db.mjs";
import { executeMigrationSql, loadMigrationFile } from "./lib/migrations.mjs";
import {
  claimTask,
  completeTask,
  enqueueTasks,
  failTask,
  previewDrain,
  previewEnqueue,
  taskBacklogSummary,
  taskCountsForRun,
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
    enqueue: new Set(["task", "where", "entityType", "priority", "limit", "apply", "dryRun"]),
    drain: new Set(["task", "concurrency", "budget", "limit", "apply", "dryRun"]),
    report: new Set(["run", "apply", "dryRun"]),
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

async function runEnqueue(parsed, run) {
  const taskType = required(parsed.task, "--task");
  const where = required(parsed.where, "--where");
  const definition = getTaskDefinition(taskType);
  const limit = optionalPositiveInteger(parsed.limit, "--limit");
  const entityType = parsed.entityType || "location";
  if (entityType !== "location") throw new Error("Phase B enqueue supports only --entity-type location.");
  const priority = parsed.priority == null ? 100 : integer(parsed.priority, "--priority");
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
  const limit = optionalPositiveInteger(parsed.limit, "--limit");
  const concurrency = parsed.concurrency == null ? 1 : positiveInteger(parsed.concurrency, "--concurrency");
  const budgetUsd = parsed.budget == null ? null : nonnegativeNumber(parsed.budget, "--budget");
  if (run.dry_run) {
    const tasks = await previewDrain({ taskType, limit: limit || 10 });
    return {
      status: "completed",
      counts: { claimable_preview: tasks.length },
      result: { dryRun: true, taskType, tasks },
    };
  }
  const definition = getTaskDefinition(taskType, { requireHandler: true });
  const drained = await drainTasks({
    run,
    taskType,
    definition,
    concurrency,
    budgetUsd,
    limit,
  });
  const queueCounts = await taskCountsForRun(run.id);
  const backlog = await taskBacklogSummary(taskType);
  const retryPending = Number(queueCounts.pending || 0);
  const status = drained.budgetExhausted
    ? "budget_exhausted"
    : drained.failed > 0 || retryPending > 0
      ? "failed"
      : "completed";
  return {
    status,
    counts: { ...drained, retryPending, queue: queueCounts, backlog },
    result: { dryRun: false, taskType, ...drained, retryPending, queueCounts, backlog },
  };
}

export async function drainTasks(
  { run, taskType, definition, concurrency, budgetUsd, limit },
  operations = {},
) {
  const claim = operations.claimTask || claimTask;
  const complete = operations.completeTask || completeTask;
  const fail = operations.failTask || failTask;
  const checkBudget = operations.isBudgetExhausted || isBudgetExhausted;
  const loadSpend = operations.getRunSpend || getRunSpend;
  const state = {
    reserved: 0,
    dispatched: 0,
    done: 0,
    failed: 0,
    retried: 0,
    budgetExhausted: false,
    spendUsd: 0,
  };
  const reserve = () => {
    if (state.budgetExhausted) return false;
    if (limit != null && state.reserved >= limit) return false;
    state.reserved += 1;
    return true;
  };

  async function worker(index) {
    const workerId = `${process.env.HOSTNAME || "local"}:${process.pid}:${run.id}:${index}`;
    while (reserve()) {
      if (budgetUsd != null) {
        const budget = await checkBudget(run.id, budgetUsd);
        state.spendUsd = budget.spendUsd;
        if (budget.exhausted) {
          state.budgetExhausted = true;
          state.reserved -= 1;
          break;
        }
      }
      const task = await claim({ taskType, workerId, runId: run.id });
      if (!task) {
        state.reserved -= 1;
        break;
      }
      state.dispatched += 1;
      try {
        const result = await definition.handler({ task, run, workerId });
        await complete({ taskId: task.id, workerId, runId: run.id, result });
        state.done += 1;
      } catch (error) {
        const failed = await fail({
          taskId: task.id,
          workerId,
          runId: run.id,
          error,
          retryable: definition.retryable !== false,
        });
        if (failed.status === "pending") {
          state.retried += 1;
        }
        else state.failed += 1;
      }
      const budget = await checkBudget(run.id, budgetUsd);
      state.spendUsd = budget.spendUsd;
      if (budget.exhausted) state.budgetExhausted = true;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));
  state.spendUsd = await loadSpend(run.id);
  return {
    dispatched: state.dispatched,
    done: state.done,
    failed: state.failed,
    retried: state.retried,
    budgetExhausted: state.budgetExhausted,
    spendUsd: state.spendUsd,
  };
}

async function runReport(parsed, run) {
  const targetRunId = required(parsed.run, "--run");
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
