import { query as defaultQuery } from "./db.mjs";

export const LEGITIMACY_GATE_A_CAMPAIGN = "pass1_gate_a";
export const LEGITIMACY_PROMPT_VERSION = "pass1-legitimacy-v1";
export const LEGITIMACY_SAMPLE_SEED = "pass1-gate-a-v1";
export const LEGITIMACY_SAMPLE_COUNTS = Object.freeze({
  hyperbaric: 50,
  hospital: 50,
  random: 200,
});

const SAMPLE_TOTAL = Object.values(LEGITIMACY_SAMPLE_COUNTS)
  .reduce((total, count) => total + count, 0);
const CLASS_ORDER = new Map([
  ["junk", 0],
  ["plain_hospital", 1],
  ["review", 2],
  ["destination_medical", 3],
  ["in_scope", 4],
  ["unclassified", 5],
]);

/**
 * Schema-backed hard exclusions for a location alias `l` and its parent
 * organization alias `o`. Organization protections are intentionally honored:
 * an owner claim or locked parent field must protect every child location.
 */
export const HARD_EXCLUSION_PREDICATE_SQL = `(
  l.owner_account_id IS NOT NULL
  OR l.data_origin IN ('owner', 'manual')
  OR l.verification_status IN ('human_verified', 'owner_verified')
  OR o.owner_account_id IS NOT NULL
  OR COALESCE(o.data_origin IN ('owner', 'manual'), false)
  OR COALESCE(o.verification_status IN ('human_verified', 'owner_verified'), false)
  OR EXISTS (
    SELECT 1
    FROM fountain.clinic_claims claim
    WHERE claim.status = 'approved'
      AND (
        claim.location_id = l.id
        OR (l.org_id IS NOT NULL AND claim.org_id = l.org_id)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM fountain_ops.field_status field_status
    WHERE (
        (field_status.entity_type = 'location' AND field_status.entity_id = l.id)
        OR (
          l.org_id IS NOT NULL
          AND field_status.entity_type = 'organization'
          AND field_status.entity_id = l.org_id
        )
      )
      AND (
        field_status.locked
        OR field_status.verification IN ('human_verified', 'owner_verified')
      )
  )
)`;

const ACTIVE_AND_ELIGIBLE_CTES = `
  active AS (
    SELECT
      l.id,
      l.org_id,
      l.name,
      l.country_code,
      o.canonical_name AS organization_name,
      ${HARD_EXCLUSION_PREDICATE_SQL} AS hard_excluded
    FROM fountain.locations l
    LEFT JOIN fountain.organizations o ON o.id = l.org_id
    WHERE l.status = 'active'
      AND l.deleted_at IS NULL
  ),
  eligible AS (
    SELECT
      active.*,
      EXISTS (
        SELECT 1
        FROM fountain.source_records source_record
        JOIN fountain.sources source ON source.id = source_record.source_id
        WHERE source_record.entity_type = 'location'
          AND source_record.entity_id = active.id
          AND source.slug = 'hyperbaric_app'
      ) AS is_hyperbaric,
      (
        COALESCE(active.name, '') ILIKE ANY (
          ARRAY['%hospital%', '%medical center%', '%medical centre%', '%clinic%']
        )
        OR COALESCE(active.organization_name, '') ILIKE ANY (
          ARRAY['%hospital%', '%medical center%', '%medical centre%', '%clinic%']
        )
      ) AS is_hospital_flavored
    FROM active
    WHERE NOT active.hard_excluded
  ),
  stratified AS (
    SELECT
      eligible.*,
      CASE
        WHEN is_hyperbaric THEN 'hyperbaric'
        WHEN is_hospital_flavored THEN 'hospital'
        ELSE 'random'
      END AS sample_stratum
    FROM eligible
  )
`;

