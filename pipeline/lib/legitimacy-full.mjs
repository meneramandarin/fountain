import { createHash } from "node:crypto";

import { query as defaultQuery } from "./db.mjs";
import { HARD_EXCLUSION_PREDICATE_SQL } from "./legitimacy-sample.mjs";

export const LEGITIMACY_GATE_B_CAMPAIGN = "pass1_gate_b_dry_run";
export const LEGITIMACY_GATE_B_PROMPT_VERSION = "pass1-legitimacy-v2";
export const LEGITIMACY_GATE_B_RANDOM_SEED = "pass1-gate-b-dry-run-v2";

const LEGITIMACY_CLASSES = new Set([
  "in_scope",
  "junk",
  "plain_hospital",
  "destination_medical",
  "review",
]);
const SUPPRESSION_CLASSES = new Set(["junk", "plain_hospital"]);
const CLASS_ORDER = [
  "junk",
  "plain_hospital",
  "review",
  "destination_medical",
  "in_scope",
];

const RUBRIC_GUARD_LABELS = new Map([
  ["junk_ordinary_care_to_plain_hospital", "Ordinary-care junk → plain_hospital"],
  ["junk_without_positive_evidence", "Junk without positive evidence → review"],
  ["destination_treatment_to_plain_hospital", "Treatment destination → plain_hospital"],
  ["destination_without_qualifying_program", "Unsupported destination_medical → review"],
  ["in_scope_ordinary_rehab_to_plain_hospital", "Ordinary PT/chiro/rehab in_scope → plain_hospital"],
  ["research_without_consumer_care", "Affirmative research-only/non-consumer evidence → junk"],
  ["ambiguous_research_to_review", "Ambiguous research signal → review"],
]);

const ACTIVE_ELIGIBLE_CTES = `
  active AS (
    SELECT
      l.id,
      l.org_id,
      l.name,
      l.locality,
      l.region,
      l.country_code,
      o.canonical_name AS organization_name,
      ${HARD_EXCLUSION_PREDICATE_SQL} AS hard_excluded,
      CASE WHEN l.org_id IS NOT NULL THEN 'organization' ELSE 'location' END
        AS classification_level,
      CASE
        WHEN l.org_id IS NOT NULL THEN 'organization:' || l.org_id::text
        ELSE 'location:' || l.id::text
      END AS classification_key
    FROM fountain.locations l
    LEFT JOIN fountain.organizations o ON o.id = l.org_id
    WHERE l.status = 'active'
      AND l.deleted_at IS NULL
  ),
  eligible AS (
    SELECT *
    FROM active
    WHERE NOT hard_excluded
  )
`;

const CAMPAIGN_CTES = `
  campaign_tasks AS (
    SELECT queue.*
    FROM fountain_ops.task_queue queue
    WHERE queue.task_type = 'legitimacy_check'
      AND queue.entity_type = 'location'
      AND queue.payload->>'campaign' = $1
      AND queue.payload->>'prompt_version' = $2
  ),
  prepared AS (
    SELECT
      eligible.id AS entity_id,
      eligible.org_id,
      jsonb_build_object(
        'schema_version', 2,
        'campaign', $1,
        'prompt_version', $2,
        'stage', 'stage_1',
        'threshold', $3::numeric,
        'org_id', eligible.org_id,
        'classification_level', eligible.classification_level,
        'classification_key', eligible.classification_key
      ) AS payload
    FROM eligible
  ),
  missing AS (
    SELECT prepared.*
    FROM prepared
    WHERE NOT EXISTS (
      SELECT 1
      FROM campaign_tasks
      WHERE campaign_tasks.entity_id = prepared.entity_id
    )
  ),
  active_conflicts AS (
    SELECT count(*)::integer AS count
    FROM missing
    JOIN fountain_ops.task_queue queue
      ON queue.task_type = 'legitimacy_check'
     AND queue.entity_type = 'location'
     AND queue.entity_id = missing.entity_id
     AND queue.status IN ('pending', 'claimed')
    WHERE queue.payload->>'campaign' IS DISTINCT FROM $1
       OR queue.payload->>'prompt_version' IS DISTINCT FROM $2
  ),
  unexpected AS (
    SELECT count(*)::integer AS count
    FROM campaign_tasks
    WHERE NOT EXISTS (
      SELECT 1 FROM eligible WHERE eligible.id = campaign_tasks.entity_id
    )
  ),
  duplicate_entities AS (
    SELECT count(*)::integer AS count
    FROM (
      SELECT entity_id
      FROM campaign_tasks
      GROUP BY entity_id
      HAVING count(*) > 1
    ) duplicate
  )
`;

const PREVIEW_FULL_SQL = `
  WITH
  ${ACTIVE_ELIGIBLE_CTES},
  ${CAMPAIGN_CTES}
  SELECT
    (SELECT count(*)::integer FROM active) AS active_count,
    (SELECT count(*)::integer FROM active WHERE hard_excluded) AS excluded_count,
    (SELECT count(*)::integer FROM eligible) AS eligible_count,
    (SELECT count(*)::integer FROM campaign_tasks) AS existing_count,
    (SELECT count(*)::integer FROM missing) AS missing_count,
    0::integer AS inserted_count,
    (SELECT count FROM active_conflicts) AS active_conflict_count,
    (SELECT count FROM unexpected) AS unexpected_count,
    (SELECT count FROM duplicate_entities) AS duplicate_entity_count,
    ARRAY(SELECT id FROM eligible ORDER BY id LIMIT 10) AS selected_entity_ids_sample,
    ARRAY[]::integer[] AS inserted_entity_ids_sample
`;

