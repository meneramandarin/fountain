import { query as defaultQuery, setMutationActor, withTransaction as defaultWithTransaction } from "./db.mjs";
import { HARD_EXCLUSION_PREDICATE_SQL } from "./legitimacy-sample.mjs";

export const LEGITIMACY_GATE_B_APPLY_ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607120002";
export const LEGITIMACY_GATE_B_COMPLETION_PATH = "docs/runs/pass1-gate-b-completion.md";

const SUPPRESSION_CLASSES = ["junk", "plain_hospital"];

const CANDIDATE_CTES = `
  campaign_tasks AS (
    SELECT
      queue.id AS task_id,
      queue.entity_id,
      queue.status AS task_status,
      queue.payload,
      queue.result,
      queue.payload->>'classification_key' AS classification_key,
      queue.result->'final'->>'class' AS class,
      (queue.result->'final'->>'confidence')::numeric AS confidence,
      queue.result->'final'->>'rationale' AS rationale,
      COALESCE(
        NULLIF(queue.result#>>'{stages,stage_2,classification,model}', ''),
        NULLIF(queue.result#>>'{stages,stage_1,model}', ''),
        NULLIF(queue.result#>>'{final,model}', '')
      ) AS model
    FROM fountain_ops.task_queue queue
    WHERE queue.task_type = 'legitimacy_check'
      AND queue.entity_type = 'location'
      AND queue.payload->>'campaign' = $1
      AND queue.payload->>'prompt_version' = $2
  ),
  classified_tasks AS (
    SELECT *
    FROM campaign_tasks
    WHERE task_status = 'done'
      AND result->>'outcome' = 'classified'
      AND class IN ('junk', 'plain_hospital', 'review', 'destination_medical', 'in_scope')
  ),
  organization_conflicts AS (
    SELECT classification_key
    FROM classified_tasks
    WHERE classification_key LIKE 'organization:%'
    GROUP BY classification_key
    HAVING count(DISTINCT class) > 1
  ),
  suppression_candidates AS (
    SELECT classified_tasks.*
    FROM classified_tasks
    WHERE class IN ('junk', 'plain_hospital')
      AND NOT EXISTS (
        SELECT 1
        FROM organization_conflicts conflict
        WHERE conflict.classification_key = classified_tasks.classification_key
      )
  )
`;

const PREVIEW_SQL = `
  WITH
  ${CANDIDATE_CTES},
  candidate_state AS (
    SELECT
      candidate.*,
      location.status,
      location.deleted_at,
      ${HARD_EXCLUSION_PREDICATE_SQL.replaceAll("l.", "location.").replaceAll("o.", "organization.")}
        AS hard_excluded
    FROM suppression_candidates candidate
    JOIN fountain.locations location ON location.id = candidate.entity_id
    LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
  ),
  source_pairs AS (
    SELECT
      candidate.entity_id,
      source.slug AS source_slug,
      source_record.source_listing_id,
      (suppressed.source_slug IS NOT NULL) AS already_suppressed
    FROM candidate_state candidate
    JOIN fountain.source_records source_record
      ON source_record.entity_type = 'location'
     AND source_record.entity_id = candidate.entity_id
    JOIN fountain.sources source ON source.id = source_record.source_id
    LEFT JOIN fountain_raw.suppressed_source_listings suppressed
      ON suppressed.source_slug = source.slug
     AND suppressed.source_listing_id = source_record.source_listing_id
  )
  SELECT
    (SELECT count(*) FROM campaign_tasks)::integer AS campaign_task_count,
    (SELECT count(*) FROM classified_tasks)::integer AS classified_task_count,
    (SELECT count(*) FROM organization_conflicts)::integer AS organization_conflict_count,
    (SELECT count(*) FROM suppression_candidates)::integer AS candidate_count,
    (SELECT count(*) FROM candidate_state
      WHERE status = 'active' AND deleted_at IS NULL)::integer AS active_candidate_count,
    (SELECT count(*) FROM candidate_state WHERE hard_excluded)::integer
      AS hard_excluded_candidate_count,
    (SELECT count(*) FROM (
      SELECT entity_id FROM campaign_tasks GROUP BY entity_id HAVING count(*) > 1
    ) duplicate)::integer AS duplicate_entity_count,
    (SELECT count(*) FROM source_pairs)::integer AS source_record_fanout,
    (SELECT count(*) FROM source_pairs WHERE source_listing_id IS NULL)::integer
      AS null_source_listing_count,
    (SELECT count(*) FROM source_pairs WHERE already_suppressed)::integer
      AS existing_suppression_overlap,
    (SELECT count(DISTINCT (source_slug, source_listing_id)) FROM source_pairs)::integer
      AS distinct_source_pair_count,
    (SELECT count(*) FROM candidate_state candidate
      WHERE NOT EXISTS (
        SELECT 1 FROM source_pairs source_pair
        WHERE source_pair.entity_id = candidate.entity_id
      ))::integer AS locations_without_source_records,
    (SELECT count(*) FROM fountain_ops.field_status status
      JOIN candidate_state candidate
        ON status.entity_type = 'location'
       AND status.entity_id = candidate.entity_id
       AND status.field = 'status')::integer AS existing_status_ledger_count,
    (SELECT count(*) FROM fountain_raw.suppressed_source_listings)::integer
      AS suppression_ledger_before,
    (SELECT count(*) FROM fountain.search_index search
      JOIN candidate_state candidate ON candidate.entity_id = search.entity_id
      WHERE search.entity_type = 'location')::integer AS candidate_search_rows,
    COALESCE((SELECT jsonb_object_agg(class, count) FROM (
      SELECT class, count(*)::integer AS count
      FROM suppression_candidates GROUP BY class ORDER BY class
    ) class_counts), '{}'::jsonb) AS class_counts
`;

