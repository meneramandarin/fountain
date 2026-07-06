#!/usr/bin/env node

import Database from "better-sqlite3";
import pg from "pg";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const { Client } = pg;
const ROOT = process.cwd();
const DEFAULT_SCHEMA = "fountain";
const TABLES = [
  "sources",
  "organizations",
  "locations",
  "practitioners",
  "documents",
  "categories",
  "treatments",
  "affiliations",
  "treatment_aliases",
  "offerings",
  "tags",
  "entity_tags",
  "source_records",
  "images",
  "reviews",
  "external_place_matches",
  "external_reviews",
  "unmapped_terms",
  "search_index",
];

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
if (options.envFile) {
  loadEnvFile(path.resolve(ROOT, options.envFile));
}

const connectionString =
  options.databaseUrl ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL. Install Neon on Vercel, then run `vercel env pull .env.local --yes`.");
}

const sqlitePath = path.resolve(ROOT, options.sqlite || process.env.CANONICAL_DB_PATH || "canonical.db");
const schemaSqlPath = path.resolve(ROOT, options.schemaSql || "data_pipeline/postgres_schema.sql");
const targetSchema = normalizeIdentifier(options.targetSchema || DEFAULT_SCHEMA);
const importSchema = normalizeIdentifier(
  options.importSchema ||
    `${targetSchema}_import_${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`,
);
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");

if (!existsSync(sqlitePath)) {
  throw new Error(`SQLite canonical DB not found: ${sqlitePath}`);
}

const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
const client = new Client({ connectionString });

try {
  await client.connect();
  await assertSqliteIntegrity(sqlite);
  if (options.truncateRawBeforeImport) {
    await truncateRawSchema(client, rawSchema);
  }
  await resetImportSchema(client, importSchema);
  await createSchema(client, schemaSqlPath, importSchema);
  await importTables(sqlite, client, importSchema);
  await writeMetadata(client, importSchema, sqlitePath);
  await validateCounts(sqlite, client, importSchema);
  if (!options.noPromote) {
    await promoteSchema(client, importSchema, targetSchema);
    await setDefaultSearchPath(client, targetSchema);
    console.log(`Promoted ${quoteIdent(importSchema)} to ${quoteIdent(targetSchema)}.`);
    if (options.dropPreviousAfterPromote) {
      await dropSchemaIfExists(client, `${targetSchema}_previous`);
      console.log(`Dropped ${quoteIdent(`${targetSchema}_previous`)} after promotion.`);
    }
  } else {
    console.log(`Imported into ${quoteIdent(importSchema)} without promotion.`);
  }
} finally {
  sqlite.close();
  await client.end();
}

async function assertSqliteIntegrity(sqliteDb) {
  const integrity = sqliteDb.prepare("PRAGMA integrity_check").get().integrity_check;
  if (integrity !== "ok") {
    throw new Error(`SQLite integrity_check failed: ${integrity}`);
  }
}

async function resetImportSchema(pgClient, schemaName) {
  await pgClient.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schemaName)} CASCADE`);
}

async function truncateRawSchema(pgClient, schemaName) {
  const result = await pgClient.query("SELECT to_regclass($1) AS table_name", [`${schemaName}.source_databases`]);
  if (!result.rows[0].table_name) {
    console.log(`Skipped raw staging truncate; ${quoteIdent(schemaName)} is not installed.`);
    return;
  }
  await pgClient.query(`
    TRUNCATE TABLE
      ${quoteIdent(schemaName)}.source_reviews,
      ${quoteIdent(schemaName)}.source_images,
      ${quoteIdent(schemaName)}.source_listing_fields,
      ${quoteIdent(schemaName)}.source_listings,
      ${quoteIdent(schemaName)}.import_runs,
      ${quoteIdent(schemaName)}.source_databases
    RESTART IDENTITY CASCADE
  `);
  console.log(`Truncated raw staging schema ${quoteIdent(schemaName)} before import.`);
}

async function createSchema(pgClient, schemaSqlFile, schemaName) {
  const sql = readFileSync(schemaSqlFile, "utf8").replaceAll("__SCHEMA__", quoteIdent(schemaName));
  await pgClient.query(sql);
}

async function importTables(sqliteDb, pgClient, schemaName) {
  for (const table of TABLES) {
    const columns = sqliteColumns(sqliteDb, table);
    const total = sqliteDb.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`).get().count;
    if (!columns.length) {
      throw new Error(`No columns found for SQLite table ${table}`);
    }
    if (total === 0) {
      console.log(`Imported ${table}: 0 rows`);
      continue;
    }

    const select = sqliteDb.prepare(`SELECT ${columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)} ORDER BY rowid`);
    const columnLimit = Math.max(1, Math.floor(60000 / columns.length));
    const chunkSize = Math.min(options.chunkSize, columnLimit);
    let chunk = [];
    let imported = 0;

    for (const row of select.iterate()) {
      chunk.push(row);
      if (chunk.length >= chunkSize) {
        await insertRows(pgClient, schemaName, table, columns, chunk);
        imported += chunk.length;
        chunk = [];
      }
    }
    if (chunk.length) {
      await insertRows(pgClient, schemaName, table, columns, chunk);
      imported += chunk.length;
    }
    console.log(`Imported ${table}: ${imported}/${total} rows`);
  }
}

function sqliteColumns(sqliteDb, table) {
  return sqliteDb.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().map((column) => column.name);
}

