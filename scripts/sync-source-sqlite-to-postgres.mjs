#!/usr/bin/env node

import crypto from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const DB_DIR = path.join(ROOT, "data/databases");
const AUXILIARY_DBS = new Set(["blob_images.sqlite", "google_reviews.sqlite", "location_image_backfill.sqlite"]);
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

const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const chunkSize = Math.max(1, Number.parseInt(options.chunkSize || "300", 10));
const includePages = Boolean(options.includePages);
const hashFiles = Boolean(options.hashFiles);
const keepLocalPaths = Boolean(options.keepLocalPaths);
const force = Boolean(options.force);

const sourcePaths = resolveSourcePaths();
const client = new Client({ connectionString });

try {
  await client.connect();
  await assertRawSchema(client);
  for (const sourcePath of sourcePaths) {
    await syncSource(client, sourcePath);
  }
} finally {
  await client.end();
}

function resolveSourcePaths() {
  if (options.db) {
    return [path.resolve(ROOT, options.db)];
  }
  const files = readdirSync(DB_DIR)
    .filter((file) => file.endsWith(".sqlite") && !AUXILIARY_DBS.has(file))
    .sort();
  const selected = options.source
    ? files.filter((file) => file.replace(/\.sqlite$/, "") === options.source)
    : files;
  if (!selected.length) {
    throw new Error(options.source ? `No source DB found for ${options.source}` : "No source DBs found.");
  }
  if (!options.all && !options.source) {
    throw new Error("Pass --source <slug>, --db <path>, or --all.");
  }
  return selected.map((file) => path.join(DB_DIR, file));
}

async function assertRawSchema(pgClient) {
  const result = await pgClient.query("SELECT to_regclass($1) AS table_name", [`${rawSchema}.source_databases`]);
  if (!result.rows[0].table_name) {
    throw new Error(`Missing ${rawSchema}.source_databases. Run npm run db:migrate first.`);
  }
}

async function syncSource(pgClient, sourcePath) {
  const slug = path.basename(sourcePath, ".sqlite");
  const stat = statSync(sourcePath);
  const fileSha256 = hashFiles ? sha256File(sourcePath) : null;
  const existing = await pgClient.query(
    `
    SELECT file_size_bytes, file_mtime_ms, file_sha256
    FROM ${quoteIdent(rawSchema)}.source_databases
    WHERE source_slug = $1
    `,
    [slug],
  );
  const mtimeMs = Math.round(stat.mtimeMs);
  if (
    !force &&
    existing.rowCount &&
    Number(existing.rows[0].file_size_bytes) === stat.size &&
    Number(existing.rows[0].file_mtime_ms) === mtimeMs &&
    (!hashFiles || existing.rows[0].file_sha256 === fileSha256)
  ) {
    console.log(`Skipped unchanged ${slug}`);
    return;
  }

  const sqlite = new Database(sourcePath, { readonly: true, fileMustExist: true });
  sqlite.pragma("query_only = ON");
  try {
    const metadata = loadMetadata(sqlite);
    const counts = tableCounts(sqlite);
    await pgClient.query("BEGIN");
    const run = await createImportRun(pgClient, slug, sourcePath, stat.size, mtimeMs, fileSha256, metadata, counts);
    try {
      await replaceSourceRows(pgClient, slug);
      await insertListings(pgClient, slug, sqlite);
      await insertFields(pgClient, slug, sqlite);
      await insertImages(pgClient, slug, sqlite);
      await insertReviews(pgClient, slug, sqlite);
      await finishImportRun(pgClient, slug, run.id, "complete", counts, null);
      await pgClient.query("COMMIT");
      console.log(`Synced ${slug}: ${counts.listings} listings, ${counts.images} images, ${counts.reviews} reviews, ${counts.fields} fields`);
    } catch (error) {
      await finishImportRun(pgClient, slug, run.id, "failed", counts, error.message);
      throw error;
    }
  } catch (error) {
    await pgClient.query("ROLLBACK");
    throw error;
  } finally {
    sqlite.close();
  }
}