const CREATE_TEMP_CANDIDATES_SQL = `
  CREATE TEMP TABLE gate_b_suppression_candidates ON COMMIT DROP AS
  WITH ${CANDIDATE_CTES}
  SELECT task_id, entity_id, classification_key, class, confidence, rationale, model
  FROM suppression_candidates
  ORDER BY entity_id
`;

const TEMP_PREFLIGHT_SQL = `
  WITH candidate_state AS (
    SELECT
      candidate.*,
      location.status,
      location.deleted_at,
      ${HARD_EXCLUSION_PREDICATE_SQL.replaceAll("l.", "location.").replaceAll("o.", "organization.")}
        AS hard_excluded
    FROM gate_b_suppression_candidates candidate
    JOIN fountain.locations location ON location.id = candidate.entity_id
    LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
  ),
  source_pairs AS (
    SELECT
      candidate.entity_id,
      source.slug AS source_slug,
      source_record.source_listing_id,
      (suppressed.source_slug IS NOT NULL) AS already_suppressed
    FROM candidate_state candidate
    JOIN fountain.source_records source_record
      ON source_record.entity_type = 'location'
     AND source_record.entity_id = candidate.entity_id
    JOIN fountain.sources source ON source.id = source_record.source_id
    LEFT JOIN fountain_raw.suppressed_source_listings suppressed
      ON suppressed.source_slug = source.slug
     AND suppressed.source_listing_id = source_record.source_listing_id
  )
  SELECT
    (SELECT count(*) FROM fountain_ops.task_queue queue
      WHERE queue.task_type = 'legitimacy_check'
        AND queue.entity_type = 'location'
        AND queue.payload->>'campaign' = $1
        AND queue.payload->>'prompt_version' = $2)::integer AS campaign_task_count,
    (SELECT count(*) FROM fountain_ops.task_queue queue
      WHERE queue.task_type = 'legitimacy_check'
        AND queue.entity_type = 'location'
        AND queue.payload->>'campaign' = $1
        AND queue.payload->>'prompt_version' = $2
        AND queue.status = 'done'
        AND queue.result->>'outcome' = 'classified')::integer AS classified_task_count,
    (SELECT count(*) FROM (
      SELECT queue.payload->>'classification_key'
      FROM fountain_ops.task_queue queue
      WHERE queue.task_type = 'legitimacy_check'
        AND queue.entity_type = 'location'
        AND queue.payload->>'campaign' = $1
        AND queue.payload->>'prompt_version' = $2
        AND queue.status = 'done'
        AND queue.result->>'outcome' = 'classified'
        AND queue.payload->>'classification_key' LIKE 'organization:%'
      GROUP BY queue.payload->>'classification_key'
      HAVING count(DISTINCT queue.result->'final'->>'class') > 1
    ) conflicts)::integer AS organization_conflict_count,
    (SELECT count(*) FROM (
      SELECT queue.entity_id
      FROM fountain_ops.task_queue queue
      WHERE queue.task_type = 'legitimacy_check'
        AND queue.entity_type = 'location'
        AND queue.payload->>'campaign' = $1
        AND queue.payload->>'prompt_version' = $2
      GROUP BY queue.entity_id
      HAVING count(*) > 1
    ) duplicates)::integer AS duplicate_entity_count,
    (SELECT count(*) FROM gate_b_suppression_candidates)::integer AS candidate_count,
    (SELECT count(*) FROM candidate_state
      WHERE status = 'active' AND deleted_at IS NULL)::integer AS active_candidate_count,
    (SELECT count(*) FROM candidate_state WHERE hard_excluded)::integer
      AS hard_excluded_candidate_count,
    (SELECT count(*) FROM source_pairs)::integer AS source_record_fanout,
    (SELECT count(*) FROM source_pairs WHERE source_listing_id IS NULL)::integer
      AS null_source_listing_count,
    (SELECT count(*) FROM source_pairs WHERE already_suppressed)::integer
      AS existing_suppression_overlap,
    (SELECT count(DISTINCT (source_slug, source_listing_id)) FROM source_pairs)::integer
      AS distinct_source_pair_count,
    (SELECT count(*) FROM candidate_state candidate
      WHERE NOT EXISTS (
        SELECT 1 FROM source_pairs source_pair
        WHERE source_pair.entity_id = candidate.entity_id
      ))::integer AS locations_without_source_records,
    (SELECT count(*) FROM fountain_ops.field_status status
      JOIN candidate_state candidate
        ON status.entity_type = 'location'
       AND status.entity_id = candidate.entity_id
       AND status.field = 'status')::integer AS existing_status_ledger_count,
    (SELECT count(*) FROM fountain_raw.suppressed_source_listings)::integer
      AS suppression_ledger_before,
    (SELECT count(*) FROM fountain.search_index search
      JOIN candidate_state candidate ON candidate.entity_id = search.entity_id
      WHERE search.entity_type = 'location')::integer AS candidate_search_rows,
    COALESCE((SELECT jsonb_object_agg(class, count) FROM (
      SELECT class, count(*)::integer AS count
      FROM gate_b_suppression_candidates GROUP BY class ORDER BY class
    ) class_counts), '{}'::jsonb) AS class_counts
`;