async function insertRows(pgClient, schemaName, table, columns, rows) {
  if (!rows.length) {
    return;
  }
  const values = [];
  const tuples = rows.map((row, rowIndex) => {
    const marks = columns.map((column, columnIndex) => {
      values.push(row[column] ?? null);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${marks.join(", ")})`;
  });
  await pgClient.query(
    `INSERT INTO ${quoteIdent(schemaName)}.${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES ${tuples.join(", ")}`,
    values,
  );
}

async function writeMetadata(pgClient, schemaName, sqlitePathValue) {
  const metadata = {
    imported_at: new Date().toISOString(),
    source_sqlite_path: sqlitePathValue,
    importer: "scripts/import-canonical-to-postgres.mjs",
  };
  for (const [key, value] of Object.entries(metadata)) {
    await pgClient.query(
      `INSERT INTO ${quoteIdent(schemaName)}.import_metadata(key, value) VALUES ($1, $2)`,
      [key, value],
    );
  }
}

async function validateCounts(sqliteDb, pgClient, schemaName) {
  const mismatches = [];
  for (const table of TABLES) {
    const sqliteCount = sqliteDb.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`).get().count;
    const pgResult = await pgClient.query(`SELECT COUNT(*)::integer AS count FROM ${quoteIdent(schemaName)}.${quoteIdent(table)}`);
    const pgCount = pgResult.rows[0].count;
    if (sqliteCount !== pgCount) {
      mismatches.push({ table, sqlite: sqliteCount, postgres: pgCount });
    }
  }
  if (mismatches.length) {
    throw new Error(`Postgres import count mismatch: ${JSON.stringify(mismatches)}`);
  }
  console.log(`Validated counts for ${TABLES.length} tables.`);
}

async function promoteSchema(pgClient, importSchemaName, targetSchemaName) {
  const previousSchema = `${targetSchemaName}_previous`;
  await pgClient.query("BEGIN");
  try {
    await pgClient.query(`DROP SCHEMA IF EXISTS ${quoteIdent(previousSchema)} CASCADE`);
    const exists = await pgClient.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [targetSchemaName]);
    if (exists.rowCount) {
      await pgClient.query(`ALTER SCHEMA ${quoteIdent(targetSchemaName)} RENAME TO ${quoteIdent(previousSchema)}`);
    }
    await pgClient.query(`ALTER SCHEMA ${quoteIdent(importSchemaName)} RENAME TO ${quoteIdent(targetSchemaName)}`);
    await pgClient.query("COMMIT");
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  }
}

async function setDefaultSearchPath(pgClient, schemaName) {
  const result = await pgClient.query(
    "SELECT current_user AS user_name, current_database() AS database_name",
  );
  const { user_name: userName, database_name: databaseName } = result.rows[0];
  await pgClient.query(
    `ALTER ROLE ${quoteIdent(userName)} IN DATABASE ${quoteIdent(databaseName)} SET search_path TO ${quoteIdent(schemaName)}, public`,
  );
  console.log(`Set default search_path for ${quoteIdent(userName)} on ${quoteIdent(databaseName)}.`);
}

async function dropSchemaIfExists(pgClient, schemaName) {
  await pgClient.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schemaName)} CASCADE`);
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
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
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
  const parsed = {
    chunkSize: 400,
    dropPreviousAfterPromote: false,
    noPromote: false,
    help: false,
    truncateRawBeforeImport: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--help") {
      parsed.help = true;
    } else if (arg === "--no-promote") {
      parsed.noPromote = true;
    } else if (arg === "--drop-previous-after-promote") {
      parsed.dropPreviousAfterPromote = true;
    } else if (arg === "--truncate-raw-before-import") {
      parsed.truncateRawBeforeImport = true;
    } else if (arg === "--sqlite" && next) {
      parsed.sqlite = next;
      index += 1;
    } else if (arg === "--database-url" && next) {
      parsed.databaseUrl = next;
      index += 1;
    } else if (arg === "--target-schema" && next) {
      parsed.targetSchema = next;
      index += 1;
    } else if (arg === "--import-schema" && next) {
      parsed.importSchema = next;
      index += 1;
    } else if (arg === "--schema-sql" && next) {
      parsed.schemaSql = next;
      index += 1;
    } else if (arg === "--raw-schema" && next) {
      parsed.rawSchema = next;
      index += 1;
    } else if (arg === "--env-file" && next) {
      parsed.envFile = next;
      index += 1;
    } else if (arg === "--chunk-size" && next) {
      parsed.chunkSize = Math.max(1, Number.parseInt(next, 10) || parsed.chunkSize);
      index += 1;
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`
Usage: npm run db:import-postgres -- [options]

Imports canonical.db into Neon/Postgres using a staging schema and count validation.

Options:
  --sqlite <path>          Source SQLite DB. Defaults to canonical.db.
  --target-schema <name>   Schema the app will read from. Defaults to fountain.
  --import-schema <name>   Temporary schema name. Defaults to fountain_import_<timestamp>.
  --no-promote             Import and validate, but do not swap into target schema.
  --drop-previous-after-promote
                           Drop <target>_previous after a successful swap to stay under small Neon size caps.
  --truncate-raw-before-import
                           Temporarily empty durable raw staging tables before import. Refill with db:sync-raw-sources.
  --raw-schema <name>      Raw staging schema to truncate. Defaults to fountain_raw.
  --chunk-size <n>         Insert batch size. Defaults to 400.
  --env-file <path>        Extra env file to load, e.g. .env.production.local.

Environment:
  DATABASE_URL or POSTGRES_URL must point at Neon/Postgres.
`);
}
