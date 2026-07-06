import { put } from "@vercel/blob";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const IMAGE_TYPES = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
for (const envFile of options.envFile || []) {
  loadEnvFile(path.resolve(ROOT, envFile));
}

const cachePath = path.resolve(ROOT, options.cacheDb || "data/databases/location_image_backfill.sqlite");
const canonicalPath = path.resolve(ROOT, options.db || "canonical.db");
const dryRun = Boolean(options.dryRun);
const limit = options.limit ? Number.parseInt(options.limit, 10) : 500;
const timeoutMs = options.timeoutMs ? Number.parseInt(options.timeoutMs, 10) : 15_000;
const maxBytes = options.maxBytes ? Number.parseInt(options.maxBytes, 10) : 5 * 1024 * 1024;
const minBytes = options.minBytes ? Number.parseInt(options.minBytes, 10) : 4 * 1024;
const delayMs = options.delayMs ? Number.parseInt(options.delayMs, 10) : 150;
const progressEvery = options.progressEvery ? Number.parseInt(options.progressEvery, 10) : 25;
const prefix = (options.prefix || "listing-images/site-backfill").replace(/^\/+|\/+$/g, "");

if (!dryRun && !hasBlobAuth()) {
  throw new Error("BLOB_READ_WRITE_TOKEN or VERCEL_OIDC_TOKEN+BLOB_STORE_ID is required unless --dry-run is set.");
}

const cache = new Database(cachePath);
cache.pragma("busy_timeout = 10000");
const canonical = existsSync(canonicalPath) ? new Database(canonicalPath, { readonly: true, fileMustExist: true }) : null;

const existingUploads = canonical ? loadExistingUploads(canonical) : new Map();
const uploadedThisRun = new Map();
const rows = cache
  .prepare(
    `
    SELECT id, image_url, content_sha256, blob_url
    FROM location_image_backfill
    WHERE COALESCE(image_url, '') <> ''
      AND COALESCE(blob_url, '') = ''
    ORDER BY id
    LIMIT ?
    `,
  )
  .all(limit);

let fetched = 0;
let uploaded = 0;
let reused = 0;
let updated = 0;
let skipped = 0;
const errors = [];

try {
  for (const row of rows) {
    let image;
    try {
      image = await fetchImage(row.image_url);
    } catch (error) {
      skipped += 1;
      errors.push({ id: row.id, reason: error.message });
      logProgress();
      continue;
    }
    fetched += 1;

    let blobUrl = existingUploads.get(image.contentSha256) || uploadedThisRun.get(image.contentSha256) || null;
    if (blobUrl) {
      reused += 1;
    } else {
      const pathname = `${prefix}/${image.contentSha256.slice(0, 2)}/${image.contentSha256}${image.ext}`;
      blobUrl = dryRun ? `dry-run://${pathname}` : await uploadBlob(pathname, image.bytes, image.contentType);
      uploadedThisRun.set(image.contentSha256, blobUrl);
      uploaded += dryRun ? 0 : 1;
    }

    if (!dryRun) {
      cache
        .prepare(
          `
          UPDATE location_image_backfill
          SET content_sha256 = ?,
              blob_url = ?,
              fetched_at = ?
          WHERE id = ?
          `,
        )
        .run(image.contentSha256, blobUrl, new Date().toISOString(), row.id);
    }
    updated += 1;

    if (delayMs > 0) {
      await sleep(delayMs);
    }
    logProgress();
  }
} finally {
  cache.close();
  canonical?.close();
}

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "upload",
      cache_db: cachePath,
      selected_rows: rows.length,
      fetched,
      uploaded,
      reused,
      updated,
      skipped,
      errors: errors.slice(0, 25),
    },
    null,
    2,
  ),
);

async function fetchImage(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  if (!IMAGE_TYPES[contentType]) {
    throw new Error(`non-image content-type ${contentType || "unknown"}`);
  }
  const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
  if (contentLength > maxBytes) {
    throw new Error(`too large ${contentLength}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new Error(`too large ${bytes.length}`);
  }
  if (bytes.length < minBytes) {
    throw new Error(`too small ${bytes.length}`);
  }
  return { bytes, contentType, ext: IMAGE_TYPES[contentType], contentSha256: sha256(bytes) };
}

async function uploadBlob(pathname, bytes, contentType) {
  const blob = await put(pathname, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    ...blobAuthOptions(),
  });
  return blob.url;
}

function loadExistingUploads(database) {
  const map = new Map();
  const rows = database
    .prepare(
      `
      SELECT content_sha256, blob_url
      FROM images
      WHERE COALESCE(content_sha256, '') <> ''
        AND COALESCE(blob_url, '') <> ''
      `,
    )
    .all();
  for (const row of rows) {
    map.set(row.content_sha256, row.blob_url);
  }
  return map;
}

function logProgress() {
  const processed = fetched + skipped;
  if (progressEvery > 0 && processed > 0 && processed % progressEvery === 0) {
    console.error(
      `progress processed=${processed}/${rows.length} fetched=${fetched} uploaded=${uploaded} reused=${reused} skipped=${skipped}`,
    );
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasBlobAuth() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));
}

function blobAuthOptions() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN };
  }
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return { oidcToken: process.env.VERCEL_OIDC_TOKEN, storeId: process.env.BLOB_STORE_ID };
  }
  return {};
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
  const parsed = { dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key === "envFile") {
        parsed.envFile = [...(parsed.envFile || []), args[index + 1]];
      } else {
        parsed[key] = args[index + 1];
      }
      index += 1;
    }
  }
  return parsed;
}
