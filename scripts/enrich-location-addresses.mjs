#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { closePool, getPool, query } from "../pipeline/lib/db.mjs";
import { getOpenRouterApiKey } from "./lib/pipeline-env.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_OUTPUT = path.join(ROOT, "tmp", "location-address-enrichment-20260723.json");
const DEFAULT_MODEL = "z-ai/glm-4.7-flash";
const ACTOR_ID = "74b6e477-3f32-4f71-9b63-4b84a36cd2f7";
const RUN_LABEL = "location_address_coordinate_enrichment_20260723";
const ARCGIS_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const args = parseArgs(process.argv.slice(2));
const outputPath = path.resolve(ROOT, args.output || DEFAULT_OUTPUT);
const openRouterKey = getOpenRouterApiKey();
if (!openRouterKey) throw new Error("OPENROUTER_API_KEY is required.");

try {
  const locations = await loadLocations();
  const resumed = args.resume ? await loadExisting(outputPath) : new Map();
  const selected = locations
    .filter((location) => !args.onlyId || location.id === args.onlyId)
    .filter((location) => !resumed.has(location.id))
    .slice(0, args.limit || undefined);

  console.error(JSON.stringify({
    event: "start",
    database_cohort: locations.length,
    selected: selected.length,
    resumed: resumed.size,
    concurrency: args.concurrency,
    model: args.model,
    apply: args.apply,
  }));

  const results = [...resumed.values()];
  let completed = 0;
  await concurrentMap(selected, args.concurrency, async (location) => {
    const result = await enrichLocation(location);
    results.push(result);
    completed += 1;
    if (completed % 10 === 0 || completed === selected.length) {
      await saveResults(results);
      console.error(JSON.stringify({
        event: "progress",
        completed,
        total: selected.length,
        found: results.filter((row) => row.decision === "ready").length,
        unresolved: results.filter((row) => row.decision !== "ready").length,
        estimated_cost_usd: sumCost(results),
      }));
    }
  });

  results.sort((a, b) => a.location.id - b.location.id);
  await saveResults(results);

  let applied = { updated: 0, skipped: 0, failed: [] };
  if (args.apply) applied = await applyResults(results);

  const finalCounts = await loadFinalCounts();
  const summary = summarize(results, applied, finalCounts);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await closePool();
}

async function loadLocations() {
  const result = await query(`
    SELECT
      id, slug, name, address, locality, region, postal_code, country_code,
      country_name, website, latitude, longitude, status, is_virtual
    FROM fountain.locations
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND NOT is_virtual
      AND (
        NULLIF(btrim(address), '') IS NULL
        OR latitude IS NULL
        OR longitude IS NULL
        OR (latitude = 0 AND longitude = 0)
      )
    ORDER BY id
  `);
  return result.rows.map((row) => ({
    ...row,
    id: Number(row.id),
    latitude: finiteNumber(row.latitude),
    longitude: finiteNumber(row.longitude),
  }));
}

async function enrichLocation(location) {
  const research = location.address
    ? existingAddressResearch(location)
    : await researchAddress(location);
  const parsed = normalizeResearch(research, location);
  const evidence = validateEvidence(parsed, research.citations, location);
  const geocode = parsed.address
    ? await geocodeAddress(parsed, location)
    : emptyGeocode("no_address");
  const geocodeValidation = validateGeocode(geocode, parsed, location);
  const ready = Boolean(
    parsed.address
    && evidence.valid
    && geocodeValidation.valid
    && (location.address || parsed.status === "found"),
  );
  return {
    location,
    research: {
      model: research.model || null,
      output: parsed,
      citations: research.citations || [],
      usage: research.usage || null,
      error: research.error || null,
    },
    evidence_validation: evidence,
    geocode,
    geocode_validation: geocodeValidation,
    decision: ready ? "ready" : "unresolved",
    reason: ready
      ? "official_web_evidence_and_geocode_match"
      : firstReason(parsed, evidence, geocodeValidation, research),
    proposed: ready ? {
      address: parsed.address,
      locality: parsed.locality || location.locality,
      region: parsed.region || location.region,
      postal_code: parsed.postal_code || location.postal_code,
      country_code: parsed.country_code || location.country_code,
      country_name: location.country_name,
      website: location.website || parsed.official_website || null,
      latitude: geocode.latitude,
      longitude: geocode.longitude,
    } : null,
  };
}

