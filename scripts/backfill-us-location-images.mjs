import { put } from "@vercel/blob";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = process.cwd();
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const IMAGE_TYPES = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const BLOCKED_HOST_SUFFIXES = [
  "google.com",
  "googleusercontent.com",
  "gstatic.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "yelp.com",
  "mapquest.com",
  "yellowpages.com",
  "bioedgelongevity.com",
  "longevity.technology",
  "bookimed.com",
  "us-uk.bookimed.com",
  "fresha.com",
  "mindbodyonline.com",
  "vagaro.com",
];
const WEAK_IMAGE_WORDS = [
  "logo",
  "icon",
  "favicon",
  "sprite",
  "badge",
  "placeholder",
  "avatar",
  "apple-touch",
  "map",
  "marker",
  "pin",
  "svg",
];
const STRONG_IMAGE_WORDS = [
  "clinic",
  "location",
  "office",
  "studio",
  "hero",
  "banner",
  "interior",
  "exterior",
  "facility",
  "space",
  "team",
  "provider",
  "treatment",
  "wellness",
];

const options = parseArgs(process.argv.slice(2));
for (const envFile of options.envFile || []) {
  loadEnvFile(path.resolve(ROOT, envFile));
}

const dbPath = path.resolve(ROOT, options.db || "canonical.db");
const cachePath = path.resolve(ROOT, options.cacheDb || "data/databases/location_image_backfill.sqlite");
const country = options.country || "US";
const dryRun = Boolean(options.dryRun);
const noUpload = Boolean(options.noUpload);
const limit = options.limit ? Number.parseInt(options.limit, 10) : 100;
const maxBytes = options.maxBytes ? Number.parseInt(options.maxBytes, 10) : 5 * 1024 * 1024;
const minBytes = options.minBytes ? Number.parseInt(options.minBytes, 10) : 4 * 1024;
const timeoutMs = options.timeoutMs ? Number.parseInt(options.timeoutMs, 10) : 15_000;
const delayMs = options.delayMs ? Number.parseInt(options.delayMs, 10) : 200;
const prefix = (options.prefix || "listing-images/site-backfill").replace(/^\/+|\/+$/g, "");
const mode = options.mode || "missing-any";
const progressEvery = options.progressEvery ? Number.parseInt(options.progressEvery, 10) : 10;

if (!dryRun && !noUpload && !hasBlobAuth()) {
  throw new Error("BLOB_READ_WRITE_TOKEN or VERCEL_OIDC_TOKEN+BLOB_STORE_ID is required unless --dry-run or --no-upload is set.");
}

const canonical = new Database(dbPath);
canonical.pragma("busy_timeout = 10000");
const cache = dryRun ? null : new Database(cachePath);
if (cache) {
  cache.pragma("busy_timeout = 10000");
  ensureCacheSchema(cache);
}

const existingUploads = loadExistingUploads(canonical);
const targets = selectTargets(canonical);
const siteCache = new Map();
const uploadedThisRun = new Map();
let discovered = 0;
let uploaded = 0;
let reused = 0;
let written = 0;
let skipped = 0;
const errors = [];

try {
  for (const target of targets) {
    const websites = candidateWebsites(target);
    if (!websites.length) {
      skipped += 1;
      errors.push(errorRow(target, "no_provider_website"));
      logProgress();
      continue;
    }

    const reuseKey = reusableImageKey(target, websites[0]);
    const cached = siteCache.get(reuseKey);
    if (cached) {
      reused += 1;
      if (!dryRun) {
        writeCacheRow(cache, target, cached, "site-cache");
      }
      written += dryRun ? 0 : 1;
      logProgress();
      continue;
    }

    let discovery = null;
    let lastError = null;
    for (const website of websites) {
      try {
        discovery = await discoverImageForWebsite(website, target);
      } catch (error) {
        lastError = error;
      }
      if (discovery) {
        break;
      }
    }

    if (!discovery) {
      skipped += 1;
      errors.push(errorRow(target, lastError?.message || "no_usable_image"));
      logProgress();
      continue;
    }

    discovered += 1;
    let blobUrl = null;
    let contentSha256 = discovery.contentSha256;
    if (!noUpload) {
      blobUrl = existingUploads.get(discovery.contentSha256) || uploadedThisRun.get(discovery.contentSha256) || null;
      if (blobUrl) {
        reused += 1;
      } else {
        blobUrl = dryRun
          ? `dry-run://${blobPath(discovery.contentSha256, discovery.ext)}`
          : await uploadBlob(blobPath(discovery.contentSha256, discovery.ext), discovery.bytes, discovery.contentType);
        uploadedThisRun.set(discovery.contentSha256, blobUrl);
        uploaded += dryRun ? 0 : 1;
      }
    }

    const image = {
      imageUrl: discovery.imageUrl,
      blobUrl,
      contentSha256,
      alt: `${target.name || target.org_name || "Clinic"} photo`,
      sourcePageUrl: discovery.sourcePageUrl,
    };
    siteCache.set(reuseKey, image);
    if (!dryRun) {
      writeCacheRow(cache, target, image, "site-discovery");
    }
    written += dryRun ? 0 : 1;

    if (delayMs > 0) {
      await sleep(delayMs);
    }
    logProgress();
  }
} finally {
  canonical.close();
  if (cache) {
    cache.close();
  }
}

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : noUpload ? "discover-no-upload" : "upload",
      db: dbPath,
      cache_db: dryRun ? null : cachePath,
      country,
      target_mode: mode,
      selected_locations: targets.length,
      discovered,
      uploaded,
      reused,
      cache_rows_written: written,
      skipped,
      errors: errors.slice(0, 25),
    },
    null,
    2,
  ),
);

