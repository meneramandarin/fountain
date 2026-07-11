import "../../scripts/lib/pipeline-env.mjs";

import process from "node:process";
import pg from "pg";

import {
  assertEnvLocalGitignored,
  getDatabaseUrl,
} from "../../scripts/lib/pipeline-env.mjs";

const { Pool } = pg;

let sharedPool;

export function getPool(options = {}) {
  if (options.pool) return options.pool;
  if (!sharedPool) {
    assertEnvLocalGitignored();
    const connectionString = options.connectionString || getDatabaseUrl();
    if (!connectionString) {
      throw new Error("Missing DATABASE_URL or compatible Postgres connection variable.");
    }
    sharedPool = new Pool({
      connectionString: normalizePostgresConnectionString(connectionString),
      max: integerFromEnv("PIPELINE_DB_POOL_MAX", 10),
      idleTimeoutMillis: integerFromEnv("PIPELINE_DB_IDLE_TIMEOUT_MS", 30_000),
      connectionTimeoutMillis: integerFromEnv("PIPELINE_DB_CONNECT_TIMEOUT_MS", 15_000),
      application_name: "fountain_pipeline",
    });
  }
  return sharedPool;
}

export function normalizePostgresConnectionString(value) {
  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return value;
  }
}

export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

export async function withClient(operation, options = {}) {
  const pool = options.pool || getPool();
  const client = await pool.connect();
  try {
    return await operation(client);
  } finally {
    client.release();
  }
}

export async function withTransaction(operation, options = {}) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }, options);
}

export async function setMutationActor(client, { actorId, actorLabel }) {
  if (!client?.query) throw new Error("setMutationActor requires a connected transaction client.");
  if (!actorId || !actorLabel) throw new Error("actorId and actorLabel are required.");
  return client.query("SELECT fountain.set_mutation_actor($1::uuid, $2)", [actorId, actorLabel]);
}

export async function closePool() {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
}

function integerFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
