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
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const client = new Client({ connectionString });
const failures = [];
const warnings = [];
const summary = {};

try {
  await client.connect();
  await checkMigrationFiles(client);
  await checkSchemaObjects(client);
  await checkImageContract(client);
  await checkRawStaging(client);
  await checkTransientSchemas(client);
} finally {
  await client.end();
}

if (options.json) {
  console.log(JSON.stringify({ ok: failures.length === 0, failures, warnings, summary }, null, 2));
} else {
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${value}`);
  }
  for (const warning of warnings) {
    console.warn(`warning: ${warning}`);
  }
  for (const failure of failures) {
    console.error(`failure: ${failure}`);
  }
}

if (failures.length) {
  process.exit(1);
}

async function checkMigrationFiles(pgClient) {
  if (!existsSync(migrationsDir)) {
    failures.push(`missing migration directory: ${migrationsDir}`);
    return;
  }

  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  const result = await pgClient.query("SELECT id, checksum FROM public.fountain_schema_migrations");
  const applied = new Map(result.rows.map((row) => [row.id, row.checksum]));
  summary.migration_files = files.length;

  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const checksum = crypto.createHash("sha256").update(readFileSync(path.join(migrationsDir, file), "utf8")).digest("hex");
    if (!applied.has(id)) {
      failures.push(`pending migration ${file}`);
      continue;
    }
    if (applied.get(id) !== checksum) {
      failures.push(`checksum mismatch for migration ${file}`);
    }
  }
}

async function checkSchemaObjects(pgClient) {
  const objects = await pgClient.query(
    `
    SELECT
      to_regclass($1) AS images_table,
      to_regclass($2) AS raw_sources_table,
      to_regclass($3) AS old_asset_table,
      to_regclass($4) AS old_entity_asset_table
    `,
    [
      `${canonicalSchema}.images`,
      `${rawSchema}.source_databases`,
      "fountain_assets.image_assets",
      "fountain_assets.entity_images",
    ],
  );
  const row = objects.rows[0];
  if (!row.images_table) {
    failures.push(`missing ${canonicalSchema}.images`);
  }
  if (!row.raw_sources_table) {
    failures.push(`missing ${rawSchema}.source_databases`);
  }
  if (row.old_asset_table || row.old_entity_asset_table) {
    failures.push("redundant fountain_assets registry still exists");
  }
  summary.serving_schema = canonicalSchema;
  summary.raw_schema = rawSchema;
}

async function checkImageContract(pgClient) {
  const counts = await pgClient.query(
    `
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE COALESCE(blob_url, '') = '')::bigint AS without_blob,
      COUNT(*) FILTER (WHERE COALESCE(local_path, '') <> '')::bigint AS with_local_path
    FROM ${quoteIdent(canonicalSchema)}.images
    `,
  );
  const row = counts.rows[0];
  summary.images = row.total;
  summary.images_without_blob = row.without_blob;
  summary.images_with_local_path = row.with_local_path;
  if (Number(row.without_blob) !== 0) {
    failures.push(`${canonicalSchema}.images has ${row.without_blob} rows without Blob URLs`);
  }
  if (Number(row.with_local_path) !== 0) {
    failures.push(`${canonicalSchema}.images has ${row.with_local_path} local_path rows`);
  }

  const constraint = await pgClient.query(
    `
    SELECT c.convalidated
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = $1
      AND r.relname = 'images'
      AND c.conname = 'images_blob_backed'
    `,
    [canonicalSchema],
  );
  if (!constraint.rowCount) {
    failures.push(`missing ${canonicalSchema}.images_blob_backed constraint`);
  } else if (!constraint.rows[0].convalidated) {
    failures.push(`${canonicalSchema}.images_blob_backed constraint is not validated`);
  }
}

async function checkRawStaging(pgClient) {
  const counts = await pgClient.query(
    `
    SELECT
      (SELECT COUNT(*)::bigint FROM ${quoteIdent(rawSchema)}.source_databases) AS source_databases,
      (SELECT COUNT(*)::bigint FROM ${quoteIdent(rawSchema)}.source_images) AS source_images
    `,
  );
  summary.raw_source_databases = counts.rows[0].source_databases;
  summary.raw_source_images = counts.rows[0].source_images;
  if (Number(counts.rows[0].source_databases) === 0) {
    warnings.push(`${rawSchema}.source_databases is empty`);
  }
}

async function checkTransientSchemas(pgClient) {
  const schemas = await pgClient.query(
    `
    SELECT nspname
    FROM pg_namespace
    WHERE nspname = $1
       OR nspname LIKE $2
    ORDER BY nspname
    `,
    [`${canonicalSchema}_previous`, `${canonicalSchema}_import_%`],
  );
  summary.transient_schemas = schemas.rows.length;
  if (schemas.rows.length && !options.allowTransientSchemas) {
    failures.push(`transient import schemas still exist: ${schemas.rows.map((row) => row.nspname).join(", ")}`);
  }
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function normalizeIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe Postgres identifier: ${identifier}`);
  }
  return value;
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
  const parsed = { allowTransientSchemas: false, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--allow-transient-schemas") {
      parsed.allowTransientSchemas = true;
    } else if (arg === "--json") {
      parsed.json = true;
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
