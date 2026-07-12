#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const ACTOR_ID = "7f94c2c4-57dd-4b9a-a905-7083e8d8a4ff";
const ACTOR_LABEL = "hyperbaric_cleanup_v2_20260711";
const LOCKED_SLUG = "o3-wellness-center-dubai";
const CLINIC_SOURCE_SLUG = "clinic_websites";
const CACHE_ROOT = path.join(ROOT, ".cache", "hyperbaric_cleanup_v2");
const options = parseArgs(process.argv.slice(2));
const concurrency = Math.max(1, Number.parseInt(options.concurrency || "4", 10));
const model = options.model || "openai/gpt-4o-mini";
const apiUrl = options.apiUrl || "https://openrouter.ai/api/v1/chat/completions";
const maxWebsiteChars = Number.parseInt(options.maxWebsiteChars || "14000", 10);
const maxTokens = Number.parseInt(options.maxTokens || "4000", 10);

loadEnvFile(path.join(ROOT, ".env.local"));
loadEnvFile(path.join(ROOT, ".env.development.local"));
loadEnvFile(path.join(ROOT, ".env.production.local"));

const connectionString = normalizePostgresConnectionString(
  process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING,
);
const llmKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
if (!connectionString) throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
if (!llmKey) throw new Error("Missing OPENROUTER_API_KEY or OPENAI_API_KEY.");

const startedAt = (await one("SELECT clock_timestamp() AS ts")).ts;
const clinicWebsiteSourceId = await ensureClinicSource();
const mappings = await loadTreatmentMappings();
const rows = await many(`
  SELECT q.location_id, q.source_listing_id, l.name, l.locality, l.country_code, l.website
  FROM fountain_raw.hyperbaric_cleanup_queue_20260711 q
  JOIN fountain.locations l ON l.id=q.location_id
  WHERE l.status='active'
    AND l.slug <> $1
    AND q.website_outcome='ok'
    AND NOT EXISTS (
      SELECT 1
      FROM fountain_raw.clinic_website_offering_extractions_20260711 e
      WHERE e.location_id=q.location_id AND e.status='ok'
    )
  ORDER BY q.location_id
`, [LOCKED_SLUG]);

const summary = {
  startedAt,
  rowsToProcess: rows.length,
  llmCalls: 0,
  llmOk: 0,
  llmErrors: 0,
  rawOfferings: 0,
  cappedLocations: 0,
  offeringsInserted: 0,
  offeringsDeduped: 0,
  unmappedOccurrences: 0,
  sourceRecordsInserted: 0,
  sourceRecordsExisting: 0,
};

let cursor = 0;
const workers = Array.from({ length: concurrency }, async () => {
  while (cursor < rows.length) {
    const row = rows[cursor++];
    await processRow(row);
    if (summary.llmCalls % 25 === 0) {
      console.log(JSON.stringify({ progress: "d3_shortdb", llmCalls: summary.llmCalls, llmOk: summary.llmOk, llmErrors: summary.llmErrors }));
    }
  }
});
await Promise.all(workers);
await printReport();

async function ensureClinicSource() {
  const cacheStat = statSync(CACHE_ROOT);
  await tx(async (client) => {
    await setActor(client);
    await client.query(`
      INSERT INTO fountain.sources (slug, trust_weight)
      VALUES ($1, 1)
      ON CONFLICT (slug) DO UPDATE SET trust_weight=EXCLUDED.trust_weight
    `, [CLINIC_SOURCE_SLUG]);
    await client.query(`
      INSERT INTO fountain_raw.source_databases (
        source_slug, source_db_path, file_size_bytes, file_mtime_ms, file_sha256,
        listing_count, image_count, review_count, field_count, page_count,
        metadata, last_synced_at, sync_status, updated_at
      )
      VALUES ($1,$2,0,$3,NULL,0,0,0,0,0,$4::jsonb,now(),'synced',now())
      ON CONFLICT (source_slug) DO UPDATE
      SET source_db_path=EXCLUDED.source_db_path,
          file_mtime_ms=EXCLUDED.file_mtime_ms,
          metadata=EXCLUDED.metadata,
          last_synced_at=now(),
          sync_status='synced',
          updated_at=now()
    `, [
      CLINIC_SOURCE_SLUG,
      CACHE_ROOT,
      Math.round(cacheStat.mtimeMs),
      JSON.stringify({ phase: ACTOR_LABEL, source: "cached clinic website text", resume: "shortdb" }),
    ]);
  });
  const source = await one(`SELECT id FROM fountain.sources WHERE slug=$1`, [CLINIC_SOURCE_SLUG]);
  return source.id;
}

