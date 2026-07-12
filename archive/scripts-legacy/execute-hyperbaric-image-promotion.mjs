#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { del, put } from "@vercel/blob";
import pg from "pg";
import sharp from "sharp";

const { Pool } = pg;
const ROOT = process.cwd();
const SOURCE_SLUG = "hyperbaric_app";
const AUDIT_TABLE = "hyperbaric_app_image_audit_20260710";
const PROMOTION_AUDIT_TABLE = "hyperbaric_app_promotion_audit_20260710";
const options = parseArgs(process.argv.slice(2));
const phase = options.phase || "dry-run";
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const delayMs = Number.parseInt(options.delayMs || "650", 10);
const maxImages = options.maxImages ? Number.parseInt(options.maxImages, 10) : Infinity;
const cacheDir = path.resolve(ROOT, options.cacheDir || ".cache/hyperbaric_app/images");
const reportPath = path.resolve(ROOT, options.report || "hyperbaric-app-image-promotion-report-20260710.json");

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));
for (const envFile of options.envFile || []) {
  loadEnvFile(path.resolve(ROOT, envFile));
}

const connectionString = normalizePostgresConnectionString(
  options.databaseUrl ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING,
);

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}

const blobToken = options.blobToken || process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
const oidcToken = process.env.VERCEL_OIDC_TOKEN;
const blobStoreId = process.env.BLOB_STORE_ID;
const blobAccess = blobToken ? { token: blobToken } : oidcToken && blobStoreId ? { token: oidcToken } : null;

mkdirSync(cacheDir, { recursive: true });

const pool = new Pool({
  connectionString,
  max: 4,
});

const report = {
  sourceSlug: SOURCE_SLUG,
  auditTable: `${rawSchema}.${AUDIT_TABLE}`,
  phase,
  startedAt: new Date().toISOString(),
};

try {
  await ensureAuditTable();
  if (options.reclassify || !(await auditHasRows())) {
    await classifyRawImages();
  }

  report.before = await loadCoverage();
  if (phase === "classify") {
    report.counts = await loadAuditCounts();
    await writeReport();
    console.table(report.counts);
  } else if (phase === "dry-run") {
    await validatePromoteCandidates({ upload: false });
    report.counts = await loadAuditCounts();
    report.after = await loadCoverage();
    await writeReport();
    console.table(report.counts);
  } else if (phase === "promote") {
    if (!blobAccess) {
      throw new Error("Missing Blob credentials. Set BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN.");
    }
    await validatePromoteCandidates({ upload: true });
    report.counts = await loadAuditCounts();
    report.after = await loadCoverage();
    await writeReport();
    console.table(report.counts);
  } else {
    throw new Error(`Unknown --phase=${phase}. Use classify, dry-run, or promote.`);
  }
} finally {
  await pool.end();
}