const INSERT_SOURCE_SUPPRESSIONS_SQL = `
  INSERT INTO fountain_raw.suppressed_source_listings (
    source_slug,
    source_listing_id,
    reason,
    suppressed_by
  )
  SELECT
    source.slug,
    source_record.source_listing_id,
    $1::text || ':' || candidate.class,
    $2::text
  FROM gate_b_suppression_candidates candidate
  JOIN fountain.source_records source_record
    ON source_record.entity_type = 'location'
   AND source_record.entity_id = candidate.entity_id
  JOIN fountain.sources source ON source.id = source_record.source_id
  ORDER BY source.slug, source_record.source_listing_id
  ON CONFLICT (source_slug, source_listing_id) DO NOTHING
`;

const HIDE_LOCATIONS_SQL = `
  UPDATE fountain.locations location
  SET status = 'hidden', updated_at = now()
  FROM gate_b_suppression_candidates candidate
  WHERE location.id = candidate.entity_id
    AND location.status = 'active'
    AND location.deleted_at IS NULL
`;

const STAMP_EVENTS_SQL = `
  UPDATE fountain.entity_change_events event
  SET reason = $6::text,
      metadata = event.metadata || jsonb_build_object(
        'run_id', $1::bigint,
        'campaign', $2::text,
        'prompt_version', $3::text,
        'task_id', candidate.task_id,
        'class', candidate.class,
        'confidence', candidate.confidence,
        'model', candidate.model,
        'rationale', candidate.rationale
      )
  FROM gate_b_suppression_candidates candidate
  WHERE event.entity_type = 'locations'
    AND event.entity_id = candidate.entity_id
    AND event.action = 'update'
    AND event.actor_id = $4::uuid
    AND event.created_at >= $5::timestamptz
    AND event.before_data->>'status' = 'active'
    AND event.after_data->>'status' = 'hidden'
    AND NOT (event.metadata ? 'run_id')
`;

const UPDATE_TASK_EVIDENCE_SQL = `
  UPDATE fountain_ops.task_queue queue
  SET result = jsonb_set(
        jsonb_set(
          queue.result,
          '{serving_write}',
          jsonb_build_object(
            'attempted', true,
            'written', true,
            'run_id', $1::bigint,
            'applied_at', $2::timestamptz
          ),
          true
        ),
        '{suppression}',
        jsonb_build_object(
          'status', 'applied',
          'run_id', $1::bigint,
          'applied_at', $2::timestamptz,
          'class', candidate.class,
          'model', candidate.model,
          'rationale', candidate.rationale
        ),
        true
      ),
      updated_at = now()
  FROM gate_b_suppression_candidates candidate
  WHERE queue.id = candidate.task_id
`;