async function processRow(row) {
  const pages = await loadWebsiteText(row.location_id);
  const started = Date.now();
  let extraction = null;
  let status = "ok";
  let errorMessage = null;
  let httpStatus = null;
  try {
    extraction = await callOfferingLlm(row, pages);
    httpStatus = extraction.httpStatus;
    summary.llmOk += 1;
  } catch (error) {
    status = "error";
    errorMessage = error.message;
    summary.llmErrors += 1;
  }
  summary.llmCalls += 1;
  await logCall(row.location_id, status, httpStatus, errorMessage, {
    elapsed_ms: Date.now() - started,
    model,
    offering_count: extraction?.offerings?.length || 0,
  });
  if (status !== "ok") {
    await upsertExtraction(row, "error", [], false, null, errorMessage, 0);
    return;
  }

  const distinct = dedupeOfferings(extraction.offerings || []);
  const capped = distinct.length > 60;
  const offerings = capped ? distinct.slice(0, 60) : distinct;
  if (capped) summary.cappedLocations += 1;
  summary.rawOfferings += distinct.length;
  await upsertExtraction(row, "ok", offerings, capped, extraction.rawJson, null, distinct.length);
  await insertMappedOfferings(row, offerings);
}

async function loadWebsiteText(locationId) {
  const rows = await many(`
    SELECT requested_url, final_url, page_role, title, text_path
    FROM fountain_raw.hyperbaric_cleanup_website_fetches_20260711
    WHERE location_id=$1 AND outcome='ok'
    ORDER BY id
    LIMIT 3
  `, [locationId]);
  let remaining = maxWebsiteChars;
  const pages = [];
  for (const row of rows) {
    let text = "";
    if (row.text_path && remaining > 0) {
      const resolved = path.resolve(ROOT, row.text_path);
      if (resolved.startsWith(CACHE_ROOT) && existsSync(resolved)) {
        text = readFileSync(resolved, "utf8").slice(0, remaining);
        remaining -= text.length;
      }
    }
    pages.push({ requested_url: row.requested_url, final_url: row.final_url, page_role: row.page_role, title: row.title, text });
  }
  return pages;
}

async function callOfferingLlm(row, pages) {
  const prompt = [
    "Extract clinic website offerings from the supplied website text.",
    "Return strict JSON only: {\"offerings\":[{\"raw_name\":\"...\",\"price\":{\"amount\":number,\"currency\":\"ISO_or_symbol\",\"unit\":\"...\",\"raw_text\":\"...\"}|null,\"source_url\":\"...\"}]}",
    "Include distinct treatments, services, therapies, diagnostics, wellness protocols, and named programs the clinic offers.",
    "Return at most 60 offerings. If there are more than 60, choose the 60 most clinically or commercially specific offerings.",
    "Do not include navigation labels, team names, blog titles, testimonials, generic labels, or duplicates.",
    "Use only observed website text. If price is not explicit, price must be null.",
    `Location: ${row.name || ""} ${row.locality || ""} ${row.country_code || ""}`,
    `Website: ${row.website || ""}`,
    "Pages:",
    JSON.stringify(pages),
  ].join("\n\n");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${llmKey}`,
      "content-type": "application/json",
      "http-referer": "https://fountain.local",
      "x-title": "Fountain Hyperbaric Task D3 Resume",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You extract structured clinic offerings from provided text. Return JSON only and never invent services." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`LLM HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`LLM response envelope not JSON: ${bodyText.slice(0, 500)}`);
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`LLM missing content: ${JSON.stringify(body).slice(0, 500)}`);
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`LLM content not JSON: ${content.slice(0, 500)}`);
    parsed = JSON.parse(match[0]);
  }
  return { httpStatus: response.status, offerings: Array.isArray(parsed.offerings) ? parsed.offerings : [], rawJson: parsed };
}

