#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { del, list } from "@vercel/blob";
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

const blobToken = options.token || process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
const oidcToken = options.oidcToken || process.env.VERCEL_OIDC_TOKEN;
const storeId = options.storeId || process.env.BLOB_STORE_ID;
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const prefix = options.prefix || "listing-images";
const reportPath = path.resolve(ROOT, options.report || "blob-cleanup-report.json");
const deleteBatchSize = Number.parseInt(options.deleteBatchSize || "100", 10);
const listLimit = Number.parseInt(options.listLimit || "1000", 10);
const dryRun = !options.delete;

if (!blobToken && !(oidcToken && storeId)) {
  console.error("Missing Blob credentials.");
  console.error("Set BLOB_READ_WRITE_TOKEN, or provide VERCEL_OIDC_TOKEN with BLOB_STORE_ID.");
  console.error("Examples:");
  console.error("  BLOB_READ_WRITE_TOKEN=... npm run blob:cleanup -- --delete");
  console.error("  npm run blob:cleanup -- --env-file .env.production.local --delete");
  console.error("Note: Vercel OIDC tokens only work from environments enabled for Blob OIDC.");
  process.exit(1);
}

const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  const canonicalUrls = await loadCanonicalBlobUrls(client);
  const blobUrls = await loadBlobUrls();
  const orphanUrls = blobUrls.filter((url) => !canonicalUrls.has(url));
  const report = {
    dryRun,
    prefix,
    canonicalImageUrls: canonicalUrls.size,
    listedBlobUrls: blobUrls.length,
    orphanBlobUrls: orphanUrls.length,
    deletedBlobUrls: 0,
    sampleOrphans: orphanUrls.slice(0, 25),
  };

  if (!dryRun && orphanUrls.length) {
    for (let index = 0; index < orphanUrls.length; index += deleteBatchSize) {
      const batch = orphanUrls.slice(index, index + deleteBatchSize);
      await del(batch, authOptions());
      report.deletedBlobUrls += batch.length;
      console.log(`deleted ${report.deletedBlobUrls}/${orphanUrls.length}`);
    }
  }

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${path.relative(ROOT, reportPath)}`);
} finally {
  await client.end();
}

function authOptions() {
  if (blobToken) {
    return { token: blobToken };
  }
  return { oidcToken, storeId };
}

async function loadCanonicalBlobUrls(pgClient) {
  const result = await pgClient.query(
    `
    SELECT DISTINCT blob_url
    FROM ${quoteIdent(schema)}.images
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND COALESCE(blob_url, '') <> ''
    `,
  );
  return new Set(result.rows.map((row) => row.blob_url));
}

async function loadBlobUrls() {
  const urls = [];
  let cursor;
  do {
    const result = await list({
      cursor,
      limit: listLimit,
      prefix,
      ...authOptions(),
    });
    for (const blob of result.blobs) {
      urls.push(blob.url);
    }
    cursor = result.cursor;
  } while (cursor);
  return urls;
}

function parseArgs(args) {
  const parsed = {
    envFile: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--delete") {
      parsed.delete = true;
    } else if (arg === "--env-file") {
      parsed.envFile.push(requiredValue(args, ++index, arg));
    } else if (arg === "--database-url") {
      parsed.databaseUrl = requiredValue(args, ++index, arg);
    } else if (arg === "--schema") {
      parsed.schema = requiredValue(args, ++index, arg);
    } else if (arg === "--prefix") {
      parsed.prefix = requiredValue(args, ++index, arg);
    } else if (arg === "--token") {
      parsed.token = requiredValue(args, ++index, arg);
    } else if (arg === "--oidc-token") {
      parsed.oidcToken = requiredValue(args, ++index, arg);
    } else if (arg === "--store-id") {
      parsed.storeId = requiredValue(args, ++index, arg);
    } else if (arg === "--report") {
      parsed.report = requiredValue(args, ++index, arg);
    } else if (arg === "--delete-batch-size") {
      parsed.deleteBatchSize = requiredValue(args, ++index, arg);
    } else if (arg === "--list-limit") {
      parsed.listLimit = requiredValue(args, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function printHelp() {
  console.log(`
Usage:
  npm run blob:cleanup -- [options]
  npm run blob:cleanup -- --delete

Options:
  --delete                    Delete orphan Blob objects. Omit for dry-run.
  --env-file <path>           Load additional env file.
  --database-url <url>        Override DATABASE_URL/POSTGRES_URL.
  --schema <name>             Canonical schema. Default: fountain.
  --prefix <prefix>           Blob prefix to scan. Default: listing-images.
  --token <token>             Blob read/write token.
  --oidc-token <token>        Vercel OIDC token. Requires --store-id.
  --store-id <id>             Vercel Blob store id for OIDC auth.
  --report <path>             Report path. Default: blob-cleanup-report.json.
  --delete-batch-size <n>     Delete batch size. Default: 100.
  --list-limit <n>            Blob list page size. Default: 1000.
`);
}

function normalizeIdentifier(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe identifier: ${identifier}`);
  }
  return identifier;
}

function quoteIdent(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function normalizePostgresConnectionString(value) {
  if (!value) {
    return value;
  }
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
