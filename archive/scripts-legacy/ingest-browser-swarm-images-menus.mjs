#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { del, list, put } from "@vercel/blob";
import pg from "pg";
import sharp from "sharp";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.phaseDate || "20260708";
const tierOption = options.tier || "1";
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const inputPath = path.resolve(ROOT, options.input || `swarm-browser-output/swarm-images-menus-tier${tierOption}-${phaseDate}.json`);
const inputDir = options.inputDir ? path.resolve(ROOT, options.inputDir) : path.resolve(ROOT, `swarm-browser-output/results/tier${tierOption}-${phaseDate}`);
const reportPath = path.resolve(ROOT, options.report || `swarm-browser-output/swarm-images-menus-tier${tierOption}-${phaseDate}.ingest.json`);
const reviewPath = path.resolve(ROOT, options.review || `swarm-browser-output/swarm-images-menus-tier${tierOption}-${phaseDate}.review.json`);
const confidenceThreshold = Number.parseFloat(options.confidenceThreshold || "0.72");
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

const input = loadSwarmInput();
const tier = Number(input.tier || tierOption || 1);
const imageLogTable = `browser_swarm_image_ingest_${phaseDate}`;
const menuLogTable = `browser_swarm_menu_ingest_${phaseDate}`;
const client = new Client({ connectionString: normalizePostgresConnectionString(connectionString) });
const report = {
  phaseDate,
  tier,
  inputPath: existsSync(inputPath) ? path.relative(ROOT, inputPath) : null,
  inputDir: existsSync(inputDir) ? path.relative(ROOT, inputDir) : null,
  inputResults: input.results.length,
  imageLogTable: `${rawSchema}.${imageLogTable}`,
  menuLogTable: `${rawSchema}.${menuLogTable}`,
  dryRun,
  startedAt: new Date().toISOString(),
  completedAt: null,
  images: {
    proposed: 0,
    ingested: 0,
    heldForReview: 0,
    skipped: 0,
    validationFailures: 0,
  },
  menus: {
    extracted: 0,
    pricesBackfilled: 0,
    newOfferingsInserted: 0,
    conflicts: 0,
    sanityFlags: 0,
    skipped: 0,
  },
  coverageBefore: null,
  coverageAfter: null,
  finalInvariants: null,
  spotChecks: {
    images: [],
    menus: [],
  },
};
const review = {
  lowConfidenceImages: [],
  validationFailures: [],
  priceSanityFlags: [],
  locationOfferingCapFlags: [],
  priceConflicts: [],
};

