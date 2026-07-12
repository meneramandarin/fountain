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
const concurrency = Number.parseInt(options.concurrency || "8", 10);
const maxSites = options.maxSites ? Number.parseInt(options.maxSites, 10) : Infinity;
const reportPath = path.resolve(ROOT, options.report || `website-image-harvest-report-${phaseDate}.json`);
const checkpointPath = path.resolve(ROOT, options.checkpoint || `website-image-harvest-checkpoint-${phaseDate}.json`);
const userAgent = options.userAgent || "FountainBot/1.0 (+https://fountain.clinic)";
const candidateTable = `website_image_harvest_candidates_${phaseDate}`;
const resultTable = `website_image_harvest_results_${phaseDate}`;

const profileDomains = new Set([
  "as.me",
  "acuityscheduling.com",
  "booksy.com",
  "clientsecure.me",
  "facebook.com",
  "goo.gl",
  "google.com",
  "glossgenius.com",
  "instagram.com",
  "linktr.ee",
  "maps.app.goo.gl",
  "myshopify.com",
  "rymaps.xyz",
  "square.site",
  "squarespace.com",
  "vagaro.com",
  "wixsite.com",
  "yelp.com",
  "zocdoc.com",
  "zoca.com",
]);

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

if (!blobAccess && !options.candidatesOnly) {
  throw new Error("Missing Blob credentials. Set BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN.");
}

const pool = new Pool({
  connectionString: normalizePostgresConnectionString(connectionString),
  max: Math.max(4, concurrency + 2),
});
pool.on("error", (error) => {
  console.warn(`Postgres idle connection error: ${error.message || error}`);
});

const summary = {
  phaseDate,
  candidateTable: `${rawSchema}.${candidateTable}`,
  resultTable: `${rawSchema}.${resultTable}`,
  coverageBefore: null,
  coverageAfter: null,
  noUsableWebsiteCount: 0,
  outcomes: {},
  failedValidation: {},
  bytesUploaded: 0,
  estimatedMonthlyStorageCostDeltaUsd: 0,
  spotChecks: [],
};

try {
  await ensureTables();
  if (options.reclassify || !(await tableExists(rawSchema, candidateTable))) {
    await classifyCandidates();
  } else {
    console.log(`Reusing existing candidate table ${rawSchema}.${candidateTable}. Pass --reclassify to rebuild it.`);
  }
  summary.coverageBefore = await loadCoverageBeforeFromCandidates();
  summary.noUsableWebsiteCount = await loadNoUsableWebsiteCount();
  writeJson(reportPath, summary);

  if (options.candidatesOnly) {
    console.log(`Candidate classification complete. Report: ${path.relative(ROOT, reportPath)}`);
    console.table(await loadCandidateCounts());
    process.exit(0);
  }

  await harvestSites();
  summary.coverageAfter = await loadCoverage();
  summary.outcomes = await loadOutcomeSummary();
  summary.failedValidation = await loadFailedValidationSummary();
  summary.bytesUploaded = await loadBytesUploaded();
  summary.estimatedMonthlyStorageCostDeltaUsd = estimateMonthlyStorageCost(summary.bytesUploaded);
  summary.spotChecks = await loadSpotChecks();
  writeJson(reportPath, summary);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`wrote ${path.relative(ROOT, reportPath)}`);
} finally {
  await pool.end();
}

