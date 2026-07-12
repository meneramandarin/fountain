import { query as defaultQuery } from "./db.mjs";

const UNSAFE_PREDICATE = /;|--|\/\*|\*\//;
const STATEMENT_KEYWORD = /\b(select|insert|update|delete|merge|copy|call|do|create|alter|drop|truncate|grant|revoke|execute|vacuum|analyze|refresh|set|reset|listen|notify|load)\b/i;
const FUNCTION_CALL = /\b([a-z_][a-z0-9_.]*)\s*\(/gi;
const SAFE_PAREN_KEYWORDS = new Set(["in", "any", "all"]);
const NUL_CHARACTER = String.fromCharCode(0);
const NUL_REPLACEMENT = "\uFFFD";

export function validateWherePredicate(predicate) {
  const value = String(predicate || "").trim();
  if (!value) throw new Error("--where requires a non-empty SQL predicate.");
  if (UNSAFE_PREDICATE.test(value)) {
    throw new Error("--where must be a single SQL predicate without semicolons or comments.");
  }
  const structural = value.replace(/'(?:''|[^'])*'/g, "''");
  if (STATEMENT_KEYWORD.test(structural)) {
    throw new Error("--where may not contain SQL statements or subqueries.");
  }
  FUNCTION_CALL.lastIndex = 0;
  for (const match of structural.matchAll(FUNCTION_CALL)) {
    if (!SAFE_PAREN_KEYWORDS.has(match[1].toLowerCase())) {
      throw new Error("--where may not invoke SQL functions; use columns, literals, and operators only.");
    }
  }
  return value;
}

export async function previewEnqueue({ where, limit = null }, options = {}) {
  const query = options.query || defaultQuery;
  const predicate = validateWherePredicate(where);
  const limitClause = limit == null ? "" : "LIMIT $1";
  const params = limit == null ? [] : [positiveInteger(limit, "limit")];
  const result = await query(
    `
      WITH candidates AS (
        SELECT id
        FROM fountain.locations
        WHERE (${predicate})
        ORDER BY id
        ${limitClause}
      )
      SELECT count(*)::integer AS count,
             COALESCE((array_agg(id ORDER BY id))[1:10], ARRAY[]::integer[]) AS sample_ids
      FROM candidates
    `,
    params,
  );
  return {
    count: Number(result.rows[0]?.count || 0),
    sampleIds: result.rows[0]?.sample_ids || [],
  };
}

export async function enqueueTasks({
  taskType,
  where,
  entityType = "location",
  priority = 100,
  limit = null,
  runId,
  maxAttempts = 3,
}, options = {}) {
  const query = options.query || defaultQuery;
  const predicate = validateWherePredicate(where);
  const params = [
    taskType,
    entityType,
    integer(priority, "priority"),
    positiveInteger(maxAttempts, "maxAttempts"),
    runId,
  ];
  const limitClause = limit == null ? "" : `LIMIT $${params.push(positiveInteger(limit, "limit"))}`;
  const result = await query(
    `
      WITH candidates AS (
        SELECT id
        FROM fountain.locations
        WHERE (${predicate})
        ORDER BY id
        ${limitClause}
      ), inserted AS (
        INSERT INTO fountain_ops.task_queue
          (task_type, entity_type, entity_id, priority, max_attempts, run_id)
        SELECT $1, $2, id, $3, $4, $5
        FROM candidates
        ON CONFLICT (task_type, entity_type, entity_id)
          WHERE status IN ('pending', 'claimed')
          DO NOTHING
        RETURNING id, entity_id
      )
      SELECT
        (SELECT count(*)::integer FROM candidates) AS selected_count,
        count(*)::integer AS inserted_count,
        COALESCE(array_agg(entity_id ORDER BY entity_id) FILTER (WHERE entity_id IS NOT NULL), ARRAY[]::integer[]) AS inserted_entity_ids
      FROM inserted
    `,
    params,
  );
  return {
    selectedCount: Number(result.rows[0]?.selected_count || 0),
    insertedCount: Number(result.rows[0]?.inserted_count || 0),
    insertedEntityIds: result.rows[0]?.inserted_entity_ids || [],
  };
}

export async function previewDrain({
  taskType,
  limit = 10,
  stage = null,
  campaign = null,
  promptVersion = null,
}, options = {}) {
  const query = options.query || defaultQuery;
  const normalizedStage = optionalStage(stage);
  const normalizedCampaign = optionalPayloadFilter(campaign, "campaign");
  const normalizedPromptVersion = optionalPayloadFilter(promptVersion, "promptVersion");
  const params = [taskType];
  const stageClause = normalizedStage === null
    ? ""
    : `AND payload->>'stage' = $${params.push(normalizedStage)}`;
  const campaignClause = normalizedCampaign === null
    ? ""
    : `AND payload->>'campaign' = $${params.push(normalizedCampaign)}`;
  const promptVersionClause = normalizedPromptVersion === null
    ? ""
    : `AND payload->>'prompt_version' = $${params.push(normalizedPromptVersion)}`;
  const limitParameter = `$${params.push(positiveInteger(limit, "limit"))}`;
  const result = await query(
    `
      SELECT id, task_type, entity_type, entity_id, priority, payload, attempts, max_attempts
      FROM fountain_ops.task_queue
      WHERE task_type = $1 AND status = 'pending' AND attempts < max_attempts
        ${stageClause}
        ${campaignClause}
        ${promptVersionClause}
      ORDER BY priority, id
      LIMIT ${limitParameter}
    `,
    params,
  );
  return result.rows;
}

