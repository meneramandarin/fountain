#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const ACTOR_ID = "7f94c2c4-57dd-4b9a-a905-7083e8d8a4ff";
const ACTOR_LABEL = "hyperbaric_cleanup_v2_20260711";
const CACHE_ROOT = path.join(ROOT, ".cache", "hyperbaric_cleanup_v2");
const LOCKED_SLUG = "o3-wellness-center-dubai";
const options = parseArgs(process.argv.slice(2));
const limit = Number.parseInt(options.limit || "0", 10);
const placesDelayMs = Number.parseInt(options.placesDelayMs || "1000", 10);
const websitePerDomainDelayMs = Number.parseInt(options.websitePerDomainDelayMs || "1000", 10);
const fetchTimeoutMs = Number.parseInt(options.fetchTimeoutMs || "12000", 10);

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

const connectionString = normalizePostgresConnectionString(
  process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING,
);
const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
const hasLlmKey = Boolean(
  process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
);

if (!connectionString) throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
if (!googleApiKey) throw new Error("Missing Google Places key.");
mkdirSync(CACHE_ROOT, { recursive: true });

const client = new Client({ connectionString });
let lastPlacesCallAt = 0;
const lastDomainFetchAt = new Map();

await client.connect();
try {
  const rows = await client.query(
    `
    SELECT q.*, sl.payload AS source_payload
    FROM fountain_raw.hyperbaric_cleanup_queue_20260711 q
    LEFT JOIN fountain_raw.source_listings sl
      ON sl.source_slug='hyperbaric_app'
     AND sl.source_listing_id=q.source_listing_id
    WHERE q.status IN ('pending','error_retry')
      AND q.slug <> $1
    ORDER BY q.location_id
    ${limit > 0 ? `LIMIT ${limit}` : ""}
    `,
    [LOCKED_SLUG],
  );

  console.log(`TASK_B worker_start rows=${rows.rowCount} has_llm_key=${hasLlmKey}`);

  for (const row of rows.rows) {
    await processLocation(row);
  }

  await printReport();
} finally {
  await client.end();
}

async function processLocation(row) {
  const errors = [];
  let textSearch = null;
  let details = null;
  let insertedExternalMatch = false;
  let websiteOutcome = "dead";
  let sourceImagesInserted = 0;

  await markQueue(row.location_id, "processing", null, { claimed_at: "now()" });

  try {
    textSearch = await googleTextSearch(row);
  } catch (error) {
    errors.push(`text_search: ${error.message}`);
  }

  const candidate = textSearch?.results?.[0] || null;
  if (candidate?.place_id) {
    try {
      details = await googlePlaceDetails(row, candidate.place_id);
    } catch (error) {
      errors.push(`place_details: ${error.message}`);
    }
  } else {
    await logCall({
      locationId: row.location_id,
      callType: "place_details",
      provider: "google_places",
      requestFingerprint: "skipped_no_text_search_candidate",
      status: "skipped",
      responseSummary: { reason: "no text search candidate" },
    });
  }

  const place = details?.result || candidate;
  if (place && isConfidentPlaceMatch(row, place)) {
    insertedExternalMatch = await insertExternalPlaceMatch(row, place);
  }

  try {
    const websiteUrl = chooseWebsite(row, place);
    const websiteResult = websiteUrl
      ? await fetchWebsitePages(row, websiteUrl)
      : { outcome: "dead", pages: [], reason: "no website" };
    websiteOutcome = websiteResult.outcome;
    if (websiteResult.pages.length) {
      sourceImagesInserted = await collectSourceImages(row, websiteResult.pages);
    }
  } catch (error) {
    errors.push(`website: ${error.message}`);
    websiteOutcome = "dead";
  }

  if (errors.length >= 3) {
    await markQueue(row.location_id, "error", errors.join("; "), {
      failure_count: "failure_count + 1",
      processed_at: "now()",
      place_match_inserted: insertedExternalMatch,
      source_images_inserted: sourceImagesInserted,
      website_outcome: websiteOutcome,
    });
    console.log(JSON.stringify({ location_id: row.location_id, status: "error", errors }));
    return;
  }

  const status = hasLlmKey ? "pending_llm" : "awaiting_llm_key";
  await markQueue(row.location_id, status, errors.length ? errors.join("; ") : null, {
    processed_at: "now()",
    place_match_inserted: insertedExternalMatch,
    source_images_inserted: sourceImagesInserted,
    website_outcome: websiteOutcome,
  });
  console.log(JSON.stringify({ location_id: row.location_id, status, website_outcome: websiteOutcome, external_match_inserted: insertedExternalMatch, source_images_inserted: sourceImagesInserted }));
}