const ENQUEUE_SAMPLE_SQL = `
  WITH
  gate_lock AS (
    SELECT pg_advisory_xact_lock(
      hashtextextended('fountain:legitimacy_gate_a:' || $1 || ':' || $2, 0)
    )
    WHERE $8::boolean
  ),
  ${ACTIVE_AND_ELIGIBLE_CTES},
  existing AS (
    SELECT queue.entity_id, queue.payload
    FROM fountain_ops.task_queue queue
    WHERE queue.task_type = 'legitimacy_check'
      AND queue.entity_type = 'location'
      AND queue.payload->>'campaign' = $1
      AND queue.payload->>'prompt_version' = $2
  ),
  hyperbaric_sample AS (
    SELECT id, 'hyperbaric'::text AS sample_stratum
    FROM stratified
    WHERE sample_stratum = 'hyperbaric'
    ORDER BY md5($3 || ':hyperbaric:' || id::text)
    LIMIT 50
  ),
  hospital_ranked AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY COALESCE(NULLIF(country_code, ''), 'ZZ')
        ORDER BY md5($3 || ':hospital:' || id::text)
      ) AS country_rank
    FROM stratified
    WHERE sample_stratum = 'hospital'
  ),
  hospital_sample AS (
    SELECT id, 'hospital'::text AS sample_stratum
    FROM hospital_ranked
    ORDER BY country_rank, md5($3 || ':hospital-country-mix:' || id::text)
    LIMIT 50
  ),
  random_sample AS (
    SELECT id, 'random'::text AS sample_stratum
    FROM stratified
    WHERE sample_stratum = 'random'
    ORDER BY md5($3 || ':random:' || id::text)
    LIMIT 200
  ),
  selected AS (
    SELECT * FROM hyperbaric_sample
    UNION ALL
    SELECT * FROM hospital_sample
    UNION ALL
    SELECT * FROM random_sample
  ),
  prepared AS (
    SELECT
      selected.id AS entity_id,
      selected.sample_stratum,
      jsonb_build_object(
        'schema_version', 1,
        'campaign', $1,
        'prompt_version', $2,
        'stage', 'stage_1',
        'sample_stratum', selected.sample_stratum,
        'threshold', $4::numeric,
        'sample_seed', $3
      ) AS payload
    FROM selected
  ),
  active_conflicts AS (
    SELECT count(*)::integer AS count
    FROM prepared
    JOIN fountain_ops.task_queue queue
      ON queue.task_type = 'legitimacy_check'
     AND queue.entity_type = 'location'
     AND queue.entity_id = prepared.entity_id
     AND queue.status IN ('pending', 'claimed')
    WHERE queue.payload->>'campaign' IS DISTINCT FROM $1
       OR queue.payload->>'prompt_version' IS DISTINCT FROM $2
  ),
  readiness AS (
    SELECT
      (SELECT count(*) FROM hyperbaric_sample) = 50
      AND (SELECT count(*) FROM hospital_sample) = 50
      AND (SELECT count(*) FROM random_sample) = 200
      AND (SELECT count FROM active_conflicts) = 0 AS ready
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
      prepared.entity_id,
      $5,
      prepared.payload,
      $6,
      $7
    FROM prepared
    CROSS JOIN readiness
    CROSS JOIN gate_lock
    WHERE $8::boolean
      AND readiness.ready
      AND (SELECT count(*) FROM existing) = 0
    ON CONFLICT (task_type, entity_type, entity_id)
      WHERE status IN ('pending', 'claimed')
      DO NOTHING
    RETURNING entity_id, payload
  ),
  output_rows AS (
    SELECT entity_id, payload
    FROM existing
    UNION ALL
    SELECT entity_id, payload
    FROM inserted
    WHERE (SELECT count(*) FROM existing) = 0
    UNION ALL
    SELECT entity_id, payload
    FROM prepared
    WHERE NOT $8::boolean
      AND (SELECT count(*) FROM existing) = 0
  )
  SELECT
    (SELECT count(*)::integer FROM active) AS active_count,
    (SELECT count(*)::integer FROM active WHERE hard_excluded) AS excluded_count,
    (SELECT count(*)::integer FROM eligible) AS eligible_count,
    jsonb_build_object(
      'hyperbaric', (SELECT count(*)::integer FROM stratified WHERE sample_stratum = 'hyperbaric'),
      'hospital', (SELECT count(*)::integer FROM stratified WHERE sample_stratum = 'hospital'),
      'random', (SELECT count(*)::integer FROM stratified WHERE sample_stratum = 'random')
    ) AS population_by_stratum,
    (SELECT count(*)::integer FROM existing) AS existing_count,
    (SELECT count(*)::integer FROM inserted) AS inserted_count,
    (SELECT count FROM active_conflicts) AS active_conflict_count,
    (SELECT count(*)::integer FROM output_rows) AS selected_count,
    jsonb_build_object(
      'hyperbaric', (SELECT count(*)::integer FROM output_rows WHERE payload->>'sample_stratum' = 'hyperbaric'),
      'hospital', (SELECT count(*)::integer FROM output_rows WHERE payload->>'sample_stratum' = 'hospital'),
      'random', (SELECT count(*)::integer FROM output_rows WHERE payload->>'sample_stratum' = 'random')
    ) AS sample_counts,
    COALESCE(
      (SELECT array_agg(entity_id ORDER BY entity_id) FROM output_rows),
      ARRAY[]::integer[]
    ) AS selected_entity_ids,
    COALESCE(
      (SELECT array_agg(entity_id ORDER BY entity_id) FROM inserted),
      ARRAY[]::integer[]
    ) AS inserted_entity_ids
`;

