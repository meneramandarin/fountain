#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, readFileSync } from "node:fs";
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
const concurrency = Math.max(1, Number.parseInt(options.concurrency || "3", 10));
const model = options.model || "openai/gpt-4o-mini";
const apiUrl = options.apiUrl || "https://openrouter.ai/api/v1/chat/completions";
const maxWebsiteChars = Number.parseInt(options.maxWebsiteChars || "10000", 10);
const maxPayloadChars = Number.parseInt(options.maxPayloadChars || "3500", 10);

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

const client = new Client({ connectionString });
await client.connect();
try {
  const rows = await loadRows();
  console.log(`B3 worker_start rows=${rows.length} model=${model} concurrency=${concurrency}`);
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      await processRow(row);
    }
  });
  await Promise.all(workers);
  await printReport();
} finally {
  await client.end();
}

async function loadRows() {
  const result = await client.query(
    `
    SELECT q.*,
           l.org_id, l.email, l.country_name, l.is_virtual, l.data_origin, l.verification_status,
           sl.payload AS source_payload,
           ts.response_summary AS text_search_summary,
           pd.response_summary AS place_details_summary,
           epm.raw_json AS external_place_raw_json,
           epm.display_name AS external_place_display_name,
           epm.rating AS external_place_rating,
           epm.review_count AS external_place_review_count,
           epm.match_confidence AS external_place_match_confidence,
           epm.fetched_at AS external_place_fetched_at
    FROM fountain_raw.hyperbaric_cleanup_queue_20260711 q
    JOIN fountain.locations l ON l.id=q.location_id
    LEFT JOIN fountain_raw.source_listings sl
      ON sl.source_slug='hyperbaric_app'
     AND sl.source_listing_id=q.source_listing_id
    LEFT JOIN LATERAL (
      SELECT response_summary
      FROM fountain_raw.hyperbaric_cleanup_call_ledger_20260711
      WHERE location_id=q.location_id AND call_type='text_search'
      ORDER BY created_at DESC
      LIMIT 1
    ) ts ON true
    LEFT JOIN LATERAL (
      SELECT response_summary
      FROM fountain_raw.hyperbaric_cleanup_call_ledger_20260711
      WHERE location_id=q.location_id AND call_type='place_details'
      ORDER BY created_at DESC
      LIMIT 1
    ) pd ON true
    LEFT JOIN fountain.external_place_matches epm
      ON epm.location_id=q.location_id
     AND epm.provider='google_places'
    WHERE q.status='awaiting_llm_key'
      AND q.slug <> $1
      AND NOT EXISTS (
        SELECT 1 FROM fountain_raw.hyperbaric_cleanup_results_20260711 r WHERE r.location_id=q.location_id
      )
    ORDER BY q.location_id
    ${limit > 0 ? `LIMIT ${limit}` : ""}
    `,
    [LOCKED_SLUG],
  );
  return result.rows;
}

async function processRow(row) {
  const websitePages = await loadWebsiteText(row.location_id);
  const input = buildInput(row, websitePages);
  const startedAt = Date.now();
  let status = "ok";
  let httpStatus = null;
  let errorMessage = null;
  let responseSummary = null;
  let resultJson = null;

  try {
    const response = await callLlm(input);
    httpStatus = response.httpStatus;
    resultJson = response.resultJson;
    responseSummary = {
      model: response.model,
      usage: response.usage || null,
      elapsed_ms: Date.now() - startedAt,
      legitimacy: resultJson.legitimacy || null,
      confidence: resultJson.confidence || null,
    };
  } catch (error) {
    status = "error";
    errorMessage = error.message;
    responseSummary = { elapsed_ms: Date.now() - startedAt };
  }

  await client.query("BEGIN");
  try {
    await setActor();
    await client.query(
      `
      INSERT INTO fountain_raw.hyperbaric_cleanup_call_ledger_20260711 (
        location_id, call_type, provider, request_fingerprint, status, http_status, error_message, response_summary
      )
      VALUES ($1,'llm_classification','openrouter',$2,$3,$4,$5,$6::jsonb)
      `,
      [row.location_id, model, status, httpStatus, errorMessage, JSON.stringify(responseSummary)],
    );
    if (status === "ok") {
      await client.query(
        `
        INSERT INTO fountain_raw.hyperbaric_cleanup_results_20260711 (
          location_id, legitimacy, confidence, result_json
        )
        VALUES ($1,$2,$3,$4::jsonb)
        ON CONFLICT (location_id) DO UPDATE
        SET legitimacy=EXCLUDED.legitimacy,
            confidence=EXCLUDED.confidence,
            result_json=EXCLUDED.result_json,
            created_at=now()
        `,
        [row.location_id, resultJson.legitimacy || null, resultJson.confidence || null, JSON.stringify(resultJson)],
      );
      await client.query(
        `UPDATE fountain_raw.hyperbaric_cleanup_queue_20260711 SET status='complete', error_message=NULL, updated_at=now(), processed_at=now() WHERE location_id=$1`,
        [row.location_id],
      );
    } else {
      await client.query(
        `UPDATE fountain_raw.hyperbaric_cleanup_queue_20260711 SET status='awaiting_llm_key', error_message=$2, updated_at=now() WHERE location_id=$1`,
        [row.location_id, `llm_classification: ${errorMessage}`],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  console.log(JSON.stringify({ location_id: row.location_id, status, legitimacy: resultJson?.legitimacy || null, confidence: resultJson?.confidence || null }));
}

async function callLlm(input) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${llmKey}`,
      "content-type": "application/json",
      "http-referer": "https://fountain.local",
      "x-title": "Fountain Hyperbaric Cleanup B3",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You classify hyperbaric therapy directory listings using only supplied evidence. Return strict JSON only. Do not invent facts. Thin evidence or uncertainty must be review with medium or low confidence.",
        },
        {
          role: "user",
          content: buildPrompt(input),
        },
      ],
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`LLM HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
  }
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`LLM response not JSON envelope: ${bodyText.slice(0, 500)}`);
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`LLM missing content: ${JSON.stringify(body).slice(0, 500)}`);
  let resultJson;
  try {
    resultJson = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`LLM content not JSON: ${content.slice(0, 500)}`);
    resultJson = JSON.parse(match[0]);
  }
  return { httpStatus: response.status, resultJson: normalizeResult(resultJson), model: body.model || model, usage: body.usage || null };
}