function existingAddressResearch(location) {
  return {
    model: null,
    raw: JSON.stringify({
      status: "found",
      address: location.address,
      locality: location.locality,
      region: location.region,
      postal_code: location.postal_code,
      country_code: location.country_code,
      official_website: location.website,
      source_url: location.website,
      evidence: "Existing database address; geocoding repair only.",
      confidence: "high",
    }),
    citations: [],
    usage: null,
  };
}

async function researchAddress(location) {
  const target = {
    id: location.id,
    name: location.name,
    supplied_website: location.website,
    locality: location.locality,
    region: location.region,
    postal_code: location.postal_code,
    country_code: location.country_code,
    country_name: location.country_name,
    approximate_coordinates: location.latitude != null && location.longitude != null
      ? { latitude: location.latitude, longitude: location.longitude }
      : null,
  };
  const prompt = [
    "Find the exact public physical street address of this specific business branch.",
    "Use web search. Prefer the supplied official website, its contact/location pages,",
    "booking page, or official structured data. For a multi-location brand, do not use",
    "headquarters or another branch. The address must match the target locality/country",
    "and approximate coordinates. Never guess. A city, region, or postal centroid alone",
    "is not a street address. Return one JSON object only with exactly these keys:",
    "status (found|not_found|ambiguous), address, locality, region, postal_code,",
    "country_code, official_website, source_url, evidence, confidence (high|medium|low).",
    "Use null for unknown values.",
    `Target: ${JSON.stringify(target)}`,
  ].join(" ");
  const body = {
    model: args.model,
    messages: [
      {
        role: "system",
        content: "You are a careful location-data research agent. Use official web evidence, never infer an address, and output JSON only.",
      },
      { role: "user", content: prompt },
    ],
    tools: [{
      type: "openrouter:web_search",
      parameters: {
        engine: "exa",
        max_results: 4,
        max_total_results: 4,
        max_characters: 4_000,
      },
    }],
    tool_choice: "required",
    temperature: 0,
    max_tokens: 700,
    reasoning: { enabled: false },
    usage: { include: true },
  };

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://fountain.clinic",
          "X-Title": "Fountain location address enrichment",
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (attempt < 4 && [408, 409, 429, 500, 502, 503, 504].includes(response.status)) {
          await sleep(500 * (2 ** attempt));
          continue;
        }
        throw new Error(`OpenRouter ${response.status}: ${payload?.error?.message || response.statusText}`);
      }
      const message = payload?.choices?.[0]?.message || {};
      return {
        model: payload.model || args.model,
        raw: message.content || "",
        citations: normalizeCitations(message.annotations),
        usage: payload.usage || null,
      };
    } catch (error) {
      if (attempt < 4) {
        await sleep(500 * (2 ** attempt));
        continue;
      }
      return { model: args.model, raw: "", citations: [], usage: null, error: error.message };
    }
  }
  return { model: args.model, raw: "", citations: [], usage: null, error: "retry_exhausted" };
}

function normalizeResearch(research, location) {
  const value = parseJsonObject(research.raw);
  return {
    status: ["found", "not_found", "ambiguous"].includes(value.status)
      ? value.status
      : value.address ? "found" : "not_found",
    address: clean(value.address),
    locality: clean(value.locality),
    region: clean(value.region),
    postal_code: clean(value.postal_code),
    country_code: normalizeCountryCode(value.country_code) || normalizeCountryCode(location.country_code),
    official_website: httpUrl(value.official_website),
    source_url: httpUrl(value.source_url),
    evidence: clean(value.evidence),
    confidence: ["high", "medium", "low"].includes(value.confidence) ? value.confidence : "low",
  };
}