function loadMetadata(sqlite) {
  if (!hasTable(sqlite, "source_metadata")) {
    return {};
  }
  const metadata = {};
  for (const row of sqlite.prepare("SELECT key, value FROM source_metadata").all()) {
    metadata[row.key] = parseJsonish(row.value);
  }
  return metadata;
}

function tableCounts(sqlite) {
  return {
    listings: countTable(sqlite, "listings"),
    images: countTable(sqlite, "images"),
    reviews: countTable(sqlite, "reviews"),
    fields: countTable(sqlite, "listing_fields"),
    pages: includePages ? countTable(sqlite, "pages") : countTable(sqlite, "pages"),
  };
}

function countTable(sqlite, table) {
  if (!hasTable(sqlite, table)) {
    return 0;
  }
  return sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quoteSqliteIdent(table)}`).get().count;
}

async function createImportRun(pgClient, slug, sourcePath, fileSize, mtimeMs, fileSha256, metadata, counts) {
  await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.source_databases(
      source_slug, source_db_path, file_size_bytes, file_mtime_ms, file_sha256,
      listing_count, image_count, review_count, field_count, page_count,
      metadata, last_synced_at, sync_status, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now(), 'running', now())
    ON CONFLICT (source_slug) DO UPDATE SET
      source_db_path = EXCLUDED.source_db_path,
      file_size_bytes = EXCLUDED.file_size_bytes,
      file_mtime_ms = EXCLUDED.file_mtime_ms,
      file_sha256 = EXCLUDED.file_sha256,
      listing_count = EXCLUDED.listing_count,
      image_count = EXCLUDED.image_count,
      review_count = EXCLUDED.review_count,
      field_count = EXCLUDED.field_count,
      page_count = EXCLUDED.page_count,
      metadata = EXCLUDED.metadata,
      last_synced_at = now(),
      sync_status = 'running',
      updated_at = now()
    `,
    [
      slug,
      sourcePath,
      fileSize,
      mtimeMs,
      fileSha256,
      counts.listings,
      counts.images,
      counts.reviews,
      counts.fields,
      includePages ? counts.pages : counts.pages,
      JSON.stringify(metadata),
    ],
  );
  const run = await pgClient.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.import_runs(source_slug)
    VALUES ($1)
    RETURNING id
    `,
    [slug],
  );
  return run.rows[0];
}

async function finishImportRun(pgClient, slug, runId, status, counts, error) {
  await pgClient.query(
    `
    UPDATE ${quoteIdent(rawSchema)}.import_runs
    SET finished_at = now(),
        status = $2,
        listing_count = $3,
        image_count = $4,
        review_count = $5,
        field_count = $6,
        error = $7
    WHERE id = $1
    `,
    [runId, status, counts.listings, counts.images, counts.reviews, counts.fields, error],
  );
  await pgClient.query(
    `
    UPDATE ${quoteIdent(rawSchema)}.source_databases
    SET sync_status = $2,
        updated_at = now()
    WHERE source_slug = $1
    `,
    [slug, status],
  );
}

async function replaceSourceRows(pgClient, slug) {
  await pgClient.query(`DELETE FROM ${quoteIdent(rawSchema)}.source_listings WHERE source_slug = $1`, [slug]);
}

async function insertListings(pgClient, slug, sqlite) {
  if (!hasTable(sqlite, "listings")) {
    return;
  }
  const rows = sqlite.prepare("SELECT * FROM listings ORDER BY id").all();
  for (const chunk of chunks(rows, chunkSize)) {
    const values = [];
    const tuples = chunk.map((row, index) => {
      values.push(slug, row.id, row.source_url, row.name || null, row.extracted_at || null, JSON.stringify(row));
      const offset = index * 6;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::jsonb, now())`;
    });
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.source_listings(
        source_slug, source_listing_id, source_url, name, extracted_at, payload, synced_at
      )
      VALUES ${tuples.join(", ")}
      ON CONFLICT (source_slug, source_listing_id) DO UPDATE SET
        source_url = EXCLUDED.source_url,
        name = EXCLUDED.name,
        extracted_at = EXCLUDED.extracted_at,
        payload = EXCLUDED.payload,
        synced_at = now()
      `,
      values,
    );
  }
}

async function insertFields(pgClient, slug, sqlite) {
  if (!hasTable(sqlite, "listing_fields")) {
    return;
  }
  const rows = sqlite.prepare("SELECT listing_id, field_name, field_value FROM listing_fields ORDER BY listing_id, field_name").all();
  for (const chunk of chunks(rows, chunkSize)) {
    const values = [];
    const tuples = chunk.map((row, index) => {
      values.push(slug, row.listing_id, row.field_name, row.field_value);
      const offset = index * 4;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, now())`;
    });
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.source_listing_fields(
        source_slug, source_listing_id, field_name, field_value, synced_at
      )
      VALUES ${tuples.join(", ")}
      ON CONFLICT (source_slug, source_listing_id, field_name) DO UPDATE SET
        field_value = EXCLUDED.field_value,
        synced_at = now()
      `,
      values,
    );
  }
}

async function insertImages(pgClient, slug, sqlite) {
  if (!hasTable(sqlite, "images")) {
    return;
  }
  const rows = sqlite.prepare("SELECT listing_id, image_url, local_path, alt, source_page_url FROM images WHERE listing_id IS NOT NULL ORDER BY listing_id, id").all();
  for (const chunk of chunks(rows, chunkSize)) {
    const values = [];
    const tuples = chunk.map((row, index) => {
      values.push(slug, row.listing_id, row.image_url, keepLocalPaths ? row.local_path : null, row.alt, row.source_page_url);
      const offset = index * 6;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, now())`;
    });
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.source_images(
        source_slug, source_listing_id, image_url, local_path, alt, source_page_url, synced_at
      )
      VALUES ${tuples.join(", ")}
      ON CONFLICT (source_slug, source_listing_id, image_url) DO UPDATE SET
        local_path = EXCLUDED.local_path,
        alt = EXCLUDED.alt,
        source_page_url = EXCLUDED.source_page_url,
        synced_at = now()
      `,
      values,
    );
  }
}

async function insertReviews(pgClient, slug, sqlite) {
  if (!hasTable(sqlite, "reviews")) {
    return;
  }
  const rows = sqlite.prepare("SELECT listing_id, reviewer, rating, review_date, body, raw_json FROM reviews WHERE listing_id IS NOT NULL ORDER BY listing_id, id").all();
  const withOrdinal = rows.map((row, index) => ({ ...row, review_ordinal: index + 1 }));
  for (const chunk of chunks(withOrdinal, chunkSize)) {
    const values = [];
    const tuples = chunk.map((row, index) => {
      values.push(slug, row.listing_id, row.review_ordinal, row.reviewer, row.rating, row.review_date, row.body, row.raw_json);
      const offset = index * 8;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, now())`;
    });
    await pgClient.query(
      `
      INSERT INTO ${quoteIdent(rawSchema)}.source_reviews(
        source_slug, source_listing_id, review_ordinal, reviewer, rating, review_date, body, raw_json, synced_at
      )
      VALUES ${tuples.join(", ")}
      ON CONFLICT (source_slug, source_listing_id, review_ordinal) DO UPDATE SET
        reviewer = EXCLUDED.reviewer,
        rating = EXCLUDED.rating,
        review_date = EXCLUDED.review_date,
        body = EXCLUDED.body,
        raw_json = EXCLUDED.raw_json,
        synced_at = now()
      `,
      values,
    );
  }
}

function hasTable(sqlite, table) {
  return sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).count > 0;
}

function parseJsonish(value) {
  if (value == null || value === "") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function quoteSqliteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
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
  const parsed = {
    all: false,
    force: false,
    includePages: false,
    hashFiles: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--all") {
      parsed.all = true;
    } else if (arg === "--force") {
      parsed.force = true;
    } else if (arg === "--include-pages") {
      parsed.includePages = true;
    } else if (arg === "--hash-files") {
      parsed.hashFiles = true;
    } else if (arg.startsWith("--") && next) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key === "envFile") {
        parsed.envFile = [...(parsed.envFile || []), next];
      } else {
        parsed[key] = next;
      }
      index += 1;
    }
  }
  return parsed;
}
