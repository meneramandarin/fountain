#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { del, put } from "@vercel/blob";
import pg from "pg";
import sharp from "sharp";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.phaseDate || "20260708";
const tier = Number.parseInt(options.tier || "1", 10);
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const inputPath = path.resolve(ROOT, options.input || `image-review-decisions-${phaseDate}.json`);
const reportPath = path.resolve(ROOT, options.report || `image-review-decisions-ingest-report-${phaseDate}.json`);
const imageLogTable = options.imageLogTable || `browser_swarm_image_ingest_${phaseDate}`;
const dryRun = Boolean(options.dryRun);

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

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
if (!blobToken && !dryRun) {
  throw new Error("Missing Blob token.");
}

const decisions = JSON.parse(readFileSync(inputPath, "utf8"));
const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });
const report = {
  phaseDate,
  tier,
  inputPath: path.relative(ROOT, inputPath),
  imageLogTable: `${rawSchema}.${imageLogTable}`,
  dryRun,
  startedAt: new Date().toISOString(),
  completedAt: null,
  decisions: {
    approved: Array.isArray(decisions.approved) ? decisions.approved.length : 0,
    rejected: Array.isArray(decisions.rejected) ? decisions.rejected.length : 0,
    undecided: Number(decisions.undecided_count || 0),
  },
  coverageBefore: null,
  coverageAfter: null,
  approved: {
    proposed: 0,
    ingested: 0,
    failedValidation: 0,
    skipped: 0,
    skippedByReason: {},
    failuresByReason: {},
  },
  rejected: {
    logged: 0,
    alreadyLogged: 0,
    skipped: 0,
  },
  spotChecks: [],
  failures: [],
};

