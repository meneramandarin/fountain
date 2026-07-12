import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { query as defaultQuery } from "./db.mjs";
import {
  compareEnrichmentCensuses,
  ENRICHMENT_FIELDS,
  ENRICHMENT_TASK_TYPES,
} from "./enrichment-census.mjs";

export const ENRICHMENT_FINAL_REPORT_VERSION = 1;
export const ENRICHMENT_FINAL_REPORT_FILENAME = "enrichment-final-report.md";
export const ENRICHMENT_MENU_PRICES_CENSUS_FILENAME = "enrichment-menu-prices-census.json";

export const FINAL_REPORT_EXTERNAL_CALLS_SQL = `
  SELECT
    external_call.id,
    external_call.run_id::text AS run_id,
    external_call.provider,
    external_call.call_type,
    external_call.entity_id,
    external_call.model,
    external_call.status,
    external_call.http_status,
    external_call.tokens,
    external_call.cost_estimate_usd,
    external_call.created_at,
    run.command AS run_command,
    run.args AS run_args
  FROM fountain_ops.external_calls external_call
  JOIN fountain_ops.runs run ON run.id = external_call.run_id
  WHERE external_call.run_id = ANY($1::bigint[])
  ORDER BY external_call.created_at, external_call.id
`;

export const FINAL_REPORT_TASKS_SQL = `
  SELECT
    task.id::text AS task_id,
    task.run_id::text AS run_id,
    task.task_type,
    task.entity_type,
    task.entity_id,
    task.status,
    task.result
  FROM fountain_ops.task_queue task
  WHERE task.run_id = ANY($1::bigint[])
  ORDER BY task.run_id, task.task_type, task.entity_type, task.entity_id, task.id
`;

export const FINAL_REPORT_STATE_SQL = `
  WITH location_state AS MATERIALIZED (
    SELECT status, deleted_at
    FROM fountain.locations
  ),
  suppressed_locations AS MATERIALIZED (
    SELECT DISTINCT source_record.entity_id
    FROM fountain.source_records source_record
    JOIN fountain.sources source ON source.id = source_record.source_id
    JOIN fountain_raw.suppressed_source_listings suppressed
      ON suppressed.source_slug = source.slug
     AND suppressed.source_listing_id = source_record.source_listing_id
    WHERE source_record.entity_type = 'location'
      AND source_record.source_listing_id IS NOT NULL
  )
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL)::integer AS nondeleted_locations,
    count(*) FILTER (WHERE deleted_at IS NULL AND status = 'active')::integer AS active_locations,
    count(*) FILTER (WHERE deleted_at IS NULL AND status = 'hidden')::integer AS hidden_locations,
    count(*) FILTER (
      WHERE deleted_at IS NULL AND status NOT IN ('active', 'hidden')
    )::integer AS other_nondeleted_locations,
    count(*) FILTER (WHERE deleted_at IS NOT NULL)::integer AS deleted_locations,
    (SELECT count(*)::integer FROM fountain_raw.suppressed_source_listings)
      AS suppression_ledger_rows,
    (SELECT count(*)::integer FROM suppressed_locations) AS suppressed_locations,
    (SELECT count(*)::integer
       FROM fountain.search_index search
      WHERE search.entity_type = 'location') AS search_location_rows,
    (SELECT count(*)::integer
       FROM fountain_ops.field_status status
      WHERE status.entity_type = 'location') AS location_field_status_rows
  FROM location_state
`;

export const FINAL_REPORT_EVENTS_SQL = `
  SELECT
    event.metadata->>'run_id' AS run_id,
    event.entity_type,
    event.action,
    COALESCE(event.reason, '_none') AS reason,
    count(*)::integer AS count
  FROM fountain.entity_change_events event
  WHERE event.metadata->>'run_id' = ANY($1::text[])
  GROUP BY event.metadata->>'run_id', event.entity_type, event.action,
    COALESCE(event.reason, '_none')
  ORDER BY run_id, event.entity_type, event.action, reason
`;

export const FINAL_REPORT_MENU_FIELD_STATUS_SQL = `
  SELECT
    substring(status.verified_by FROM '^menu_extract_run_([1-9][0-9]*)$') AS run_id,
    status.entity_type,
    status.field,
    count(*)::integer AS count
  FROM fountain_ops.field_status status
  WHERE status.verified_by = ANY($1::text[])
    AND status.verification = 'agent_verified'
    AND (
      (status.entity_type = 'location' AND status.field = 'offerings')
      OR (
        status.entity_type = 'offering'
        AND status.field IN ('price_amount', 'price_currency', 'treatment_id')
      )
    )
  GROUP BY run_id, status.entity_type, status.field
  ORDER BY run_id, status.entity_type, status.field
`;

/**
 * Load the immutable evidence needed by the campaign's final report. The
 * census and campaign summaries are caller-owned snapshots; every database
 * query here is read-only and restricted to the supplied run IDs.
 */
export async function loadEnrichmentFinalReportData(
  {
    before,
    after,
    stage3,
    redemption,
    runIds,
    menuPricesBefore = null,
    generatedAt = null,
  } = {},
  { query = defaultQuery } = {},
) {
  const runSelection = normalizeFinalReportRunIds(runIds, { stage3, redemption });
  const menuRunIds = selectedMenuExtractRunIds(runSelection);
  assertMenuPriceEvidenceAvailability(menuPricesBefore, after, menuRunIds);
  const [externalResult, taskResult, stateResult, eventResult, fieldStatusResult] = await Promise.all([
    executeQuery(query, FINAL_REPORT_EXTERNAL_CALLS_SQL, [runSelection.ids]),
    executeQuery(query, FINAL_REPORT_TASKS_SQL, [runSelection.ids]),
    executeQuery(query, FINAL_REPORT_STATE_SQL, []),
    executeQuery(query, FINAL_REPORT_EVENTS_SQL, [runSelection.ids]),
    menuRunIds.length > 0
      ? executeQuery(query, FINAL_REPORT_MENU_FIELD_STATUS_SQL, [
          menuRunIds.map((runId) => `menu_extract_run_${runId}`),
        ])
      : Promise.resolve({ rows: [] }),
  ]);
  const stateRows = rowsFrom(stateResult);
  if (stateRows.length !== 1) {
    throw new Error(`Final serving-state query expected one row, got ${stateRows.length}.`);
  }
  return buildEnrichmentFinalReportData({
    before,
    after,
    stage3,
    redemption,
    runIds: runSelection,
    menuPricesBefore,
    generatedAt,
    externalCalls: rowsFrom(externalResult),
    taskRows: rowsFrom(taskResult),
    state: stateRows[0],
    eventRows: rowsFrom(eventResult),
    fieldStatusRows: rowsFrom(fieldStatusResult),
  });
}

export async function buildEnrichmentFinalReport(input, dependencies = {}) {
  return renderEnrichmentFinalReport(
    await loadEnrichmentFinalReportData(input, dependencies),
  );
}

/**
 * Persist the reconciled campaign closeout in the same docs/runs directory as
 * the per-run reports. Rendering remains pure; callers opt into this write
 * only after the after-census snapshot and all selected run IDs are fixed.
 */
export async function writeEnrichmentFinalReport(
  data,
  {
    outputDir = path.join(process.cwd(), "docs", "runs"),
    outputPath = null,
  } = {},
) {
  assertEnrichmentFinalReconciliation(data);
  const markdown = renderEnrichmentFinalReport(data);
  const reportPath = outputPath
    ? path.resolve(outputPath)
    : path.join(path.resolve(outputDir), ENRICHMENT_FINAL_REPORT_FILENAME);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, "utf8");
  return reportPath;
}

export function buildEnrichmentFinalReportData({
  before,
  after,
  stage3,
  redemption,
  runIds,
  menuPricesBefore = null,
  generatedAt = null,
  externalCalls = [],
  taskRows = [],
  state = {},
  eventRows = [],
  fieldStatusRows = [],
} = {}) {
  const comparison = compareEnrichmentCensuses(before, after);
  const normalizedStage3 = normalizeStage3Summary(stage3);
  const normalizedRedemption = normalizeRedemptionSummary(redemption);
  const runSelection = normalizeFinalReportRunIds(runIds, { stage3, redemption });
  const menuRunIds = selectedMenuExtractRunIds(runSelection);
  const menuPrices = compareMenuPriceCoverage(menuPricesBefore, after, {
    required: menuRunIds.length > 0,
  });
  const external = summarizeFinalExternalCalls(externalCalls, runSelection);
  const tasks = summarizeFinalTaskOutcomes(taskRows);
  const servingState = normalizeServingState(state);
  const events = summarizeFinalEvents(eventRows);
  const menuFieldStatus = summarizeFinalMenuFieldStatus(fieldStatusRows);
  const reconciliation = buildFinalReconciliation({
    before,
    after,
    stage3: normalizedStage3,
    redemption: normalizedRedemption,
    runSelection,
    external,
    tasks,
    servingState,
    events,
    menuRunIds,
    menuPrices,
    menuFieldStatus,
  });
  const data = {
    schemaVersion: ENRICHMENT_FINAL_REPORT_VERSION,
    generatedAt: optionalIsoTimestamp(generatedAt),
    before,
    after,
    comparison,
    stage3: normalizedStage3,
    redemption: normalizedRedemption,
    runSelection,
    menuRunIds,
    menuPrices,
    external,
    tasks,
    servingState,
    events,
    menuFieldStatus,
    reconciliation,
  };
  data.followUps = buildFollowUps(data);
  return deepFreeze(data);
}

