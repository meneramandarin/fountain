import { put } from "@vercel/blob";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const CONTENT_TYPES = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

const options = parseArgs(process.argv.slice(2));
const dryRun = options.dryRun;
const dbPath = options.db || "canonical.db";
const prefix = (options.prefix || "listing-images/remote").replace(/^\/+|\/+$/g, "");
const source = options.source || null;
const limit = options.limit ? Number.parseInt(options.limit, 10) : 100;
const maxBytes = options.maxBytes ? Number.parseInt(options.maxBytes, 10) : 5 * 1024 * 1024;
const delayMs = options.delayMs ? Number.parseInt(options.delayMs, 10) : 150;
const timeoutMs = options.timeoutMs ? Number.parseInt(options.timeoutMs, 10) : 15_000;
const sqliteBusyTimeoutMs = options.sqliteBusyTimeoutMs ? Number.parseInt(options.sqliteBusyTimeoutMs, 10) : 10_000;
const progressEvery = options.progressEvery ? Number.parseInt(options.progressEvery, 10) : 25;

if (!dryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required unless --dry-run is set.");
}

const rows = withDb((db) => {
  ensureBlobColumns(db);
  return selectRows(db, { source, limit });
});
const alreadyUploaded = withDb((db) => loadExistingHashes(db));
const uploadedThisRun = new Map();
let fetched = 0;
let uploaded = 0;
let reused = 0;
let updatedRows = 0;
let skipped = 0;
const errors = [];

for (const row of rows) {
  let result;
  try {
    result = await fetchImage(row.image_url, maxBytes, timeoutMs);
  } catch (error) {
    skipped += 1;
    errors.push({ id: row.id, source: row.source_slug, reason: error.message });
    logProgress();
    continue;
  }
  fetched += 1;

  const hash = sha256(result.bytes);
  const ext = extensionFor(result.contentType, row.image_url);
  const pathname = `${prefix}/${hash.slice(0, 2)}/${hash}${ext}`;
  let blobUrl = uploadedThisRun.get(hash) || alreadyUploaded.get(hash);

  if (blobUrl) {
    reused += 1;
  } else {
    blobUrl = dryRun ? `dry-run://${pathname}` : await uploadBlob(pathname, result.bytes, result.contentType);
    uploadedThisRun.set(hash, blobUrl);
    uploaded += dryRun ? 0 : 1;
  }

  if (!dryRun) {
    await updateImageRow(row.id, hash, blobUrl);
  }
  updatedRows += 1;

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  logProgress();
}

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "upload",
      db: dbPath,
      source,
      limit,
      max_bytes: maxBytes,
      timeout_ms: timeoutMs,
      selected_rows: rows.length,
      fetched,
      uploaded,
      reused,
      rows_to_update: updatedRows,
      skipped,
      errors: errors.slice(0, 20),
    },
    null,
    2,
  ),
);

function withDb(callback) {
  const database = new Database(dbPath);
  database.pragma(`busy_timeout = ${sqliteBusyTimeoutMs}`);
  try {
    return callback(database);
  } finally {
    database.close();
  }
}

function logProgress() {
  const processed = fetched + skipped;
  if (progressEvery > 0 && processed > 0 && processed % progressEvery === 0) {
    console.error(
      `progress source=${source || "all"} processed=${processed}/${rows.length} fetched=${fetched} skipped=${skipped} uploaded=${uploaded} reused=${reused}`,
    );
  }
}

async function updateImageRow(id, hash, blobUrl, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      withDb((db) => {
        db.prepare("UPDATE images SET content_sha256 = ?, blob_url = ? WHERE id = ?").run(hash, blobUrl, id);
      });
      return;
    } catch (error) {
      if (error.code !== "SQLITE_BUSY" || attempt === attempts) {
        throw error;
      }
      await sleep(500 * attempt);
    }
  }
}

function selectRows(database, { source: sourceSlug, limit: rowLimit }) {
  const where = [
    "(i.local_path IS NULL OR i.local_path = '')",
    "i.image_url IS NOT NULL",
    "i.image_url <> ''",
    "(i.blob_url IS NULL OR i.blob_url = '')",
    "i.image_url NOT LIKE 'data:%'",
  ];
  const values = [];
  if (sourceSlug) {
    where.push("s.slug = ?");
    values.push(sourceSlug);
  }

  values.push(rowLimit);
  return database
    .prepare(
      `
      SELECT i.id, i.image_url, s.slug AS source_slug
      FROM images i
      LEFT JOIN sources s ON s.id = i.source_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.slug, i.entity_type, i.entity_id, i.id
      LIMIT ?
    `,
    )
    .all(...values);
}

function loadExistingHashes(database) {
  const hashes = new Map();
  const rows = database
    .prepare(
      `
      SELECT content_sha256, blob_url
      FROM images
      WHERE content_sha256 IS NOT NULL
        AND content_sha256 <> ''
        AND blob_url IS NOT NULL
        AND blob_url <> ''
    `,
    )
    .all();
  for (const row of rows) {
    hashes.set(row.content_sha256, row.blob_url);
  }
  return hashes;
}

async function fetchImage(url, maxSize, requestTimeoutMs) {
  const response = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`non-image content-type ${contentType || "unknown"}`);
  }

  const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
  if (contentLength > maxSize) {
    throw new Error(`too large ${contentLength}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxSize) {
    throw new Error(`too large ${bytes.length}`);
  }
  if (!bytes.length) {
    throw new Error("empty response");
  }

  return { bytes, contentType };
}

async function uploadBlob(pathname, bytes, contentType) {
  const blob = await put(pathname, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
  return blob.url;
}

function ensureBlobColumns(database) {
  const columns = new Set(database.prepare("PRAGMA table_info(images)").all().map((column) => column.name));
  if (!columns.has("blob_url")) {
    database.prepare("ALTER TABLE images ADD COLUMN blob_url TEXT").run();
  }
  if (!columns.has("content_sha256")) {
    database.prepare("ALTER TABLE images ADD COLUMN content_sha256 TEXT").run();
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function extensionFor(contentType, url) {
  if (CONTENT_TYPES[contentType]) {
    return CONTENT_TYPES[contentType];
  }
  try {
    const ext = new URL(url).pathname.match(/\.(avif|gif|jpe?g|png|webp)$/i)?.[0]?.toLowerCase();
    if (ext) {
      return ext === ".jpe" ? ".jpg" : ext;
    }
  } catch {
    // Fall through to a safe binary extension.
  }
  return ".img";
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
      parsed[key] = args[index + 1];
      index += 1;
    }
  }
  return parsed;
}
