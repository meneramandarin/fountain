#!/usr/bin/env node

import process from "node:process";

import { closePool } from "../pipeline/lib/db.mjs";
import {
  enqueueChainMenuReconcilePlan,
  loadChainMenuReconcilePlan,
} from "../pipeline/lib/chain-menu-reconcile.mjs";
import { withRun } from "../pipeline/lib/runs.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  const outcome = await withRun({
    command: "chain-menu-reconcile",
    args: { limit: args.limit },
    dryRun: !args.apply,
  }, async (run) => {
    const plan = await loadChainMenuReconcilePlan({ limit: args.limit });
    const enqueue = args.apply
      ? await enqueueChainMenuReconcilePlan(plan, { runId: run.id })
      : {
          selectedCount: plan.candidate_count,
          insertedCount: 0,
          adoptedPendingCount: 0,
          queuedCount: 0,
          claimedConflictCount: 0,
          queuedEntityIds: [],
        };
    return {
      status: "completed",
      counts: {
        chain_cohorts: plan.cohort_count,
        selected: enqueue.selectedCount,
        inserted: enqueue.insertedCount,
        adopted_pending: enqueue.adoptedPendingCount,
        queued: enqueue.queuedCount,
        claimed_conflicts: enqueue.claimedConflictCount,
      },
      plan,
      enqueue,
    };
  });
  console.log(JSON.stringify({ run_id: outcome.runId, ...outcome }, null, 2));
} finally {
  await closePool();
}

function parseArgs(argv) {
  const result = { apply: false, limit: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      result.apply = true;
      continue;
    }
    if (arg === "--dry-run") continue;
    if (arg === "--limit") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--limit must be a positive integer.");
      result.limit = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}
