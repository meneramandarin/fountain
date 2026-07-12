#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { sanitizeUrl } from "../src/lib/url-sanitize.mjs";

const { Pool } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phase = options.phase || "phase0";
const schema = options.schema || "fountain";
const rawSchema = options.rawSchema || "fountain_raw";
const sourceSlug = "hyperbaric_app";
const sourceId = 255;
const runLabel = "hyperbaric_cleanup_20260710";
const runActorId = options.actorId || "7f94c2c4-57dd-4b9a-a905-7083e8d8a4ff";
const workers = Number.parseInt(options.workers || "25", 10);
const maxRows = options.maxRows ? Number.parseInt(options.maxRows, 10) : Infinity;
const placesRateMs = Number.parseInt(options.placesRateMs || "220", 10);
const websiteDomainRateMs = Number.parseInt(options.websiteDomainRateMs || "1000", 10);
const cacheDir = path.resolve(ROOT, options.cacheDir || ".cache/hyperbaric_cleanup_20260710");
const outputDir = path.resolve(ROOT, options.outputDir || ".cache/hyperbaric_cleanup_20260710/reports");

const NON_MATCHABLE_DOMAINS = new Set([
  "facebook.com",
  "instagram.com",
  "linktr.ee",
  "lin.ee",
  "doctoralia.com",
  "doctoralia.com.br",
  "doctoralia.com.mx",
  "bookimed.com",
  "us-uk.bookimed.com",
  "google.com",
  "maps.google.com",
  "hyperbaric.app",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
]);

const institutionalTokens = [
  "police",
  "military",
  "navy",
  "army",
  "air force",
  "government",
  "gov",
  "university",
  "research",
  "veterinary",
  "vet ",
  "hospital",
  "wound care",
  "dive medicine",
  "diving",
  "occupational",
];
const notClinicTokens = [
  "manufacturer",
  "manufacturing",
  "equipment",
  "reseller",
  "rental",
  "rentals",
  "sales",
  "training",
  "academy",
  "association",
  "chamber sales",
  "home chamber",
];

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));
for (const envFile of options.envFile || []) loadEnvFile(path.resolve(ROOT, envFile));

const connectionString = normalizePostgresConnectionString(
  options.databaseUrl ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING,
);
if (!connectionString) throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
const googleApiKey = options.googleApiKey || process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;

mkdirSync(cacheDir, { recursive: true });
mkdirSync(path.join(cacheDir, "places"), { recursive: true });
mkdirSync(path.join(cacheDir, "web"), { recursive: true });
mkdirSync(outputDir, { recursive: true });

const pool = new Pool({ connectionString, max: 20 });
let placesCallCount = 0;
let lastPlacesCallAt = 0;
const domainLastFetch = new Map();

try {
  if (phase === "phase0") await phase0();
  else if (phase === "phase1") await phase1();
  else if (phase === "swarm") await phase2Swarm();
  else if (phase === "apply") await phase3Apply();
  else if (phase === "report") await phase4Report();
  else if (phase === "all") {
    await phase0();
    await phase1();
    await phase2Swarm();
    await phase3Apply();
    await phase4Report();
  } else {
    throw new Error(`Unknown --phase=${phase}`);
  }
} finally {
  await pool.end();
}

async function phase0() {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await setActor(db);
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.suppressed_source_listings (
        source_slug text NOT NULL,
        source_listing_id bigint NOT NULL,
        reason text NOT NULL,
        suppressed_at timestamptz NOT NULL DEFAULT now(),
        suppressed_by text,
        PRIMARY KEY (source_slug, source_listing_id)
      )
    `);
    await db.query(`
      INSERT INTO ${quoteIdent(rawSchema)}.suppressed_source_listings (source_slug, source_listing_id, reason, suppressed_by)
      SELECT source_slug, source_listing_id, 'institutional_police_facility_manual_delete', $2
      FROM ${quoteIdent(rawSchema)}.source_listings
      WHERE source_slug = $1
        AND source_url LIKE '%hyberbarics-oxygen-therapy-dubai-police%'
      ON CONFLICT (source_slug, source_listing_id) DO UPDATE
      SET reason = EXCLUDED.reason,
          suppressed_by = EXCLUDED.suppressed_by
    `, [sourceSlug, runLabel]);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 (
        location_id integer PRIMARY KEY,
        source_listing_id bigint NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        claimed_by text,
        claimed_at timestamptz,
        completed_at timestamptz,
        error text
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710 (
        location_id integer PRIMARY KEY,
        source_listing_id bigint NOT NULL,
        legitimacy text,
        legitimacy_confidence text,
        legitimacy_evidence jsonb,
        address_verdict text,
        address_corrected jsonb,
        phone_verdict text,
        phone_corrected text,
        website_verdict text,
        website_corrected text,
        place_id text,
        business_status text,
        price_found boolean,
        price_payload jsonb,
        images_found integer,
        worker_id text,
        completed_at timestamptz
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.hyperbaric_dedup_candidates_20260710 (
        keep_id integer NOT NULL,
        merge_id integer NOT NULL,
        method text NOT NULL,
        confidence double precision,
        evidence jsonb,
        decision text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (keep_id, merge_id, method)
      )
    `);
    await db.query(`
      INSERT INTO ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 (location_id, source_listing_id)
      SELECT DISTINCT ON (l.id) l.id, sr.source_listing_id::bigint
      FROM ${quoteIdent(schema)}.locations l
      JOIN ${quoteIdent(schema)}.source_records sr
        ON sr.entity_type='location'
       AND sr.entity_id=l.id
       AND sr.source_id=$1
      WHERE l.data_origin='scraped'
        AND l.created_at BETWEEN timestamptz '2026-07-10 07:30Z' AND timestamptz '2026-07-10 08:10Z'
        AND l.deleted_at IS NULL
        AND l.status <> 'hidden'
      ORDER BY l.id, sr.source_listing_id::bigint
      ON CONFLICT (location_id) DO UPDATE
      SET source_listing_id = EXCLUDED.source_listing_id
    `, [sourceId]);
    await db.query(`
      UPDATE ${quoteIdent(schema)}.locations
      SET verification_status='verified', updated_at=now()
      WHERE slug='o3-wellness-center-dubai'
        AND deleted_at IS NULL
    `);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
  await printTables("phase0", [
    `SELECT count(*)::int AS suppressed FROM ${quoteIdent(rawSchema)}.suppressed_source_listings WHERE source_slug='${sourceSlug}'`,
    `SELECT status, count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 GROUP BY status ORDER BY status`,
  ]);
}