const UPSERT_STATUS_LEDGER_SQL = `
  INSERT INTO fountain_ops.field_status (
    entity_type,
    entity_id,
    field,
    verification,
    locked,
    verified_by,
    verified_at,
    source_note
  )
  SELECT
    'location',
    candidate.entity_id,
    'status',
    'agent_verified',
    false,
    $1,
    $2::timestamptz,
    'Pass 1 Gate B legitimacy suppression; run ' || $3::text
  FROM gate_b_suppression_candidates candidate
  ON CONFLICT (entity_type, entity_id, field) DO UPDATE
  SET verification = EXCLUDED.verification,
      verified_by = EXCLUDED.verified_by,
      verified_at = EXCLUDED.verified_at,
      source_note = EXCLUDED.source_note
  WHERE NOT fountain_ops.field_status.locked
    AND fountain_ops.field_status.verification NOT IN ('human_verified', 'owner_verified')
`;

const VERIFY_SQL = `
  SELECT
    (SELECT count(*) FROM gate_b_suppression_candidates candidate
      JOIN fountain.locations location ON location.id = candidate.entity_id
      WHERE location.status = 'hidden' AND location.deleted_at IS NULL)::integer
      AS hidden_count,
    (SELECT count(*) FROM fountain.search_index search
      JOIN gate_b_suppression_candidates candidate ON candidate.entity_id = search.entity_id
      WHERE search.entity_type = 'location')::integer AS remaining_search_rows,
    (SELECT count(*) FROM fountain_raw.suppressed_source_listings
      WHERE suppressed_by = $1)::integer AS run_suppression_ledger_rows,
    (SELECT count(*) FROM fountain_raw.suppressed_source_listings)::integer
      AS suppression_ledger_after,
    (SELECT count(*) FROM fountain.entity_change_events
      WHERE entity_type = 'locations'
        AND metadata->>'run_id' = $2::text
        AND before_data->>'status' = 'active'
        AND after_data->>'status' = 'hidden')::integer AS stamped_event_count,
    (SELECT count(*) FROM fountain_ops.task_queue
      WHERE result#>>'{serving_write,run_id}' = $2::text
        AND result#>>'{serving_write,written}' = 'true')::integer AS task_evidence_count,
    (SELECT count(*) FROM fountain_ops.field_status status
      JOIN gate_b_suppression_candidates candidate
        ON status.entity_type = 'location'
       AND status.entity_id = candidate.entity_id
       AND status.field = 'status'
      WHERE status.verification = 'agent_verified'
        AND status.verified_by = $1)::integer AS status_ledger_count,
    (SELECT count(*) FROM fountain.locations
      WHERE status = 'active' AND deleted_at IS NULL)::integer AS active_locations_after,
    (SELECT count(*) FROM fountain.locations
      WHERE status = 'hidden' AND deleted_at IS NULL)::integer AS hidden_locations_after
`;

const SPOT_CHECKS_SQL = `
  SELECT
    candidate.entity_id,
    location.name,
    location.locality,
    location.region,
    location.country_code,
    candidate.class,
    candidate.confidence,
    candidate.model,
    candidate.rationale,
    (SELECT count(*) FROM fountain.source_records source_record
      WHERE source_record.entity_type = 'location'
        AND source_record.entity_id = candidate.entity_id)::integer AS source_records
  FROM gate_b_suppression_candidates candidate
  JOIN fountain.locations location ON location.id = candidate.entity_id
  ORDER BY md5($1 || ':' || candidate.entity_id::text), candidate.entity_id
  LIMIT 10
`;

const CLASSIFICATION_USAGE_SQL = `
  SELECT
    COALESCE(sum(run.budget_usd), 0)::numeric AS budget_usd,
    COALESCE(sum(run.spent_usd_estimate), 0)::numeric AS spend_usd,
    count(*)::integer AS run_count
  FROM fountain_ops.runs run
  WHERE run.id = ANY($1::bigint[])
`;

export async function previewLegitimacyGateBSuppression(
  {
    campaign,
    promptVersion,
    expectedSuppressionCount,
  },
  { query = defaultQuery } = {},
) {
  const normalized = normalizeOptions({ campaign, promptVersion, expectedSuppressionCount });
  const result = await executeQuery(query, PREVIEW_SQL, [normalized.campaign, normalized.promptVersion]);
  const stats = normalizePreflight(rowsFrom(result)[0]);
  assertPreflight(stats, normalized.expectedSuppressionCount, { requireNoOverlap: true });
  return { ...stats, apply: false, expectedSuppressionCount: normalized.expectedSuppressionCount };
}