try {
  await client.connect();
  await ensureTables();
  report.coverageBefore = await loadCoverage();
  await ingestImages();
  await ingestMenus();
  report.coverageAfter = await loadCoverage();
  report.finalInvariants = options.skipBlobInvariants ? null : await loadBlobInvariants();
  report.spotChecks.images = await imageSpotChecks();
  report.spotChecks.menus = await menuSpotChecks();
  report.completedAt = new Date().toISOString();
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeJson(reportPath, report);
  writeJson(reviewPath, review);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${path.relative(ROOT, reportPath)}`);
} finally {
  await client.end();
}

async function ensureTables() {
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
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(menuLogTable)} (
      id bigserial PRIMARY KEY,
      tier integer NOT NULL,
      site_origin text NOT NULL,
      location_id integer NOT NULL,
      raw_name text NOT NULL,
      price_amount double precision,
      price_currency text,
      price_context text,
      source_page_url text,
      outcome text NOT NULL,
      reason text,
      offering_id integer,
      matched_offering_id integer,
      existing_price_amount double precision,
      existing_price_currency text,
      logged_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function ingestImages() {
  const perLocationInserted = new Map();
  for (const result of input.results || []) {
    for (const image of result.images || []) {
      report.images.proposed += 1;
      const locationId = Number(image.location_id);
      if (!locationId || !image.image_url) {
        report.images.skipped += 1;
        continue;
      }
      if (Number(image.llm_confidence || 0) < confidenceThreshold) {
        report.images.heldForReview += 1;
        review.lowConfidenceImages.push({ ...image, site_origin: result.site_origin, reason: "below_confidence_threshold" });
        await logImage(result, image, "held_for_review", "below_confidence_threshold");
        continue;
      }
      const activeCount = await activeImageCount(locationId);
      const insertedForLocation = perLocationInserted.get(locationId) || 0;
      if (activeCount + insertedForLocation >= 3) {
        report.images.skipped += 1;
        await logImage(result, image, "skipped", "location_image_cap_reached");
        continue;
      }
      if (!isUrlLoadedByResult(image.image_url, result)) {
        report.images.heldForReview += 1;
        review.lowConfidenceImages.push({ ...image, site_origin: result.site_origin, reason: "image_url_not_loaded_by_worker" });
        await logImage(result, image, "held_for_review", "image_url_not_loaded_by_worker");
        continue;
      }

      const downloaded = await downloadImage(image.image_url);
      if (!downloaded.ok) {
        report.images.validationFailures += 1;
        review.validationFailures.push({ ...image, site_origin: result.site_origin, reason: downloaded.reason });
        await logImage(result, image, "validation_failed", downloaded.reason);
        continue;
      }
      const validation = await validateAndProcessImage(downloaded.buffer, downloaded.contentType);
      if (!validation.ok) {
        report.images.validationFailures += 1;
        review.validationFailures.push({ ...image, site_origin: result.site_origin, reason: validation.reason });
        await logImage(result, image, "validation_failed", validation.reason, { bytes: downloaded.buffer.length });
        continue;
      }
      const sha256 = createHash("sha256").update(validation.buffer).digest("hex");
      const sameLocation = await row(`
        SELECT id
        FROM ${quoteIdent(schema)}.images
        WHERE entity_type = 'location'
          AND entity_id = $1
          AND content_sha256 = $2
          AND status = 'active'
          AND deleted_at IS NULL
        LIMIT 1
      `, [locationId, sha256]);
      if (sameLocation) {
        report.images.skipped += 1;
        await logImage(result, image, "skipped", "duplicate_content_same_location", { contentSha256: sha256, width: validation.width, height: validation.height, bytes: validation.buffer.length });
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
          await insertImage(locationId, uploaded.url, image.image_url, sha256, makeAlt(result, image));
        }
        report.images.ingested += 1;
        perLocationInserted.set(locationId, insertedForLocation + 1);
        await logImage(result, image, dryRun ? "dry_run_ingested" : "ingested", null, {
          blobUrl: uploaded?.url || null,
          contentSha256: sha256,
          width: validation.width,
          height: validation.height,
          bytes: validation.buffer.length,
        });
      } catch (error) {
        if (uploaded?.url) {
          await del(uploaded.url, { token: blobToken }).catch(() => {});
        }
        report.images.validationFailures += 1;
        review.validationFailures.push({ ...image, site_origin: result.site_origin, reason: error.message || String(error) });
        await logImage(result, image, "ingest_failed", error.message || String(error), { contentSha256: sha256, width: validation.width, height: validation.height, bytes: validation.buffer.length });
      }
    }
  }
}

async function ingestMenus() {
  const newOfferingCounts = new Map();
  const nextIds = await allocateOfferingIds(countMenuCandidates());
  let nextIdIndex = 0;

  try {
    for (const result of input.results || []) {
      for (const item of result.menu_items || []) {
      report.menus.extracted += 1;
      const locationId = Number(item.location_id);
      const rawName = cleanText(item.raw_name, 260);
      if (!locationId || !rawName) {
        report.menus.skipped += 1;
        continue;
      }
      const priceInput = normalizePriceInput(item);
      if (priceInput.skip) {
        report.menus.skipped += 1;
        await logMenu(result, priceInput.item, "skipped", priceInput.reason);
        continue;
      }
      const priceAmount = priceInput.priceAmount;
      const priceCurrency = priceInput.priceCurrency;
      const menuItem = priceInput.item;
      const normalized = normalizeTerm(rawName);
      if (priceAmount != null && !pricePassesSanity(priceAmount, priceCurrency, menuItem)) {
        report.menus.sanityFlags += 1;
        review.priceSanityFlags.push({ ...menuItem, site_origin: result.site_origin, reason: "price_outside_sanity_bounds" });
        await logMenu(result, menuItem, "sanity_flag", "price_outside_sanity_bounds");
        continue;
      }

      const existing = await findExistingOffering(locationId, normalized);
      if (existing && existing.price_amount != null) {
        report.menus.conflicts += 1;
        review.priceConflicts.push({ ...menuItem, site_origin: result.site_origin, existing_offering_id: existing.id, existing_price_amount: existing.price_amount, existing_price_currency: existing.price_currency });
        await logMenu(result, menuItem, "price_conflict", "existing_price_not_overwritten", { matchedOfferingId: existing.id, existingPriceAmount: existing.price_amount, existingPriceCurrency: existing.price_currency });
        continue;
      }
      if (existing && existing.price_amount == null) {
        if (priceAmount == null) {
          report.menus.skipped += 1;
          await logMenu(result, menuItem, "skipped", "existing_offering_without_price", { matchedOfferingId: existing.id });
          continue;
        }
        if (!dryRun) {
          await client.query(`
            UPDATE ${quoteIdent(schema)}.offerings
            SET price_amount = $2,
                price_currency = $3,
                updated_at = now()
            WHERE id = $1
          `, [existing.id, priceAmount, priceCurrency]);
        }
        report.menus.pricesBackfilled += 1;
        await logMenu(result, menuItem, dryRun ? "dry_run_price_backfilled" : "price_backfilled", null, { matchedOfferingId: existing.id });
        continue;
      }

      const newCount = newOfferingCounts.get(locationId) || 0;
      if (newCount >= 40) {
        report.menus.sanityFlags += 1;
        review.locationOfferingCapFlags.push({ ...menuItem, site_origin: result.site_origin, reason: "location_new_offering_cap_exceeded" });
        await logMenu(result, menuItem, "sanity_flag", "location_new_offering_cap_exceeded");
        continue;
      }
      const alias = await resolveTreatmentAlias(normalized);
      if (!alias && !dryRun) {
        await upsertUnmappedTerm(rawName);
      }
      const offeringId = nextIds[nextIdIndex++];
      if (!dryRun) {
        await client.query(`
          INSERT INTO ${quoteIdent(schema)}.offerings (
            id,
            location_id,
            treatment_id,
            raw_name,
            price_amount,
            price_currency,
            source_offer_url,
            source_id,
            status,
            data_origin,
            verification_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'active', 'scraped', 'unverified')
        `, [
          offeringId,
          locationId,
          alias?.treatment_id || null,
          rawName,
          priceAmount,
          priceCurrency,
          menuItem.source_page_url || null,
        ]);
      }
      newOfferingCounts.set(locationId, newCount + 1);
      report.menus.newOfferingsInserted += 1;
      await logMenu(result, menuItem, dryRun ? "dry_run_new_offering" : "new_offering_inserted", alias ? null : "unmapped_treatment", { offeringId });
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [swarmOfferingLockKey()]).catch(() => {});
  }
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

async function logImage(result, image, outcome, reason, extras = {}) {
  await client.query(`
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(imageLogTable)} (
      tier, site_origin, location_id, image_url, source_page_url, llm_confidence,
      outcome, reason, blob_url, content_sha256, width, height, bytes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, [
    tier,
    result.site_origin,
    Number(image.location_id),
    image.image_url,
    image.source_page_url || null,
    Number(image.llm_confidence || 0),
    outcome,
    reason,
    extras.blobUrl || null,
    extras.contentSha256 || null,
    extras.width || null,
    extras.height || null,
    extras.bytes || null,
  ]);
}