async function discoverImageForWebsite(website, target) {
  const page = await fetchText(website);
  const imageCandidates = extractImageCandidates(page.html, page.url);
  for (const candidate of imageCandidates) {
    try {
      const image = await fetchImage(candidate.url);
      return {
        ...image,
        imageUrl: candidate.url,
        sourcePageUrl: page.url,
      };
    } catch {
      // Try the next candidate image.
    }
  }
  throw new Error(`no_usable_image ${domainFor(website)}`);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`page_http_${response.status} ${domainFor(url)}`);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`page_non_html ${contentType}`);
  }
  return { url: response.url, html: await response.text() };
}

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
    throw new Error(`image_http_${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
  if (!IMAGE_TYPES[contentType]) {
    throw new Error(`image_bad_type_${contentType || "unknown"}`);
  }
  const length = Number.parseInt(response.headers.get("content-length") || "0", 10);
  if (length > maxBytes) {
    throw new Error(`image_too_large_${length}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new Error(`image_too_large_${bytes.length}`);
  }
  if (bytes.length < minBytes) {
    throw new Error(`image_too_small_${bytes.length}`);
  }
  return {
    bytes,
    contentType,
    ext: IMAGE_TYPES[contentType],
    contentSha256: sha256(bytes),
  };
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

function extractImageCandidates(html, pageUrl) {
  const candidates = [];
  const seen = new Set();
  for (const match of html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*>/gi)) {
    const content = attr(match[0], "content");
    addCandidate(candidates, seen, content, pageUrl, 100);
  }
  for (const match of html.matchAll(/<link\b[^>]*rel=["'][^"']*(?:image_src|preload)[^"']*["'][^>]*>/gi)) {
    const href = attr(match[0], "href");
    const as = attr(match[0], "as");
    addCandidate(candidates, seen, href, pageUrl, as === "image" ? 90 : 65);
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const url of jsonLdImageUrls(match[1])) {
      addCandidate(candidates, seen, url, pageUrl, 85);
    }
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
    const src = bestSrcsetUrl(srcset) || attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-lazy-src");
    const alt = attr(tag, "alt") || "";
    const className = attr(tag, "class") || "";
    const score = imageScore(`${src || ""} ${alt} ${className}`);
    addCandidate(candidates, seen, src, pageUrl, score);
  }
  return candidates
    .filter((candidate) => !weakImageUrl(candidate.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function jsonLdImageUrls(text) {
  const urls = [];
  const trimmed = decodeHtml(text).trim();
  if (!trimmed) {
    return urls;
  }
  try {
    const value = JSON.parse(trimmed);
    collectJsonImages(value, urls);
  } catch {
    for (const match of trimmed.matchAll(/"image"\s*:\s*"([^"]+)"/gi)) {
      urls.push(match[1]);
    }
  }
  return urls;
}

function collectJsonImages(value, urls) {
  if (!value) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonImages(item, urls);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  for (const key of ["image", "photo"]) {
    const image = value[key];
    if (typeof image === "string") {
      urls.push(image);
    } else if (Array.isArray(image)) {
      for (const item of image) {
        if (typeof item === "string") {
          urls.push(item);
        } else if (item && typeof item === "object" && typeof item.url === "string") {
          urls.push(item.url);
        }
      }
    } else if (image && typeof image === "object" && typeof image.url === "string") {
      urls.push(image.url);
    }
  }
  if (value["@graph"]) {
    collectJsonImages(value["@graph"], urls);
  }
}

function addCandidate(candidates, seen, rawUrl, pageUrl, score) {
  const url = absoluteImageUrl(rawUrl, pageUrl);
  if (!url || seen.has(url)) {
    return;
  }
  seen.add(url);
  candidates.push({ url, score });
}

function imageScore(text) {
  const lower = String(text || "").toLowerCase();
  if (WEAK_IMAGE_WORDS.some((word) => lower.includes(word))) {
    return 5;
  }
  let score = 35;
  for (const word of STRONG_IMAGE_WORDS) {
    if (lower.includes(word)) {
      score += 10;
    }
  }
  if (/\.(jpe?g|png|webp|avif)(?:[?#]|$)/i.test(lower)) {
    score += 8;
  }
  return score;
}

function absoluteImageUrl(rawUrl, pageUrl) {
  const value = decodeHtml(String(rawUrl || "").trim());
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) {
    return null;
  }
  try {
    const url = new URL(value, pageUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function weakImageUrl(url) {
  const lower = url.toLowerCase();
  return WEAK_IMAGE_WORDS.some((word) => lower.includes(word)) || lower.endsWith(".svg") || lower.endsWith(".ico");
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match =
    tag.match(new RegExp(`${escaped}\\s*=\\s*"([^"]*)"`, "i")) ||
    tag.match(new RegExp(`${escaped}\\s*=\\s*'([^']*)'`, "i")) ||
    tag.match(new RegExp(`${escaped}\\s*=\\s*([^\\s>]+)`, "i"));
  return match ? decodeHtml(match[1]) : null;
}

function bestSrcsetUrl(srcset) {
  if (!srcset) {
    return null;
  }
  const entries = String(srcset)
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
  return entries.at(-1) || null;
}

function candidateWebsites(target) {
  const values = [
    target.website,
    canUseOrgDomain(target) && target.website_domain ? `https://${target.website_domain}` : null,
    ...String(target.source_urls || "")
      .split(/[,\n]/)
      .filter(Boolean),
  ];
  const seen = new Set();
  const urls = [];
  for (const value of values) {
    const normalized = normalizeWebsite(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    urls.push(normalized);
  }
  return urls.slice(0, 3);
}

function canUseOrgDomain(target) {
  const slugs = String(target.source_slugs || "").split(",").filter(Boolean);
  if (slugs.some((slug) => slug.startsWith("chain_") || slug.startsWith("service_discovery_"))) {
    return true;
  }
  const locationName = normalizedName(target.name);
  const orgName = normalizedName(target.org_name);
  if (!locationName || !orgName) {
    return false;
  }
  return locationName === orgName || locationName.includes(orgName) || orgName.includes(locationName);
}

function normalizeWebsite(value) {
  const text = String(value || "").trim();
  if (!text || text.includes("://maps.google.") || text.startsWith("chain://") || text.startsWith("service-discovery://")) {
    return null;
  }
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    const host = normalizedHost(url.hostname);
    if (!host || BLOCKED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
      return null;
    }
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function reusableImageKey(target, website) {
  const slugs = String(target.source_slugs || "").split(",").filter(Boolean);
  const chainSlug = slugs.find((slug) => slug.startsWith("chain_"));
  if (chainSlug) {
    return chainSlug;
  }
  return domainFor(website) || `location:${target.id}`;
}

function domainFor(value) {
  try {
    return normalizedHost(new URL(value.startsWith("http") ? value : `https://${value}`).hostname);
  } catch {
    return null;
  }
}

function normalizedHost(hostname) {
  return String(hostname || "").toLowerCase().replace(/^www\./, "");
}

function normalizedName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function selectTargets(database) {
  const where = ["l.country_code = ?"];
  const params = [country];
  if (mode === "missing-any") {
    where.push(
      `NOT EXISTS (
        SELECT 1 FROM images existing
        WHERE existing.entity_type = 'location'
          AND existing.entity_id = l.id
          AND COALESCE(existing.blob_url, existing.local_path, existing.image_url, '') <> ''
      )`,
    );
  } else if (mode === "missing-blob") {
    where.push(
      `NOT EXISTS (
        SELECT 1 FROM images existing
        WHERE existing.entity_type = 'location'
          AND existing.entity_id = l.id
          AND COALESCE(existing.blob_url, '') <> ''
      )`,
    );
  } else {
    throw new Error(`Unsupported --mode ${mode}`);
  }
  if (options.source) {
    where.push("EXISTS (SELECT 1 FROM source_records sr_filter JOIN sources s_filter ON s_filter.id = sr_filter.source_id WHERE sr_filter.entity_type = 'location' AND sr_filter.entity_id = l.id AND s_filter.slug = ?)");
    params.push(options.source);
  }
  params.push(limit);
  return database
    .prepare(
      `
      SELECT
        l.id,
        l.name,
        l.address,
        l.locality,
        l.region,
        l.postal_code,
        l.country_code,
        l.website,
        o.canonical_name AS org_name,
        o.website_domain,
        MIN(sr.source_id) AS source_id,
        GROUP_CONCAT(DISTINCT s.slug) AS source_slugs,
        GROUP_CONCAT(DISTINCT sr.source_url) AS source_urls
      FROM locations l
      LEFT JOIN organizations o ON o.id = l.org_id
      LEFT JOIN source_records sr ON sr.entity_type = 'location' AND sr.entity_id = l.id
      LEFT JOIN sources s ON s.id = sr.source_id
      WHERE ${where.join(" AND ")}
      GROUP BY l.id
      ORDER BY
        CASE
          WHEN GROUP_CONCAT(DISTINCT s.slug) LIKE '%chain_%' THEN 0
          WHEN GROUP_CONCAT(DISTINCT s.slug) LIKE '%service_discovery_%' THEN 1
          WHEN GROUP_CONCAT(DISTINCT s.slug) LIKE '%menu_enrichment%' THEN 2
          ELSE 3
        END,
        l.id
      LIMIT ?
      `,
    )
    .all(...params);
}

function ensureCacheSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS location_image_backfill (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      location_name TEXT,
      address TEXT,
      locality TEXT,
      region TEXT,
      postal_code TEXT,
      country_code TEXT,
      website TEXT,
      website_domain TEXT,
      source_id INTEGER,
      image_url TEXT NOT NULL,
      blob_url TEXT,
      content_sha256 TEXT,
      alt TEXT,
      source_page_url TEXT,
      discovery_method TEXT,
      fetched_at TEXT NOT NULL,
      UNIQUE(location_id, image_url)
    );
    CREATE INDEX IF NOT EXISTS idx_location_image_backfill_location ON location_image_backfill(location_id);
    CREATE INDEX IF NOT EXISTS idx_location_image_backfill_hash ON location_image_backfill(content_sha256);
  `);
}

function writeCacheRow(database, target, image, method) {
  database
    .prepare(
      `
      INSERT INTO location_image_backfill (
        location_id, location_name, address, locality, region, postal_code, country_code,
        website, website_domain, source_id, image_url, blob_url, content_sha256, alt,
        source_page_url, discovery_method, fetched_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(location_id, image_url) DO UPDATE SET
        blob_url = COALESCE(excluded.blob_url, location_image_backfill.blob_url),
        content_sha256 = COALESCE(excluded.content_sha256, location_image_backfill.content_sha256),
        alt = COALESCE(excluded.alt, location_image_backfill.alt),
        source_page_url = COALESCE(excluded.source_page_url, location_image_backfill.source_page_url),
        discovery_method = excluded.discovery_method,
        fetched_at = excluded.fetched_at
      `,
    )
    .run(
      target.id,
      target.name,
      target.address,
      target.locality,
      target.region,
      target.postal_code,
      target.country_code,
      target.website,
      target.website_domain,
      target.source_id,
      image.imageUrl,
      image.blobUrl,
      image.contentSha256,
      image.alt,
      image.sourcePageUrl,
      method,
      new Date().toISOString(),
    );
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

function blobPath(hash, ext) {
  return `${prefix}/${hash.slice(0, 2)}/${hash}${ext}`;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorRow(target, reason) {
  return {
    id: target.id,
    name: target.name,
    locality: target.locality,
    region: target.region,
    reason,
  };
}

function logProgress() {
  const processed = discovered + skipped + reused;
  if (progressEvery > 0 && processed > 0 && processed % progressEvery === 0) {
    console.error(
      `progress processed=${processed}/${targets.length} discovered=${discovered} uploaded=${uploaded} reused=${reused} skipped=${skipped}`,
    );
  }
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

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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
  const parsed = { dryRun: false, noUpload: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--no-upload") {
      parsed.noUpload = true;
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
