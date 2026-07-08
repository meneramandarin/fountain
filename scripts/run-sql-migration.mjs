#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));
for (const envFile of options.envFile || []) {
  loadEnvFile(path.resolve(ROOT, envFile));
}

const migrationPath = options.file ? path.resolve(ROOT, options.file) : null;
if (!migrationPath || !existsSync(migrationPath)) {
  throw new Error("Usage: node scripts/run-sql-migration.mjs --file <path> [--database-url <url>]");
}

if (options.databaseUrlProvided && !String(options.databaseUrl || "").trim()) {
  throw new Error("--database-url was provided but empty. Refusing to fall back to the default environment URL.");
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

const sql = readFileSync(migrationPath, "utf8");
const normalizedConnectionString = normalizePostgresConnectionString(connectionString);
const client = new Client({ connectionString: normalizedConnectionString });

try {
  console.log(`Target database: ${describeDatabaseTarget(normalizedConnectionString)}`);
  await client.connect();
  await client.query(sql);
  console.log(`Applied ${path.relative(ROOT, migrationPath)}`);
} finally {
  await client.end();
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--file") {
      parsed.file = readRequiredArgValue(args, ++index, "--file");
    } else if (arg.startsWith("--file=")) {
      parsed.file = arg.slice("--file=".length);
    } else if (arg === "--database-url") {
      parsed.databaseUrlProvided = true;
      parsed.databaseUrl = readRequiredArgValue(args, ++index, "--database-url");
    } else if (arg.startsWith("--database-url=")) {
      parsed.databaseUrlProvided = true;
      parsed.databaseUrl = arg.slice("--database-url=".length);
    } else if (arg === "--env-file") {
      parsed.envFile ||= [];
      parsed.envFile.push(readRequiredArgValue(args, ++index, "--env-file"));
    } else if (arg.startsWith("--env-file=")) {
      parsed.envFile ||= [];
      parsed.envFile.push(arg.slice("--env-file=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function readRequiredArgValue(args, index, flag) {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
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
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = unquoteEnvValue(match[2].trim());
  }
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizePostgresConnectionString(value) {
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

function describeDatabaseTarget(value) {
  try {
    const url = new URL(value);
    const host = url.hostname || "unknown";
    const database = url.pathname.replace(/^\//, "") || "unknown";
    const branch = host.split(".")[0] || "unknown";
    return `host=${host} branch=${branch} database=${database}`;
  } catch {
    return "host=unparseable branch=unknown database=unknown";
  }
}
