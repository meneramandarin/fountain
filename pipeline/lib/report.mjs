import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TASK_STATUS_ORDER = ["pending", "claimed", "done", "failed", "skipped"];

/**
 * Render one pipeline run as deterministic markdown.
 *
 * This function is deliberately pure: it does not query the database, inspect
 * the environment, or write a report file.
 */
export function renderRunReport({
  run,
  externalCalls = [],
  taskSummary = {},
  backlogSummary = null,
  changeEvents = [],
}) {
  if (!run || typeof run !== "object") {
    throw new TypeError("renderRunReport requires a run object.");
  }

  const runId = normalizeRunId(run.id);
  const calls = Array.isArray(externalCalls) ? externalCalls : [];
  const outcomes = normalizeTaskSummary(taskSummary);
  const changes = normalizeChangeEvents(changeEvents);
  const callTotals = summarizeExternalCalls(calls);
  const lines = [
    `# Pipeline Run ${runId}`,
    "",
    "## Run summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    tableRow("Command", run.command),
    tableRow("Status", run.status),
    tableRow("Dry run", formatBoolean(run.dry_run)),
    tableRow("Started", formatTimestamp(run.started_at)),
    tableRow("Finished", formatTimestamp(run.finished_at)),
    tableRow("Budget", formatUsd(run.budget_usd)),
    tableRow("Estimated spend", formatUsd(run.spent_usd_estimate)),
  ];

  if (run.notes != null && String(run.notes).trim()) {
    lines.push(tableRow("Notes", run.notes));
  }

  appendJsonSection(lines, "Arguments", run.args);
  appendCountsSection(lines, run.counts);
  appendTaskOutcomes(lines, outcomes);
  appendTaskBacklog(lines, backlogSummary);
  appendChangeEvents(lines, changes);
  appendExternalCallTotals(lines, callTotals);
  appendExternalCallDetails(lines, calls);

  return `${lines.join("\n")}\n`;
}

/**
 * Query the operational tables and render the selected run.
 *
 * Pass either a query function or an object with a pg-compatible query method
 * to keep tests and callers independent from the process-wide DB connection.
 */
export async function loadRunReport(runId, { query: queryOverride } = {}) {
  const data = await loadRunReportData(runId, { query: queryOverride });
  return renderRunReport(data);
}

export async function loadRunReportData(runId, { query: queryOverride } = {}) {
  const normalizedRunId = normalizeRunId(runId);
  const query = queryOverride || await loadDefaultQuery();

  const runResult = await executeQuery(
    query,
    `
      SELECT *
      FROM fountain_ops.runs
      WHERE id = $1
    `,
    [normalizedRunId],
  );
  const run = rowsFrom(runResult)[0];

  if (!run) {
    const error = new Error(`Pipeline run ${normalizedRunId} was not found.`);
    error.code = "RUN_NOT_FOUND";
    throw error;
  }

  const taskType = typeof run.args?.task === "string" ? run.args.task : null;
  const [callsResult, tasksResult, backlogResult, changesResult] = await Promise.all([
    executeQuery(
      query,
      `
        SELECT
          id,
          run_id,
          provider,
          call_type,
          entity_id,
          model,
          request_fingerprint,
          status,
          http_status,
          tokens,
          cost_estimate_usd,
          created_at
        FROM fountain_ops.external_calls
        WHERE run_id = $1
        ORDER BY created_at, id
      `,
      [normalizedRunId],
    ),
    executeQuery(
      query,
      `
        SELECT status, count(*)::integer AS count
        FROM fountain_ops.task_queue
        WHERE run_id = $1
        GROUP BY status
        ORDER BY status
      `,
      [normalizedRunId],
    ),
    taskType
      ? executeQuery(
        query,
        `
          SELECT status, count(*)::integer AS count
          FROM fountain_ops.task_queue
          WHERE task_type = $1
          GROUP BY status
          ORDER BY status
        `,
        [taskType],
      )
      : Promise.resolve({ rows: [] }),
    executeQuery(
      query,
      `
        SELECT
          entity_type,
          action,
          COALESCE(reason, '_none') AS reason,
          count(*)::integer AS count
        FROM fountain.entity_change_events
        WHERE metadata->>'run_id' = $1::text
        GROUP BY entity_type, action, COALESCE(reason, '_none')
        ORDER BY entity_type, action, reason
      `,
      [normalizedRunId],
    ),
  ]);

  return {
    run,
    externalCalls: rowsFrom(callsResult),
    taskSummary: rowsFrom(tasksResult),
    backlogSummary: taskType
      ? { taskType, counts: rowsFrom(backlogResult) }
      : null,
    changeEvents: rowsFrom(changesResult),
  };
}

/**
 * Persist an already-rendered report. No other export in this module writes to
 * disk, so the CLI can make this helper conditional on --apply.
 */