async function logMenu(result, item, outcome, reason, extras = {}) {
  await client.query(`
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(menuLogTable)} (
      tier, site_origin, location_id, raw_name, price_amount, price_currency, price_context,
      source_page_url, outcome, reason, offering_id, matched_offering_id, existing_price_amount, existing_price_currency
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
  `, [
    tier,
    result.site_origin,
    Number(item.location_id),
    cleanText(item.raw_name, 260),
    item.price_amount == null ? null : Number(item.price_amount),
    item.price_currency || null,
    item.price_context || null,
    item.source_page_url || null,
    outcome,
    reason,
    extras.offeringId || null,
    extras.matchedOfferingId || null,
    extras.existingPriceAmount || null,
    extras.existingPriceCurrency || null,
  ]);
}

async function findExistingOffering(locationId, normalizedName) {
  return row(`
    SELECT id, raw_name, price_amount, price_currency
    FROM ${quoteIdent(schema)}.offerings
    WHERE location_id = $1
      AND deleted_at IS NULL
      AND lower(regexp_replace(coalesce(raw_name, ''), '\\s+', ' ', 'g')) = $2
    ORDER BY id
    LIMIT 1
  `, [locationId, normalizedName]);
}

async function resolveTreatmentAlias(normalizedName) {
  return row(`
    SELECT treatment_id
    FROM ${quoteIdent(rawSchema)}.treatment_aliases
    WHERE alias_normalized = $1
    ORDER BY id
    LIMIT 1
  `, [normalizedName]);
}