const PREVIEW_SAMPLE_SQL = `
  WITH
  ${ACTIVE_AND_ELIGIBLE_CTES},
  existing AS (
    SELECT queue.entity_id, queue.payload
    FROM fountain_ops.task_queue queue
    WHERE queue.task_type = 'legitimacy_check'
      AND queue.entity_type = 'location'
      AND queue.payload->>'campaign' = $1
      AND queue.payload->>'prompt_version' = $2
  ),
  hyperbaric_sample AS (
    SELECT id, 'hyperbaric'::text AS sample_stratum
    FROM stratified
    WHERE sample_stratum = 'hyperbaric'
    ORDER BY md5($3 || ':hyperbaric:' || id::text)
    LIMIT 50
  ),
  hospital_ranked AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY COALESCE(NULLIF(country_code, ''), 'ZZ')
        ORDER BY md5($3 || ':hospital:' || id::text)
      ) AS country_rank
    FROM stratified
    WHERE sample_stratum = 'hospital'
  ),
  hospital_sample AS (
    SELECT id, 'hospital'::text AS sample_stratum
    FROM hospital_ranked
    ORDER BY country_rank, md5($3 || ':hospital-country-mix:' || id::text)
    LIMIT 50
  ),
  random_sample AS (
    SELECT id, 'random'::text AS sample_stratum
    FROM stratified
    WHERE sample_stratum = 'random'
    ORDER BY md5($3 || ':random:' || id::text)
    LIMIT 200
  ),
  selected AS (
    SELECT * FROM hyperbaric_sample
    UNION ALL
    SELECT * FROM hospital_sample
    UNION ALL
    SELECT * FROM random_sample
  ),
  prepared AS (
    SELECT
      selected.id AS entity_id,
      jsonb_build_object(
        'schema_version', 1,
        'campaign', $1,
        'prompt_version', $2,
        'stage', 'stage_1',
        'sample_stratum', selected.sample_stratum,
        'threshold', $4::numeric,
        'sample_seed', $3
      ) AS payload
    FROM selected
  ),
  active_conflicts AS (
    SELECT count(*)::integer AS count
    FROM prepared
    JOIN fountain_ops.task_queue queue
      ON queue.task_type = 'legitimacy_check'
     AND queue.entity_type = 'location'
     AND queue.entity_id = prepared.entity_id
     AND queue.status IN ('pending', 'claimed')
    WHERE queue.payload->>'campaign' IS DISTINCT FROM $1
       OR queue.payload->>'prompt_version' IS DISTINCT FROM $2
  ),
  output_rows AS (
    SELECT entity_id, payload
    FROM existing
    UNION ALL
    SELECT entity_id, payload
    FROM prepared
    WHERE (SELECT count(*) FROM existing) = 0
  )
  SELECT
    (SELECT count(*)::integer FROM active) AS active_count,
    (SELECT count(*)::integer FROM active WHERE hard_excluded) AS excluded_count,
    (SELECT count(*)::integer FROM eligible) AS eligible_count,
    jsonb_build_object(
      'hyperbaric', (SELECT count(*)::integer FROM stratified WHERE sample_stratum = 'hyperbaric'),
      'hospital', (SELECT count(*)::integer FROM stratified WHERE sample_stratum = 'hospital'),
      'random', (SELECT count(*)::integer FROM stratified WHERE sample_stratum = 'random')
    ) AS population_by_stratum,
    (SELECT count(*)::integer FROM existing) AS existing_count,
    0::integer AS inserted_count,
    (SELECT count FROM active_conflicts) AS active_conflict_count,
    (SELECT count(*)::integer FROM output_rows) AS selected_count,
    jsonb_build_object(
      'hyperbaric', (SELECT count(*)::integer FROM output_rows WHERE payload->>'sample_stratum' = 'hyperbaric'),
      'hospital', (SELECT count(*)::integer FROM output_rows WHERE payload->>'sample_stratum' = 'hospital'),
      'random', (SELECT count(*)::integer FROM output_rows WHERE payload->>'sample_stratum' = 'random')
    ) AS sample_counts,
    COALESCE(
      (SELECT array_agg(entity_id ORDER BY entity_id) FROM output_rows),
      ARRAY[]::integer[]
    ) AS selected_entity_ids,
    ARRAY[]::integer[] AS inserted_entity_ids
`;