async function phase1() {
  const db = await pool.connect();
  try {
    const locations = await rows(`
      SELECT
        l.id, l.name, l.slug, l.address, l.locality, l.country_code, l.latitude, l.longitude,
        l.website, l.verification_status, l.created_at,
        coalesce(sr_count.count, 0)::int AS source_record_count,
        q.source_listing_id,
        (q.location_id IS NOT NULL) AS hyperbaric_created
      FROM ${quoteIdent(schema)}.locations l
      LEFT JOIN ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 q ON q.location_id=l.id
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS count
        FROM ${quoteIdent(schema)}.source_records sr
        WHERE sr.entity_type='location' AND sr.entity_id=l.id
      ) sr_count ON true
      WHERE l.deleted_at IS NULL
        AND l.status <> 'hidden'
        AND (
          q.location_id IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM ${quoteIdent(schema)}.source_records sr
            WHERE sr.source_id=$1 AND sr.entity_type='location' AND sr.entity_id=l.id
          )
        )
    `, [sourceId]);
    const allActive = await rows(`
      SELECT l.id, l.name, l.slug, l.address, l.locality, l.country_code, l.latitude, l.longitude,
             l.website, l.verification_status, l.created_at,
             coalesce(sr_count.count, 0)::int AS source_record_count,
             false AS hyperbaric_created
      FROM ${quoteIdent(schema)}.locations l
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS count
        FROM ${quoteIdent(schema)}.source_records sr
        WHERE sr.entity_type='location' AND sr.entity_id=l.id
      ) sr_count ON true
      WHERE l.deleted_at IS NULL AND l.status <> 'hidden'
    `);
    const hyper = locations.filter((row) => row.hyperbaric_created);
    const candidates = new Map();
    const addCandidate = (a, b, method, confidence, evidence) => {
      if (!a || !b || a.id === b.id) return;
      const [keep, merge] = chooseKeepMerge(a, b);
      const key = `${keep.id}|${merge.id}|${method}`;
      if (!candidates.has(key)) candidates.set(key, { keep_id: keep.id, merge_id: merge.id, method, confidence, evidence });
    };

    const bySlugBase = new Map();
    for (const loc of allActive) {
      const base = slugBase(loc.slug);
      if (!base) continue;
      if (!bySlugBase.has(base)) bySlugBase.set(base, []);
      bySlugBase.get(base).push(loc);
    }
    for (const h of hyper) {
      const group = bySlugBase.get(slugBase(h.slug)) || [];
      for (const other of group) {
        if (other.id !== h.id && (h.slug !== other.slug || /-\d+$/.test(h.slug) || /-\d+$/.test(other.slug))) {
          addCandidate(h, other, "slug_suffix", 0.99, { left_slug: h.slug, right_slug: other.slug });
        }
      }
    }

    for (const h of hyper) {
      const hDomain = matchableDomain(h.website);
      if (!hDomain || h.latitude == null || h.longitude == null) continue;
      for (const other of allActive) {
        if (other.id === h.id) continue;
        if (matchableDomain(other.website) !== hDomain || other.latitude == null || other.longitude == null) continue;
        const meters = distanceMeters(h.latitude, h.longitude, other.latitude, other.longitude);
        if (meters <= 250) addCandidate(h, other, "domain_geo", 0.97, { domain: hDomain, distance_meters: Math.round(meters) });
      }
    }

    for (const h of hyper) {
      if (h.latitude == null || h.longitude == null) continue;
      for (const other of allActive) {
        if (other.id === h.id || other.latitude == null || other.longitude == null) continue;
        if (normalizeCode(h.country_code) !== normalizeCode(other.country_code)) continue;
        const meters = distanceMeters(h.latitude, h.longitude, other.latitude, other.longitude);
        if (meters > 150) continue;
        const sim = nameSimilarity(h.name, other.name);
        if (sim >= 0.85) addCandidate(h, other, "name_geo", sim, { distance_meters: Math.round(meters), name_similarity: sim });
      }
    }

    await db.query("BEGIN");
    await setActor(db);
    for (const candidate of candidates.values()) {
      await db.query(`
        INSERT INTO ${quoteIdent(rawSchema)}.hyperbaric_dedup_candidates_20260710
          (keep_id, merge_id, method, confidence, evidence, decision)
        VALUES ($1,$2,$3,$4,$5::jsonb,'pending')
        ON CONFLICT (keep_id, merge_id, method) DO UPDATE
        SET confidence=EXCLUDED.confidence,
            evidence=EXCLUDED.evidence
      `, [candidate.keep_id, candidate.merge_id, candidate.method, candidate.confidence, JSON.stringify(candidate.evidence)]);
    }
    await db.query("COMMIT");

    const auto = [...candidates.values()].filter((c) => c.method === "slug_suffix" || c.method === "domain_geo");
    for (const candidate of auto) {
      await autoMergeCandidate(candidate);
    }
    await reconcileQueueAfterMerges();
  } finally {
    db.release();
  }
  await writeDedupReviewLists();
  await printTables("phase1", [
    `SELECT method, decision, count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_dedup_candidates_20260710 GROUP BY method, decision ORDER BY method, decision`,
    `SELECT status, count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 GROUP BY status ORDER BY status`,
  ]);
}