async function upsertUnmappedTerm(term) {
  await client.query(`
    INSERT INTO ${quoteIdent(rawSchema)}.unmapped_terms (term, source_slug, occurrences)
    VALUES ($1, 'browser_swarm', 1)
    ON CONFLICT (term, source_slug) DO UPDATE
    SET occurrences = ${quoteIdent(rawSchema)}.unmapped_terms.occurrences + 1
  `, [term]);
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

function countMenuCandidates() {
  return (input.results || []).reduce((sum, result) => sum + (result.menu_items || []).length, 0);
}

async function allocateOfferingIds(count) {
  if (!count) {
    return [];
  }
  await client.query("SELECT pg_advisory_lock($1)", [swarmOfferingLockKey()]);
  const current = await row(`SELECT coalesce(max(id), 0)::integer AS max_id FROM ${quoteIdent(schema)}.offerings`);
  return Array.from({ length: count }, (_, index) => Number(current.max_id) + index + 1);
}

function swarmOfferingLockKey() {
  return 2026070802;
}

async function loadCoverage() {
  return row(`
    SELECT
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.locations l WHERE l.status='active' AND l.deleted_at IS NULL AND coalesce(l.is_virtual,false)=false AND NOT EXISTS (SELECT 1 FROM ${quoteIdent(schema)}.images img WHERE img.entity_type='location' AND img.entity_id=l.id AND img.status='active' AND img.deleted_at IS NULL)) AS zero_image_locations,
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.locations l WHERE l.status='active' AND l.deleted_at IS NULL AND EXISTS (SELECT 1 FROM ${quoteIdent(schema)}.offerings o WHERE o.location_id=l.id AND o.deleted_at IS NULL AND o.price_amount IS NOT NULL)) AS locations_with_priced_offering,
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.images WHERE status='active' AND deleted_at IS NULL) AS active_images,
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.offerings WHERE status='active' AND deleted_at IS NULL) AS active_offerings
  `);
}

async function loadBlobInvariants() {
  if (!blobToken) {
    return null;
  }
  const refs = await client.query(`SELECT DISTINCT blob_url FROM ${quoteIdent(schema)}.images WHERE deleted_at IS NULL AND coalesce(blob_url, '') <> ''`);
  const referenced = new Set(refs.rows.map((item) => item.blob_url));
  const blobs = [];
  let cursor;
  do {
    const result = await list({ cursor, limit: 1000, token: blobToken });
    blobs.push(...result.blobs.map((blob) => ({ url: blob.url, size: Number(blob.size || 0) })));
    cursor = result.cursor;
  } while (cursor);
  const blobSet = new Set(blobs.map((blob) => blob.url));
  const orphans = blobs.filter((blob) => !referenced.has(blob.url));
  const missing = [...referenced].filter((url) => !blobSet.has(url));
  return {
    blobStoreCount: blobs.length,
    referencedBlobUrls: referenced.size,
    everyImageRowHasLiveBlob: missing.length === 0,
    everyBlobHasImageRow: orphans.length === 0,
    orphanBlobCount: orphans.length,
    imageRowsPointingAtMissingBlobCount: missing.length,
  };
}

async function imageSpotChecks() {
  const result = await client.query(`
    SELECT location_id, image_url, blob_url, outcome
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(imageLogTable)}
    WHERE tier = $1 AND outcome IN ('ingested', 'dry_run_ingested')
    ORDER BY id
    LIMIT 15
  `, [tier]);
  return result.rows;
}

async function menuSpotChecks() {
  const result = await client.query(`
    SELECT location_id, raw_name, price_amount, price_currency, outcome, offering_id, matched_offering_id
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(menuLogTable)}
    WHERE tier = $1 AND outcome IN ('price_backfilled', 'new_offering_inserted', 'dry_run_price_backfilled', 'dry_run_new_offering')
    ORDER BY id
    LIMIT 15
  `, [tier]);
  return result.rows;
}

function isUrlLoadedByResult(url, result) {
  return new Set(result.loaded_image_urls || []).has(url);
}

function makeAlt(result, image) {
  const location = (result.locations || []).find((item) => Number(item.location_id) === Number(image.location_id));
  return cleanText(location?.name || "Clinic photo", 180);
}

function normalizeTerm(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizePriceInput(item) {
  const rawAmount = item.price_amount;
  const numericAmount = rawAmount === null || rawAmount === undefined || rawAmount === "" ? null : Number(rawAmount);
  const priceCurrency = item.price_currency ? cleanText(item.price_currency, 12).toUpperCase() : null;
  if (numericAmount !== 0) {
    return {
      item,
      priceAmount: Number.isFinite(numericAmount) ? numericAmount : null,
      priceCurrency,
      skip: false,
      reason: null,
    };
  }

  if (isFreeConsultationOrCta(item) || !isGenuinelyFreeService(item)) {
    return {
      item: { ...item, price_amount: null, price_currency: null },
      priceAmount: null,
      priceCurrency: null,
      skip: true,
      reason: isFreeConsultationOrCta(item) ? "zero_price_free_consultation_or_cta" : "zero_price_ambiguous",
    };
  }

  return {
    item: { ...item, price_amount: null, price_currency: null, price_context: withFreeContext(item.price_context) },
    priceAmount: null,
    priceCurrency: null,
    skip: false,
    reason: null,
  };
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

function pricePassesSanity(amount, currency, item = null) {
  const usd = amount * usdRate(currency || "USD");
  if (usd >= 1 && /\bper\s*unit\b|\b\/\s*unit\b|\bunit\b/i.test(String(item?.price_context || ""))) {
    return true;
  }
  return usd >= 5 && usd <= 100000;
}

function usdRate(currency) {
  const rates = {
    USD: 1,
    EUR: 1.1,
    GBP: 1.3,
    CAD: 0.73,
    AUD: 0.66,
    NZD: 0.61,
    CHF: 1.12,
    AED: 0.27,
    SGD: 0.78,
    KRW: 0.00073,
    JPY: 0.0068,
    MXN: 0.055,
    PLN: 0.25,
    SEK: 0.095,
    NOK: 0.094,
    DKK: 0.15,
    TRY: 0.03,
    THB: 0.027,
  };
  return rates[String(currency || "USD").toUpperCase()] || 1;
}

async function row(sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
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

function loadSwarmInput() {
  const loaded = [];
  let tierFromInput = tierOption;
  if (existsSync(inputPath)) {
    const json = JSON.parse(readFileSync(inputPath, "utf8"));
    tierFromInput = json.tier || tierFromInput;
    loaded.push(...(json.results || []));
  }
  if (existsSync(inputDir)) {
    for (const fileName of readdirSync(inputDir).filter((name) => name.endsWith(".jsonl")).sort()) {
      const filePath = path.join(inputDir, fileName);
      for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
        if (line.trim()) {
          loaded.push(JSON.parse(line));
        }
      }
    }
  }
  if (!loaded.length) {
    throw new Error(`No swarm results found at ${path.relative(ROOT, inputPath)} or ${path.relative(ROOT, inputDir)}.`);
  }
  return {
    tier: tierFromInput,
    results: dedupeResults(loaded),
  };
}

function dedupeResults(results) {
  const byOrigin = new Map();
  for (const result of results) {
    if (!result?.site_origin || byOrigin.has(result.site_origin)) {
      continue;
    }
    byOrigin.set(result.site_origin, normalizeResultItems(result));
  }
  return [...byOrigin.values()];
}

function normalizeResultItems(result) {
  const seenImages = new Set();
  const images = [];
  for (const image of result.images || []) {
    const key = `${Number(image.location_id) || ""}|${String(image.image_url || "").trim()}`;
    if (!String(image.image_url || "").trim() || seenImages.has(key)) {
      continue;
    }
    seenImages.add(key);
    images.push(image);
  }

  const seenMenus = new Set();
  const menuItems = [];
  for (const item of result.menu_items || []) {
    const key = `${Number(item.location_id) || ""}|${normalizeTerm(item.raw_name)}`;
    if (!normalizeTerm(item.raw_name) || seenMenus.has(key)) {
      continue;
    }
    seenMenus.add(key);
    menuItems.push(item);
  }

  return {
    ...result,
    images,
    menu_items: menuItems,
  };
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
    else if (arg === "--input-dir") parsed.inputDir = args[++index];
    else if (arg === "--report") parsed.report = args[++index];
    else if (arg === "--review") parsed.review = args[++index];
    else if (arg === "--tier") parsed.tier = args[++index];
    else if (arg === "--phase-date") parsed.phaseDate = args[++index];
    else if (arg === "--schema") parsed.schema = args[++index];
    else if (arg === "--raw-schema") parsed.rawSchema = args[++index];
    else if (arg === "--database-url") parsed.databaseUrl = args[++index];
    else if (arg === "--blob-token") parsed.blobToken = args[++index];
    else if (arg === "--confidence-threshold") parsed.confidenceThreshold = args[++index];
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--skip-blob-invariants") parsed.skipBlobInvariants = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return parsed;
}