async function logCall(locationId, status, httpStatus, errorMessage, responseSummary) {
  await tx(async (client) => {
    await setActor(client);
    await client.query(`
      INSERT INTO fountain_raw.hyperbaric_cleanup_call_ledger_20260711 (
        location_id, call_type, provider, request_fingerprint, status, http_status, error_message, response_summary
      )
      VALUES ($1,'d3_llm_offering_extraction','openrouter',$2,$3,$4,$5,$6::jsonb)
    `, [locationId, model, status, httpStatus, errorMessage, JSON.stringify(responseSummary)]);
  });
}

async function upsertExtraction(row, status, offerings, capped, rawJson, errorMessage, rawOfferingCount) {
  await tx(async (client) => {
    await setActor(client);
    await client.query(`
      INSERT INTO fountain_raw.clinic_website_offering_extractions_20260711 (
        location_id, source_listing_id, website, status, raw_offering_count, capped,
        extraction_json, error_message, actor_label
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
      ON CONFLICT (location_id) DO UPDATE
      SET source_listing_id=EXCLUDED.source_listing_id,
          website=EXCLUDED.website,
          status=EXCLUDED.status,
          raw_offering_count=EXCLUDED.raw_offering_count,
          capped=EXCLUDED.capped,
          extraction_json=EXCLUDED.extraction_json,
          error_message=EXCLUDED.error_message,
          processed_at=now(),
          actor_label=EXCLUDED.actor_label
    `, [
      row.location_id,
      row.source_listing_id,
      row.website,
      status,
      rawOfferingCount,
      capped,
      JSON.stringify(rawJson || { offerings }),
      errorMessage,
      ACTOR_LABEL,
    ]);
  });
}

async function insertMappedOfferings(row, offerings) {
  let yieldedMappedOffering = false;
  for (const offering of offerings) {
    const rawName = cleanRawName(offering.raw_name);
    if (!rawName) continue;
    const treatmentId = mappings.get(normalizeTerm(rawName));
    if (!treatmentId) {
      await logUnmappedTerm(rawName);
      summary.unmappedOccurrences += 1;
      continue;
    }
    const price = parseOfferingPrice(offering.price);
    const inserted = await tx(async (client) => {
      await setActor(client);
      const result = await client.query(`
        INSERT INTO fountain.offerings (
          location_id, treatment_id, raw_name, price_amount, price_currency,
          source_offer_url, source_id, status, data_origin, verification_status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,'active','scraped','unverified')
        ON CONFLICT (location_id, source_id, raw_name) DO NOTHING
      `, [
        row.location_id,
        treatmentId,
        rawName,
        price?.amount ?? null,
        price?.currency ?? null,
        offering.source_url || row.website || null,
        clinicWebsiteSourceId,
      ]);
      return result.rowCount;
    });
    if (inserted > 0) summary.offeringsInserted += 1;
    else summary.offeringsDeduped += 1;
    yieldedMappedOffering = true;
  }
  if (yieldedMappedOffering) await linkClinicSourceRecord(row);
}

async function linkClinicSourceRecord(row) {
  const inserted = await tx(async (client) => {
    await setActor(client);
    const result = await client.query(`
      INSERT INTO fountain.source_records (source_id, entity_type, entity_id, source_listing_id, source_url, raw_ref)
      SELECT $1, 'location', $2, $3, $4, $5
      WHERE NOT EXISTS (
        SELECT 1 FROM fountain.source_records
        WHERE source_id=$1 AND entity_type='location' AND entity_id=$2 AND source_listing_id=$3
      )
    `, [clinicWebsiteSourceId, row.location_id, row.location_id, row.website || null, `clinic_website:${row.location_id}`]);
    return result.rowCount;
  });
  if (inserted > 0) summary.sourceRecordsInserted += 1;
  else summary.sourceRecordsExisting += 1;
}

async function logUnmappedTerm(term) {
  await tx(async (client) => {
    await setActor(client);
    await client.query(`
      INSERT INTO fountain_raw.unmapped_terms (term, source_slug, occurrences)
      VALUES ($1,$2,1)
      ON CONFLICT (term, source_slug) DO UPDATE
      SET occurrences=fountain_raw.unmapped_terms.occurrences + 1
    `, [term, CLINIC_SOURCE_SLUG]);
  });
}