const ENQUEUE_FULL_SQL = `
  WITH
  gate_lock AS MATERIALIZED (
    SELECT pg_advisory_xact_lock(
      hashtextextended('fountain:legitimacy_gate_b:' || $1 || ':' || $2, 0)
    )
  ),
  ${ACTIVE_ELIGIBLE_CTES},
  ${CAMPAIGN_CTES},
  readiness AS (
    SELECT
      (SELECT count FROM active_conflicts) = 0
      AND (SELECT count FROM unexpected) = 0
      AND (SELECT count FROM duplicate_entities) = 0 AS ready
  ),
  inserted AS (
    INSERT INTO fountain_ops.task_queue (
      task_type,
      entity_type,
      entity_id,
      priority,
      payload,
      max_attempts,
      run_id
    )
    SELECT
      'legitimacy_check',
      'location',
      missing.entity_id,
      $4,
      missing.payload,
      $5,
      $6
    FROM missing
    CROSS JOIN readiness
    CROSS JOIN gate_lock
    WHERE readiness.ready
    ORDER BY COALESCE(missing.org_id, 2147483647), missing.entity_id
    RETURNING entity_id
  ),
  output_rows AS (
    SELECT entity_id FROM campaign_tasks
    UNION ALL
    SELECT entity_id FROM inserted
  )
  SELECT
    (SELECT count(*)::integer FROM active) AS active_count,
    (SELECT count(*)::integer FROM active WHERE hard_excluded) AS excluded_count,
    (SELECT count(*)::integer FROM eligible) AS eligible_count,
    (SELECT count(*)::integer FROM campaign_tasks) AS existing_count,
    (SELECT count(*)::integer FROM missing) AS missing_count,
    (SELECT count(*)::integer FROM inserted) AS inserted_count,
    (SELECT count FROM active_conflicts) AS active_conflict_count,
    (SELECT count FROM unexpected) AS unexpected_count,
    (SELECT count FROM duplicate_entities) AS duplicate_entity_count,
    ARRAY(SELECT entity_id FROM output_rows ORDER BY entity_id LIMIT 10)
      AS selected_entity_ids_sample,
    ARRAY(SELECT entity_id FROM inserted ORDER BY entity_id LIMIT 10)
      AS inserted_entity_ids_sample
`;

const RECONCILIATION_SQL = `
  WITH
  ${ACTIVE_ELIGIBLE_CTES},
  campaign_tasks AS (
    SELECT queue.entity_id
    FROM fountain_ops.task_queue queue
    WHERE queue.task_type = 'legitimacy_check'
      AND queue.entity_type = 'location'
      AND queue.payload->>'campaign' = $1
      AND queue.payload->>'prompt_version' = $2
  )
  SELECT
    (SELECT count(*)::integer FROM active) AS active_count,
    (SELECT count(*)::integer FROM active WHERE hard_excluded) AS excluded_count,
    (SELECT count(*)::integer FROM eligible) AS eligible_count,
    (SELECT count(*)::integer FROM campaign_tasks) AS task_count,
    (SELECT count(*)::integer FROM eligible
      WHERE NOT EXISTS (
        SELECT 1 FROM campaign_tasks WHERE campaign_tasks.entity_id = eligible.id
      )) AS missing_count,
    (SELECT count(*)::integer FROM campaign_tasks
      WHERE NOT EXISTS (
        SELECT 1 FROM eligible WHERE eligible.id = campaign_tasks.entity_id
      )) AS unexpected_count,
    (SELECT count(*)::integer FROM (
      SELECT entity_id FROM campaign_tasks GROUP BY entity_id HAVING count(*) > 1
    ) duplicates) AS duplicate_entity_count
`;

const CAMPAIGN_ROWS_SQL = `
  SELECT
    queue.id AS task_id,
    queue.entity_id,
    queue.status AS task_status,
    queue.payload,
    queue.result,
    location.org_id,
    location.name,
    organization.canonical_name AS organization_name,
    location.locality,
    location.region,
    location.country_code,
    GREATEST(
      COALESCE(place_data.review_count, 0),
      COALESCE(review_data.review_count, 0)
    )::integer AS review_count,
    COALESCE(offering_data.offering_count, 0)::integer AS offering_count
  FROM fountain_ops.task_queue queue
  JOIN fountain.locations location ON location.id = queue.entity_id
  LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS review_count
    FROM fountain.reviews review
    WHERE review.location_id = location.id
      AND review.status = 'active'
      AND review.deleted_at IS NULL
  ) review_data ON true
  LEFT JOIN LATERAL (
    SELECT max(place_match.review_count)::integer AS review_count
    FROM fountain.external_place_matches place_match
    WHERE place_match.location_id = location.id
  ) place_data ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS offering_count
    FROM fountain.offerings offering
    WHERE offering.location_id = location.id
      AND offering.status = 'active'
      AND offering.deleted_at IS NULL
  ) offering_data ON true
  WHERE queue.task_type = 'legitimacy_check'
    AND queue.entity_type = 'location'
    AND queue.payload->>'campaign' = $1
    AND queue.payload->>'prompt_version' = $2
  ORDER BY queue.id
`;

const CALLS_SQL = `
  SELECT external_call.*
  FROM fountain_ops.external_calls external_call
  WHERE external_call.run_id = ANY($1::bigint[])
    AND external_call.call_type IN ('legitimacy_stage_1', 'legitimacy_stage_2')
  ORDER BY external_call.created_at, external_call.id
`;

