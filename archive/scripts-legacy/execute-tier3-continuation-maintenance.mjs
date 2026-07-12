#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { del, list } from "@vercel/blob";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const phaseDate = options.phaseDate || "20260708";
const batchReviewPath = path.resolve(ROOT, options.batchReview || "swarm-browser-output/swarm-images-menus-tier3-US-batch1-run1-20260708.review.json");
const tier2ReviewPath = path.resolve(ROOT, options.tier2Review || "swarm-browser-output/swarm-images-menus-tier2-20260708.review.json");
const nextReviewPath = path.resolve(ROOT, options.nextReview || "swarm-browser-output/swarm-images-menus-tier3-continuation-review-export-20260708.json");
const reportPath = path.resolve(ROOT, options.report || "tier3-continuation-maintenance-report-20260708.json");

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

const connectionString =
  options.databaseUrl ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;
const blobToken = options.blobToken || process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
}
if (!blobToken) {
  throw new Error("Missing Blob token.");
}

const client = new Client({
  connectionString: normalizePostgresConnectionString(connectionString),
  connectionTimeoutMillis: 15000,
  query_timeout: 120000,
});

const report = {
  phaseDate,
  dryRun: Boolean(options.dryRun),
  batch1ZeroPrice: null,
  orphanBlob: null,
  nextReviewExport: null,
};