export function summarizeFinalExternalCalls(calls = [], runIds = null) {
  if (!Array.isArray(calls)) throw new TypeError("externalCalls must be an array.");
  const runSelection = runIds
    ? normalizeFinalReportRunIds(runIds)
    : { ids: [], entries: [] };
  const summary = {
    calls: 0,
    estimatedCostUsd: 0,
    failedCalls: 0,
    llm: {
      calls: 0,
      estimatedCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      byModel: [],
    },
    places: {
      contact: emptyCallBucket(),
      reviews: emptyCallBucket(),
      geocode: emptyCallBucket(),
      other: emptyCallBucket(),
    },
    other: emptyCallBucket(),
  };
  const models = new Map();
  const runs = new Map(runSelection.entries.map((entry) => [
    entry.runId,
    externalRunAccumulator(entry.runId, entry.roles),
  ]));
  for (const call of calls) {
    const provider = text(call?.provider).toLowerCase() || "unknown";
    const cost = nonnegativeNumber(call?.cost_estimate_usd, "external call cost", 0);
    const status = text(call?.status).toLowerCase() || "unknown";
    const model = text(call?.model);
    const tokens = normalizeTokens(call?.tokens);
    const runId = optionalRunId(call?.run_id ?? call?.runId) || "_unattributed";
    if (!runs.has(runId)) {
      const entry = runSelection.entries.find((candidate) => candidate.runId === runId);
      runs.set(runId, externalRunAccumulator(runId, entry?.roles || []));
    }
    const runBucket = runs.get(runId);
    summary.calls += 1;
    summary.estimatedCostUsd += cost;
    if (isFailedCall(status)) summary.failedCalls += 1;
    addCall(runBucket, cost, status);

    if (provider === "openrouter" || model) {
      const modelName = model || "_unknown_model";
      summary.llm.calls += 1;
      summary.llm.estimatedCostUsd += cost;
      addCall(runBucket.llm, cost, status);
      summary.llm.inputTokens += tokens.input;
      summary.llm.outputTokens += tokens.output;
      summary.llm.totalTokens += tokens.total;
      if (!models.has(modelName)) {
        models.set(modelName, {
          model: modelName,
          calls: 0,
          failedCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        });
      }
      const bucket = models.get(modelName);
      bucket.calls += 1;
      bucket.estimatedCostUsd += cost;
      bucket.inputTokens += tokens.input;
      bucket.outputTokens += tokens.output;
      bucket.totalTokens += tokens.total;
      if (isFailedCall(status)) bucket.failedCalls += 1;
      continue;
    }

    if (provider === "google_places") {
      const category = placesCategory(call, runSelection);
      addCall(summary.places[category], cost, status);
      addCall(runBucket.places[category], cost, status);
      continue;
    }
    addCall(summary.other, cost, status);
    addCall(runBucket.other, cost, status);
  }
  summary.llm.byModel = [...models.values()]
    .sort((left, right) => left.model.localeCompare(right.model));
  summary.byRun = [...runs.values()]
    .sort((left, right) => compareRunIds(left.runId, right.runId));
  const partitionCalls = summary.llm.calls
    + Object.values(summary.places).reduce((total, bucket) => total + bucket.calls, 0)
    + summary.other.calls;
  const partitionCost = summary.llm.estimatedCostUsd
    + Object.values(summary.places).reduce((total, bucket) => total + bucket.estimatedCostUsd, 0)
    + summary.other.estimatedCostUsd;
  summary.partition = {
    calls: partitionCalls,
    costUsd: partitionCost,
    callsReconciled: partitionCalls === summary.calls,
    costReconciled: nearlyEqual(partitionCost, summary.estimatedCostUsd),
  };
  const runCalls = summary.byRun.reduce((total, row) => total + row.calls, 0);
  const runCost = summary.byRun.reduce((total, row) => total + row.estimatedCostUsd, 0);
  summary.runPartition = {
    calls: runCalls,
    costUsd: runCost,
    callsReconciled: runCalls === summary.calls,
    costReconciled: nearlyEqual(runCost, summary.estimatedCostUsd),
  };
  return summary;
}

export function summarizeFinalTaskOutcomes(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError("taskRows must be an array.");
  const tasks = new Map();
  const runs = new Map();
  const statuses = {};
  const outcomes = {};
  let total = 0;
  let attempted = 0;
  let written = 0;
  let needsHuman = 0;
  let menuTaskRows = 0;
  let menuApplications = 0;
  let offeringsInserted = 0;
  let priceBackfills = 0;
  let priceAmountOnlyBackfills = 0;
  let treatmentBackfills = 0;
  let priceConflicts = 0;
  let priceReviews = 0;
  let existingPricesOverwritten = 0;
  const doneIdentities = new Set();
  const failedIdentityRows = [];
  for (const row of rows) {
    const count = nonnegativeInteger(row?.count ?? 1, "task count");
    const taskType = text(row?.task_type ?? row?.taskType) || "_unknown_task";
    const runId = optionalRunId(row?.run_id ?? row?.runId) || "_unattributed";
    const status = text(row?.status) || "unknown";
    const identity = taskEntityIdentity(row);
    if (identity && status === "done") doneIdentities.add(identity);
    if (status === "failed") failedIdentityRows.push({ identity, count });
    const result = object(row?.result);
    const outcome = text(row?.outcome ?? result.outcome ?? result.resolution) || "_none";
    const attemptedCount = aggregateCount(
      row?.attempted_count,
      result?.serving_write?.attempted === true,
      count,
    );
    const writtenCount = aggregateCount(
      row?.written_count,
      result?.serving_write?.written === true,
      count,
    );
    const needsHumanCount = aggregateCount(
      row?.needs_human_count,
      result.needs_human_review === true
        || outcome === "needs_human_review"
        || result.resolution === "needs_human_review",
      count,
    );
    const isMenuTask = taskType === "menu_extract";
    const menuTaskCount = isMenuTask ? count : 0;
    const menuApplicationCount = isMenuTask
      ? aggregateCount(
          row?.menu_application_count,
          result?.apply?.written === true,
          count,
        )
      : 0;
    const offeringInsertCount = menuMetric(
      isMenuTask,
      row?.offering_insert_count,
      result?.serving_write?.offerings_inserted,
      "offering insert count",
    );
    const priceBackfillCount = menuMetric(
      isMenuTask,
      row?.price_backfill_count,
      result?.serving_write?.prices_backfilled,
      "price backfill count",
    );
    const priceAmountOnlyBackfillCount = menuMetric(
      isMenuTask,
      row?.price_amount_only_backfill_count,
      result?.serving_write?.price_amount_only_backfills,
      "price amount-only backfill count",
    );
    const treatmentBackfillCount = menuMetric(
      isMenuTask,
      row?.treatment_backfill_count,
      result?.serving_write?.treatments_backfilled,
      "treatment backfill count",
    );
    const priceConflictCount = menuMetric(
      isMenuTask,
      row?.price_conflict_count,
      result?.apply?.counts?.price_conflicts,
      "price conflict count",
    );
    const priceReviewCount = menuMetric(
      isMenuTask,
      row?.price_review_count,
      result?.apply?.counts?.price_reviews,
      "price review count",
    );
    const existingPriceOverwriteCount = menuMetric(
      isMenuTask,
      row?.existing_price_overwrite_count,
      result?.serving_write?.existing_prices_overwritten,
      "existing price overwrite count",
    );
    if (priceAmountOnlyBackfillCount > priceBackfillCount) {
      throw new Error("Amount-only price backfills cannot exceed total price backfills.");
    }
    if (!tasks.has(taskType)) tasks.set(taskType, taskAccumulator(taskType));
    if (!runs.has(runId)) runs.set(runId, taskAccumulator(runId));
    addTaskAggregate(tasks.get(taskType), {
      count,
      status,
      outcome,
      attemptedCount,
      writtenCount,
      needsHumanCount,
      menuTaskCount,
      menuApplicationCount,
      offeringInsertCount,
      priceBackfillCount,
      priceAmountOnlyBackfillCount,
      treatmentBackfillCount,
      priceConflictCount,
      priceReviewCount,
      existingPriceOverwriteCount,
    });
    addTaskAggregate(runs.get(runId), {
      count,
      status,
      outcome,
      attemptedCount,
      writtenCount,
      needsHumanCount,
      menuTaskCount,
      menuApplicationCount,
      offeringInsertCount,
      priceBackfillCount,
      priceAmountOnlyBackfillCount,
      treatmentBackfillCount,
      priceConflictCount,
      priceReviewCount,
      existingPriceOverwriteCount,
    });
    total += count;
    attempted += attemptedCount;
    written += writtenCount;
    needsHuman += needsHumanCount;
    menuTaskRows += menuTaskCount;
    menuApplications += menuApplicationCount;
    offeringsInserted += offeringInsertCount;
    priceBackfills += priceBackfillCount;
    priceAmountOnlyBackfills += priceAmountOnlyBackfillCount;
    treatmentBackfills += treatmentBackfillCount;
    priceConflicts += priceConflictCount;
    priceReviews += priceReviewCount;
    existingPricesOverwritten += existingPriceOverwriteCount;
    statuses[status] = (statuses[status] || 0) + count;
    outcomes[outcome] = (outcomes[outcome] || 0) + count;
  }
  const statusTotal = sumObject(statuses);
  const outcomeTotal = sumObject(outcomes);
  const failedTotal = statuses.failed || 0;
  const recoveredFailures = failedIdentityRows.reduce((total, row) => (
    row.identity && doneIdentities.has(row.identity) ? total + row.count : total
  ), 0);
  const unresolvedFailures = failedTotal - recoveredFailures;
  return {
    total,
    attempted,
    written,
    needsHuman,
    menuTaskRows,
    menuApplications,
    offeringsInserted,
    priceBackfills,
    priceAmountOnlyBackfills,
    fullPairPriceBackfills: priceBackfills - priceAmountOnlyBackfills,
    treatmentBackfills,
    priceConflicts,
    priceReviews,
    existingPricesOverwritten,
    failures: {
      total: failedTotal,
      recovered: recoveredFailures,
      unresolved: unresolvedFailures,
    },
    statuses: sortedObject(statuses),
    outcomes: sortedObject(outcomes),
    byTask: [...tasks.values()].sort((left, right) => left.key.localeCompare(right.key)),
    byRun: [...runs.values()].sort((left, right) => compareRunIds(left.key, right.key)),
    partition: {
      statusTotal,
      outcomeTotal,
      statusesReconciled: statusTotal === total,
      outcomesReconciled: outcomeTotal === total,
    },
  };
}

