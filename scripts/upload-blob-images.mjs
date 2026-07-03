import { put } from "@vercel/blob";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTENT_TYPES = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const options = parseArgs(process.argv.slice(2));
const dbPath = path.resolve(ROOT, options.db || "canonical.db");
const blocklistPath = path.resolve(ROOT, options.blocklist || "src/lib/placeholder-image-paths.json");
const prefix = (options.prefix || "listing-images").replace(/^\/+|\/+$/g, "");
const dryRun = options.dryRun;
const limit = options.limit ? Number.parseInt(options.limit, 10) : null;

if (!dryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required unless --dry-run is set.");
}

const blocklist = new Set(JSON.parse(readFileSync(blocklistPath, "utf8")));
const rows = withDb((db) => {
  ensureBlobColumns(db);
  return db
    .prepare(
      `
      SELECT id, local_path, blob_url, content_sha256
      FROM images
      WHERE local_path IS NOT NULL
        AND local_path <> ''
        AND (blob_url IS NULL OR blob_url = '')
    `,
    )
    .all();
});

const filesByHash = new Map();
let skippedBlocklisted = 0;
let skippedMissing = 0;

for (const row of rows) {
  if (blocklist.has(row.local_path)) {
    skippedBlocklisted += 1;
    continue;
  }
  const absolutePath = path.resolve(ROOT, row.local_path);
  if (!existsSync(absolutePath)) {
    skippedMissing += 1;
    continue;
  }
  const hash = sha256(absolutePath);
  const ext = normalizedExt(absolutePath);
  const pathname = `${prefix}/${hash.slice(0, 2)}/${hash}${ext}`;
  const group = filesByHash.get(hash) || {
    hash,
    absolutePath,
    ext,
    pathname,
    ids: [],
  };
  group.ids.push(row.id);
  filesByHash.set(hash, group);
}

const groups = Array.from(filesByHash.values()).slice(0, limit || undefined);
let uploaded = 0;
let updatedRows = 0;

for (const group of groups) {
  let blobUrl = `dry-run://${group.pathname}`;
  if (!dryRun) {
    const blob = await put(group.pathname, createReadStream(group.absolutePath), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: CONTENT_TYPES[group.ext] || "application/octet-stream",
    });
    blobUrl = blob.url;
    uploaded += 1;
  }

  if (!dryRun) {
    withDb((db) => {
      const updateRows = db.prepare("UPDATE images SET content_sha256 = ?, blob_url = ? WHERE id = ?");
      const updateGroup = db.transaction(() => {
        for (const id of group.ids) {
          updateRows.run(group.hash, blobUrl, id);
        }
      });
      updateGroup();
    });
  }
  updatedRows += group.ids.length;
}

function withDb(callback) {
  const database = new Database(dbPath);
  try {
    return callback(database);
  } finally {
    database.close();
  }
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

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function normalizedExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".jpe" ? ".jpg" : ext || ".img";
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

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "upload",
      db: dbPath,
      prefix,
      candidate_rows: rows.length,
      skipped_blocklisted: skippedBlocklisted,
      skipped_missing: skippedMissing,
      unique_files: filesByHash.size,
      processed_unique_files: groups.length,
      uploaded,
      rows_to_update: updatedRows,
    },
    null,
    2,
  ),
);
