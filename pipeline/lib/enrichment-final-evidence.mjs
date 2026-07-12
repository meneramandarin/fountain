import { query as defaultQuery } from "./db.mjs";

export const FINAL_STAGE3_RUN_ID = "57";
export const FINAL_REDEMPTION_RUN_ID = "61";
export const FINAL_STAGE3_ACTOR = `pass1_stage3_apply_run_${FINAL_STAGE3_RUN_ID}`;
export const FINAL_REDEMPTION_ACTOR = `pass1_redemption_apply_run_${FINAL_REDEMPTION_RUN_ID}`;

export const FINAL_STAGE3_EVIDENCE_SQL = `
  WITH stage_run AS MATERIALIZED (
    SELECT id, command, status, dry_run, counts
    FROM fountain_ops.runs
    WHERE id = $1::bigint
  ),
  stage_tasks AS MATERIALIZED (
    SELECT id, entity_id, result
    FROM fountain_ops.task_queue
    WHERE run_id = $1::bigint
      AND task_type = 'legitimacy_check'
      AND payload->>'campaign' = 'pass1_stage3_full'
      AND payload->>'stage' = 'stage_3'
  ),
  stage_events AS MATERIALIZED (
    SELECT event.entity_id
    FROM fountain.entity_change_events event
    WHERE event.entity_type = 'locations'
      AND event.metadata->>'run_id' = $1::text
      AND event.reason = 'pass1_stage3_legitimacy_suppression'
      AND event.before_data->>'status' = 'active'
      AND event.after_data->>'status' = 'hidden'
  ),
  redemption_events AS MATERIALIZED (
    SELECT
      event.entity_id,
      COALESCE((event.metadata->>'owned_suppression_rows_deleted')::integer, 0)
        AS suppression_rows_deleted
    FROM fountain.entity_change_events event
    WHERE event.entity_type = 'locations'
      AND event.metadata->>'run_id' = $2::text
      AND event.metadata->>'redemption' = 'true'
      AND event.before_data->>'status' = 'hidden'
      AND event.after_data->>'status' = 'active'
  )
  SELECT
    (SELECT count(*)::integer FROM stage_run) AS run_count,
    (SELECT command FROM stage_run) AS run_command,
    (SELECT status FROM stage_run) AS run_status,
    (SELECT dry_run FROM stage_run) AS run_dry_run,
    (SELECT counts FROM stage_run) AS run_counts,
    (SELECT count(*)::integer FROM stage_tasks) AS task_count,
    (SELECT count(*)::integer FROM stage_tasks
      WHERE result->>'resolution' = 'keep') AS keep_count,
    (SELECT count(*)::integer FROM stage_tasks
      WHERE result->>'resolution' = 'suppress') AS suppress_count,
    (SELECT count(*)::integer FROM stage_tasks
      WHERE result->>'needs_human_review' = 'true') AS needs_human_count,
    (SELECT count(*)::integer FROM stage_tasks
      WHERE result#>>'{serving_write,written}' = 'true'
        AND result#>>'{serving_write,run_id}' = $1::text) AS task_write_count,
    (SELECT count(*)::integer FROM stage_tasks
      WHERE result->>'resolution' = 'suppress'
        AND jsonb_array_length(COALESCE(result->'hard_exclusion_reasons', '[]'::jsonb)) > 0)
      AS hard_excluded_suppression_count,
    (SELECT count(*)::integer FROM stage_events) AS event_count,
    (SELECT count(DISTINCT entity_id)::integer FROM stage_events) AS distinct_event_count,
    (SELECT count(*)::integer
       FROM stage_events target
       JOIN fountain.locations location ON location.id = target.entity_id
      WHERE location.status = 'active' AND location.deleted_at IS NULL)
      AS target_active_count,
    (SELECT count(*)::integer
       FROM stage_events target
       JOIN fountain.locations location ON location.id = target.entity_id
      WHERE location.status = 'hidden' AND location.deleted_at IS NULL)
      AS target_hidden_count,
    (SELECT count(*)::integer
       FROM stage_events target
       JOIN fountain.locations location ON location.id = target.entity_id
      WHERE location.deleted_at IS NOT NULL
         OR location.status NOT IN ('active', 'hidden')) AS target_other_count,
    (SELECT count(*)::integer
       FROM stage_events target
       JOIN fountain.search_index search
         ON search.entity_type = 'location' AND search.entity_id = target.entity_id)
      AS target_search_count,
    (SELECT count(*)::integer
       FROM redemption_events redemption
       JOIN stage_events target ON target.entity_id = redemption.entity_id)
      AS redeemed_stage_target_count,
    (SELECT count(*)::integer
       FROM redemption_events redemption
       JOIN stage_events target ON target.entity_id = redemption.entity_id
       JOIN fountain.search_index search
         ON search.entity_type = 'location' AND search.entity_id = redemption.entity_id)
      AS redeemed_stage_search_count,
    (SELECT COALESCE(sum(redemption.suppression_rows_deleted), 0)::integer
       FROM redemption_events redemption
       JOIN stage_events target ON target.entity_id = redemption.entity_id)
      AS redeemed_stage_suppression_rows,
    (SELECT count(*)::integer
       FROM fountain_raw.suppressed_source_listings suppressed
      WHERE suppressed.suppressed_by = $3::text) AS stage_suppression_rows_current,
    (SELECT count(*)::integer
       FROM fountain_ops.field_status status
      WHERE status.entity_type = 'location'
        AND status.field = 'status'
        AND status.verification = 'agent_verified'
        AND status.verified_by = $3::text) AS stage_status_ledger_current,
    (SELECT count(*)::integer
       FROM fountain_ops.field_status status
      WHERE status.entity_type = 'location'
        AND status.field = 'status'
        AND status.verification = 'agent_verified'
        AND status.verified_by = $4::text) AS redemption_status_ledger_count,
    (SELECT count(*)::integer FROM fountain.locations
      WHERE status = 'active' AND deleted_at IS NULL) AS global_active_current,
    (SELECT count(*)::integer FROM fountain.locations
      WHERE status = 'hidden' AND deleted_at IS NULL) AS global_hidden_current,
    (SELECT count(*)::integer FROM fountain_raw.suppressed_source_listings)
      AS suppression_ledger_current
`;