const POPULATION_SQL = `
  WITH ${ACTIVE_AND_ELIGIBLE_CTES}
  SELECT
    (SELECT count(*)::integer FROM active) AS active_count,
    (SELECT count(*)::integer FROM active WHERE hard_excluded) AS excluded_count,
    (SELECT count(*)::integer FROM eligible) AS eligible_count,
    jsonb_build_object(
      'hyperbaric', count(*) FILTER (WHERE sample_stratum = 'hyperbaric'),
      'hospital', count(*) FILTER (WHERE sample_stratum = 'hospital'),
      'random', count(*) FILTER (WHERE sample_stratum = 'random')
    ) AS population_by_stratum
  FROM stratified
`;

const SAMPLE_ROWS_SQL = `
  SELECT
    queue.id AS task_id,
    queue.entity_id,
    queue.status AS task_status,
    queue.payload,
    queue.result,
    location.name,
    organization.canonical_name AS organization_name,
    location.locality,
    location.region,
    location.country_code,
    COALESCE(source_data.source_slugs, ARRAY[]::text[]) AS source_slugs
  FROM fountain_ops.task_queue queue
  JOIN fountain.locations location ON location.id = queue.entity_id
  LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
  LEFT JOIN LATERAL (
    SELECT array_agg(source_slug ORDER BY source_slug) AS source_slugs
    FROM (
      SELECT DISTINCT source.slug AS source_slug
      FROM fountain.source_records source_record
      JOIN fountain.sources source ON source.id = source_record.source_id
      WHERE source_record.entity_type = 'location'
        AND source_record.entity_id = location.id
    ) distinct_sources
  ) source_data ON true
  WHERE queue.task_type = 'legitimacy_check'
    AND queue.entity_type = 'location'
    AND queue.payload->>'campaign' = $1
    AND queue.payload->>'prompt_version' = $2
  ORDER BY queue.id
`;

const SAMPLE_CALLS_SQL = `
  SELECT external_call.*
  FROM fountain_ops.external_calls external_call
  WHERE external_call.run_id = ANY($1::bigint[])
    AND external_call.call_type IN ('legitimacy_stage_1', 'legitimacy_stage_2')
  ORDER BY external_call.created_at, external_call.id
`;

export async function enqueueLegitimacyGateASample(
  {
    campaign = LEGITIMACY_GATE_A_CAMPAIGN,
    promptVersion = LEGITIMACY_PROMPT_VERSION,
    runId,
    seed = LEGITIMACY_SAMPLE_SEED,
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
    seed: nonemptyString(seed, "seed"),
    threshold: confidence(threshold),
    priority: integer(priority, "priority"),
    maxAttempts: positiveInteger(maxAttempts, "maxAttempts"),
    apply: Boolean(apply),
  };
  const params = normalized.apply
    ? [
      normalized.campaign,
      normalized.promptVersion,
      normalized.seed,
      normalized.threshold,
      normalized.priority,
      normalized.maxAttempts,
      normalized.runId,
      true,
    ]
    : [normalized.campaign, normalized.promptVersion, normalized.seed, normalized.threshold];
  const result = await executeQuery(
    query,
    normalized.apply ? ENQUEUE_SAMPLE_SQL : PREVIEW_SAMPLE_SQL,
    params,
  );
  const row = rowsFrom(result)[0];
  if (!row) throw new Error("Legitimacy Gate A sample query returned no result.");

  const sampleCounts = countObject(row.sample_counts);
  const selectedCount = number(row.selected_count);
  const existingCount = number(row.existing_count);
  const insertedCount = number(row.inserted_count);
  const activeConflictCount = number(row.active_conflict_count);
  if (!isExactSample(sampleCounts, selectedCount)) {
    const population = JSON.stringify(countObject(row.population_by_stratum));
    throw new Error(
      `Legitimacy Gate A requires an exact 50/50/200 sample; selected=${selectedCount}, `
      + `strata=${JSON.stringify(sampleCounts)}, population=${population}, `
      + `active_conflicts=${activeConflictCount}.`,
    );
  }
  if (normalized.apply && existingCount === 0 && insertedCount !== SAMPLE_TOTAL) {
    throw new Error(
      `Legitimacy Gate A enqueue was not atomic: expected ${SAMPLE_TOTAL} inserts, got ${insertedCount}.`,
    );
  }

  return {
    campaign: normalized.campaign,
    promptVersion: normalized.promptVersion,
    seed: normalized.seed,
    threshold: normalized.threshold,
    apply: normalized.apply,
    activeCount: number(row.active_count),
    excludedCount: number(row.excluded_count),
    eligibleCount: number(row.eligible_count),
    populationByStratum: countObject(row.population_by_stratum),
    sampleCounts,
    selectedCount,
    insertedCount,
    existingCount,
    activeConflictCount,
    reused: existingCount === SAMPLE_TOTAL,
    selectedEntityIds: integerArray(row.selected_entity_ids),
    insertedEntityIds: integerArray(row.inserted_entity_ids),
  };
}