export function summarizeFinalEvents(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError("eventRows must be an array.");
  const byRun = new Map();
  const byEntity = {};
  const byReason = {};
  const entries = [];
  let total = 0;
  for (const row of rows) {
    const count = nonnegativeInteger(row?.count ?? 1, "event count");
    const runId = optionalRunId(row?.run_id ?? row?.runId) || "_unattributed";
    const entityType = text(row?.entity_type ?? row?.entityType) || "unknown";
    const action = text(row?.action) || "unknown";
    const reason = text(row?.reason) || "_none";
    if (!byRun.has(runId)) byRun.set(runId, { runId, count: 0 });
    byRun.get(runId).count += count;
    byEntity[entityType] = (byEntity[entityType] || 0) + count;
    byReason[reason] = (byReason[reason] || 0) + count;
    entries.push({ runId, entityType, action, reason, count });
    total += count;
  }
  return {
    total,
    byRun: [...byRun.values()].sort((left, right) => compareRunIds(left.runId, right.runId)),
    byEntity: sortedObject(byEntity),
    byReason: sortedObject(byReason),
    entries: entries.sort((left, right) => (
      compareRunIds(left.runId, right.runId)
      || left.entityType.localeCompare(right.entityType)
      || left.action.localeCompare(right.action)
      || left.reason.localeCompare(right.reason)
    )),
  };
}

export function summarizeFinalMenuFieldStatus(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError("fieldStatusRows must be an array.");
  const byRun = new Map();
  const entries = [];
  let total = 0;
  for (const row of rows) {
    const runId = optionalRunId(row?.run_id ?? row?.runId);
    if (!runId) throw new TypeError("menu field-status evidence has an invalid run ID.");
    const entityType = text(row?.entity_type ?? row?.entityType);
    const field = text(row?.field);
    const count = nonnegativeInteger(row?.count ?? 1, "menu field-status count");
    if (!byRun.has(runId)) byRun.set(runId, menuFieldStatusAccumulator(runId));
    const bucket = byRun.get(runId);
    if (entityType === "location" && field === "offerings") {
      bucket.locationOfferings += count;
    } else if (entityType === "offering" && field === "price_amount") {
      bucket.priceAmount += count;
    } else if (entityType === "offering" && field === "price_currency") {
      bucket.priceCurrency += count;
    } else if (entityType === "offering" && field === "treatment_id") {
      bucket.treatment += count;
    } else {
      throw new Error(`Unexpected menu field-status evidence: ${entityType}.${field}.`);
    }
    bucket.total += count;
    total += count;
    entries.push({ runId, entityType, field, count });
  }
  return {
    total,
    entries: entries.sort((left, right) => (
      compareRunIds(left.runId, right.runId)
      || left.entityType.localeCompare(right.entityType)
      || left.field.localeCompare(right.field)
    )),
    byRun: [...byRun.values()].sort((left, right) => compareRunIds(left.runId, right.runId)),
  };
}

export function selectedMenuExtractRunIds(runIds) {
  const selection = isRunSelection(runIds)
    ? runIds
    : normalizeFinalReportRunIds(runIds);
  return selection.entries
    .filter((entry) => entry.roles.some((role) => (
      /(?:^|\.)menu_extract(?:\.|$)/u.test(role)
    )))
    .map((entry) => entry.runId);
}

export function normalizeFinalReportRunIds(runIds, { stage3 = null, redemption = null } = {}) {
  const roles = new Map();
  if (isRunSelection(runIds)) {
    for (const entry of runIds.entries) {
      const runId = optionalRunId(entry.runId);
      if (!runId) throw new TypeError("Invalid run ID in normalized run selection.");
      for (const role of entry.roles) addRunRole(roles, runId, role);
    }
  } else {
    collectRunIds(runIds, [], roles);
  }
  const stage3RunId = stage3RunIdFrom(stage3);
  const redemptionRunId = redemptionRunIdFrom(redemption);
  if (stage3RunId) addRunRole(roles, stage3RunId, "stage3");
  if (redemptionRunId) addRunRole(roles, redemptionRunId, "redemption");
  if (roles.size === 0) {
    throw new TypeError("runIds must contain at least one positive run ID.");
  }
  const entries = [...roles]
    .map(([runId, roleSet]) => ({ runId, roles: [...roleSet].sort() }))
    .sort((left, right) => compareRunIds(left.runId, right.runId));
  return {
    ids: entries.map((entry) => entry.runId),
    entries,
  };
}

export function compareMenuPriceCoverage(menuPricesBefore, after, { required = false } = {}) {
  const beforeSnapshot = unwrapCensusSnapshot(menuPricesBefore);
  const afterSnapshot = unwrapCensusSnapshot(after);
  if (!beforeSnapshot) {
    if (required) {
      throw new Error(
        `Selected menu_extract runs require ${ENRICHMENT_MENU_PRICES_CENSUS_FILENAME} as the supplemental pre-menu baseline.`,
      );
    }
    return deepFreeze({ available: false, before: null, after: null, delta: null });
  }
  if (!afterSnapshot?.menuPrices) {
    throw new Error("Menu price closeout requires after-census menuPrices evidence.");
  }
  const before = normalizeMenuPriceCoverage(beforeSnapshot, "pre-menu baseline");
  const later = normalizeMenuPriceCoverage(afterSnapshot, "after census");
  return deepFreeze({
    available: true,
    before,
    after: later,
    delta: {
      menuPresentLocations: later.menuPresentLocations - before.menuPresentLocations,
      pricedLocations: later.pricedLocations - before.pricedLocations,
      menuMissingLocations: later.menuMissingLocations - before.menuMissingLocations,
      pricesMissingLocations: later.pricesMissingLocations - before.pricesMissingLocations,
      pricedOverallPercentagePoints: later.pricedOverallPct - before.pricedOverallPct,
      pricedAmongMenusPercentagePoints: later.pricedAmongMenusPct - before.pricedAmongMenusPct,
    },
  });
}

export function assertEnrichmentFinalReconciliation(data) {
  if (!data?.reconciliation || !Array.isArray(data.reconciliation.checks)) {
    throw new TypeError("final report data has no reconciliation evidence.");
  }
  const failures = data.reconciliation.checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    throw new Error(
      `Final enrichment reconciliation failed: ${failures.map((check) => (
        `${check.id}=${check.actual}/${check.expected}`
      )).join(", ")}.`,
    );
  }
  return true;
}