async function googleTextSearch(row) {
  await throttlePlaces();
  const query = [row.name, row.locality, row.region, row.country_code].filter(Boolean).join(" ");
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", googleApiKey);
  const safeUrl = redactKey(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs) });
  const json = await response.json();
  await logCall({
    locationId: row.location_id,
    callType: "text_search",
    provider: "google_places",
    requestFingerprint: safeUrl,
    status: json.status === "OK" || json.status === "ZERO_RESULTS" ? "ok" : "error",
    httpStatus: response.status,
    errorMessage: json.error_message || null,
    responseSummary: {
      status: json.status,
      result_count: json.results?.length || 0,
      top_place_id: json.results?.[0]?.place_id || null,
      top_name: json.results?.[0]?.name || null,
    },
  });
  if (!response.ok || !["OK", "ZERO_RESULTS"].includes(json.status)) throw new Error(json.error_message || json.status || `HTTP ${response.status}`);
  return json;
}

async function googlePlaceDetails(row, placeId) {
  await throttlePlaces();
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "address_components,formatted_address,geometry,international_phone_number,website,business_status,types,rating,user_ratings_total,name,url");
  url.searchParams.set("key", googleApiKey);
  const safeUrl = redactKey(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(fetchTimeoutMs) });
  const json = await response.json();
  if (json.result) json.result.place_id = placeId;
  await logCall({
    locationId: row.location_id,
    callType: "place_details",
    provider: "google_places",
    requestFingerprint: safeUrl,
    status: json.status === "OK" ? "ok" : "error",
    httpStatus: response.status,
    errorMessage: json.error_message || null,
    responseSummary: {
      status: json.status,
      place_id: placeId,
      name: json.result?.name || null,
      business_status: json.result?.business_status || null,
      has_website: Boolean(json.result?.website),
      rating: json.result?.rating || null,
      user_ratings_total: json.result?.user_ratings_total || null,
    },
  });
  if (!response.ok || json.status !== "OK") throw new Error(json.error_message || json.status || `HTTP ${response.status}`);
  return json;
}

