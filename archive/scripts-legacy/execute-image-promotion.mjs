#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { del, put } from "@vercel/blob";
import pg from "pg";
import sharp from "sharp";

const { Pool } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.phaseDate || "20260708";
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const concurrency = Number.parseInt(options.concurrency || "6", 10);
const maxPromotions = options.maxPromotions ? Number.parseInt(options.maxPromotions, 10) : Infinity;
const checkpointPath = path.resolve(ROOT, options.checkpoint || `image-promotion-checkpoint-${phaseDate}.json`);
const reportPath = path.resolve(ROOT, options.report || `image-promotion-report-${phaseDate}.json`);

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
const oidcToken = process.env.VERCEL_OIDC_TOKEN;
const blobStoreId = process.env.BLOB_STORE_ID;
const blobAccess = blobToken ? { token: blobToken } : oidcToken && blobStoreId ? { token: oidcToken } : null;

const auditTable = `image_promotion_audit_${phaseDate}`;
const resultTable = `image_promotion_results_${phaseDate}`;
const pool = new Pool({
  connectionString: normalizePostgresConnectionString(connectionString),
  max: Math.max(4, concurrency + 2),
});

const summary = {
  phaseDate,
  auditTable: `${rawSchema}.${auditTable}`,
  resultTable: `${rawSchema}.${resultTable}`,
  phase1: {},
  phase2: {
    promoted: 0,
    dead_link: 0,
    failed_validation: {},
    duplicate_content: 0,
    shared_content: 0,
    capped: 0,
    insert_failed: 0,
    blob_deleted_after_insert_failure: 0,
    bytesUploaded: 0,
  },
  spotChecks: [],
};

try {
  await ensureReportTables();
  if (options.reclassify || !(await tableExists(rawSchema, auditTable))) {
    await classifyCandidates();
  } else {
    console.log(`Reusing existing audit table ${rawSchema}.${auditTable}. Pass --reclassify to rebuild it.`);
  }
  summary.phase1 = await loadPhase1Summary();
  writeJson(reportPath, summary);

  if (options.phase1Only) {
    console.log(`Phase 1 complete. Report: ${path.relative(ROOT, reportPath)}`);
    console.table(summary.phase1.bucketCounts);
    process.exit(0);
  }

  if (!blobAccess) {
    console.error("Blob storage credentials are missing. Set BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN.");
    console.error("If using OIDC instead, set both VERCEL_OIDC_TOKEN and BLOB_STORE_ID.");
    process.exitCode = 1;
  } else {
    await promoteCandidates();
    summary.coverageAfter = await loadCoverageSummary();
    summary.estimatedMonthlyStorageCostDeltaUsd = estimateMonthlyStorageCost(summary.phase2.bytesUploaded);
    writeJson(reportPath, summary);
    console.log(`Image promotion complete. Report: ${path.relative(ROOT, reportPath)}`);
    console.table(await loadOutcomeCounts());
  }
} finally {
  await pool.end();
}