export function renderEnrichmentFinalReport(data) {
  if (!data || data.schemaVersion !== ENRICHMENT_FINAL_REPORT_VERSION) {
    throw new TypeError("renderEnrichmentFinalReport requires final report data.");
  }
  const lines = [
    "# Fountain Pipeline Restructure — Final Enrichment Report",
    "",
    data.reconciliation.ok
      ? "**FINAL RECONCILIATION COMPLETE**"
      : "**FINAL RECONCILIATION ATTENTION REQUIRED**",
    "",
    `Generated: ${data.generatedAt || "not supplied"}. Census population is active, non-deleted, non-suppressed locations.`,
    "",
    "## Run scope",
    "",
    "| Run | Role(s) |",
    "| ---: | --- |",
    ...data.runSelection.entries.map((entry) => (
      `| ${entry.runId} | ${entry.roles.map(code).join(", ")} |`
    )),
    "",
    "## Before/after field coverage",
    "",
    `Eligible population: ${integer(data.before.population.eligible)} before; ${integer(data.after.population.eligible)} after; delta ${signedInteger(data.comparison.population.delta)}.`,
    "",
    "| Field | Before covered | Before % | After covered | After % | Δ covered | Δ pp |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const field of ENRICHMENT_FIELDS) {
    const before = data.before.coverage.overall.fields[field];
    const after = data.after.coverage.overall.fields[field];
    const compared = data.comparison.coverage.overall.fields[field];
    lines.push(
      `| ${code(field)} | ${integer(before.covered)} | ${percentage(before.coveragePct)} | ${integer(after.covered)} | ${percentage(after.coveragePct)} | ${signedInteger(compared.coveredDelta)} | ${signedNumber(compared.percentagePointDelta)} |`,
    );
  }

  appendLegitimacySummary(lines, data);
  appendRedeemedLocations(lines, data.redemption.redeemed);
  appendTaskSummary(lines, data.tasks);
  appendMenuPriceSummary(lines, data);
  appendExternalSummary(lines, data.external);
  appendServingState(lines, data.servingState, data.events);
  appendReconciliation(lines, data.reconciliation);
  appendRemainingGaps(lines, data.after);
  lines.push("", "## Follow-ups", "");
  if (data.followUps.length === 0) lines.push("- None.");
  else for (const followUp of data.followUps) lines.push(`- ${followUp}`);
  return `${lines.join("\n")}\n`;
}

function appendLegitimacySummary(lines, data) {
  const stage3 = data.stage3;
  const redemption = data.redemption;
  lines.push(
    "",
    "## Legitimacy resolution",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Stage 3 cohort | ${integer(stage3.cohortRows)} |`,
    `| Stage 3 keep rows | ${integer(stage3.keepRows)} |`,
    `| Stage 3 suppressed rows | ${integer(stage3.suppressionRows)} |`,
    `| Active needs_human_review | ${integer(stage3.humanReviewRows)} |`,
    `| Redemption candidates | ${integer(redemption.candidateRows)} |`,
    `| Redeemed locations | ${integer(redemption.redeemRows)} |`,
    `| Retained suppressions | ${integer(redemption.retainSuppressedRows)} |`,
  );
}

function appendRedeemedLocations(lines, redeemed) {
  lines.push("", "## Redeemed locations", "");
  if (redeemed.length === 0) {
    lines.push("_No locations were redeemed._");
    return;
  }
  lines.push(
    "| ID | Name | Final class | Confidence | Official website | Suppression rows removed |",
    "| ---: | --- | --- | ---: | --- | ---: |",
  );
  for (const row of redeemed) {
    lines.push(
      `| ${row.locationId} | ${cell(row.name || "—")} | ${code(row.className)} | ${row.confidence.toFixed(2)} | ${cell(row.officialWebsite || "—")} | ${integer(row.deletedSuppressionRows)} |`,
    );
  }
}

function appendTaskSummary(lines, tasks) {
  lines.push(
    "",
    "## Queue task outcomes and serving writes",
    "",
    `Selected-run task rows: ${integer(tasks.total)}; serving writes attempted by ${integer(tasks.attempted)} task(s), completed by ${integer(tasks.written)} task(s); needs_human_review outcomes: ${integer(tasks.needsHuman)}.`,
    `Historical failed rows: ${integer(tasks.failures.total)}; recovered by a selected-run done row for the same task/entity: ${integer(tasks.failures.recovered)}; unresolved: ${integer(tasks.failures.unresolved)}.`,
    "| Task | Total | Pending | Claimed | Done | Failed | Skipped | Write attempted | Written | Needs human |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const task of tasks.byTask) {
    lines.push(
      `| ${code(task.key)} | ${integer(task.total)} | ${integer(task.statuses.pending)} | ${integer(task.statuses.claimed)} | ${integer(task.statuses.done)} | ${integer(task.statuses.failed)} | ${integer(task.statuses.skipped)} | ${integer(task.attempted)} | ${integer(task.written)} | ${integer(task.needsHuman)} |`,
    );
  }
  if (tasks.byTask.length === 0) lines.push("| _none_ | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |");
}

function appendMenuPriceSummary(lines, data) {
  if (!data.menuPrices.available && data.menuRunIds.length === 0) return;
  lines.push("", "## Menu and price enrichment", "");
  if (data.menuPrices.available) {
    const before = data.menuPrices.before;
    const after = data.menuPrices.after;
    const delta = data.menuPrices.delta;
    lines.push(
      `Supplemental pre-menu baseline: ${code(before.label)} (${before.capturedAt || "capture time not supplied"}). The frozen initial census remains unchanged.`,
      "",
      "| Location-level coverage | Pre-menu | Final | Δ |",
      "| --- | ---: | ---: | ---: |",
      `| Eligible locations | ${integer(before.eligible)} | ${integer(after.eligible)} | ${signedInteger(after.eligible - before.eligible)} |`,
      `| Locations with a menu | ${integer(before.menuPresentLocations)} | ${integer(after.menuPresentLocations)} | ${signedInteger(delta.menuPresentLocations)} |`,
      `| Locations with at least one priced offering | ${integer(before.pricedLocations)} | ${integer(after.pricedLocations)} | ${signedInteger(delta.pricedLocations)} |`,
      `| Missing menus | ${integer(before.menuMissingLocations)} | ${integer(after.menuMissingLocations)} | ${signedInteger(delta.menuMissingLocations)} |`,
      `| Menu present, zero priced offerings | ${integer(before.pricesMissingLocations)} | ${integer(after.pricesMissingLocations)} | ${signedInteger(delta.pricesMissingLocations)} |`,
      `| Priced coverage of all eligible locations | ${percentage(before.pricedOverallPct)} | ${percentage(after.pricedOverallPct)} | ${signedNumber(delta.pricedOverallPercentagePoints)} pp |`,
      `| Priced coverage among menu-bearing locations | ${percentage(before.pricedAmongMenusPct)} | ${percentage(after.pricedAmongMenusPct)} | ${signedNumber(delta.pricedAmongMenusPercentagePoints)} pp |`,
      "",
    );
  }
  lines.push(
    `Selected menu tasks: ${integer(data.tasks.menuTaskRows)}; guarded location applications: ${integer(data.tasks.menuApplications)}.`,
    "",
    "| Run | Tasks | Location applications | Offerings inserted | Full-pair price backfills | Amount-only price backfills | Total price backfills | Treatment backfills | Price conflicts | Price reviews | Existing prices overwritten |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const runId of data.menuRunIds) {
    const task = taskRun(data.tasks, runId) || taskAccumulator(runId);
    lines.push(
      `| ${runId} | ${integer(task.menuTaskRows)} | ${integer(task.menuApplications)} | ${integer(task.offeringsInserted)} | ${integer(task.fullPairPriceBackfills)} | ${integer(task.priceAmountOnlyBackfills)} | ${integer(task.priceBackfills)} | ${integer(task.treatmentBackfills)} | ${integer(task.priceConflicts)} | ${integer(task.priceReviews)} | ${integer(task.existingPricesOverwritten)} |`,
    );
  }
  if (data.menuRunIds.length === 0) {
    lines.push("| — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |");
  }
}

function appendExternalSummary(lines, external) {
  lines.push(
    "",
    "## External-call ledger",
    "",
    `Ledgered calls: ${integer(external.calls)}; failures: ${integer(external.failedCalls)}; estimated spend: ${usd(external.estimatedCostUsd)}.`,
    "",
    "### Spend by selected run/stage",
    "",
    "| Run | Role(s) | Calls | LLM | Places contact | Places reviews | Places geocode | Places other | Other providers | Total |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...external.byRun.map((run) => (
      `| ${cell(run.runId)} | ${run.roles.length > 0 ? run.roles.map(code).join(", ") : "_unattributed_"} | ${integer(run.calls)} | ${usd(run.llm.estimatedCostUsd)} | ${usd(run.places.contact.estimatedCostUsd)} | ${usd(run.places.reviews.estimatedCostUsd)} | ${usd(run.places.geocode.estimatedCostUsd)} | ${usd(run.places.other.estimatedCostUsd)} | ${usd(run.other.estimatedCostUsd)} | ${usd(run.estimatedCostUsd)} |`
    )),
    "",
    "### LLM calls by model",
    "",
    "| Model | Calls | Failed | Input tokens | Output tokens | Total tokens | Estimated cost |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const model of external.llm.byModel) {
    lines.push(
      `| ${code(model.model)} | ${integer(model.calls)} | ${integer(model.failedCalls)} | ${integer(model.inputTokens)} | ${integer(model.outputTokens)} | ${integer(model.totalTokens)} | ${usd(model.estimatedCostUsd)} |`,
    );
  }
  if (external.llm.byModel.length === 0) {
    lines.push("| _none_ | 0 | 0 | 0 | 0 | 0 | $0.0000 |");
  }
  lines.push(
    "",
    "### Google Places calls by use",
    "",
    "| Use | Calls | Failed | Estimated cost |",
    "| --- | ---: | ---: | ---: |",
    placesRow("Contact / legitimacy discovery", external.places.contact),
    placesRow("Reviews", external.places.reviews),
    placesRow("Geocode", external.places.geocode),
    placesRow("Other / unclassified", external.places.other),
    "",
    `Other-provider calls: ${integer(external.other.calls)}; estimated cost ${usd(external.other.estimatedCostUsd)}.`,
  );
}

function appendServingState(lines, state, events) {
  lines.push(
    "",
    "## Final serving and mutation state",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Non-deleted locations | ${integer(state.nondeletedLocations)} |`,
    `| Active locations | ${integer(state.activeLocations)} |`,
    `| Hidden locations | ${integer(state.hiddenLocations)} |`,
    `| Other non-deleted statuses | ${integer(state.otherNondeletedLocations)} |`,
    `| Deleted rows | ${integer(state.deletedLocations)} |`,
    `| Suppression-ledger rows | ${integer(state.suppressionLedgerRows)} |`,
    `| Distinct linked suppressed locations | ${integer(state.suppressedLocations)} |`,
    `| Location search rows | ${integer(state.searchLocationRows)} |`,
    `| Location field-ledger rows | ${integer(state.locationFieldStatusRows)} |`,
    `| Run-linked entity change events | ${integer(events.total)} |`,
    "",
    "### Run-linked events",
    "",
    "| Run | Events |",
    "| ---: | ---: |",
  );
  for (const row of events.byRun) lines.push(`| ${row.runId} | ${integer(row.count)} |`);
  if (events.byRun.length === 0) lines.push("| — | 0 |");
}