async function insertExternalPlaceMatch(row, place) {
  const distance = distanceMeters(row.latitude, row.longitude, place.geometry?.location?.lat, place.geometry?.location?.lng);
  const similarity = nameSimilarity(row.name || "", place.name || "");
  const raw = {
    provider: "google_places",
    phase: ACTOR_LABEL,
    place,
    match: { distance_meters: distance, name_similarity: similarity },
  };
  await client.query("BEGIN");
  try {
    await setActor();
    const result = await client.query(
      `
      INSERT INTO fountain.external_place_matches (
        location_id, provider, provider_place_id, provider_url, display_name, rating, review_count,
        match_confidence, match_status, fetched_at, raw_json
      )
      VALUES ($1,'google_places',$2,$3,$4,$5,$6,$7,'matched',now(),$8::jsonb)
      ON CONFLICT (location_id, provider) DO NOTHING
      `,
      [
        row.location_id,
        place.place_id || place.id,
        place.url || null,
        place.name || null,
        place.rating ?? null,
        place.user_ratings_total ?? null,
        Math.max(0, Math.min(1, similarity * 0.65 + (distance === null ? 0 : Math.max(0, 1 - distance / 500) * 0.35))),
        JSON.stringify(raw),
      ],
    );
    await client.query("COMMIT");
    return result.rowCount > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function fetchWebsitePages(row, websiteUrl) {
  const homepage = normalizeHttpUrl(websiteUrl);
  if (!homepage) return { outcome: "dead", pages: [], reason: "invalid url" };
  const first = await fetchOnePage(row, homepage, "homepage");
  if (!first.html) return { outcome: first.outcome, pages: [first] };

  const pages = [first];
  const links = extractRelevantLinks(first.html, first.finalUrl || homepage).slice(0, 2);
  for (const link of links) {
    const page = await fetchOnePage(row, link, inferPageRole(link));
    pages.push(page);
  }
  const okPage = pages.find((page) => page.outcome === "ok");
  const outcome = okPage ? "ok" : pages[0]?.outcome || "dead";
  return { outcome, pages };
}

async function fetchOnePage(row, requestedUrl, pageRole) {
  const domain = safeHostname(requestedUrl);
  await throttleDomain(domain);
  const cacheBase = `${row.location_id}-${pageRole}-${slugifyUrl(requestedUrl)}`.slice(0, 180);
  const htmlPath = path.join(CACHE_ROOT, `${cacheBase}.html`);
  const textPath = path.join(CACHE_ROOT, `${cacheBase}.txt`);
  let outcome = "dead";
  let html = "";
  let text = "";
  let finalUrl = null;
  let httpStatus = null;
  let title = null;
  let errorMessage = null;

  try {
    const response = await fetch(requestedUrl, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 Fountain cleanup audit; contact: ops@fountain.local" },
      signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    httpStatus = response.status;
    finalUrl = response.url || requestedUrl;
    const finalDomain = safeHostname(finalUrl);
    if ([401, 403, 429].includes(response.status)) {
      outcome = "blocked";
    } else if (!response.ok) {
      outcome = "dead";
    } else if (registeredDomain(domain) && registeredDomain(finalDomain) && registeredDomain(domain) !== registeredDomain(finalDomain)) {
      outcome = "redirect_other_business";
    } else {
      html = await response.text();
      text = htmlToText(html);
      title = extractTitle(html);
      outcome = text.length > 80 ? "ok" : "dead";
      writeFileSync(htmlPath, html);
      writeFileSync(textPath, text);
    }
  } catch (error) {
    errorMessage = error.message;
    outcome = /timeout|abort/i.test(error.message) ? "blocked" : "dead";
  }

  await client.query("BEGIN");
  try {
    await setActor();
    await client.query(
      `
      INSERT INTO fountain_raw.hyperbaric_cleanup_website_fetches_20260711 (
        location_id, domain, requested_url, final_url, page_role, outcome, http_status, title, cache_path, text_path, error_message
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [row.location_id, domain, requestedUrl, finalUrl, pageRole, outcome, httpStatus, title, html ? path.relative(ROOT, htmlPath) : null, text ? path.relative(ROOT, textPath) : null, errorMessage],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return { requestedUrl, finalUrl, domain, outcome, httpStatus, title, html, text, cachePath: html ? htmlPath : null, textPath: text ? textPath : null };
}

async function collectSourceImages(row, pages) {
  const imageCount = await client.query(
    `SELECT count(*)::int AS count FROM fountain.images WHERE entity_type='location' AND entity_id=$1 AND deleted_at IS NULL`,
    [row.location_id],
  );
  if (imageCount.rows[0].count > 0) return 0;

  const candidates = [];
  for (const page of pages) {
    if (!page.html || !page.finalUrl) continue;
    for (const imageUrl of extractImageUrls(page.html, page.finalUrl)) {
      if (isUsableImageUrl(imageUrl) && !candidates.includes(imageUrl)) candidates.push(imageUrl);
      if (candidates.length >= 5) break;
    }
    if (candidates.length >= 5) break;
  }
  if (!candidates.length) return 0;

  await client.query("BEGIN");
  try {
    await setActor();
    let inserted = 0;
    for (const imageUrl of candidates) {
      const result = await client.query(
        `
        INSERT INTO fountain_raw.source_images (source_slug, source_listing_id, image_url, source_page_url, synced_at)
        VALUES ('hyperbaric_app', $1, $2, $3, now())
        ON CONFLICT DO NOTHING
        `,
        [row.source_listing_id, imageUrl, pages.find((page) => page.html?.includes(imageUrl))?.finalUrl || pages[0]?.finalUrl || null],
      );
      inserted += result.rowCount;
    }
    await client.query("COMMIT");
    return inserted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function markQueue(locationId, status, errorMessage, fields = {}) {
  await client.query("BEGIN");
  try {
    await setActor();
    const assignments = ["status=$2", "error_message=$3", "updated_at=now()"];
    const values = [locationId, status, errorMessage];
    for (const [key, value] of Object.entries(fields)) {
      if (value === "now()" || value === "failure_count + 1") {
        assignments.push(`${key}=${value}`);
      } else {
        values.push(value);
        assignments.push(`${key}=$${values.length}`);
      }
    }
    await client.query(`UPDATE fountain_raw.hyperbaric_cleanup_queue_20260711 SET ${assignments.join(", ")} WHERE location_id=$1`, values);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function logCall({ locationId, callType, provider, requestFingerprint, status, httpStatus = null, errorMessage = null, responseSummary = null }) {
  await client.query("BEGIN");
  try {
    await setActor();
    await client.query(
      `
      INSERT INTO fountain_raw.hyperbaric_cleanup_call_ledger_20260711 (
        location_id, call_type, provider, request_fingerprint, status, http_status, error_message, response_summary
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      `,
      [locationId, callType, provider, requestFingerprint, status, httpStatus, errorMessage, responseSummary ? JSON.stringify(responseSummary) : null],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function setActor() {
  await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2)", [ACTOR_ID, ACTOR_LABEL]);
}

async function throttlePlaces() {
  const elapsed = Date.now() - lastPlacesCallAt;
  if (elapsed < placesDelayMs) await sleep(placesDelayMs - elapsed);
  lastPlacesCallAt = Date.now();
}

async function throttleDomain(domain) {
  if (!domain) return;
  const elapsed = Date.now() - (lastDomainFetchAt.get(domain) || 0);
  if (elapsed < websitePerDomainDelayMs) await sleep(websitePerDomainDelayMs - elapsed);
  lastDomainFetchAt.set(domain, Date.now());
}

function chooseWebsite(row, place) {
  return row.website || place?.website || null;
}

function isConfidentPlaceMatch(row, place) {
  const distance = distanceMeters(row.latitude, row.longitude, place.geometry?.location?.lat, place.geometry?.location?.lng);
  const similarity = nameSimilarity(row.name || "", place.name || "");
  return distance !== null && distance < 500 && similarity >= 0.5;
}

function nameSimilarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const token of ta) if (tb.has(token)) overlap++;
  const jaccard = overlap / new Set([...ta, ...tb]).size;
  const subset = overlap / Math.min(ta.size, tb.size);
  return Math.max(jaccard, subset * 0.85);
}

function tokens(value) {
  const stop = new Set(["a", "an", "and", "at", "by", "for", "of", "the", "with", "clinic", "center", "centre", "medical", "wellness", "health", "therapy", "llc", "inc", "pllc"]);
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 1 && !stop.has(token)));
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v === null || v === undefined || Number.isNaN(Number(v)))) return null;
  const r = 6371000;
  const dLat = radians(Number(lat2) - Number(lat1));
  const dLon = radians(Number(lon2) - Number(lon1));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(Number(lat1))) * Math.cos(radians(Number(lat2))) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.asin(Math.sqrt(a));
}

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function extractRelevantLinks(html, baseUrl) {
  const links = [];
  const linkRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  for (const match of html.matchAll(linkRegex)) {
    const raw = decodeHtml(match[1] || "");
    const text = htmlToText(match[2] || "");
    let url;
    try {
      url = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(url.protocol)) continue;
    if (registeredDomain(url.hostname) !== registeredDomain(new URL(baseUrl).hostname)) continue;
    const haystack = `${url.pathname} ${text}`.toLowerCase();
    if (/(hyperbaric|hbot|oxygen|service|services|pricing|price|contact|about|treatment|treatments)/i.test(haystack)) {
      const normalized = url.toString().replace(/#.*$/, "");
      if (!links.includes(normalized)) links.push(normalized);
    }
  }
  return links;
}

function extractImageUrls(html, baseUrl) {
  const urls = [];
  const imgRegex = /<img\b[^>]*(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gis;
  for (const match of html.matchAll(imgRegex)) {
    try {
      const url = new URL(decodeHtml(match[1]), baseUrl).toString();
      if (!urls.includes(url)) urls.push(url);
    } catch {}
  }
  const srcsetRegex = /(?:srcset|data-srcset)=["']([^"']+)["']/gis;
  for (const match of html.matchAll(srcsetRegex)) {
    for (const part of decodeHtml(match[1]).split(",")) {
      const raw = part.trim().split(/\s+/)[0];
      try {
        const url = new URL(raw, baseUrl).toString();
        if (!urls.includes(url)) urls.push(url);
      } catch {}
    }
  }
  return urls;
}

function isUsableImageUrl(url) {
  const lower = url.toLowerCase();
  if (lower.startsWith("data:")) return false;
  if (/\.(svg|gif|ico)([?#]|$)/.test(lower)) return false;
  if (/(logo|icon|sprite|avatar|badge|favicon|placeholder|tracking|pixel|ads?|analytics|doubleclick|googletag|facebook|instagram|youtube|ytimg)/.test(lower)) return false;
  if (/(unsplash|pexels|pixabay|shutterstock|stock\.adobe|gettyimages)/.test(lower)) return false;
  return /\.(jpe?g|png|webp|avif)([?#]|$)/.test(lower);
}

function htmlToText(html) {
  return decodeHtml(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, 20000);
}

function extractTitle(html) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 300) : null;
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeHttpUrl(value) {
  if (!value) return null;
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withScheme);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function registeredDomain(hostname) {
  if (!hostname) return null;
  const parts = hostname.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const suffix = parts.slice(-2).join(".");
  const multi = new Set(["co.uk", "org.uk", "com.au", "com.br", "com.mx", "com.sg", "com.tr", "co.nz", "co.za", "com.ph"]);
  return multi.has(suffix) ? parts.slice(-3).join(".") : suffix;
}

function inferPageRole(url) {
  const lower = url.toLowerCase();
  if (/price|pricing|cost/.test(lower)) return "pricing";
  if (/contact|location/.test(lower)) return "contact";
  if (/service|treatment|hyperbaric|hbot|oxygen/.test(lower)) return "services";
  return "relevant";
}

function slugifyUrl(url) {
  return String(url).toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function redactKey(url) {
  const clone = new URL(url.toString());
  if (clone.searchParams.has("key")) clone.searchParams.set("key", "REDACTED");
  return clone.toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function printReport() {
  const queries = {
    queue_counts: `SELECT status, count(*)::int AS count FROM fountain_raw.hyperbaric_cleanup_queue_20260711 GROUP BY status ORDER BY status`,
    call_counts: `SELECT call_type, status, count(*)::int AS count FROM fountain_raw.hyperbaric_cleanup_call_ledger_20260711 GROUP BY call_type,status ORDER BY call_type,status`,
    website_outcomes: `SELECT website_outcome, count(*)::int AS count FROM fountain_raw.hyperbaric_cleanup_queue_20260711 GROUP BY website_outcome ORDER BY website_outcome`,
    external_matches_inserted: `SELECT count(*)::int AS count FROM fountain_raw.hyperbaric_cleanup_queue_20260711 WHERE place_match_inserted=true`,
    source_images_inserted: `SELECT coalesce(sum(source_images_inserted),0)::int AS count FROM fountain_raw.hyperbaric_cleanup_queue_20260711`,
  };
  for (const [name, sql] of Object.entries(queries)) {
    const result = await client.query(sql);
    console.log(`REPORT ${name}`);
    console.table(result.rows);
  }
  if (!hasLlmKey) {
    console.log("NOT EXECUTED: B3 LLM classification calls - no LLM API key found in environment (checked OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY).");
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--limit") parsed.limit = args[++index];
    else if (arg.startsWith("--limit=")) parsed.limit = arg.slice("--limit=".length);
    else if (arg === "--places-delay-ms") parsed.placesDelayMs = args[++index];
    else if (arg.startsWith("--places-delay-ms=")) parsed.placesDelayMs = arg.slice("--places-delay-ms=".length);
    else if (arg === "--website-per-domain-delay-ms") parsed.websitePerDomainDelayMs = args[++index];
    else if (arg.startsWith("--website-per-domain-delay-ms=")) parsed.websitePerDomainDelayMs = arg.slice("--website-per-domain-delay-ms=".length);
    else if (arg === "--fetch-timeout-ms") parsed.fetchTimeoutMs = args[++index];
    else if (arg.startsWith("--fetch-timeout-ms=")) parsed.fetchTimeoutMs = arg.slice("--fetch-timeout-ms=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function normalizePostgresConnectionString(value) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode"))) url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  } catch {
    return value;
  }
}