async function ensureTables() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)} (
      site_origin text PRIMARY KEY,
      outcome text NOT NULL,
      reason text,
      homepage_url text,
      final_url text,
      selected_image_url text,
      selected_source text,
      alt text,
      content_sha256 text,
      bytes integer,
      width integer,
      height integer,
      shared_content boolean NOT NULL DEFAULT false,
      promoted_location_ids integer[] NOT NULL DEFAULT '{}',
      promoted_blob_urls text[] NOT NULL DEFAULT '{}',
      processed_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function classifyCandidates() {
  const db = await pool.connect();
  await db.query("BEGIN");
  try {
    await db.query(`DROP TABLE IF EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)}`);
    await db.query(`
      CREATE TABLE ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)} AS
      WITH location_counts AS (
        SELECT
          l.id,
          l.name,
          l.slug,
          l.website,
          l.country_code,
          l.country_name,
          l.locality,
          l.region,
          count(img.id)::integer AS active_image_count
        FROM ${quoteIdent(schema)}.locations l
        LEFT JOIN ${quoteIdent(schema)}.images img
          ON img.entity_type = 'location'
         AND img.entity_id = l.id
         AND img.status = 'active'
         AND img.deleted_at IS NULL
        WHERE l.status = 'active'
          AND l.deleted_at IS NULL
          AND coalesce(l.is_virtual, false) = false
        GROUP BY l.id
      )
      SELECT
        id AS location_id,
        name,
        slug,
        website,
        country_code,
        country_name,
        locality,
        region,
        active_image_count,
        NULL::text AS normalized_url,
        NULL::text AS site_origin,
        NULL::text AS website_host,
        NULL::text AS website_domain,
        NULL::text AS candidate_status,
        NULL::text AS candidate_reason,
        now() AS classified_at
      FROM location_counts
      WHERE active_image_count = 0
    `);

    const candidateRows = await db.query(`SELECT location_id, website FROM ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)}`);
    const updates = [];
    for (const location of candidateRows.rows) {
      const normalized = normalizeWebsite(location.website);
      const classification = classifyWebsite(normalized);
      updates.push([
        location.location_id,
        normalized?.homepageUrl || null,
        normalized?.origin || null,
        normalized?.host || null,
        normalized?.domain || null,
        classification.status,
        classification.reason,
      ]);
    }
    for (let index = 0; index < updates.length; index += 500) {
      const batch = updates.slice(index, index + 500);
      const params = [];
      const values = batch.map((update) => {
        const offset = params.length;
        params.push(...update);
        return `($${offset + 1}::integer, $${offset + 2}::text, $${offset + 3}::text, $${offset + 4}::text, $${offset + 5}::text, $${offset + 6}::text, $${offset + 7}::text)`;
      });
      await db.query(
        `
        UPDATE ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)} c
        SET normalized_url = v.normalized_url,
            site_origin = v.site_origin,
            website_host = v.website_host,
            website_domain = v.website_domain,
            candidate_status = v.candidate_status,
            candidate_reason = v.candidate_reason
        FROM (VALUES ${values.join(", ")}) AS v(location_id, normalized_url, site_origin, website_host, website_domain, candidate_status, candidate_reason)
        WHERE c.location_id = v.location_id
        `,
        params,
      );
    }

    await db.query(`ALTER TABLE ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)} ADD PRIMARY KEY (location_id)`);
    await db.query(`CREATE INDEX ON ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)} (candidate_status, site_origin)`);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

function classifyWebsite(normalized) {
  if (!normalized) {
    return { status: "no_usable_website", reason: "missing_or_invalid_website" };
  }
  if (isProfileDomain(normalized.host, normalized.domain)) {
    return { status: "no_usable_website", reason: "profile_marketplace_or_junk_domain" };
  }
  return { status: "candidate", reason: null };
}

async function harvestSites() {
  const siteRows = await rows(`
    SELECT site_origin, min(normalized_url) AS homepage_url, count(*)::integer AS location_count
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)}
    WHERE candidate_status = 'candidate'
      AND site_origin IS NOT NULL
    GROUP BY site_origin
    ORDER BY location_count DESC, site_origin
    LIMIT $1
  `, [Number.isFinite(maxSites) ? maxSites : 2147483647]);
  const processed = new Set((await rows(`SELECT site_origin FROM ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)}`)).map((row) => row.site_origin));
  const queue = siteRows.filter((site) => !processed.has(site.site_origin));
  const checkpoint = loadCheckpoint();

  await runWorkers(queue, concurrency, async (site) => {
    if (checkpoint.doneSiteOrigins.includes(site.site_origin)) {
      return;
    }
    await harvestSite(site);
    checkpoint.doneSiteOrigins.push(site.site_origin);
    saveCheckpoint(checkpoint);
  });
}

async function harvestSite(site) {
  let uploadedBlobs = [];
  try {
    const robots = await robotsAllowed(site.site_origin, "/");
    if (!robots.allowed) {
      await logSiteOutcome(site, "robots_disallowed", robots.reason);
      return;
    }

    const homepage = await fetchHomepage(site.homepage_url);
    if (!homepage.ok) {
      await logSiteOutcome(site, homepage.outcome, homepage.reason, { finalUrl: homepage.finalUrl });
      return;
    }
    if (isBotBlocked(homepage.html, homepage.status)) {
      await logSiteOutcome(site, "bot_blocked", "challenge_or_bot_block_page", { finalUrl: homepage.finalUrl });
      return;
    }

    const candidate = extractImageCandidate(homepage.html, homepage.finalUrl);
    if (!candidate) {
      await logSiteOutcome(site, "no_candidate_found", "no acceptable meta/jsonld/img candidate", { finalUrl: homepage.finalUrl });
      return;
    }

    const downloaded = await downloadImage(candidate.url);
    if (!downloaded.ok) {
      await logSiteOutcome(site, "fetch_failed", downloaded.reason, {
        finalUrl: homepage.finalUrl,
        selectedImageUrl: candidate.url,
        selectedSource: candidate.source,
        alt: candidate.alt,
      });
      return;
    }

    const validation = await validateAndProcessImage(downloaded.buffer, downloaded.contentType);
    if (!validation.ok) {
      await logSiteOutcome(site, "failed_validation", validation.reason, {
        finalUrl: homepage.finalUrl,
        selectedImageUrl: candidate.url,
        selectedSource: candidate.source,
        alt: candidate.alt,
        bytes: downloaded.buffer.length,
      });
      return;
    }

    const sha256 = createHash("sha256").update(validation.buffer).digest("hex");
    const locations = await rows(`
      SELECT c.location_id, c.name, c.slug
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)} c
      WHERE c.site_origin = $1
        AND c.candidate_status = 'candidate'
        AND NOT EXISTS (
          SELECT 1
          FROM ${quoteIdent(schema)}.images img
          WHERE img.entity_type = 'location'
            AND img.entity_id = c.location_id
            AND img.status = 'active'
            AND img.deleted_at IS NULL
        )
      ORDER BY c.location_id
    `, [site.site_origin]);

    if (!locations.length) {
      await logSiteOutcome(site, "already_has_image", "all site locations now have images", {
        finalUrl: homepage.finalUrl,
        selectedImageUrl: candidate.url,
        selectedSource: candidate.source,
        alt: candidate.alt,
        contentSha256: sha256,
        bytes: validation.buffer.length,
        width: validation.width,
        height: validation.height,
      });
      return;
    }

    const existingAnywhere = await row(
      `
      SELECT id
      FROM ${quoteIdent(schema)}.images
      WHERE content_sha256 = $1
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [sha256],
    );
    const promotedIds = [];
    const promotedBlobUrls = [];
    let sharedContent = Boolean(existingAnywhere);

    for (const location of locations) {
      const sameLocation = await row(
        `
        SELECT id
        FROM ${quoteIdent(schema)}.images
        WHERE entity_type = 'location'
          AND entity_id = $1
          AND content_sha256 = $2
          AND status = 'active'
          AND deleted_at IS NULL
        LIMIT 1
        `,
        [location.location_id, sha256],
      );
      if (sameLocation) {
        continue;
      }

      const pathname = `listing-images/website-harvest/location/${location.location_id}/${sha256.slice(0, 20)}.${validation.extension}`;
      const uploaded = await put(pathname, validation.buffer, {
        access: "public",
        contentType: validation.contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        ...blobAccess,
      });
      uploadedBlobs.push(uploaded.url);

      await insertImage(location.location_id, uploaded.url, candidate.url, sha256, cleanAlt(candidate.alt || homepage.title));
      promotedIds.push(location.location_id);
      promotedBlobUrls.push(uploaded.url);
      if (promotedIds.length > 1) {
        sharedContent = true;
      }
    }

    if (!promotedIds.length) {
      await logSiteOutcome(site, "duplicate_content", "content_sha256 already exists on same location(s)", {
        finalUrl: homepage.finalUrl,
        selectedImageUrl: candidate.url,
        selectedSource: candidate.source,
        alt: candidate.alt,
        contentSha256: sha256,
        bytes: validation.buffer.length,
        width: validation.width,
        height: validation.height,
      });
      return;
    }

    await logSiteOutcome(site, "harvested", sharedContent ? "shared_content" : null, {
      finalUrl: homepage.finalUrl,
      selectedImageUrl: candidate.url,
      selectedSource: candidate.source,
      alt: candidate.alt,
      contentSha256: sha256,
      bytes: validation.buffer.length,
      width: validation.width,
      height: validation.height,
      sharedContent,
      promotedLocationIds: promotedIds,
      promotedBlobUrls,
    });
    uploadedBlobs = [];
  } catch (error) {
    for (const blobUrl of uploadedBlobs) {
      try {
        await del(blobUrl, blobAccess);
      } catch {
        // Keep the main failure visible; orphan sweep can catch any failed cleanup.
      }
    }
    await logSiteOutcome(site, "fetch_failed", error.message || String(error));
  }
}

async function robotsAllowed(siteOrigin, pathName) {
  const robotsUrl = new URL("/robots.txt", siteOrigin).toString();
  const response = await boundedFetch(robotsUrl, { attempts: 1 });
  if (!response.ok) {
    return { allowed: true, reason: "robots_unavailable" };
  }
  const text = await response.response.text();
  const allowed = isAllowedByRobots(text, userAgent, pathName || "/");
  return { allowed, reason: allowed ? null : "homepage_disallowed_by_robots" };
}

function isAllowedByRobots(content, ua, pathName) {
  const groups = [];
  let current = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line || !line.includes(":")) {
      continue;
    }
    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.join(":").trim();
    if (key === "user-agent") {
      current = { agents: [value.toLowerCase()], rules: [] };
      groups.push(current);
    } else if (current && (key === "allow" || key === "disallow")) {
      current.rules.push({ type: key, path: value });
    }
  }
  const botToken = ua.toLowerCase().split(/[ /;]/)[0];
  const matching = groups.filter((group) => group.agents.some((agent) => agent === "*" || botToken.includes(agent) || agent.includes(botToken)));
  const rules = matching.flatMap((group) => group.rules).filter((rule) => rule.path !== "");
  let best = null;
  for (const rule of rules) {
    const pattern = rule.path.replace(/\*/g, "");
    if (pathName.startsWith(pattern) && (!best || rule.path.length > best.path.length)) {
      best = rule;
    }
  }
  return !best || best.type !== "disallow";
}

async function fetchHomepage(url) {
  const response = await boundedFetch(url, { attempts: 2 });
  if (!response.ok) {
    return response;
  }
  const contentType = response.response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return { ok: false, outcome: "fetch_failed", reason: "homepage_not_html", finalUrl: response.response.url };
  }
  const html = await response.response.text();
  return { ok: true, status: response.response.status, html, finalUrl: response.response.url, title: extractTitle(html) };
}

async function boundedFetch(url, { attempts }) {
  let last = { ok: false, outcome: "fetch_failed", reason: "fetch_failed", finalUrl: url };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "user-agent": userAgent,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
        },
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const reason = `http_${response.status}`;
        if (response.status >= 400 && response.status < 500) {
          return { ok: false, outcome: response.status === 403 ? "bot_blocked" : "fetch_failed", reason, finalUrl: response.url };
        }
        last = { ok: false, outcome: "fetch_failed", reason, finalUrl: response.url };
        continue;
      }
      return { ok: true, response };
    } catch (error) {
      clearTimeout(timeout);
      last = { ok: false, outcome: "fetch_failed", reason: error.name === "AbortError" ? "timeout" : error.message || "fetch_error", finalUrl: url };
    }
  }
  return last;
}

async function downloadImage(url) {
  const response = await boundedFetch(url, { attempts: 2 });
  if (!response.ok) {
    return { ok: false, reason: response.reason };
  }
  const arrayBuffer = await response.response.arrayBuffer();
  return {
    ok: true,
    buffer: Buffer.from(arrayBuffer),
    contentType: response.response.headers.get("content-type") || "",
  };
}

function isBotBlocked(html, status) {
  if (status === 403 || status === 429) {
    return true;
  }
  return /cloudflare|cf-chl|attention required|captcha|recaptcha|hcaptcha|access denied|bot detection|verify you are human/i.test(html);
}

function extractImageCandidate(html, finalUrl) {
  const title = extractTitle(html);
  const metaCandidate =
    metaContent(html, ["property", "og:image:secure_url"]) ||
    metaContent(html, ["property", "og:image"]) ||
    metaContent(html, ["name", "og:image"]) ||
    metaContent(html, ["name", "twitter:image"]) ||
    metaContent(html, ["property", "twitter:image"]);
  if (metaCandidate && !isJunkImageUrl(metaCandidate)) {
    return {
      url: resolveUrl(metaCandidate, finalUrl),
      source: "meta",
      alt: metaContent(html, ["property", "og:image:alt"]) || metaContent(html, ["name", "twitter:image:alt"]) || title,
    };
  }

  const jsonLd = extractJsonLdImage(html, finalUrl, title);
  if (jsonLd) {
    return jsonLd;
  }

  return extractLargestImg(html, finalUrl, title);
}

function metaContent(html, [attrName, attrValue]) {
  const pattern = new RegExp(`<meta\\b[^>]*${attrName}=["']${escapeRegex(attrValue)}["'][^>]*>`, "i");
  const match = html.match(pattern);
  if (!match) {
    return null;
  }
  return attr(match[0], "content");
}

function extractJsonLdImage(html, finalUrl, title) {
  const matches = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    const text = decodeHtml(match[1].trim());
    try {
      const parsed = JSON.parse(text);
      const nodes = flattenJsonLd(parsed);
      for (const node of nodes) {
        const type = Array.isArray(node["@type"]) ? node["@type"].join(" ") : String(node["@type"] || "");
        if (!/(organization|localbusiness|medicalclinic|medicalbusiness|healthandbeautybusiness)/i.test(type)) {
          continue;
        }
        const image = firstImageValue(node.image || node.logo);
        if (image && !isJunkImageUrl(image)) {
          return { url: resolveUrl(image, finalUrl), source: "jsonld", alt: title };
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return [value, ...flattenJsonLd(value["@graph"] || [])];
}

function firstImageValue(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(firstImageValue).find(Boolean) || null;
  }
  if (typeof value === "object") {
    return value.url || value.contentUrl || null;
  }
  return null;
}

function extractLargestImg(html, finalUrl, title) {
  const matches = html.matchAll(/<img\b[^>]*>/gi);
  let best = null;
  for (const match of matches) {
    const tag = match[0];
    const alt = attr(tag, "alt") || "";
    const rawSrc = attr(tag, "srcset") ? bestFromSrcset(attr(tag, "srcset")) : attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-lazy-src");
    if (!rawSrc || isJunkImageUrl(rawSrc) || /logo|icon|favicon|badge|sprite/i.test(alt)) {
      continue;
    }
    const declaredWidth = Number.parseInt(attr(tag, "width") || "0", 10) || widthFromSrcset(attr(tag, "srcset")) || 0;
    if (declaredWidth && declaredWidth < 300) {
      continue;
    }
    const score = declaredWidth || 300;
    if (!best || score > best.score) {
      best = { url: resolveUrl(rawSrc, finalUrl), source: "img", alt: alt || title, score };
    }
  }
  return best ? { url: best.url, source: best.source, alt: best.alt } : null;
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
  await pool.query(
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
    VALUES ('location', $1, $2, $3, $4, $5, NULL, 'active', 'scraped', 'unverified')
    `,
    [locationId, imageUrl, blobUrl, sha256, alt],
  );
}

async function logSiteOutcome(site, outcome, reason, extras = {}) {
  await pool.query(
    `
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)} (
      site_origin,
      outcome,
      reason,
      homepage_url,
      final_url,
      selected_image_url,
      selected_source,
      alt,
      content_sha256,
      bytes,
      width,
      height,
      shared_content,
      promoted_location_ids,
      promoted_blob_urls
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (site_origin) DO UPDATE SET
      outcome = EXCLUDED.outcome,
      reason = EXCLUDED.reason,
      homepage_url = EXCLUDED.homepage_url,
      final_url = EXCLUDED.final_url,
      selected_image_url = EXCLUDED.selected_image_url,
      selected_source = EXCLUDED.selected_source,
      alt = EXCLUDED.alt,
      content_sha256 = EXCLUDED.content_sha256,
      bytes = EXCLUDED.bytes,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      shared_content = EXCLUDED.shared_content,
      promoted_location_ids = EXCLUDED.promoted_location_ids,
      promoted_blob_urls = EXCLUDED.promoted_blob_urls,
      processed_at = now()
    `,
    [
      site.site_origin,
      outcome,
      reason,
      site.homepage_url,
      extras.finalUrl || null,
      extras.selectedImageUrl || null,
      extras.selectedSource || null,
      extras.alt || null,
      extras.contentSha256 || null,
      extras.bytes || null,
      extras.width || null,
      extras.height || null,
      Boolean(extras.sharedContent),
      extras.promotedLocationIds || [],
      extras.promotedBlobUrls || [],
    ],
  );
}

async function loadCoverage() {
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
        AND coalesce(l.is_virtual, false) = false
      GROUP BY l.id
    )
    SELECT
      count(*) FILTER (WHERE active_images = 0)::integer AS zero_image_locations,
      count(*) FILTER (WHERE active_images > 0)::integer AS locations_with_images,
      (SELECT count(*)::integer FROM ${quoteIdent(schema)}.images WHERE status = 'active' AND deleted_at IS NULL) AS active_images
    FROM location_counts
  `);
}

async function loadCoverageBeforeFromCandidates() {
  const current = await loadCoverage();
  const result = await row(`
    WITH inserted_this_phase AS (
      SELECT DISTINCT unnest(promoted_blob_urls) AS blob_url
      FROM ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)}
      WHERE outcome = 'harvested'
    )
    SELECT
      count(*)::integer AS zero_image_locations,
      (
        SELECT count(*)::integer
        FROM inserted_this_phase p
        JOIN ${quoteIdent(schema)}.images img ON img.blob_url = p.blob_url
        WHERE img.status = 'active'
          AND img.deleted_at IS NULL
      ) AS active_images_inserted_this_phase
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)}
  `);
  const zeroImageLocations = Number(result?.zero_image_locations || current.zero_image_locations || 0);
  const activeImagesInserted = Number(result?.active_images_inserted_this_phase || 0);
  const activeLocationTotal = Number(current.zero_image_locations || 0) + Number(current.locations_with_images || 0);
  return {
    zero_image_locations: zeroImageLocations,
    locations_with_images: activeLocationTotal - zeroImageLocations,
    active_images: Number(current.active_images || 0) - activeImagesInserted,
  };
}

async function loadNoUsableWebsiteCount() {
  const result = await row(`
    SELECT count(*)::integer AS count
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)}
    WHERE candidate_status = 'no_usable_website'
  `);
  return result.count;
}

async function loadCandidateCounts() {
  return rows(`
    SELECT candidate_status, coalesce(candidate_reason, '') AS reason, count(*)::integer AS rows
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)}
    GROUP BY candidate_status, candidate_reason
    ORDER BY candidate_status, rows DESC
  `);
}

async function loadOutcomeSummary() {
  return rows(`
    SELECT outcome, coalesce(reason, '') AS reason, count(*)::integer AS rows
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)}
    GROUP BY outcome, reason
    ORDER BY outcome, rows DESC
  `);
}

async function loadFailedValidationSummary() {
  return rows(`
    SELECT reason, count(*)::integer AS rows
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)}
    WHERE outcome = 'failed_validation'
    GROUP BY reason
    ORDER BY rows DESC, reason
  `);
}

async function loadBytesUploaded() {
  const result = await row(`
    SELECT coalesce(sum(bytes), 0)::bigint AS bytes
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)}
    WHERE outcome = 'harvested'
  `);
  return Number(result.bytes || 0);
}

async function loadSpotChecks() {
  return rows(`
    SELECT
      c.location_id,
      c.name,
      c.country_code,
      c.locality,
      '/directory/locations/' || c.slug AS url,
      img.blob_url
    FROM ${quoteIdent(rawSchema)}.${quoteIdent(resultTable)} r
    JOIN ${quoteIdent(rawSchema)}.${quoteIdent(candidateTable)} c
      ON c.site_origin = r.site_origin
     AND c.location_id = ANY(r.promoted_location_ids)
    JOIN ${quoteIdent(schema)}.images img
      ON img.entity_type = 'location'
     AND img.entity_id = c.location_id
     AND img.blob_url = ANY(r.promoted_blob_urls)
     AND img.status = 'active'
     AND img.deleted_at IS NULL
    WHERE r.outcome = 'harvested'
    ORDER BY c.country_code NULLS LAST, c.location_id
    LIMIT 15
  `);
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

function normalizeWebsite(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\d?\./, "");
    const origin = `${url.protocol}//${url.host}`;
    return {
      homepageUrl: new URL("/", origin).toString(),
      origin,
      host,
      domain: registrableDomain(host),
    };
  } catch {
    return null;
  }
}

function registrableDomain(host) {
  const parts = String(host || "").split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  if (/^(co|com|org|net|ac|gov)\.[a-z]{2}$/i.test(lastTwo) && parts.length >= 3) {
    return lastThree;
  }
  return lastTwo;
}

function isProfileDomain(host, domain) {
  if (!host || !domain) {
    return true;
  }
  if (profileDomains.has(domain) || profileDomains.has(host)) {
    return true;
  }
  return [...profileDomains].some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function isJunkImageUrl(value) {
  const text = String(value || "").toLowerCase();
  return !text || /^data:/.test(text) || /\.(svg|ico|gif)(?:$|[?#])/.test(text) || /(logo|icon|favicon|badge|sprite|pixel|placeholder|loader|spinner|blank|transparent)/.test(text);
}

function resolveUrl(value, base) {
  try {
    return new URL(decodeHtml(String(value || "").trim()), base).toString();
  } catch {
    return null;
  }
}

function attr(tag, name) {
  const pattern = new RegExp(`\\b${escapeRegex(name)}\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return decodeHtml(match?.[2] || match?.[3] || match?.[4] || "");
}

function bestFromSrcset(srcset) {
  return parseSrcset(srcset).sort((a, b) => b.width - a.width)[0]?.url || null;
}

function widthFromSrcset(srcset) {
  return parseSrcset(srcset).sort((a, b) => b.width - a.width)[0]?.width || 0;
}

function parseSrcset(srcset) {
  return String(srcset || "")
    .split(",")
    .map((part) => {
      const [url, descriptor] = part.trim().split(/\s+/, 2);
      const width = descriptor?.endsWith("w") ? Number.parseInt(descriptor, 10) : 0;
      return { url, width };
    })
    .filter((item) => item.url);
}

function extractTitle(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return cleanAlt(match ? decodeHtml(match[1]) : "");
}

function cleanAlt(value) {
  const text = decodeHtml(String(value || "").replace(/\s+/g, " ").trim());
  return text || null;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function loadCheckpoint() {
  if (!existsSync(checkpointPath)) {
    return { doneSiteOrigins: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(checkpointPath, "utf8"));
    return { doneSiteOrigins: Array.isArray(parsed.doneSiteOrigins) ? parsed.doneSiteOrigins : [] };
  } catch {
    return { doneSiteOrigins: [] };
  }
}

function saveCheckpoint(checkpoint) {
  writeJson(checkpointPath, checkpoint);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function estimateMonthlyStorageCost(bytes) {
  return Number(((bytes / 1024 / 1024 / 1024) * 0.15).toFixed(4));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(args) {
  const parsed = { envFile: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--candidates-only") {
      parsed.candidatesOnly = true;
    } else if (arg === "--reclassify") {
      parsed.reclassify = true;
    } else if (arg === "--env-file") {
      parsed.envFile.push(requiredValue(args, ++index, arg));
    } else if (arg === "--database-url") {
      parsed.databaseUrl = requiredValue(args, ++index, arg);
    } else if (arg === "--blob-token") {
      parsed.blobToken = requiredValue(args, ++index, arg);
    } else if (arg === "--phase-date") {
      parsed.phaseDate = requiredValue(args, ++index, arg);
    } else if (arg === "--schema") {
      parsed.schema = requiredValue(args, ++index, arg);
    } else if (arg === "--raw-schema") {
      parsed.rawSchema = requiredValue(args, ++index, arg);
    } else if (arg === "--concurrency") {
      parsed.concurrency = requiredValue(args, ++index, arg);
    } else if (arg === "--max-sites") {
      parsed.maxSites = requiredValue(args, ++index, arg);
    } else if (arg === "--checkpoint") {
      parsed.checkpoint = requiredValue(args, ++index, arg);
    } else if (arg === "--report") {
      parsed.report = requiredValue(args, ++index, arg);
    } else if (arg === "--user-agent") {
      parsed.userAgent = requiredValue(args, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function requiredValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function quoteIdent(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return `"${String(value).replaceAll('"', '""')}"`;
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