try {
  await client.connect();
  report.batch1ZeroPrice = await fixBatch1ZeroPriceFlags();
  report.orphanBlob = await deleteOneOrphanBlob();
  report.nextReviewExport = await writeNextReviewExport();
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${path.relative(ROOT, reportPath)}`);
} finally {
  await client.end().catch(() => {});
}

async function fixBatch1ZeroPriceFlags() {
  const review = JSON.parse(readFileSync(batchReviewPath, "utf8"));
  const flags = review.priceSanityFlags || [];
  const zeroFlags = flags.filter((item) => Number(item.price_amount) === 0);
  const freeServices = zeroFlags.filter((item) => !isFreeConsultationOrCta(item) && isGenuinelyFreeService(item));
  const skipped = zeroFlags.filter((item) => isFreeConsultationOrCta(item) || !isGenuinelyFreeService(item));
  const inserted = [];
  const existing = [];

  await client.query("BEGIN");
  try {
    await client.query(`
      UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)}
      SET price_amount = NULL,
          price_currency = NULL,
          reason = CASE
            WHEN ${zeroFlagWhere("raw_name", "location_id", skipped)} THEN 'zero_price_free_consultation_or_cta'
            WHEN ${zeroFlagWhere("raw_name", "location_id", freeServices)} THEN 'zero_price_free_service_null_price'
            ELSE reason
          END,
          outcome = CASE
            WHEN ${zeroFlagWhere("raw_name", "location_id", skipped)} THEN 'skipped'
            WHEN ${zeroFlagWhere("raw_name", "location_id", freeServices)} THEN 'new_offering_inserted'
            ELSE outcome
          END,
          price_context = CASE
            WHEN ${zeroFlagWhere("raw_name", "location_id", freeServices)} THEN
              CASE WHEN coalesce(price_context, '') ILIKE '%free%' THEN price_context ELSE trim(both '; ' from concat_ws('; ', nullif(price_context, ''), 'free')) END
            ELSE price_context
          END
      WHERE tier = 3
        AND outcome = 'sanity_flag'
        AND reason = 'price_outside_sanity_bounds'
        AND price_amount = 0
    `);

    for (const item of freeServices) {
      const found = await findOffering(item.location_id, item.raw_name);
      if (found) {
        if (!options.dryRun) {
          await client.query(`
            UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)}
            SET offering_id = $3,
                outcome = 'skipped',
                reason = 'existing_offering_without_price',
                price_amount = NULL,
                price_currency = NULL,
                price_context = CASE WHEN coalesce(price_context, '') ILIKE '%free%' THEN price_context ELSE trim(both '; ' from concat_ws('; ', nullif(price_context, ''), 'free')) END
            WHERE tier = 3
              AND location_id = $1
              AND raw_name = $2
          `, [Number(item.location_id), item.raw_name, found.id]);
        }
        existing.push({ location_id: item.location_id, raw_name: item.raw_name, offering_id: found.id });
        continue;
      }
      const offeringId = await nextOfferingId();
      if (!options.dryRun) {
        await client.query(`
          INSERT INTO ${quoteIdent(schema)}.offerings (
            id, location_id, treatment_id, raw_name, price_amount, price_currency,
            source_offer_url, source_id, status, data_origin, verification_status
          )
          VALUES ($1, $2, NULL, $3, NULL, NULL, $4, NULL, 'active', 'scraped', 'unverified')
        `, [offeringId, Number(item.location_id), item.raw_name, item.source_page_url || null]);
        await client.query(`
          UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(`browser_swarm_menu_ingest_${phaseDate}`)}
          SET offering_id = $3,
              outcome = 'new_offering_inserted',
              reason = 'zero_price_free_service_null_price',
              price_amount = NULL,
              price_currency = NULL,
              price_context = CASE WHEN coalesce(price_context, '') ILIKE '%free%' THEN price_context ELSE trim(both '; ' from concat_ws('; ', nullif(price_context, ''), 'free')) END
          WHERE tier = 3
            AND location_id = $1
            AND raw_name = $2
        `, [Number(item.location_id), item.raw_name, offeringId]);
      }
      inserted.push({ location_id: item.location_id, raw_name: item.raw_name, offering_id: offeringId, price_context: withFreeContext(item.price_context) });
    }

    review.priceSanityFlags = flags.filter((item) => Number(item.price_amount) !== 0);
    review.zeroPriceSkipped = skipped.map((item) => ({ ...item, price_amount: null, price_currency: null, reason: isFreeConsultationOrCta(item) ? "zero_price_free_consultation_or_cta" : "zero_price_ambiguous" }));
    review.zeroPriceFreeServices = freeServices.map((item) => ({ ...item, price_amount: null, price_currency: null, price_context: withFreeContext(item.price_context), reason: "zero_price_free_service_null_price" }));
    if (!options.dryRun) {
      writeFileSync(batchReviewPath, `${JSON.stringify(review, null, 2)}\n`);
    }

    if (options.dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return {
    zeroFlags: zeroFlags.length,
    skippedFreeConsultationOrCta: skipped.length,
    freeServicesInserted: inserted.length,
    freeServicesAlreadyExisting: existing.length,
    inserted,
    existing,
    batchReviewPath: path.relative(ROOT, batchReviewPath),
  };
}

async function deleteOneOrphanBlob() {
  const referenced = await loadReferencedBlobUrls();
  const blobs = await listAllBlobs();
  const orphans = blobs.filter((blob) => !referenced.has(blob.url));
  if (orphans.length !== 1) {
    return { skipped: true, reason: `expected 1 orphan, found ${orphans.length}`, orphanCount: orphans.length };
  }
  if (!options.dryRun) {
    await del(orphans[0].url, { token: blobToken });
  }
  const afterBlobs = await listAllBlobs();
  const afterUrls = new Set(afterBlobs.map((blob) => blob.url));
  const missingAfter = [...referenced].filter((url) => !afterUrls.has(url));
  const orphansAfter = afterBlobs.filter((blob) => !referenced.has(blob.url));
  return {
    deletedUrl: orphans[0].url,
    deletedBytes: Number(orphans[0].size || 0),
    orphanCountAfter: orphansAfter.length,
    imageRowsPointingAtMissingBlobCountAfter: missingAfter.length,
  };
}

async function writeNextReviewExport() {
  const batchReview = JSON.parse(readFileSync(batchReviewPath, "utf8"));
  const tier2Review = JSON.parse(readFileSync(tier2ReviewPath, "utf8"));
  const exportReview = {
    lowConfidenceImages: [
      ...(tier2Review.lowConfidenceImages || []).map((item) => ({ ...item, carry_forward_from: "tier2" })),
      ...(batchReview.lowConfidenceImages || []),
    ],
    validationFailures: [...(batchReview.validationFailures || [])],
    priceSanityFlags: [...(batchReview.priceSanityFlags || [])],
    locationOfferingCapFlags: [...(batchReview.locationOfferingCapFlags || [])],
    priceConflicts: [...(batchReview.priceConflicts || [])],
    zeroPriceSkipped: [...(batchReview.zeroPriceSkipped || [])],
    zeroPriceFreeServices: [...(batchReview.zeroPriceFreeServices || [])],
  };
  if (!options.dryRun) {
    mkdirSync(path.dirname(nextReviewPath), { recursive: true });
    writeFileSync(nextReviewPath, `${JSON.stringify(exportReview, null, 2)}\n`);
  }
  return {
    path: path.relative(ROOT, nextReviewPath),
    lowConfidenceImages: exportReview.lowConfidenceImages.length,
    carriedTier2LowConfidenceImages: (tier2Review.lowConfidenceImages || []).length,
    priceSanityFlags: exportReview.priceSanityFlags.length,
    zeroPriceSkipped: exportReview.zeroPriceSkipped.length,
    zeroPriceFreeServices: exportReview.zeroPriceFreeServices.length,
  };
}

async function findOffering(locationId, rawName) {
  const result = await client.query(`
    SELECT id
    FROM ${quoteIdent(schema)}.offerings
    WHERE location_id = $1
      AND deleted_at IS NULL
      AND lower(regexp_replace(trim(raw_name), '\\s+', ' ', 'g')) = lower(regexp_replace(trim($2), '\\s+', ' ', 'g'))
    ORDER BY id
    LIMIT 1
  `, [Number(locationId), rawName]);
  return result.rows[0] || null;
}

async function nextOfferingId() {
  await client.query("SELECT pg_advisory_lock($1)", [2026070802]);
  const result = await client.query(`SELECT coalesce(max(id), 0)::integer + 1 AS id FROM ${quoteIdent(schema)}.offerings`);
  return result.rows[0].id;
}

async function loadReferencedBlobUrls() {
  const result = await client.query(`
    SELECT DISTINCT blob_url
    FROM ${quoteIdent(schema)}.images
    WHERE deleted_at IS NULL
      AND coalesce(blob_url, '') <> ''
  `);
  return new Set(result.rows.map((row) => row.blob_url));
}

async function listAllBlobs() {
  const blobs = [];
  let cursor;
  do {
    const result = await list({ cursor, limit: 1000, token: blobToken });
    blobs.push(...result.blobs.map((blob) => ({ url: blob.url, size: Number(blob.size || 0) })));
    cursor = result.cursor;
  } while (cursor);
  return blobs;
}

function zeroFlagWhere(rawNameColumn, locationIdColumn, items) {
  if (!items.length) {
    return "false";
  }
  return items.map((item) => `(${quoteIdent(locationIdColumn)} = ${Number(item.location_id)} AND ${quoteIdent(rawNameColumn)} = ${literal(item.raw_name)})`).join(" OR ");
}

function isFreeConsultationOrCta(item) {
  const text = normalizeTerm(`${item.raw_name || ""} ${item.price_context || ""}`);
  return [
    "consult",
    "meet & greet",
    "x-ray",
    "membership",
    "student",
    "resident",
    "fellow",
    "schedule",
    "click here",
    "book here",
    "delivery",
  ].some((needle) => text.includes(needle));
}

function isGenuinelyFreeService(item) {
  const text = normalizeTerm(`${item.raw_name || ""} ${item.price_context || ""}`);
  return ["free", "no cost", "without cost"].some((needle) => text.includes(needle));
}

function withFreeContext(value) {
  const context = cleanText(value || "", 260);
  if (!context) {
    return "free";
  }
  return normalizeTerm(context).includes("free") ? context : cleanText(`${context}; free`, 260);
}

function cleanText(value, maxLength = 1000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeTerm(value) {
  return cleanText(value).toLowerCase();
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--database-url") parsed.databaseUrl = args[++index];
    else if (arg === "--blob-token") parsed.blobToken = args[++index];
    else if (arg === "--schema") parsed.schema = args[++index];
    else if (arg === "--raw-schema") parsed.rawSchema = args[++index];
    else if (arg === "--phase-date") parsed.phaseDate = args[++index];
    else if (arg === "--batch-review") parsed.batchReview = args[++index];
    else if (arg === "--tier2-review") parsed.tier2Review = args[++index];
    else if (arg === "--next-review") parsed.nextReview = args[++index];
    else if (arg === "--report") parsed.report = args[++index];
    else if (arg === "--dry-run") parsed.dryRun = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return parsed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