async function ensureAuditTable() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(AUDIT_TABLE)} (
      audit_id bigint PRIMARY KEY,
      source_slug text NOT NULL,
      source_listing_id bigint NOT NULL,
      image_url text NOT NULL,
      source_page_url text,
      alt text,
      source_id integer,
      location_id integer,
      location_name text,
      classification text NOT NULL,
      outcome text NOT NULL,
      reason text,
      blob_url text,
      image_id integer,
      content_sha256 text,
      bytes integer,
      width integer,
      height integer,
      content_type text,
      cache_path text,
      classified_at timestamptz NOT NULL DEFAULT now(),
      downloaded_at timestamptz,
      promoted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${AUDIT_TABLE}_classification_idx ON ${quoteIdent(rawSchema)}.${quoteIdent(AUDIT_TABLE)} (classification, outcome)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${AUDIT_TABLE}_location_idx ON ${quoteIdent(rawSchema)}.${quoteIdent(AUDIT_TABLE)} (location_id)`);
}

async function auditHasRows() {
  const result = await row(`SELECT EXISTS (SELECT 1 FROM ${quoteIdent(rawSchema)}.${quoteIdent(AUDIT_TABLE)}) AS exists`);
  return Boolean(result?.exists);
}

async function classifyRawImages() {
  const db = await pool.connect();
  await db.query("BEGIN");
  try {
    await db.query(`TRUNCATE ${quoteIdent(rawSchema)}.${quoteIdent(AUDIT_TABLE)}`);
    await db.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(AUDIT_TABLE)} (
        audit_id,
        source_slug,
        source_listing_id,
        image_url,
        source_page_url,
        alt,
        source_id,
        location_id,
        location_name,
        classification,
        outcome,
        reason
      )
      WITH raw_images AS (
        SELECT
          row_number() OVER (ORDER BY si.source_listing_id, si.image_url, si.source_page_url, si.alt)::bigint AS audit_id,
          si.source_slug,
          si.source_listing_id,
          si.image_url,
          si.source_page_url,
          si.alt,
          s.id AS source_id,
          pa.location_id,
          pa.name AS location_name
        FROM ${quoteIdent(rawSchema)}.source_images si
        LEFT JOIN ${quoteIdent(schema)}.sources s ON s.slug = si.source_slug
        LEFT JOIN ${quoteIdent(rawSchema)}.${quoteIdent(PROMOTION_AUDIT_TABLE)} pa
          ON pa.source_slug = si.source_slug
         AND pa.source_listing_id = si.source_listing_id
         AND pa.dry_run = false
        WHERE si.source_slug = $1
      )
      SELECT
        ri.audit_id,
        ri.source_slug,
        ri.source_listing_id,
        ri.image_url,
        ri.source_page_url,
        ri.alt,
        ri.source_id,
        ri.location_id,
        ri.location_name,
        CASE
          WHEN ri.location_id IS NULL THEN 'skip_no_location'
          WHEN EXISTS (
            SELECT 1
            FROM ${quoteIdent(schema)}.images img
            WHERE img.entity_type = 'location'
              AND img.entity_id = ri.location_id
              AND img.status = 'active'
              AND img.deleted_at IS NULL
              AND img.image_url = ri.image_url
          ) THEN 'skip_duplicate'
          WHEN ri.image_url ~* '(data:|\\.svg($|[?#])|\\.ico($|[?#])|\\.gif($|[?#])|favicon|sprite|tracking|pixel|placeholder|blank|transparent|loader|spinner|logo|icon|googleadservices|doubleclick|pagead|analytics|/maps/|maps\\.gstatic|maps\\.google|googleapis\\.com/maps|khms|/vt/lyrs=)'
            OR coalesce(ri.alt, '') ~* '(logo|icon|favicon|placeholder|sprite)'
          THEN 'skip_junk'
          ELSE 'promote'
        END AS classification,
        CASE
          WHEN ri.location_id IS NULL THEN 'skip_no_location'
          WHEN EXISTS (
            SELECT 1
            FROM ${quoteIdent(schema)}.images img
            WHERE img.entity_type = 'location'
              AND img.entity_id = ri.location_id
              AND img.status = 'active'
              AND img.deleted_at IS NULL
              AND img.image_url = ri.image_url
          ) THEN 'skip_duplicate'
          WHEN ri.image_url ~* '(data:|\\.svg($|[?#])|\\.ico($|[?#])|\\.gif($|[?#])|favicon|sprite|tracking|pixel|placeholder|blank|transparent|loader|spinner|logo|icon|googleadservices|doubleclick|pagead|analytics|/maps/|maps\\.gstatic|maps\\.google|googleapis\\.com/maps|khms|/vt/lyrs=)'
            OR coalesce(ri.alt, '') ~* '(logo|icon|favicon|placeholder|sprite)'
          THEN 'skip_junk'
          ELSE 'pending'
        END AS outcome,
        CASE
          WHEN ri.location_id IS NULL THEN 'listing has no resolved location_id in promotion audit'
          WHEN EXISTS (
            SELECT 1
            FROM ${quoteIdent(schema)}.images img
            WHERE img.entity_type = 'location'
              AND img.entity_id = ri.location_id
              AND img.status = 'active'
              AND img.deleted_at IS NULL
              AND img.image_url = ri.image_url
          ) THEN 'image_url already active on same location'
          WHEN ri.image_url ~* '(data:|\\.svg($|[?#])|\\.ico($|[?#])|\\.gif($|[?#])|favicon|sprite|tracking|pixel|placeholder|blank|transparent|loader|spinner|logo|icon|googleadservices|doubleclick|pagead|analytics|/maps/|maps\\.gstatic|maps\\.google|googleapis\\.com/maps|khms|/vt/lyrs=)'
            OR coalesce(ri.alt, '') ~* '(logo|icon|favicon|placeholder|sprite)'
          THEN 'url or alt matched junk asset pattern'
          ELSE NULL
        END AS reason
      FROM raw_images ri
      `,
      [SOURCE_SLUG],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

async function validatePromoteCandidates({ upload }) {
  const candidates = await rows(
    `
    SELECT *
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(AUDIT_TABLE)}
    WHERE classification = 'promote'
      AND outcome IN ('pending', 'validated', 'upload_failed', 'insert_failed')
    ORDER BY audit_id
    LIMIT $1
    `,
    [Number.isFinite(maxImages) ? maxImages : 2147483647],
  );

  let index = 0;
  for (const candidate of candidates) {
    index += 1;
    if (index > 1) {
      await sleep(delayMs);
    }
    if (index % 50 === 0 || index === candidates.length) {
      console.log(`${upload ? "promoted" : "validated"} ${index}/${candidates.length}`);
    }
    await validateOrPromoteOne(candidate, { upload });
  }
}

async function validateOrPromoteOne(candidate, { upload }) {
  let blobUrl = null;
  try {
    if (
      upload &&
      (await row(
        `
        SELECT id
        FROM ${quoteIdent(schema)}.images
        WHERE entity_type = 'location'
          AND entity_id = $1
          AND image_url = $2
          AND status = 'active'
          AND deleted_at IS NULL
        LIMIT 1
        `,
        [candidate.location_id, candidate.image_url],
      ))
    ) {
      await updateAudit(candidate.audit_id, {
        classification: "skip_duplicate",
        outcome: "skip_duplicate",
        reason: "image_url already active on same location",
      });
      return;
    }

    const downloaded = await downloadCached(candidate.image_url);
    if (!downloaded.ok) {
      await updateAudit(candidate.audit_id, {
        classification: "skip_download_failed",
        outcome: "skip_download_failed",
        reason: downloaded.reason,
      });
      return;
    }

    const validation = await validateAndProcessImage(downloaded.buffer, downloaded.contentType);
    if (!validation.ok) {
      await updateAudit(candidate.audit_id, {
        classification: "skip_junk",
        outcome: "skip_junk",
        reason: validation.reason,
        bytes: downloaded.buffer.length,
        contentType: downloaded.contentType,
        cachePath: downloaded.cachePath,
      });
      return;
    }

    const sha256 = createHash("sha256").update(validation.buffer).digest("hex");
    const common = {
      contentSha256: sha256,
      bytes: validation.buffer.length,
      width: validation.width,
      height: validation.height,
      contentType: validation.contentType,
      cachePath: downloaded.cachePath,
    };

    if (!upload) {
      await updateAudit(candidate.audit_id, {
        outcome: "validated",
        reason: "downloaded and validated; not uploaded in dry-run",
        ...common,
      });
      return;
    }

    const pathname = blobPath(candidate.location_id, validation.extension, sha256);
    const uploaded = await put(pathname, validation.buffer, {
      access: "public",
      contentType: validation.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      ...blobAccess,
    });
    blobUrl = uploaded.url;

    const inserted = await row(
      `SELECT ${quoteIdent(schema)}.attach_location_image($1, $2, $3, $4, $5, NULL::uuid) AS image_id`,
      [candidate.location_id, blobUrl, candidate.image_url, cleanAlt(candidate.alt), candidate.source_id],
    );

    await updateAudit(candidate.audit_id, {
      outcome: "inserted",
      reason: null,
      blobUrl,
      imageId: inserted.image_id,
      promotedAt: true,
      ...common,
    });
  } catch (error) {
    if (blobUrl) {
      await del(blobUrl, blobAccess).catch(() => {});
    }
    await updateAudit(candidate.audit_id, {
      outcome: blobUrl ? "insert_failed" : "upload_failed",
      reason: error.message || String(error),
      blobUrl,
    });
  }
}

async function downloadCached(url) {
  const key = createHash("sha256").update(url).digest("hex");
  const bodyPath = path.join(cacheDir, `${key}.bin`);
  const metaPath = path.join(cacheDir, `${key}.json`);
  if (existsSync(bodyPath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      return {
        ok: true,
        buffer: readFileSync(bodyPath),
        contentType: meta.contentType || "",
        cachePath: bodyPath,
      };
    } catch {
      // Fall through to refetch if cache metadata is corrupt.
    }
  }

  let lastReason = "download_failed";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; FountainHyperbaricImagePromotion/1.0)",
          accept: "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*,*/*;q=0.8",
        },
      });
      clearTimeout(timeout);
      if (!response.ok) {
        lastReason = `http_${response.status}`;
        if (response.status >= 400 && response.status < 500) break;
        await sleep(500 * attempt);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "";
      writeFileSync(bodyPath, buffer);
      writeFileSync(metaPath, `${JSON.stringify({ url, contentType, fetchedAt: new Date().toISOString() }, null, 2)}\n`);
      return { ok: true, buffer, contentType, cachePath: bodyPath };
    } catch (error) {
      clearTimeout(timeout);
      lastReason = error.name === "AbortError" ? "timeout" : error.message || "download_error";
      await sleep(500 * attempt);
    }
  }
  return { ok: false, reason: lastReason };
}