export const FINAL_REDEMPTION_EVIDENCE_SQL = `
  WITH redemption_run AS MATERIALIZED (
    SELECT id, command, status, dry_run, counts
    FROM fountain_ops.runs
    WHERE id = $1::bigint
  ),
  redemption_tasks AS MATERIALIZED (
    SELECT id, entity_id, result
    FROM fountain_ops.task_queue
    WHERE result#>>'{redemption,run_id}' = $1::text
      AND result#>>'{redemption,status}' = 'applied'
  ),
  redemption_events AS MATERIALIZED (
    SELECT
      event.entity_id,
      COALESCE((event.metadata->>'owned_suppression_rows_deleted')::integer, 0)
        AS suppression_rows_deleted
    FROM fountain.entity_change_events event
    WHERE event.entity_type = 'locations'
      AND event.metadata->>'run_id' = $1::text
      AND event.metadata->>'redemption' = 'true'
      AND event.before_data->>'status' = 'hidden'
      AND event.after_data->>'status' = 'active'
  )
  SELECT
    (SELECT count(*)::integer FROM redemption_run) AS run_count,
    (SELECT command FROM redemption_run) AS run_command,
    (SELECT status FROM redemption_run) AS run_status,
    (SELECT dry_run FROM redemption_run) AS run_dry_run,
    (SELECT counts FROM redemption_run) AS run_counts,
    (SELECT count(*)::integer FROM redemption_tasks) AS task_evidence_count,
    (SELECT count(*)::integer FROM redemption_events) AS event_count,
    (SELECT count(DISTINCT entity_id)::integer FROM redemption_events)
      AS distinct_event_count,
    (SELECT COALESCE(sum(
      (task.result#>>'{redemption,suppression_rows_deleted}')::integer
    ), 0)::integer FROM redemption_tasks) AS task_suppression_rows_deleted,
    (SELECT COALESCE(sum(event.suppression_rows_deleted), 0)::integer
       FROM redemption_events event) AS event_suppression_rows_deleted,
    (SELECT count(*)::integer
       FROM redemption_events target
       JOIN fountain.locations location ON location.id = target.entity_id
      WHERE location.status = 'active' AND location.deleted_at IS NULL)
      AS active_count,
    (SELECT count(*)::integer
       FROM redemption_events target
       JOIN fountain.search_index search
         ON search.entity_type = 'location' AND search.entity_id = target.entity_id)
      AS search_index_count,
    (SELECT count(*)::integer
       FROM fountain_ops.field_status status
       JOIN redemption_events target ON target.entity_id = status.entity_id
      WHERE status.entity_type = 'location'
        AND status.field = 'status'
        AND status.verification = 'agent_verified'
        AND status.verified_by = $2::text) AS status_ledger_count,
    (SELECT count(*)::integer
       FROM redemption_tasks task
       JOIN fountain.source_records source_record
         ON source_record.entity_type = 'location'
        AND source_record.entity_id = task.entity_id
       JOIN fountain.sources source ON source.id = source_record.source_id
       JOIN fountain_raw.suppressed_source_listings suppressed
         ON suppressed.source_slug = source.slug
        AND suppressed.source_listing_id = source_record.source_listing_id
        AND suppressed.suppressed_by = task.result#>>'{redemption,suppression_owner}')
      AS owned_suppression_rows_remaining,
    (SELECT count(*)::integer FROM fountain_raw.suppressed_source_listings)
      AS suppression_ledger_current
`;

