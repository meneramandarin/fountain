#!/usr/bin/env node

import { closePool, query } from "../pipeline/lib/db.mjs";
import { verifyPublicBoardCandidates } from "../pipeline/lib/clinician-license-boards.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const limit = numberOption("--limit", 10_000);
const concurrency = numberOption("--concurrency", 4);

try {
  const result = await verifyPublicBoardCandidates({ query, apply, limit, concurrency });
  console.log(JSON.stringify({ apply, ...result }, null, 2));
} finally {
  await closePool();
}

function numberOption(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} requires a positive integer.`);
  return value;
}