function normalizeResult(result) {
  const allowedLegitimacy = new Set(["keep", "keep_medical", "suppress_institutional", "suppress_not_a_clinic", "suppress_dead", "review"]);
  const allowedConfidence = new Set(["high", "medium", "low"]);
  const normalized = {
    legitimacy: allowedLegitimacy.has(result.legitimacy) ? result.legitimacy : "review",
    confidence: allowedConfidence.has(result.confidence) ? result.confidence : "low",
    evidence: Array.isArray(result.evidence) ? result.evidence.map((item) => String(item)).slice(0, 12) : [],
    address_verdict: ["confirmed", "corrected", "unverifiable"].includes(result.address_verdict) ? result.address_verdict : "unverifiable",
    address_corrected: result.address_corrected && typeof result.address_corrected === "object" ? result.address_corrected : null,
    phone_verdict: ["confirmed", "corrected", "unverifiable"].includes(result.phone_verdict) ? result.phone_verdict : "unverifiable",
    phone_corrected: result.phone_corrected && typeof result.phone_corrected === "object" ? result.phone_corrected : null,
    website_verdict: ["confirmed", "corrected", "unverifiable"].includes(result.website_verdict) ? result.website_verdict : "unverifiable",
    website_corrected: result.website_corrected && typeof result.website_corrected === "object" ? result.website_corrected : null,
    price: result.price && typeof result.price === "object" ? result.price : null,
  };
  if (!normalized.evidence.length) {
    normalized.legitimacy = "review";
    normalized.confidence = "low";
    normalized.evidence = ["No specific evidence was returned by the classifier."];
  }
  return normalized;
}

function buildPrompt(input) {
  return `Classify this hyperbaric directory location.

Required JSON shape:
{
  "legitimacy": "keep|keep_medical|suppress_institutional|suppress_not_a_clinic|suppress_dead|review",
  "confidence": "high|medium|low",
  "evidence": ["specific observed signals only"],
  "address_verdict": "confirmed|corrected|unverifiable",
  "address_corrected": object|null,
  "phone_verdict": "confirmed|corrected|unverifiable",
  "phone_corrected": object|null,
  "website_verdict": "confirmed|corrected|unverifiable",
  "website_corrected": object|null,
  "price": {"amount": number|null, "currency": string|null, "unit": string|null, "raw_text": string, "source_url": string|null} | {"ambiguous_raw_text": string} | null
}

Classification rules:
- keep: clear standalone clinic/wellness provider offering hyperbaric oxygen therapy.
- keep_medical: hospital, wound care center, medical department, or physician clinic where HBOT appears legitimate.
- suppress_institutional: broad hospital/university/government/institution page that is not a clinic listing users should book directly.
- suppress_not_a_clinic: manufacturer, directory, chamber seller, unrelated business, or no clinic/service evidence.
- suppress_dead: website is dead/blocked/redirected and cached source/Places evidence is too thin to keep.
- review: conflicting, thin, stale, or uncertain evidence.
- Prefer review on thin evidence. Do not infer a price unless explicit price text is present.

INPUT JSON:
${JSON.stringify(input, null, 2)}`;
}