async function autoMergeCandidate(candidate) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await setActor(db);
    const exists = await row(`
      SELECT
        EXISTS(SELECT 1 FROM ${quoteIdent(schema)}.locations WHERE id=$1) AS keep_exists,
        EXISTS(SELECT 1 FROM ${quoteIdent(schema)}.locations WHERE id=$2) AS merge_exists
    `, [candidate.keep_id, candidate.merge_id]);
    if (!exists.keep_exists || !exists.merge_exists) {
      await db.query(`
        UPDATE ${quoteIdent(rawSchema)}.hyperbaric_dedup_candidates_20260710
        SET decision='already_resolved'
        WHERE keep_id=$1 AND merge_id=$2 AND method=$3
      `, [candidate.keep_id, candidate.merge_id, candidate.method]);
      await db.query("COMMIT");
      return;
    }
    await db.query(`SELECT ${quoteIdent(schema)}.merge_locations($1,$2,$3::uuid,$4)`, [
      candidate.keep_id,
      candidate.merge_id,
      runActorId,
      `${runLabel}: auto merge ${candidate.method}`,
    ]);
    await db.query(`
      UPDATE ${quoteIdent(rawSchema)}.hyperbaric_dedup_candidates_20260710
      SET decision='auto_merged'
      WHERE keep_id=$1 AND merge_id=$2 AND method=$3
    `, [candidate.keep_id, candidate.merge_id, candidate.method]);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    await pool.query(`
      UPDATE ${quoteIdent(rawSchema)}.hyperbaric_dedup_candidates_20260710
      SET decision='merge_error', evidence = coalesce(evidence, '{}'::jsonb) || $4::jsonb
      WHERE keep_id=$1 AND merge_id=$2 AND method=$3
    `, [candidate.keep_id, candidate.merge_id, candidate.method, JSON.stringify({ error: error.message })]);
  } finally {
    db.release();
  }
}

async function reconcileQueueAfterMerges() {
  await pool.query(`
    DELETE FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 q
    WHERE NOT EXISTS (SELECT 1 FROM ${quoteIdent(schema)}.locations l WHERE l.id=q.location_id)
  `);
  await pool.query(`
    INSERT INTO ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 (location_id, source_listing_id)
    SELECT DISTINCT ON (sr.entity_id) sr.entity_id, sr.source_listing_id::bigint
    FROM ${quoteIdent(schema)}.source_records sr
    JOIN ${quoteIdent(schema)}.locations l ON l.id=sr.entity_id
    WHERE sr.source_id=$1
      AND sr.entity_type='location'
      AND l.data_origin='scraped'
      AND l.created_at BETWEEN timestamptz '2026-07-10 07:30Z' AND timestamptz '2026-07-10 08:10Z'
      AND l.deleted_at IS NULL
      AND l.status <> 'hidden'
    ORDER BY sr.entity_id, sr.source_listing_id::bigint
    ON CONFLICT (location_id) DO NOTHING
  `, [sourceId]);
}

async function phase2Swarm() {
  if (!googleApiKey) throw new Error("Missing Google Places API key.");
  const workerIds = Array.from({ length: workers }, (_, index) => `worker-${String(index + 1).padStart(2, "0")}`);
  await Promise.all(workerIds.map((workerId) => workerLoop(workerId)));
  await printTables("swarm", [
    `SELECT status, count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 GROUP BY status ORDER BY status`,
    `SELECT legitimacy, legitimacy_confidence, count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710 GROUP BY legitimacy, legitimacy_confidence ORDER BY legitimacy, legitimacy_confidence`,
  ]);
  console.log(JSON.stringify({ placesCallCount }, null, 2));
}

async function workerLoop(workerId) {
  let processed = 0;
  while (processed < maxRows) {
    const claim = await claimQueueRow(workerId);
    if (!claim) return;
    try {
      const result = await processLocation(claim, workerId);
      await saveResultAndComplete(result);
    } catch (error) {
      await markQueueError(claim.location_id, error.message || String(error), workerId);
    }
    processed += 1;
    if (processed % 10 === 0) console.log(`${workerId} processed ${processed}`);
  }
}

async function claimQueueRow(workerId) {
  const result = await pool.query(`
    WITH next AS (
      SELECT location_id
      FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710
      WHERE status='pending'
      ORDER BY location_id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 q
    SET status='claimed', claimed_by=$1, claimed_at=now()
    FROM next
    WHERE q.location_id=next.location_id
    RETURNING q.location_id, q.source_listing_id
  `, [workerId]);
  return result.rows[0] || null;
}

async function processLocation(claim, workerId) {
  const location = await row(`
    SELECT l.*, sl.payload, sl.source_url,
           (SELECT count(*)::int FROM ${quoteIdent(schema)}.images img WHERE img.entity_type='location' AND img.entity_id=l.id AND img.status='active' AND img.deleted_at IS NULL) AS active_image_count
    FROM ${quoteIdent(schema)}.locations l
    JOIN ${quoteIdent(rawSchema)}.source_listings sl
      ON sl.source_slug=$2 AND sl.source_listing_id=$3
    WHERE l.id=$1
  `, [claim.location_id, sourceSlug, claim.source_listing_id]);
  if (!location) throw new Error("location or raw listing missing");

  const place = await lookupPlace(location);
  let website = sanitizeUrl(location.website || place?.websiteUri || place?.website || "");
  const websiteData = website ? await inspectWebsite(website) : emptyWebsiteData();
  if (!website && place?.websiteUri) website = sanitizeUrl(place.websiteUri);

  const fieldVerdicts = compareFields(location, place, websiteData);
  const legitimacy = classifyLegitimacy(location, place, websiteData);
  const price = harvestPrice(websiteData, location.payload);
  const imagesFound = await landRawImagesIfNeeded(location, websiteData, claim.source_listing_id);

  if (place?.confident) await upsertExternalPlaceMatch(location.id, place);

  return {
    location_id: location.id,
    source_listing_id: claim.source_listing_id,
    legitimacy: legitimacy.classification,
    legitimacy_confidence: legitimacy.confidence,
    legitimacy_evidence: legitimacy.evidence,
    ...fieldVerdicts,
    place_id: place?.id || null,
    business_status: place?.businessStatus || place?.business_status || null,
    price_found: price.price_found,
    price_payload: price.payload,
    images_found: imagesFound,
    worker_id: workerId,
  };
}