async function ensureReportTables() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)} (
      audit_id bigint PRIMARY KEY,
      source_slug text NOT NULL,
      source_listing_id bigint NOT NULL,
      image_url text NOT NULL,
      entity_type text,
      entity_id integer,
      outcome text NOT NULL,
      reason text,
      blob_url text,
      content_sha256 text,
      bytes integer,
      width integer,
      height integer,
      shared_content boolean NOT NULL DEFAULT false,
      processed_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function classifyCandidates() {
  const db = await pool.connect();
  await db.query("BEGIN");
  try {
    await db.query(`DROP TABLE IF EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)}`);
    await db.query("DROP TABLE IF EXISTS pg_temp.image_promotion_raw_mappings");
    await db.query("DROP TABLE IF EXISTS pg_temp.image_promotion_entity_state");
    await db.query("DROP TABLE IF EXISTS pg_temp.image_promotion_promoted_orgs");
    await db.query("DROP TABLE IF EXISTS pg_temp.image_promotion_active_counts");

    await db.query(`
      CREATE TEMP TABLE image_promotion_raw_mappings AS
      SELECT DISTINCT
        si.source_slug,
        si.source_listing_id,
        si.image_url,
        si.alt,
        si.source_page_url,
        s.id AS source_id,
        sr.entity_type,
        sr.entity_id
      FROM ${quoteIdent(rawSchema)}.source_images si
      LEFT JOIN ${quoteIdent(schema)}.sources s ON s.slug = si.source_slug
      LEFT JOIN ${quoteIdent(schema)}.source_records sr
        ON sr.source_id = s.id
       AND sr.source_listing_id = si.source_listing_id::integer
    `);
    await db.query("CREATE INDEX ON image_promotion_raw_mappings (entity_type, entity_id, image_url)");
    await db.query("CREATE INDEX ON image_promotion_raw_mappings (image_url)");

    await db.query(`
      CREATE TEMP TABLE image_promotion_entity_state AS
      SELECT
        rm.*,
        l.status AS location_status,
        l.deleted_at AS location_deleted_at,
        l.org_id AS location_org_id,
        l.slug AS location_slug,
        l.name AS location_name,
        o.status AS organization_status,
        o.deleted_at AS organization_deleted_at,
        p.status AS practitioner_status,
        p.deleted_at AS practitioner_deleted_at,
        COALESCE(l.org_id, CASE WHEN rm.entity_type = 'organization' THEN rm.entity_id END) AS candidate_org_id
      FROM image_promotion_raw_mappings rm
      LEFT JOIN ${quoteIdent(schema)}.locations l ON rm.entity_type = 'location' AND l.id = rm.entity_id
      LEFT JOIN ${quoteIdent(schema)}.organizations o ON rm.entity_type = 'organization' AND o.id = rm.entity_id
      LEFT JOIN ${quoteIdent(schema)}.practitioners p ON rm.entity_type = 'practitioner' AND p.id = rm.entity_id
    `);
    await db.query("CREATE INDEX ON image_promotion_entity_state (entity_type, entity_id, image_url)");
    await db.query("CREATE INDEX ON image_promotion_entity_state (candidate_org_id, image_url)");

    await db.query(`
      CREATE TEMP TABLE image_promotion_promoted_orgs AS
      SELECT
        img.image_url,
        img.entity_type,
        img.entity_id,
        COALESCE(img_l.org_id, CASE WHEN img.entity_type = 'organization' THEN img.entity_id END) AS org_id
      FROM ${quoteIdent(schema)}.images img
      LEFT JOIN ${quoteIdent(schema)}.locations img_l ON img.entity_type = 'location' AND img_l.id = img.entity_id
      WHERE img.status = 'active'
        AND img.deleted_at IS NULL
        AND img.image_url IS NOT NULL
        AND img.image_url <> ''
    `);
    await db.query("CREATE INDEX ON image_promotion_promoted_orgs (image_url, entity_type, entity_id)");
    await db.query("CREATE INDEX ON image_promotion_promoted_orgs (image_url, org_id)");

    await db.query(`
      CREATE TEMP TABLE image_promotion_active_counts AS
      SELECT entity_type, entity_id, count(*)::integer AS active_image_count
      FROM ${quoteIdent(schema)}.images
      WHERE status = 'active'
        AND deleted_at IS NULL
      GROUP BY entity_type, entity_id
    `);
    await db.query("CREATE INDEX ON image_promotion_active_counts (entity_type, entity_id)");

    await db.query(`
      CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} AS
      WITH classified AS (
        SELECT
          row_number() OVER (ORDER BY es.source_slug, es.source_listing_id, es.image_url, es.entity_type NULLS FIRST, es.entity_id NULLS FIRST)::bigint AS audit_id,
          es.source_slug,
          es.source_listing_id,
          es.image_url,
          es.alt,
          es.source_page_url,
          es.source_id,
          es.entity_type,
          es.entity_id,
          es.candidate_org_id,
          es.location_slug,
          es.location_name,
          coalesce(ac.active_image_count, 0) AS active_image_count,
          CASE
            WHEN es.entity_type IS NULL THEN 'no_entity'
            WHEN same_entity.image_url IS NOT NULL THEN 'already_have_by_url'
            WHEN es.entity_type = 'location' AND (es.location_status IS NULL OR es.location_status <> 'active' OR es.location_deleted_at IS NOT NULL) THEN 'entity_gone'
            WHEN es.entity_type = 'organization' AND (es.organization_status IS NULL OR es.organization_status <> 'active' OR es.organization_deleted_at IS NOT NULL) THEN 'entity_gone'
            WHEN es.entity_type = 'practitioner' AND (es.practitioner_status IS NULL OR es.practitioner_status <> 'active' OR es.practitioner_deleted_at IS NOT NULL) THEN 'entity_gone'
            WHEN es.image_url ~* '(data:|\\.svg($|[?#])|\\.ico($|[?#])|\\.gif($|[?#])|favicon|sprite|tracking|pixel|placeholder|blank|transparent|loader|spinner|logo|icon)'
              OR coalesce(es.alt, '') ~* '(logo|icon|favicon|placeholder|sprite)' THEN 'junk_pattern'
            WHEN cross_duplicate.image_url IS NOT NULL THEN 'cross_listing_duplicate'
            ELSE 'promotable'
          END AS bucket,
          CASE
            WHEN es.entity_type IS NULL THEN 'listing has no source_record entity'
            WHEN same_entity.image_url IS NOT NULL THEN 'same image_url already attached to same entity'
            WHEN es.entity_type = 'location' AND (es.location_status IS NULL OR es.location_status <> 'active' OR es.location_deleted_at IS NOT NULL) THEN 'location missing, hidden, deleted, or non-active'
            WHEN es.entity_type = 'organization' AND (es.organization_status IS NULL OR es.organization_status <> 'active' OR es.organization_deleted_at IS NOT NULL) THEN 'organization missing, hidden, deleted, or non-active'
            WHEN es.entity_type = 'practitioner' AND (es.practitioner_status IS NULL OR es.practitioner_status <> 'active' OR es.practitioner_deleted_at IS NOT NULL) THEN 'practitioner missing, hidden, deleted, or non-active'
            WHEN es.image_url ~* '(data:|\\.svg($|[?#])|\\.ico($|[?#])|\\.gif($|[?#])|favicon|sprite|tracking|pixel|placeholder|blank|transparent|loader|spinner|logo|icon)'
              OR coalesce(es.alt, '') ~* '(logo|icon|favicon|placeholder|sprite)' THEN 'url or alt matched junk asset pattern'
            WHEN cross_duplicate.image_url IS NOT NULL THEN 'same image_url already attached to sibling/same-org entity'
            ELSE NULL
          END AS bucket_reason,
          CASE
            WHEN coalesce(ac.active_image_count, 0) = 0 THEN 1
            WHEN coalesce(ac.active_image_count, 0) < 4 THEN 2
            WHEN coalesce(ac.active_image_count, 0) >= 8 THEN 4
            ELSE 3
          END AS priority_tier,
          now() AS classified_at
        FROM image_promotion_entity_state es
        LEFT JOIN image_promotion_active_counts ac
          ON ac.entity_type = es.entity_type
         AND ac.entity_id = es.entity_id
        LEFT JOIN image_promotion_promoted_orgs same_entity
          ON same_entity.image_url = es.image_url
         AND same_entity.entity_type = es.entity_type
         AND same_entity.entity_id = es.entity_id
        LEFT JOIN LATERAL (
          SELECT p.image_url
          FROM image_promotion_promoted_orgs p
          WHERE p.image_url = es.image_url
            AND (
              (p.entity_type = es.entity_type AND p.entity_id <> es.entity_id)
              OR (es.candidate_org_id IS NOT NULL AND p.org_id = es.candidate_org_id AND NOT (p.entity_type = es.entity_type AND p.entity_id = es.entity_id))
            )
          LIMIT 1
        ) cross_duplicate ON true
      )
      SELECT *
      FROM classified
      WHERE bucket <> 'already_have_by_url'
    `);
    await db.query(`ALTER TABLE ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} ADD PRIMARY KEY (audit_id)`);
    await db.query(`CREATE INDEX ON ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} (bucket, entity_type, priority_tier, active_image_count)`);
    await db.query(`CREATE INDEX ON ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} (entity_type, entity_id)`);
    await db.query(`COMMIT`);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

async function loadPhase1Summary() {
  const bucketCounts = await rows(`
    SELECT bucket, coalesce(entity_type, 'none') AS entity_type, count(*)::integer AS rows, count(DISTINCT entity_id)::integer AS entities
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)}
    GROUP BY bucket, entity_type
    ORDER BY bucket, rows DESC
  `);
  const coverageBefore = await loadCoverageSummary();
  const zeroWithPromotable = await row(`
    WITH zero_locations AS (
      SELECT l.id
      FROM ${quoteIdent(schema)}.locations l
      LEFT JOIN ${quoteIdent(schema)}.images img
        ON img.entity_type = 'location'
       AND img.entity_id = l.id
       AND img.status = 'active'
       AND img.deleted_at IS NULL
      WHERE l.status = 'active'
        AND l.deleted_at IS NULL
      GROUP BY l.id
      HAVING count(img.id) = 0
    )
    SELECT count(*)::integer AS zero_locations_with_promotable_candidates
    FROM zero_locations zl
    WHERE EXISTS (
      SELECT 1
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} a
      WHERE a.entity_type = 'location'
        AND a.entity_id = zl.id
        AND a.bucket = 'promotable'
    )
  `);
  return { bucketCounts, coverageBefore, ...zeroWithPromotable };
}

async function loadCoverageSummary() {
  return row(`
    WITH location_counts AS (
      SELECT l.id, count(img.id)::integer AS active_images
      FROM ${quoteIdent(schema)}.locations l
      LEFT JOIN ${quoteIdent(schema)}.images img
        ON img.entity_type = 'location'
       AND img.entity_id = l.id
       AND img.status = 'active'
       AND img.deleted_at IS NULL
      WHERE l.status = 'active'
        AND l.deleted_at IS NULL
      GROUP BY l.id
    )
    SELECT
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.images WHERE status = 'active' AND deleted_at IS NULL) AS active_images,
      count(*) FILTER (WHERE active_images > 0)::integer AS locations_with_active_image,
      count(*) FILTER (WHERE active_images = 0)::integer AS locations_with_zero_images
    FROM location_counts
  `);
}

async function promoteCandidates() {
  const candidates = await rows(`
    SELECT a.*
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} a
    LEFT JOIN ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)} r ON r.audit_id = a.audit_id
    WHERE a.bucket = 'promotable'
      AND a.entity_type IN ('location', 'organization', 'practitioner')
      AND r.audit_id IS NULL
    ORDER BY a.priority_tier, CASE a.entity_type WHEN 'location' THEN 1 WHEN 'practitioner' THEN 2 WHEN 'organization' THEN 3 ELSE 4 END, a.active_image_count, a.entity_id, a.audit_id
  `);
  const checkpoint = loadCheckpoint();
  const queue = candidates.filter((candidate) => !checkpoint.doneAuditIds.includes(candidate.audit_id));
  let promotedCount = 0;

  await runWorkers(queue, concurrency, async (candidate) => {
    if (promotedCount >= maxPromotions) {
      return;
    }
    const currentCount = await activeImageCount(candidate.entity_type, candidate.entity_id);
    if (currentCount >= 8) {
      await logOutcome(candidate, "capped", `entity already has ${currentCount} active images`);
      summary.phase2.capped += 1;
      checkpoint.doneAuditIds.push(candidate.audit_id);
      saveCheckpoint(checkpoint);
      return;
    }

    const outcome = await promoteOne(candidate);
    if (outcome === "promoted") {
      promotedCount += 1;
    }
    checkpoint.doneAuditIds.push(candidate.audit_id);
    saveCheckpoint(checkpoint);
  });
}

async function promoteOne(candidate) {
  let blobUrl = null;
  try {
    const downloaded = await downloadImage(candidate.image_url);
    if (!downloaded.ok) {
      await logOutcome(candidate, "dead_link", downloaded.reason);
      summary.phase2.dead_link += 1;
      return "dead_link";
    }

    const validation = await validateAndProcessImage(downloaded.buffer, downloaded.contentType);
    if (!validation.ok) {
      await logOutcome(candidate, "failed_validation", validation.reason, { bytes: downloaded.buffer.length });
      summary.phase2.failed_validation[validation.reason] = (summary.phase2.failed_validation[validation.reason] || 0) + 1;
      return "failed_validation";
    }

    const sha256 = createHash("sha256").update(validation.buffer).digest("hex");
    const sameEntityDuplicate = await row(
      `
      SELECT id
      FROM ${quoteIdent(schema)}.images
      WHERE entity_type = $1
        AND entity_id = $2
        AND content_sha256 = $3
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [candidate.entity_type, candidate.entity_id, sha256],
    );
    if (sameEntityDuplicate) {
      await logOutcome(candidate, "duplicate_content", "content_sha256 already exists on same entity", {
        contentSha256: sha256,
        bytes: validation.buffer.length,
        width: validation.width,
        height: validation.height,
      });
      summary.phase2.duplicate_content += 1;
      return "duplicate_content";
    }

    const sharedContent = Boolean(
      await row(
        `
        SELECT id
        FROM ${quoteIdent(schema)}.images
        WHERE content_sha256 = $1
          AND status = 'active'
          AND deleted_at IS NULL
        LIMIT 1
        `,
        [sha256],
      ),
    );

    const pathname = blobPath(candidate, validation.extension, sha256);
    const uploaded = await put(pathname, validation.buffer, {
      access: "public",
      contentType: validation.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      ...blobAccess,
    });
    blobUrl = uploaded.url;

    const alt = cleanAlt(candidate.alt);
    const inserted = await insertImage(candidate, blobUrl, sha256, alt);
    await logOutcome(candidate, "promoted", sharedContent ? "shared_content" : null, {
      blobUrl,
      contentSha256: sha256,
      bytes: validation.buffer.length,
      width: validation.width,
      height: validation.height,
      sharedContent,
    });
    summary.phase2.promoted += 1;
    summary.phase2.bytesUploaded += validation.buffer.length;
    if (sharedContent) {
      summary.phase2.shared_content += 1;
    }
    if (summary.spotChecks.length < 10 && candidate.location_slug) {
      summary.spotChecks.push({
        location_id: candidate.entity_id,
        name: candidate.location_name,
        url: `/directory/locations/${candidate.location_slug}`,
        image_id: inserted.image_id,
      });
    }
    return "promoted";
  } catch (error) {
    if (blobUrl) {
      try {
        await del(blobUrl, blobAccess);
        summary.phase2.blob_deleted_after_insert_failure += 1;
      } catch {
        // Report the insert failure; the no-orphan sweep can be handled from the blob URL in the result table if deletion fails.
      }
    }
    await logOutcome(candidate, "insert_failed", error.message || String(error), { blobUrl });
    summary.phase2.insert_failed += 1;
    return "insert_failed";
  }
}

async function insertImage(candidate, blobUrl, sha256, alt) {
  if (candidate.entity_type === "location") {
    return row(
      `SELECT ${quoteIdent(schema)}.attach_location_image($1, $2, $3, $4, $5, NULL::uuid) AS image_id`,
      [candidate.entity_id, blobUrl, candidate.image_url, alt, candidate.source_id],
    );
  }

  return row(
    `
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'imported', 'unverified')
    RETURNING id AS image_id
    `,
    [candidate.entity_type, candidate.entity_id, candidate.image_url, blobUrl, sha256, alt, candidate.source_id],
  );
}

async function downloadImage(url) {
  let lastReason = "download_failed";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; FountainImagePromotion/1.0)",
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });
      clearTimeout(timeout);
      if (!response.ok) {
        lastReason = `http_${response.status}`;
        if (response.status >= 400 && response.status < 500) {
          break;
        }
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      return {
        ok: true,
        buffer: Buffer.from(arrayBuffer),
        contentType: response.headers.get("content-type") || "",
      };
    } catch (error) {
      clearTimeout(timeout);
      lastReason = error.name === "AbortError" ? "timeout" : error.message || "download_error";
    }
  }
  return { ok: false, reason: lastReason };
}

async function validateAndProcessImage(buffer, contentType) {
  if (buffer.length < 10 * 1024) {
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
  if (Math.max(width, height) < 400) {
    return { ok: false, reason: "too_small_dimensions" };
  }

  let output = image.rotate();
  if (Math.max(width, height) > 1600) {
    output = output.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  }
  if (detected.extension === "jpeg" || detected.extension === "jpg") {
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

function blobPath(candidate, extension, sha256) {
  return `listing-images/${candidate.entity_type}/${candidate.entity_id}/${sha256.slice(0, 20)}.${extension}`;
}

async function logOutcome(candidate, outcome, reason, extras = {}) {
  await pool.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)} (
      audit_id, source_slug, source_listing_id, image_url, entity_type, entity_id,
      outcome, reason, blob_url, content_sha256, bytes, width, height, shared_content
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (audit_id) DO UPDATE SET
      outcome = EXCLUDED.outcome,
      reason = EXCLUDED.reason,
      blob_url = EXCLUDED.blob_url,
      content_sha256 = EXCLUDED.content_sha256,
      bytes = EXCLUDED.bytes,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      shared_content = EXCLUDED.shared_content,
      processed_at = now()
    `,
    [
      candidate.audit_id,
      candidate.source_slug,
      candidate.source_listing_id,
      candidate.image_url,
      candidate.entity_type,
      candidate.entity_id,
      outcome,
      reason,
      extras.blobUrl || null,
      extras.contentSha256 || null,
      extras.bytes || null,
      extras.width || null,
      extras.height || null,
      Boolean(extras.sharedContent),
    ],
  );
}

async function loadOutcomeCounts() {
  return rows(`
    SELECT outcome, coalesce(reason, '') AS reason, count(*)::integer AS rows
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)}
    GROUP BY outcome, reason
    ORDER BY outcome, rows DESC
  `);
}

async function activeImageCount(entityType, entityId) {
  const result = await row(
    `
    SELECT count(*)::integer AS count
    FROM ${quoteIdent(schema)}.images
    WHERE entity_type = $1
      AND entity_id = $2
      AND status = 'active'
      AND deleted_at IS NULL
    `,
    [entityType, entityId],
  );
  return result.count;
}

async function runWorkers(items, workerCount, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, workerCount) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function loadCheckpoint() {
  if (!existsSync(checkpointPath)) {
    return { doneAuditIds: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(checkpointPath, "utf8"));
    return { doneAuditIds: Array.isArray(parsed.doneAuditIds) ? parsed.doneAuditIds : [] };
  } catch {
    return { doneAuditIds: [] };
  }
}

function saveCheckpoint(checkpoint) {
  writeJson(checkpointPath, checkpoint);
}

function estimateMonthlyStorageCost(bytes) {
  const gb = bytes / 1024 / 1024 / 1024;
  return Number((gb * 0.15).toFixed(4));
}

function cleanAlt(value) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

async function rows(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function row(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function tableExists(tableSchema, tableName) {
  const result = await row("SELECT to_regclass($1) AS table_name", [`${tableSchema}.${tableName}`]);
  return Boolean(result?.table_name);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--phase1-only") {
      parsed.phase1Only = true;
    } else if (arg === "--reclassify") {
      parsed.reclassify = true;
    } else if (arg === "--env-file") {
      parsed.envFile ||= [];
      parsed.envFile.push(args[++index]);
    } else if (arg === "--database-url") {
      parsed.databaseUrl = args[++index];
    } else if (arg === "--blob-token") {
      parsed.blobToken = args[++index];
    } else if (arg === "--phase-date") {
      parsed.phaseDate = args[++index];
    } else if (arg === "--schema") {
      parsed.schema = args[++index];
    } else if (arg === "--raw-schema") {
      parsed.rawSchema = args[++index];
    } else if (arg === "--concurrency") {
      parsed.concurrency = args[++index];
    } else if (arg === "--max-promotions") {
      parsed.maxPromotions = args[++index];
    } else if (arg === "--checkpoint") {
      parsed.checkpoint = args[++index];
    } else if (arg === "--report") {
      parsed.report = args[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
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

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