function appendReconciliation(lines, reconciliation) {
  lines.push(
    "",
    "## Explicit ledger reconciliation",
    "",
    "| Check | Expected | Actual | Status |",
    "| --- | ---: | ---: | --- |",
  );
  for (const check of reconciliation.checks) {
    lines.push(
      `| ${cell(check.label)} | ${formatCheckValue(check.expected)} | ${formatCheckValue(check.actual)} | ${check.ok ? "OK" : "MISMATCH"} |`,
    );
  }
  lines.push(
    "",
    reconciliation.ok
      ? "Every required partition and campaign apply check reconciles."
      : `Mismatches requiring follow-up: ${reconciliation.failures.map((check) => code(check.id)).join(", ")}.`,
  );
}

function appendRemainingGaps(lines, after) {
  lines.push(
    "",
    "## Remaining enrichment gaps",
    "",
    "| Task | Remaining gap | Actionable | Attempted unresolved | Enqueueable | Blocked |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const taskType of ENRICHMENT_TASK_TYPES) {
    const gap = after.gaps[taskType];
    lines.push(
      `| ${code(taskType)} | ${integer(gap.count)} | ${integer(gap.actionableCount)} | ${integer(gap.attemptedUnresolvedCount || 0)} | ${integer(gap.enqueueableCount ?? gap.actionableCount)} | ${integer(gap.blockedCount)} |`,
    );
  }
}

function buildFinalReconciliation({
  before,
  after,
  stage3,
  redemption,
  external,
  tasks,
  servingState,
  events,
  menuRunIds,
  menuPrices,
  menuFieldStatus,
}) {
  const checks = [];
  addCheck(checks, "external_call_partition", "External calls partitioned", external.calls, external.partition.calls);
  addCheck(
    checks,
    "external_cost_partition",
    "External-call cost partitioned (USD)",
    external.estimatedCostUsd,
    external.partition.costUsd,
    nearlyEqual,
  );
  addCheck(
    checks,
    "external_run_partition",
    "External calls partitioned by selected run",
    external.calls,
    external.runPartition.calls,
  );
  addCheck(
    checks,
    "external_run_cost_partition",
    "External-call cost partitioned by selected run (USD)",
    external.estimatedCostUsd,
    external.runPartition.costUsd,
    nearlyEqual,
  );
  addCheck(checks, "task_status_partition", "Task rows partitioned by status", tasks.total, tasks.partition.statusTotal);
  addCheck(checks, "task_outcome_partition", "Task rows partitioned by outcome", tasks.total, tasks.partition.outcomeTotal);
  appendMenuPriceReconciliation(checks, {
    before,
    after,
    tasks,
    events,
    menuRunIds,
    menuPrices,
    menuFieldStatus,
  });
  addCheck(
    checks,
    "location_status_partition",
    "Non-deleted locations partitioned by status",
    servingState.nondeletedLocations,
    servingState.activeLocations + servingState.hiddenLocations + servingState.otherNondeletedLocations,
  );
  addCheck(
    checks,
    "active_search_rows",
    "Active locations represented in search",
    servingState.activeLocations,
    servingState.searchLocationRows,
  );
  addCheck(
    checks,
    "after_census_population",
    "After-census population matches active serving locations",
    after.population.eligible,
    servingState.activeLocations,
  );

  if (stage3.available) {
    addCheck(
      checks,
      "stage3_disposition_partition",
      "Stage 3 cohort disposition partition",
      stage3.cohortRows,
      stage3.keepRows + stage3.suppressionRows + stage3.humanReviewRows,
    );
    addCheck(checks, "stage3_hidden", "Stage 3 hidden locations", stage3.suppressionRows, stage3.hiddenActual);
    addCheck(
      checks,
      "stage3_suppression_ledger",
      "Stage 3 suppression-ledger writes",
      stage3.suppressionLedgerExpected,
      stage3.suppressionLedgerActual,
    );
    addCheck(checks, "stage3_events", "Stage 3 stamped events", stage3.suppressionRows, stage3.eventActual);
    addCheck(
      checks,
      "stage3_event_ledger_query",
      "Stage 3 suppression events found by run ledger query",
      stage3.suppressionRows,
      eventReasonCount(events, (reason) => reason === "pass1_stage3_legitimacy_suppression"),
    );
    addCheck(checks, "stage3_search_residual", "Stage 3 residual search rows", 0, stage3.remainingSearchRows);
    addCheck(checks, "stage3_hard_exclusions", "Stage 3 hard exclusions touched", 0, stage3.hardExclusionsTouched);
    const stage3TaskRun = taskRun(tasks, stage3.runId);
    if (stage3TaskRun) {
      addCheck(checks, "stage3_task_rows", "Stage 3 task evidence rows", stage3.cohortRows, stage3TaskRun.total);
      addCheck(
        checks,
        "stage3_needs_human",
        "Stage 3 needs_human_review task rows",
        stage3.humanReviewRows,
        stage3TaskRun.needsHuman,
      );
    }
  }

  if (redemption.available) {
    addCheck(
      checks,
      "redemption_decisions",
      "Redemption candidate decision partition",
      redemption.candidateRows,
      redemption.redeemRows + redemption.retainSuppressedRows,
    );
    addCheck(checks, "redemption_list", "Redeemed decision list", redemption.redeemRows, redemption.redeemed.length);
    if (redemption.applied) {
      addCheck(checks, "redemption_active", "Redemptions reactivated", redemption.redeemRows, redemption.activeActual);
      addCheck(checks, "redemption_search", "Redemption search rows restored", redemption.redeemRows, redemption.searchActual);
      addCheck(checks, "redemption_events", "Redemption events stamped", redemption.redeemRows, redemption.eventActual);
      addCheck(
        checks,
        "redemption_event_ledger_query",
        "Redemption events found by run ledger query",
        redemption.redeemRows,
        eventReasonCount(events, (reason) => reason.startsWith("legitimacy_redemption:")),
      );
      addCheck(checks, "redemption_tasks", "Redemption task evidence", redemption.redeemRows, redemption.taskEvidenceActual);
      addCheck(checks, "redemption_status_ledger", "Redemption status-ledger rows", redemption.redeemRows, redemption.statusLedgerActual);
      addCheck(
        checks,
        "redemption_suppression_delete",
        "Owned suppression rows removed",
        redemption.suppressionRowsExpectedDeleted,
        redemption.suppressionRowsActualDeleted,
      );
    }
  }
  const redeemedCount = redemption.applied ? redemption.redeemRows : 0;
  if (stage3.activeLocationsAfter !== null) {
    addCheck(
      checks,
      "final_active_locations",
      "Final active locations after redemption",
      stage3.activeLocationsAfter + redeemedCount,
      servingState.activeLocations,
    );
  }
  if (stage3.hiddenLocationsAfter !== null) {
    addCheck(
      checks,
      "final_hidden_locations",
      "Final hidden locations after redemption",
      stage3.hiddenLocationsAfter - redeemedCount,
      servingState.hiddenLocations,
    );
  }
  const expectedSuppressionLedger = redemption.applied
    ? redemption.suppressionLedgerAfter
    : stage3.suppressionLedgerAfter;
  if (expectedSuppressionLedger !== null) {
    addCheck(
      checks,
      "final_suppression_ledger",
      "Final suppression-ledger rows",
      expectedSuppressionLedger,
      servingState.suppressionLedgerRows,
    );
  }
  const failures = checks.filter((check) => !check.ok);
  return { ok: failures.length === 0, checks, failures };
}