export const FINAL_REDEEMED_LOCATIONS_SQL = `
  SELECT
    task.id::text AS source_task_id,
    task.entity_id AS location_id,
    location.name,
    task.result->'final' AS prior_final,
    task.result->'redemption' AS redemption
  FROM fountain_ops.task_queue task
  JOIN fountain.locations location ON location.id = task.entity_id
  WHERE task.result#>>'{redemption,run_id}' = $1::text
    AND task.result#>>'{redemption,status}' = 'applied'
  ORDER BY task.entity_id
`;

/**
 * Reconstruct the two legitimacy summaries entirely from durable ledgers. No
 * report JSON or in-memory runner return value is trusted at closeout time.
 */
export async function loadPersistedLegitimacyCloseout(
  {
    stage3RunId = FINAL_STAGE3_RUN_ID,
    redemptionRunId = FINAL_REDEMPTION_RUN_ID,
  } = {},
  { query = defaultQuery } = {},
) {
  const stageRunId = exactRunId(stage3RunId, FINAL_STAGE3_RUN_ID, "Stage 3");
  const redemptionId = exactRunId(
    redemptionRunId,
    FINAL_REDEMPTION_RUN_ID,
    "redemption",
  );
  const [stageResult, redemptionResult, redeemedResult] = await Promise.all([
    executeQuery(query, FINAL_STAGE3_EVIDENCE_SQL, [
      stageRunId,
      redemptionId,
      FINAL_STAGE3_ACTOR,
      FINAL_REDEMPTION_ACTOR,
    ]),
    executeQuery(query, FINAL_REDEMPTION_EVIDENCE_SQL, [
      redemptionId,
      FINAL_REDEMPTION_ACTOR,
    ]),
    executeQuery(query, FINAL_REDEEMED_LOCATIONS_SQL, [redemptionId]),
  ]);
  const stageRow = exactlyOneRow(stageResult, "Stage 3 closeout evidence");
  const redemptionRow = exactlyOneRow(redemptionResult, "redemption closeout evidence");
  const redeemedRows = rowsFrom(redeemedResult);
  const stage3 = reconstructStage3(stageRow, {
    stageRunId,
    redemptionRunId: redemptionId,
  });
  const redemption = reconstructRedemption(redemptionRow, redeemedRows, {
    redemptionRunId: redemptionId,
  });
  assertCrossCampaignEvidence(stageRow, redemptionRow, stage3, redemption);
  return { stage3, redemption, evidence: { stage3: normalizeEvidenceRow(stageRow), redemption: normalizeEvidenceRow(redemptionRow) } };
}

