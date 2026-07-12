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
const phaseDate = options.phaseDate || "20260708";
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const reportPath = path.resolve(ROOT, options.report || `image-hygiene-report-${phaseDate}.json`);
const listLimit = Number.parseInt(options.listLimit || "1000", 10);
const deleteBatchSize = Number.parseInt(options.deleteBatchSize || "100", 10);
const maxOrphanRatio = Number.parseFloat(options.maxOrphanRatio || "0.3");
const maxOrphanBytes = Number.parseInt(options.maxOrphanBytes || String(2 * 1024 * 1024 * 1024), 10);

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

const blobToken = options.blobToken || process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
const oidcToken = options.oidcToken || process.env.VERCEL_OIDC_TOKEN;
const storeId = options.storeId || process.env.BLOB_STORE_ID;
const blobAuth = blobToken ? { token: blobToken } : oidcToken && storeId ? { oidcToken, storeId } : null;

if (!blobAuth) {
  throw new Error("Missing Blob credentials. Set BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN.");
}

const report = {
  phaseDate,
  partA: {
    frontendUsesBlobOnly: true,
    notes: [
      "Runtime image queries select blob_url for directory cards, detail galleries, practitioner images, and editorial provider cards.",
      "Sitemap has URL entries only; no image sitemap exists.",
      "OG image metadata uses static site assets, not fountain.images.image_url.",
    ],
    filesTouched: [],
  },
  partB: {},
  partC: {},
  finalInvariants: {},
};

const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });

try {
  await client.connect();
  await runBlobSweep();
  await purgeRawImages();
  report.finalInvariants = await loadFinalInvariants();
  writeJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${path.relative(ROOT, reportPath)}`);
} finally {
  await client.end();
}

async function runBlobSweep() {
  const blobsBefore = await listAllBlobs();
  const referenced = await loadReferencedBlobUrls();
  const blobUrlSetBefore = new Set(blobsBefore.map((blob) => blob.url));
  const orphans = blobsBefore.filter((blob) => !referenced.has(blob.url));
  const storeBytes = sumBytes(blobsBefore);
  const orphanBytes = sumBytes(orphans);
  const orphanRatio = blobsBefore.length ? orphans.length / blobsBefore.length : 0;
  const missingBefore = [...referenced].filter((url) => !blobUrlSetBefore.has(url));

  report.partB.before = {
    totalBlobCount: blobsBefore.length,
    totalBlobBytes: storeBytes,
    referencedBlobUrls: referenced.size,
    orphanBlobCount: orphans.length,
    orphanBlobBytes: orphanBytes,
    orphanBlobRatio: Number(orphanRatio.toFixed(6)),
    referencedBlobUrlsMissingBeforeDelete: missingBefore.length,
  };

  await createBlobSweepLog(orphans);

  if (orphans.length && (orphanRatio > maxOrphanRatio || orphanBytes > maxOrphanBytes)) {
    report.partB.gateStopped = true;
    report.partB.gateReason = `Orphans exceed gate: ratio=${orphanRatio.toFixed(4)}, bytes=${orphanBytes}`;
    writeJson(reportPath, report);
    console.error(report.partB.gateReason);
    process.exit(2);
  }

  let deletedCount = 0;
  let deletedBytes = 0;
  for (let index = 0; index < orphans.length; index += deleteBatchSize) {
    const batch = orphans.slice(index, index + deleteBatchSize);
    await del(batch.map((blob) => blob.url), blobAuth);
    deletedCount += batch.length;
    deletedBytes += sumBytes(batch);
    await markBlobsDeleted(batch.map((blob) => blob.url));
    console.log(`deleted orphan blobs ${deletedCount}/${orphans.length}`);
  }

  const blobsAfter = await listAllBlobs();
  const blobUrlSetAfter = new Set(blobsAfter.map((blob) => blob.url));
  const orphansAfter = blobsAfter.filter((blob) => !referenced.has(blob.url));
  const missingAfter = [...referenced].filter((url) => !blobUrlSetAfter.has(url));

  report.partB.after = {
    deletedBlobCount: deletedCount,
    deletedBlobBytes: deletedBytes,
    totalBlobCount: blobsAfter.length,
    totalBlobBytes: sumBytes(blobsAfter),
    orphanBlobCount: orphansAfter.length,
    orphanBlobBytes: sumBytes(orphansAfter),
    referencedBlobUrlsMissingAfterDelete: missingAfter.length,
  };
}

async function listAllBlobs() {
  const blobs = [];
  let cursor;
  do {
    const result = await list({
      cursor,
      limit: listLimit,
      ...blobAuth,
    });
    blobs.push(
      ...result.blobs.map((blob) => ({
        url: blob.url,
        pathname: blob.pathname,
        size: Number(blob.size || 0),
        uploadedAt: blob.uploadedAt ? new Date(blob.uploadedAt).toISOString() : null,
        etag: blob.etag || null,
      })),
    );
    cursor = result.cursor;
  } while (cursor);
  return blobs;
}

async function loadReferencedBlobUrls() {
  const result = await client.query(
    `
    SELECT DISTINCT blob_url
    FROM ${quoteIdent(schema)}.images
    WHERE deleted_at IS NULL
      AND coalesce(blob_url, '') <> ''
    `,
  );
  return new Set(result.rows.map((row) => row.blob_url));
}

async function createBlobSweepLog(orphans) {
  await client.query(`DROP TABLE IF EXISTS ${quoteIdent(rawSchema)}.blob_orphan_sweep_${phaseDate}`);
  await client.query(`
    CREATE TABLE ${quoteIdent(rawSchema)}.blob_orphan_sweep_${phaseDate} (
      blob_url text PRIMARY KEY,
      pathname text,
      size_bytes bigint NOT NULL,
      uploaded_at timestamptz,
      etag text,
      orphan_reason text NOT NULL,
      logged_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )
  `);
  for (let index = 0; index < orphans.length; index += 1000) {
    const batch = orphans.slice(index, index + 1000);
    if (!batch.length) {
      continue;
    }
    const values = [];
    const params = [];
    for (const blob of batch) {
      const offset = params.length;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, 'not referenced by non-deleted fountain.images row')`);
      params.push(blob.url, blob.pathname, blob.size, blob.uploadedAt, blob.etag);
    }
    await client.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.blob_orphan_sweep_${phaseDate}
        (blob_url, pathname, size_bytes, uploaded_at, etag, orphan_reason)
      VALUES ${values.join(", ")}
      ON CONFLICT (blob_url) DO NOTHING
      `,
      params,
    );
  }
}

async function markBlobsDeleted(urls) {
  if (!urls.length) {
    return;
  }
  await client.query(
    `
    UPDATE ${quoteIdent(rawSchema)}.blob_orphan_sweep_${phaseDate}
    SET deleted_at = now()
    WHERE blob_url = ANY($1::text[])
    `,
    [urls],
  );
}

async function purgeRawImages() {
  await client.query("BEGIN");
  try {
    await client.query(`DROP TABLE IF EXISTS ${quoteIdent(rawSchema)}.source_images_purged_${phaseDate}`);
    await client.query(`
      CREATE TABLE ${quoteIdent(rawSchema)}.source_images_purged_${phaseDate} AS
      WITH purge_candidates AS (
        SELECT
          a.source_slug,
          a.source_listing_id,
          a.image_url,
          a.bucket AS purge_bucket,
          a.bucket_reason AS purge_reason
        FROM ${quoteIdent(rawSchema)}.image_promotion_audit_${phaseDate} a
        WHERE a.bucket IN ('no_entity', 'junk_pattern')
        UNION
        SELECT
          a.source_slug,
          a.source_listing_id,
          a.image_url,
          r.outcome AS purge_bucket,
          r.reason AS purge_reason
        FROM ${quoteIdent(rawSchema)}.image_promotion_results_${phaseDate} r
        JOIN ${quoteIdent(rawSchema)}.image_promotion_audit_${phaseDate} a ON a.audit_id = r.audit_id
        WHERE r.outcome IN ('dead_link', 'failed_validation')
      )
      SELECT
        si.*,
        pc.purge_bucket,
        pc.purge_reason,
        now() AS purged_at
      FROM ${quoteIdent(rawSchema)}.source_images si
      JOIN purge_candidates pc
        ON pc.source_slug = si.source_slug
       AND pc.source_listing_id = si.source_listing_id
       AND pc.image_url = si.image_url
    `);

    const countsBefore = await client.query(`
      SELECT purge_bucket, count(*)::integer AS rows
      FROM ${quoteIdent(rawSchema)}.source_images_purged_${phaseDate}
      GROUP BY purge_bucket
      ORDER BY purge_bucket
    `);

    const deleted = await client.query(`
      DELETE FROM ${quoteIdent(rawSchema)}.source_images si
      USING ${quoteIdent(rawSchema)}.source_images_purged_${phaseDate} purged
      WHERE purged.source_slug = si.source_slug
        AND purged.source_listing_id = si.source_listing_id
        AND purged.image_url = si.image_url
    `);

    const remaining = await client.query(`SELECT count(*)::integer AS total FROM ${quoteIdent(rawSchema)}.source_images`);
    await client.query("COMMIT");

    report.partC = {
      backupTable: `${rawSchema}.source_images_purged_${phaseDate}`,
      deletedRows: deleted.rowCount,
      countsByBucket: countsBefore.rows,
      sourceImagesAfter: remaining.rows[0].total,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function loadFinalInvariants() {
  const referenced = await loadReferencedBlobUrls();
  const blobs = await listAllBlobs();
  const blobUrlSet = new Set(blobs.map((blob) => blob.url));
  const orphanCount = blobs.filter((blob) => !referenced.has(blob.url)).length;
  const missingReferenceCount = [...referenced].filter((url) => !blobUrlSet.has(url)).length;
  const sourceImageBuckets = await client.query(`
    WITH source_image_keys AS (
      SELECT source_slug, source_listing_id, image_url
      FROM ${quoteIdent(rawSchema)}.source_images
    )
    SELECT a.bucket, coalesce(r.outcome, '') AS outcome, count(*)::integer AS rows
    FROM source_image_keys si
    LEFT JOIN ${quoteIdent(rawSchema)}.image_promotion_audit_${phaseDate} a
      ON a.source_slug = si.source_slug
     AND a.source_listing_id = si.source_listing_id
     AND a.image_url = si.image_url
    LEFT JOIN ${quoteIdent(rawSchema)}.image_promotion_results_${phaseDate} r ON r.audit_id = a.audit_id
    GROUP BY a.bucket, r.outcome
    ORDER BY a.bucket, r.outcome
  `);
  return {
    everyImageRowHasLiveBlob: missingReferenceCount === 0,
    everyBlobHasImageRow: orphanCount === 0,
    orphanBlobCount: orphanCount,
    imageRowsPointingAtMissingBlobCount: missingReferenceCount,
    sourceImagesRemainingByPromotionState: sourceImageBuckets.rows,
  };
}

function sumBytes(blobs) {
  return blobs.reduce((sum, blob) => sum + Number(blob.size || 0), 0);
}

function parseArgs(args) {
  const parsed = { envFile: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--env-file") {
      parsed.envFile.push(requiredValue(args, ++index, arg));
    } else if (arg === "--database-url") {
      parsed.databaseUrl = requiredValue(args, ++index, arg);
    } else if (arg === "--blob-token") {
      parsed.blobToken = requiredValue(args, ++index, arg);
    } else if (arg === "--oidc-token") {
      parsed.oidcToken = requiredValue(args, ++index, arg);
    } else if (arg === "--store-id") {
      parsed.storeId = requiredValue(args, ++index, arg);
    } else if (arg === "--phase-date") {
      parsed.phaseDate = requiredValue(args, ++index, arg);
    } else if (arg === "--schema") {
      parsed.schema = requiredValue(args, ++index, arg);
    } else if (arg === "--raw-schema") {
      parsed.rawSchema = requiredValue(args, ++index, arg);
    } else if (arg === "--report") {
      parsed.report = requiredValue(args, ++index, arg);
    } else if (arg === "--list-limit") {
      parsed.listLimit = requiredValue(args, ++index, arg);
    } else if (arg === "--delete-batch-size") {
      parsed.deleteBatchSize = requiredValue(args, ++index, arg);
    } else if (arg === "--max-orphan-ratio") {
      parsed.maxOrphanRatio = requiredValue(args, ++index, arg);
    } else if (arg === "--max-orphan-bytes") {
      parsed.maxOrphanBytes = requiredValue(args, ++index, arg);
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

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function quoteIdent(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe identifier: ${identifier}`);
  }
  return `"${identifier.replaceAll('"', '""')}"`;
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