function validateEvidence(output, citations, location) {
  if (location.address) return { valid: true, reason: "existing_address" };
  if (output.status !== "found" || !output.address) return { valid: false, reason: output.status };
  const expectedCountry = normalizeCountryCode(location.country_code);
  if (expectedCountry && output.country_code && expectedCountry !== output.country_code) {
    return { valid: false, reason: "country_mismatch" };
  }
  const source = citations.find((citation) => (
    officialSourceMatches(citation.url, location.website, output.official_website)
    && citationContainsAddress(citation, output)
  ))
    || citations.find((citation) => citation.url === output.source_url)
    || citations.find((citation) => citationContainsAddress(citation, output))
    || null;
  if (!source) return { valid: false, reason: "no_citation_support" };
  if (!officialSourceMatches(source.url, location.website, output.official_website)) {
    return { valid: false, reason: "non_official_source", source_url: source.url };
  }
  if (!citationContainsAddress(source, output)) {
    return { valid: false, reason: "citation_does_not_support_address", source_url: source.url };
  }
  if (location.locality && !placeMatches(location.locality, [output.locality, output.address, source.content])) {
    return { valid: false, reason: "locality_mismatch", source_url: source.url };
  }
  if (output.confidence === "low") {
    return { valid: false, reason: "low_model_confidence", source_url: source.url };
  }
  return { valid: true, reason: "citation_supported", source_url: source.url };
}

async function geocodeAddress(output, location) {
  const singleLine = uniqueParts([
    output.address,
    output.locality,
    output.region,
    output.postal_code,
    location.country_name,
  ]).join(", ");
  const url = new URL(ARCGIS_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("singleLine", singleLine);
  url.searchParams.set("outFields", "Match_addr,Addr_type,Country,CountryCode,City,Region,Postal");
  url.searchParams.set("maxLocations", "5");
  if (location.country_code) url.searchParams.set("sourceCountry", location.country_code);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "FountainClinicDataEnrichment/1.0 (https://fountain.clinic)" },
    });
    const payload = await response.json();
    const candidates = (payload.candidates || []).map((candidate) => ({
      latitude: finiteNumber(candidate?.location?.y),
      longitude: finiteNumber(candidate?.location?.x),
      score: finiteNumber(candidate?.score) || 0,
      matched_address: clean(candidate?.address),
      address_type: clean(candidate?.attributes?.Addr_type),
      city: clean(candidate?.attributes?.City),
      region: clean(candidate?.attributes?.Region),
      postal_code: clean(candidate?.attributes?.Postal),
      country: clean(candidate?.attributes?.Country),
      country_code: normalizeCountryCode(candidate?.attributes?.CountryCode),
    }));
    const chosen = chooseCandidate(candidates, output, location);
    return chosen ? {
      provider: "arcgis_world_geocoder",
      query: singleLine,
      ...chosen,
      old_coordinate_distance_km: distanceFromExisting(chosen, location),
    } : emptyGeocode("no_candidate", singleLine, candidates);
  } catch (error) {
    return { ...emptyGeocode("api_error", singleLine), error: error.message };
  }
}

function chooseCandidate(candidates, output, location) {
  return candidates.find((candidate) => (
    candidate.latitude != null
    && candidate.longitude != null
    && candidate.score >= 85
    && (!output.postal_code || placeMatches(output.postal_code, [candidate.postal_code, candidate.matched_address]))
    && (!output.locality || placeMatches(output.locality, [candidate.city, candidate.matched_address]))
    && coordinateDistanceAcceptable(candidate, location)
  )) || null;
}

function validateGeocode(geocode, output, location) {
  if (geocode.latitude == null || geocode.longitude == null) {
    return { valid: false, reason: geocode.reason || "no_geocode" };
  }
  if (geocode.score < 85) return { valid: false, reason: "low_geocode_score" };
  if (output.locality && !placeMatches(output.locality, [geocode.city, geocode.matched_address])) {
    return { valid: false, reason: "geocode_locality_mismatch" };
  }
  if (!coordinateDistanceAcceptable(geocode, location)) {
    return { valid: false, reason: "far_from_existing_coordinates", distance_km: geocode.old_coordinate_distance_km };
  }
  return {
    valid: true,
    reason: "geocode_match",
    score: geocode.score,
    address_type: geocode.address_type,
    distance_km: geocode.old_coordinate_distance_km,
  };
}