async function lookupPlace(location) {
  const query = [location.name, location.locality, location.country_code].filter(Boolean).join(" ");
  if (!query.trim()) return null;
  const cacheKey = createHash("sha256").update(`text:${query}|${location.latitude || ""}|${location.longitude || ""}`).digest("hex");
  const cached = readCache("places", cacheKey);
  if (cached) return cached;
  const body = {
    textQuery: query,
    maxResultCount: 5,
  };
  if (location.latitude != null && location.longitude != null) {
    body.locationBias = {
      circle: {
        center: { latitude: Number(location.latitude), longitude: Number(location.longitude) },
        radius: 5000,
      },
    };
  }
  const search = await placesFetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": googleApiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.types,places.rating,places.userRatingCount,places.internationalPhoneNumber,places.nationalPhoneNumber,places.websiteUri",
    },
    body: JSON.stringify(body),
  });
  const places = search.places || [];
  const best = choosePlaceCandidate(location, places);
  writeCache("places", cacheKey, best);
  return best;
}

async function placesFetch(url, init) {
  const elapsed = Date.now() - lastPlacesCallAt;
  if (elapsed < placesRateMs) await sleep(placesRateMs - elapsed);
  lastPlacesCallAt = Date.now();
  placesCallCount += 1;
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`places_http_${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function choosePlaceCandidate(location, places) {
  if (!places.length) return null;
  const scored = places.map((place) => {
    const pLat = place.location?.latitude;
    const pLng = place.location?.longitude;
    const meters = pLat != null && pLng != null && location.latitude != null && location.longitude != null
      ? distanceMeters(location.latitude, location.longitude, pLat, pLng)
      : null;
    const sim = nameSimilarity(location.name, place.displayName?.text || "");
    const score = sim + (meters == null ? 0 : Math.max(0, 0.5 - meters / 1000));
    return { place, meters, sim, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  return {
    ...best.place,
    name_similarity: best.sim,
    distance_meters: best.meters,
    confident: best.sim >= 0.65 && (best.meters == null || best.meters < 500),
  };
}

async function inspectWebsite(website) {
  const normalized = sanitizeUrl(website);
  if (!normalized) return emptyWebsiteData();
  const pages = [];
  const home = await fetchWebsitePage(normalized);
  if (home.ok) pages.push(home);
  const links = home.ok ? extractRelevantLinks(home.url, home.html).slice(0, 2) : [];
  for (const link of links) {
    const page = await fetchWebsitePage(link);
    if (page.ok) pages.push(page);
  }
  const text = pages.map((page) => htmlToText(page.html)).join("\n").slice(0, 15000);
  const images = unique(
    pages.flatMap((page) => extractImages(page.url, page.html)).filter((url) => !isJunkImageUrl(url)),
  ).slice(0, 5);
  return {
    ok: pages.length > 0,
    dead: pages.length === 0,
    finalUrl: pages[0]?.url || normalized,
    pages: pages.map((page) => page.url),
    text,
    images,
  };
}

async function fetchWebsitePage(url) {
  const cacheKey = createHash("sha256").update(url).digest("hex");
  const cached = readCache("web", cacheKey);
  if (cached) return cached;
  const host = hostFromUrl(url);
  const elapsed = Date.now() - (domainLastFetch.get(host) || 0);
  if (elapsed < websiteDomainRateMs) await sleep(websiteDomainRateMs - elapsed);
  domainLastFetch.set(host, Date.now());
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; FountainHyperbaricCleanup/1.0)" } });
    clearTimeout(timeout);
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      const result = { ok: false, url, status: response.status, contentType };
      writeCache("web", cacheKey, result);
      return result;
    }
    const html = await response.text();
    const result = { ok: true, url: response.url || url, status: response.status, contentType, html };
    writeCache("web", cacheKey, result);
    return result;
  } catch (error) {
    const result = { ok: false, url, error: error.name === "AbortError" ? "timeout" : error.message || String(error) };
    writeCache("web", cacheKey, result);
    return result;
  }
}

function compareFields(location, place, websiteData) {
  const lockedAddress = location.slug === "o3-wellness-center-dubai";
  const addressCorrected = place?.confident && !lockedAddress && place.formattedAddress && !roughAddressMatch(location.address, place.formattedAddress)
    ? placeAddressPayload(place)
    : null;
  return {
    address_verdict: lockedAddress ? "confirmed" : addressCorrected ? "corrected" : place?.formattedAddress ? "confirmed" : "unverifiable",
    address_corrected: addressCorrected,
    phone_verdict: place?.confident && choosePhone(place) && normalizePhone(choosePhone(place)) !== normalizePhone(location.phone) ? "corrected" : choosePhone(place) ? "confirmed" : "unverifiable",
    phone_corrected: place?.confident && choosePhone(place) && normalizePhone(choosePhone(place)) !== normalizePhone(location.phone) ? choosePhone(place) : null,
    website_verdict: place?.confident && place.websiteUri && websiteDomain(place.websiteUri) !== websiteDomain(location.website) ? "corrected" : websiteData.dead ? "unverifiable" : "confirmed",
    website_corrected: place?.confident && place.websiteUri && websiteDomain(place.websiteUri) !== websiteDomain(location.website) ? sanitizeUrl(place.websiteUri) : null,
  };
}

function classifyLegitimacy(location, place, websiteData) {
  const nameHaystack = `${location.name || ""}\n${place?.displayName?.text || ""}\n${location.website || ""}`.toLowerCase();
  const websiteText = String(websiteData.text || "").toLowerCase();
  const haystack = `${nameHaystack}\n${place?.types?.join(" ") || ""}\n${websiteText}`;
  const evidence = {
    name: location.name,
    places_name: place?.displayName?.text || null,
    places_types: place?.types || [],
    business_status: place?.businessStatus || null,
    website_pages: websiteData.pages || [],
    matched_tokens: [],
    place_confident: Boolean(place?.confident),
    place_distance_meters: place?.distance_meters ?? null,
    place_name_similarity: place?.name_similarity ?? null,
  };
  if (place?.businessStatus === "CLOSED_PERMANENTLY" || (!place && websiteData.dead)) {
    return { classification: "suppress_dead", confidence: place?.businessStatus === "CLOSED_PERMANENTLY" ? "high" : "medium", evidence };
  }
  if (/\b(hospital|medical city|wound care|wound-care)\b/i.test(nameHaystack)) {
    evidence.matched_tokens = ["hospital_or_wound_care_name"];
    return { classification: "keep_medical", confidence: "high", evidence };
  }
  const strongNotClinicPatterns = [
    "manufacturer of hyperbaric",
    "hyperbaric chamber manufacturer",
    "chamber manufacturer",
    "buy hyperbaric",
    "buy a hyperbaric",
    "hyperbaric chambers for sale",
    "chambers for sale",
    "sell hyperbaric chambers",
    "home chamber rental",
    "chamber rental",
    "equipment reseller",
    "authorized reseller",
    "training academy",
  ];
  const notClinic = notClinicTokens.filter((token) => nameHaystack.includes(token) || strongNotClinicPatterns.some((pattern) => websiteText.includes(pattern) && pattern.includes(token.split(" ")[0])));
  const strongNotClinic = strongNotClinicPatterns.filter((pattern) => haystack.includes(pattern));
  if (notClinic.length || strongNotClinic.length) {
    evidence.matched_tokens = [...new Set([...notClinic, ...strongNotClinic])];
    const nameStrong = ["manufacturer", "equipment", "reseller", "rental", "rentals", "sales", "training", "academy", "association"].some((token) => nameHaystack.includes(token));
    return { classification: "suppress_not_a_clinic", confidence: nameStrong || strongNotClinic.length ? "high" : "medium", evidence };
  }
  const institutional = institutionalTokens.filter((token) => nameHaystack.includes(token));
  if (institutional.length) {
    evidence.matched_tokens = institutional;
    if (institutional.some((t) => ["police", "military", "navy", "army", "air force", "government", "veterinary"].includes(t))) {
      return { classification: "suppress_institutional", confidence: "high", evidence };
    }
    if (institutional.some((t) => ["hospital", "wound care"].includes(t))) {
      return { classification: "keep_medical", confidence: "high", evidence };
    }
    return { classification: "suppress_institutional", confidence: "medium", evidence };
  }
  if (/hyperbaric|hbot|oxygen therapy|wellness|recovery|clinic|medical/i.test(haystack)) {
    return { classification: "keep", confidence: place?.confident || websiteData.ok ? "high" : "medium", evidence };
  }
  return { classification: "review", confidence: "low", evidence };
}

function harvestPrice(websiteData, payload) {
  const text = `${websiteData.text || ""}\n${JSON.stringify(payload || {})}`;
  const money = text.match(/([$]|AED|USD|EUR|GBP|CAD|AUD)\s?([0-9][0-9,]*(?:\.\d{2})?)\s*(?:per|\/)?\s*(session|treatment|visit)?/i);
  if (!money) return { price_found: false, payload: null };
  const currency = currencyFromSymbol(money[1]);
  return {
    price_found: true,
    payload: {
      amount: Number(String(money[2]).replaceAll(",", "")),
      currency,
      unit: "session",
      raw_text: text.slice(Math.max(0, money.index - 160), money.index + 220),
      source_url: websiteData.pages?.[0] || null,
    },
  };
}

async function landRawImagesIfNeeded(location, websiteData, sourceListingId) {
  if (Number(location.active_image_count || 0) > 0 || !websiteData.images?.length) return 0;
  let count = 0;
  for (const imageUrl of websiteData.images.slice(0, 5)) {
    const result = await pool.query(`
      INSERT INTO ${quoteIdent(rawSchema)}.source_images (source_slug, source_listing_id, image_url, alt, source_page_url, synced_at)
      SELECT $1,$2,$3,$4,$5,now()
      WHERE NOT EXISTS (
        SELECT 1 FROM ${quoteIdent(rawSchema)}.source_images
        WHERE source_slug=$1 AND source_listing_id=$2 AND image_url=$3
      )
    `, [sourceSlug, sourceListingId, imageUrl, location.name, websiteData.pages?.[0] || null]);
    count += result.rowCount;
  }
  return count;
}

async function upsertExternalPlaceMatch(locationId, place) {
  await pool.query(`
    INSERT INTO ${quoteIdent(schema)}.external_place_matches (
      location_id, provider, provider_place_id, provider_url, display_name, rating, review_count,
      match_confidence, match_status, fetched_at, raw_json
    )
    VALUES ($1,'google_places',$2,$3,$4,$5,$6,$7,'matched',now(),$8::jsonb)
    ON CONFLICT (location_id, provider) DO UPDATE
    SET provider_place_id=EXCLUDED.provider_place_id,
        provider_url=EXCLUDED.provider_url,
        display_name=EXCLUDED.display_name,
        rating=EXCLUDED.rating,
        review_count=EXCLUDED.review_count,
        match_confidence=EXCLUDED.match_confidence,
        match_status=EXCLUDED.match_status,
        fetched_at=EXCLUDED.fetched_at,
        raw_json=EXCLUDED.raw_json
  `, [
    locationId,
    place.id,
    place.id ? `https://www.google.com/maps/place/?q=place_id:${place.id}` : null,
    place.displayName?.text || null,
    place.rating ?? null,
    place.userRatingCount ?? null,
    place.name_similarity ?? null,
    JSON.stringify(place),
  ]);
}