const RUNS_SQL = `
  SELECT id, command, args, status, budget_usd, spent_usd_estimate, dry_run,
         started_at, finished_at
  FROM fountain_ops.runs
  WHERE id = ANY($1::bigint[])
  ORDER BY id
`;

const ATTEMPT_RUNS_SQL = `
  WITH cohort_window AS (
    SELECT min(queue.created_at) AS started_at
    FROM fountain_ops.task_queue queue
    WHERE queue.task_type = 'legitimacy_check'
      AND queue.entity_type = 'location'
      AND queue.payload->>'campaign' = $1
      AND queue.payload->>'prompt_version' = $2
  ),
  evidence_window AS (
    SELECT max(COALESCE(run.finished_at, run.started_at)) AS finished_at
    FROM fountain_ops.runs run
    WHERE run.id = ANY($3::bigint[])
  )
  SELECT run.id, run.command, run.args, run.status, run.budget_usd,
         run.spent_usd_estimate, run.dry_run, run.started_at, run.finished_at
  FROM fountain_ops.runs run
  CROSS JOIN cohort_window
  CROSS JOIN evidence_window
  WHERE run.command = 'drain'
    AND run.args->>'task' = 'legitimacy_check'
    AND run.dry_run = false
    AND run.started_at >= cohort_window.started_at
    AND run.started_at <= evidence_window.finished_at
    AND (run.args->>'campaign' IS NULL OR run.args->>'campaign' = $1)
  ORDER BY run.id
`;

const POLICY_REPLAYS_SQL = `
  SELECT id, command, args, status, counts, budget_usd, spent_usd_estimate,
         dry_run, started_at, finished_at
  FROM fountain_ops.runs
  WHERE command = 'maintain'
    AND args->>'campaign' = $1
    AND args->>'promptVersion' = $2
    AND args->>'operation' = 'legitimacy_rubric_policy_replay'
    AND args->'sourceRuns' ?| $3::text[]
  ORDER BY id
`;

export async function enqueueLegitimacyGateBFull(
  {
    campaign = LEGITIMACY_GATE_B_CAMPAIGN,
    promptVersion = LEGITIMACY_GATE_B_PROMPT_VERSION,
    runId,
    threshold = 0.8,
    priority = 100,
    maxAttempts = 3,
    apply = false,
  },
  { query = defaultQuery } = {},
) {
  const normalized = {
    campaign: nonemptyString(campaign, "campaign"),
    promptVersion: nonemptyString(promptVersion, "promptVersion"),
    runId: positiveIntegerString(runId, "runId"),
    threshold: confidence(threshold),
    priority: integer(priority, "priority"),
    maxAttempts: positiveInteger(maxAttempts, "maxAttempts"),
    apply: Boolean(apply),
  };
  const params = normalized.apply
    ? [
        normalized.campaign,
        normalized.promptVersion,
        normalized.threshold,
        normalized.priority,
        normalized.maxAttempts,
        normalized.runId,
      ]
    : [normalized.campaign, normalized.promptVersion, normalized.threshold];
  const result = await executeQuery(
    query,
    normalized.apply ? ENQUEUE_FULL_SQL : PREVIEW_FULL_SQL,
    params,
  );
  const row = rowsFrom(result)[0];
  if (!row) throw new Error("Legitimacy Gate B full enqueue query returned no result.");

  const activeConflictCount = number(row.active_conflict_count);
  const unexpectedCount = number(row.unexpected_count);
  const duplicateEntityCount = number(row.duplicate_entity_count);
  if (activeConflictCount > 0 || unexpectedCount > 0 || duplicateEntityCount > 0) {
    throw new Error(
      "Legitimacy Gate B cohort is unsafe: "
        + `active_conflicts=${activeConflictCount}, unexpected=${unexpectedCount}, `
        + `duplicate_entities=${duplicateEntityCount}.`,
    );
  }

  const eligibleCount = number(row.eligible_count);
  const existingCount = number(row.existing_count);
  const missingCount = number(row.missing_count);
  const insertedCount = number(row.inserted_count);
  const selectedCount = normalized.apply ? existingCount + insertedCount : eligibleCount;
  if (normalized.apply && selectedCount !== eligibleCount) {
    throw new Error(
      `Legitimacy Gate B enqueue did not reconcile: eligible=${eligibleCount}, `
        + `existing=${existingCount}, inserted=${insertedCount}.`,
    );
  }
  if (normalized.apply && insertedCount !== missingCount) {
    throw new Error(
      `Legitimacy Gate B enqueue was not complete: missing=${missingCount}, inserted=${insertedCount}.`,
    );
  }

  return {
    campaign: normalized.campaign,
    promptVersion: normalized.promptVersion,
    threshold: normalized.threshold,
    apply: normalized.apply,
    activeCount: number(row.active_count),
    excludedCount: number(row.excluded_count),
    eligibleCount,
    selectedCount,
    existingCount,
    missingCount,
    insertedCount,
    activeConflictCount,
    unexpectedCount,
    duplicateEntityCount,
    reused: normalized.apply && insertedCount === 0 && existingCount === eligibleCount,
    selectedEntityIdsSample: integerArray(row.selected_entity_ids_sample),
    insertedEntityIdsSample: integerArray(row.inserted_entity_ids_sample),
  };
}