function buildInput(row, websitePages) {
  return {
    location_id: row.location_id,
    our_serving_row: {
      name: row.name,
      slug: row.slug,
      address: row.address,
      locality: row.locality,
      region: row.region,
      postal_code: row.postal_code,
      country_code: row.country_code,
      country_name: row.country_name,
      latitude: row.latitude,
      longitude: row.longitude,
      phone: row.phone,
      email: row.email,
      website: row.website,
      website_outcome: row.website_outcome,
      verification_status: row.verification_status,
      is_virtual: row.is_virtual,
    },
    google_places_cached: {
      text_search_summary: row.text_search_summary || null,
      place_details_summary: row.place_details_summary || null,
      external_place_match: row.external_place_raw_json
        ? {
            display_name: row.external_place_display_name,
            rating: row.external_place_rating,
            review_count: row.external_place_review_count,
            match_confidence: row.external_place_match_confidence,
            fetched_at: row.external_place_fetched_at,
            raw_json: truncateJson(row.external_place_raw_json, maxPayloadChars),
          }
        : null,
      limitation: "Full Google Details JSON is only present when an external_place_matches.raw_json row already existed/was inserted; otherwise only call ledger summaries are cached.",
    },
    hyperbaric_app_cached_listing: truncateJson(row.source_payload || null, maxPayloadChars),
    cached_website_pages: websitePages,
  };
}

async function loadWebsiteText(locationId) {
  const result = await client.query(
    `
    SELECT requested_url, final_url, page_role, outcome, title, text_path
    FROM fountain_raw.hyperbaric_cleanup_website_fetches_20260711
    WHERE location_id=$1
    ORDER BY id
    LIMIT 3
    `,
    [locationId],
  );
  let remaining = maxWebsiteChars;
  const pages = [];
  for (const row of result.rows) {
    let text = "";
    if (row.text_path && remaining > 0) {
      const resolved = path.resolve(ROOT, row.text_path);
      if (resolved.startsWith(CACHE_ROOT) && existsSync(resolved)) {
        text = readFileSync(resolved, "utf8").slice(0, remaining);
        remaining -= text.length;
      }
    }
    pages.push({
      requested_url: row.requested_url,
      final_url: row.final_url,
      page_role: row.page_role,
      outcome: row.outcome,
      title: row.title,
      text,
    });
  }
  return pages;
}

async function setActor() {
  await client.query("SELECT fountain.set_mutation_actor($1::uuid, $2)", [ACTOR_ID, ACTOR_LABEL]);
}

async function printReport() {
  const queries = {
    queue_counts: `SELECT status, count(*)::int AS count FROM fountain_raw.hyperbaric_cleanup_queue_20260711 GROUP BY status ORDER BY status`,
    llm_call_counts: `SELECT call_type,status,count(*)::int AS count FROM fountain_raw.hyperbaric_cleanup_call_ledger_20260711 WHERE call_type='llm_classification' GROUP BY call_type,status ORDER BY status`,
    legitimacy_distribution: `SELECT legitimacy, confidence, count(*)::int AS count FROM fountain_raw.hyperbaric_cleanup_results_20260711 GROUP BY legitimacy, confidence ORDER BY legitimacy, confidence`,
  };
  for (const [name, sql] of Object.entries(queries)) {
    const result = await client.query(sql);
    console.log(`REPORT ${name}`);
    console.table(result.rows);
  }
}

function truncateJson(value, maxChars) {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value);
  if (text.length <= maxChars) return value;
  return { truncated: true, text: text.slice(0, maxChars) };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--limit") parsed.limit = args[++index];
    else if (arg.startsWith("--limit=")) parsed.limit = arg.slice("--limit=".length);
    else if (arg === "--concurrency") parsed.concurrency = args[++index];
    else if (arg.startsWith("--concurrency=")) parsed.concurrency = arg.slice("--concurrency=".length);
    else if (arg === "--model") parsed.model = args[++index];
    else if (arg.startsWith("--model=")) parsed.model = arg.slice("--model=".length);
    else if (arg === "--api-url") parsed.apiUrl = args[++index];
    else if (arg.startsWith("--api-url=")) parsed.apiUrl = arg.slice("--api-url=".length);
    else if (arg === "--max-website-chars") parsed.maxWebsiteChars = args[++index];
    else if (arg.startsWith("--max-website-chars=")) parsed.maxWebsiteChars = arg.slice("--max-website-chars=".length);
    else if (arg === "--max-payload-chars") parsed.maxPayloadChars = args[++index];
    else if (arg.startsWith("--max-payload-chars=")) parsed.maxPayloadChars = arg.slice("--max-payload-chars=".length);
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