export async function writeRunReport(
  runId,
  markdown,
  { outputDir = path.join(process.cwd(), "docs", "runs") } = {},
) {
  const normalizedRunId = normalizeRunId(runId);
  if (typeof markdown !== "string") {
    throw new TypeError("writeRunReport requires rendered markdown as a string.");
  }

  const resolvedOutputDir = path.resolve(outputDir);
  const reportPath = path.join(resolvedOutputDir, `run-${normalizedRunId}.md`);
  await mkdir(resolvedOutputDir, { recursive: true });
  await writeFile(reportPath, markdown, "utf8");
  return reportPath;
}

export function summarizeExternalCalls(calls = []) {
  const summary = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    byProvider: {},
    byStatus: {},
  };

  for (const call of calls) {
    const tokens = normalizeTokens(call?.tokens);
    const cost = finiteNumber(call?.cost_estimate_usd) || 0;
    const provider = displayValue(call?.provider, "unknown");
    const status = displayValue(call?.status, "unknown");

    summary.calls += 1;
    summary.inputTokens += tokens.input;
    summary.outputTokens += tokens.output;
    summary.totalTokens += tokens.total;
    summary.estimatedCostUsd += cost;
    summary.byProvider[provider] ||= { calls: 0, estimatedCostUsd: 0 };
    summary.byProvider[provider].calls += 1;
    summary.byProvider[provider].estimatedCostUsd += cost;
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
  }

  return summary;
}

function appendJsonSection(lines, heading, value) {
  lines.push("", `## ${heading}`, "");
  if (value == null || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)) {
    lines.push("_None recorded._");
    return;
  }

  lines.push("```json", stableJson(value), "```");
}

function appendCountsSection(lines, counts) {
  lines.push("", "## Recorded counts", "");
  if (!counts || typeof counts !== "object" || Array.isArray(counts) || Object.keys(counts).length === 0) {
    lines.push("_None recorded._");
    return;
  }

  lines.push("| Metric | Value |", "| --- | --- |");
  for (const key of Object.keys(counts).sort()) {
    const value = typeof counts[key] === "object" && counts[key] !== null
      ? stableJson(counts[key], 0)
      : counts[key];
    lines.push(tableRow(key, value));
  }
}

function appendTaskOutcomes(lines, outcomes) {
  lines.push("", "## Task outcomes", "");
  if (outcomes.length === 0) {
    lines.push("_No task outcomes were recorded for this run._");
    return;
  }

  lines.push("| Status | Count |", "| --- | ---: |");
  let total = 0;
  for (const { status, count } of outcomes) {
    total += count;
    lines.push(tableRow(status, count));
  }
  lines.push(tableRow("**Total**", `**${total}**`, { escape: false }));
}

function appendTaskBacklog(lines, backlogSummary) {
  if (!backlogSummary?.taskType) return;
  const outcomes = normalizeTaskSummary(backlogSummary.counts || {});
  lines.push("", `## Current \`${backlogSummary.taskType}\` backlog`, "");
  if (outcomes.length === 0) {
    lines.push("_No queue rows currently exist for this task type._");
    return;
  }
  lines.push("| Status | Count |", "| --- | ---: |");
  let total = 0;
  for (const { status, count } of outcomes) {
    total += count;
    lines.push(tableRow(status, count));
  }
  lines.push(tableRow("**Total**", `**${total}**`, { escape: false }));
}

function appendChangeEvents(lines, changes) {
  lines.push("", "## Entity change events", "");
  if (changes.length === 0) {
    lines.push("_No run-linked serving mutations were recorded._");
    return;
  }
  lines.push(
    "| Entity type | Action | Reason | Count |",
    "| --- | --- | --- | ---: |",
  );
  let total = 0;
  for (const change of changes) {
    total += change.count;
    lines.push(
      `| ${escapeTableCell(change.entityType)} | ${escapeTableCell(change.action)} | ${escapeTableCell(change.reason)} | ${change.count} |`,
    );
  }
  lines.push(`| **Total** |  |  | **${total}** |`);
}

function appendExternalCallTotals(lines, totals) {
  lines.push(
    "",
    "## External call totals",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    tableRow("Calls", totals.calls),
    tableRow("Input tokens", totals.inputTokens),
    tableRow("Output tokens", totals.outputTokens),
    tableRow("Total tokens", totals.totalTokens),
    tableRow("Estimated cost", formatUsd(totals.estimatedCostUsd)),
  );

  const providers = Object.entries(totals.byProvider).sort(([left], [right]) => left.localeCompare(right));
  if (providers.length > 0) {
    lines.push("", "### By provider", "", "| Provider | Calls | Estimated cost |", "| --- | ---: | ---: |");
    for (const [provider, value] of providers) {
      lines.push(`| ${escapeTableCell(provider)} | ${value.calls} | ${formatUsd(value.estimatedCostUsd)} |`);
    }
  }

  const statuses = Object.entries(totals.byStatus).sort(([left], [right]) => left.localeCompare(right));
  if (statuses.length > 0) {
    lines.push("", "### By call status", "", "| Status | Calls |", "| --- | ---: |");
    for (const [status, count] of statuses) {
      lines.push(tableRow(status, count));
    }
  }
}

