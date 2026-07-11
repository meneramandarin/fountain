import process from "node:process";

import { closePool, query as defaultQuery } from "./db.mjs";

const TERMINAL_STATUSES = new Set(["completed", "failed", "budget_exhausted", "cancelled"]);

export async function createRun({ command, args = {}, dryRun = true, budgetUsd = null }, options = {}) {
  const query = options.query || defaultQuery;
  if (!command || !String(command).trim()) throw new Error("Run command is required.");
  const normalizedBudget = nullableNonnegativeNumber(budgetUsd, "budgetUsd");
  const result = await query(
    `
      INSERT INTO fountain_ops.runs (command, args, dry_run, budget_usd)
      VALUES ($1, $2::jsonb, $3, $4)
      RETURNING *
    `,
    [String(command), JSON.stringify(args || {}), Boolean(dryRun), normalizedBudget],
  );
  return result.rows[0];
}

export async function finalizeRun(runId, { status = "completed", counts = {}, notes = null } = {}, options = {}) {
  const query = options.query || defaultQuery;
  if (!TERMINAL_STATUSES.has(status)) throw new Error(`Invalid terminal run status: ${status}`);
  const result = await query(
    `
      UPDATE fountain_ops.runs r
      SET finished_at = now(),
          status = $2,
          counts = $3::jsonb,
          notes = $4,
          spent_usd_estimate = COALESCE((
            SELECT sum(ec.cost_estimate_usd)
            FROM fountain_ops.external_calls ec
            WHERE ec.run_id = r.id
          ), 0)
      WHERE r.id = $1 AND r.status = 'running'
      RETURNING *
    `,
    [runId, status, JSON.stringify(counts || {}), notes],
  );
  if (!result.rows[0]) {
    const existing = await query("SELECT * FROM fountain_ops.runs WHERE id = $1", [runId]);
    if (!existing.rows[0]) throw new Error(`Run ${runId} does not exist.`);
    return existing.rows[0];
  }
  return result.rows[0];
}

export async function getRun(runId, options = {}) {
  const query = options.query || defaultQuery;
  const result = await query("SELECT * FROM fountain_ops.runs WHERE id = $1", [runId]);
  return result.rows[0] || null;
}

export async function getRunSpend(runId, options = {}) {
  const query = options.query || defaultQuery;
  const result = await query(
    `
      SELECT COALESCE(sum(cost_estimate_usd), 0)::numeric AS spend
      FROM fountain_ops.external_calls
      WHERE run_id = $1
    `,
    [runId],
  );
  return Number(result.rows[0]?.spend || 0);
}

export async function isBudgetExhausted(runId, budgetUsd, options = {}) {
  if (budgetUsd == null) return { exhausted: false, spendUsd: 0 };
  const spendUsd = await getRunSpend(runId, options);
  return { exhausted: spendUsd >= Number(budgetUsd), spendUsd };
}

export async function withRun(runOptions, operation, options = {}) {
  const query = options.query || defaultQuery;
  const run = await createRun(runOptions, { query });
  let outcome;
  let thrown;
  const removeSignals = installSignalFinalizer(run.id, { query, close: options.close || closePool });
  try {
    outcome = await operation(run);
    return { ...outcome, runId: run.id };
  } catch (error) {
    thrown = error;
    error.runId ||= run.id;
    throw error;
  } finally {
    removeSignals();
    const status = thrown ? "failed" : outcome?.status || "completed";
    const counts = outcome?.counts || {};
    const notes = thrown ? errorNote(thrown) : outcome?.notes || null;
    try {
      await finalizeRun(run.id, { status, counts, notes }, { query });
    } catch (finalizeError) {
      if (!thrown) throw finalizeError;
      thrown.finalizeError = finalizeError;
    }
  }
}

function installSignalFinalizer(runId, { query, close }) {
  let handling = false;
  const handlers = new Map();
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const handler = async () => {
      if (handling) return;
      handling = true;
      try {
        await finalizeRun(runId, { status: "cancelled", notes: `received_${signal.toLowerCase()}` }, { query });
      } catch (error) {
        console.error(`Failed to finalize run ${runId} after ${signal}:`, error);
      } finally {
        await close().catch(() => {});
        process.exit(code);
      }
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
}

function nullableNonnegativeNumber(value, name) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a nonnegative number.`);
  return number;
}

function errorNote(error) {
  return String(error?.stack || error?.message || error).slice(0, 8_000);
}