async function validateAndProcessImage(buffer, contentType) {
  if (buffer.length < 2 * 1024) {
    return { ok: false, reason: "too_small_bytes" };
  }
  if (buffer.length > 15 * 1024 * 1024) {
    return { ok: false, reason: "too_large_bytes" };
  }
  const detected = detectImageType(buffer, contentType);
  if (!detected || detected.extension === "svg") {
    return { ok: false, reason: "unsupported_content_type" };
  }

  let image = sharp(buffer, { failOn: "none", animated: false });
  let metadata;
  try {
    metadata = await image.metadata();
  } catch {
    return { ok: false, reason: "invalid_image" };
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (width < 200 || height < 200) {
    return { ok: false, reason: "too_small_dimensions" };
  }

  let output = image.rotate();
  if (Math.max(width, height) > 1600) {
    output = output.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  }
  if (detected.extension === "jpg" || detected.extension === "jpeg") {
    output = output.jpeg({ quality: 84, mozjpeg: true });
  } else if (detected.extension === "png") {
    output = output.png({ compressionLevel: 9 });
  } else if (detected.extension === "webp") {
    output = output.webp({ quality: 84 });
  } else if (detected.extension === "avif") {
    output = output.avif({ quality: 60 });
  }

  const processed = await output.toBuffer();
  const processedMetadata = await sharp(processed).metadata();
  return {
    ok: true,
    buffer: processed,
    width: processedMetadata.width || width,
    height: processedMetadata.height || height,
    extension: normalizedExtension(detected.extension),
    contentType: detected.contentType,
  };
}

function detectImageType(buffer, contentType) {
  const declared = (contentType || "").split(";")[0].trim().toLowerCase();
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", contentType: "image/png" };
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }
  if (buffer.subarray(4, 12).toString("ascii").includes("ftypavif")) {
    return { extension: "avif", contentType: "image/avif" };
  }
  if (declared === "image/svg+xml") {
    return { extension: "svg", contentType: "image/svg+xml" };
  }
  return null;
}

