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

const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const connectionString =
  options.databaseUrl ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  await client.query(`SELECT ${quoteIdent(schema)}.refresh_city_index()`);
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(schema)}.city_index`);
  console.log(`Refreshed ${schema}.city_index (${result.rows[0]?.count || 0} cities)`);
} finally {
  await client.end();
}

function parseArgs(args) {
  const parsed = { envFile: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--env-file") {
      parsed.envFile.push(requiredValue(args, ++index, arg));
    } else if (arg.startsWith("--env-file=")) {
      parsed.envFile.push(arg.slice("--env-file=".length));
    } else if (arg === "--database-url") {
      parsed.databaseUrl = requiredValue(args, ++index, arg);
    } else if (arg.startsWith("--database-url=")) {
      parsed.databaseUrl = arg.slice("--database-url=".length);
    } else if (arg === "--schema") {
      parsed.schema = requiredValue(args, ++index, arg);
    } else if (arg.startsWith("--schema=")) {
      parsed.schema = arg.slice("--schema=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function requiredValue(args, index, flag) {
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

function normalizePostgresConnectionString(connectionString) {
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

function normalizeIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ""))) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return value;
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
