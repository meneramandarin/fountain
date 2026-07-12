#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getTaskDefinition } from "./config/tasks.mjs";
import { inspectCityIndex, refreshCityIndex } from "./lib/city-index.mjs";
import {
  buildEnrichmentEnqueuePlan,
  buildImageClassifyEnqueuePlan,
  ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE,
  ENRICHMENT_POST_CONTACT_TASK_TYPES,
  ENRICHMENT_TASK_TYPES,
  enqueueEnrichmentPlan,
  enqueueImageClassifyPlan,
  enqueueMenuPricesPlan,
  enqueuePostContactPlan,
  loadEnrichmentCensus,
  loadMenuPricesEnqueuePlan,
  loadPostContactEnqueuePlan,
  renderEnrichmentCensusReport,
  renderImageClassifyEnqueueReport,
  renderMenuPricesEnqueueReport,
  renderPostContactEnqueueReport,
} from "./lib/enrichment-census.mjs";
import {
  FINAL_REDEMPTION_RUN_ID,
  FINAL_STAGE3_RUN_ID,
  loadPersistedLegitimacyCloseout,
} from "./lib/enrichment-final-evidence.mjs";
import {
  assertEnrichmentFinalReconciliation,
  ENRICHMENT_FINAL_REPORT_FILENAME,
  ENRICHMENT_MENU_PRICES_CENSUS_FILENAME,
  loadEnrichmentFinalReportData,
  normalizeFinalReportRunIds,
  renderEnrichmentFinalReport,
  selectedMenuExtractRunIds,
  writeEnrichmentFinalReport,
} from "./lib/enrichment-final-report.mjs";
import { closePool, query as dbQuery, withTransaction } from "./lib/db.mjs";
import {
  enqueueLegitimacyGateBFull,
  LEGITIMACY_GATE_B_CAMPAIGN,
  LEGITIMACY_GATE_B_PROMPT_VERSION,
  loadLegitimacyGateBReportData,
  renderLegitimacyGateBReport,
  renderLegitimacyReviewQueue,
} from "./lib/legitimacy-full.mjs";
import {
  applyLegitimacyGateBSuppression,
  LEGITIMACY_GATE_B_COMPLETION_PATH,
  previewLegitimacyGateBSuppression,
  renderLegitimacyGateBCompletion,
} from "./lib/legitimacy-suppression.mjs";
import {
  enqueueLegitimacyGateASample,
  LEGITIMACY_GATE_A_CAMPAIGN,
  LEGITIMACY_PROMPT_VERSION,
  loadLegitimacyGateAReportData,
  renderLegitimacyGateAReport,
} from "./lib/legitimacy-sample.mjs";
import {
  executeLegitimacyStage3Full,
  LEGITIMACY_STAGE3_APPLY_ACTOR_ID,
  renderLegitimacyStage3Completion,
} from "./lib/legitimacy-stage3-execute.mjs";
import {
  LEGITIMACY_STAGE3_FULL_CAMPAIGN,
  LEGITIMACY_STAGE3_FULL_COMPLETION_PATH,
  LEGITIMACY_STAGE3_FULL_CONCURRENCY,
  LEGITIMACY_STAGE3_FULL_HUMAN_REVIEW_PATH,
  LEGITIMACY_STAGE3_FULL_PROMPT_VERSION,
  renderLegitimacyStage3HumanReview,
} from "./lib/legitimacy-stage3-full.mjs";
import { loadLegitimacyStage3ProposalData } from "./lib/legitimacy-stage3-proposal.mjs";
import { executeMigrationSql, loadMigrationFile } from "./lib/migrations.mjs";
import { createOpenRouterAgentWebSearch } from "./lib/openrouter-web-search.mjs";
import { recomputeOfferingDisplay } from "./lib/offering-display.mjs";
import {
  OFFERING_TRANSLATION_BATCH_SIZE,
  OFFERING_TRANSLATION_CONCURRENCY,
  OFFERING_TRANSLATION_MODEL,
  OFFERING_TRANSLATION_VERIFICATION_MODEL,
  runOfferingTranslation,
} from "./lib/offering-translations.mjs";
import {
  applyLegitimacyRedemptions,
  LEGITIMACY_REDEMPTION_REPORT_PATH,
  loadLegitimacyRedemptionCohort,
  renderLegitimacyRedemptionReport,
  runLegitimacyRedemptionPass,
} from "./lib/legitimacy-redemption.mjs";
import { createRedemptionAgentLookup } from "./lib/legitimacy-redemption-execute.mjs";
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
import {
  runTaxonomyPresentationClassification,
  TAXONOMY_PRESENTATION_DEFAULT_BATCH_SIZE,
  TAXONOMY_PRESENTATION_DEFAULT_CONCURRENCY,
  TAXONOMY_PRESENTATION_DEFAULT_MODEL,
} from "./lib/taxonomy-presentation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_DRAIN_CONCURRENCY = 24;
export const DRAIN_FAILURE_WINDOW_SIZE = 500;
export const DRAIN_FAILURE_RATE_LIMIT = 0.25;

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseCliArgs(argv);
  validateCommandArgs(parsed);
  const dryRun = !parsed.apply;
  if (parsed.command === "final-report") {
    try {
      const outcome = await runFinalReport(parsed, { dry_run: dryRun });
      const payload = {
        run: null,
        status: outcome.status,
        counts: outcome.counts,
        ...withoutLifecycleFields(outcome),
      };
      console.log(JSON.stringify(payload, null, 2));
      return payload;
    } finally {
      await closePool();
    }
  }
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
    enqueue: new Set(["task", "where", "sample", "scope", "entityType", "priority", "limit", "apply", "dryRun"]),
    drain: new Set([
      "task",
      "stage",
      "campaign",
      "promptVersion",
      "concurrency",
      "budget",
      "limit",
      "apply",
      "dryRun",
    ]),
    report: new Set(["run", "campaign", "output", "apply", "dryRun"]),
    suppress: new Set(["run", "campaign", "expected", "apply", "dryRun"]),
    stage3: new Set(["concurrency", "batchSize", "budget", "apply", "dryRun"]),
    redemption: new Set(["concurrency", "batchSize", "budget", "apply", "dryRun"]),
    "final-report": new Set([
      "before",
      "after",
      "menuPricesBefore",
      "runsFile",
      "runSelection",
      "output",
      "apply",
      "dryRun",
    ]),
    migrate: new Set(["file", "apply", "dryRun"]),
    census: new Set(["scope", "apply", "dryRun"]),
    maintain: new Set(["schema", "output", "apply", "dryRun"]),
    "taxonomy-present": new Set(["model", "batchSize", "concurrency", "limit", "budget", "apply", "dryRun"]),
    "offering-display": new Set(["locationId", "apply", "dryRun"]),
    "offering-translate": new Set(["locationId", "model", "verificationModel", "batchSize", "concurrency", "limit", "budget", "apply", "dryRun"]),
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
    case "suppress":
      return runSuppress(parsed, run);
    case "stage3":
      return runStage3(parsed, run);
    case "redemption":
      return runRedemption(parsed, run);
    case "final-report":
      return runFinalReport(parsed, run);
    case "migrate":
      return runMigrate(parsed, run);
    case "maintain":
      return runMaintenance(parsed, run);
    case "census":
      return runCensus(parsed, run);
    case "taxonomy-present":
      return runTaxonomyPresent(parsed, run);
    case "offering-display":
      return runOfferingDisplay(parsed, run);
    case "offering-translate":
      return runOfferingTranslate(parsed, run);
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
  if (parsed.scope === "full") {
    const enqueueFull = operations.enqueueLegitimacyGateBFull || enqueueLegitimacyGateBFull;
    const result = await enqueueFull({
      campaign: LEGITIMACY_GATE_B_CAMPAIGN,
      promptVersion: LEGITIMACY_GATE_B_PROMPT_VERSION,
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
        scope: parsed.scope,
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

export async function runDrain(parsed, run, operations = {}) {
  const taskType = required(parsed.task, "--task");
  const stage = parsed.stage || null;
  const campaign = parsed.campaign || null;
  const promptVersion = parsed.promptVersion || null;
  const limit = optionalPositiveInteger(parsed.limit, "--limit");
  const concurrency = parsed.concurrency == null
    ? DEFAULT_DRAIN_CONCURRENCY
    : positiveInteger(parsed.concurrency, "--concurrency");
  const budgetUsd = parsed.budget == null ? null : nonnegativeNumber(parsed.budget, "--budget");
  if (run.dry_run) {
    const tasks = await previewDrainStages(
      { taskType, stage, campaign, promptVersion, limit: limit || 10 },
      operations,
    );
    return {
      status: "completed",
      counts: { claimable_preview: tasks.length },
      result: { dryRun: true, taskType, stage, campaign, promptVersion, concurrency, tasks },
    };
  }
  const definition = getTaskDefinition(taskType);
  requireTaskHandler(taskType, definition);
  const drained = await drainTasks({
    run,
    taskType,
    definition,
    stage,
    campaign,
    promptVersion,
    concurrency,
    budgetUsd,
    limit,
  }, operations);
  const loadTaskCounts = operations.taskCountsForRun || taskCountsForRun;
  const loadBacklog = operations.taskBacklogSummary || taskBacklogSummary;
  const queueCounts = await loadTaskCounts(run.id);
  const backlog = await loadBacklog(taskType);
  const retryPending = Math.max(0, Number(queueCounts.pending || 0) - Number(drained.deferred || 0));
  const status = drained.failureRateHalted
    ? "failed"
    : drained.budgetExhausted
      ? "budget_exhausted"
      : drained.failed > 0 || retryPending > 0
        ? "failed"
        : "completed";
  const notes = drained.failureRateHalted
    ? `stage_halted_rolling_failure_rate:${drained.failureRateWindowFailures}/${drained.failureRateWindowTasks}=${drained.failureRate.toFixed(4)}`
    : null;
  return {
    status,
    notes,
    counts: { ...drained, retryPending, queue: queueCounts, backlog },
    result: {
      dryRun: false,
      taskType,
      stage,
      campaign,
      promptVersion,
      ...drained,
      retryPending,
      queueCounts,
      backlog,
    },
  };
}

export async function drainTasks(
  {
    run,
    taskType,
    definition,
    stage = null,
    campaign = null,
    promptVersion = null,
    concurrency,
    budgetUsd,
    limit,
  },
  operations = {},
) {
  if (stage === "all") {
    return drainAllTaskStages({
      run,
      taskType,
      definition,
      campaign,
      promptVersion,
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
    campaign,
    promptVersion,
    concurrency,
    budgetUsd,
    limit,
  }, operations);
}

async function drainAllTaskStages(args, operations) {
  const stage1 = await drainTaskStage({ ...args, stage: "stage_1" }, operations);
  const remainingLimit = args.limit == null ? null : Math.max(0, args.limit - stage1.dispatched);
  const canStartStage2 = !stage1.budgetExhausted
    && !stage1.failureRateHalted
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
    failureRateHalted: stage1.failureRateHalted || Boolean(stage2?.failureRateHalted),
    failureRateWindowTasks: Number(
      stage2?.failureRateHalted
        ? stage2.failureRateWindowTasks
        : stage1.failureRateWindowTasks,
    ),
    failureRateWindowFailures: Number(
      stage2?.failureRateHalted
        ? stage2.failureRateWindowFailures
        : stage1.failureRateWindowFailures,
    ),
    failureRate: Number(
      stage2?.failureRateHalted ? stage2.failureRate : stage1.failureRate,
    ),
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
            : stage1.failureRateHalted
              ? "rolling_failure_rate_exceeded"
              : stage1.queueDrained
                ? "dispatch_limit_reached"
                : "stage_1_not_drained",
        }),
  };
}

async function drainTaskStage(
  {
    run,
    taskType,
    definition,
    stage,
    campaign,
    promptVersion,
    concurrency,
    budgetUsd,
    limit,
  },
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
    failureOutcomes: [],
    failureRateHalted: false,
    failureRateHalt: null,
  };
  const reserve = (requested) => {
    if (state.budgetExhausted || state.failureRateHalted) return 0;
    const remaining = limit == null ? requested : Math.min(requested, limit - state.reserved);
    if (remaining <= 0) return 0;
    state.reserved += remaining;
    return remaining;
  };

  const recordFailure = (failed) => {
    if (failed.status === "pending") state.retried += 1;
    else state.failed += 1;
    recordOutcome(true);
  };

  const recordOutcome = (failed) => {
    state.failureOutcomes.push(Boolean(failed));
    if (state.failureOutcomes.length > DRAIN_FAILURE_WINDOW_SIZE) {
      state.failureOutcomes.shift();
    }
    if (!state.failureRateHalted
        && state.failureOutcomes.length === DRAIN_FAILURE_WINDOW_SIZE) {
      const failures = state.failureOutcomes.filter(Boolean).length;
      const rate = failures / DRAIN_FAILURE_WINDOW_SIZE;
      if (rate > DRAIN_FAILURE_RATE_LIMIT) {
        state.failureRateHalted = true;
        state.failureRateHalt = {
          tasks: DRAIN_FAILURE_WINDOW_SIZE,
          failures,
          rate,
        };
      }
    }
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
      recordOutcome(false);
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
          recordOutcome(false);
        } else {
          await transition({
            taskId: task.id,
            workerId,
            runId: run.id,
            payload: outcome.payload,
          });
          state.deferred += 1;
          recordOutcome(false);
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
      if (campaign != null) claimArgs.campaign = campaign;
      if (promptVersion != null) claimArgs.promptVersion = promptVersion;
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
  const failureRateWindowTasks = state.failureRateHalt?.tasks ?? state.failureOutcomes.length;
  const failureRateWindowFailures = state.failureRateHalt?.failures
    ?? state.failureOutcomes.filter(Boolean).length;
  const failureRate = state.failureRateHalt?.rate
    ?? (failureRateWindowTasks === 0 ? 0 : failureRateWindowFailures / failureRateWindowTasks);
  return {
    dispatched: state.dispatched,
    done: state.done,
    deferred: state.deferred,
    failed: state.failed,
    retried: state.retried,
    budgetExhausted: state.budgetExhausted,
    spendUsd: state.spendUsd,
    queueDrained: state.queueDrained && !state.failureRateHalted,
    failureRateHalted: state.failureRateHalted,
    failureRateWindowTasks,
    failureRateWindowFailures,
    failureRate,
  };
}

async function previewDrainStages(
  { taskType, stage, campaign = null, promptVersion = null, limit },
  operations = {},
) {
  const preview = operations.previewDrain || previewDrain;
  const filters = { taskType, campaign, promptVersion };
  if (stage !== "all") {
    return preview({ ...filters, stage, limit });
  }

  const stage1 = await preview({ ...filters, stage: "stage_1", limit });
  const remaining = limit - stage1.length;
  if (remaining <= 0) return stage1;
  const stage2 = await preview({ ...filters, stage: "stage_2", limit: remaining });
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

export async function runSuppress(parsed, run, operations = {}) {
  const campaign = required(parsed.campaign, "--campaign");
  const expectedSuppressionCount = positiveInteger(
    required(parsed.expected, "--expected"),
    "--expected",
  );
  const classificationRunIds = parseRunIds(required(parsed.run, "--run"));
  const preview = operations.previewLegitimacyGateBSuppression
    || previewLegitimacyGateBSuppression;
  const apply = operations.applyLegitimacyGateBSuppression
    || applyLegitimacyGateBSuppression;
  const render = operations.renderLegitimacyGateBCompletion
    || renderLegitimacyGateBCompletion;
  const write = operations.writeFile || writeFile;

  if (run.dry_run) {
    const result = await preview({
      campaign,
      promptVersion: LEGITIMACY_GATE_B_PROMPT_VERSION,
      expectedSuppressionCount,
    });
    return {
      status: "completed",
      counts: {
        selected: Number(result.candidateCount || 0),
        hidden: 0,
        suppression_ledger_rows_inserted: 0,
      },
      result: {
        dryRun: true,
        classificationRunIds,
        ...result,
      },
    };
  }

  const result = await apply({
    campaign,
    promptVersion: LEGITIMACY_GATE_B_PROMPT_VERSION,
    runId: run.id,
    classificationRunIds,
    expectedSuppressionCount,
  });
  const markdown = render(result);
  const outputPath = path.resolve(ROOT, LEGITIMACY_GATE_B_COMPLETION_PATH);
  await write(outputPath, markdown, "utf8");
  process.stdout.write(markdown);
  return {
    status: "completed",
    counts: {
      selected: result.preflight.candidateCount,
      hidden: result.verification.hiddenCount,
      suppression_ledger_rows_inserted: result.verification.runSuppressionLedgerRows,
      entity_change_events: result.verification.stampedEventCount,
      hard_exclusions_touched: result.preflight.hardExcludedCandidateCount,
      reports_written: 1,
    },
    result: {
      dryRun: false,
      classificationRunIds,
      outputPath,
      ...result,
    },
  };
}

export async function runStage3(parsed, run, operations = {}) {
  const loadData = operations.loadLegitimacyStage3ProposalData
    || loadLegitimacyStage3ProposalData;
  const data = await loadData();
  const concurrency = parsed.concurrency == null
    ? LEGITIMACY_STAGE3_FULL_CONCURRENCY
    : positiveInteger(parsed.concurrency, "--concurrency");
  const batchSize = parsed.batchSize == null ? 8 : positiveInteger(parsed.batchSize, "--batch-size");
  if (run.dry_run) {
    return {
      status: "completed",
      counts: {
        cohort_rows: data.counts.reviewRows,
        subjects: data.counts.subjects,
        external_calls: 0,
        serving_writes: 0,
      },
      result: {
        dryRun: true,
        campaign: LEGITIMACY_STAGE3_FULL_CAMPAIGN,
        promptVersion: LEGITIMACY_STAGE3_FULL_PROMPT_VERSION,
        concurrency,
        batchSize,
        counts: data.counts,
      },
    };
  }

  const webSearch = operations.webSearch || createOpenRouterAgentWebSearch();
  const execute = operations.executeLegitimacyStage3Full || executeLegitimacyStage3Full;
  const execution = await execute({
    data,
    runId: run.id,
    webSearch,
    apply: true,
    concurrency,
    batchSize,
    llmCeilingUsd: parsed.budget == null ? 500 : nonnegativeNumber(parsed.budget, "--budget"),
  });
  const suppressionCount = execution.plan.counts.suppressionRows;
  if (suppressionCount <= 0) {
    throw new Error("Stage 3 produced no suppression candidates; refusing an unexpected apply.");
  }
  const suppress = operations.applyLegitimacyGateBSuppression
    || applyLegitimacyGateBSuppression;
  const suppression = await suppress({
    campaign: LEGITIMACY_STAGE3_FULL_CAMPAIGN,
    promptVersion: LEGITIMACY_STAGE3_FULL_PROMPT_VERSION,
    runId: run.id,
    classificationRunIds: [String(run.id)],
    expectedSuppressionCount: suppressionCount,
    actorId: LEGITIMACY_STAGE3_APPLY_ACTOR_ID,
    actorLabelPrefix: "pass1_stage3_apply_run",
    sourceReasonPrefix: "pass1_stage3",
    eventReason: "pass1_stage3_legitimacy_suppression",
  });
  const spend = await (operations.getRunSpend || getRunSpend)(run.id);
  const completionMarkdown = (operations.renderLegitimacyStage3Completion
    || renderLegitimacyStage3Completion)({ execution, suppression, spendUsd: spend });
  const reviewMarkdown = (operations.renderLegitimacyStage3HumanReview
    || renderLegitimacyStage3HumanReview)(execution.plan);
  const write = operations.writeFile || writeFile;
  const completionPath = path.resolve(ROOT, LEGITIMACY_STAGE3_FULL_COMPLETION_PATH);
  const reviewPath = path.resolve(ROOT, LEGITIMACY_STAGE3_FULL_HUMAN_REVIEW_PATH);
  await write(completionPath, completionMarkdown, "utf8");
  await write(reviewPath, reviewMarkdown, "utf8");

  return {
    status: "completed",
    counts: {
      cohort_rows: execution.plan.counts.cohortRows,
      subjects: execution.plan.counts.subjects,
      keep: execution.plan.counts.keepRows,
      suppressed: execution.plan.counts.suppressionRows,
      needs_human_review: execution.plan.counts.humanReviewRows,
      websites_written: execution.persistence.websitesWritten,
      source_suppressions: suppression.verification.runSuppressionLedgerRows,
      reports_written: 2,
    },
    result: {
      dryRun: false,
      execution,
      suppression,
      spendUsd: spend,
      completionPath,
      reviewPath,
    },
  };
}

export async function runRedemption(parsed, run, operations = {}) {
  const loadCohort = operations.loadLegitimacyRedemptionCohort
    || loadLegitimacyRedemptionCohort;
  const cohort = await loadCohort();
  const concurrency = parsed.concurrency == null ? 24 : positiveInteger(parsed.concurrency, "--concurrency");
  const batchSize = parsed.batchSize == null ? 8 : positiveInteger(parsed.batchSize, "--batch-size");
  if (run.dry_run) {
    return {
      status: "completed",
      counts: { ...cohort.counts, external_calls: 0, serving_writes: 0 },
      result: { dryRun: true, cohort: cohort.counts, concurrency, batchSize },
    };
  }

  const webSearch = operations.webSearch || createOpenRouterAgentWebSearch();
  const priorContactSpendResult = await (operations.query || dbQuery)(`
    SELECT COALESCE(sum(call.cost_estimate_usd), 0)::numeric AS spend
    FROM fountain_ops.external_calls call
    JOIN fountain_ops.runs prior_run ON prior_run.id = call.run_id
    WHERE prior_run.command = 'redemption'
      AND prior_run.id <> $1::bigint
      AND call.provider = 'google_places'
  `, [run.id]);
  const priorContactSpendUsd = Number(priorContactSpendResult.rows[0]?.spend || 0);
  const remainingContactBudgetUsd = Math.max(0, 50 - priorContactSpendUsd);
  const agentLookup = operations.agentLookup || createRedemptionAgentLookup({
    runId: run.id,
    webSearch,
    placesContactCeilingUsd: remainingContactBudgetUsd,
  });
  const execute = operations.runLegitimacyRedemptionPass || runLegitimacyRedemptionPass;
  const pass = await execute({
    cohort,
    runId: run.id,
    agentLookup,
    concurrency,
    batchSize,
  });
  pass.lookupStats = typeof agentLookup.stats === "function" ? {
    ...agentLookup.stats(),
    priorPlacesContactSpendUsd: priorContactSpendUsd,
    cumulativePlacesContactSpendUsd: priorContactSpendUsd + agentLookup.stats().placesReservedUsd,
  } : null;
  const spendBeforeApply = await (operations.getRunSpend || getRunSpend)(run.id);
  const ceiling = parsed.budget == null ? 500 : nonnegativeNumber(parsed.budget, "--budget");
  if (spendBeforeApply > ceiling) {
    throw new Error(`Redemption LLM/provider ceiling exceeded: $${spendBeforeApply.toFixed(4)} > $${ceiling.toFixed(2)}.`);
  }
  const redemptionCount = pass.counts.redeem;
  const apply = redemptionCount > 0
    ? await (operations.applyLegitimacyRedemptions || applyLegitimacyRedemptions)({
        pass,
        runId: run.id,
        expectedRedemptionCount: redemptionCount,
      })
    : null;
  const markdown = (operations.renderLegitimacyRedemptionReport
    || renderLegitimacyRedemptionReport)({ cohort, pass, apply });
  const outputPath = path.resolve(ROOT, LEGITIMACY_REDEMPTION_REPORT_PATH);
  await (operations.writeFile || writeFile)(outputPath, markdown, "utf8");
  return {
    status: "completed",
    counts: {
      suppressed_rows_read: cohort.counts.suppressedRowsRead,
      lookup_candidates: cohort.counts.candidates,
      skipped: cohort.counts.skipped,
      official_websites: pass.counts.officialWebsites,
      redeemed: redemptionCount,
      retained_suppressed: pass.counts.retainSuppressed,
      websites_written: pass.lookupStats?.websitesWritten || 0,
      reports_written: 1,
    },
    result: {
      dryRun: false,
      cohort: cohort.counts,
      pass,
      apply,
      spendUsd: spendBeforeApply,
      outputPath,
    },
  };
}

export async function runFinalReport(parsed, run, operations = {}) {
  const beforePath = path.resolve(
    ROOT,
    parsed.before || "docs/runs/enrichment-before-census.json",
  );
  const afterPath = path.resolve(
    ROOT,
    parsed.after || "docs/runs/enrichment-after-census.json",
  );
  const outputPath = path.resolve(
    ROOT,
    parsed.output || path.join("docs", "runs", ENRICHMENT_FINAL_REPORT_FILENAME),
  );
  const read = operations.readFile || readFile;
  const [beforeText, afterText, selectionText] = await Promise.all([
    read(beforePath, "utf8"),
    read(afterPath, "utf8"),
    parsed.runsFile
      ? read(path.resolve(ROOT, parsed.runsFile), "utf8")
      : Promise.resolve(parsed.runSelection),
  ]).catch((error) => {
    throw new Error(`Final-report input evidence is unavailable: ${error.message}`);
  });
  const before = parseCensusEvidence(beforeText, "before", beforePath);
  const after = parseCensusEvidence(afterText, "after", afterPath);
  const rawSelection = parseJsonEvidence(
    selectionText,
    "run selection",
    parsed.runsFile ? path.resolve(ROOT, parsed.runsFile) : "--run-selection",
  );
  const runIds = finalRunSelection(rawSelection);
  const menuRunIds = selectedMenuExtractRunIds(runIds);
  const menuPricesBeforePath = path.resolve(
    ROOT,
    parsed.menuPricesBefore
      || path.join("docs", "runs", ENRICHMENT_MENU_PRICES_CENSUS_FILENAME),
  );
  let menuPricesBefore = null;
  if (menuRunIds.length > 0 || parsed.menuPricesBefore) {
    let menuPricesText;
    try {
      menuPricesText = await read(menuPricesBeforePath, "utf8");
    } catch (error) {
      throw new Error(`Final-report input evidence is unavailable: ${error.message}`);
    }
    menuPricesBefore = parseCensusEvidence(
      menuPricesText,
      "menu-prices",
      menuPricesBeforePath,
    );
  }
  const transact = operations.withTransaction || withTransaction;
  const loadPersisted = operations.loadPersistedLegitimacyCloseout
    || loadPersistedLegitimacyCloseout;
  const loadFinal = operations.loadEnrichmentFinalReportData
    || loadEnrichmentFinalReportData;
  const data = await transact(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const persisted = await loadPersisted({
      stage3RunId: FINAL_STAGE3_RUN_ID,
      redemptionRunId: FINAL_REDEMPTION_RUN_ID,
    }, { query: tx });
    return loadFinal({
      before,
      after,
      stage3: persisted.stage3,
      redemption: persisted.redemption,
      runIds,
      menuPricesBefore,
      generatedAt: (operations.now || (() => new Date()))().toISOString(),
    }, { query: tx });
  });
  const render = operations.renderEnrichmentFinalReport
    || renderEnrichmentFinalReport;
  const markdown = render(data);
  let writtenPath = null;
  if (!run.dry_run) {
    (operations.assertEnrichmentFinalReconciliation
      || assertEnrichmentFinalReconciliation)(data);
    writtenPath = await (operations.writeEnrichmentFinalReport
      || writeEnrichmentFinalReport)(data, { outputPath });
  }
  (operations.writeStdout || process.stdout.write.bind(process.stdout))(
    `${markdown.trimEnd()}\n`,
  );
  return {
    status: "completed",
    counts: {
      reports_rendered: 1,
      files_written: writtenPath ? 1 : 0,
      selected_runs: data.runSelection.ids.length,
      external_calls: data.external.calls,
      task_rows: data.tasks.total,
      needs_human_review: data.stage3.humanReviewRows,
      redeemed: data.redemption.redeemRows,
      reconciliation_failures: data.reconciliation.failures.length,
    },
    result: {
      dryRun: Boolean(run.dry_run),
      stage3RunId: FINAL_STAGE3_RUN_ID,
      redemptionRunId: FINAL_REDEMPTION_RUN_ID,
      beforePath,
      afterPath,
      menuPricesBeforePath: menuPricesBefore ? menuPricesBeforePath : null,
      runSelection: data.runSelection,
      reconciliation: data.reconciliation,
      outputPath: writtenPath,
    },
  };
}

export async function runCensus(parsed, run, operations = {}) {
  const scope = parsed.scope || "before";
  if (!new Set(["before", "post-contact", "menu-prices", "image-classify", "after"]).has(scope)) {
    throw new Error(
      "--scope for census must be before, post-contact, menu-prices, image-classify, or after.",
    );
  }
  const load = operations.loadEnrichmentCensus || loadEnrichmentCensus;
  const snapshot = await load({
    label: `${scope.replaceAll("-", "_")}_enrichment`,
    capturedAt: new Date().toISOString(),
  });
  const beforeJsonPath = path.resolve(ROOT, "docs/runs/enrichment-before-census.json");
  const reportPath = path.resolve(ROOT, `docs/runs/enrichment-${scope}-census.md`);
  const jsonPath = path.resolve(ROOT, `docs/runs/enrichment-${scope}-census.json`);
  const write = operations.writeFile || writeFile;

  if (scope === "before") {
    const plan = (operations.buildEnrichmentEnqueuePlan || buildEnrichmentEnqueuePlan)(snapshot);
    if (run.dry_run) {
      return {
        status: "completed",
        counts: {
          eligible: snapshot.population.eligible,
          expected_tasks: plan.expectedInsertions,
          inserted: 0,
        },
        result: { dryRun: true, scope, snapshot, plan },
      };
    }
    const enqueue = await (operations.enqueueEnrichmentPlan || enqueueEnrichmentPlan)({
      plan,
      liveSnapshot: snapshot,
      runId: run.id,
      implementedTaskTypes: ENRICHMENT_TASK_TYPES,
      apply: true,
    });
    const markdown = (operations.renderEnrichmentCensusReport
      || renderEnrichmentCensusReport)({ before: snapshot, plan });
    await write(reportPath, markdown, "utf8");
    await write(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return {
      status: "completed",
      counts: {
        eligible: snapshot.population.eligible,
        expected_tasks: plan.expectedInsertions,
        inserted: enqueue.insertedCount,
        reports_written: 2,
      },
      result: { dryRun: false, scope, snapshot, plan, enqueue, reportPath, jsonPath },
    };
  }

  if (scope === "image-classify") {
    const plan = (operations.buildImageClassifyEnqueuePlan
      || buildImageClassifyEnqueuePlan)(snapshot);
    if (run.dry_run) {
      return {
        status: "completed",
        counts: {
          eligible: snapshot.population.eligible,
          unclassified_images: plan.unclassifiedImageCount,
          expected_tasks: plan.expectedInsertions,
          inserted: 0,
        },
        result: { dryRun: true, scope, snapshot, plan },
      };
    }
    const enqueue = await (operations.enqueueImageClassifyPlan
      || enqueueImageClassifyPlan)({
      plan,
      liveSnapshot: snapshot,
      runId: run.id,
      implementedTaskTypes: [ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE],
      apply: true,
    });
    const markdown = (operations.renderImageClassifyEnqueueReport
      || renderImageClassifyEnqueueReport)({ snapshot, plan, enqueue });
    await write(reportPath, markdown, "utf8");
    await write(jsonPath, `${JSON.stringify({ snapshot, plan, enqueue }, null, 2)}\n`, "utf8");
    return {
      status: "completed",
      counts: {
        eligible: snapshot.population.eligible,
        unclassified_images: plan.unclassifiedImageCount,
        expected_tasks: plan.expectedInsertions,
        inserted: enqueue.insertedCount,
        reports_written: 2,
      },
      result: { dryRun: false, scope, snapshot, plan, enqueue, reportPath, jsonPath },
    };
  }

  if (scope === "menu-prices") {
    const plan = await (operations.loadMenuPricesEnqueuePlan
      || loadMenuPricesEnqueuePlan)(snapshot);
    if (run.dry_run) {
      return {
        status: "completed",
        counts: {
          eligible: snapshot.population.eligible,
          menu_missing_raw: plan.menuMissing.rawCount,
          menu_missing_adoptions: plan.expectedAdoptions,
          prices_missing_raw: plan.pricesMissing.rawCount,
          prices_missing_insertions: plan.expectedInsertions,
          expected_tasks: plan.expectedTasks,
          adopted: 0,
          inserted: 0,
        },
        result: { dryRun: true, scope, snapshot, plan },
      };
    }
    const enqueue = await (operations.enqueueMenuPricesPlan || enqueueMenuPricesPlan)({
      plan,
      liveSnapshot: snapshot,
      runId: run.id,
      implementedTaskTypes: ["menu_extract"],
      apply: true,
    });
    const markdown = (operations.renderMenuPricesEnqueueReport
      || renderMenuPricesEnqueueReport)({ snapshot, plan, enqueue });
    await write(reportPath, markdown, "utf8");
    await write(jsonPath, `${JSON.stringify({ snapshot, plan, enqueue }, null, 2)}\n`, "utf8");
    return {
      status: "completed",
      counts: {
        eligible: snapshot.population.eligible,
        menu_missing_raw: plan.menuMissing.rawCount,
        menu_missing_adoptions: plan.expectedAdoptions,
        prices_missing_raw: plan.pricesMissing.rawCount,
        prices_missing_insertions: plan.expectedInsertions,
        expected_tasks: plan.expectedTasks,
        adopted: enqueue.adoptedCount,
        inserted: enqueue.insertedCount,
        reports_written: 2,
      },
      result: { dryRun: false, scope, snapshot, plan, enqueue, reportPath, jsonPath },
    };
  }

  if (scope === "post-contact") {
    const plan = await (operations.loadPostContactEnqueuePlan
      || loadPostContactEnqueuePlan)(snapshot);
    if (run.dry_run) {
      return {
        status: "completed",
        counts: {
          eligible: snapshot.population.eligible,
          expected_tasks: plan.expectedInsertions,
          inserted: 0,
        },
        result: { dryRun: true, scope, snapshot, plan },
      };
    }
    const enqueue = await (operations.enqueuePostContactPlan
      || enqueuePostContactPlan)({
      plan,
      liveSnapshot: snapshot,
      runId: run.id,
      implementedTaskTypes: ENRICHMENT_POST_CONTACT_TASK_TYPES,
      apply: true,
    });
    const markdown = (operations.renderPostContactEnqueueReport
      || renderPostContactEnqueueReport)({ snapshot, plan, enqueue });
    await write(reportPath, markdown, "utf8");
    await write(jsonPath, `${JSON.stringify({ snapshot, plan, enqueue }, null, 2)}\n`, "utf8");
    return {
      status: "completed",
      counts: {
        eligible: snapshot.population.eligible,
        expected_tasks: plan.expectedInsertions,
        inserted: enqueue.insertedCount,
        reports_written: 2,
      },
      result: { dryRun: false, scope, snapshot, plan, enqueue, reportPath, jsonPath },
    };
  }

  let before;
  try {
    before = JSON.parse(await (operations.readFile || readFile)(beforeJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`Before-census evidence is unavailable at ${beforeJsonPath}: ${error.message}`);
  }
  const markdown = (operations.renderEnrichmentCensusReport
    || renderEnrichmentCensusReport)({ before, after: snapshot });
  if (!run.dry_run) {
    await write(reportPath, markdown, "utf8");
    await write(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }
  return {
    status: "completed",
    counts: {
      eligible_before: before.population.eligible,
      eligible_after: snapshot.population.eligible,
      reports_written: run.dry_run ? 0 : 2,
    },
    result: { dryRun: Boolean(run.dry_run), scope, before, after: snapshot, reportPath, jsonPath },
  };
}

export async function runReport(parsed, run, operations = {}) {
  const targetRunId = required(parsed.run, "--run");
  if (parsed.campaign === LEGITIMACY_GATE_B_CAMPAIGN) {
    const loadFull = operations.loadLegitimacyGateBReportData
      || loadLegitimacyGateBReportData;
    const renderFull = operations.renderLegitimacyGateBReport
      || renderLegitimacyGateBReport;
    const renderReviewQueue = operations.renderLegitimacyReviewQueue
      || renderLegitimacyReviewQueue;
    const write = operations.writeFile || writeFile;
    const runIds = parseRunIds(targetRunId);
    const data = await loadFull({
      campaign: LEGITIMACY_GATE_B_CAMPAIGN,
      promptVersion: LEGITIMACY_GATE_B_PROMPT_VERSION,
      runIds,
    });
    const markdown = renderFull(data);
    const reviewMarkdown = renderReviewQueue(data);
    const outputPath = run.dry_run
      ? null
      : path.resolve(ROOT, "docs/runs/pass1-gate-b-dry-run.md");
    const reviewOutputPath = run.dry_run
      ? null
      : path.resolve(ROOT, "docs/runs/pass1-review-queue.md");
    if (outputPath) {
      await Promise.all([
        write(outputPath, markdown, "utf8"),
        write(reviewOutputPath, reviewMarkdown, "utf8"),
      ]);
    }
    process.stdout.write(`${markdown.trimEnd()}\n\n${reviewMarkdown.trimEnd()}\n`);
    return {
      status: "completed",
      counts: {
        reports_rendered: 2,
        files_written: outputPath ? 2 : 0,
        review_rows: Array.isArray(data.reviewRows) ? data.reviewRows.length : 0,
      },
      result: {
        dryRun: run.dry_run,
        campaign: parsed.campaign,
        targetRunIds: runIds,
        outputPath,
        reviewOutputPath,
        classCounts: data.classCounts,
        suppressionCount: data.suppressionCount,
      },
    };
  }
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

export async function runTaxonomyPresent(parsed, run, operations = {}) {
  const model = parsed.model || TAXONOMY_PRESENTATION_DEFAULT_MODEL;
  const batchSize = parsed.batchSize == null
    ? TAXONOMY_PRESENTATION_DEFAULT_BATCH_SIZE
    : positiveInteger(parsed.batchSize, "--batch-size");
  const limit = parsed.limit == null ? 100_000 : positiveInteger(parsed.limit, "--limit");
  const concurrency = parsed.concurrency == null
    ? TAXONOMY_PRESENTATION_DEFAULT_CONCURRENCY
    : positiveInteger(parsed.concurrency, "--concurrency");
  const budgetUsd = parsed.budget == null ? null : nonnegativeNumber(parsed.budget, "--budget");
  const execute = operations.runTaxonomyPresentationClassification || runTaxonomyPresentationClassification;
  const outcome = await execute({
    runId: run.id,
    apply: !run.dry_run,
    model,
    batchSize,
    concurrency,
    limit,
    budgetUsd,
    query: operations.query || dbQuery,
    ...(operations.llmClient ? { llmClient: operations.llmClient } : {}),
    getSpend: operations.getRunSpend || ((runId) => getRunSpend(runId)),
    onProgress: operations.onProgress || ((progress) => {
      console.error(
        `taxonomy-present batch ${progress.completedBatches}/${progress.totalBatches}; classified ${progress.classified}`,
      );
    }),
  });
  return {
    status: outcome.budget_exhausted ? "budget_exhausted" : "completed",
    counts: {
      pending: outcome.pending,
      deterministic: outcome.deterministic,
      llm_terms: outcome.llm_terms,
      llm_batches: outcome.llm_batches,
      completed_batches: outcome.completed_batches || 0,
      written: outcome.written,
      needs_review: outcome.summary?.needs_review || 0,
    },
    result: {
      dryRun: run.dry_run,
      model,
      batchSize,
      concurrency,
      limit,
      budgetUsd,
      budget_exhausted: outcome.budget_exhausted,
      summary: outcome.summary || null,
    },
  };
}

export async function runOfferingDisplay(parsed, run, operations = {}) {
  const locationId = parsed.locationId == null
    ? null
    : positiveInteger(parsed.locationId, "--location-id");
  const recompute = operations.recomputeOfferingDisplay || recomputeOfferingDisplay;
  const outcome = await recompute({
    query: operations.query || dbQuery,
    locationId,
    apply: !run.dry_run,
  });
  return {
    status: "completed",
    counts: {
      locations_scanned: outcome.locations_scanned,
      offerings_scanned: outcome.offerings_scanned,
      suppressions: outcome.summary.suppressions,
      price_conflicts: outcome.summary.price_conflicts,
      suppressions_written: outcome.write.active_suppressions,
      suppressions_deactivated: outcome.write.deactivated_suppressions,
    },
    result: {
      dryRun: run.dry_run,
      locationId,
      summary: outcome.summary,
      price_conflicts: outcome.price_conflicts,
    },
  };
}

export async function runOfferingTranslate(parsed, run, operations = {}) {
  const execute = operations.runOfferingTranslation || runOfferingTranslation;
  const locationId = parsed.locationId == null ? null : positiveInteger(parsed.locationId, "--location-id");
  const model = parsed.model || OFFERING_TRANSLATION_MODEL;
  const verificationModel = parsed.verificationModel || OFFERING_TRANSLATION_VERIFICATION_MODEL;
  const batchSize = parsed.batchSize == null
    ? OFFERING_TRANSLATION_BATCH_SIZE
    : positiveInteger(parsed.batchSize, "--batch-size");
  const concurrency = parsed.concurrency == null
    ? OFFERING_TRANSLATION_CONCURRENCY
    : positiveInteger(parsed.concurrency, "--concurrency");
  const limit = parsed.limit == null ? 100_000 : positiveInteger(parsed.limit, "--limit");
  const budgetUsd = parsed.budget == null ? null : nonnegativeNumber(parsed.budget, "--budget");
  const outcome = await execute({
    query: operations.query || dbQuery,
    runId: run.id,
    apply: !run.dry_run,
    locationId,
    model,
    verificationModel,
    batchSize,
    concurrency,
    limit,
    budgetUsd,
    ...(operations.llmClient ? { llmClient: operations.llmClient } : {}),
    onProgress: operations.onProgress || ((progress) => {
      console.error(`offering-translate batch ${progress.completedBatches}/${progress.totalBatches}; classified ${progress.classified}`);
    }),
  });
  return {
    status: outcome.budget_exhausted ? "budget_exhausted" : "completed",
    counts: outcome,
    result: { dryRun: run.dry_run, locationId, model, verificationModel, batchSize, concurrency, limit, budgetUsd, ...outcome },
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
  if (parsed.command === "final-report") {
    if (parsed.runsFile != null && parsed.runSelection != null) {
      throw new Error("--runs-file and --run-selection are mutually exclusive.");
    }
    if (parsed.runsFile == null && parsed.runSelection == null) {
      throw new Error("final-report requires --runs-file or --run-selection.");
    }
    return;
  }

  if (parsed.command === "enqueue") {
    if (parsed.sample != null && parsed.scope != null) {
      throw new Error("--sample and --scope are mutually exclusive.");
    }
    if (parsed.sample != null) {
      if (parsed.sample !== "gate-a") throw new Error("--sample must be gate-a.");
      if (parsed.task !== "legitimacy_check") {
        throw new Error("--sample gate-a is supported only for --task legitimacy_check.");
      }
      if (parsed.where != null) throw new Error("--sample gate-a and --where are mutually exclusive.");
      if (parsed.limit != null) {
        throw new Error("--sample gate-a always selects its fixed 300-row cohort; omit --limit.");
      }
      return;
    }
    if (parsed.scope != null) {
      if (parsed.scope !== "full") throw new Error("--scope must be full.");
      if (parsed.task !== "legitimacy_check") {
        throw new Error("--scope full is supported only for --task legitimacy_check.");
      }
      if (parsed.where != null) throw new Error("--scope full and --where are mutually exclusive.");
      if (parsed.limit != null) throw new Error("--scope full selects the complete eligible cohort; omit --limit.");
      return;
    }
    if (parsed.where == null) {
      throw new Error("--where is required unless using the legitimacy Gate A sample or Gate B full scope.");
    }
  }

  if (parsed.command === "taxonomy-present" && parsed.apply && parsed.budget == null) {
    throw new Error("taxonomy-present --apply requires an explicit --budget.");
  }
  if (parsed.command === "offering-translate" && parsed.apply && parsed.budget == null) {
    throw new Error("offering-translate --apply requires an explicit --budget.");
  }

  if (parsed.command === "drain") {
    if (parsed.task === "legitimacy_check") {
      const hasCampaign = parsed.campaign != null;
      const hasPromptVersion = parsed.promptVersion != null;
      if (hasCampaign !== hasPromptVersion) {
        throw new Error(
          "--task legitimacy_check requires --campaign and --prompt-version together when either is provided.",
        );
      }
      if (hasCampaign && !String(parsed.campaign).trim()) {
        throw new Error("--campaign must be a non-empty string.");
      }
      if (hasPromptVersion && !String(parsed.promptVersion).trim()) {
        throw new Error("--prompt-version must be a non-empty string.");
      }
    }
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
    if (![LEGITIMACY_GATE_A_CAMPAIGN, LEGITIMACY_GATE_B_CAMPAIGN].includes(parsed.campaign)) {
      throw new Error(
        `--campaign must be ${LEGITIMACY_GATE_A_CAMPAIGN} or ${LEGITIMACY_GATE_B_CAMPAIGN}.`,
      );
    }
    if (parsed.campaign === LEGITIMACY_GATE_B_CAMPAIGN && parsed.output != null) {
      throw new Error("Gate B report paths are fixed; omit --output.");
    }
  }

  if (parsed.command === "suppress") {
    if (parsed.campaign !== LEGITIMACY_GATE_B_CAMPAIGN) {
      throw new Error(`--campaign must be ${LEGITIMACY_GATE_B_CAMPAIGN} for suppress.`);
    }
    required(parsed.run, "--run");
    parseRunIds(parsed.run);
    positiveInteger(required(parsed.expected, "--expected"), "--expected");
  }
}

function parseRunIds(value) {
  const values = String(value).split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0 || values.some((item) => !/^[1-9]\d*$/u.test(item))) {
    throw new Error("--run must be a comma-separated list of positive run ids.");
  }
  return [...new Set(values)];
}

function parseCensusEvidence(value, label, source) {
  const parsed = parseJsonEvidence(value, `${label} census`, source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} census evidence at ${source} must be a JSON object.`);
  }
  const snapshot = parsed.snapshot ?? parsed[label] ?? parsed;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error(`${label} census evidence at ${source} has no snapshot object.`);
  }
  return snapshot;
}

function parseJsonEvidence(value, label, source) {
  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`Invalid ${label} JSON at ${source}: ${error.message}`);
  }
}

function finalRunSelection(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Final-report run selection must be a JSON object.");
  }
  const selected = input.runIds ?? input.run_ids ?? input.selection ?? input;
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) {
    throw new Error("Final-report run selection must contain a structured object.");
  }
  const requestedStage3 = selected.stage3 ?? selected.stage3_run ?? selected.stage3Run;
  const requestedRedemption = selected.redemption
    ?? selected.redemption_run
    ?? selected.redemptionRun;
  if (requestedStage3 != null && String(requestedStage3) !== FINAL_STAGE3_RUN_ID) {
    throw new Error(`Final-report Stage 3 evidence is fixed to run ${FINAL_STAGE3_RUN_ID}.`);
  }
  if (requestedRedemption != null && String(requestedRedemption) !== FINAL_REDEMPTION_RUN_ID) {
    throw new Error(
      `Final-report redemption evidence is fixed to run ${FINAL_REDEMPTION_RUN_ID}.`,
    );
  }
  const normalized = normalizeFinalReportRunIds({
    ...selected,
    stage3: FINAL_STAGE3_RUN_ID,
    redemption: FINAL_REDEMPTION_RUN_ID,
  });
  if (!normalized.ids.some((runId) => ![
    FINAL_STAGE3_RUN_ID,
    FINAL_REDEMPTION_RUN_ID,
  ].includes(runId))) {
    throw new Error("Final-report run selection must include at least one enrichment run.");
  }
  return normalized;
}

function nonnegativeNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a nonnegative number.`);
  return parsed;
}

function usage() {
  return [
    "Usage: node pipeline/cli.mjs <command> [options]",
    "Commands: enqueue, drain, report, suppress, stage3, redemption, final-report, migrate, census, maintain, taxonomy-present, offering-display, offering-translate",
    "Final closeout: final-report --runs-file <selection.json> [--before <json>] [--after <json>] [--menu-prices-before <json>] [--output <md>] [--apply]",
    "Taxonomy presentation: taxonomy-present [--model <slug>] [--batch-size <n>] [--concurrency <n>] [--limit <n>] [--budget <usd>] [--apply]",
    "Offering display: offering-display [--location-id <id>] [--apply]",
    "Offering translation: offering-translate [--location-id <id>] [--model <slug>] [--verification-model <slug>] [--batch-size <n>] [--concurrency <n>] [--limit <n>] [--budget <usd>] [--apply]",
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
