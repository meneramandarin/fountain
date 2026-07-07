import pg from "pg";

const { Pool, types } = pg;

types.setTypeParser(20, (value) => Number(value));

let postgresPool: pg.Pool | null = null;
let loggedBackend = false;

function postgresConnectionString() {
  return normalizePostgresConnectionString(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function databaseBackend() {
  if (!postgresConnectionString()) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required. The app no longer falls back to canonical.db.");
  }
  return "postgres";
}

function logBackend() {
  if (!loggedBackend) {
    loggedBackend = true;
    console.log("Using postgres directory database");
  }
}

function postgresSchema() {
  const schema = process.env.POSTGRES_SCHEMA || "fountain";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error(`Unsafe POSTGRES_SCHEMA value: ${schema}`);
  }
  return schema;
}

function getPostgresPool() {
  if (!postgresPool) {
    const connectionString = postgresConnectionString();
    if (!connectionString) {
      throw new Error("DATABASE_URL or POSTGRES_URL is required for Postgres database backend.");
    }
    postgresPool = new Pool({
      connectionString,
      max: Number.parseInt(process.env.POSTGRES_POOL_MAX || "5", 10),
    });
  }
  return postgresPool;
}

function normalizePostgresConnectionString(connectionString: string | undefined) {
  if (!connectionString) {
    return connectionString;
  }
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function isPostgres() {
  databaseBackend();
  return true;
}

export async function hasTable(tableName: string) {
  const result = await rows<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ?
    ) AS exists
  `,
    [tableName],
  );
  return Boolean(result[0]?.exists);
}

export async function rows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  logBackend();
  const query = toPostgresQuery(sql);
  const result = await queryPostgres(query, params);
  return result.rows as T[];
}

export async function row<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  logBackend();
  const query = toPostgresQuery(sql);
  const result = await queryPostgres(query, params);
  return result.rows[0] as T | undefined;
}

async function queryPostgres(sql: string, params: unknown[]) {
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO ${postgresSchema()}, public`);
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failures; the original query error is more useful.
    }
    throw error;
  } finally {
    client.release();
  }
}

function toPostgresQuery(sql: string) {
  let index = 0;
  let inSingleQuote = false;
  let output = "";

  for (let position = 0; position < sql.length; position += 1) {
    const char = sql[position];
    const next = sql[position + 1];

    if (char === "'") {
      output += char;
      if (inSingleQuote && next === "'") {
        output += next;
        position += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }

    if (char === "?" && !inSingleQuote) {
      index += 1;
      output += `$${index}`;
      continue;
    }

    output += char;
  }

  return output;
}