export async function applyLegitimacyGateBSuppression(
  {
    campaign,
    promptVersion,
    runId,
    classificationRunIds,
    expectedSuppressionCount,
    actorId = LEGITIMACY_GATE_B_APPLY_ACTOR_ID,
    actorLabelPrefix = "pass1_gate_b_apply_run",
    sourceReasonPrefix = "pass1_gate_b",
    eventReason = "pass1_gate_b_legitimacy_suppression",
  },
  {
    withTransaction = defaultWithTransaction,
    setActor = setMutationActor,
  } = {},
) {
  const normalized = normalizeOptions({
    campaign,
    promptVersion,
    runId,
    classificationRunIds,
    expectedSuppressionCount,
    actorId,
    actorLabelPrefix,
    sourceReasonPrefix,
    eventReason,
  });
  const actorLabel = `${normalized.actorLabelPrefix}_${normalized.runId}`;

  return withTransaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [`fountain:${normalized.campaign}:${normalized.promptVersion}:suppression_apply`],
    );
    await setActor(tx, {
      actorId: normalized.actorId,
      actorLabel,
    });
    const startedResult = await tx.query("SELECT transaction_timestamp() AS apply_started_at");
    const applyStartedAt = rowsFrom(startedResult)[0]?.apply_started_at;
    if (!applyStartedAt) throw new Error("Gate B suppression could not establish apply timestamp.");

    await tx.query(CREATE_TEMP_CANDIDATES_SQL, [normalized.campaign, normalized.promptVersion]);
    const locked = await tx.query(`
      SELECT location.id
      FROM fountain.locations location
      JOIN gate_b_suppression_candidates candidate ON candidate.entity_id = location.id
      ORDER BY location.id
      FOR UPDATE OF location
    `);
    if (number(locked.rowCount ?? rowsFrom(locked).length) !== normalized.expectedSuppressionCount) {
      throw new Error(
        `Gate B suppression row lock drifted: expected ${normalized.expectedSuppressionCount}, `
          + `locked ${number(locked.rowCount ?? rowsFrom(locked).length)}.`,
      );
    }

    const preflightResult = await tx.query(TEMP_PREFLIGHT_SQL, [
      normalized.campaign,
      normalized.promptVersion,
    ]);
    const preflight = normalizePreflight(rowsFrom(preflightResult)[0]);
    assertPreflight(preflight, normalized.expectedSuppressionCount, { requireNoOverlap: true });

    const inserted = await tx.query(INSERT_SOURCE_SUPPRESSIONS_SQL, [
      normalized.sourceReasonPrefix,
      actorLabel,
    ]);
    assertCount("suppression ledger inserts", inserted, preflight.sourceRecordFanout);

    const hidden = await tx.query(HIDE_LOCATIONS_SQL);
    assertCount("hidden locations", hidden, normalized.expectedSuppressionCount);

    const stamped = await tx.query(STAMP_EVENTS_SQL, [
      normalized.runId,
      normalized.campaign,
      normalized.promptVersion,
      normalized.actorId,
      applyStartedAt,
      normalized.eventReason,
    ]);
    assertCount("stamped location events", stamped, normalized.expectedSuppressionCount);

    const taskEvidence = await tx.query(UPDATE_TASK_EVIDENCE_SQL, [normalized.runId, applyStartedAt]);
    assertCount("task serving-write evidence", taskEvidence, normalized.expectedSuppressionCount);

    const statusLedger = await tx.query(UPSERT_STATUS_LEDGER_SQL, [
      actorLabel,
      applyStartedAt,
      normalized.runId,
    ]);
    assertCount("status ledger rows", statusLedger, normalized.expectedSuppressionCount);

    const verificationResult = await tx.query(VERIFY_SQL, [actorLabel, normalized.runId]);
    const verification = normalizeVerification(rowsFrom(verificationResult)[0]);
    assertVerification(verification, preflight, normalized.expectedSuppressionCount);

    const spotChecksResult = await tx.query(SPOT_CHECKS_SQL, [
      `pass1-gate-b-completion:${normalized.runId}`,
    ]);
    const usageResult = await tx.query(CLASSIFICATION_USAGE_SQL, [normalized.classificationRunIds]);
    const usage = normalizeUsage(rowsFrom(usageResult)[0]);

    return {
      apply: true,
      campaign: normalized.campaign,
      promptVersion: normalized.promptVersion,
      applyRunId: normalized.runId,
      classificationRunIds: normalized.classificationRunIds,
      actorId: normalized.actorId,
      actorLabel,
      appliedAt: new Date(applyStartedAt).toISOString(),
      expectedSuppressionCount: normalized.expectedSuppressionCount,
      preflight,
      verification,
      usage,
      spotChecks: rowsFrom(spotChecksResult).map(normalizeSpotCheck),
    };
  });
}

