import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const sourceDbPath = path.resolve(ROOT, options.db || "canonical.db");
const outPath = path.resolve(ROOT, options.out || "data/databases/blob_images.sqlite");
const reportPath = path.resolve(ROOT, options.report || "data/exports/blob_image_audit_summary.json");
const exportedAt = new Date().toISOString();

mkdirSync(path.dirname(outPath), { recursive: true });
mkdirSync(path.dirname(reportPath), { recursive: true });

if (existsSync(outPath) && !options.noBackup) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  renameSync(outPath, `${outPath}.${stamp}.bak`);
}

const sourceDb = new Database(sourceDbPath, { readonly: true });
const outDb = new Database(outPath);
outDb.pragma("journal_mode = WAL");
outDb.pragma("synchronous = NORMAL");
outDb.exec(`
  DROP TABLE IF EXISTS blob_image_mappings;
  DROP TABLE IF EXISTS blob_url_audit;
  DROP TABLE IF EXISTS audit_summary;

  CREATE TABLE blob_image_mappings (
    id INTEGER PRIMARY KEY,
    image_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_name TEXT,
    address TEXT,
    locality TEXT,
    region TEXT,
    country_code TEXT,
    website TEXT,
    source_slug TEXT,
    source_listing_id INTEGER,
    source_url TEXT,
    raw_ref TEXT,
    image_url TEXT,
    local_path TEXT,
    blob_url TEXT,
    db_content_sha256 TEXT,
    actual_content_sha256 TEXT,
    local_file_exists INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    issue TEXT,
    exported_at TEXT NOT NULL
  );
  CREATE INDEX idx_blob_image_mappings_image_id ON blob_image_mappings(image_id);
  CREATE INDEX idx_blob_image_mappings_source_image ON blob_image_mappings(source_slug, image_url);
  CREATE INDEX idx_blob_image_mappings_local_path ON blob_image_mappings(local_path);
  CREATE INDEX idx_blob_image_mappings_blob_url ON blob_image_mappings(blob_url);
  CREATE INDEX idx_blob_image_mappings_status ON blob_image_mappings(status);

  CREATE TABLE blob_url_audit (
    blob_url TEXT PRIMARY KEY,
    row_count INTEGER NOT NULL,
    entity_count INTEGER NOT NULL,
    source_count INTEGER NOT NULL,
    distinct_image_url_count INTEGER NOT NULL,
    distinct_local_path_count INTEGER NOT NULL,
    distinct_db_hash_count INTEGER NOT NULL,
    distinct_actual_hash_count INTEGER NOT NULL,
    status TEXT NOT NULL,
    sample_names TEXT,
    sample_sources TEXT
  );

  CREATE TABLE audit_summary (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const imageRows = sourceDb
  .prepare(
    `
      SELECT
        i.id AS image_id,
        i.entity_type,
        i.entity_id,
        CASE
          WHEN i.entity_type = 'location' THEN l.name
          WHEN i.entity_type = 'organization' THEN o.canonical_name
          WHEN i.entity_type = 'practitioner' THEN p.full_name
          ELSE NULL
        END AS entity_name,
        l.address,
        l.locality,
        l.region,
        l.country_code,
        l.website,
        s.slug AS source_slug,
        (
          SELECT sr.source_listing_id
          FROM source_records sr
          WHERE sr.entity_type = i.entity_type
            AND sr.entity_id = i.entity_id
            AND (sr.source_id = i.source_id OR i.source_id IS NULL)
          ORDER BY sr.id
          LIMIT 1
        ) AS source_listing_id,
        (
          SELECT sr.source_url
          FROM source_records sr
          WHERE sr.entity_type = i.entity_type
            AND sr.entity_id = i.entity_id
            AND (sr.source_id = i.source_id OR i.source_id IS NULL)
          ORDER BY sr.id
          LIMIT 1
        ) AS source_url,
        (
          SELECT sr.raw_ref
          FROM source_records sr
          WHERE sr.entity_type = i.entity_type
            AND sr.entity_id = i.entity_id
            AND (sr.source_id = i.source_id OR i.source_id IS NULL)
          ORDER BY sr.id
          LIMIT 1
        ) AS raw_ref,
        i.image_url,
        i.local_path,
        i.blob_url,
        i.content_sha256 AS db_content_sha256
      FROM images i
      LEFT JOIN sources s ON s.id = i.source_id
      LEFT JOIN locations l ON i.entity_type = 'location' AND l.id = i.entity_id
      LEFT JOIN organizations o ON i.entity_type = 'organization' AND o.id = i.entity_id
      LEFT JOIN practitioners p ON i.entity_type = 'practitioner' AND p.id = i.entity_id
      ORDER BY i.id
    `,
  )
  .all();

const insertMapping = outDb.prepare(`
  INSERT INTO blob_image_mappings (
    image_id, entity_type, entity_id, entity_name, address, locality, region, country_code, website,
    source_slug, source_listing_id, source_url, raw_ref, image_url, local_path, blob_url,
    db_content_sha256, actual_content_sha256, local_file_exists, status, issue, exported_at
  ) VALUES (
    @image_id, @entity_type, @entity_id, @entity_name, @address, @locality, @region, @country_code, @website,
    @source_slug, @source_listing_id, @source_url, @raw_ref, @image_url, @local_path, @blob_url,
    @db_content_sha256, @actual_content_sha256, @local_file_exists, @status, @issue, @exported_at
  )
`);

const insertTransaction = outDb.transaction((rows) => {
  for (const row of rows) {
    const { exists, hash } = actualLocalHash(row.local_path);
    const [status, issue] = classify(row, exists, hash);
    insertMapping.run({
      ...row,
      actual_content_sha256: hash,
      local_file_exists: exists ? 1 : 0,
      status,
      issue,
      exported_at: exportedAt,
    });
  }
});
insertTransaction(imageRows);

outDb.exec(`
  INSERT INTO blob_url_audit (
    blob_url, row_count, entity_count, source_count, distinct_image_url_count, distinct_local_path_count,
    distinct_db_hash_count, distinct_actual_hash_count, status, sample_names, sample_sources
  )
  SELECT
    blob_url,
    COUNT(*) AS row_count,
    COUNT(DISTINCT entity_type || ':' || entity_id) AS entity_count,
    COUNT(DISTINCT COALESCE(source_slug, '')) AS source_count,
    COUNT(DISTINCT COALESCE(image_url, '')) AS distinct_image_url_count,
    COUNT(DISTINCT COALESCE(local_path, '')) AS distinct_local_path_count,
    COUNT(DISTINCT COALESCE(db_content_sha256, '')) AS distinct_db_hash_count,
    COUNT(DISTINCT COALESCE(actual_content_sha256, '')) AS distinct_actual_hash_count,
    CASE
      WHEN SUM(status = 'suspect_local_hash_mismatch') > 0 THEN 'suspect_local_hash_mismatch'
      WHEN COUNT(DISTINCT entity_type || ':' || entity_id) > 1
        AND COUNT(DISTINCT COALESCE(image_url, '')) > 1 THEN 'shared_across_multiple_entities'
      WHEN COUNT(*) > 1 THEN 'shared_blob'
      ELSE 'unique_blob'
    END AS status,
    substr(group_concat(DISTINCT entity_name), 1, 1000) AS sample_names,
    group_concat(DISTINCT source_slug) AS sample_sources
  FROM blob_image_mappings
  WHERE blob_url IS NOT NULL AND blob_url <> ''
  GROUP BY blob_url;
`);

const statusCounts = outDb
  .prepare("SELECT status, COUNT(*) AS count FROM blob_image_mappings GROUP BY status ORDER BY count DESC")
  .all();
const blobAuditCounts = outDb
  .prepare("SELECT status, COUNT(*) AS count FROM blob_url_audit GROUP BY status ORDER BY count DESC")
  .all();
const suspectBySource = outDb
  .prepare(
    `
      SELECT source_slug, COUNT(*) AS count
      FROM blob_image_mappings
      WHERE status LIKE 'suspect%'
      GROUP BY source_slug
      ORDER BY count DESC
    `,
  )
  .all();

const report = {
  exported_at: exportedAt,
  source_db: sourceDbPath,
  output_db: outPath,
  image_rows: imageRows.length,
  status_counts: statusCounts,
  blob_url_audit_counts: blobAuditCounts,
  suspect_by_source: suspectBySource,
};

const insertSummary = outDb.prepare("INSERT INTO audit_summary(key, value) VALUES (?, ?)");
for (const [key, value] of Object.entries({
  exported_at: exportedAt,
  source_db: sourceDbPath,
  image_rows: String(imageRows.length),
  status_counts: JSON.stringify(statusCounts),
  blob_url_audit_counts: JSON.stringify(blobAuditCounts),
  suspect_by_source: JSON.stringify(suspectBySource),
})) {
  insertSummary.run(key, value);
}

outDb.pragma("wal_checkpoint(TRUNCATE)");
outDb.close();
sourceDb.close();
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      output_db: outPath,
      report: reportPath,
      image_rows: imageRows.length,
      status_counts: statusCounts,
      blob_url_audit_counts: blobAuditCounts,
      suspect_by_source: suspectBySource,
    },
    null,
    2,
  ),
);

function actualLocalHash(localPath) {
  if (!localPath) {
    return { exists: false, hash: null };
  }
  const absolutePath = path.resolve(ROOT, localPath);
  if (!existsSync(absolutePath)) {
    return { exists: false, hash: null };
  }
  return {
    exists: true,
    hash: createHash("sha256").update(readFileSync(absolutePath)).digest("hex"),
  };
}

function classify(row, localFileExists, actualHash) {
  const hasBlob = Boolean(row.blob_url);
  const hasLocal = Boolean(row.local_path);
  const hasRemote = Boolean(row.image_url);
  if (hasLocal && !localFileExists) {
    return ["suspect_missing_local_file", "local_path is set but file is missing"];
  }
  if (hasLocal && localFileExists && hasBlob && row.db_content_sha256 && actualHash && row.db_content_sha256 !== actualHash) {
    return ["suspect_local_hash_mismatch", "db content_sha256/blob_url does not match actual local file hash"];
  }
  if (hasLocal && localFileExists && hasBlob && row.db_content_sha256 && actualHash && row.db_content_sha256 === actualHash) {
    return ["verified_local_blob", null];
  }
  if (hasLocal && localFileExists && hasBlob && !row.db_content_sha256) {
    return ["suspect_local_blob_no_db_hash", "blob_url exists but content_sha256 is blank"];
  }
  if (hasLocal && localFileExists && !hasBlob) {
    return ["local_file_no_blob", null];
  }
  if (!hasLocal && hasRemote && hasBlob && row.db_content_sha256) {
    return ["remote_blob_unverified", null];
  }
  if (!hasLocal && hasRemote && hasBlob && !row.db_content_sha256) {
    return ["suspect_remote_blob_no_db_hash", "blob_url exists but content_sha256 is blank"];
  }
  if (!hasLocal && hasRemote && !hasBlob) {
    return ["remote_no_blob", null];
  }
  return ["no_image_asset", null];
}

function parseArgs(args) {
  const parsed = { noBackup: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-backup") {
      parsed.noBackup = true;
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