function appendExternalCallDetails(lines, calls) {
  lines.push("", "## External calls", "");
  if (calls.length === 0) {
    lines.push("_No external calls were recorded for this run._");
    return;
  }

  lines.push(
    "| ID | Provider | Type | Status | HTTP | Model | Tokens | Cost | Created |",
    "| ---: | --- | --- | --- | ---: | --- | ---: | ---: | --- |",
  );
  for (const call of calls) {
    const tokens = normalizeTokens(call?.tokens);
    lines.push([
      displayValue(call?.id),
      displayValue(call?.provider),
      displayValue(call?.call_type),
      displayValue(call?.status),
      displayValue(call?.http_status),
      displayValue(call?.model),
      tokens.total,
      formatUsd(call?.cost_estimate_usd),
      formatTimestamp(call?.created_at),
    ].map(escapeTableCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
}

function normalizeTaskSummary(taskSummary) {
  const counts = new Map();
  const entries = Array.isArray(taskSummary)
    ? taskSummary.map((row) => [row?.status, row?.count])
    : Object.entries(taskSummary || {});

  for (const [rawStatus, rawCount] of entries) {
    const status = String(rawStatus || "unknown");
    const count = finiteNumber(rawCount);
    if (count == null || count < 0) {
      continue;
    }
    counts.set(status, (counts.get(status) || 0) + count);
  }

  const statusRank = new Map(TASK_STATUS_ORDER.map((status, index) => [status, index]));
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((left, right) => {
      const leftRank = statusRank.get(left.status) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = statusRank.get(right.status) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.status.localeCompare(right.status);
    });
}

function normalizeChangeEvents(changeEvents) {
  if (!Array.isArray(changeEvents)) return [];
  const changes = new Map();
  for (const row of changeEvents) {
    const entityType = displayValue(row?.entity_type ?? row?.entityType, "unknown");
    const action = displayValue(row?.action, "unknown");
    const reason = displayValue(row?.reason, "_none");
    const count = finiteNumber(row?.count ?? 1);
    if (count == null || !Number.isInteger(count) || count < 0) continue;
    const key = JSON.stringify([entityType, action, reason]);
    const previous = changes.get(key);
    changes.set(key, {
      entityType,
      action,
      reason,
      count: (previous?.count || 0) + count,
    });
  }
  return [...changes.values()].sort((left, right) => (
    left.entityType.localeCompare(right.entityType)
      || left.action.localeCompare(right.action)
      || left.reason.localeCompare(right.reason)
  ));
}

function normalizeTokens(tokens) {
  const value = tokens && typeof tokens === "object" ? tokens : {};
  const input = firstFinite(
    value.input_tokens,
    value.prompt_tokens,
    value.input,
    value.prompt,
  ) || 0;
  const output = firstFinite(
    value.output_tokens,
    value.completion_tokens,
    value.output,
    value.completion,
  ) || 0;
  const total = firstFinite(value.total_tokens, value.total) ?? input + output;
  return { input, output, total };
}

function tableRow(label, value, { escape = true } = {}) {
  const left = escape ? escapeTableCell(label) : String(label);
  const right = escape ? escapeTableCell(displayValue(value)) : String(value);
  return `| ${left} | ${right} |`;
}

function escapeTableCell(value) {
  return displayValue(value)
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function displayValue(value, fallback = "—") {
  if (value == null || value === "") {
    return fallback;
  }
  return String(value);
}

function formatBoolean(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "—";
}

function formatTimestamp(value) {
  if (value == null || value === "") return "—";
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function formatUsd(value) {
  const number = finiteNumber(value);
  if (number == null) return "—";
  const precision = number !== 0 && Math.abs(number) < 0.01 ? 10 : 6;
  const [whole, originalFraction = ""] = number.toFixed(precision).split(".");
  let fraction = originalFraction;
  while (fraction.length > 2 && fraction.endsWith("0")) {
    fraction = fraction.slice(0, -1);
  }
  return `$${whole}.${fraction}`;
}

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number != null) return number;
  }
  return null;
}

function stableJson(value, space = 2) {
  return JSON.stringify(sortObject(value), null, space);
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortObject(value[key])]),
  );
}

function normalizeRunId(value) {
  const normalized = typeof value === "bigint" ? value.toString() : String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new TypeError(`Invalid pipeline run id: ${displayValue(value)}`);
  }
  return normalized;
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") {
    return query(sql, params);
  }
  if (query && typeof query.query === "function") {
    return query.query(sql, params);
  }
  throw new TypeError("query must be a function or an object with a query method.");
}

function rowsFrom(result) {
  if (Array.isArray(result)) return result;
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function loadDefaultQuery() {
  const db = await import("./db.mjs");
  if (typeof db.query === "function") return db.query;
  if (db.pool && typeof db.pool.query === "function") return db.pool;
  throw new TypeError("pipeline/lib/db.mjs must export query(sql, params).");
}