export async function claimTask({
  taskType,
  workerId,
  runId,
  stage = null,
  campaign = null,
  promptVersion = null,
}, options = {}) {
  const query = options.query || defaultQuery;
  const normalizedStage = optionalStage(stage);
  const normalizedCampaign = optionalPayloadFilter(campaign, "campaign");
  const normalizedPromptVersion = optionalPayloadFilter(promptVersion, "promptVersion");
  const params = [taskType, workerId, runId];
  const stageClause = normalizedStage === null
    ? ""
    : `AND payload->>'stage' = $${params.push(normalizedStage)}`;
  const campaignClause = normalizedCampaign === null
    ? ""
    : `AND payload->>'campaign' = $${params.push(normalizedCampaign)}`;
  const promptVersionClause = normalizedPromptVersion === null
    ? ""
    : `AND payload->>'prompt_version' = $${params.push(normalizedPromptVersion)}`;
  const result = await query(
    `
      WITH next_task AS (
        SELECT id
        FROM fountain_ops.task_queue
        WHERE task_type = $1
          AND status = 'pending'
          AND attempts < max_attempts
          ${stageClause}
          ${campaignClause}
          ${promptVersionClause}
        ORDER BY priority, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE fountain_ops.task_queue q
      SET status = 'claimed',
          attempts = q.attempts + 1,
          claimed_by = $2,
          claimed_at = now(),
          run_id = $3,
          error = NULL,
          updated_at = now()
      FROM next_task
      WHERE q.id = next_task.id
      RETURNING q.*
    `,
    params,
  );
  return result.rows[0] || null;
}

export async function claimTasks({
  taskType,
  workerId,
  runId,
  limit,
  stage = null,
  campaign = null,
  promptVersion = null,
}, options = {}) {
  const query = options.query || defaultQuery;
  const normalizedStage = optionalStage(stage);
  const normalizedCampaign = optionalPayloadFilter(campaign, "campaign");
  const normalizedPromptVersion = optionalPayloadFilter(promptVersion, "promptVersion");
  const batchSize = positiveInteger(limit, "limit");
  const params = [taskType, workerId, runId, normalizedStage, batchSize];
  const campaignClause = normalizedCampaign === null
    ? ""
    : `AND payload->>'campaign' = $${params.push(normalizedCampaign)}`;
  const promptVersionClause = normalizedPromptVersion === null
    ? ""
    : `AND payload->>'prompt_version' = $${params.push(normalizedPromptVersion)}`;
  const result = await query(
    `
      WITH next_tasks AS (
        SELECT id, priority
        FROM fountain_ops.task_queue
        WHERE task_type = $1
          AND status = 'pending'
          AND attempts < max_attempts
          AND ($4::text IS NULL OR payload->>'stage' = $4)
          ${campaignClause}
          ${promptVersionClause}
        ORDER BY priority, id
        FOR UPDATE SKIP LOCKED
        LIMIT $5
      ), claimed AS (
        UPDATE fountain_ops.task_queue q
        SET status = 'claimed',
            attempts = q.attempts + 1,
            claimed_by = $2,
            claimed_at = now(),
            run_id = $3,
            error = NULL,
            updated_at = now()
        FROM next_tasks
        WHERE q.id = next_tasks.id
        RETURNING q.*
      )
      SELECT claimed.*
      FROM claimed
      JOIN next_tasks ON next_tasks.id = claimed.id
      ORDER BY next_tasks.priority, next_tasks.id
    `,
    params,
  );
  return result.rows;
}

export async function transitionTaskStage({ taskId, workerId, runId, payload }, options = {}) {
  const query = options.query || defaultQuery;
  const normalizedPayload = stagePayload(payload);
  const updated = await query(
    `
      UPDATE fountain_ops.task_queue
      SET status = 'pending',
          payload = $4::jsonb,
          attempts = 0,
          claimed_by = NULL,
          claimed_at = NULL,
          result = NULL,
          error = NULL,
          updated_at = now()
      WHERE id = $1 AND status = 'claimed' AND claimed_by = $2 AND run_id = $3
      RETURNING *
    `,
    [taskId, workerId, runId, stringifyJsonb(normalizedPayload)],
  );
  if (!updated.rows[0]) throw new Error(`Worker ${workerId} no longer owns task ${taskId}.`);
  return updated.rows[0];
}

