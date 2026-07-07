#!/usr/bin/env node

import crypto from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
for (const envFile of options.envFile || []) {
  loadEnvFile(path.resolve(ROOT, envFile));
}

const connectionString =
  options.databaseUrl ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

const migrationsDir = path.resolve(ROOT, options.dir || "data_pipeline/postgres_migrations");
const canonicalSchema = normalizeIdentifier(options.canonicalSchema || process.env.POSTGRES_SCHEMA || "fountain");
const assetSchema = normalizeIdentifier(options.assetSchema || process.env.POSTGRES_ASSET_SCHEMA || "fountain_assets");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");

if (!existsSync(migrationsDir)) {
  throw new Error(`Migration directory not found: ${migrationsDir}`);
}

const migrations = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => {
    const fullPath = path.join(migrationsDir, file);
    const rawSql = readFileSync(fullPath, "utf8");
    return {
      id: file.replace(/\.sql$/, ""),
      file,
      sql: applyPlaceholders(rawSql),
      checksum: crypto.createHash("sha256").update(rawSql).digest("hex"),
    };
  });

const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  await ensureMigrationTable(client);
  for (const migration of migrations) {
    await applyMigration(client, migration);
  }
} finally {
  await client.end();
}

async function ensureMigrationTable(pgClient) {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS public.fountain_schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function applyMigration(pgClient, migration) {
  const existing = await pgClient.query(
    "SELECT checksum FROM public.fountain_schema_migrations WHERE id = $1",
    [migration.id],
  );
  if (existing.rowCount) {
    const checksum = existing.rows[0].checksum;
    if (checksum !== migration.checksum) {
      throw new Error(`Migration checksum mismatch for ${migration.file}. Existing=${checksum} current=${migration.checksum}`);
    }
    if (options.reapplyApplied) {
      if (options.dryRun) {
        console.log(`Would reapply ${migration.file}`);
        return;
      }
      await pgClient.query("BEGIN");
      try {
        await pgClient.query(migration.sql);
        await pgClient.query("COMMIT");
        console.log(`Reapplied ${migration.file}`);
      } catch (error) {
        await pgClient.query("ROLLBACK");
        throw error;
      }
      return;
    }
    console.log(`Skipped ${migration.file}`);
    return;
  }

  if (options.dryRun) {
    console.log(`Would apply ${migration.file}`);
    return;
  }

  await pgClient.query("BEGIN");
  try {
    await pgClient.query(migration.sql);
    await pgClient.query(
      "INSERT INTO public.fountain_schema_migrations(id, checksum) VALUES ($1, $2)",
      [migration.id, migration.checksum],
    );
    await pgClient.query("COMMIT");
    console.log(`Applied ${migration.file}`);
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

function applyPlaceholders(sql) {
  return sql
    .replaceAll("__CANONICAL_SCHEMA__", canonicalSchema)
    .replaceAll("__ASSET_SCHEMA__", assetSchema)
    .replaceAll("__RAW_SCHEMA__", rawSchema);
}

function normalizeIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe Postgres identifier: ${identifier}`);
  }
  return value;
}

function normalizePostgresConnectionString(rawConnectionString) {
  try {
    const url = new URL(rawConnectionString);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return rawConnectionString;
  }
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key]) {
      continue;
    }
    let value = rest.join("=").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(args) {
  const parsed = { dryRun: false, reapplyApplied: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--reapply-applied") {
      parsed.reapplyApplied = true;
    } else if (arg.startsWith("--") && next) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key === "envFile") {
        parsed.envFile = [...(parsed.envFile || []), next];
      } else {
        parsed[key] = next;
      }
      index += 1;
    }
  }
  return parsed;
}
