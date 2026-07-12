import { existsSync, readFileSync } from "node:fs";

import { withClient as defaultWithClient } from "./db.mjs";

export function loadMigrationFile(file) {
  if (!file || !String(file).endsWith(".sql") || !existsSync(file)) {
    throw new Error(`Migration file not found: ${file}`);
  }
  const sql = readFileSync(file, "utf8");
  validateMigrationSql(sql);
  return sql;
}

export function validateMigrationSql(sql) {
  if (!/\bBEGIN\s*;/i.test(String(sql)) || !/\bCOMMIT\s*;/i.test(String(sql))) {
    throw new Error("Migration must contain explicit BEGIN; and COMMIT; statements.");
  }
  return sql;
}

export async function executeMigrationSql(sql, operations = {}) {
  validateMigrationSql(sql);
  const withClient = operations.withClient || defaultWithClient;
  return withClient(async (client) => {
    try {
      await client.query(sql);
    } catch (error) {
      // The SQL file owns its BEGIN/COMMIT pair. Ensure a failed multi-statement
      // query cannot return an aborted transaction to the shared pool.
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}
