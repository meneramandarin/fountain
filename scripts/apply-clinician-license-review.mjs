#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { closePool, query, withTransaction } from "../pipeline/lib/db.mjs";
import { persistVerifiedBoardMatch } from "../pipeline/lib/clinician-license-boards.mjs";
import { withRun } from "../pipeline/lib/runs.mjs";

const apply = process.argv.includes("--apply");
const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!fileArg) throw new Error("Usage: node scripts/apply-clinician-license-review.mjs <manifest.json> [--apply]");

const file = path.resolve(fileArg);
const manifest = JSON.parse(await readFile(file, "utf8"));
if (!Array.isArray(manifest) || manifest.length === 0) throw new Error("Review manifest must be a non-empty JSON array.");

const outcome = await withRun({
  command: "apply-clinician-license-review",
  args: { file: path.relative(process.cwd(), file), records: manifest.length },
  dryRun: !apply,
}, async (run) => withTransaction(async (tx) => {
  const database = tx.query.bind(tx);
  const seen = new Set();
  const prepared = [];
  for (const item of manifest) {
    validateItem(item);
    const key = `${item.location_id}|${item.jurisdiction_code}|${item.license_number}`;
    if (seen.has(key)) throw new Error(`Duplicate reviewed license record: ${key}`);
    seen.add(key);
    const loaded = await database(`
      SELECT location.id AS location_id, location.name AS location_name,
             location.locality, location.region, location.org_id,
             attempt.candidates
      FROM fountain.locations location
      JOIN fountain_raw.location_clinician_verification_attempts attempt
        ON attempt.location_id = location.id
       AND attempt.prompt_version = 'clinician-license-v1'
      WHERE location.id = $1
        AND location.status = 'active'
        AND location.deleted_at IS NULL
    `, [item.location_id]);
    const location = loaded.rows[0];
    if (!location) throw new Error(`Active reviewed location not found: ${item.location_id}`);
    const candidate = (location.candidates || []).find((value) => normalized(value.full_name) === normalized(item.candidate_name));
    if (!candidate) throw new Error(`Reviewed candidate ${item.candidate_name} not found at location ${item.location_id}`);
    prepared.push({ item, location, candidate });
  }

  if (!apply) {
    return { status: "completed", counts: { reviewed: prepared.length, written: 0 }, result: { dryRun: true } };
  }

  for (const { item, location, candidate } of prepared) {
    const boardRecord = {
      jurisdiction_code: item.jurisdiction_code,
      license_number: item.license_number,
      license_type: item.license_type,
      licensing_authority: item.licensing_authority,
      license_status: item.license_status,
      license_expires_at: item.license_expires_at,
      board_source_url: item.board_source_url,
      evidence: {
        manual_review: true,
        manual_reviewed_at: item.reviewed_at,
        action_screening: "reviewed_no_disqualifying_public_action",
        board_record_name: item.board_record_name,
        identity_assessment: item.identity_assessment,
      },
    };
    const reviewedCandidate = {
      ...candidate,
      source_url: item.affiliation_source_url,
      evidence_text: item.affiliation_claim || candidate.evidence_text,
      board_lookup: { outcome: "verified", record: boardRecord },
    };
    await persistVerifiedBoardMatch(database, location, reviewedCandidate, boardRecord);
    await database(`
      UPDATE fountain_raw.location_clinician_verification_attempts
      SET outcome = 'verified',
          candidates = (
            SELECT jsonb_agg(
              CASE WHEN regexp_replace(lower(value->>'full_name'), '[^a-z0-9]+', '', 'g') = $3
                THEN value || $4::jsonb
                ELSE value
              END
            )
            FROM jsonb_array_elements(candidates) value
          ),
          attempted_at = now(),
          run_id = $2
      WHERE location_id = $1 AND prompt_version = 'clinician-license-v1'
    `, [
      item.location_id,
      run.id,
      normalized(item.candidate_name),
      JSON.stringify({ board_lookup: reviewedCandidate.board_lookup }),
    ]);
  }
  return {
    status: "completed",
    counts: {
      reviewed: prepared.length,
      locations: new Set(prepared.map(({ item }) => item.location_id)).size,
      written: prepared.length,
    },
    result: { dryRun: false },
  };
}), { query });

console.log(JSON.stringify(outcome, null, 2));
await closePool();

function validateItem(item) {
  for (const field of [
    "location_id", "candidate_name", "jurisdiction_code", "license_number", "license_type",
    "licensing_authority", "license_status", "license_expires_at", "board_source_url",
    "affiliation_source_url", "reviewed_at", "board_record_name", "identity_assessment",
  ]) {
    if (item?.[field] == null || String(item[field]).trim() === "") throw new Error(`Missing review field: ${field}`);
  }
  if (!Number.isInteger(Number(item.location_id)) || Number(item.location_id) <= 0) throw new Error("location_id must be positive.");
  if (!/^[A-Z]{2}$/u.test(item.jurisdiction_code)) throw new Error("jurisdiction_code must be a two-letter code.");
  if (!/^https?:\/\//u.test(item.board_source_url) || !/^https?:\/\//u.test(item.affiliation_source_url)) {
    throw new Error("Review sources must be HTTP(S) URLs.");
  }
}

function normalized(value) {
  return String(value || "").normalize("NFKD").replace(/[^a-zA-Z0-9]+/gu, "").toLowerCase();
}
