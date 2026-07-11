const WRITABLE_VERIFICATIONS = new Set(["unverified", "agent_verified"]);
const PROTECTED_VERIFICATIONS = new Set(["human_verified", "owner_verified"]);
const VALID_VERIFICATIONS = new Set([
  ...WRITABLE_VERIFICATIONS,
  ...PROTECTED_VERIFICATIONS,
]);

const DIAGNOSTIC_QUERY = `
  SELECT verification, locked, verified_by, verified_at, source_note
  FROM fountain_ops.field_status
  WHERE entity_type = $1
    AND entity_id = $2
    AND field = $3
`;

const ADVISORY_LOCK_QUERY = `
  SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))
`;

const LOCKED_STATUS_QUERY = `
  SELECT verification, locked, verified_by, verified_at, source_note
  FROM fountain_ops.field_status
  WHERE entity_type = $1
    AND entity_id = $2
    AND field = $3
  FOR UPDATE
`;

const UPSERT_STATUS_QUERY = `
  INSERT INTO fountain_ops.field_status (
    entity_type,
    entity_id,
    field,
    verification,
    verified_by,
    verified_at
  )
  VALUES ($1, $2, $3, $4, $5, now())
  ON CONFLICT (entity_type, entity_id, field) DO UPDATE
  SET verification = EXCLUDED.verification,
      verified_by = EXCLUDED.verified_by,
      verified_at = EXCLUDED.verified_at
`;

let defaultDbPromise;
let savepointSequence = 0;

/**
 * Build a ledger API with optional database adapters. Supplying adapters keeps
 * unit tests independent from a live database; production calls use db.mjs.
 */
export function createLedger(dependencies = {}) {
  const diagnosticQuery = dependencies.query || queryWithDefaultDb;
  const withTransaction = dependencies.withTransaction || transactWithDefaultDb;

  /**
   * Read-only preflight helper. Its result must never be treated as continuing
   * authorization: recordWrite rechecks the guard under a transaction lock.
   */
  async function canWrite(entity, field) {
    const key = normalizeKey(entity, field);
    const result = await diagnosticQuery(DIAGNOSTIC_QUERY, key.params);
    return guardReason(result.rows[0] || null) === null;
  }

  /**
   * Run a mutation and its field-status update as one guarded transaction.
   * The advisory lock serializes the absent-row case; FOR UPDATE also protects
   * an existing ledger row from ordinary concurrent row writers.
   */
  async function recordWrite({
    entity,
    field,
    verification,
    actor,
    mutate,
    tx,
  } = {}) {
    const key = normalizeKey(entity, field);
    const normalizedVerification = normalizeVerification(verification);
    const normalizedActor = normalizeNonemptyText(actor, "actor");

    if (typeof mutate !== "function") {
      throw new TypeError("mutate must be a function");
    }

    const work = (transaction) => guardedMutation(transaction, {
      key,
      verification: normalizedVerification,
      actor: normalizedActor,
      mutate,
    });

    if (tx !== undefined && tx !== null) {
      assertTransaction(tx);
      return withSavepoint(tx, work);
    }

    return withTransaction(work);
  }

  return { canWrite, recordWrite };
}

const defaultLedger = createLedger();

export const canWrite = defaultLedger.canWrite;
export const recordWrite = defaultLedger.recordWrite;

async function guardedMutation(transaction, { key, verification, actor, mutate }) {
  assertTransaction(transaction);

  await transaction.query(ADVISORY_LOCK_QUERY, [key.advisoryKey]);

  const currentResult = await transaction.query(LOCKED_STATUS_QUERY, key.params);
  const reason = guardReason(currentResult.rows[0] || null);
  if (reason !== null) {
    return { written: false, reason };
  }

  const result = await mutate(transaction);

  await transaction.query(UPSERT_STATUS_QUERY, [
    ...key.params,
    verification,
    actor,
  ]);

  return { written: true, result };
}

function guardReason(row) {
  if (!row) {
    return null;
  }
  if (row.locked === true) {
    return "locked";
  }
  if (PROTECTED_VERIFICATIONS.has(row.verification)) {
    return row.verification;
  }
  if (WRITABLE_VERIFICATIONS.has(row.verification)) {
    return null;
  }
  // Fail closed if a legacy or corrupted value bypasses the database CHECK.
  return "verification_not_writable";
}

function normalizeKey(entity, field) {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
    throw new TypeError("entity must be an object");
  }

  const entityType = normalizeNonemptyText(
    entity.entity_type ?? entity.entityType ?? entity.type,
    "entity.entity_type",
  );
  const entityId = entity.entity_id ?? entity.entityId ?? entity.id;
  if (!Number.isInteger(entityId)) {
    throw new TypeError("entity.entity_id must be an integer");
  }

  const normalizedField = normalizeNonemptyText(field, "field");
  const params = [entityType, entityId, normalizedField];

  return {
    params,
    // JSON encoding is unambiguous even when names contain separators.
    advisoryKey: JSON.stringify(params),
  };
}

function normalizeVerification(verification) {
  if (typeof verification !== "string" || !VALID_VERIFICATIONS.has(verification)) {
    throw new TypeError(
      `verification must be one of: ${[...VALID_VERIFICATIONS].join(", ")}`,
    );
  }
  return verification;
}

function normalizeNonemptyText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function assertTransaction(transaction) {
  if (!transaction || typeof transaction.query !== "function") {
    throw new TypeError("tx must expose query(sql, params)");
  }
}

async function withSavepoint(transaction, work) {
  const savepoint = `fountain_ledger_${++savepointSequence}`;
  await transaction.query(`SAVEPOINT ${savepoint}`);
  try {
    const result = await work(transaction);
    await transaction.query(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    try {
      await transaction.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await transaction.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Ledger write failed and its savepoint could not be rolled back",
      );
    }
    throw error;
  }
}

async function queryWithDefaultDb(sql, params) {
  const db = await loadDefaultDb();
  return db.query(sql, params);
}

async function transactWithDefaultDb(fn) {
  const db = await loadDefaultDb();
  return db.withTransaction(fn);
}

function loadDefaultDb() {
  defaultDbPromise ||= import("./db.mjs");
  return defaultDbPromise;
}
