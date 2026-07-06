import Database from "better-sqlite3";
import path from "node:path";
import pg from "pg";

const { Pool, types } = pg;

types.setTypeParser(20, (value) => Number(value));

let sqliteConnection: Database.Database | null = null;
let postgresPool: pg.Pool | null = null;
let loggedBackend: "sqlite" | "postgres" | null = null;

export function canonicalDbPath() {
  return process.env.CANONICAL_DB_PATH || path.join(process.cwd(), "canonical.db");
}

function postgresConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function databaseBackend() {
  if (postgresConnectionString()) {
    return "postgres";
  }
  if (process.env.VERCEL === "1") {
    throw new Error("DATABASE_URL or POSTGRES_URL is required on Vercel; refusing to fall back to canonical.db.");
  }
  return "sqlite";
}

function logBackend(backend: "sqlite" | "postgres") {
  if (loggedBackend !== backend) {
    loggedBackend = backend;
    console.log(`Using ${backend} directory database`);
  }
}

function getSqliteDb() {
  if (!sqliteConnection) {
    sqliteConnection = new Database(canonicalDbPath(), { readonly: true, fileMustExist: true });
    sqliteConnection.pragma("query_only = ON");
  }
  return sqliteConnection;
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

export function isPostgres() {
  return databaseBackend() === "postgres";
}

export async function hasTable(tableName: string) {
  if (isPostgres()) {
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

  const result = await row<{ count: number }>(
    `
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ?
  `,
    [tableName],
  );
  return Boolean(result?.count);
}

export async function rows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  if (isPostgres()) {
    logBackend("postgres");
    const query = toPostgresQuery(sql);
    const result = await queryPostgres(query, params);
    return result.rows as T[];
  }

  logBackend("sqlite");
  return getSqliteDb().prepare(sql).all(...params) as T[];
}

export async function row<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  if (isPostgres()) {
    logBackend("postgres");
    const query = toPostgresQuery(sql);
    const result = await queryPostgres(query, params);
    return result.rows[0] as T | undefined;
  }

  logBackend("sqlite");
  return getSqliteDb().prepare(sql).get(...params) as T | undefined;
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