export async function loadLegitimacyGateBReportData(
  {
    campaign = LEGITIMACY_GATE_B_CAMPAIGN,
    promptVersion = LEGITIMACY_GATE_B_PROMPT_VERSION,
    runIds,
    randomSeed = LEGITIMACY_GATE_B_RANDOM_SEED,
  },
  { query = defaultQuery } = {},
) {
  const normalizedCampaign = nonemptyString(campaign, "campaign");
  const normalizedPromptVersion = nonemptyString(promptVersion, "promptVersion");
  const normalizedRunIds = nonemptyRunIds(runIds);
  const normalizedRandomSeed = nonemptyString(randomSeed, "randomSeed");
  const cohortParams = [normalizedCampaign, normalizedPromptVersion];

  // Keep these sequential so a supplied pg Client can safely wrap all reads in
  // one repeatable-read, read-only transaction.
  const reconciliationResult = await executeQuery(query, RECONCILIATION_SQL, cohortParams);
  const rowsResult = await executeQuery(query, CAMPAIGN_ROWS_SQL, cohortParams);
  const callsResult = await executeQuery(query, CALLS_SQL, [normalizedRunIds]);
  const runsResult = await executeQuery(query, RUNS_SQL, [normalizedRunIds]);
  const attemptRunsResult = await executeQuery(
    query,
    ATTEMPT_RUNS_SQL,
    [normalizedCampaign, normalizedPromptVersion, normalizedRunIds],
  );
  const policyReplaysResult = await executeQuery(
    query,
    POLICY_REPLAYS_SQL,
    [normalizedCampaign, normalizedPromptVersion, normalizedRunIds],
  );
  const reconciliation = rowsFrom(reconciliationResult)[0];
  if (!reconciliation) throw new Error("Legitimacy Gate B reconciliation returned no result.");

  assertReconciled(reconciliation);
  const rows = rowsFrom(rowsResult).map(normalizeCampaignRow);
  const eligibleCount = number(reconciliation.eligible_count);
  if (rows.length !== eligibleCount) {
    throw new Error(
      `Gate B report refuses an incomplete cohort: eligible=${eligibleCount}, tasks=${rows.length}.`,
    );
  }
  assertTerminalClassifications(rows);

  const runs = rowsFrom(runsResult).map(normalizeRun);
  const foundRunIds = new Set(runs.map((run) => run.id));
  const missingRunIds = normalizedRunIds.filter((runId) => !foundRunIds.has(runId));
  if (missingRunIds.length > 0) {
    throw new Error(`Gate B report could not find run id(s): ${missingRunIds.join(", ")}.`);
  }
  assertRunEvidence(runs);
  const attemptRuns = rowsFrom(attemptRunsResult).map(normalizeRun);
  assertAttemptRunEvidence(attemptRuns, normalizedRunIds);
  const policyReplays = rowsFrom(policyReplaysResult).map(normalizePolicyReplay);
  assertPolicyReplayEvidence(policyReplays);

  const { effectiveRows, conflicts } = applyOrganizationConflictBackstop(rows);
  const suppressions = effectiveRows.filter((row) => SUPPRESSION_CLASSES.has(row.effectiveClass));
  const topSuppressions = [...suppressions].sort(compareSize).slice(0, 20);
  const randomSuppressions = [...suppressions]
    .sort((left, right) => deterministicRank(normalizedRandomSeed, left.entityId)
      .localeCompare(deterministicRank(normalizedRandomSeed, right.entityId)))
    .slice(0, 20);
  const reviewRows = effectiveRows
    .filter((row) => row.effectiveClass === "review")
    .sort(compareDisplay);
  const calls = rowsFrom(callsResult).map(normalizeCall);
  const normalizationFlagCounts = countNormalizationFlags(effectiveRows);

  return {
    campaign: normalizedCampaign,
    promptVersion: normalizedPromptVersion,
    runIds: normalizedRunIds,
    randomSeed: normalizedRandomSeed,
    activeCount: number(reconciliation.active_count),
    excludedCount: number(reconciliation.excluded_count),
    eligibleCount,
    taskCount: rows.length,
    reconciliation: {
      missingCount: number(reconciliation.missing_count),
      unexpectedCount: number(reconciliation.unexpected_count),
      duplicateEntityCount: number(reconciliation.duplicate_entity_count),
    },
    rows: effectiveRows,
    rawClassCounts: countClasses(effectiveRows, "class"),
    classCounts: countClasses(effectiveRows, "effectiveClass"),
    suppressionCount: suppressions.length,
    topSuppressions,
    randomSuppressions,
    reviewRows,
    organizationConflictCount: conflicts.length,
    organizationConflictLocationCount: effectiveRows.filter((row) => row.organizationConflict).length,
    organizationConflicts: conflicts,
    normalizationFlagCounts,
    runs,
    actual: summarizeActual(effectiveRows, calls, runs),
    attemptRuns,
    attemptActual: summarizeAttempts(attemptRuns, normalizedRunIds),
    policyReplays,
    policyReplayActual: summarizePolicyReplays(policyReplays),
  };
}