export async function loadLegitimacyGateAReportData(
  {
    campaign = LEGITIMACY_GATE_A_CAMPAIGN,
    promptVersion = LEGITIMACY_PROMPT_VERSION,
    runIds,
  },
  { query = defaultQuery } = {},
) {
  const normalizedCampaign = nonemptyString(campaign, "campaign");
  const normalizedPromptVersion = nonemptyString(promptVersion, "promptVersion");
  const normalizedRunIds = nonemptyRunIds(runIds);
  const params = [normalizedCampaign, normalizedPromptVersion];
  // Keep these sequential so an injected pg Client (for a read-only
  // transaction or test) never receives overlapping query calls.
  const populationResult = await executeQuery(query, POPULATION_SQL, []);
  const sampleResult = await executeQuery(query, SAMPLE_ROWS_SQL, params);
  const callsResult = await executeQuery(query, SAMPLE_CALLS_SQL, [normalizedRunIds]);
  const populationRow = rowsFrom(populationResult)[0];
  if (!populationRow) throw new Error("Legitimacy Gate A population query returned no result.");

  const calls = rowsFrom(callsResult).map(normalizeExternalCall);
  const sampleRows = rowsFrom(sampleResult)
    .map(normalizeSampleRow)
    .sort(compareSampleRows);
  const populationByStratum = countObject(populationRow.population_by_stratum);
  const actual = summarizeActual(sampleRows, calls);
  const projection = projectByStratum(sampleRows, populationByStratum, actual);

  return {
    campaign: normalizedCampaign,
    promptVersion: normalizedPromptVersion,
    runIds: normalizedRunIds,
    activeCount: number(populationRow.active_count),
    excludedCount: number(populationRow.excluded_count),
    eligibleCount: number(populationRow.eligible_count),
    populationByStratum,
    sampleRows,
    classCounts: classCounts(sampleRows),
    sampleCounts: stratumCounts(sampleRows),
    actual,
    projection,
  };
}