function appendMenuPriceReconciliation(checks, {
  before,
  after,
  tasks,
  events,
  menuRunIds,
  menuPrices,
  menuFieldStatus,
}) {
  if (menuPrices.available) {
    addCheck(
      checks,
      "menu_prices_baseline_population",
      "Supplemental pre-menu population matches frozen before census",
      before.population.eligible,
      menuPrices.before.eligible,
    );
    addCheck(
      checks,
      "menu_prices_after_population",
      "Final menu-price population matches after census",
      after.population.eligible,
      menuPrices.after.eligible,
    );
    addCheck(
      checks,
      "menu_prices_population_stable",
      "Pre-menu and final menu-price populations match",
      menuPrices.before.eligible,
      menuPrices.after.eligible,
    );
    appendMenuCoverageSnapshotChecks(checks, "before", menuPrices.before);
    appendMenuCoverageSnapshotChecks(checks, "after", menuPrices.after);
  }

  for (const runId of menuRunIds) {
    const suffix = `run_${runId}`;
    const task = taskRun(tasks, runId) || taskAccumulator(runId);
    const ledger = menuFieldStatusRun(menuFieldStatus, runId);
    const fullPairEvents = exactEventCount(events, {
      runId,
      entityType: "offerings",
      action: "update",
      reason: "menu_extract:price_backfill",
    });
    const amountOnlyEvents = exactEventCount(events, {
      runId,
      entityType: "offerings",
      action: "update",
      reason: "menu_extract:price_amount_backfill",
    });
    addCheck(
      checks,
      `menu_task_evidence_${suffix}`,
      `Menu run ${runId} has task evidence`,
      1,
      task.menuTaskRows > 0 ? 1 : 0,
    );
    addCheck(
      checks,
      `menu_offering_insert_events_${suffix}`,
      `Menu run ${runId} offering inserts have exact events`,
      task.offeringsInserted,
      exactEventCount(events, {
        runId,
        entityType: "offerings",
        action: "insert",
        reason: "menu_extract:offering_insert",
      }),
    );
    addCheck(
      checks,
      `menu_full_pair_price_events_${suffix}`,
      `Menu run ${runId} full-pair price backfills have exact events`,
      task.fullPairPriceBackfills,
      fullPairEvents,
    );
    addCheck(
      checks,
      `menu_amount_only_price_events_${suffix}`,
      `Menu run ${runId} amount-only price backfills have exact events`,
      task.priceAmountOnlyBackfills,
      amountOnlyEvents,
    );
    addCheck(
      checks,
      `menu_total_price_events_${suffix}`,
      `Menu run ${runId} total price backfills have exact events`,
      task.priceBackfills,
      fullPairEvents + amountOnlyEvents,
    );
    addCheck(
      checks,
      `menu_treatment_events_${suffix}`,
      `Menu run ${runId} treatment backfills have exact events`,
      task.treatmentBackfills,
      exactEventCount(events, {
        runId,
        entityType: "offerings",
        action: "update",
        reason: "menu_extract:treatment_backfill",
      }),
    );
    addCheck(
      checks,
      `menu_location_offerings_ledger_${suffix}`,
      `Menu run ${runId} guarded applications have location offerings ledger rows`,
      task.menuApplications,
      ledger.locationOfferings,
    );
    addCheck(
      checks,
      `menu_price_amount_ledger_${suffix}`,
      `Menu run ${runId} price backfills have price_amount ledger rows`,
      task.priceBackfills,
      ledger.priceAmount,
    );
    addCheck(
      checks,
      `menu_price_currency_ledger_${suffix}`,
      `Menu run ${runId} full-pair price events have price_currency ledger rows`,
      fullPairEvents,
      ledger.priceCurrency,
    );
    addCheck(
      checks,
      `menu_treatment_ledger_${suffix}`,
      `Menu run ${runId} treatment backfills have treatment ledger rows`,
      task.treatmentBackfills,
      ledger.treatment,
    );
    addCheck(
      checks,
      `menu_existing_price_overwrites_${suffix}`,
      `Menu run ${runId} existing prices overwritten`,
      0,
      task.existingPricesOverwritten,
    );
  }
}

function appendMenuCoverageSnapshotChecks(checks, period, coverage) {
  addCheck(
    checks,
    `menu_prices_${period}_partition`,
    `${period === "before" ? "Pre-menu" : "Final"} price-coverage population partition`,
    coverage.eligible,
    coverage.menuMissingLocations
      + coverage.pricesMissingLocations
      + coverage.pricedLocations,
  );
  if (coverage.observedLocationCount !== null) {
    addCheck(
      checks,
      `menu_prices_${period}_location_count`,
      `${period === "before" ? "Pre-menu" : "Final"} price-coverage location rows`,
      coverage.eligible,
      coverage.observedLocationCount,
    );
    addCheck(
      checks,
      `menu_prices_${period}_menu_missing`,
      `${period === "before" ? "Pre-menu" : "Final"} missing-menu cohort matches rows`,
      coverage.menuMissingLocations,
      coverage.observedMenuMissingLocations,
    );
    addCheck(
      checks,
      `menu_prices_${period}_prices_missing`,
      `${period === "before" ? "Pre-menu" : "Final"} zero-priced-menu cohort matches rows`,
      coverage.pricesMissingLocations,
      coverage.observedPricesMissingLocations,
    );
  }
}

function eventReasonCount(events, predicate) {
  return Object.entries(events.byReason)
    .filter(([reason]) => predicate(reason))
    .reduce((total, [, count]) => total + count, 0);
}

function exactEventCount(events, { runId, entityType, action, reason }) {
  return events.entries
    .filter((entry) => (
      entry.runId === runId
      && entry.entityType === entityType
      && entry.action === action
      && entry.reason === reason
    ))
    .reduce((total, entry) => total + entry.count, 0);
}

function assertMenuPriceEvidenceAvailability(menuPricesBefore, after, menuRunIds) {
  if (menuRunIds.length === 0) return;
  if (!unwrapCensusSnapshot(menuPricesBefore)) {
    throw new Error(
      `Selected menu_extract runs require ${ENRICHMENT_MENU_PRICES_CENSUS_FILENAME} as the supplemental pre-menu baseline.`,
    );
  }
  if (!unwrapCensusSnapshot(after)?.menuPrices) {
    throw new Error("Selected menu_extract runs require after-census menuPrices evidence.");
  }
}

function normalizeMenuPriceCoverage(snapshot, label) {
  const population = object(snapshot?.population);
  const menuPrices = object(snapshot?.menuPrices);
  const menuMissing = object(menuPrices.menuMissing);
  const pricesMissing = object(menuPrices.pricesMissing);
  const eligible = nonnegativeInteger(population.eligible, `${label} eligible population`);
  const menuMissingLocations = nonnegativeInteger(
    menuMissing.count,
    `${label} missing-menu count`,
  );
  const pricesMissingLocations = nonnegativeInteger(
    pricesMissing.count,
    `${label} prices-missing count`,
  );
  if (menuMissingLocations + pricesMissingLocations > eligible) {
    throw new Error(`${label} menu-price cohorts exceed the eligible population.`);
  }
  const menuPresentLocations = eligible - menuMissingLocations;
  const pricedLocations = eligible - menuMissingLocations - pricesMissingLocations;
  const locations = Array.isArray(snapshot?.locations) ? snapshot.locations : null;
  const observed = locations ? observeMenuPriceCoverage(locations) : null;
  return {
    label: text(snapshot?.label) || label,
    capturedAt: optionalIsoTimestamp(snapshot?.capturedAt),
    eligible,
    menuMissingLocations,
    pricesMissingLocations,
    menuPresentLocations,
    pricedLocations,
    pricedOverallPct: percentageValue(pricedLocations, eligible),
    pricedAmongMenusPct: percentageValue(pricedLocations, menuPresentLocations),
    observedLocationCount: observed?.locationCount ?? null,
    observedMenuMissingLocations: observed?.menuMissingLocations ?? null,
    observedPricesMissingLocations: observed?.pricesMissingLocations ?? null,
  };
}