function reconstructStage3(row, { stageRunId }) {
  assertRun(row, { command: "stage3", runId: stageRunId, label: "Stage 3" });
  const runCounts = object(row.run_counts);
  const cohortRows = count(runCounts.cohort_rows, "Stage 3 run cohort_rows");
  const keepRows = count(runCounts.keep, "Stage 3 run keep");
  const suppressionRows = count(runCounts.suppressed, "Stage 3 run suppressed");
  const humanReviewRows = count(
    runCounts.needs_human_review,
    "Stage 3 run needs_human_review",
  );
  const sourceSuppressions = count(
    runCounts.source_suppressions,
    "Stage 3 run source_suppressions",
  );
  const taskCount = count(row.task_count, "Stage 3 task count");
  const keepActual = count(row.keep_count, "Stage 3 keep task count");
  const suppressActual = count(row.suppress_count, "Stage 3 suppress task count");
  const humanActual = count(row.needs_human_count, "Stage 3 human-review task count");
  const eventCount = count(row.event_count, "Stage 3 event count");
  const redemptionCount = count(
    row.redeemed_stage_target_count,
    "redeemed Stage 3 targets",
  );
  const redeemedSuppressionRows = count(
    row.redeemed_stage_suppression_rows,
    "redeemed Stage 3 suppression rows",
  );
  const originalSuppressionRows = count(
    row.stage_suppression_rows_current,
    "current Stage 3 suppression rows",
  ) + redeemedSuppressionRows;
  const originalStatusLedgerRows = count(
    row.stage_status_ledger_current,
    "current Stage 3 status-ledger rows",
  ) + count(row.redemption_status_ledger_count, "redemption status-ledger rows");
  const failures = [];
  check(failures, "cohort task rows", cohortRows, taskCount);
  check(failures, "keep task rows", keepRows, keepActual);
  check(failures, "suppress task rows", suppressionRows, suppressActual);
  check(failures, "needs-human task rows", humanReviewRows, humanActual);
  check(failures, "disposition partition", cohortRows, keepActual + suppressActual + humanActual);
  check(failures, "suppression events", suppressionRows, eventCount);
  check(failures, "distinct suppression events", eventCount, count(row.distinct_event_count, "distinct Stage 3 events"));
  check(failures, "suppression task writes", suppressionRows, count(row.task_write_count, "Stage 3 task writes"));
  check(failures, "source suppression rows", sourceSuppressions, originalSuppressionRows);
  check(failures, "status-ledger rows", suppressionRows, originalStatusLedgerRows);
  check(failures, "hard exclusions touched", 0, count(row.hard_excluded_suppression_count, "Stage 3 hard-excluded suppressions"));
  check(failures, "current target partition", suppressionRows, (
    count(row.target_active_count, "active Stage 3 targets")
      + count(row.target_hidden_count, "hidden Stage 3 targets")
      + count(row.target_other_count, "other Stage 3 targets")
  ));
  check(failures, "reactivated Stage 3 targets", redemptionCount, count(row.target_active_count, "active Stage 3 targets"));
  check(failures, "restored Stage 3 search rows", redemptionCount, count(row.redeemed_stage_search_count, "redeemed Stage 3 search rows"));
  check(failures, "Stage 3 target search rows", redemptionCount, count(row.target_search_count, "Stage 3 target search rows"));
  refuseFailures("Stage 3", failures);

  const globalActiveCurrent = count(row.global_active_current, "current global active locations");
  const globalHiddenCurrent = count(row.global_hidden_current, "current global hidden locations");
  const suppressionLedgerCurrent = count(
    row.suppression_ledger_current,
    "current suppression ledger",
  );
  return {
    execution: {
      runId: stageRunId,
      plan: {
        counts: { cohortRows, keepRows, suppressionRows, humanReviewRows },
      },
    },
    suppression: {
      apply: true,
      applyRunId: stageRunId,
      expectedSuppressionCount: suppressionRows,
      preflight: {
        sourceRecordFanout: sourceSuppressions,
        hardExcludedCandidateCount: 0,
      },
      verification: {
        hiddenCount: eventCount,
        runSuppressionLedgerRows: originalSuppressionRows,
        suppressionLedgerAfter: suppressionLedgerCurrent + redeemedSuppressionRows,
        stampedEventCount: eventCount,
        taskEvidenceCount: count(row.task_write_count, "Stage 3 task writes"),
        statusLedgerCount: originalStatusLedgerRows,
        remainingSearchRows: count(row.target_search_count, "Stage 3 target search rows")
          - count(row.redeemed_stage_search_count, "redeemed Stage 3 search rows"),
        activeLocationsAfter: globalActiveCurrent - redemptionCount,
        hiddenLocationsAfter: globalHiddenCurrent + redemptionCount,
      },
    },
  };
}