try {
  await client.connect();
  await ensureImageLogTable();
  report.coverageBefore = await loadCoverage();
  await logHumanRejections(decisions.rejected || []);
  await ingestApprovals(decisions.approved || []);
  report.coverageAfter = await loadCoverage();
  report.spotChecks = await loadSpotChecks();
  report.completedAt = new Date().toISOString();
  writeJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${path.relative(ROOT, reportPath)}`);
} finally {
  await client.end();
}

async function ensureImageLogTable() {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(imageLogTable)} (
      id bigserial PRIMARY KEY,
      tier integer NOT NULL,
      site_origin text NOT NULL,
      location_id integer NOT NULL,
      image_url text NOT NULL,
      source_page_url text,
      llm_confidence numeric,
      outcome text NOT NULL,
      reason text,
      blob_url text,
      content_sha256 text,
      width integer,
      height integer,
      bytes integer,
      logged_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function logHumanRejections(rejected) {
  for (const image of rejected) {
    const locationId = Number(image.location_id);
    const imageUrl = cleanText(image.image_url, 2000);
    if (!locationId || !imageUrl) {
      report.rejected.skipped += 1;
      continue;
    }
    if (await hasImageLog(locationId, imageUrl, "human_rejected")) {
      report.rejected.alreadyLogged += 1;
      continue;
    }
    if (!dryRun) {
      await logImage(image, "human_rejected", "manual_review_rejected", {
        llmConfidence: null,
      });
    }
    report.rejected.logged += 1;
  }
}

async function ingestApprovals(approved) {
  const perLocationInserted = new Map();
  for (const image of approved) {
    report.approved.proposed += 1;
    const locationId = Number(image.location_id);
    const imageUrl = cleanText(image.image_url, 2000);
    if (!locationId || !imageUrl) {
      await skipApproved(image, "missing_location_or_image_url");
      continue;
    }

    const location = await loadLocation(locationId);
    if (!location) {
      await skipApproved(image, "location_not_found");
      continue;
    }

    const activeCount = await activeImageCount(locationId);
    const insertedForLocation = perLocationInserted.get(locationId) || 0;
    if (activeCount + insertedForLocation >= 3) {
      await skipApproved(image, "location_image_cap_reached");
      continue;
    }

    const downloaded = await downloadImage(imageUrl);
    if (!downloaded.ok) {
      await failValidation(image, downloaded.reason);
      continue;
    }

    const validation = await validateAndProcessImage(downloaded.buffer, downloaded.contentType);
    if (!validation.ok) {
      await failValidation(image, validation.reason, { bytes: downloaded.buffer.length });
      continue;
    }

    const sha256 = createHash("sha256").update(validation.buffer).digest("hex");
    const duplicate = await row(`
      SELECT id
      FROM ${quoteIdent(schema)}.images
      WHERE entity_type = 'location'
        AND entity_id = $1
        AND content_sha256 = $2
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `, [locationId, sha256]);
    if (duplicate) {
      await skipApproved(image, "duplicate_content_same_location", {
        contentSha256: sha256,
        width: validation.width,
        height: validation.height,
        bytes: validation.buffer.length,
      });
      continue;
    }

    const pathname = `listing-images/browser-swarm/location/${locationId}/${sha256.slice(0, 20)}.${validation.extension}`;
    let uploaded = null;
    try {
      if (!dryRun) {
        uploaded = await put(pathname, validation.buffer, {
          access: "public",
          contentType: validation.contentType,
          addRandomSuffix: false,
          allowOverwrite: true,
          token: blobToken,
        });
        await insertImage(locationId, uploaded.url, imageUrl, sha256, makeAlt(location));
      }
      report.approved.ingested += 1;
      perLocationInserted.set(locationId, insertedForLocation + 1);
      await logImage(image, dryRun ? "dry_run_ingested" : "ingested", "manual_review_approved", {
        blobUrl: uploaded?.url || null,
        contentSha256: sha256,
        width: validation.width,
        height: validation.height,
        bytes: validation.buffer.length,
        llmConfidence: null,
      });
    } catch (error) {
      if (uploaded?.url) {
        await del(uploaded.url, { token: blobToken }).catch(() => {});
      }
      await failValidation(image, error.message || String(error), {
        contentSha256: sha256,
        width: validation.width,
        height: validation.height,
        bytes: validation.buffer.length,
      });
    }
  }
}

async function skipApproved(image, reason, extras = {}) {
  report.approved.skipped += 1;
  increment(report.approved.skippedByReason, reason);
  await logImage(image, "skipped", reason, extras);
}

async function failValidation(image, reason, extras = {}) {
  report.approved.failedValidation += 1;
  increment(report.approved.failuresByReason, reason);
  report.failures.push({
    location_id: Number(image.location_id) || null,
    image_url: image.image_url || null,
    reason,
  });
  await logImage(image, "validation_failed", reason, extras);
}

async function downloadImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "FountainBot/1.0 (+https://fountain.clinic)",
        accept: "image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` };
    }
    const arrayBuffer = await response.arrayBuffer();
    return { ok: true, buffer: Buffer.from(arrayBuffer), contentType: response.headers.get("content-type") || "" };
  } catch (error) {
    clearTimeout(timeout);
    return { ok: false, reason: error.name === "AbortError" ? "timeout" : error.message || "fetch_failed" };
  }
}