export function renderLegitimacyGateBCompletion(result) {
  if (!result?.apply) throw new Error("Gate B completion report requires applied evidence.");
  const { preflight, verification, usage } = result;
  const ledgerDelta = verification.suppressionLedgerAfter - preflight.suppressionLedgerBefore;
  const lines = [
    "# Pass 1 Legitimacy Triage — Gate B Completion",
    "",
    "**GATE B COMPLETE**",
    "",
    `What was done: Atomically suppressed ${formatInteger(result.expectedSuppressionCount)} approved Gate B locations. Each location was hidden, removed from serving search by the existing trigger, linked source listings were added to the re-ingestion suppression ledger, task evidence was updated, and the generated location event was stamped with apply run ${result.applyRunId}.`,
    "",
    `Evidence: Apply run ${result.applyRunId}; classification runs ${result.classificationRunIds.join(" and ")}; actor \`${result.actorLabel}\` / \`${result.actorId}\`.`,
    "",
    "Deviations from rubric/plan: None. The approved effective suppression set was unchanged at apply time.",
    "",
    "Open questions: None for Gate B. Stage 3 review resolution remains separately approval-gated.",
    "",
    "## Atomic reconciliation",
    "",
    "| Check | Expected | Actual |",
    "| --- | ---: | ---: |",
    `| Terminal classified cohort | ${formatInteger(preflight.campaignTaskCount)} | ${formatInteger(preflight.classifiedTaskCount)} |`,
    `| Organization-conflict keys excluded | ${formatInteger(preflight.organizationConflictCount)} | ${formatInteger(preflight.organizationConflictCount)} |`,
    `| Approved suppressions | ${formatInteger(result.expectedSuppressionCount)} | ${formatInteger(verification.hiddenCount)} |`,
    `| Location change events stamped with run_id | ${formatInteger(result.expectedSuppressionCount)} | ${formatInteger(verification.stampedEventCount)} |`,
    `| Task serving-write evidence rows | ${formatInteger(result.expectedSuppressionCount)} | ${formatInteger(verification.taskEvidenceCount)} |`,
    `| Guarded status ledger rows | ${formatInteger(result.expectedSuppressionCount)} | ${formatInteger(verification.statusLedgerCount)} |`,
    `| Source-record fan-out / suppression-ledger delta | ${formatInteger(preflight.sourceRecordFanout)} | ${formatInteger(ledgerDelta)} |`,
    `| Candidate locations without source records | 0 | ${formatInteger(preflight.locationsWithoutSourceRecords)} |`,
    `| Pre-existing candidate status-ledger rows | 0 | ${formatInteger(preflight.existingStatusLedgerCount)} |`,
    `| Remaining suppressed-location search rows | 0 | ${formatInteger(verification.remainingSearchRows)} |`,
    `| Hard-excluded locations touched | 0 | ${formatInteger(preflight.hardExcludedCandidateCount)} |`,
    "",
    `Suppression ledger: ${formatInteger(preflight.suppressionLedgerBefore)} → ${formatInteger(verification.suppressionLedgerAfter)}. Active serving locations after apply: ${formatInteger(verification.activeLocationsAfter)}; hidden locations: ${formatInteger(verification.hiddenLocationsAfter)}.`,
    "",
    "## Applied classes",
    "",
    "| Class | Suppressed |",
    "| --- | ---: |",
  ];
  for (const className of SUPPRESSION_CLASSES) {
    lines.push(`| ${className} | ${formatInteger(preflight.classCounts[className])} |`);
  }
  lines.push(
    "",
    "## Budget evidence",
    "",
    `Classification evidence runs used ${formatUsd(usage.spendUsd)} of ${formatUsd(usage.budgetUsd)} across ${formatInteger(usage.runCount)} run(s). The atomic apply made no external calls and added $0 model/provider spend.`,
    "",
    "## Ten deterministic spot checks",
    "",
    "| ID | Name | Location | Class | Confidence | Model | Source rows | Rationale |",
    "| ---: | --- | --- | --- | ---: | --- | ---: | --- |",
  );
  for (const row of result.spotChecks) {
    lines.push(tableRow([
      row.entityId,
      row.name || "—",
      [row.locality, row.region, row.countryCode].filter(Boolean).join(", ") || "—",
      row.class,
      row.confidence.toFixed(2),
      row.model || "—",
      row.sourceRecords,
      row.rationale || "—",
    ]));
  }
  lines.push(
    "",
    "## Restore recipe",
    "",
    `A restore must run in one guarded transaction and target apply run ${result.applyRunId} only: restore each location's status from the stamped event's \`before_data\`; delete the ${formatInteger(preflight.sourceRecordFanout)} suppression-ledger rows whose \`suppressed_by\` is \`${result.actorLabel}\`; remove only that actor's run-created \`status\` field-ledger rows; and append run-linked restore events. Abort unless all three counts reconcile before commit.`,
    "",
    "The applied task results retain the original class, confidence, model, and rationale plus `serving_write` and `suppression` evidence for this run.",
  );
  return `${lines.join("\n")}\n`;
}