function reconstructRedemption(row, redeemedRows, { redemptionRunId }) {
  assertRun(row, { command: "redemption", runId: redemptionRunId, label: "redemption" });
  const runCounts = object(row.run_counts);
  const candidateRows = count(
    runCounts.lookup_candidates,
    "redemption run lookup_candidates",
  );
  const redeemRows = count(runCounts.redeemed, "redemption run redeemed");
  const retainSuppressedRows = count(
    runCounts.retained_suppressed,
    "redemption run retained_suppressed",
  );
  const taskEvidenceCount = count(row.task_evidence_count, "redemption task evidence");
  const eventCount = count(row.event_count, "redemption event count");
  const deletedByTask = count(
    row.task_suppression_rows_deleted,
    "task-recorded suppression deletes",
  );
  const deletedByEvent = count(
    row.event_suppression_rows_deleted,
    "event-recorded suppression deletes",
  );
  const failures = [];
  check(failures, "decision partition", candidateRows, redeemRows + retainSuppressedRows);
  check(failures, "task evidence", redeemRows, taskEvidenceCount);
  check(failures, "redemption events", redeemRows, eventCount);
  check(failures, "distinct redemption events", eventCount, count(row.distinct_event_count, "distinct redemption events"));
  check(failures, "active locations", redeemRows, count(row.active_count, "active redemption targets"));
  check(failures, "search rows", redeemRows, count(row.search_index_count, "redemption search rows"));
  check(failures, "status-ledger rows", redeemRows, count(row.status_ledger_count, "redemption status-ledger rows"));
  check(failures, "redeemed detail rows", redeemRows, redeemedRows.length);
  check(failures, "suppression delete evidence", deletedByTask, deletedByEvent);
  check(failures, "owned suppression rows remaining", 0, count(row.owned_suppression_rows_remaining, "owned suppression rows remaining"));
  if (redeemRows > 0 && deletedByTask <= 0) failures.push("suppression deletes=0");
  refuseFailures("redemption", failures);

  const decisions = redeemedRows.map(normalizeRedeemedDecision);
  const suppressionLedgerAfter = count(
    row.suppression_ledger_current,
    "current suppression ledger",
  );
  const apply = redeemRows > 0 ? {
    apply: true,
    runId: redemptionRunId,
    expectedRedemptionCount: redeemRows,
    preflight: {
      ownedSuppressionCount: deletedByTask,
      suppressionLedgerBefore: suppressionLedgerAfter + deletedByTask,
    },
    verification: {
      activeCount: count(row.active_count, "active redemption targets"),
      searchIndexCount: count(row.search_index_count, "redemption search rows"),
      eventCount,
      taskEvidenceCount,
      statusLedgerCount: count(row.status_ledger_count, "redemption status-ledger rows"),
      suppressionLedgerAfter,
    },
    applied: decisions.map((decision) => ({
      ...decision,
      deletedSuppressionRows: decision.deletedSuppressionRows,
    })),
  } : null;
  return {
    cohort: { counts: { candidates: candidateRows } },
    pass: {
      runId: redemptionRunId,
      counts: { redeem: redeemRows, retainSuppressed: retainSuppressedRows },
      decisions,
    },
    apply,
  };
}