async function saveResultAndComplete(result) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await setActor(db);
    await db.query(`
      INSERT INTO ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710 (
        location_id, source_listing_id, legitimacy, legitimacy_confidence, legitimacy_evidence,
        address_verdict, address_corrected, phone_verdict, phone_corrected, website_verdict, website_corrected,
        place_id, business_status, price_found, price_payload, images_found, worker_id, completed_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,now())
      ON CONFLICT (location_id) DO UPDATE
      SET source_listing_id=EXCLUDED.source_listing_id,
          legitimacy=EXCLUDED.legitimacy,
          legitimacy_confidence=EXCLUDED.legitimacy_confidence,
          legitimacy_evidence=EXCLUDED.legitimacy_evidence,
          address_verdict=EXCLUDED.address_verdict,
          address_corrected=EXCLUDED.address_corrected,
          phone_verdict=EXCLUDED.phone_verdict,
          phone_corrected=EXCLUDED.phone_corrected,
          website_verdict=EXCLUDED.website_verdict,
          website_corrected=EXCLUDED.website_corrected,
          place_id=EXCLUDED.place_id,
          business_status=EXCLUDED.business_status,
          price_found=EXCLUDED.price_found,
          price_payload=EXCLUDED.price_payload,
          images_found=EXCLUDED.images_found,
          worker_id=EXCLUDED.worker_id,
          completed_at=EXCLUDED.completed_at
    `, [
      result.location_id,
      result.source_listing_id,
      result.legitimacy,
      result.legitimacy_confidence,
      JSON.stringify(result.legitimacy_evidence || {}),
      result.address_verdict,
      JSON.stringify(result.address_corrected),
      result.phone_verdict,
      result.phone_corrected,
      result.website_verdict,
      result.website_corrected,
      result.place_id,
      result.business_status,
      result.price_found,
      JSON.stringify(result.price_payload),
      result.images_found,
      result.worker_id,
    ]);
    await db.query(`
      UPDATE ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710
      SET status='complete', completed_at=now()
      WHERE location_id=$1
    `, [result.location_id]);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