export function renderLegitimacyGateBReport(data) {
  assertRenderable(data);
  const lines = [
    "# Pass 1 Legitimacy Triage — Gate B Full Dry Run",
    "",
    "**GATE B AWAITING APPROVAL**",
    "",
    `What was done: Classified all ${formatInteger(data.eligibleCount)} eligible active locations under rubric v2 and computed the complete dry-run suppression set. No suppression was applied.`,
    "",
    `Evidence: ${formatInteger(data.taskCount)}/${formatInteger(data.eligibleCount)} eligible tasks are terminal and classified with zero serving-write attempts. Class reconciliation, rubric guards, suppression samples, and run-ledger usage follow.`,
    "",
    `Deviations from rubric/plan: The Gate A re-run was skipped at the operator's explicit direction. Safety-sample calibration superseded ${formatInteger(data.attemptActual.supersededRuns)} earlier drain run(s) after a cached-NUL serialization defect and fail-closed guard refinements. The ledgered deterministic policy replay updated ${formatInteger(data.policyReplayActual.updated)} research-only row(s). All classification attempts spent ${formatUsd(data.attemptActual.spendUsd)}; final usage is isolated to evidence runs ${data.runIds.join(" and ")}. No serving writes occurred.`,
    "",
    "Open questions: Approve, reject, or revise the dry-run `junk` and `plain_hospital` suppression set before any serving write.",
    "",
    "## Safety and reconciliation",
    "",
    `- Active locations: ${formatInteger(data.activeCount)}; hard-excluded: ${formatInteger(data.excludedCount)}; eligible: ${formatInteger(data.eligibleCount)}.`,
    `- Queue reconciliation: ${formatInteger(data.taskCount)}/${formatInteger(data.eligibleCount)} tasks; zero missing, unexpected, or duplicate entity rows.`,
    "- Every task is terminal and classified; task evidence records zero serving-write attempts.",
    `- Organization conflict backstop: ${formatInteger(data.organizationConflictCount)} classification key(s), covering ${formatInteger(data.organizationConflictLocationCount)} location(s), were conservatively converted to effective \`review\`.`,
    "",
    "## Effective class counts",
    "",
    "| Class | Count |",
    "| --- | ---: |",
  ];
  for (const className of CLASS_ORDER) {
    lines.push(`| ${className} | ${formatInteger(data.classCounts?.[className])} |`);
  }
  lines.push(
    "",
    `**Total would-be suppressions: ${formatInteger(data.suppressionCount)}.**`,
  );
  appendRubricGuardOutcomes(lines, data.normalizationFlagCounts);
  lines.push(
    "",
    "## Budget and usage",
    "",
    "| Metric | Actual |",
    "| --- | ---: |",
    `| Final-evidence budget total | ${formatUsd(data.actual.budgetUsd)} |`,
    `| Final-evidence run-recorded spend | ${formatUsd(data.actual.runSpentUsd)} |`,
    `| Final-evidence call-ledger spend | ${formatUsd(data.actual.spendUsd)} |`,
    `| Final-evidence remaining budget | ${formatUsd(data.actual.remainingBudgetUsd)} |`,
    `| All-attempt run-recorded spend | ${formatUsd(data.attemptActual.spendUsd)} |`,
    `| Superseded-attempt run-recorded spend | ${formatUsd(data.attemptActual.supersededSpendUsd)} |`,
    `| External calls | ${formatInteger(data.actual.calls)} |`,
    `| Stage 1 calls | ${formatInteger(data.actual.stage1Calls)} |`,
    `| Stage 2 calls | ${formatInteger(data.actual.stage2Calls)} |`,
    `| Input tokens | ${formatInteger(data.actual.inputTokens)} |`,
    `| Output tokens | ${formatInteger(data.actual.outputTokens)} |`,
    `| Stage 2 candidates | ${formatInteger(data.actual.stage2Candidates)} |`,
    `| Website fetch attempts | ${formatInteger(data.actual.websiteFetches)} |`,
    `| Cache hits | ${formatInteger(data.actual.cacheHits)} |`,
    `| Network fetches | ${formatInteger(data.actual.networkFetches)} |`,
    `| Fetch failures | ${formatInteger(data.actual.fetchFailures)} |`,
    `| No website | ${formatInteger(data.actual.noWebsite)} |`,
  );
  appendAttemptRunTable(lines, data.attemptRuns, data.runIds);
  appendPolicyReplayTable(lines, data.policyReplays, data.policyReplayActual);
  appendLocationTable(lines, "Top 20 largest would-be suppressions", data.topSuppressions,
    "Ordered by live review count, then live offering count.");
  appendLocationTable(lines, "20 deterministic random would-be suppressions", data.randomSuppressions,
    `Seed: \`${escapeCell(data.randomSeed)}\`.`);
  lines.push(
    "",
    "## Review queue",
    "",
    `${formatInteger(data.reviewRows.length)} effective review row(s) are rendered in \`docs/runs/pass1-review-queue.md\`.`,
    "",
    "**STOP — AWAITING CONFIRMATION BEFORE SUPPRESSION APPLY.**",
  );
  return `${lines.join("\n")}\n`;
}

export function renderLegitimacyReviewQueue(data) {
  assertRenderable(data);
  const rows = [...data.reviewRows].sort(compareDisplay);
  const lines = [
    "# Pass 1 Legitimacy Triage — Review Queue",
    "",
    `Campaign: \`${escapeCell(data.campaign)}\`; prompt: \`${escapeCell(data.promptVersion)}\`.`,
    "",
    `${formatInteger(rows.length)} location(s) require review. Organization conflicts are included and remain ineligible for suppression.`,
    "",
    "| ID | Name | Location | Classification key | Model class | Confidence | Review reason | Rationale |",
    "| ---: | --- | --- | --- | --- | ---: | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(tableRow([
      row.entityId,
      row.name || "—",
      localityLabel(row),
      row.classificationKey,
      row.class,
      formatConfidence(row.confidence),
      row.organizationConflict ? "organization class conflict" : "model review",
      row.rationale || "—",
    ]));
  }
  return `${lines.join("\n")}\n`;
}

function assertReconciled(row) {
  const eligible = number(row.eligible_count);
  const tasks = number(row.task_count);
  const missing = number(row.missing_count);
  const unexpected = number(row.unexpected_count);
  const duplicates = number(row.duplicate_entity_count);
  if (tasks !== eligible || missing || unexpected || duplicates) {
    throw new Error(
      `Gate B cohort does not reconcile: eligible=${eligible}, tasks=${tasks}, `
        + `missing=${missing}, unexpected=${unexpected}, duplicate_entities=${duplicates}.`,
    );
  }
}