function normalizeRedeemedDecision(row) {
  const redemption = object(row?.redemption);
  return {
    sourceTaskId: positiveIntegerString(row?.source_task_id, "redemption source task id"),
    locationId: positiveInteger(row?.location_id, "redeemed location id"),
    name: text(row?.name),
    priorClass: text(object(row?.prior_final).class),
    class: requiredText(redemption.class, "redemption class"),
    confidence: confidence(redemption.confidence, "redemption confidence"),
    basis: text(redemption.basis),
    positiveEvidence: text(redemption.positive_evidence),
    rationale: text(redemption.rationale),
    officialWebsite: text(redemption.official_website),
    model: text(redemption.model),
    externalCallId: nullablePositiveInteger(redemption.external_call_id),
    suppressionOwner: requiredText(redemption.suppression_owner, "suppression owner"),
    deletedSuppressionRows: count(
      redemption.suppression_rows_deleted,
      "redeemed suppression rows deleted",
    ),
    agentLookup: object(redemption.agent_lookup),
    action: "redeem",
  };
}

function assertCrossCampaignEvidence(stageRow, redemptionRow, stage3, redemption) {
  const failures = [];
  const stageRedeemed = count(
    stageRow.redeemed_stage_target_count,
    "Stage 3 redeemed target count",
  );
  const redemptionCount = redemption.pass.counts.redeem;
  check(failures, "redeemed target overlap", redemptionCount, stageRedeemed);
  check(
    failures,
    "redemption status-ledger cross-check",
    count(stageRow.redemption_status_ledger_count, "cross-campaign redemption status ledger"),
    count(redemptionRow.status_ledger_count, "redemption status ledger"),
  );
  check(
    failures,
    "current suppression ledger cross-check",
    count(stageRow.suppression_ledger_current, "Stage 3 current suppression ledger"),
    count(redemptionRow.suppression_ledger_current, "redemption current suppression ledger"),
  );
  check(
    failures,
    "Stage 3 historical suppression ledger",
    stage3.suppression.verification.suppressionLedgerAfter,
    redemption.apply
      ? redemption.apply.preflight.suppressionLedgerBefore
      : count(redemptionRow.suppression_ledger_current, "redemption current suppression ledger"),
  );
  refuseFailures("cross-campaign", failures);
}

function assertRun(row, { command, runId, label }) {
  const failures = [];
  check(failures, "run row", 1, count(row.run_count, `${label} run row count`));
  if (text(row.run_command) !== command) failures.push(`command=${text(row.run_command) || "missing"}/${command}`);
  if (text(row.run_status) !== "completed") failures.push(`status=${text(row.run_status) || "missing"}/completed`);
  if (row.run_dry_run !== false) failures.push(`dry_run=${String(row.run_dry_run)}/false`);
  if (!object(row.run_counts) || Object.keys(object(row.run_counts)).length === 0) failures.push("run_counts=missing");
  refuseFailures(`${label} run ${runId}`, failures);
}

function check(failures, label, expected, actual) {
  if (expected !== actual) failures.push(`${label}=${actual}/${expected}`);
}

function refuseFailures(label, failures) {
  if (failures.length > 0) {
    throw new Error(`Persisted ${label} closeout evidence did not reconcile: ${failures.join(", ")}.`);
  }
}

function exactRunId(value, expected, label) {
  const normalized = positiveIntegerString(value, `${label} run id`);
  if (normalized !== expected) {
    throw new Error(`${label} closeout is fixed to run ${expected}; received ${normalized}.`);
  }
  return normalized;
}

function normalizeEvidenceRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === "bigint" ? value.toString() : value,
  ]));
}

function exactlyOneRow(result, label) {
  const rows = rowsFrom(result);
  if (rows.length !== 1) throw new Error(`${label} expected one row, got ${rows.length}.`);
  return rows[0];
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or expose query(sql, params).");
}

function rowsFrom(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function count(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return normalized;
}

function positiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return normalized;
}

function positiveIntegerString(value, label) {
  if (typeof value === "string" && /^[1-9]\d*$/u.test(value)) return value;
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  throw new TypeError(`${label} must be a positive integer.`);
}

function nullablePositiveInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  return positiveInteger(value, "positive integer");
}

function confidence(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new TypeError(`${label} must be between zero and one.`);
  }
  return normalized;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function requiredText(value, label) {
  const normalized = text(value);
  if (!normalized) throw new TypeError(`${label} must be non-empty.`);
  return normalized;
}
