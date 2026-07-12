#!/usr/bin/env node

import { closePool, query } from "../pipeline/lib/db.mjs";
import { runTaxonomyMappingReview, TAXONOMY_MAPPING_REVIEW_MODEL } from "../pipeline/lib/taxonomy-mapping-review.mjs";
import { withRun } from "../pipeline/lib/runs.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);
const budgetUsd = Number(args.budget ?? 15);
const model = args.model || TAXONOMY_MAPPING_REVIEW_MODEL;
const batchSize = Number(args.batchSize ?? 12);
const limit = Number(args.limit ?? 100000);

if (!apply) throw new Error("This command writes an audit ledger. Pass --apply to confirm; mapping changes still require two-pass consensus.");
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--budget must be positive.");

try {
  const outcome = await withRun({
    command: "taxonomy-review",
    args: { model, batchSize, limit, apply: true },
    dryRun: false,
    budgetUsd,
  }, async (run) => {
    const result = await runTaxonomyMappingReview({
      query, runId: run.id, model, batchSize, limit, budgetUsd, apply: true,
      onProgress: ({ batch, batches, reviewed }) => console.error(`taxonomy-review batch ${batch}/${batches}; reviewed ${reviewed}`),
    });
    return { status: "completed", counts: result, result };
  }, { query, close: closePool });
  console.log(JSON.stringify(outcome, null, 2));
} finally {
  await closePool();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--apply") out.apply = true;
    else if (token.startsWith("--")) {
      const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`${token} requires a value.`);
      out[key] = argv[++i];
    } else throw new Error(`Unexpected argument: ${token}`);
  }
  return out;
}
