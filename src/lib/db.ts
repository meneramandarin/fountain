import Database from "better-sqlite3";
import path from "node:path";

let connection: Database.Database | null = null;

export function canonicalDbPath() {
  return process.env.CANONICAL_DB_PATH || path.join(process.cwd(), "canonical.db");
}

export function getDb() {
  if (!connection) {
    connection = new Database(canonicalDbPath(), { readonly: true, fileMustExist: true });
    connection.pragma("query_only = ON");
  }
  return connection;
}

export function rows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).all(...params) as T[];
}

export function row<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).get(...params) as T | undefined;
}