function normalizeOptions({
  campaign,
  promptVersion,
  runId = null,
  classificationRunIds = null,
  expectedSuppressionCount,
  actorId = LEGITIMACY_GATE_B_APPLY_ACTOR_ID,
  actorLabelPrefix = "pass1_gate_b_apply_run",
  sourceReasonPrefix = "pass1_gate_b",
  eventReason = "pass1_gate_b_legitimacy_suppression",
}) {
  const normalized = {
    campaign: nonemptyString(campaign, "campaign"),
    promptVersion: nonemptyString(promptVersion, "promptVersion"),
    expectedSuppressionCount: positiveInteger(expectedSuppressionCount, "expectedSuppressionCount"),
    actorId: nonemptyString(actorId, "actorId"),
    actorLabelPrefix: nonemptyString(actorLabelPrefix, "actorLabelPrefix"),
    sourceReasonPrefix: nonemptyString(sourceReasonPrefix, "sourceReasonPrefix"),
    eventReason: nonemptyString(eventReason, "eventReason"),
  };
  if (runId != null) normalized.runId = positiveIntegerString(runId, "runId");
  if (classificationRunIds != null) {
    if (!Array.isArray(classificationRunIds) || classificationRunIds.length === 0) {
      throw new TypeError("classificationRunIds must be a non-empty array.");
    }
    normalized.classificationRunIds = [...new Set(
      classificationRunIds.map((value) => positiveIntegerString(value, "classificationRunId")),
    )];
  }
  return normalized;
}

function normalizePreflight(row = {}) {
  return {
    campaignTaskCount: number(row.campaign_task_count),
    classifiedTaskCount: number(row.classified_task_count),
    organizationConflictCount: number(row.organization_conflict_count),
    candidateCount: number(row.candidate_count),
    activeCandidateCount: number(row.active_candidate_count),
    hardExcludedCandidateCount: number(row.hard_excluded_candidate_count),
    duplicateEntityCount: number(row.duplicate_entity_count),
    sourceRecordFanout: number(row.source_record_fanout),
    nullSourceListingCount: number(row.null_source_listing_count),
    existingSuppressionOverlap: number(row.existing_suppression_overlap),
    distinctSourcePairCount: number(row.distinct_source_pair_count),
    locationsWithoutSourceRecords: number(row.locations_without_source_records),
    existingStatusLedgerCount: number(row.existing_status_ledger_count),
    suppressionLedgerBefore: number(row.suppression_ledger_before),
    candidateSearchRows: number(row.candidate_search_rows),
    classCounts: countObject(row.class_counts),
  };
}

function assertPreflight(stats, expectedCount, { requireNoOverlap }) {
  const failures = [];
  if (stats.campaignTaskCount && stats.campaignTaskCount !== stats.classifiedTaskCount) {
    failures.push(`classified=${stats.classifiedTaskCount}/${stats.campaignTaskCount}`);
  }
  if (stats.candidateCount !== expectedCount) {
    failures.push(`candidates=${stats.candidateCount}/${expectedCount}`);
  }
  if (stats.activeCandidateCount !== expectedCount) {
    failures.push(`active=${stats.activeCandidateCount}/${expectedCount}`);
  }
  if (stats.hardExcludedCandidateCount !== 0) {
    failures.push(`hard_excluded=${stats.hardExcludedCandidateCount}`);
  }
  if (stats.duplicateEntityCount !== 0) failures.push(`duplicate_entities=${stats.duplicateEntityCount}`);
  if (stats.nullSourceListingCount !== 0) {
    failures.push(`null_source_listing_ids=${stats.nullSourceListingCount}`);
  }
  if (stats.distinctSourcePairCount !== stats.sourceRecordFanout) {
    failures.push(
      `distinct_source_pairs=${stats.distinctSourcePairCount}/${stats.sourceRecordFanout}`,
    );
  }
  if (stats.locationsWithoutSourceRecords !== 0) {
    failures.push(`locations_without_source_records=${stats.locationsWithoutSourceRecords}`);
  }
  if (stats.existingStatusLedgerCount !== 0) {
    failures.push(`existing_status_ledger_rows=${stats.existingStatusLedgerCount}`);
  }
  if (requireNoOverlap && stats.existingSuppressionOverlap !== 0) {
    failures.push(`existing_suppression_overlap=${stats.existingSuppressionOverlap}`);
  }
  if (failures.length > 0) {
    throw new Error(`Gate B suppression preflight refused apply: ${failures.join(", ")}.`);
  }
}