function observeMenuPriceCoverage(locations) {
  let menuMissingLocations = 0;
  let pricesMissingLocations = 0;
  for (const location of locations) {
    const menuCount = nonnegativeInteger(
      location?.menuCount ?? location?.menu_count,
      "menu-price location menu count",
    );
    const pricedCount = nonnegativeInteger(
      location?.pricedCount ?? location?.priced_count,
      "menu-price location priced count",
    );
    if (pricedCount > menuCount) {
      throw new Error("menu-price location priced count exceeds menu count.");
    }
    if (menuCount === 0) menuMissingLocations += 1;
    else if (pricedCount === 0) pricesMissingLocations += 1;
  }
  return { locationCount: locations.length, menuMissingLocations, pricesMissingLocations };
}

function unwrapCensusSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value.snapshot ?? value;
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot
    : null;
}

function percentageValue(numerator, denominator) {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

function normalizeStage3Summary(input) {
  const top = object(input);
  const root = object(top.result && typeof top.result === "object" ? top.result : top);
  const execution = object(root.execution ?? top.execution);
  const suppression = object(root.suppression ?? top.suppression);
  const planCounts = object(execution?.plan?.counts ?? root.counts ?? top.counts);
  const preflight = object(suppression.preflight);
  const verification = object(suppression.verification);
  const available = Object.keys(input || {}).length > 0;
  return {
    available,
    runId: optionalRunId(
      execution.runId ?? suppression.applyRunId ?? root.runId ?? top.runId,
    ),
    cohortRows: numberFrom(planCounts.cohortRows ?? planCounts.cohort_rows),
    keepRows: numberFrom(planCounts.keepRows ?? planCounts.keep),
    suppressionRows: numberFrom(
      planCounts.suppressionRows ?? planCounts.suppressed ?? suppression.expectedSuppressionCount,
    ),
    humanReviewRows: numberFrom(
      planCounts.humanReviewRows ?? planCounts.needs_human_review,
    ),
    hiddenActual: numberFrom(verification.hiddenCount ?? verification.hidden_count),
    suppressionLedgerExpected: numberFrom(
      preflight.sourceRecordFanout ?? preflight.source_record_fanout,
    ),
    suppressionLedgerActual: numberFrom(
      verification.runSuppressionLedgerRows ?? verification.run_suppression_ledger_rows,
    ),
    eventActual: numberFrom(verification.stampedEventCount ?? verification.stamped_event_count),
    remainingSearchRows: numberFrom(
      verification.remainingSearchRows ?? verification.remaining_search_rows,
    ),
    hardExclusionsTouched: numberFrom(
      preflight.hardExcludedCandidateCount ?? preflight.hard_excluded_candidate_count,
    ),
    activeLocationsAfter: optionalNonnegativeNumber(
      verification.activeLocationsAfter ?? verification.active_locations_after,
    ),
    hiddenLocationsAfter: optionalNonnegativeNumber(
      verification.hiddenLocationsAfter ?? verification.hidden_locations_after,
    ),
    suppressionLedgerAfter: optionalNonnegativeNumber(
      verification.suppressionLedgerAfter ?? verification.suppression_ledger_after,
    ),
  };
}

function normalizeRedemptionSummary(input) {
  const top = object(input);
  const root = object(top.result && typeof top.result === "object" ? top.result : top);
  const cohort = object(root.cohort ?? top.cohort);
  const pass = object(root.pass ?? top.pass);
  const apply = object(root.apply ?? top.apply);
  const passCounts = object(pass.counts ?? root.counts ?? top.counts);
  const cohortCounts = object(cohort.counts ?? cohort ?? root.cohortCounts);
  const verification = object(apply.verification);
  const preflight = object(apply.preflight);
  const decisions = Array.isArray(pass.decisions) ? pass.decisions : [];
  const appliedById = new Map(
    (Array.isArray(apply.applied) ? apply.applied : []).map((row) => [Number(row.locationId), row]),
  );
  const redeemed = decisions
    .filter((decision) => (
      apply.apply === true
      && decision?.action === "redeem"
      && appliedById.has(Number(decision.locationId))
    ))
    .map((decision) => {
      const applied = appliedById.get(Number(decision.locationId));
      return {
        locationId: positiveInteger(decision.locationId, "redeemed location id"),
        name: text(decision.name),
        className: text(decision.class) || "unknown",
        confidence: boundedNumber(decision.confidence, 0, 1, "redemption confidence"),
        officialWebsite: text(decision.officialWebsite),
        deletedSuppressionRows: numberFrom(
          applied?.deletedSuppressionRows ?? decision.deletedSuppressionRows,
        ),
      };
    })
    .sort((left, right) => left.locationId - right.locationId);
  const suppressionBefore = numberFrom(preflight.suppressionLedgerBefore);
  const suppressionAfter = numberFrom(verification.suppressionLedgerAfter);
  return {
    available: Object.keys(input || {}).length > 0,
    applied: apply.apply === true,
    runId: optionalRunId(pass.runId ?? apply.runId ?? root.runId ?? top.runId),
    candidateRows: numberFrom(cohortCounts.candidates ?? passCounts.candidates),
    redeemRows: numberFrom(passCounts.redeem ?? apply.expectedRedemptionCount),
    retainSuppressedRows: numberFrom(passCounts.retainSuppressed),
    activeActual: numberFrom(verification.activeCount),
    searchActual: numberFrom(verification.searchIndexCount),
    eventActual: numberFrom(verification.eventCount),
    taskEvidenceActual: numberFrom(verification.taskEvidenceCount),
    statusLedgerActual: numberFrom(verification.statusLedgerCount),
    suppressionRowsExpectedDeleted: numberFrom(preflight.ownedSuppressionCount),
    suppressionRowsActualDeleted: Math.max(0, suppressionBefore - suppressionAfter),
    suppressionLedgerAfter: optionalNonnegativeNumber(verification.suppressionLedgerAfter),
    redeemed,
  };
}

function normalizeServingState(row) {
  return {
    nondeletedLocations: numberFrom(row?.nondeleted_locations ?? row?.nondeletedLocations),
    activeLocations: numberFrom(row?.active_locations ?? row?.activeLocations),
    hiddenLocations: numberFrom(row?.hidden_locations ?? row?.hiddenLocations),
    otherNondeletedLocations: numberFrom(
      row?.other_nondeleted_locations ?? row?.otherNondeletedLocations,
    ),
    deletedLocations: numberFrom(row?.deleted_locations ?? row?.deletedLocations),
    suppressionLedgerRows: numberFrom(
      row?.suppression_ledger_rows ?? row?.suppressionLedgerRows,
    ),
    suppressedLocations: numberFrom(row?.suppressed_locations ?? row?.suppressedLocations),
    searchLocationRows: numberFrom(row?.search_location_rows ?? row?.searchLocationRows),
    locationFieldStatusRows: numberFrom(
      row?.location_field_status_rows ?? row?.locationFieldStatusRows,
    ),
  };
}

function buildFollowUps(data) {
  const followUps = [];
  if (!data.reconciliation.ok) {
    followUps.push(
      `Resolve ledger mismatches before closeout: ${data.reconciliation.failures.map((check) => code(check.id)).join(", ")}.`,
    );
  }
  const failed = data.tasks.failures?.unresolved ?? data.tasks.statuses.failed ?? 0;
  const activeQueue = (data.tasks.statuses.pending || 0) + (data.tasks.statuses.claimed || 0);
  if (failed > 0) followUps.push(`Investigate ${integer(failed)} unresolved failed selected-run task(s).`);
  if (activeQueue > 0) followUps.push(`Drain or intentionally defer ${integer(activeQueue)} pending/claimed task(s).`);
  if (data.stage3.humanReviewRows > 0) {
    followUps.push(
      `Resolve the ${integer(data.stage3.humanReviewRows)} active Stage 3 needs_human_review location(s) through the final human-review queue.`,
    );
  }
  for (const taskType of ENRICHMENT_TASK_TYPES) {
    const gap = data.after.gaps[taskType];
    const enqueueableCount = gap.enqueueableCount ?? gap.actionableCount;
    if (enqueueableCount > 0) {
      followUps.push(
        `Re-enqueue ${integer(enqueueableCount)} remaining enqueueable ${code(taskType)} gap(s) after reviewing no-change/provider outcomes.`,
      );
    }
  }
  const reviewsGap = data.after.gaps.reviews_fetch;
  if ((reviewsGap.enqueueableCount ?? reviewsGap.actionableCount) > 0) {
    followUps.push("Reconfirm the current Google Places reviews SKU and budget before any later review expansion.");
  }
  followUps.push("Repeat the completeness census monthly and investigate any newly introduced gaps or suppression/search drift.");
  return followUps;
}

function placesCategory(call, runSelection) {
  const runId = optionalRunId(call?.run_id ?? call?.runId);
  const entry = runSelection.entries.find((candidate) => candidate.runId === runId);
  const args = object(call?.run_args ?? call?.runArgs);
  const roleText = [
    ...(entry?.roles || []),
    text(args.task),
    text(args.task_type),
    text(call?.run_command ?? call?.runCommand),
  ].join(" ").toLowerCase();
  if (/review/u.test(roleText)) return "reviews";
  if (/geocode/u.test(roleText)) return "geocode";
  if (/(?:contact|stage3|redemption|legitimacy)/u.test(roleText)) return "contact";
  return "other";
}

function collectRunIds(value, path, roles) {
  if (value === null || value === undefined || value === "") return;
  const scalar = optionalRunId(value);
  if (scalar) {
    addRunRole(roles, scalar, path.length ? path.join(".") : "selected");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectRunIds(child, [...path, String(index)], roles));
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectRunIds(child, [...path, key], roles);
    }
    return;
  }
  throw new TypeError(`Invalid run ID at ${path.join(".") || "runIds"}.`);
}

