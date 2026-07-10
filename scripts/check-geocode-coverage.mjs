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

const connectionString =
  options.databaseUrl ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  const report = await loadCoverage(client);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`active_non_virtual_locations_with_bad_geocode: ${report.total}`);
    for (const [key, value] of Object.entries(report.issue_counts)) {
      console.log(`${key}: ${value}`);
    }
    if (report.sample.length) {
      console.log("sample:");
      for (const row of report.sample) {
        console.log(`- ${row.id}: ${row.name} (${row.country_code || ""}) lat=${row.latitude ?? "NULL"} lng=${row.longitude ?? "NULL"} issues=${row.issues.join(",")}`);
      }
    }
  }
  if (report.total && !options.warnOnly) {
    process.exit(1);
  }
} finally {
  await client.end();
}

async function loadCoverage(pgClient) {
  const counts = await pgClient.query(`
    SELECT
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::int AS null_coordinate,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND latitude = 0 AND longitude = 0)::int AS zero_zero,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))::int AS latitude_out_of_bounds,
      COUNT(*) FILTER (WHERE longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))::int AS longitude_out_of_bounds,
      COUNT(*) FILTER (
        WHERE latitude IS NULL
           OR longitude IS NULL
           OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude = 0 AND longitude = 0)
           OR (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
           OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))
      )::int AS total
    FROM ${quoteIdent(schema)}.locations
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND COALESCE(is_virtual, false) = false
  `);
  const sample = await pgClient.query(`
    SELECT
      id,
      name,
      country_code,
      data_origin,
      latitude,
      longitude,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN latitude IS NULL OR longitude IS NULL THEN 'null_coordinate' END,
        CASE WHEN latitude = 0 AND longitude = 0 THEN 'zero_zero' END,
        CASE WHEN latitude IS NOT NULL AND (latitude < -90 OR latitude > 90) THEN 'latitude_out_of_bounds' END,
        CASE WHEN longitude IS NOT NULL AND (longitude < -180 OR longitude > 180) THEN 'longitude_out_of_bounds' END
      ], NULL) AS issues
    FROM ${quoteIdent(schema)}.locations
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND COALESCE(is_virtual, false) = false
      AND (
        latitude IS NULL
        OR longitude IS NULL
        OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude = 0 AND longitude = 0)
        OR (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
        OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180))
      )
    ORDER BY id
    LIMIT $1
  `, [options.limit]);

  const row = counts.rows[0];
  return {
    ok: Number(row.total) === 0,
    total: Number(row.total),
    issue_counts: {
      null_coordinate: Number(row.null_coordinate),
      zero_zero: Number(row.zero_zero),
      latitude_out_of_bounds: Number(row.latitude_out_of_bounds),
      longitude_out_of_bounds: Number(row.longitude_out_of_bounds),
    },
    sample: sample.rows,
  };
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
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
  const parsed = { json: false, limit: 20, warnOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--warn-only") {
      parsed.warnOnly = true;
    } else if (arg === "--limit") {
      parsed.limit = Number.parseInt(args[++index], 10);
    } else if (arg === "--schema") {
      parsed.schema = args[++index];
    } else if (arg === "--database-url") {
      parsed.databaseUrl = args[++index];
    } else if (arg === "--env-file") {
      parsed.envFile ||= [];
      parsed.envFile.push(args[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}