function coordinateDistanceAcceptable(candidate, location) {
  const distance = distanceFromExisting(candidate, location);
  return distance == null || distance <= 50;
}

function distanceFromExisting(candidate, location) {
  if (location.latitude == null || location.longitude == null) return null;
  return haversineKm(
    location.latitude,
    location.longitude,
    candidate.latitude,
    candidate.longitude,
  );
}

async function applyResults(results) {
  const ready = results.filter((row) => row.decision === "ready" && row.proposed);
  const pool = getPool();
  const applied = { updated: 0, skipped: 0, failed: [] };
  await ensureAuditTables(pool);
  for (const row of ready) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2)", [ACTOR_ID, RUN_LABEL]);
      const locked = await client.query(`
        SELECT *
        FROM fountain.locations
        WHERE id = $1
          AND status = 'active'
          AND deleted_at IS NULL
          AND NOT is_virtual
        FOR UPDATE
      `, [row.location.id]);
      const current = locked.rows[0];
      if (!current || (
        clean(current.address) !== clean(row.location.address)
        || finiteNumber(current.latitude) !== row.location.latitude
        || finiteNumber(current.longitude) !== row.location.longitude
      )) {
        applied.skipped += 1;
        await client.query("ROLLBACK");
        continue;
      }
      await client.query(`
        INSERT INTO fountain_raw.location_address_coordinate_backup_20260723
        SELECT location.*, now() AS backed_up_at
        FROM fountain.locations location
        WHERE location.id = $1
        ON CONFLICT (id) DO NOTHING
      `, [row.location.id]);
      await client.query(`
        INSERT INTO fountain_raw.location_address_coordinate_evidence_20260723 (
          location_id, decision, reason, model, source_url, evidence,
          geocoder, geocode_score, geocode_type, matched_address,
          proposed_data, research_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
        ON CONFLICT (location_id) DO UPDATE SET
          decision = EXCLUDED.decision,
          reason = EXCLUDED.reason,
          model = EXCLUDED.model,
          source_url = EXCLUDED.source_url,
          evidence = EXCLUDED.evidence,
          geocoder = EXCLUDED.geocoder,
          geocode_score = EXCLUDED.geocode_score,
          geocode_type = EXCLUDED.geocode_type,
          matched_address = EXCLUDED.matched_address,
          proposed_data = EXCLUDED.proposed_data,
          research_data = EXCLUDED.research_data,
          recorded_at = now()
      `, [
        row.location.id,
        row.decision,
        row.reason,
        row.research.model,
        row.evidence_validation.source_url || row.research.output.source_url,
        row.research.output.evidence,
        row.geocode.provider,
        row.geocode.score,
        row.geocode.address_type,
        row.geocode.matched_address,
        JSON.stringify(row.proposed),
        JSON.stringify(row.research),
      ]);
      await client.query(`
        UPDATE fountain.locations
        SET address = $2,
            locality = COALESCE($3, locality),
            region = COALESCE($4, region),
            postal_code = COALESCE($5, postal_code),
            country_code = COALESCE($6, country_code),
            website = COALESCE(website, $7),
            latitude = $8,
            longitude = $9,
            data_origin = 'manual'
        WHERE id = $1
      `, [
        row.location.id,
        row.proposed.address,
        row.proposed.locality,
        row.proposed.region,
        row.proposed.postal_code,
        row.proposed.country_code,
        row.proposed.website,
        row.proposed.latitude,
        row.proposed.longitude,
      ]);
      await client.query("COMMIT");
      applied.updated += 1;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      applied.failed.push({ id: row.location.id, error: error.message });
    } finally {
      client.release();
    }
  }
  if (applied.updated) await query("SELECT fountain.refresh_city_index()");
  return applied;
}