function addRunRole(roles, runId, role) {
  if (!roles.has(runId)) roles.set(runId, new Set());
  roles.get(runId).add(role || "selected");
}

function stage3RunIdFrom(stage3) {
  const top = object(stage3);
  const root = object(top.result && typeof top.result === "object" ? top.result : top);
  return optionalRunId(
    root?.execution?.runId
      ?? root?.suppression?.applyRunId
      ?? top?.execution?.runId
      ?? top?.suppression?.applyRunId
      ?? root.runId
      ?? top.runId,
  );
}

function redemptionRunIdFrom(redemption) {
  const top = object(redemption);
  const root = object(top.result && typeof top.result === "object" ? top.result : top);
  return optionalRunId(
    root?.pass?.runId
      ?? root?.apply?.runId
      ?? top?.pass?.runId
      ?? top?.apply?.runId
      ?? root.runId
      ?? top.runId,
  );
}

function isRunSelection(value) {
  return value
    && Array.isArray(value.ids)
    && Array.isArray(value.entries)
    && value.entries.every((entry) => typeof entry?.runId === "string" && Array.isArray(entry.roles));
}

function taskAccumulator(key) {
  return {
    key,
    total: 0,
    attempted: 0,
    written: 0,
    needsHuman: 0,
    menuTaskRows: 0,
    menuApplications: 0,
    offeringsInserted: 0,
    priceBackfills: 0,
    priceAmountOnlyBackfills: 0,
    fullPairPriceBackfills: 0,
    treatmentBackfills: 0,
    priceConflicts: 0,
    priceReviews: 0,
    existingPricesOverwritten: 0,
    statuses: { pending: 0, claimed: 0, done: 0, failed: 0, skipped: 0 },
    outcomes: {},
  };
}

function taskEntityIdentity(row) {
  const taskType = text(row?.task_type ?? row?.taskType);
  const entityType = text(row?.entity_type ?? row?.entityType);
  const entityId = row?.entity_id ?? row?.entityId;
  if (!taskType || !entityType || entityId === null || entityId === undefined || entityId === "") {
    return null;
  }
  return JSON.stringify([taskType, entityType, String(entityId)]);
}

function addTaskAggregate(target, value) {
  target.total += value.count;
  target.attempted += value.attemptedCount;
  target.written += value.writtenCount;
  target.needsHuman += value.needsHumanCount;
  target.menuTaskRows += value.menuTaskCount;
  target.menuApplications += value.menuApplicationCount;
  target.offeringsInserted += value.offeringInsertCount;
  target.priceBackfills += value.priceBackfillCount;
  target.priceAmountOnlyBackfills += value.priceAmountOnlyBackfillCount;
  target.fullPairPriceBackfills = target.priceBackfills - target.priceAmountOnlyBackfills;
  target.treatmentBackfills += value.treatmentBackfillCount;
  target.priceConflicts += value.priceConflictCount;
  target.priceReviews += value.priceReviewCount;
  target.existingPricesOverwritten += value.existingPriceOverwriteCount;
  target.statuses[value.status] = (target.statuses[value.status] || 0) + value.count;
  target.outcomes[value.outcome] = (target.outcomes[value.outcome] || 0) + value.count;
}

function menuFieldStatusAccumulator(runId) {
  return {
    runId,
    total: 0,
    locationOfferings: 0,
    priceAmount: 0,
    priceCurrency: 0,
    treatment: 0,
  };
}

function menuFieldStatusRun(summary, runId) {
  return summary.byRun.find((row) => row.runId === runId)
    || menuFieldStatusAccumulator(runId);
}

function taskRun(tasks, runId) {
  if (!runId) return null;
  return tasks.byRun.find((row) => row.key === runId) || null;
}

function addCheck(checks, id, label, expected, actual, comparator = Object.is) {
  const normalizedExpected = finiteNumber(expected);
  const normalizedActual = finiteNumber(actual);
  if (normalizedExpected === null || normalizedActual === null) return;
  checks.push({
    id,
    label,
    expected: normalizedExpected,
    actual: normalizedActual,
    ok: comparator(normalizedExpected, normalizedActual),
  });
}

function emptyCallBucket() {
  return { calls: 0, failedCalls: 0, estimatedCostUsd: 0 };
}

function externalRunAccumulator(runId, roles) {
  return {
    runId,
    roles: [...roles].sort(),
    ...emptyCallBucket(),
    llm: emptyCallBucket(),
    places: {
      contact: emptyCallBucket(),
      reviews: emptyCallBucket(),
      geocode: emptyCallBucket(),
      other: emptyCallBucket(),
    },
    other: emptyCallBucket(),
  };
}

function addCall(bucket, cost, status) {
  bucket.calls += 1;
  bucket.estimatedCostUsd += cost;
  if (isFailedCall(status)) bucket.failedCalls += 1;
}

function isFailedCall(status) {
  return !new Set(["ok", "succeeded", "success", "completed"]).has(status);
}

function normalizeTokens(tokens) {
  const value = object(tokens);
  const input = numberFrom(
    value.input_tokens ?? value.prompt_tokens ?? value.input ?? value.prompt,
  );
  const output = numberFrom(
    value.output_tokens ?? value.completion_tokens ?? value.output ?? value.completion,
  );
  const suppliedTotal = finiteNumber(value.total_tokens ?? value.total);
  return { input, output, total: suppliedTotal === null ? input + output : suppliedTotal };
}

function aggregateCount(value, derived, count) {
  if (value === null || value === undefined || value === "") return derived ? count : 0;
  const normalized = nonnegativeInteger(value, "aggregate count");
  if (normalized > count) throw new Error(`Aggregate count ${normalized} exceeds row count ${count}.`);
  return normalized;
}

function menuMetric(isMenuTask, aggregate, raw, label) {
  if (!isMenuTask) return 0;
  return nonnegativeInteger(aggregate ?? raw ?? 0, label);
}

function sumObject(value) {
  return Object.values(value).reduce((total, count) => total + count, 0);
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function placesRow(label, bucket) {
  return `| ${cell(label)} | ${integer(bucket.calls)} | ${integer(bucket.failedCalls)} | ${usd(bucket.estimatedCostUsd)} |`;
}

function formatCheckValue(value) {
  return Number.isInteger(value) ? integer(value) : number(value, 6);
}

function compareRunIds(left, right) {
  if (/^\d+$/u.test(left) && /^\d+$/u.test(right)) {
    return left.length - right.length || left.localeCompare(right);
  }
  return left.localeCompare(right);
}

function optionalRunId(value) {
  if (typeof value === "string" && /^[1-9]\d*$/u.test(value)) return value;
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

function optionalIsoTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("generatedAt must be an ISO-compatible timestamp.");
  return date.toISOString();
}

function positiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return normalized;
}

function nonnegativeInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return normalized;
}

function boundedNumber(value, minimum, maximum, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < minimum || normalized > maximum) {
    throw new TypeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return normalized;
}

function numberFrom(value) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function nonnegativeNumber(value, label, fallback = null) {
  if (value === null || value === undefined || value === "") {
    if (fallback !== null) return fallback;
    throw new TypeError(`${label} must be a non-negative number.`);
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a non-negative number.`);
  }
  return normalized;
}

function optionalNonnegativeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function nearlyEqual(left, right) {
  return Math.abs(left - right) <= 1e-9;
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or expose query(sql, params).");
}

function rowsFrom(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function cell(value) {
  return String(value ?? "—").replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}

function code(value) {
  return `\`${String(value ?? "").replace(/`/gu, "\\`")}\``;
}

function integer(value) {
  return Math.round(Number(value || 0)).toLocaleString("en-US");
}

function signedInteger(value) {
  const normalized = Math.round(Number(value || 0));
  return `${normalized > 0 ? "+" : ""}${normalized.toLocaleString("en-US")}`;
}

function signedNumber(value) {
  const normalized = Number(value || 0);
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(2)}`;
}

function percentage(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function number(value, digits = 4) {
  return Number(value || 0).toFixed(digits).replace(/\.?0+$/u, "");
}

function usd(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