function normalizedExtension(extension) {
  return extension === "jpeg" ? "jpg" : extension;
}

function blobPath(locationId, extension, sha256) {
  return `listing-images/location/${locationId}/${sha256.slice(0, 20)}.${extension}`;
}

async function updateAudit(auditId, updates) {
  const assignments = [];
  const values = [];
  function set(column, value) {
    values.push(value);
    assignments.push(`${quoteIdent(column)} = $${values.length}`);
  }

  for (const [key, column] of [
    ["classification", "classification"],
    ["outcome", "outcome"],
    ["reason", "reason"],
    ["blobUrl", "blob_url"],
    ["imageId", "image_id"],
    ["contentSha256", "content_sha256"],
    ["bytes", "bytes"],
    ["width", "width"],
    ["height", "height"],
    ["contentType", "content_type"],
    ["cachePath", "cache_path"],
  ]) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      set(column, updates[key]);
    }
  }
  if (updates.promotedAt) {
    assignments.push("promoted_at = now()");
  }
  if (Object.prototype.hasOwnProperty.call(updates, "cachePath")) {
    assignments.push("downloaded_at = COALESCE(downloaded_at, now())");
  }
  assignments.push("updated_at = now()");
  values.push(auditId);
  await pool.query(
    `UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(AUDIT_TABLE)} SET ${assignments.join(", ")} WHERE audit_id = $${values.length}`,
    values,
  );
}

async function loadAuditCounts() {
  return rows(`
    SELECT classification, outcome, coalesce(reason, '') AS reason, count(*)::integer AS rows
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(AUDIT_TABLE)}
    GROUP BY classification, outcome, reason
    ORDER BY classification, outcome, rows DESC
  `);
}

async function loadCoverage() {
  return row(`
    SELECT
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.images WHERE status='active' AND deleted_at IS NULL AND coalesce(blob_url, '') <> '') AS active_blob_images,
      (SELECT count(*)::integer
       FROM ${quoteIdent(schema)}.locations l
       WHERE l.status='active'
         AND l.deleted_at IS NULL
         AND coalesce(l.is_virtual, false)=false
         AND NOT EXISTS (
           SELECT 1
           FROM ${quoteIdent(schema)}.images img
           WHERE img.entity_type='location'
             AND img.entity_id=l.id
             AND img.status='active'
             AND img.deleted_at IS NULL
         )) AS active_nonvirtual_zero_image_locations
  `);
}

async function writeReport() {
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function rows(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function row(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

function cleanAlt(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--phase") parsed.phase = args[++index];
    else if (arg === "--reclassify") parsed.reclassify = true;
    else if (arg === "--env-file") {
      parsed.envFile ||= [];
      parsed.envFile.push(args[++index]);
    } else if (arg === "--database-url") parsed.databaseUrl = args[++index];
    else if (arg === "--blob-token") parsed.blobToken = args[++index];
    else if (arg === "--schema") parsed.schema = args[++index];
    else if (arg === "--raw-schema") parsed.rawSchema = args[++index];
    else if (arg === "--delay-ms") parsed.delayMs = args[++index];
    else if (arg === "--max-images") parsed.maxImages = args[++index];
    else if (arg === "--cache-dir") parsed.cacheDir = args[++index];
    else if (arg === "--report") parsed.report = args[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
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

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