async function ensureAuditTables(pool) {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS fountain_raw;
    CREATE TABLE IF NOT EXISTS fountain_raw.location_address_coordinate_backup_20260723
    (LIKE fountain.locations INCLUDING ALL);
    ALTER TABLE fountain_raw.location_address_coordinate_backup_20260723
      ADD COLUMN IF NOT EXISTS backed_up_at timestamptz NOT NULL DEFAULT now();
    CREATE TABLE IF NOT EXISTS fountain_raw.location_address_coordinate_evidence_20260723 (
      location_id integer PRIMARY KEY,
      decision text NOT NULL,
      reason text NOT NULL,
      model text,
      source_url text,
      evidence text,
      geocoder text,
      geocode_score double precision,
      geocode_type text,
      matched_address text,
      proposed_data jsonb,
      research_data jsonb,
      recorded_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function loadFinalCounts() {
  const result = await query(`
    SELECT
      count(*) FILTER (
        WHERE status='active' AND deleted_at IS NULL AND NOT is_virtual
          AND (latitude IS NULL OR longitude IS NULL OR (latitude=0 AND longitude=0))
      )::integer AS missing_coordinates,
      count(*) FILTER (
        WHERE status='active' AND deleted_at IS NULL AND NOT is_virtual
          AND NULLIF(btrim(address),'') IS NULL
      )::integer AS missing_addresses
    FROM fountain.locations
  `);
  return result.rows[0];
}

function summarize(results, applied, finalCounts) {
  const ready = results.filter((row) => row.decision === "ready");
  const unresolved = results.filter((row) => row.decision !== "ready");
  const byReason = {};
  for (const row of unresolved) byReason[row.reason] = (byReason[row.reason] || 0) + 1;
  return {
    cohort: results.length,
    ready: ready.length,
    unresolved: unresolved.length,
    unresolved_by_reason: byReason,
    unresolved_ids: unresolved.map((row) => row.location.id),
    estimated_openrouter_cost_usd: sumCost(results),
    applied,
    final_database_counts: finalCounts,
    output: outputPath,
  };
}

async function saveResults(results) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const payload = {
    generated_at: new Date().toISOString(),
    model: args.model,
    results: [...results].sort((a, b) => a.location.id - b.location.id),
  };
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function loadExisting(file) {
  try {
    const payload = JSON.parse(await readFile(file, "utf8"));
    return new Map((payload.results || []).map(revalidateRow).map((row) => [Number(row.location.id), row]));
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

function revalidateRow(row) {
  if (!row?.location || !row?.research?.output) return row;
  const evidence = validateEvidence(row.research.output, row.research.citations || [], row.location);
  const geocodeValidation = validateGeocode(row.geocode || emptyGeocode("no_geocode"), row.research.output, row.location);
  const ready = Boolean(row.research.output.address && evidence.valid && geocodeValidation.valid);
  const proposed = ready ? (row.proposed || {
    address: row.research.output.address,
    locality: row.research.output.locality || row.location.locality,
    region: row.research.output.region || row.location.region,
    postal_code: row.research.output.postal_code || row.location.postal_code,
    country_code: row.research.output.country_code || row.location.country_code,
    country_name: row.location.country_name,
    website: row.location.website || row.research.output.official_website || null,
    latitude: row.geocode.latitude,
    longitude: row.geocode.longitude,
  }) : null;
  return {
    ...row,
    evidence_validation: evidence,
    geocode_validation: geocodeValidation,
    decision: ready ? "ready" : "unresolved",
    reason: ready
      ? "official_web_evidence_and_geocode_match"
      : firstReason(row.research.output, evidence, geocodeValidation, row.research),
    proposed,
  };
}

function parseJsonObject(raw) {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw || "").trim();
  const candidates = [
    text,
    text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next representation.
    }
  }
  return {};
}

function normalizeCitations(annotations) {
  return (Array.isArray(annotations) ? annotations : []).map((annotation) => {
    const citation = annotation?.url_citation || annotation;
    return {
      url: httpUrl(citation?.url),
      title: clean(citation?.title),
      content: clean(citation?.content),
    };
  }).filter((citation) => citation.url);
}

function citationContainsAddress(citation, output) {
  const content = normalizeText(`${citation.title || ""} ${citation.content || ""}`);
  const addressTokens = meaningfulTokens(output.address);
  const postalTokens = meaningfulTokens(output.postal_code);
  const localityTokens = meaningfulTokens(output.locality);
  const addressMatches = overlapRatio(addressTokens, new Set(content.split(" "))) >= 0.55;
  const postalMatches = postalTokens.length === 0 || postalTokens.some((token) => content.includes(token));
  const localityMatches = localityTokens.length === 0 || localityTokens.some((token) => content.includes(token));
  return addressTokens.length >= 2 && addressMatches && postalMatches && localityMatches;
}

function meaningfulTokens(value) {
  const stop = new Set(["and", "at", "building", "clinic", "floor", "road", "rd", "street", "st", "suite", "the", "unit"]);
  return [...new Set(normalizeText(value).split(" ").filter((token) => (
    token.length >= 3 && !stop.has(token)
  )))];
}

function overlapRatio(expected, actual) {
  if (!expected.length) return 0;
  return expected.filter((token) => actual.has(token)).length / expected.length;
}

function placeMatches(expected, candidates) {
  const tokens = meaningfulTokens(expected);
  if (!tokens.length) return true;
  const haystack = normalizeText(candidates.filter(Boolean).join(" "));
  return tokens.some((token) => haystack.includes(token));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function emptyGeocode(reason, geocodeQuery = null, candidates = []) {
  return {
    provider: "arcgis_world_geocoder",
    query: geocodeQuery,
    latitude: null,
    longitude: null,
    score: null,
    matched_address: null,
    address_type: null,
    city: null,
    region: null,
    postal_code: null,
    country: null,
    country_code: null,
    old_coordinate_distance_km: null,
    candidates,
    reason,
  };
}

function firstReason(output, evidence, geocode, research) {
  if (research.error) return "research_error";
  if (!output.address) return `address_${output.status}`;
  if (!evidence.valid) return evidence.reason;
  if (!geocode.valid) return geocode.reason;
  return "unresolved";
}

function uniqueParts(values) {
  const output = [];
  const seen = new Set();
  for (const value of values) {
    const part = clean(value);
    const key = normalizeText(part);
    if (part && !seen.has(key)) {
      seen.add(key);
      output.push(part);
    }
  }
  return output;
}

function clean(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function httpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function officialSourceMatches(source, suppliedWebsite, discoveredWebsite) {
  const sourceHost = hostname(source);
  if (!sourceHost) return false;
  const trustedHosts = [suppliedWebsite, discoveredWebsite].map(hostname).filter(Boolean);
  return trustedHosts.some((trusted) => (
    sourceHost === trusted
    || sourceHost.endsWith(`.${trusted}`)
    || trusted.endsWith(`.${sourceHost}`)
  ));
}

function hostname(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeCountryCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sumCost(results) {
  return Number(results.reduce((sum, row) => (
    sum + Number(row?.research?.usage?.cost || 0)
  ), 0).toFixed(6));
}

async function concurrentMap(items, concurrency, operation) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await operation(item);
    }
  });
  await Promise.all(workers);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const parsed = {
    apply: false,
    resume: false,
    limit: null,
    onlyId: null,
    output: DEFAULT_OUTPUT,
    concurrency: 20,
    model: DEFAULT_MODEL,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") parsed.apply = true;
    else if (arg === "--resume") parsed.resume = true;
    else if (arg === "--limit") parsed.limit = positiveInteger(argv[++index], "--limit");
    else if (arg === "--only-id") parsed.onlyId = positiveInteger(argv[++index], "--only-id");
    else if (arg === "--concurrency") parsed.concurrency = positiveInteger(argv[++index], "--concurrency");
    else if (arg === "--output") parsed.output = argv[++index];
    else if (arg === "--model") parsed.model = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function positiveInteger(value, label) {
  const number = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer.`);
  return number;
}