function assertTerminalClassifications(rows) {
  const ids = new Set();
  let servingWrites = 0;
  const incomplete = [];
  for (const row of rows) {
    if (ids.has(row.entityId)) incomplete.push(row.entityId);
    ids.add(row.entityId);
    if (row.taskStatus !== "done" || row.outcome !== "classified" || !LEGITIMACY_CLASSES.has(row.class)) {
      incomplete.push(row.entityId);
    }
    if (row.servingWriteAttempted) servingWrites += 1;
    const expectedLevel = row.orgId == null ? "location" : "organization";
    const expectedKey = `${expectedLevel}:${row.orgId ?? row.entityId}`;
    if (row.classificationLevel !== expectedLevel || row.classificationKey !== expectedKey) {
      incomplete.push(row.entityId);
    }
  }
  if (incomplete.length > 0) {
    throw new Error(
      `Gate B report refuses ${new Set(incomplete).size} incomplete, unclassified, duplicate, or mis-keyed task row(s).`,
    );
  }
  if (servingWrites > 0) {
    throw new Error(`Gate B report refuses ${servingWrites} serving-write attempt(s).`);
  }
}

function assertRunEvidence(runs) {
  const invalid = runs.filter((run) => (
    run.command !== "drain"
    || run.status !== "completed"
    || run.dryRun
    || run.task !== "legitimacy_check"
    || !["stage_1", "stage_2"].includes(run.stage)
  ));
  if (invalid.length > 0) {
    throw new Error(
      `Gate B report refuses ${invalid.length} run(s) without completed, non-dry-run legitimacy drain evidence.`,
    );
  }
  const stage1Budget = runs.some((run) => run.stage === "stage_1" && run.budgetUsd === 25);
  const stage2Budget = runs.some((run) => run.stage === "stage_2" && run.budgetUsd === 15);
  if (!stage1Budget || !stage2Budget) {
    throw new Error(
      "Gate B report requires explicit stage_1 ($25) and stage_2 ($15) budgeted drain run evidence.",
    );
  }
}

function assertAttemptRunEvidence(runs, finalRunIds) {
  const invalid = runs.filter((run) => (
    run.command !== "drain"
    || run.dryRun
    || run.task !== "legitimacy_check"
    || !["stage_1", "stage_2"].includes(run.stage)
  ));
  if (invalid.length > 0) {
    throw new Error(`Gate B report refuses ${invalid.length} invalid classification attempt run(s).`);
  }
  const found = new Set(runs.map((run) => run.id));
  const missingFinalRuns = finalRunIds.filter((runId) => !found.has(runId));
  if (missingFinalRuns.length > 0) {
    throw new Error(
      `Gate B attempt ledger is missing final evidence run(s): ${missingFinalRuns.join(", ")}.`,
    );
  }
}

function assertPolicyReplayEvidence(replays) {
  const invalid = replays.filter((replay) => (
    replay.command !== "maintain"
    || replay.operation !== "legitimacy_rubric_policy_replay"
    || replay.status !== "completed"
    || replay.dryRun
  ));
  if (invalid.length > 0) {
    throw new Error(`Gate B report refuses ${invalid.length} invalid policy replay run(s).`);
  }
}

function applyOrganizationConflictBackstop(rows) {
  const classesByKey = new Map();
  for (const row of rows) {
    if (row.classificationLevel !== "organization") continue;
    if (!classesByKey.has(row.classificationKey)) classesByKey.set(row.classificationKey, new Set());
    classesByKey.get(row.classificationKey).add(row.class);
  }
  const conflicts = [...classesByKey.entries()]
    .filter(([, classes]) => classes.size > 1)
    .map(([classificationKey, classes]) => ({
      classificationKey,
      classes: [...classes].sort(),
      locationCount: rows.filter((row) => row.classificationKey === classificationKey).length,
    }))
    .sort((left, right) => left.classificationKey.localeCompare(right.classificationKey));
  const conflictKeys = new Set(conflicts.map((conflict) => conflict.classificationKey));
  return {
    conflicts,
    effectiveRows: rows.map((row) => ({
      ...row,
      organizationConflict: conflictKeys.has(row.classificationKey),
      effectiveClass: conflictKeys.has(row.classificationKey) ? "review" : row.class,
    })),
  };
}

function normalizeCampaignRow(row) {
  const payload = object(row.payload);
  const result = object(row.result);
  const final = object(result.final);
  const stages = object(result.stages);
  const stage1 = object(stages.stage_1);
  const stage2 = object(stages.stage_2);
  const stage2Classification = object(stage2.classification);
  const finalStageEvidence = Object.keys(stage2Classification).length > 0
    ? stage2Classification
    : stage1;
  const website = firstObject(stage2.website, result.website, payload.website);
  const cacheStatus = String(website.cache_status || "").toLowerCase();
  const outcome = String(website.outcome || website.status || "").toLowerCase();
  const websiteFetch = Boolean(cacheStatus && cacheStatus !== "not_applicable");
  return {
    taskId: String(row.task_id),
    entityId: number(row.entity_id),
    taskStatus: String(row.task_status || "unknown"),
    outcome: String(result.outcome || ""),
    orgId: row.org_id == null ? null : number(row.org_id),
    classificationLevel: String(payload.classification_level || ""),
    classificationKey: String(payload.classification_key || ""),
    name: row.name || row.organization_name || "",
    organizationName: row.organization_name || "",
    locality: row.locality || "",
    region: row.region || "",
    countryCode: row.country_code || "",
    class: String(final.class || "unclassified"),
    confidence: finiteNumber(final.confidence),
    rationale: String(final.rationale || ""),
    reviewCount: number(row.review_count),
    offeringCount: number(row.offering_count),
    stage2Needed: Boolean(stage2 && Object.keys(stage2).length > 0),
    websiteFetches: websiteFetch,
    cacheHit: cacheStatus === "hit_fresh",
    networkFetch: cacheStatus === "miss_fetched" || (websiteFetch && cacheStatus !== "hit_fresh"),
    fetchFailure: [
      "failed", "fetch_failed", "error", "timeout", "network_error", "http_error",
      "robots_disallowed", "unsupported_content_type",
    ].includes(outcome),
    noWebsite: outcome === "no_website",
    servingWriteAttempted: Boolean(object(result.serving_write).attempted),
    normalizationFlags: normalizeFlags(finalStageEvidence.normalization_flags),
    stage1,
    stage2,
  };
}