async function loadTreatmentMappings() {
  const mappings = new Map();
  const treatments = await many(`SELECT id, canonical_name FROM fountain.treatments`);
  for (const row of treatments) mappings.set(normalizeTerm(row.canonical_name), row.id);
  const aliases = await many(`SELECT treatment_id, alias_text, alias_normalized FROM fountain_raw.treatment_aliases`);
  for (const row of aliases) {
    const normalized = row.alias_normalized || normalizeTerm(row.alias_text);
    if (!mappings.has(normalized)) mappings.set(normalized, row.treatment_id);
  }
  return mappings;
}

async function printReport() {
  const extractionCounts = await many(`
    SELECT status, count(*)::int AS rows, coalesce(sum(raw_offering_count),0)::int AS raw_offerings
    FROM fountain_raw.clinic_website_offering_extractions_20260711
    WHERE actor_label=$1
    GROUP BY 1 ORDER BY 1
  `, [ACTOR_LABEL]);
  const ledgers = await many(`
    SELECT status, count(*)::int AS calls
    FROM fountain_raw.hyperbaric_cleanup_call_ledger_20260711
    WHERE call_type='d3_llm_offering_extraction'
    GROUP BY 1 ORDER BY 1
  `);
  const remaining = await one(`
    SELECT count(*)::int AS remaining_non_ok
    FROM fountain_raw.hyperbaric_cleanup_queue_20260711 q
    JOIN fountain.locations l ON l.id=q.location_id
    LEFT JOIN fountain_raw.clinic_website_offering_extractions_20260711 e
      ON e.location_id=q.location_id AND e.status='ok'
    WHERE l.status='active'
      AND l.slug <> $1
      AND q.website_outcome='ok'
      AND e.location_id IS NULL
  `, [LOCKED_SLUG]);
  console.log(JSON.stringify({ summary, extractionCounts, ledgers, remaining }, null, 2));
}

function dedupeOfferings(offerings) {
  const seen = new Set();
  const out = [];
  for (const offering of offerings) {
    const rawName = cleanRawName(offering?.raw_name);
    if (!rawName) continue;
    const key = normalizeTerm(rawName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ raw_name: rawName, price: offering?.price && typeof offering.price === "object" ? offering.price : null, source_url: offering?.source_url || null });
  }
  return out;
}

function parseOfferingPrice(price) {
  if (!price || typeof price !== "object") return null;
  const amount = Number(price.amount);
  const currency = typeof price.currency === "string" ? normalizeCurrency(price.currency) : "";
  if (!Number.isFinite(amount) || amount <= 0 || !currency) return null;
  return { amount, currency };
}

function normalizeCurrency(currency) {
  const trimmed = currency.trim().toUpperCase();
  const symbols = { "$": "USD", "€": "EUR", "£": "GBP" };
  return symbols[trimmed] || trimmed.slice(0, 3);
}

function cleanRawName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function normalizeTerm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function setActor(client) {
  await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2)", [ACTOR_ID, ACTOR_LABEL]);
}

async function tx(fn) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function one(sql, params = []) {
  const rows = await many(sql, params);
  return rows[0] || null;
}

async function many(sql, params = []) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await client.end().catch(() => {});
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--concurrency") parsed.concurrency = args[++index];
    else if (arg.startsWith("--concurrency=")) parsed.concurrency = arg.slice("--concurrency=".length);
    else if (arg === "--model") parsed.model = args[++index];
    else if (arg.startsWith("--model=")) parsed.model = arg.slice("--model=".length);
    else if (arg === "--api-url") parsed.apiUrl = args[++index];
    else if (arg.startsWith("--api-url=")) parsed.apiUrl = arg.slice("--api-url=".length);
    else if (arg === "--max-website-chars") parsed.maxWebsiteChars = args[++index];
    else if (arg.startsWith("--max-website-chars=")) parsed.maxWebsiteChars = arg.slice("--max-website-chars=".length);
    else if (arg === "--max-tokens") parsed.maxTokens = args[++index];
    else if (arg.startsWith("--max-tokens=")) parsed.maxTokens = arg.slice("--max-tokens=".length);
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