export async function completeTask({ taskId, workerId, runId, result }, options = {}) {
  const query = options.query || defaultQuery;
  const updated = await query(
    `
      UPDATE fountain_ops.task_queue
      SET status = 'done', result = $4::jsonb, error = NULL, updated_at = now()
      WHERE id = $1 AND status = 'claimed' AND claimed_by = $2 AND run_id = $3
      RETURNING *
    `,
    [taskId, workerId, runId, stringifyJsonb(result ?? {})],
  );
  if (!updated.rows[0]) throw new Error(`Worker ${workerId} no longer owns task ${taskId}.`);
  return updated.rows[0];
}

export async function failTask({ taskId, workerId, runId, error, retryable = true }, options = {}) {
  const query = options.query || defaultQuery;
  const updated = await query(
    `
      UPDATE fountain_ops.task_queue
      SET status = CASE WHEN $5 AND attempts < max_attempts THEN 'pending' ELSE 'failed' END,
          claimed_by = CASE WHEN $5 AND attempts < max_attempts THEN NULL ELSE claimed_by END,
          claimed_at = CASE WHEN $5 AND attempts < max_attempts THEN NULL ELSE claimed_at END,
          error = $4,
          updated_at = now()
      WHERE id = $1 AND status = 'claimed' AND claimed_by = $2 AND run_id = $3
      RETURNING *
    `,
    [taskId, workerId, runId, String(error?.stack || error?.message || error).slice(0, 8_000), Boolean(retryable)],
  );
  if (!updated.rows[0]) throw new Error(`Worker ${workerId} no longer owns task ${taskId}.`);
  return updated.rows[0];
}

export async function reapStaleClaims({ taskType = null, timeoutMinutes = 30 }, options = {}) {
  const query = options.query || defaultQuery;
  const result = await query(
    `
      UPDATE fountain_ops.task_queue
      SET status = CASE WHEN attempts < max_attempts THEN 'pending' ELSE 'failed' END,
          claimed_by = CASE WHEN attempts < max_attempts THEN NULL ELSE claimed_by END,
          claimed_at = CASE WHEN attempts < max_attempts THEN NULL ELSE claimed_at END,
          error = 'stale_claim_reaped',
          updated_at = now()
      WHERE status = 'claimed'
        AND claimed_at < now() - make_interval(mins => $1)
        AND ($2::text IS NULL OR task_type = $2)
      RETURNING id, status
    `,
    [positiveInteger(timeoutMinutes, "timeoutMinutes"), taskType],
  );
  return result.rows;
}

export async function taskCountsForRun(runId, options = {}) {
  const query = options.query || defaultQuery;
  const result = await query(
    `
      SELECT status, count(*)::integer AS count
      FROM fountain_ops.task_queue
      WHERE run_id = $1
      GROUP BY status
      ORDER BY status
    `,
    [runId],
  );
  return Object.fromEntries(result.rows.map((row) => [row.status, Number(row.count)]));
}

export async function taskBacklogSummary(taskType, options = {}) {
  const query = options.query || defaultQuery;
  const result = await query(
    `
      SELECT status, count(*)::integer AS count
      FROM fountain_ops.task_queue
      WHERE task_type = $1
      GROUP BY status
      ORDER BY status
    `,
    [taskType],
  );
  return Object.fromEntries(result.rows.map((row) => [row.status, Number(row.count)]));
}

export async function queueRowsForRun(runId, options = {}) {
  const query = options.query || defaultQuery;
  const result = await query(
    `
      SELECT *
      FROM fountain_ops.task_queue
      WHERE run_id = $1
      ORDER BY id
    `,
    [runId],
  );
  return result.rows;
}

function integer(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

function positiveInteger(value, name) {
  const parsed = integer(value, name);
  if (parsed <= 0) throw new Error(`${name} must be greater than zero.`);
  return parsed;
}

function optionalStage(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("stage must be a non-empty string when provided.");
  }
  return value.trim();
}

function optionalPayloadFilter(value, name) {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string when provided.`);
  }
  return value.trim();
}

function stagePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("payload must be an object.");
  }
  const stage = optionalStage(value.stage);
  if (stage === null) {
    throw new Error("payload.stage is required for a stage transition.");
  }
  return { ...value, stage };
}

function stringifyJsonb(value) {
  return JSON.stringify(value, (_key, candidate) => {
    if (typeof candidate === "string") return replaceNul(candidate);
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;

    const sanitized = Object.create(null);
    for (const [key, nestedValue] of Object.entries(candidate)) {
      sanitized[replaceNul(key)] = nestedValue;
    }
    return sanitized;
  });
}

function replaceNul(value) {
  return value.includes(NUL_CHARACTER)
    ? value.split(NUL_CHARACTER).join(NUL_REPLACEMENT)
    : value;
}