function normalizeCall(row) {
  const tokens = object(row.tokens);
  const callType = String(row.call_type || "");
  return {
    stage: callType.endsWith("stage_2") ? "stage_2" : "stage_1",
    inputTokens: number(tokens.prompt_tokens ?? tokens.input_tokens ?? tokens.input),
    outputTokens: number(tokens.completion_tokens ?? tokens.output_tokens ?? tokens.output),
    costUsd: number(row.cost_estimate_usd),
    status: String(row.status || "unknown"),
  };
}

function normalizeRun(row) {
  const args = object(row.args);
  return {
    id: String(row.id),
    command: String(row.command || ""),
    task: String(args.task || ""),
    stage: String(args.stage || ""),
    concurrency: number(args.concurrency),
    status: String(row.status || "unknown"),
    budgetUsd: number(row.budget_usd),
    spentUsd: number(row.spent_usd_estimate),
    dryRun: Boolean(row.dry_run),
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
  };
}

function normalizePolicyReplay(row) {
  const args = object(row.args);
  const counts = object(row.counts);
  return {
    id: String(row.id),
    command: String(row.command || ""),
    operation: String(args.operation || ""),
    reason: String(args.reason || ""),
    sourceRunIds: stringArray(args.sourceRuns),
    status: String(row.status || "unknown"),
    selected: number(counts.selected),
    updated: number(counts.updated),
    dryRun: Boolean(row.dry_run),
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
  };
}

function summarizeActual(rows, calls, runs) {
  const budgetUsd = runs.reduce((sum, run) => sum + run.budgetUsd, 0);
  const spendUsd = calls.reduce((sum, call) => sum + call.costUsd, 0);
  return {
    budgetUsd,
    runSpentUsd: runs.reduce((sum, run) => sum + run.spentUsd, 0),
    remainingBudgetUsd: Math.max(0, budgetUsd - spendUsd),
    calls: calls.length,
    stage1Calls: calls.filter((call) => call.stage === "stage_1").length,
    stage2Calls: calls.filter((call) => call.stage === "stage_2").length,
    inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
    spendUsd,
    failedCalls: calls.filter((call) => call.status !== "ok").length,
    stage2Candidates: rows.filter((row) => row.stage2Needed).length,
    websiteFetches: rows.filter((row) => row.websiteFetches).length,
    cacheHits: rows.filter((row) => row.cacheHit).length,
    networkFetches: rows.filter((row) => row.networkFetch).length,
    fetchFailures: rows.filter((row) => row.fetchFailure).length,
    noWebsite: rows.filter((row) => row.noWebsite).length,
  };
}

function summarizeAttempts(runs, finalRunIds) {
  const finalIds = new Set(finalRunIds);
  const supersededRuns = runs.filter((run) => !finalIds.has(run.id));
  return {
    runs: runs.length,
    failedRuns: runs.filter((run) => run.status === "failed").length,
    spendUsd: runs.reduce((sum, run) => sum + run.spentUsd, 0),
    supersededRuns: supersededRuns.length,
    supersededSpendUsd: supersededRuns.reduce((sum, run) => sum + run.spentUsd, 0),
  };
}

function summarizePolicyReplays(replays) {
  return {
    runs: replays.length,
    selected: replays.reduce((sum, replay) => sum + replay.selected, 0),
    updated: replays.reduce((sum, replay) => sum + replay.updated, 0),
  };
}

function countClasses(rows, field) {
  const counts = Object.fromEntries(CLASS_ORDER.map((className) => [className, 0]));
  for (const row of rows) {
    const className = row[field];
    if (Object.prototype.hasOwnProperty.call(counts, className)) counts[className] += 1;
  }
  return counts;
}

function countNormalizationFlags(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const flag of normalizeFlags(row.normalizationFlags)) {
      counts.set(flag, (counts.get(flag) || 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => (
    left.localeCompare(right)
  )));
}

function assertRenderable(data) {
  if (!data || typeof data !== "object") throw new TypeError("Gate B renderer requires report data.");
  if (number(data.taskCount) !== number(data.eligibleCount)) {
    throw new Error("Gate B renderer refuses unreconciled report data.");
  }
  if (!Array.isArray(data.reviewRows)) throw new TypeError("Gate B report data requires reviewRows.");
}