export function renderLegitimacyGateAReport(data) {
  if (!data || typeof data !== "object") {
    throw new TypeError("renderLegitimacyGateAReport requires report data.");
  }
  const rows = Array.isArray(data.sampleRows) ? [...data.sampleRows].sort(compareSampleRows) : [];
  const counts = stratumCounts(rows);
  if (!isExactSample(counts, rows.length)) {
    throw new Error(`Gate A report requires the complete ${SAMPLE_TOTAL}-location sample.`);
  }
  const incomplete = rows.filter((row) => row.taskStatus !== "done" || row.class === "unclassified");
  if (incomplete.length > 0) {
    throw new Error(
      `Gate A report refuses ${incomplete.length} incomplete or unclassified sample row(s).`,
    );
  }
  const servingWriteAttempts = rows.filter((row) => row.servingWriteAttempted).length;
  if (servingWriteAttempts > 0) {
    throw new Error(`Gate A report refuses ${servingWriteAttempts} sample serving-write attempt(s).`);
  }

  const actual = data.actual || summarizeActual(rows, []);
  const projection = data.projection || projectByStratum(
    rows,
    countObject(data.populationByStratum),
    actual,
  );
  const classes = data.classCounts || classCounts(rows);
  const lines = [
    "# Pass 1 Legitimacy Triage — Gate A Sample Review",
    "",
    "**GATE A AWAITING APPROVAL**",
    "",
    `What was done: Classified a deterministic, mutually exclusive sample of ${rows.length} eligible active locations.`,
    "",
    `Evidence: ${formatInteger(data.activeCount)} active; ${formatInteger(data.excludedCount)} hard-excluded; ${formatInteger(data.eligibleCount)} eligible. Actual usage and weighted projections are below.`,
    "",
    "Deviations from rubric/plan: none. The unspecified website-cache TTL is seven days for both successes and failures.",
    "",
    "Open questions: Review the would-be suppressions first and approve or revise the rubric/threshold.",
    "",
    "## Step 0 housekeeping (pre-approved)",
    "",
    "- Archived and dropped exactly 28 formerly code-referenced `fountain_raw` hold tables: 178,143 rows, 54,673,408 source bytes, and five owned sequences.",
    "- Verified all 28 custom dumps with `pg_restore --list` and SHA-256; compressed payload total: 8,590,019 bytes.",
    "- Scratch-restored the two largest tables with exact row reconciliation: `final_closeout_offerings_backup_20260711` 100,535/100,535 and `taxonomy_final_corpus_20260711` 43,647/43,647.",
    "- Post-drop `fountain_raw`: 21 tables, 366,979 rows, five sequences, zero orphan sequences. All 11 unresolved workflow/review tables remain present.",
    "- Evidence: [Pass 1 Step 0 archive manifest](../../archive/db-dumps/fountain_raw_archive_20260711_pass1_step0/MANIFEST.md).",
    "",
    "## Execution safety",
    "",
    `- Drain run(s): ${data.runIds.map((runId) => `\`${runId}\``).join(", ")}.`,
    `- Queue reconciliation: ${formatInteger(rows.length)}/300 terminal classified rows; 0 serving-write attempts in task results.`,
    "- Gate A classification wrote only `fountain_ops` run/call/queue evidence and the local website cache; suppression remains gated to Gate B.",
    "",
    "## Sample composition",
    "",
    "| Stratum | Population | Sample |",
    "| --- | ---: | ---: |",
  ];
  for (const stratum of ["hyperbaric", "hospital", "random"]) {
    lines.push(`| ${stratum} | ${formatInteger(data.populationByStratum?.[stratum])} | ${formatInteger(counts[stratum])} |`);
  }
  const hospitalCountries = new Set(
    rows
      .filter((row) => row.sampleStratum === "hospital")
      .map((row) => row.countryCode || "ZZ"),
  ).size;
  lines.push("", `The 50-row hospital-flavored oversample spans ${hospitalCountries} countries.`);

  lines.push(
    "",
    "## Class counts",
    "",
    "| Class | Count |",
    "| --- | ---: |",
  );
  for (const className of CLASS_ORDER.keys()) {
    if (classes[className]) lines.push(`| ${className} | ${formatInteger(classes[className])} |`);
  }

  lines.push(
    "",
    "## Observed usage",
    "",
    "| Metric | Actual |",
    "| --- | ---: |",
    `| External calls | ${formatInteger(actual.calls)} |`,
    `| Stage 1 calls | ${formatInteger(actual.stage1Calls)} |`,
    `| Stage 2 calls | ${formatInteger(actual.stage2Calls)} |`,
    `| Input tokens | ${formatInteger(actual.inputTokens)} |`,
    `| Output tokens | ${formatInteger(actual.outputTokens)} |`,
    `| Estimated spend | ${formatUsd(actual.spendUsd)} |`,
    `| Stage 2 candidates | ${formatInteger(actual.stage2Candidates)} |`,
    `| Website fetch attempts | ${formatInteger(actual.websiteFetches)} |`,
    `| Cache hits | ${formatInteger(actual.cacheHits)} |`,
    `| Network fetches | ${formatInteger(actual.networkFetches)} |`,
    `| Fetch failures | ${formatInteger(actual.fetchFailures)} |`,
    `| No website | ${formatInteger(actual.noWebsite)} |`,
  );

  lines.push(
    "",
    "## Stratum-weighted full-run projection",
    "",
    "The projection weights each mutually exclusive sample stratum back to its eligible population; it does not treat the oversample as a simple random sample.",
    "",
    "| Metric | Projected |",
    "| --- | ---: |",
    `| Eligible locations | ${formatInteger(data.eligibleCount)} |`,
    `| Input tokens | ${formatProjected(projection.inputTokens)} |`,
    `| Output tokens | ${formatProjected(projection.outputTokens)} |`,
    `| Total estimated spend | ${formatUsd(projection.spendUsd)} |`,
    `| Remaining estimated spend after sample | ${formatUsd(projection.remainingSpendUsd)} |`,
    `| Stage 2 candidates | ${formatProjected(projection.stage2Candidates)} |`,
    `| Website fetch attempts | ${formatProjected(projection.websiteFetches)} |`,
    `| Cache hits | ${formatProjected(projection.cacheHits)} |`,
    `| Network fetches | ${formatProjected(projection.networkFetches)} |`,
  );

  lines.push(
    "",
    "## Full sample",
    "",
    "Would-be suppressions (`junk`, then `plain_hospital`) are sorted first.",
    "",
    "| Name | Locality | Source | Stratum | Class | Confidence | Rationale |",
    "| --- | --- | --- | --- | --- | ---: | --- |",
  );
  for (const row of rows) {
    lines.push([
      escapeCell(row.name || "—"),
      escapeCell(localityLabel(row)),
      escapeCell(row.source || "—"),
      escapeCell(row.sampleStratum || "—"),
      escapeCell(row.class || "unclassified"),
      formatConfidence(row.confidence),
      escapeCell(row.rationale || "—"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("", "**STOP — AWAITING APPROVAL.**");
  return `${lines.join("\n")}\n`;
}

function normalizeSampleRow(row) {
  const payload = object(row.payload);
  const result = object(row.result);
  const stages = object(result.stages);
  const classification = firstObject(result.final, result.classification, result);
  const stage1 = firstObject(
    stages.stage_1,
    stages.stage1,
    result.stage_1,
    result.stage1,
    payload.stage_1,
    payload.stage1,
  );
  const stage2 = firstObject(stages.stage_2, stages.stage2, result.stage_2, result.stage2);
  const stage2Classification = firstObject(stage2.classification, stage2);
  const website = firstObject(result.website, payload.website, stage2.website);
  const threshold = finiteNumber(payload.threshold) ?? 0.8;
  const explicitStage2Needed = optionalBoolean(
    result.stage_2_needed,
    result.stage2_needed,
    website.stage_2_needed,
    website.stage2_needed,
  );
  const stage1Confidence = finiteNumber(stage1.confidence);
  const stage2Needed = explicitStage2Needed ?? (
    Object.keys(stage2).length > 0
    || (stage1Confidence != null && stage1Confidence < threshold)
  );
  const explicitWebsiteFetch = optionalBoolean(
    website.fetch_attempted,
    website.fetchAttempted,
    result.website_fetch_attempted,
    result.websiteFetchAttempted,
  );
  const cacheStatus = String(website.cache_status || website.cacheStatus || "").toLowerCase();
  const websiteFetches = explicitWebsiteFetch ?? (
    Boolean(cacheStatus) && cacheStatus !== "not_applicable"
  );
  const explicitCacheHit = optionalBoolean(
    website.cache_hit,
    website.cacheHit,
    result.cache_hit,
    result.cacheHit,
  );
  const cacheHit = explicitCacheHit ?? cacheStatus === "hit_fresh";
  const outcome = String(website.outcome || website.status || "").toLowerCase();
  const fetchFailure = firstBoolean(
    website.fetch_failed,
    website.fetchFailed,
    [
      "failed",
      "fetch_failed",
      "error",
      "timeout",
      "network_error",
      "http_error",
      "robots_disallowed",
      "unsupported_content_type",
    ].includes(outcome),
  );
  const noWebsite = firstBoolean(
    website.no_website,
    website.noWebsite,
    result.no_website,
    result.noWebsite,
    outcome === "no_website",
  );
  const sourceSlugs = stringArray(row.source_slugs);
  return {
    taskId: String(row.task_id),
    entityId: number(row.entity_id),
    taskStatus: String(row.task_status || "unknown"),
    sampleStratum: String(payload.sample_stratum || "unknown"),
    name: row.name || row.organization_name || "",
    locality: row.locality || "",
    region: row.region || "",
    countryCode: row.country_code || "",
    sourceSlugs,
    source: sourceSlugs.join(", "),
    class: normalizedClass(classification.class || classification.catalog_class),
    confidence: finiteNumber(classification.confidence),
    rationale: String(classification.rationale || ""),
    stage2Needed,
    websiteFetches,
    cacheHit,
    networkFetch: cacheStatus === "miss_fetched" || (websiteFetches && !cacheHit),
    fetchFailure,
    noWebsite,
    servingWriteAttempted: Boolean(object(result.serving_write).attempted),
    calls: [
      allocatedCall(stage1, "stage_1", row.entity_id),
      allocatedCall(stage2Classification, "stage_2", row.entity_id),
    ].filter(Boolean),
  };
}

function summarizeActual(rows, calls) {
  const tokens = calls.reduce((total, call) => ({
    input: total.input + call.inputTokens,
    output: total.output + call.outputTokens,
  }), { input: 0, output: 0 });
  return {
    calls: calls.length,
    stage1Calls: calls.filter((call) => call.stage === "stage_1").length,
    stage2Calls: calls.filter((call) => call.stage === "stage_2").length,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    spendUsd: calls.reduce((sum, call) => sum + call.costUsd, 0),
    stage2Candidates: rows.filter((row) => row.stage2Needed).length,
    websiteFetches: rows.filter((row) => row.websiteFetches).length,
    cacheHits: rows.filter((row) => row.cacheHit).length,
    networkFetches: rows.filter((row) => row.networkFetch).length,
    fetchFailures: rows.filter((row) => row.fetchFailure).length,
    noWebsite: rows.filter((row) => row.noWebsite).length,
  };
}

function projectByStratum(rows, populationByStratum, actual) {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    spendUsd: 0,
    stage2Candidates: 0,
    websiteFetches: 0,
    cacheHits: 0,
    networkFetches: 0,
    byStratum: {},
  };
  for (const stratum of ["hyperbaric", "hospital", "random"]) {
    const sampled = rows.filter((row) => row.sampleStratum === stratum);
    const population = number(populationByStratum?.[stratum]);
    const weight = sampled.length > 0 ? population / sampled.length : 0;
    const calls = sampled.flatMap((row) => row.calls || []);
    const observed = {
      inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
      outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
      spendUsd: calls.reduce((sum, call) => sum + call.costUsd, 0),
      stage2Candidates: sampled.filter((row) => row.stage2Needed).length,
      websiteFetches: sampled.filter((row) => row.websiteFetches).length,
      cacheHits: sampled.filter((row) => row.cacheHit).length,
      networkFetches: sampled.filter((row) => row.networkFetch).length,
    };
    const projected = Object.fromEntries(
      Object.entries(observed).map(([key, value]) => [key, value * weight]),
    );
    totals.byStratum[stratum] = { population, sample: sampled.length, weight, ...projected };
    for (const key of Object.keys(observed)) totals[key] += projected[key];
  }
  totals.remainingSpendUsd = Math.max(0, totals.spendUsd - number(actual?.spendUsd));
  return totals;
}

function normalizeExternalCall(call) {
  const tokens = object(call.tokens);
  const callType = String(call.call_type || "").toLowerCase();
  return {
    id: String(call.id),
    entityId: number(call.entity_id),
    stage: callType.includes("stage_2") || callType.includes("stage2") ? "stage_2"
      : callType.includes("stage_1") || callType.includes("stage1") ? "stage_1"
        : "other",
    status: String(call.status || "unknown"),
    inputTokens: number(tokens.prompt_tokens ?? tokens.input_tokens ?? tokens.input),
    outputTokens: number(tokens.completion_tokens ?? tokens.output_tokens ?? tokens.output),
    costUsd: number(call.cost_estimate_usd),
  };
}

function allocatedCall(evidence, stage, entityId) {
  const value = object(evidence);
  const tokens = object(value.allocated_tokens ?? value.allocatedTokens);
  const externalCallId = value.external_call_id ?? value.externalCallId;
  const cost = finiteNumber(value.allocated_cost_usd ?? value.allocatedCostUsd);
  if (externalCallId == null && Object.keys(tokens).length === 0 && cost == null) return null;
  return {
    id: externalCallId == null ? `${stage}:${entityId}` : String(externalCallId),
    entityId: number(entityId),
    stage,
    status: "allocated",
    inputTokens: number(tokens.prompt_tokens ?? tokens.input_tokens ?? tokens.input),
    outputTokens: number(tokens.completion_tokens ?? tokens.output_tokens ?? tokens.output),
    costUsd: cost ?? 0,
  };
}

function classCounts(rows) {
  const counts = {};
  for (const row of rows) counts[row.class] = (counts[row.class] || 0) + 1;
  return counts;
}

function stratumCounts(rows) {
  const counts = { hyperbaric: 0, hospital: 0, random: 0 };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.sampleStratum)) counts[row.sampleStratum] += 1;
  }
  return counts;
}

function compareSampleRows(left, right) {
  const classDifference = (CLASS_ORDER.get(left.class) ?? 99) - (CLASS_ORDER.get(right.class) ?? 99);
  if (classDifference) return classDifference;
  return String(left.name || "").localeCompare(String(right.name || ""))
    || left.entityId - right.entityId;
}

function normalizedClass(value) {
  const className = String(value || "unclassified").trim();
  return CLASS_ORDER.has(className) ? className : "unclassified";
}

function isExactSample(counts, total) {
  return total === SAMPLE_TOTAL
    && Object.entries(LEGITIMACY_SAMPLE_COUNTS)
      .every(([stratum, expected]) => number(counts[stratum]) === expected);
}

function countObject(value) {
  const source = object(value);
  return {
    hyperbaric: number(source.hyperbaric),
    hospital: number(source.hospital),
    random: number(source.random),
  };
}

function localityLabel(row) {
  return [row.locality, row.region, row.countryCode].filter(Boolean).join(", ") || "—";
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim();
}

function formatConfidence(value) {
  const numeric = finiteNumber(value);
  return numeric == null ? "—" : numeric.toFixed(2);
}

function formatInteger(value) {
  return Math.round(number(value)).toLocaleString("en-US");
}

function formatProjected(value) {
  return number(value).toLocaleString("en-US", { maximumFractionDigits: 1 });
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

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return false;
}

function optionalBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function integerArray(value) {
  return Array.isArray(value) ? value.map((item) => number(item)).filter(Number.isInteger) : [];
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
    throw new TypeError("runIds must contain every Gate A drain/resume run id.");
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