async function validateAndProcessImage(buffer, contentType) {
  if (buffer.length < 15 * 1024) {
    return { ok: false, reason: "too_small_bytes" };
  }
  if (buffer.length > 15 * 1024 * 1024) {
    return { ok: false, reason: "too_large_bytes" };
  }
  const detected = detectImageType(buffer, contentType);
  if (!detected || ["svg", "ico", "gif"].includes(detected.extension)) {
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
  if (Math.max(width, height) < 500) {
    return { ok: false, reason: "too_small_dimensions" };
  }
  if (width / height > 4 || height / width > 2.5) {
    return { ok: false, reason: "logo_like_aspect_ratio" };
  }
  let output = image.rotate();
  if (Math.max(width, height) > 1600) {
    output = output.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  }
  if (detected.extension === "jpg") {
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
    extension: detected.extension,
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
  if (buffer.subarray(0, 6).toString("ascii").startsWith("GIF")) {
    return { extension: "gif", contentType: "image/gif" };
  }
  if (declared === "image/svg+xml") {
    return { extension: "svg", contentType: "image/svg+xml" };
  }
  return null;
}

async function insertImage(locationId, blobUrl, imageUrl, sha256, alt) {
  await client.query(`
    INSERT INTO ${quoteIdent(schema)}.images (
      entity_type,
      entity_id,
      image_url,
      blob_url,
      content_sha256,
      alt,
      source_id,
      status,
      data_origin,
      verification_status
    )
    VALUES ('location', $1, $2, $3, $4, $5, NULL, 'active', 'scraped', 'unverified')
  `, [locationId, imageUrl, blobUrl, sha256, alt]);
}

async function logImage(image, outcome, reason, extras = {}) {
  if (dryRun && outcome !== "dry_run_ingested") {
    return;
  }
  await client.query(`
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(imageLogTable)} (
      tier, site_origin, location_id, image_url, source_page_url, llm_confidence,
      outcome, reason, blob_url, content_sha256, width, height, bytes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, [
    tier,
    siteOriginFor(image),
    Number(image.location_id),
    cleanText(image.image_url, 2000),
    image.source_page_url || null,
    extras.llmConfidence ?? null,
    outcome,
    reason,
    extras.blobUrl || null,
    extras.contentSha256 || null,
    extras.width || null,
    extras.height || null,
    extras.bytes || null,
  ]);
}

async function hasImageLog(locationId, imageUrl, outcome) {
  const existing = await row(`
    SELECT id
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(imageLogTable)}
    WHERE location_id = $1
      AND image_url = $2
      AND outcome = $3
    LIMIT 1
  `, [locationId, imageUrl, outcome]);
  return Boolean(existing);
}

async function loadLocation(locationId) {
  return row(`
    SELECT id, name
    FROM ${quoteIdent(schema)}.locations
    WHERE id = $1
      AND deleted_at IS NULL
    LIMIT 1
  `, [locationId]);
}

async function activeImageCount(locationId) {
  const result = await row(`
    SELECT count(*)::integer AS count
    FROM ${quoteIdent(schema)}.images
    WHERE entity_type = 'location'
      AND entity_id = $1
      AND status = 'active'
      AND deleted_at IS NULL
  `, [locationId]);
  return Number(result?.count || 0);
}

async function loadCoverage() {
  return row(`
    SELECT
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.locations l WHERE l.status = 'active' AND l.deleted_at IS NULL AND coalesce(l.is_virtual, false) = false AND NOT EXISTS (SELECT 1 FROM ${quoteIdent(schema)}.images img WHERE img.entity_type = 'location' AND img.entity_id = l.id AND img.status = 'active' AND img.deleted_at IS NULL)) AS zero_image_locations,
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.images WHERE status = 'active' AND deleted_at IS NULL) AS active_images
  `);
}

async function loadSpotChecks() {
  const result = await client.query(`
    SELECT location_id, image_url, blob_url, outcome, reason
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(imageLogTable)}
    WHERE outcome IN ('ingested', 'human_rejected')
      AND logged_at >= $1::timestamptz
    ORDER BY id
    LIMIT 20
  `, [report.startedAt]);
  return result.rows;
}

async function row(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

function siteOriginFor(image) {
  for (const value of [image.source_page_url, image.image_url]) {
    try {
      return new URL(value).origin;
    } catch {
      // Try the next value.
    }
  }
  return "manual-review";
}

function makeAlt(location) {
  return cleanText(location?.name || "Clinic photo", 180);
}

function increment(object, key) {
  object[key] = (object[key] || 0) + 1;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizePostgresConnectionString(value) {
  const url = new URL(value);
  if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode"))) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") parsed.input = args[++index];
    else if (arg === "--report") parsed.report = args[++index];
    else if (arg === "--tier") parsed.tier = args[++index];
    else if (arg === "--phase-date") parsed.phaseDate = args[++index];
    else if (arg === "--schema") parsed.schema = args[++index];
    else if (arg === "--raw-schema") parsed.rawSchema = args[++index];
    else if (arg === "--image-log-table") parsed.imageLogTable = args[++index];
    else if (arg === "--database-url") parsed.databaseUrl = args[++index];
    else if (arg === "--blob-token") parsed.blobToken = args[++index];
    else if (arg === "--dry-run") parsed.dryRun = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return parsed;
}