function appendAttemptRunTable(lines, runs, finalRunIds) {
  const finalIds = new Set(finalRunIds);
  lines.push(
    "",
    "### Classification attempt ledger",
    "",
    "Drain runs are non-preview because they persist classification evidence only in `fountain_ops`; the serving suppression set remains unapplied.",
    "",
    "| Run | Role | Stage | Status | Concurrency | Budget | Spend | Queue preview only |",
    "| ---: | --- | --- | --- | ---: | ---: | ---: | --- |",
  );
  for (const run of runs) {
    lines.push(tableRow([
      run.id,
      finalIds.has(run.id) ? "final evidence" : "superseded calibration",
      run.stage,
      run.status,
      run.concurrency || "—",
      formatUsd(run.budgetUsd),
      formatUsd(run.spentUsd),
      run.dryRun,
    ]));
  }
}

function appendPolicyReplayTable(lines, replays, actual) {
  lines.push(
    "",
    "### Deterministic policy replay ledger",
    "",
    `Replay totals: ${formatInteger(actual.runs)} run(s), ${formatInteger(actual.selected)} candidate row(s), ${formatInteger(actual.updated)} updated row(s). These updates touched task evidence only, never serving tables.`,
    "",
  );
  if (replays.length === 0) {
    lines.push("No deterministic policy replay was recorded.");
    return;
  }
  lines.push(
    "| Run | Status | Reason | Source runs | Selected | Updated | Queue preview only |",
    "| ---: | --- | --- | --- | ---: | ---: | --- |",
  );
  for (const replay of replays) {
    lines.push(tableRow([
      replay.id,
      replay.status,
      replay.reason || "—",
      replay.sourceRunIds.join(", ") || "—",
      replay.selected,
      replay.updated,
      replay.dryRun,
    ]));
  }
}

function appendRubricGuardOutcomes(lines, flagCounts) {
  const observed = Object.entries(countObject(flagCounts))
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  lines.push(
    "",
    "## Rubric guard outcomes",
    "",
    "Counts are derived from each location task's final-stage classification evidence (Stage 2 when present; otherwise Stage 1). Organization siblings remain distinct outputs.",
    "",
  );
  if (observed.length === 0) {
    lines.push("No final-stage normalization flags were recorded.");
    return;
  }
  lines.push(
    "| Guard outcome | Flag | Outputs |",
    "| --- | --- | ---: |",
  );
  for (const [flag, count] of observed) {
    lines.push(tableRow([
      RUBRIC_GUARD_LABELS.get(flag) || genericFlagLabel(flag),
      `\`${flag}\``,
      formatInteger(count),
    ]));
  }
}

function appendLocationTable(lines, heading, rows, note) {
  lines.push(
    "",
    `## ${heading}`,
    "",
    note,
    "",
    "| ID | Name | Location | Class | Confidence | Reviews | Offerings | Rationale |",
    "| ---: | --- | --- | --- | ---: | ---: | ---: | --- |",
  );
  for (const row of rows) {
    lines.push(tableRow([
      row.entityId,
      row.name || "—",
      localityLabel(row),
      row.effectiveClass,
      formatConfidence(row.confidence),
      row.reviewCount,
      row.offeringCount,
      row.rationale || "—",
    ]));
  }
}

function tableRow(values) {
  return `| ${values.map(escapeCell).join(" | ")} |`;
}

function compareSize(left, right) {
  return right.reviewCount - left.reviewCount
    || right.offeringCount - left.offeringCount
    || compareDisplay(left, right);
}

function compareDisplay(left, right) {
  return String(left.name || "").localeCompare(String(right.name || ""))
    || left.entityId - right.entityId;
}

function deterministicRank(seed, entityId) {
  return createHash("sha256").update(`${seed}:${entityId}`).digest("hex");
}

function localityLabel(row) {
  return [row.locality, row.region, row.countryCode].filter(Boolean).join(", ") || "—";
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim();
}

function formatConfidence(value) {
  const numeric = finiteNumber(value);
  return numeric == null ? "—" : numeric.toFixed(2);
}

function formatInteger(value) {
  return Math.round(number(value)).toLocaleString("en-US");
}

function formatUsd(value) {
  const numeric = number(value);
  return `$${numeric.toLocaleString("en-US", {
    minimumFractionDigits: numeric > 0 && numeric < 0.01 ? 6 : 4,
    maximumFractionDigits: numeric > 0 && numeric < 0.01 ? 10 : 4,
  })}`;
}

function firstObject(...values) {
  return values.map(object).find((value) => Object.keys(value).length > 0) || {};
}

function normalizeFlags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((flag) => typeof flag === "string")
    .map((flag) => flag.trim())
    .filter(Boolean))]
    .sort();
}

function genericFlagLabel(flag) {
  const label = String(flag).replace(/_/gu, " ").trim();
  return label ? `${label[0].toUpperCase()}${label.slice(1)}` : "Unknown normalization guard";
}

function countObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, number(count)]));
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function integerArray(value) {
  return Array.isArray(value) ? value.map(number).filter(Number.isInteger) : [];
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new TypeError(`${label} must be an integer.`);
  return parsed;
}

function positiveInteger(value, label) {
  const parsed = integer(value, label);
  if (parsed <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return parsed;
}

function positiveIntegerString(value, label) {
  if (typeof value === "bigint" && value > 0n) return value.toString();
  const string = String(value ?? "");
  if (!/^[1-9]\d*$/.test(string)) throw new TypeError(`${label} must be a positive integer.`);
  return string;
}

function confidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new TypeError("threshold must be between 0 and 1.");
  }
  return parsed;
}

function nonemptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function nonemptyRunIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("runIds must contain every Gate B drain/resume run id.");
  }
  return [...new Set(value.map((runId) => positiveIntegerString(runId, "runId")))];
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or pg-compatible client.");
}

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}
