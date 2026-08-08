import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { del, put } from "@vercel/blob";
import sharp from "sharp";

import { query as defaultQuery, setMutationActor } from "../lib/db.mjs";
import { recordWrite as defaultRecordWrite } from "../lib/ledger.mjs";
import { createWebClient } from "../lib/web.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOWNLOADS_IN_FLIGHT = new Map();

export const IMAGE_HARVEST_SCHEMA_VERSION = 1;
export const IMAGE_HARVEST_ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607120011";
export const IMAGE_HARVEST_MAX_CANDIDATES = 8;
export const DEFAULT_IMAGE_CACHE_DIR = path.join(REPO_ROOT, ".cache", "pipeline", "images");
export const DEFAULT_IMAGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const DEFAULT_IMAGE_TIMEOUT_MS = 15_000;
export const DEFAULT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

const MIN_IMAGE_BYTES = 15 * 1024;
const MIN_LONGEST_EDGE = 500;
const MIN_LOGO_BYTES = 512;
const MIN_LOGO_LONGEST_EDGE = 128;
const MIN_LOGO_SHORTEST_EDGE = 32;
const MAX_PROCESSED_EDGE = 1_600;
const MAX_HORIZONTAL_RATIO = 4;
const MAX_VERTICAL_RATIO = 2.5;
const MAX_LOGO_HORIZONTAL_RATIO = 16;
const MAX_LOGO_VERTICAL_RATIO = 6;
const JUNK_URL_PATTERN = /(?:^data:|\.(?:ico|gif)(?:$|[?#])|favicon|sprite|tracking|pixel|placeholder|blank|transparent|loader|spinner|icon|badge|googleadservices|doubleclick|pagead|analytics|\/maps\/|maps\.gstatic|maps\.google|googleapis\.com\/maps|khms|\/vt\/lyrs=)/iu;
const JUNK_ALT_PATTERN = /\b(?:icon|favicon|placeholder|sprite|tracking pixel)\b/iu;
const LOGO_SIGNAL_PATTERN = /(?:^|[^a-z0-9])(?:logo|brandmark|wordmark)(?:[^a-z0-9]|$)/iu;

export const IMAGE_HARVEST_LOAD_SQL = `
  SELECT
    location.id,
    location.name,
    location.website,
    location.status,
    location.deleted_at,
    COALESCE(location.is_virtual, false) AS is_virtual,
    COALESCE(image_data.active_image_count, 0)::integer AS active_image_count,
    COALESCE(rejected_data.image_urls, ARRAY[]::text[]) AS human_rejected_image_urls,
    NOT EXISTS (
      SELECT 1
      FROM fountain.source_records source_record
      JOIN fountain.sources source ON source.id = source_record.source_id
      JOIN fountain_raw.suppressed_source_listings suppressed
        ON suppressed.source_slug = source.slug
       AND suppressed.source_listing_id = source_record.source_listing_id
      WHERE source_record.entity_type = 'location'
        AND source_record.entity_id = location.id
    ) AS non_suppressed
  FROM fountain.locations location
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS active_image_count
    FROM fountain.images image
    WHERE image.entity_type = 'location'
      AND image.entity_id = location.id
      AND image.status = 'active'
      AND image.deleted_at IS NULL
  ) image_data ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT rejected.image_url ORDER BY rejected.image_url) AS image_urls
    FROM fountain_raw.browser_swarm_image_ingest_20260708 rejected
    WHERE rejected.location_id = location.id
      AND rejected.outcome = 'human_rejected'
      AND nullif(btrim(rejected.image_url), '') IS NOT NULL
  ) rejected_data ON true
  WHERE location.id = $1
`;

const IMAGE_HARVEST_RECHECK_SQL = `
  SELECT
    location.status,
    location.deleted_at,
    COALESCE(location.is_virtual, false) AS is_virtual,
    NOT EXISTS (
      SELECT 1
      FROM fountain.source_records source_record
      JOIN fountain.sources source ON source.id = source_record.source_id
      JOIN fountain_raw.suppressed_source_listings suppressed
        ON suppressed.source_slug = source.slug
       AND suppressed.source_listing_id = source_record.source_listing_id
      WHERE source_record.entity_type = 'location'
        AND source_record.entity_id = location.id
    ) AS non_suppressed,
    NOT EXISTS (
      SELECT 1
      FROM fountain.images image
      WHERE image.entity_type = 'location'
        AND image.entity_id = location.id
        AND image.status = 'active'
        AND image.deleted_at IS NULL
    ) AS has_zero_active_images
  FROM fountain.locations location
  WHERE location.id = $1
  FOR UPDATE
`;

const IMAGE_BLOB_REFERENCE_SQL = `
  SELECT EXISTS (
    SELECT 1
    FROM fountain.images image
    WHERE image.blob_url = $1
      AND image.deleted_at IS NULL
  ) AS referenced
`;

/**
 * Queue handler for zero-image active locations. The HTML fetch is delegated
 * to the standing cached/robots-aware web client; binary downloads, Blob, and
 * database dependencies remain injectable for non-networked tests.
 */
export async function handleImageHarvest(
  { task, run },
  {
    query = defaultQuery,
    webClient = createWebClient({
      cacheDir: path.join(REPO_ROOT, ".cache", "pipeline", "web-image-harvest-v2"),
      maxBytes: 2_000_000,
    }),
    imageClient = createCachedImageClient(),
    blobClient = createBlobClient(),
    recordWrite = defaultRecordWrite,
    setActor = setMutationActor,
    readCachedFile = readFile,
    processImage = validateAndProcessImage,
    candidateLimit = IMAGE_HARVEST_MAX_CANDIDATES,
  } = {},
) {
  const taskId = positiveIntegerString(task?.id, "task.id");
  const runId = positiveIntegerString(run?.id, "run.id");
  const locationId = positiveInteger(task?.entity_id, "task.entity_id");
  if (task?.entity_type && task.entity_type !== "location") {
    throw new Error("image_harvest supports only location tasks.");
  }
  const limit = positiveInteger(candidateLimit, "candidateLimit");

  const initialResult = await executeQuery(query, IMAGE_HARVEST_LOAD_SQL, [locationId]);
  const initial = rowsFrom(initialResult)[0];
  if (!initial) return skippedResult({ taskId, runId, locationId, reason: "location_missing" });
  const initialRefusal = initialLocationRefusal(initial);
  if (initialRefusal) {
    return skippedResult({ taskId, runId, locationId, reason: initialRefusal });
  }

  const page = await safeHomepageFetch(initial.website, webClient);
  if (!page.ok) {
    return noImageResult({
      taskId,
      runId,
      locationId,
      outcome: "homepage_unavailable",
      page,
      candidates: [],
    });
  }
  const html = await cachedPageHtml(page, readCachedFile);
  const pageSummary = pageEvidence(page);
  if (!html) {
    return noImageResult({
      taskId,
      runId,
      locationId,
      outcome: "cached_html_unavailable",
      page: pageSummary,
      candidates: [],
    });
  }

  const baseUrl = page.final_url || page.requested_url || initial.website;
  const rejectedUrls = new Set((Array.isArray(initial.human_rejected_image_urls)
    ? initial.human_rejected_image_urls
    : []).map(safeNormalizedImageUrl).filter(Boolean));
  const candidates = extractImageCandidates(html, baseUrl, { limit })
    .filter((candidate) => !rejectedUrls.has(safeNormalizedImageUrl(candidate.url)));
  const attempted = [];
  let selected = null;
  for (const candidate of candidates) {
    const downloaded = await safeImageDownload(candidate.url, imageClient);
    if (!downloaded.ok) {
      attempted.push(candidateAttempt(candidate, downloaded.outcome || downloaded.reason || "download_failed"));
      continue;
    }
    const validation = await processImage(downloaded.buffer, downloaded.contentType, {
      allowLogo: candidate.image_kind === "logo",
    });
    if (!validation?.ok) {
      attempted.push(candidateAttempt(candidate, validation?.reason || "failed_validation"));
      continue;
    }
    selected = {
      candidate,
      validation,
      cachePath: downloaded.cachePath || null,
      cached: Boolean(downloaded.cached),
    };
    attempted.push(candidateAttempt(candidate, "selected", validation));
    break;
  }

  if (!selected) {
    return noImageResult({
      taskId,
      runId,
      locationId,
      outcome: candidates.length ? "no_usable_image" : "no_candidate_found",
      page: pageSummary,
      candidates: attempted,
    });
  }

  const contentSha256 = createHash("sha256").update(selected.validation.buffer).digest("hex");
  const pathname = imageBlobPath(locationId, selected.validation.extension, contentSha256);
  let blobUrl = null;
  try {
    const uploaded = await blobClient.upload(pathname, selected.validation.buffer, {
      contentType: selected.validation.contentType,
    });
    blobUrl = nonemptyText(uploaded?.url ?? uploaded, "Blob upload URL");
    const write = await guardedAttachLocationImage({
      locationId,
      taskId,
      runId,
      blobUrl,
      imageUrl: selected.candidate.url,
      contentSha256,
      alt: selected.candidate.alt || initial.name,
      source: selected.candidate.source,
      imageKind: selected.candidate.image_kind,
    }, { recordWrite, setActor });

    if (!write.written) {
      await removeUnreferencedBlob({ query, blobClient, blobUrl });
      blobUrl = null;
      return {
        ...baseResult({ taskId, runId, locationId }),
        outcome: "write_refused",
        page: pageSummary,
        candidates: attempted,
        selected: selectedEvidence(selected, contentSha256, null),
        write,
        serving_write: { attempted: true, written: false, reason: write.reason },
      };
    }

    return {
      ...baseResult({ taskId, runId, locationId }),
      outcome: "image_harvested",
      page: pageSummary,
      candidates: attempted,
      selected: selectedEvidence(selected, contentSha256, blobUrl),
      write,
      serving_write: {
        attempted: true,
        written: true,
        image_id: write.image_id,
        event_stamped: write.event_stamped,
      },
    };
  } catch (error) {
    if (!blobUrl) throw error;
    try {
      await removeUnreferencedBlob({ query, blobClient, blobUrl });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Image harvest failed and its uploaded Blob could not be removed.",
      );
    }
    throw error;
  }
}

export function extractImageCandidates(html, baseUrl, {
  limit = IMAGE_HARVEST_MAX_CANDIDATES,
} = {}) {
  const normalizedLimit = positiveInteger(limit, "limit");
  const input = String(html || "");
  const title = htmlTitle(input);
  const proposed = [];
  const meta = metaValues(input);
  for (const [index, key] of [
    "og:image:secure_url",
    "og:image",
    "twitter:image",
  ].entries()) {
    const rawUrl = meta.get(key);
    if (rawUrl) {
      const alt = meta.get("og:image:alt") || meta.get("twitter:image:alt") || title;
      const imageKind = isLogoImageCandidate(rawUrl, alt) ? "logo" : null;
      proposed.push({
        rawUrl,
        source: key.startsWith("og:") ? "og_image" : "twitter_image",
        alt,
        imageKind,
        score: imageKind === "logo" ? 400 - index : 1_000 - index,
      });
    }
  }

  for (const value of extractJsonLdImages(input)) {
    const alt = value.alt || title;
    const imageKind = value.imageKind || (isLogoImageCandidate(value.url, alt) ? "logo" : null);
    proposed.push({
      rawUrl: value.url,
      source: value.source || "jsonld_image",
      alt,
      imageKind,
      score: imageKind === "logo" ? 390 : 900,
    });
  }

  for (const tag of input.match(/<img\b[^>]*>/giu) || []) {
    const attrs = parseTagAttributes(tag);
    const rawUrl = bestImageSource(attrs);
    if (!rawUrl) continue;
    const alt = attrs.alt || title;
    const imageKind = isLogoImageCandidate(
      rawUrl,
      alt,
      attrs.class,
      attrs.id,
      attrs["data-ux"],
      attrs["data-aid"],
      attrs["data-testid"],
      attrs["aria-label"],
    ) ? "logo" : null;
    const declaredWidth = integerDimension(attrs.width) || largestSrcsetWidth(bestImageSrcset(attrs));
    if (declaredWidth > 0 && declaredWidth < 300 && imageKind !== "logo") continue;
    const hero = /\b(?:hero|masthead|banner|cover)\b/iu.test(`${attrs.class || ""} ${attrs.id || ""}`);
    proposed.push({
      rawUrl,
      source: hero ? "hero_img" : "img",
      alt,
      imageKind,
      score: imageKind === "logo"
        ? 350 + Math.min(declaredWidth, 2_000) / 20
        : (hero ? 800 : 500) + Math.min(declaredWidth, 2_000) / 10,
    });
  }

  for (const tag of input.match(/<[^>]+(?:class|id)\s*=\s*(?:"[^"]*(?:hero|masthead|banner|cover)[^"]*"|'[^']*(?:hero|masthead|banner|cover)[^']*')[^>]*>/giu) || []) {
    const attrs = parseTagAttributes(tag);
    const rawUrl = cssBackgroundUrl(attrs.style);
    if (rawUrl) proposed.push({ rawUrl, source: "hero_background", alt: title, score: 750 });
  }

  const byUrl = new Map();
  for (const candidate of proposed) {
    const url = resolveCandidateUrl(candidate.rawUrl, baseUrl);
    const alt = cleanText(candidate.alt, 300);
    if (!url || isJunkImageCandidate(url, alt)) continue;
    const imageKind = candidate.imageKind || (isLogoImageCandidate(url, alt) ? "logo" : null);
    if (/\.svg(?:$|[?#])/iu.test(url) && imageKind !== "logo") continue;
    const normalized = {
      url,
      source: candidate.source,
      alt: alt || null,
      score: candidate.score,
      imageKind,
    };
    const current = byUrl.get(url);
    if (!current) {
      byUrl.set(url, normalized);
      continue;
    }
    const preserveLogo = current.imageKind === "logo" || normalized.imageKind === "logo";
    const preferred = current.score >= normalized.score ? current : normalized;
    byUrl.set(url, {
      ...preferred,
      imageKind: preserveLogo ? "logo" : preferred.imageKind,
      score: preserveLogo ? Math.min(preferred.score, 400) : preferred.score,
    });
  }
  const sorted = [...byUrl.values()]
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
  const ordinary = sorted.filter((candidate) => candidate.imageKind !== "logo");
  const logos = sorted.filter((candidate) => candidate.imageKind === "logo");
  const selected = logos.length && normalizedLimit > 1
    ? [...ordinary.slice(0, normalizedLimit - 1), logos[0]]
    : (ordinary.length ? ordinary : logos).slice(0, normalizedLimit);
  return selected
    .map((candidate) => ({
      url: candidate.url,
      source: candidate.source,
      alt: candidate.alt,
      ...(candidate.imageKind ? { image_kind: candidate.imageKind } : {}),
    }));
}

export function isJunkImageCandidate(url, alt = "") {
  return JUNK_URL_PATTERN.test(String(url || "")) || JUNK_ALT_PATTERN.test(String(alt || ""));
}

export function isLogoImageCandidate(...values) {
  return LOGO_SIGNAL_PATTERN.test(values.filter(Boolean).join(" "));
}

export async function validateAndProcessImage(buffer, contentType = "", {
  minBytes = MIN_IMAGE_BYTES,
  maxBytes = DEFAULT_IMAGE_MAX_BYTES,
  minLongestEdge = MIN_LONGEST_EDGE,
  maxProcessedEdge = MAX_PROCESSED_EDGE,
  allowLogo = false,
} = {}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError("Image body must be a Buffer.");
  const effectiveMinBytes = allowLogo ? Math.min(minBytes, MIN_LOGO_BYTES) : minBytes;
  const effectiveMinLongestEdge = allowLogo
    ? Math.min(minLongestEdge, MIN_LOGO_LONGEST_EDGE)
    : minLongestEdge;
  if (buffer.length < effectiveMinBytes) return { ok: false, reason: "too_small_bytes" };
  if (buffer.length > maxBytes) return { ok: false, reason: "too_large_bytes" };
  const detected = detectImageType(buffer, contentType);
  if (!detected || ["ico", "gif"].includes(detected.extension) || (detected.extension === "svg" && !allowLogo)) {
    return { ok: false, reason: "unsupported_content_type" };
  }

  let image = sharp(buffer, {
    failOn: "none",
    animated: false,
    density: detected.extension === "svg" ? 144 : undefined,
  });
  let metadata;
  try {
    metadata = await image.metadata();
  } catch {
    return { ok: false, reason: "invalid_image" };
  }
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) return { ok: false, reason: "invalid_dimensions" };
  if (Math.max(width, height) < effectiveMinLongestEdge) {
    return { ok: false, reason: "too_small_dimensions" };
  }
  if (allowLogo && Math.min(width, height) < MIN_LOGO_SHORTEST_EDGE) {
    return { ok: false, reason: "too_small_dimensions" };
  }
  const maxHorizontalRatio = allowLogo ? MAX_LOGO_HORIZONTAL_RATIO : MAX_HORIZONTAL_RATIO;
  const maxVerticalRatio = allowLogo ? MAX_LOGO_VERTICAL_RATIO : MAX_VERTICAL_RATIO;
  if (width / height > maxHorizontalRatio || height / width > maxVerticalRatio) {
    return { ok: false, reason: "logo_like_aspect_ratio" };
  }

  image = image.rotate();
  if (Math.max(width, height) > maxProcessedEdge) {
    image = image.resize({
      width: maxProcessedEdge,
      height: maxProcessedEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  let outputExtension = detected.extension;
  let outputContentType = detected.contentType;
  if (detected.extension === "svg") {
    image = image.webp({ quality: 90 });
    outputExtension = "webp";
    outputContentType = "image/webp";
  } else if (detected.extension === "jpg") image = image.jpeg({ quality: 84, mozjpeg: true });
  else if (detected.extension === "png") image = image.png({ compressionLevel: 9 });
  else if (detected.extension === "webp") image = image.webp({ quality: 84 });
  else if (detected.extension === "avif") image = image.avif({ quality: 60 });

  const processed = await image.toBuffer();
  const processedMetadata = await sharp(processed).metadata();
  return {
    ok: true,
    buffer: processed,
    width: Number(processedMetadata.width || width),
    height: Number(processedMetadata.height || height),
    extension: outputExtension,
    contentType: outputContentType,
    bytes: processed.length,
  };
}

export function createBlobClient({
  putImpl = put,
  delImpl = del,
  token = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN,
} = {}) {
  if (typeof putImpl !== "function" || typeof delImpl !== "function") {
    throw new TypeError("Blob put and delete implementations must be functions.");
  }
  const credentials = token ? { token } : {};
  return {
    upload(pathname, buffer, { contentType }) {
      return putImpl(pathname, buffer, {
        access: "public",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        ...credentials,
      });
    },
    remove(url) {
      return delImpl(url, credentials);
    },
  };
}

export function createCachedImageClient({
  cacheDir = DEFAULT_IMAGE_CACHE_DIR,
  ttlMs = DEFAULT_IMAGE_CACHE_TTL_MS,
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
  maxBytes = DEFAULT_IMAGE_MAX_BYTES,
  maxRedirects = 5,
  fetchImpl = globalThis.fetch,
  resolveHost = defaultResolveHost,
  now = Date.now,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Image fetch implementation must be a function.");
  if (typeof resolveHost !== "function") throw new TypeError("Image hostname resolver must be a function.");
  const directory = path.resolve(cacheDir);

  async function download(input) {
    let url;
    try {
      url = normalizeImageUrl(input);
      await assertSafeImageUrl(url, resolveHost);
    } catch (error) {
      return { ok: false, outcome: "unsafe_url", reason: errorMessage(error) };
    }
    const key = createHash("sha256").update(url).digest("hex");
    const bodyPath = path.join(directory, `${key}.bin`);
    const metaPath = path.join(directory, `${key}.json`);
    const fresh = await readFreshImageCache({ bodyPath, metaPath, url, ttlMs, now });
    if (fresh) return { ...fresh, cached: true };

    const inFlightKey = `${bodyPath}\0${url}`;
    if (DOWNLOADS_IN_FLIGHT.has(inFlightKey)) {
      const result = await DOWNLOADS_IN_FLIGHT.get(inFlightKey);
      return { ...result, cached: Boolean(result.ok), deduplicated: true };
    }
    const operation = fetchAndCacheImage({
      url,
      bodyPath,
      metaPath,
      directory,
      timeoutMs,
      maxBytes,
      maxRedirects,
      fetchImpl,
      resolveHost,
      now,
    });
    DOWNLOADS_IN_FLIGHT.set(inFlightKey, operation);
    try {
      return await operation;
    } finally {
      DOWNLOADS_IN_FLIGHT.delete(inFlightKey);
    }
  }

  return { download };
}

export async function guardedAttachLocationImage(
  {
    locationId,
    taskId,
    runId,
    blobUrl,
    imageUrl,
    contentSha256,
    alt,
    source,
    imageKind,
  },
  {
    recordWrite = defaultRecordWrite,
    setActor = setMutationActor,
  } = {},
) {
  const normalizedLocationId = positiveInteger(locationId, "locationId");
  const normalizedTaskId = positiveIntegerString(taskId, "taskId");
  const normalizedRunId = positiveIntegerString(runId, "runId");
  const normalizedBlobUrl = nonemptyText(blobUrl, "blobUrl");
  const normalizedImageUrl = nonemptyText(imageUrl, "imageUrl");
  const normalizedSha = sha256Text(contentSha256);
  const normalizedSource = nonemptyText(source, "source");
  const normalizedAlt = cleanText(alt, 300) || null;
  const normalizedImageKind = imageKind === "logo" ? "logo" : null;
  const actorLabel = `image_harvest_run_${normalizedRunId}`;

  try {
    const result = await recordWrite({
      entity: { entity_type: "location", entity_id: normalizedLocationId },
      field: "images",
      verification: "agent_verified",
      actor: actorLabel,
      mutate: async (tx) => {
        const stateResult = await tx.query(IMAGE_HARVEST_RECHECK_SQL, [normalizedLocationId]);
        const state = rowsFrom(stateResult)[0];
        const refusal = recheckedLocationRefusal(state);
        if (refusal) throw new ImageHarvestWriteRefusal(refusal);

        await setActor(tx, { actorId: IMAGE_HARVEST_ACTOR_ID, actorLabel });
        const timestampResult = await tx.query("SELECT transaction_timestamp() AS write_started_at");
        const writeStartedAt = rowsFrom(timestampResult)[0]?.write_started_at;
        if (!writeStartedAt) throw new Error("Image harvest write timestamp is unavailable.");
        const inserted = await tx.query(`
          INSERT INTO fountain.images (
            id,
            entity_type,
            entity_id,
            image_url,
            blob_url,
            content_sha256,
            alt,
            source_id,
            status,
            data_origin,
            verification_status,
            image_kind
          )
          VALUES (
            nextval(pg_get_serial_sequence('fountain.images', 'id'))::integer,
            'location', $1, $2, $3, $4, $5, NULL, 'active', 'scraped', 'unverified', $6
          )
          RETURNING id
        `, [
          normalizedLocationId,
          normalizedImageUrl,
          normalizedBlobUrl,
          normalizedSha,
          normalizedAlt,
          normalizedImageKind,
        ]);
        assertCount("image insert", inserted, 1);
        const imageId = positiveInteger(rowsFrom(inserted)[0]?.id, "inserted image id");
        const stamped = await tx.query(`
          UPDATE fountain.entity_change_events event
          SET reason = 'image_harvest',
              metadata = COALESCE(event.metadata, '{}'::jsonb) || jsonb_build_object(
                'run_id', $1::bigint,
                'task_id', $2::bigint,
                'campaign', 'image_harvest',
                'source', $3::text,
                'source_image_url', $4::text,
                'content_sha256', $5::text,
                'image_kind', $6::text,
                'verification', 'agent_verified'
              )
          WHERE event.entity_type = 'images'
            AND event.entity_id = $7::integer
            AND event.action = 'insert'
            AND event.actor_id = $8::uuid
            AND event.created_at >= $9::timestamptz
            AND NOT (COALESCE(event.metadata, '{}'::jsonb) ? 'run_id')
        `, [
          normalizedRunId,
          normalizedTaskId,
          normalizedSource,
          normalizedImageUrl,
          normalizedSha,
          normalizedImageKind,
          imageId,
          IMAGE_HARVEST_ACTOR_ID,
          writeStartedAt,
        ]);
        assertCount("image provenance event", stamped, 1);
        return { imageId, eventStamped: true, writeStartedAt };
      },
    });
    if (!result?.written) {
      return { attempted: true, written: false, reason: result?.reason || "field_ledger_refused" };
    }
    return {
      attempted: true,
      written: true,
      reason: null,
      image_id: result.result.imageId,
      event_stamped: Boolean(result.result.eventStamped),
      written_at: toIso(result.result.writeStartedAt),
    };
  } catch (error) {
    if (error instanceof ImageHarvestWriteRefusal) {
      return { attempted: true, written: false, reason: error.reason };
    }
    throw error;
  }
}

class ImageHarvestWriteRefusal extends Error {
  constructor(reason) {
    super(`Image harvest write refused: ${reason}`);
    this.name = "ImageHarvestWriteRefusal";
    this.reason = reason;
  }
}

async function safeHomepageFetch(website, webClient) {
  try {
    const page = await webClient.fetchHomepage(website);
    return {
      ...page,
      requested_url: page.requestedUrl || String(website),
      final_url: page.finalUrl || null,
      cache_path: page.cachePath || null,
      cached: Boolean(page.cached),
      deduplicated: Boolean(page.deduplicated),
      error: page.error || null,
    };
  } catch (error) {
    return {
      ok: false,
      outcome: "network_error",
      requested_url: String(website),
      final_url: null,
      cache_path: null,
      cached: false,
      deduplicated: false,
      error: errorMessage(error),
    };
  }
}

async function cachedPageHtml(page, readCachedFile) {
  if (typeof page.html === "string") return page.html;
  if (typeof page.body === "string") return page.body;
  const cachePath = page.cachePath || page.cache_path;
  if (!cachePath) return null;
  try {
    const cached = JSON.parse(await readCachedFile(cachePath, "utf8"));
    return cached?.ok && typeof cached.body === "string" ? cached.body : null;
  } catch {
    return null;
  }
}

function pageEvidence(page) {
  return {
    ok: Boolean(page.ok),
    outcome: page.outcome || (page.ok ? "ok" : "fetch_failed"),
    requested_url: page.requested_url || page.requestedUrl || null,
    final_url: page.final_url || page.finalUrl || null,
    status: page.status ?? null,
    content_type: page.contentType || null,
    cache_path: page.cache_path || page.cachePath || null,
    cached: Boolean(page.cached),
    deduplicated: Boolean(page.deduplicated),
    error: page.error || null,
  };
}

async function safeImageDownload(url, imageClient) {
  try {
    const result = await imageClient.download(url);
    return result?.ok ? result : { ok: false, ...(result || {}), outcome: result?.outcome || "download_failed" };
  } catch (error) {
    return { ok: false, outcome: "download_error", reason: errorMessage(error) };
  }
}

async function removeUnreferencedBlob({ query, blobClient, blobUrl }) {
  const referenceResult = await executeQuery(query, IMAGE_BLOB_REFERENCE_SQL, [blobUrl]);
  if (rowsFrom(referenceResult)[0]?.referenced === true) return false;
  await blobClient.remove(blobUrl);
  return true;
}

function initialLocationRefusal(row) {
  if (row.status !== "active" || row.deleted_at) return "location_not_active";
  if (row.non_suppressed !== true) return "location_suppressed";
  if (row.is_virtual === true) return "virtual_location";
  if (!cleanText(row.website, 2_000)) return "website_missing";
  if (Number(row.active_image_count || 0) > 0) return "active_image_already_present";
  return null;
}

function recheckedLocationRefusal(row) {
  if (!row) return "location_missing";
  if (row.status !== "active" || row.deleted_at) return "location_not_active";
  if (row.non_suppressed !== true) return "location_suppressed";
  if (row.is_virtual === true) return "virtual_location";
  if (row.has_zero_active_images !== true) return "active_image_already_present";
  return null;
}

function baseResult({ taskId, runId, locationId }) {
  return {
    schema_version: IMAGE_HARVEST_SCHEMA_VERSION,
    task_id: taskId,
    run_id: runId,
    location_id: locationId,
  };
}

function skippedResult({ taskId, runId, locationId, reason }) {
  return {
    ...baseResult({ taskId, runId, locationId }),
    outcome: "skipped",
    reason,
    page: null,
    candidates: [],
    selected: null,
    write: { attempted: false, written: false, reason },
    serving_write: { attempted: false, written: false, reason },
  };
}

function noImageResult({ taskId, runId, locationId, outcome, page, candidates }) {
  return {
    ...baseResult({ taskId, runId, locationId }),
    outcome,
    page,
    candidates,
    selected: null,
    write: { attempted: false, written: false, reason: outcome },
    serving_write: { attempted: false, written: false, reason: outcome },
  };
}

function candidateAttempt(candidate, outcome, validation = {}) {
  return {
    url: candidate.url,
    source: candidate.source,
    outcome,
    image_kind: candidate.image_kind || null,
    width: validation.width || null,
    height: validation.height || null,
    bytes: validation.bytes || null,
  };
}

function selectedEvidence(selected, contentSha256, blobUrl) {
  return {
    url: selected.candidate.url,
    source: selected.candidate.source,
    alt: selected.candidate.alt,
    image_kind: selected.candidate.image_kind || null,
    content_sha256: contentSha256,
    blob_url: blobUrl,
    width: selected.validation.width,
    height: selected.validation.height,
    bytes: selected.validation.bytes,
    content_type: selected.validation.contentType,
    cache_path: selected.cachePath,
    cached_download: selected.cached,
  };
}

function imageBlobPath(locationId, extension, sha256) {
  return `listing-images/website-harvest/location/${locationId}/${sha256.slice(0, 20)}.${extension}`;
}

function htmlTitle(html) {
  const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu);
  return cleanText(decodeHtml(match?.[1] || ""), 300);
}

function metaValues(html) {
  const values = new Map();
  for (const tag of String(html || "").match(/<meta\b[^>]*>/giu) || []) {
    const attrs = parseTagAttributes(tag);
    const key = cleanText(attrs.property || attrs.name, 100).toLowerCase();
    const content = decodeHtml(attrs.content || "").trim();
    if (key && content && !values.has(key)) values.set(key, content);
  }
  return values;
}

function extractJsonLdImages(html) {
  const images = [];
  for (const match of String(html || "").matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      for (const node of flattenJsonLd(JSON.parse(decodeHtml(match[1]).trim()))) {
        const type = Array.isArray(node?.["@type"]) ? node["@type"].join(" ") : String(node?.["@type"] || "");
        if (!/(?:organization|localbusiness|medicalclinic|medicalbusiness|healthandbeautybusiness)/iu.test(type)) continue;
        const alt = cleanText(node.name, 300);
        const imageUrl = firstImageValue(node.image);
        const logoUrl = firstImageValue(node.logo);
        if (imageUrl) images.push({ url: imageUrl, alt, source: "jsonld_image", imageKind: null });
        if (logoUrl && logoUrl !== imageUrl) {
          images.push({ url: logoUrl, alt, source: "jsonld_logo", imageKind: "logo" });
        }
      }
    } catch {
      // Invalid embedded JSON-LD is common and is not a task failure.
    }
  }
  return images;
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  return [value, ...flattenJsonLd(value["@graph"] || [])];
}

function firstImageValue(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(firstImageValue).find(Boolean) || null;
  if (value && typeof value === "object") return value.url || value.contentUrl || null;
  return null;
}

function parseTagAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu;
  for (const match of String(tag || "").matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function bestImageSource(attrs) {
  const srcset = parseSrcset(bestImageSrcset(attrs));
  return srcset.sort((left, right) => right.width - left.width)[0]?.url
    || attrs["data-lazy-src"]
    || attrs["bv-data-src"]
    || attrs["data-src"]
    || attrs.src
    || null;
}

function bestImageSrcset(attrs) {
  return attrs["data-lazy-srcset"]
    || attrs["bv-data-srcset"]
    || attrs["data-srcset"]
    || attrs.srcset
    || "";
}

function parseSrcset(value) {
  return String(value || "").split(",").map((part) => {
    const [url, descriptor = ""] = part.trim().split(/\s+/u);
    const width = descriptor.endsWith("w") ? Number.parseInt(descriptor, 10) : 0;
    return { url, width: Number.isInteger(width) ? width : 0 };
  }).filter((entry) => entry.url && !/^data:/iu.test(entry.url));
}

function largestSrcsetWidth(value) {
  return Math.max(0, ...parseSrcset(value).map((entry) => entry.width));
}

function integerDimension(value) {
  const number = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function cssBackgroundUrl(style) {
  const match = String(style || "").match(/background(?:-image)?\s*:[^;]*url\(\s*["']?([^)'"\s]+)["']?\s*\)/iu);
  return match?.[1] || null;
}

function resolveCandidateUrl(value, baseUrl) {
  try {
    const url = new URL(decodeHtml(String(value || "").trim()), baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function decodeHtml(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  return String(value || "").replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/giu, (_match, token) => {
    const lower = token.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return named[lower] || _match;
  });
}

function detectImageType(buffer, contentType) {
  const declared = String(contentType || "").split(";")[0].trim().toLowerCase();
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
  if (buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00]))) {
    return { extension: "ico", contentType: "image/x-icon" };
  }
  const prefix = buffer.subarray(0, Math.min(buffer.length, 512)).toString("utf8").trimStart();
  if (declared === "image/svg+xml" || /^<svg\b/iu.test(prefix) || /^<\?xml[\s\S]*?<svg\b/iu.test(prefix)) {
    return { extension: "svg", contentType: "image/svg+xml" };
  }
  return null;
}

async function readFreshImageCache({ bodyPath, metaPath, url, ttlMs, now }) {
  try {
    const [buffer, metaText] = await Promise.all([readFile(bodyPath), readFile(metaPath, "utf8")]);
    const metadata = JSON.parse(metaText);
    const fetchedAt = Date.parse(metadata.fetchedAt);
    const age = now() - fetchedAt;
    if (metadata.version !== 1 || metadata.url !== url || !Number.isFinite(fetchedAt) || age < 0 || age >= ttlMs) {
      return null;
    }
    return {
      ok: true,
      outcome: "ok",
      buffer,
      contentType: metadata.contentType || "",
      cachePath: bodyPath,
      fetchedAt: metadata.fetchedAt,
    };
  } catch {
    return null;
  }
}

async function fetchAndCacheImage({
  url,
  bodyPath,
  metaPath,
  directory,
  timeoutMs,
  maxBytes,
  maxRedirects,
  fetchImpl,
  resolveHost,
  now,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Image download timed out.")), timeoutMs);
  let currentUrl = url;
  try {
    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      await assertSafeImageUrl(currentUrl, resolveHost);
      const response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "FountainPipeline/1.0 (+https://fountain.clinic)",
          "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1",
        },
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) return { ok: false, outcome: "redirect_missing_location" };
        if (redirects === maxRedirects) return { ok: false, outcome: "too_many_redirects" };
        currentUrl = normalizeImageUrl(new URL(location, currentUrl).href);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        return { ok: false, outcome: "http_error", status: response.status };
      }
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body?.cancel();
        return { ok: false, outcome: "too_large_bytes" };
      }
      const body = await readBoundedResponse(response, maxBytes);
      if (!body.ok) return { ok: false, outcome: "too_large_bytes" };
      const contentType = response.headers.get("content-type") || "";
      const fetchedAt = new Date(now()).toISOString();
      await writeImageCache({
        directory,
        bodyPath,
        metaPath,
        buffer: body.buffer,
        metadata: { version: 1, url, finalUrl: currentUrl, contentType, fetchedAt },
        now,
      });
      return {
        ok: true,
        outcome: "ok",
        buffer: body.buffer,
        contentType,
        cachePath: bodyPath,
        fetchedAt,
        cached: false,
      };
    }
    return { ok: false, outcome: "too_many_redirects" };
  } catch (error) {
    return {
      ok: false,
      outcome: controller.signal.aborted ? "timeout" : "network_error",
      reason: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedResponse(response, maxBytes) {
  if (!response.body) return { ok: true, buffer: Buffer.alloc(0) };
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(Buffer.from(value));
  }
  return { ok: true, buffer: Buffer.concat(chunks) };
}

async function writeImageCache({ directory, bodyPath, metaPath, buffer, metadata, now }) {
  await mkdir(directory, { recursive: true });
  const suffix = createHash("sha256").update(`${process.pid}:${now()}:${Math.random()}`).digest("hex").slice(0, 12);
  const temporaryBody = `${bodyPath}.${suffix}.tmp`;
  const temporaryMeta = `${metaPath}.${suffix}.tmp`;
  try {
    await Promise.all([
      writeFile(temporaryBody, buffer, { flag: "wx" }),
      writeFile(temporaryMeta, `${JSON.stringify(metadata)}\n`, { encoding: "utf8", flag: "wx" }),
    ]);
    await rename(temporaryBody, bodyPath);
    await rename(temporaryMeta, metaPath);
  } catch (error) {
    await Promise.all([rm(temporaryBody, { force: true }), rm(temporaryMeta, { force: true })]);
    throw error;
  }
}

function normalizeImageUrl(input) {
  const url = new URL(String(input || "").trim());
  if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("Image URL must use http or https.");
  if (url.username || url.password) throw new TypeError("Image URL must not include credentials.");
  if ((url.protocol === "http:" && url.port && url.port !== "80")
    || (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw new TypeError("Image URL must use a standard HTTP port.");
  }
  url.hash = "";
  return url.href;
}

function safeNormalizedImageUrl(input) {
  try {
    return normalizeImageUrl(input);
  } catch {
    return null;
  }
}

async function assertSafeImageUrl(urlString, resolveHost) {
  const url = new URL(normalizeImageUrl(urlString));
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new TypeError("Image URL must use a public hostname.");
  }
  const resolved = isIP(hostname) ? [hostname] : await resolveHost(hostname);
  const addresses = (Array.isArray(resolved) ? resolved : [resolved])
    .map((entry) => typeof entry === "string" ? entry : entry?.address)
    .filter(Boolean);
  if (!addresses.length || addresses.some((address) => !isPublicIp(address))) {
    throw new TypeError("Image hostname does not resolve exclusively to public addresses.");
  }
}

function isPublicIp(address) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  const mapped = normalized.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/u);
  if (mapped) return isPublicIpv4(mapped[1]);
  return !(
    normalized === "::"
    || normalized === "::1"
    || /^f[cd]/u.test(normalized)
    || /^fe[89ab]/u.test(normalized)
    || /^ff/u.test(normalized)
    || /^2001:db8(?:[:]|$)/u.test(normalized)
  );
}

function isPublicIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && [0, 2].includes(c))
    || (a === 198 && [18, 19].includes(b))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
  );
}

async function defaultResolveHost(hostname) {
  return lookup(hostname, { all: true, verbatim: true });
}

function sha256Text(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[\da-f]{64}$/u.test(text)) throw new TypeError("contentSha256 must be a SHA-256 hex digest.");
  return text;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function nonemptyText(value, label) {
  const normalized = cleanText(value, 4_000);
  if (!normalized) throw new TypeError(`${label} must be a non-empty string.`);
  return normalized;
}

function positiveInteger(value, label) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return number;
}

function positiveIntegerString(value, label) {
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (typeof value === "string" && /^[1-9]\d*$/u.test(value)) return value;
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  throw new TypeError(`${label} must be a positive integer.`);
}

function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or expose query().");
}

function rowsFrom(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function assertCount(label, result, expected) {
  const count = Number(result?.rowCount ?? rowsFrom(result).length);
  if (count !== expected) throw new Error(`${label} affected ${count} row(s); expected ${expected}.`);
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new Error("Image write timestamp is invalid.");
  return date.toISOString();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