async function markQueueError(locationId, message, workerId) {
  await pool.query(`
    UPDATE ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710
    SET status='error', claimed_by=$2, completed_at=now(), error=$3
    WHERE location_id=$1
  `, [locationId, workerId, message.slice(0, 1000)]);
}

async function phase3Apply() {
  const db = await pool.connect();
  const summary = {};
  try {
    await db.query("BEGIN");
    await setActor(db);
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.hyperbaric_field_corrections_backup_20260710 AS
      SELECT l.*, now() AS backed_up_at, NULL::text AS correction_type
      FROM ${quoteIdent(schema)}.locations l
      WHERE false
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.hyperbaric_price_review_20260710 (
        location_id integer PRIMARY KEY,
        source_listing_id bigint,
        price_payload jsonb,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const corrections = await db.query(`
      SELECT r.*, l.slug
      FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710 r
      JOIN ${quoteIdent(schema)}.locations l ON l.id=r.location_id
      WHERE (r.address_verdict='corrected' OR r.phone_verdict='corrected' OR r.website_verdict='corrected')
        AND r.legitimacy_confidence IN ('high','medium')
    `);
    let address = 0, phone = 0, website = 0;
    for (const r of corrections.rows) {
      await db.query(`
        INSERT INTO ${quoteIdent(rawSchema)}.hyperbaric_field_corrections_backup_20260710
        SELECT l.*, now(), $2
        FROM ${quoteIdent(schema)}.locations l
        WHERE l.id=$1
      `, [r.location_id, "field_correction"]);
      const locked = r.slug === "o3-wellness-center-dubai";
      const corrected = r.address_corrected || {};
      await db.query(`
        UPDATE ${quoteIdent(schema)}.locations
        SET address = CASE WHEN $2::boolean OR $3::jsonb IS NULL THEN address ELSE coalesce($3::jsonb->>'address', address) END,
            locality = CASE WHEN $2::boolean OR $3::jsonb IS NULL THEN locality ELSE coalesce($3::jsonb->>'locality', locality) END,
            region = CASE WHEN $2::boolean OR $3::jsonb IS NULL THEN region ELSE coalesce($3::jsonb->>'region', region) END,
            postal_code = CASE WHEN $2::boolean OR $3::jsonb IS NULL THEN postal_code ELSE coalesce($3::jsonb->>'postal_code', postal_code) END,
            country_code = CASE WHEN $2::boolean OR $3::jsonb IS NULL THEN country_code ELSE coalesce($3::jsonb->>'country_code', country_code) END,
            country_name = CASE WHEN $2::boolean OR $3::jsonb IS NULL THEN country_name ELSE coalesce($3::jsonb->>'country_name', country_name) END,
            latitude = CASE WHEN $2::boolean OR $3::jsonb IS NULL THEN latitude ELSE coalesce(($3::jsonb->>'latitude')::double precision, latitude) END,
            longitude = CASE WHEN $2::boolean OR $3::jsonb IS NULL THEN longitude ELSE coalesce(($3::jsonb->>'longitude')::double precision, longitude) END,
            phone = CASE WHEN $4::text IS NULL THEN phone ELSE $4 END,
            website = CASE WHEN $5::text IS NULL THEN website ELSE $5 END,
            updated_at = now()
        WHERE id=$1
      `, [
        r.location_id,
        locked,
        r.address_verdict === "corrected" && !locked ? JSON.stringify(corrected) : null,
        r.phone_verdict === "corrected" ? r.phone_corrected : null,
        r.website_verdict === "corrected" ? r.website_corrected : null,
      ]);
      if (r.address_verdict === "corrected" && !locked) address += 1;
      if (r.phone_verdict === "corrected") phone += 1;
      if (r.website_verdict === "corrected") website += 1;
    }
    summary.fieldCorrections = { address, phone, website };

    const prices = await db.query(`
      SELECT r.location_id, r.source_listing_id, r.price_payload
      FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710 r
      WHERE r.price_found=true AND r.price_payload IS NOT NULL
    `);
    let pricesApplied = 0, pricesReview = 0;
    for (const r of prices.rows) {
      const payload = r.price_payload;
      if (payload?.unit === "session" && Number.isFinite(Number(payload.amount)) && payload.currency) {
        const result = await db.query(`
          UPDATE ${quoteIdent(schema)}.offerings
          SET price_amount=$2, price_currency=$3, updated_at=now()
          WHERE location_id=$1 AND source_id=$4 AND treatment_id=27 AND deleted_at IS NULL
        `, [r.location_id, payload.amount, payload.currency, sourceId]);
        pricesApplied += result.rowCount;
      } else {
        await db.query(`
          INSERT INTO ${quoteIdent(rawSchema)}.hyperbaric_price_review_20260710 (location_id, source_listing_id, price_payload, reason)
          VALUES ($1,$2,$3::jsonb,'ambiguous_or_non_session')
          ON CONFLICT (location_id) DO UPDATE SET price_payload=EXCLUDED.price_payload, reason=EXCLUDED.reason
        `, [r.location_id, r.source_listing_id, JSON.stringify(payload)]);
        pricesReview += 1;
      }
    }
    summary.prices = { applied: pricesApplied, review: pricesReview };

    const suppressions = await db.query(`
      SELECT r.location_id, r.source_listing_id, r.legitimacy
      FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710 r
      JOIN ${quoteIdent(schema)}.locations l ON l.id=r.location_id
      WHERE r.legitimacy IN ('suppress_institutional','suppress_not_a_clinic','suppress_dead')
        AND r.legitimacy_confidence='high'
        AND l.status <> 'hidden'
    `);
    let hidden = 0;
    for (const r of suppressions.rows) {
      await db.query(`UPDATE ${quoteIdent(schema)}.locations SET status='hidden', updated_at=now() WHERE id=$1`, [r.location_id]);
      await db.query(`
        INSERT INTO ${quoteIdent(rawSchema)}.suppressed_source_listings (source_slug, source_listing_id, reason, suppressed_by)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (source_slug, source_listing_id) DO UPDATE
        SET reason=EXCLUDED.reason, suppressed_by=EXCLUDED.suppressed_by
      `, [sourceSlug, r.source_listing_id, r.legitimacy, runLabel]);
      hidden += 1;
    }
    summary.suppressionsHidden = hidden;
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
  console.log(JSON.stringify({ phase: "apply", summary }, null, 2));
}

async function phase4Report() {
  await writeDedupReviewLists();
  await writeLegitimacyReviewLists();
  const summary = {
    queue: await rows(`SELECT status, count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_queue_20260710 GROUP BY status ORDER BY status`),
    dedup: await rows(`SELECT method, decision, count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_dedup_candidates_20260710 GROUP BY method, decision ORDER BY method, decision`),
    legitimacy: await rows(`SELECT legitimacy, legitimacy_confidence, count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710 GROUP BY legitimacy, legitimacy_confidence ORDER BY legitimacy, legitimacy_confidence`),
    suppressions: await rows(`SELECT reason, count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.suppressed_source_listings WHERE source_slug=$1 GROUP BY reason ORDER BY reason`, [sourceSlug]),
    imagesLandedRaw: await row(`SELECT coalesce(sum(images_found),0)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710`),
    pricesReview: await row(`SELECT count(*)::int AS rows FROM ${quoteIdent(rawSchema)}.hyperbaric_price_review_20260710`),
  };
  writeFileSync(path.join(outputDir, "hyperbaric_cleanup_summary_20260710.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

async function writeDedupReviewLists() {
  const rowsOut = await rows(`
    SELECT c.keep_id, keep_l.name AS keep_name, keep_l.address AS keep_address, keep_l.website AS keep_website,
           c.merge_id, merge_l.name AS merge_name, merge_l.address AS merge_address, merge_l.website AS merge_website,
           c.method, c.confidence, c.evidence
    FROM ${quoteIdent(rawSchema)}.hyperbaric_dedup_candidates_20260710 c
    LEFT JOIN ${quoteIdent(schema)}.locations keep_l ON keep_l.id=c.keep_id
    LEFT JOIN ${quoteIdent(schema)}.locations merge_l ON merge_l.id=c.merge_id
    WHERE c.method='name_geo' AND c.decision='pending'
    ORDER BY c.confidence DESC
  `);
  writeTsv(path.join(outputDir, "hyperbaric_name_geo_dedup_review_20260710.tsv"), rowsOut);
}

async function writeLegitimacyReviewLists() {
  const review = await rows(`
    SELECT r.location_id, l.name, l.address, l.locality, l.country_code, r.legitimacy, r.legitimacy_confidence, r.legitimacy_evidence
    FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710 r
    JOIN ${quoteIdent(schema)}.locations l ON l.id=r.location_id
    WHERE r.legitimacy='review'
       OR (r.legitimacy LIKE 'suppress_%' AND r.legitimacy_confidence <> 'high')
    ORDER BY r.legitimacy, r.legitimacy_confidence, l.name
  `);
  writeTsv(path.join(outputDir, "hyperbaric_suppression_review_20260710.tsv"), review);
  const medical = await rows(`
    SELECT r.location_id, l.name, l.address, l.locality, l.country_code, r.legitimacy_confidence, r.legitimacy_evidence
    FROM ${quoteIdent(rawSchema)}.hyperbaric_cleanup_results_20260710 r
    JOIN ${quoteIdent(schema)}.locations l ON l.id=r.location_id
    WHERE r.legitimacy='keep_medical'
    ORDER BY l.name
  `);
  writeTsv(path.join(outputDir, "hyperbaric_keep_medical_review_20260710.tsv"), medical);
}

function chooseKeepMerge(a, b) {
  const av = scoreKeep(a);
  const bv = scoreKeep(b);
  if (av !== bv) return av > bv ? [a, b] : [b, a];
  return new Date(a.created_at) <= new Date(b.created_at) ? [a, b] : [b, a];
}

function scoreKeep(row) {
  return (Number(row.source_record_count || 0) * 100) + (row.verification_status === "verified" ? 10 : 0);
}

function slugBase(slug) {
  return String(slug || "").replace(/-\d+$/, "");
}

function matchableDomain(value) {
  const domain = websiteDomain(value);
  return domain && !NON_MATCHABLE_DOMAINS.has(domain) ? domain : null;
}

function websiteDomain(value) {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const last2 = parts.slice(-2).join(".");
    const last3 = parts.slice(-3).join(".");
    const multi = new Set(["co.uk", "com.au", "com.br", "com.mx", "com.sg", "com.tr"]);
    return multi.has(last2) ? last3 : last2;
  } catch {
    return null;
  }
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (Number(lat2) - Number(lat1)) * rad;
  const dLng = (Number(lng2) - Number(lng1)) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(Number(lat1) * rad) * Math.cos(Number(lat2) * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nameSimilarity(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return (2 * intersection) / (left.size + right.size);
}

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["the", "and", "clinic", "center", "centre", "medical", "wellness", "therapy", "hyperbaric", "oxygen"].includes(token));
}

function placeAddressPayload(place) {
  return {
    address: place.formattedAddress || null,
    locality: null,
    region: null,
    postal_code: null,
    country_code: null,
    country_name: null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    formatted_address: place.formattedAddress || null,
  };
}

function choosePhone(place) {
  return place?.internationalPhoneNumber || place?.international_phone_number || place?.nationalPhoneNumber || null;
}

function normalizePhone(value) {
  return String(value || "").replace(/[^0-9+]/g, "");
}

function roughAddressMatch(left, right) {
  const lt = tokens(left);
  const rt = new Set(tokens(right));
  return lt.length > 0 && lt.filter((token) => rt.has(token)).length / lt.length >= 0.5;
}

function currencyFromSymbol(value) {
  const v = String(value || "").toUpperCase();
  if (v === "$" || v === "USD") return "USD";
  if (v === "€" || v === "EUR") return "EUR";
  if (v === "£" || v === "GBP") return "GBP";
  if (v === "AED") return "AED";
  if (v === "CAD") return "CAD";
  if (v === "AUD") return "AUD";
  return v;
}

function emptyWebsiteData() {
  return { ok: false, dead: true, finalUrl: null, pages: [], text: "", images: [] };
}

function extractRelevantLinks(baseUrl, html) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
  let match;
  while ((match = re.exec(html))) {
    const label = htmlToText(match[2]).toLowerCase();
    const href = absolutize(baseUrl, match[1]);
    if (!href || websiteDomain(href) !== websiteDomain(baseUrl)) continue;
    if (/contact|pricing|price|services|hyperbaric|hbot|oxygen|therapy|treatments/i.test(`${label} ${href}`)) links.push(href);
  }
  return unique(links);
}

function extractImages(baseUrl, html) {
  const images = [];
  const re = /<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gis;
  let match;
  while ((match = re.exec(html))) {
    const url = absolutize(baseUrl, match[1]);
    if (url) images.push(url);
  }
  return images;
}

function isJunkImageUrl(url) {
  return /data:|\.svg($|[?#])|\.ico($|[?#])|favicon|sprite|tracking|pixel|placeholder|blank|transparent|loader|spinner|logo|icon|google|doubleclick|analytics/i.test(url);
}

function absolutize(baseUrl, href) {
  try {
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return null;
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function readCache(kind, key) {
  const file = path.join(cacheDir, kind, `${key}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(kind, key, value) {
  writeFileSync(path.join(cacheDir, kind, `${key}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

async function setActor(db) {
  await db.query(`SELECT ${quoteIdent(schema)}.set_mutation_actor($1::uuid, $2)`, [runActorId, runLabel]);
}

async function printTables(label, sqls) {
  console.log(`### ${label}`);
  for (const sql of sqls) console.table((await rows(sql)).rows || await rows(sql));
}

async function rows(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function row(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

function writeTsv(file, rowsOut) {
  if (!rowsOut.length) {
    writeFileSync(file, "");
    return;
  }
  const headers = Object.keys(rowsOut[0]);
  const escape = (value) => String(value == null ? "" : typeof value === "object" ? JSON.stringify(value) : value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
  writeFileSync(file, `${headers.join("\t")}\n${rowsOut.map((row) => headers.map((h) => escape(row[h])).join("\t")).join("\n")}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--phase") parsed.phase = args[++i];
    else if (arg === "--workers") parsed.workers = args[++i];
    else if (arg === "--max-rows") parsed.maxRows = args[++i];
    else if (arg === "--places-rate-ms") parsed.placesRateMs = args[++i];
    else if (arg === "--website-domain-rate-ms") parsed.websiteDomainRateMs = args[++i];
    else if (arg === "--cache-dir") parsed.cacheDir = args[++i];
    else if (arg === "--output-dir") parsed.outputDir = args[++i];
    else if (arg === "--actor-id") parsed.actorId = args[++i];
    else if (arg === "--database-url") parsed.databaseUrl = args[++i];
    else if (arg === "--google-api-key") parsed.googleApiKey = args[++i];
    else if (arg === "--env-file") {
      parsed.envFile ||= [];
      parsed.envFile.push(args[++i]);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

function normalizePostgresConnectionString(value) {
  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  } catch {
    return value;
  }
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