function normalizeVerification(row = {}) {
  return {
    hiddenCount: number(row.hidden_count),
    remainingSearchRows: number(row.remaining_search_rows),
    runSuppressionLedgerRows: number(row.run_suppression_ledger_rows),
    suppressionLedgerAfter: number(row.suppression_ledger_after),
    stampedEventCount: number(row.stamped_event_count),
    taskEvidenceCount: number(row.task_evidence_count),
    statusLedgerCount: number(row.status_ledger_count),
    activeLocationsAfter: number(row.active_locations_after),
    hiddenLocationsAfter: number(row.hidden_locations_after),
  };
}

function assertVerification(verification, preflight, expectedCount) {
  const expectedLedgerAfter = preflight.suppressionLedgerBefore + preflight.sourceRecordFanout;
  const failures = [];
  if (verification.hiddenCount !== expectedCount) failures.push(`hidden=${verification.hiddenCount}`);
  if (verification.remainingSearchRows !== 0) {
    failures.push(`remaining_search_rows=${verification.remainingSearchRows}`);
  }
  if (verification.runSuppressionLedgerRows !== preflight.sourceRecordFanout) {
    failures.push(`run_suppression_rows=${verification.runSuppressionLedgerRows}`);
  }
  if (verification.suppressionLedgerAfter !== expectedLedgerAfter) {
    failures.push(
      `suppression_ledger_after=${verification.suppressionLedgerAfter}/${expectedLedgerAfter}`,
    );
  }
  if (verification.stampedEventCount !== expectedCount) {
    failures.push(`stamped_events=${verification.stampedEventCount}`);
  }
  if (verification.taskEvidenceCount !== expectedCount) {
    failures.push(`task_evidence=${verification.taskEvidenceCount}`);
  }
  if (verification.statusLedgerCount !== expectedCount) {
    failures.push(`status_ledger=${verification.statusLedgerCount}`);
  }
  if (failures.length > 0) {
    throw new Error(`Gate B suppression verification failed: ${failures.join(", ")}.`);
  }
}

function assertCount(label, result, expected) {
  const actual = number(result?.rowCount ?? rowsFrom(result).length);
  if (actual !== expected) throw new Error(`${label} did not reconcile: ${actual}/${expected}.`);
}

function normalizeUsage(row = {}) {
  return {
    budgetUsd: number(row.budget_usd),
    spendUsd: number(row.spend_usd),
    runCount: number(row.run_count),
  };
}

function normalizeSpotCheck(row) {
  return {
    entityId: number(row.entity_id),
    name: String(row.name || ""),
    locality: String(row.locality || ""),
    region: String(row.region || ""),
    countryCode: String(row.country_code || ""),
    class: String(row.class || ""),
    confidence: number(row.confidence),
    model: String(row.model || ""),
    rationale: String(row.rationale || ""),
    sourceRecords: number(row.source_records),
  };
}

function countObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, number(count)]));
}

function tableRow(values) {
  return `| ${values.map((value) => String(value ?? "").replace(/\|/gu, "\\|").replace(/[\r\n]+/gu, " ").trim()).join(" | ")} |`;
}

function formatInteger(value) {
  return Math.round(number(value)).toLocaleString("en-US");
}

function formatUsd(value) {
  return `$${number(value).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;
}

function nonemptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function positiveInteger(value, label) {
  const parsed = number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return parsed;
}

function positiveIntegerString(value, label) {
  const string = String(value ?? "");
  if (!/^[1-9]\d*$/u.test(string)) throw new TypeError(`${label} must be a positive integer.`);
  return string;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or pg-compatible client.");
}

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}
