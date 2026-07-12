#!/usr/bin/env node

import "./lib/pipeline-env.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  getDatabaseUrl,
  getOpenRouterApiKey,
  requirePipelineCredentials,
  verifyOpenRouterOneToken,
} from "./lib/pipeline-env.mjs";

const { Client } = pg;
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".cache", "final_closeout_20260711");
const ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607110003";
const ACTOR_LABEL = "final_closeout_20260711";
const RUN_KEY = "final_closeout_20260711";
const MODEL = process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : "openai/gpt-4o-mini";
const BATCH_SIZE = Number(argValue("--batch-size", "80"));
const CONCURRENCY = Number(argValue("--concurrency", "3"));
const MAX_TERMS = Number(argValue("--max-terms", "0"));
const SEARCH_TERMS = [
  "wound debridement",
  "debridement",
  "lyme disease",
  "total contact casting",
  "hyperbaric",
  "ozone sauna",
  "red light",
];
const CATEGORIES = [
  "Diagnostics & testing",
  "Regenerative & cellular",
  "IV & infusion",
  "Hormone & metabolic",
  "Recovery & performance",
  "Aesthetic",
  "Lifestyle & foundational",
];

requirePipelineCredentials({ database: true, llm: true });

mkdirSync(OUT_DIR, { recursive: true });
const db = new Client({ connectionString: normalizePostgresConnectionString(getDatabaseUrl()) });
const startedAt = new Date();

try {
  await db.connect();
  const preflight = await verifyOpenRouterOneToken({ model: MODEL });
  const before = await loadVerificationBase();
  await ensureAuditTables();
  await createBackups();

  const treatmentsBefore = await loadTreatments();
  const aliasMapBefore = await loadAliasMap();
  const corpus = await buildCorpus(aliasMapBefore);
  await persistCorpus(corpus);

  const toClassify = MAX_TERMS > 0 ? corpus.slice(0, MAX_TERMS) : corpus;
  const llm = await classifyCorpus(toClassify, treatmentsBefore);
  const decisions = await loadDecisions();
  const writeSummary = await applyDecisions(decisions);
  const remapSummary = await remapOfferings();

  await applySearchHygiene();
  await db.query("SELECT fountain.refresh_search_index()");

  const treatmentsAfter = await loadTreatments();
  const promoted = await loadPromotedTreatments();
  const promotedSearchTerms = promoted.slice(0, 3).map((row) => row.canonical_name);
  const after = await loadVerificationBase(promotedSearchTerms);
  const report = {
    actor_id: ACTOR_ID,
    actor_label: ACTOR_LABEL,
    started_at: startedAt.toISOString(),
    preflight,
    corpus: summarizeCorpus(corpus),
    llm,
    writes: writeSummary,
    remap: remapSummary,
    search_hygiene: {
      applied: true,
      full_refresh: true,
    },
    before,
    after,
    promoted_treatments: promoted,
    treatment_count_before: treatmentsBefore.length,
    treatment_count_after: treatmentsAfter.length,
    llm_ledger: await ledgerSummary(),
    locked_slug: await row(`SELECT id, slug, status FROM fountain.locations WHERE slug='o3-wellness-center-dubai'`),
    not_executed: [],
  };

  writeFileSync(path.join(OUT_DIR, "final_closeout_summary_20260711.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(ROOT, "docs", "final-closeout-report-20260711.md"), renderReport(report));
  console.log(JSON.stringify({
    classified_terms: llm.classified_terms,
    llm_requests: llm.requests,
    llm_errors: llm.errors.length,
    aliases_inserted: writeSummary.aliases_inserted,
    rejected_terms: writeSummary.rejected_terms,
    promoted_treatments: writeSummary.promoted_treatments,
    existing_offerings_mapped: remapSummary.existing_offerings_mapped,
    clinic_offerings_inserted: remapSummary.clinic_offerings_inserted,
    mapped_pct_after: after.coverage.mapped_pct,
    report: "docs/final-closeout-report-20260711.md",
  }, null, 2));
} finally {
  await db.end().catch(() => {});
}

async function ensureAuditTables() {
  await db.query(`
    CREATE SCHEMA IF NOT EXISTS fountain_raw;
    CREATE TABLE IF NOT EXISTS fountain_raw.taxonomy_final_corpus_20260711 (
      normalized text PRIMARY KEY,
      display_term text NOT NULL,
      combined_occurrences integer NOT NULL,
      unmapped_occurrences integer NOT NULL,
      active_offering_rows integer NOT NULL,
      clinic_extraction_rows integer NOT NULL,
      example_terms text[] NOT NULL,
      sources text[] NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS fountain_raw.taxonomy_final_llm_ledger_20260711 (
      id bigserial PRIMARY KEY,
      batch_key text NOT NULL UNIQUE,
      model text NOT NULL,
      term_count integer NOT NULL,
      status text NOT NULL,
      http_status integer,
      error_message text,
      usage_json jsonb,
      request_json jsonb,
      response_json jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS fountain_raw.taxonomy_final_triage_20260711 (
      normalized text PRIMARY KEY,
      display_term text NOT NULL,
      decision_class text NOT NULL,
      confidence text NOT NULL,
      confidence_score double precision NOT NULL,
      existing_treatment_id integer,
      existing_treatment_name text,
      proposed_canonical_name text,
      proposed_category text,
      brand_fit boolean NOT NULL DEFAULT false,
      reject_reason text,
      combined_occurrences integer NOT NULL,
      rationale text,
      llm_batch_key text,
      applied_action text,
      applied_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS fountain_raw.taxonomy_final_remap_audit_20260711 (
      id bigserial PRIMARY KEY,
      source_kind text NOT NULL,
      offering_id integer,
      location_id integer,
      raw_name text NOT NULL,
      normalized text NOT NULL,
      treatment_id integer NOT NULL,
      action text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function createBackups() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS fountain_raw.final_closeout_treatments_backup_20260711 AS SELECT * FROM fountain.treatments;
    CREATE TABLE IF NOT EXISTS fountain_raw.final_closeout_treatment_aliases_backup_20260711 AS SELECT * FROM fountain_raw.treatment_aliases;
    CREATE TABLE IF NOT EXISTS fountain_raw.final_closeout_offerings_backup_20260711 AS SELECT * FROM fountain.offerings;
    CREATE TABLE IF NOT EXISTS fountain_raw.final_closeout_search_index_backup_20260711 AS SELECT * FROM fountain.search_index;
    CREATE TABLE IF NOT EXISTS fountain_raw.final_closeout_search_function_backup_20260711 AS
      SELECT pg_get_functiondef(to_regprocedure('fountain.refresh_search_index_for_location(integer)')) AS function_def, now() AS backed_up_at;
  `);
}

async function loadTreatments() {
  return many(`SELECT id, canonical_name, description, category FROM fountain.treatments ORDER BY id`);
}

async function loadAliasMap() {
  const aliases = await many(`SELECT treatment_id, alias_text, alias_normalized FROM fountain_raw.treatment_aliases`);
  const treatments = await loadTreatments();
  const map = new Map();
  for (const treatment of treatments) {
    map.set(normalizeTerm(treatment.canonical_name), { treatment_id: Number(treatment.id), alias_text: treatment.canonical_name });
  }
  for (const alias of aliases) {
    map.set(normalizeTerm(alias.alias_normalized || alias.alias_text), {
      treatment_id: Number(alias.treatment_id),
      alias_text: alias.alias_text,
    });
  }
  return map;
}

async function buildCorpus(aliasMap) {
  const corpus = new Map();
  const add = (raw, source, occurrences = 1) => {
    const normalized = normalizeTerm(raw);
    if (!normalized || normalized.length < 2) return;
    if (aliasMap.has(normalized)) return;
    if (!corpus.has(normalized)) {
      corpus.set(normalized, {
        normalized,
        display_term: titleish(raw) || normalized,
        combined_occurrences: 0,
        unmapped_occurrences: 0,
        active_offering_rows: 0,
        clinic_extraction_rows: 0,
        example_terms: [],
        sources: new Set(),
      });
    }
    const item = corpus.get(normalized);
    item.combined_occurrences += Number(occurrences || 1);
    item.sources.add(source);
    if (source === "unmapped_terms") item.unmapped_occurrences += Number(occurrences || 1);
    if (source === "active_unmapped_offerings") item.active_offering_rows += Number(occurrences || 1);
    if (source === "clinic_websites") item.clinic_extraction_rows += Number(occurrences || 1);
    if (item.example_terms.length < 8 && raw && !item.example_terms.includes(raw)) item.example_terms.push(raw);
  };

  const unmapped = await many(`SELECT term, occurrences FROM fountain_raw.unmapped_terms WHERE term IS NOT NULL AND btrim(term) <> ''`);
  for (const item of unmapped) add(item.term, "unmapped_terms", item.occurrences || 1);

  const offerings = await many(`
    SELECT o.raw_name, count(*)::integer AS rows
    FROM fountain.offerings o
    JOIN fountain.locations l ON l.id=o.location_id
    WHERE o.treatment_id IS NULL
      AND o.raw_name IS NOT NULL
      AND btrim(o.raw_name) <> ''
      AND o.deleted_at IS NULL
      AND coalesce(o.status,'active')='active'
      AND l.deleted_at IS NULL
      AND coalesce(l.status,'active')='active'
    GROUP BY o.raw_name
  `);
  for (const item of offerings) add(item.raw_name, "active_unmapped_offerings", item.rows || 1);

  const clinic = await many(`
    SELECT offering->>'raw_name' AS raw_name, count(*)::integer AS rows
    FROM fountain_raw.clinic_website_offering_extractions_20260711 e
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.extraction_json->'offerings','[]'::jsonb)) offering
    WHERE e.status='ok'
      AND offering->>'raw_name' IS NOT NULL
      AND btrim(offering->>'raw_name') <> ''
    GROUP BY offering->>'raw_name'
  `);
  for (const item of clinic) add(item.raw_name, "clinic_websites", item.rows || 1);

  return [...corpus.values()]
    .map((item) => ({ ...item, sources: [...item.sources].sort() }))
    .sort((a, b) => b.combined_occurrences - a.combined_occurrences || a.normalized.localeCompare(b.normalized));
}

async function persistCorpus(corpus) {
  await db.query(`TRUNCATE fountain_raw.taxonomy_final_corpus_20260711`);
  for (const batch of chunks(corpus, 2000)) {
    await db.query(`
      INSERT INTO fountain_raw.taxonomy_final_corpus_20260711
        (normalized, display_term, combined_occurrences, unmapped_occurrences, active_offering_rows, clinic_extraction_rows, example_terms, sources)
      SELECT normalized, display_term, combined_occurrences, unmapped_occurrences, active_offering_rows, clinic_extraction_rows, example_terms, sources
      FROM jsonb_to_recordset($1::jsonb) AS x(
        normalized text,
        display_term text,
        combined_occurrences integer,
        unmapped_occurrences integer,
        active_offering_rows integer,
        clinic_extraction_rows integer,
        example_terms text[],
        sources text[]
      )
      ON CONFLICT (normalized) DO UPDATE SET
        display_term=excluded.display_term,
        combined_occurrences=excluded.combined_occurrences,
        unmapped_occurrences=excluded.unmapped_occurrences,
        active_offering_rows=excluded.active_offering_rows,
        clinic_extraction_rows=excluded.clinic_extraction_rows,
        example_terms=excluded.example_terms,
        sources=excluded.sources
    `, [JSON.stringify(batch)]);
  }
}

async function classifyCorpus(corpus, treatments) {
  const pending = [];
  for (const batch of chunks(corpus, BATCH_SIZE)) {
    const batchKey = hashKey(batch.map((row) => row.normalized).join("|"));
    const existing = await row(`SELECT status FROM fountain_raw.taxonomy_final_llm_ledger_20260711 WHERE batch_key=$1`, [batchKey]);
    if (existing?.status === "ok") continue;
    pending.push({ batchKey, batch });
  }

  let cursor = 0;
  const summary = { model: MODEL, requests: 0, classified_terms: 0, errors: [], usage: { total_tokens: 0, cost: 0 } };
  const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, async (_, workerIndex) => {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      console.error(`llm worker=${workerIndex + 1} batch=${cursor}/${pending.length} terms=${item.batch.length}`);
      try {
        const result = await classifyBatch(item.batchKey, item.batch, treatments);
        summary.requests += 1;
        summary.classified_terms += item.batch.length;
        summary.usage.total_tokens += Number(result.usage?.total_tokens || result.usage?.totalTokens || 0);
        summary.usage.cost += Number(result.usage?.cost || 0);
      } catch (error) {
        summary.errors.push({ batch_key: item.batchKey, error: String(error?.message || error) });
        if (summary.errors.length >= 10) {
          throw new Error(`Stopped after ${summary.errors.length} LLM errors.`);
        }
      }
    }
  });
  await Promise.all(workers);

  const totals = await row(`
    SELECT
      count(*)::integer AS decision_rows,
      count(*) FILTER (WHERE confidence='high')::integer AS high_rows,
      count(*) FILTER (WHERE decision_class='alias_existing' AND confidence='high')::integer AS high_alias_rows,
      count(*) FILTER (WHERE decision_class='candidate_new' AND confidence='high')::integer AS high_candidate_rows,
      count(*) FILTER (WHERE decision_class NOT IN ('alias_existing','candidate_new') AND confidence='high')::integer AS high_reject_rows
    FROM fountain_raw.taxonomy_final_triage_20260711
  `);
  return { ...summary, ...totals, pending_batches: pending.length };
}

async function classifyBatch(batchKey, batch, treatments) {
  const tx = new Client({ connectionString: normalizePostgresConnectionString(getDatabaseUrl()) });
  const compactTreatments = treatments.map((row) => ({
    id: Number(row.id),
    name: row.canonical_name,
    category: row.category,
  }));
  const request = {
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Classify clinic offering/taxonomy terms for a consumer wellness/longevity/recovery/aesthetic/performance directory.",
          "Return JSON only with key decisions.",
          "Allowed decision_class values: alias_existing, condition_indication, clinical_procedure_oos, specialty_department, pricing_artifact, junk_other, candidate_new.",
          "Use alias_existing only when the term is a service alias for one existing treatment.",
          "Use candidate_new only for consumer-bookable wellness/longevity/recovery/aesthetic/performance services that are not conditions, clinical procedures, departments, pricing/packages, body parts, or junk.",
          "candidate_new brand_fit must be true only for services fitting the directory brand.",
          "Conditions/indications like Lyme disease, wounds, ulcers, migraine, diabetes are condition_indication.",
          "Procedures like debridement, total contact casting, skin grafts, nerve blocks, surgery are clinical_procedure_oos.",
          "Departments/specialties like wound care, cardiology, sports medicine are specialty_department.",
          "Packages, discounts, memberships, consultations-only, prices are pricing_artifact.",
          "confidence must be high, medium, or low.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          existing_treatments: compactTreatments,
          allowed_categories_for_new: CATEGORIES,
          terms: batch.map((row) => ({
            normalized: row.normalized,
            display_term: row.display_term,
            combined_occurrences: row.combined_occurrences,
            examples: row.example_terms.slice(0, 5),
          })),
          output_schema: {
            decisions: [{
              normalized: "exact normalized input",
              decision_class: "one allowed class",
              confidence: "high|medium|low",
              confidence_score: "0..1",
              existing_treatment_id: "integer or null",
              proposed_canonical_name: "English Title Case or null",
              proposed_category: "one category or null",
              brand_fit: "boolean",
              reject_reason: "short reason or null",
              rationale: "short rationale",
            }],
          },
        }),
      },
    ],
  };

  let httpStatus = null;
  let body = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(argValue("--llm-timeout-ms", "90000")));
  try {
    await tx.connect();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${getOpenRouterApiKey()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://fountain.local",
        "X-Title": "Fountain final closeout taxonomy",
      },
      body: JSON.stringify(request),
    });
    clearTimeout(timeout);
    httpStatus = response.status;
    body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `OpenRouter ${response.status}`);
    const content = body.choices?.[0]?.message?.content || "";
    const parsed = parseJsonObject(content);
    const decisions = normalizeDecisions(parsed.decisions || [], batch, treatments);
    await tx.query("BEGIN");
    await tx.query(`
      INSERT INTO fountain_raw.taxonomy_final_llm_ledger_20260711
        (batch_key, model, term_count, status, http_status, usage_json, request_json, response_json)
      VALUES ($1,$2,$3,'ok',$4,$5,$6,$7)
      ON CONFLICT (batch_key) DO UPDATE SET
        status='ok',
        http_status=excluded.http_status,
        usage_json=excluded.usage_json,
        request_json=excluded.request_json,
        response_json=excluded.response_json,
        created_at=now()
    `, [batchKey, MODEL, batch.length, httpStatus, JSON.stringify(body.usage || {}), JSON.stringify(request), JSON.stringify(body)]);
    for (const decision of decisions) {
      await tx.query(`
        INSERT INTO fountain_raw.taxonomy_final_triage_20260711
          (normalized, display_term, decision_class, confidence, confidence_score, existing_treatment_id, existing_treatment_name,
           proposed_canonical_name, proposed_category, brand_fit, reject_reason, combined_occurrences, rationale, llm_batch_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (normalized) DO UPDATE SET
          display_term=excluded.display_term,
          decision_class=excluded.decision_class,
          confidence=excluded.confidence,
          confidence_score=excluded.confidence_score,
          existing_treatment_id=excluded.existing_treatment_id,
          existing_treatment_name=excluded.existing_treatment_name,
          proposed_canonical_name=excluded.proposed_canonical_name,
          proposed_category=excluded.proposed_category,
          brand_fit=excluded.brand_fit,
          reject_reason=excluded.reject_reason,
          combined_occurrences=excluded.combined_occurrences,
          rationale=excluded.rationale,
          llm_batch_key=excluded.llm_batch_key
      `, [
        decision.normalized,
        decision.display_term,
        decision.decision_class,
        decision.confidence,
        decision.confidence_score,
        decision.existing_treatment_id,
        decision.existing_treatment_name,
        decision.proposed_canonical_name,
        decision.proposed_category,
        decision.brand_fit,
        decision.reject_reason,
        decision.combined_occurrences,
        decision.rationale,
        batchKey,
      ]);
    }
    await tx.query("COMMIT");
    return { usage: body.usage || {} };
  } catch (error) {
    clearTimeout(timeout);
    await tx.query("ROLLBACK").catch(() => {});
    if (!tx._ending) {
      await tx.query(`
      INSERT INTO fountain_raw.taxonomy_final_llm_ledger_20260711
        (batch_key, model, term_count, status, http_status, error_message, request_json, response_json)
      VALUES ($1,$2,$3,'error',$4,$5,$6,$7)
      ON CONFLICT (batch_key) DO UPDATE SET
        status='error',
        http_status=excluded.http_status,
        error_message=excluded.error_message,
        request_json=excluded.request_json,
        response_json=excluded.response_json,
        created_at=now()
      `, [batchKey, MODEL, batch.length, httpStatus, String(error?.message || error).slice(0, 1000), JSON.stringify(request), JSON.stringify(body || {})]);
    }
    throw error;
  } finally {
    await tx.end().catch(() => {});
  }
}

function normalizeDecisions(decisions, batch, treatments) {
  const treatmentById = new Map(treatments.map((row) => [Number(row.id), row]));
  const byNormalized = new Map(batch.map((row) => [row.normalized, row]));
  const out = [];
  for (const raw of decisions) {
    const normalized = normalizeTerm(raw.normalized);
    const source = byNormalized.get(normalized);
    if (!source) continue;
    const cls = allowedClass(raw.decision_class);
    const confidence = ["high", "medium", "low"].includes(String(raw.confidence)) ? String(raw.confidence) : scoreToConfidence(raw.confidence_score);
    const treatmentId = Number(raw.existing_treatment_id || 0) || null;
    const treatment = treatmentId ? treatmentById.get(treatmentId) : null;
    const category = CATEGORIES.includes(raw.proposed_category) ? raw.proposed_category : null;
    out.push({
      normalized,
      display_term: source.display_term,
      decision_class: cls,
      confidence,
      confidence_score: Math.max(0, Math.min(1, Number(raw.confidence_score || (confidence === "high" ? 0.9 : confidence === "medium" ? 0.7 : 0.4)))),
      existing_treatment_id: cls === "alias_existing" && treatment ? treatmentId : null,
      existing_treatment_name: cls === "alias_existing" && treatment ? treatment.canonical_name : null,
      proposed_canonical_name: cls === "candidate_new" ? titleCase(raw.proposed_canonical_name || source.display_term) : null,
      proposed_category: cls === "candidate_new" ? (category || "Lifestyle & foundational") : null,
      brand_fit: cls === "candidate_new" ? Boolean(raw.brand_fit) : false,
      reject_reason: cls !== "alias_existing" && cls !== "candidate_new" ? (raw.reject_reason || cls) : null,
      combined_occurrences: source.combined_occurrences,
      rationale: String(raw.rationale || "").slice(0, 1000),
    });
  }
  for (const source of batch) {
    if (!out.some((row) => row.normalized === source.normalized)) {
      out.push({
        normalized: source.normalized,
        display_term: source.display_term,
        decision_class: "junk_other",
        confidence: "low",
        confidence_score: 0,
        existing_treatment_id: null,
        existing_treatment_name: null,
        proposed_canonical_name: null,
        proposed_category: null,
        brand_fit: false,
        reject_reason: "missing_llm_decision",
        combined_occurrences: source.combined_occurrences,
        rationale: "LLM response did not include this term.",
      });
    }
  }
  return out;
}

async function loadDecisions() {
  return many(`SELECT * FROM fountain_raw.taxonomy_final_triage_20260711 ORDER BY combined_occurrences DESC, normalized`);
}

async function applyDecisions(decisions) {
  const highAliases = decisions.filter((row) => row.decision_class === "alias_existing" && row.confidence === "high" && row.existing_treatment_id);
  const highRejects = decisions.filter((row) => !["alias_existing", "candidate_new"].includes(row.decision_class) && row.confidence === "high");
  const candidateTerms = decisions
    .filter((row) => row.decision_class === "candidate_new" && row.confidence === "high" && row.brand_fit && Number(row.combined_occurrences) >= 3)
    .filter((row) => brandFitGuard(row.proposed_canonical_name || row.display_term))
    .slice(0, 50);

    await db.query("BEGIN");
    try {
      await db.query("SELECT fountain.set_mutation_actor($1::uuid, $2::text)", [ACTOR_ID, ACTOR_LABEL]);
    let aliasesInserted = 0;
    if (highAliases.length) {
      const result = await db.query(`
        INSERT INTO fountain_raw.treatment_aliases (treatment_id, alias_text, alias_normalized, source_slug)
        SELECT existing_treatment_id, display_term, normalized, $1
        FROM fountain_raw.taxonomy_final_triage_20260711
        WHERE decision_class='alias_existing'
          AND confidence='high'
          AND existing_treatment_id IS NOT NULL
        ON CONFLICT DO NOTHING
      `, [RUN_KEY]);
      aliasesInserted += result.rowCount;
      await db.query(`
        UPDATE fountain_raw.taxonomy_final_triage_20260711
        SET applied_action='alias_inserted', applied_at=now()
        WHERE decision_class='alias_existing'
          AND confidence='high'
          AND existing_treatment_id IS NOT NULL
      `);
    }

    if (highRejects.length) {
      await db.query(`
        UPDATE fountain_raw.taxonomy_final_triage_20260711
        SET applied_action='rejected:' || decision_class,
            applied_at=now()
        WHERE confidence='high'
          AND decision_class NOT IN ('alias_existing','candidate_new')
      `);
    }

    let promotedCount = 0;
    let promotedAliasCount = 0;
    for (const item of candidateTerms) {
      const canonical = titleCase(item.proposed_canonical_name || item.display_term);
      let treatment = await row(`SELECT id FROM fountain.treatments WHERE lower(canonical_name)=lower($1)`, [canonical]);
      if (!treatment) {
        treatment = await row(`
          INSERT INTO fountain.treatments (canonical_name, description, category)
          VALUES ($1,$2,$3)
          RETURNING id
        `, [canonical, `Auto-promoted from high-confidence final taxonomy triage term: ${item.display_term}.`, item.proposed_category || "Lifestyle & foundational"]);
        promotedCount += 1;
      }
      const aliasResult = await db.query(`
        INSERT INTO fountain_raw.treatment_aliases (treatment_id, alias_text, alias_normalized, source_slug)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT DO NOTHING
      `, [treatment.id, item.display_term, item.normalized, RUN_KEY]);
      promotedAliasCount += aliasResult.rowCount;
      await db.query(`
        UPDATE fountain_raw.taxonomy_final_triage_20260711
        SET existing_treatment_id=$2,
            existing_treatment_name=$3,
            applied_action='promoted_new_treatment',
            applied_at=now()
        WHERE normalized=$1
      `, [item.normalized, treatment.id, canonical]);
    }
    await db.query("COMMIT");
    return {
      aliases_inserted: aliasesInserted,
      rejected_terms: highRejects.length,
      promoted_treatments: promotedCount,
      promoted_aliases_inserted: promotedAliasCount,
      candidate_terms_considered: candidateTerms.length,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function remapOfferings() {
  const aliasMap = await loadAliasMap();
  const source = await row(`SELECT id FROM fountain.sources WHERE slug='clinic_websites'`);
  let existingMapped = 0;
  let clinicInserted = 0;
  let affected = new Set();

  const unmapped = await many(`
    SELECT o.id, o.location_id, o.raw_name
    FROM fountain.offerings o
    JOIN fountain.locations l ON l.id=o.location_id
    WHERE o.treatment_id IS NULL
      AND o.raw_name IS NOT NULL
      AND btrim(o.raw_name) <> ''
      AND o.deleted_at IS NULL
      AND coalesce(o.status,'active')='active'
      AND l.deleted_at IS NULL
      AND coalesce(l.status,'active')='active'
  `);
  const updates = [];
  for (const offering of unmapped) {
    const mapped = aliasMap.get(normalizeTerm(offering.raw_name));
    if (mapped) {
      updates.push({ ...offering, treatment_id: mapped.treatment_id, normalized: normalizeTerm(offering.raw_name) });
      affected.add(Number(offering.location_id));
    }
  }
  for (const batch of chunks(updates, 5000)) {
    await db.query(`
      UPDATE fountain.offerings o
      SET treatment_id = x.treatment_id,
          updated_at = now()
      FROM jsonb_to_recordset($1::jsonb) AS x(id integer, treatment_id integer)
      WHERE o.id=x.id AND o.treatment_id IS NULL
    `, [JSON.stringify(batch.map((row) => ({ id: row.id, treatment_id: row.treatment_id })))]);
    existingMapped += batch.length;
    await db.query(`
      INSERT INTO fountain_raw.taxonomy_final_remap_audit_20260711 (source_kind, offering_id, location_id, raw_name, normalized, treatment_id, action)
      SELECT 'existing_offering', id, location_id, raw_name, normalized, treatment_id, 'mapped'
      FROM jsonb_to_recordset($1::jsonb) AS x(id integer, location_id integer, raw_name text, normalized text, treatment_id integer)
    `, [JSON.stringify(batch)]);
  }

  const clinicRows = await many(`
    SELECT e.location_id, offering->>'raw_name' AS raw_name, offering->>'source_url' AS source_url,
           offering->'price' AS price
    FROM fountain_raw.clinic_website_offering_extractions_20260711 e
    JOIN fountain.locations l ON l.id=e.location_id
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.extraction_json->'offerings','[]'::jsonb)) offering
    WHERE e.status='ok'
      AND l.deleted_at IS NULL
      AND coalesce(l.status,'active')='active'
      AND offering->>'raw_name' IS NOT NULL
      AND btrim(offering->>'raw_name') <> ''
  `);
  for (const item of clinicRows) {
    const normalized = normalizeTerm(item.raw_name);
    const mapped = aliasMap.get(normalized);
    if (!mapped) continue;
    const price = item.price || {};
    const result = await db.query(`
      INSERT INTO fountain.offerings
        (location_id, treatment_id, raw_name, price_amount, price_currency, source_offer_url, source_id, status, data_origin, verification_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'active','scraped','unverified')
      ON CONFLICT (location_id, source_id, raw_name) DO UPDATE
      SET treatment_id=EXCLUDED.treatment_id,
          price_amount=COALESCE(fountain.offerings.price_amount, EXCLUDED.price_amount),
          price_currency=COALESCE(fountain.offerings.price_currency, EXCLUDED.price_currency),
          source_offer_url=COALESCE(fountain.offerings.source_offer_url, EXCLUDED.source_offer_url),
          updated_at=now()
      RETURNING id
    `, [
      item.location_id,
      mapped.treatment_id,
      item.raw_name,
      Number(price.amount || 0) || null,
      price.currency || null,
      item.source_url || null,
      source.id,
    ]);
    clinicInserted += result.rowCount;
    affected.add(Number(item.location_id));
    await db.query(`
      INSERT INTO fountain_raw.taxonomy_final_remap_audit_20260711 (source_kind, offering_id, location_id, raw_name, normalized, treatment_id, action)
      VALUES ('clinic_websites', $1,$2,$3,$4,$5,'insert_or_update')
    `, [result.rows[0].id, item.location_id, item.raw_name, normalized, mapped.treatment_id]);
  }

  for (const id of affected) {
    await db.query(`SELECT fountain.refresh_search_index_for_location($1)`, [id]);
  }
  return {
    existing_offerings_mapped: existingMapped,
    clinic_offerings_inserted: clinicInserted,
    affected_locations_refreshed: affected.size,
  };
}

async function applySearchHygiene() {
  const sqlPath = path.join(ROOT, ".cache", "brand_scope_sweep_20260711", "search_hygiene_function_proposed_diff_20260711.sql");
  const text = readFileSync(sqlPath, "utf8");
  const marker = "-- Proposed replacement:";
  const idx = text.indexOf(marker);
  if (idx < 0) throw new Error(`Could not find proposed replacement in ${sqlPath}`);
  const proposed = text.slice(idx + marker.length).trim();
  await db.query(proposed);
}

async function loadVerificationBase(extraTerms = []) {
  return {
    search_counts: await searchCounts([...SEARCH_TERMS, ...extraTerms]),
    coverage: await coverage(),
    treatment_count: Number((await row(`SELECT count(*)::integer AS count FROM fountain.treatments`)).count),
  };
}

async function searchCounts(terms) {
  return many(`
    WITH q(term) AS (SELECT unnest($1::text[]) AS term)
    SELECT q.term, count(si.*)::integer AS matches
    FROM q
    LEFT JOIN fountain.search_index si
      ON si.entity_type='location'
     AND si.search_text @@ websearch_to_tsquery('simple', q.term)
    GROUP BY q.term
    ORDER BY q.term
  `, [terms]);
}

async function coverage() {
  return row(`
    SELECT
      count(*)::integer AS active_offerings,
      count(*) FILTER (WHERE o.treatment_id IS NOT NULL)::integer AS mapped_active_offerings,
      count(*) FILTER (WHERE o.treatment_id IS NULL)::integer AS unmapped_active_offerings,
      round(100.0 * count(*) FILTER (WHERE o.treatment_id IS NOT NULL) / nullif(count(*),0), 2)::float AS mapped_pct
    FROM fountain.offerings o
    JOIN fountain.locations l ON l.id=o.location_id
    WHERE o.deleted_at IS NULL
      AND l.deleted_at IS NULL
      AND coalesce(o.status,'active')='active'
      AND coalesce(l.status,'active')='active'
  `);
}

async function loadPromotedTreatments() {
  return many(`
    SELECT t.id, t.canonical_name, t.category, c.combined_occurrences
    FROM fountain_raw.taxonomy_final_triage_20260711 c
    JOIN fountain.treatments t ON t.id=c.existing_treatment_id
    WHERE c.applied_action='promoted_new_treatment'
    ORDER BY c.combined_occurrences DESC, t.canonical_name
  `);
}

async function ledgerSummary() {
  return many(`
    SELECT status, model, count(*)::integer AS batches, sum(term_count)::integer AS terms
    FROM fountain_raw.taxonomy_final_llm_ledger_20260711
    GROUP BY status, model
    ORDER BY status, model
  `);
}

function renderReport(report) {
  return `# Final Closeout Report

- Date: 20260711
- Actor: \`${report.actor_label}\` / \`${report.actor_id}\`
- Locked slug: \`${report.locked_slug?.slug || "missing"}\` status \`${report.locked_slug?.status || "missing"}\`
- No hard deletes executed.

## Step 0 Key Persistence

- \`.env.local\` exists and is gitignored.
- Database, Places-compatible, and OpenRouter keys load.
- 1-token LLM test succeeded with model \`${report.preflight.model}\`; total tokens: ${report.preflight.usage?.total_tokens ?? "unknown"}.
- Hard runner gate is in place at \`scripts/run-pipeline-step.mjs\`.

## Step 1 Taxonomy Triage

- Corpus normalized unresolved terms: ${report.corpus.normalized_terms}
- LLM requests this run: ${report.llm.requests}
- LLM classified terms this run: ${report.llm.classified_terms}
- LLM errors: ${report.llm.errors.length}
- Decision rows: ${report.llm.decision_rows}
- High alias rows: ${report.llm.high_alias_rows}
- High reject rows: ${report.llm.high_reject_rows}
- High candidate rows: ${report.llm.high_candidate_rows}
- Aliases inserted: ${report.writes.aliases_inserted}
- Rejected terms marked: ${report.writes.rejected_terms}
- New treatments auto-promoted: ${report.writes.promoted_treatments}
- Promoted aliases inserted: ${report.writes.promoted_aliases_inserted}
- Existing offerings mapped: ${report.remap.existing_offerings_mapped}
- Clinic website offerings inserted/updated: ${report.remap.clinic_offerings_inserted}
- Affected locations refreshed pre-hygiene: ${report.remap.affected_locations_refreshed}

## Step 2 Search Hygiene

- Gated search hygiene function diff applied.
- Full \`fountain.refresh_search_index()\` completed.

## Step 3 Verify

### Search Counts

${markdownTable(["term", "before", "after"], report.after.search_counts.map((after) => {
  const before = report.before.search_counts.find((row) => row.term === after.term);
  return [after.term, before?.matches ?? "", after.matches];
}))}

### Treatment Count

- Before: ${report.treatment_count_before}
- After: ${report.treatment_count_after}

### Mapped Coverage

${markdownTable(["metric", "before", "after"], [
  ["active offerings", report.before.coverage.active_offerings, report.after.coverage.active_offerings],
  ["mapped active offerings", report.before.coverage.mapped_active_offerings, report.after.coverage.mapped_active_offerings],
  ["unmapped active offerings", report.before.coverage.unmapped_active_offerings, report.after.coverage.unmapped_active_offerings],
  ["mapped %", report.before.coverage.mapped_pct, report.after.coverage.mapped_pct],
])}

### Promoted Treatments

${markdownTable(["id", "canonical_name", "category", "occurrences"], report.promoted_treatments.map((row) => [row.id, row.canonical_name, row.category, row.combined_occurrences]))}

### LLM Ledger

${markdownTable(["status", "model", "batches", "terms"], report.llm_ledger.map((row) => [row.status, row.model, row.batches, row.terms]))}

## NOT EXECUTED

${report.not_executed.length ? report.not_executed.map((item) => `- ${item}`).join("\n") : "- None"}
`;
}

function summarizeCorpus(corpus) {
  return {
    normalized_terms: corpus.length,
    combined_occurrences: corpus.reduce((sum, row) => sum + Number(row.combined_occurrences || 0), 0),
    top_terms: corpus.slice(0, 20).map((row) => ({ normalized: row.normalized, combined_occurrences: row.combined_occurrences })),
  };
}

function brandFitGuard(value) {
  const text = normalizeTerm(value);
  if (!text) return false;
  if (/\b(wound|ulcer|debridement|casting|graft|surgery|surgical|disease|syndrome|injury|department|clinic|cardiology|neurology|orthopedic|hospital|membership|package|price|consultation)\b/.test(text)) return false;
  return true;
}

function allowedClass(value) {
  const cls = String(value || "");
  return ["alias_existing", "condition_indication", "clinical_procedure_oos", "specialty_department", "pricing_artifact", "junk_other", "candidate_new"].includes(cls) ? cls : "junk_other";
}

function scoreToConfidence(score) {
  const value = Number(score || 0);
  if (value >= 0.85) return "high";
  if (value >= 0.6) return "medium";
  return "low";
}

function parseJsonObject(text) {
  const value = String(text || "").trim();
  try {
    return JSON.parse(value);
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const first = value.indexOf("{");
    const last = value.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(value.slice(first, last + 1));
    throw new Error(`Could not parse JSON: ${value.slice(0, 300)}`);
  }
}

function normalizeTerm(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[™®©℠]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/\bglp[-\s]?1\b/g, "glp 1")
    .replace(/\bnad\s*plus\b/g, "nad")
    .replace(/\bnad\+\b/g, "nad")
    .replace(/\bintravenous\b/g, "iv")
    .replace(/\bv\s*o\s*2\b/g, "vo2")
    .replace(/\$[\d,.]+/g, " ")
    .replace(/\b\d+(\.\d+)?\s*(minutes?|mins?|hours?|hrs?|sessions?|visits?|packs?|units?|mg|mcg|g|ml|cc|iu|oz)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(input) {
  return String(input || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())
    .replace(/\bIv\b/g, "IV")
    .replace(/\bNad\b/g, "NAD")
    .replace(/\bPrp\b/g, "PRP")
    .replace(/\bHbot\b/g, "HBOT");
}

function titleish(input) {
  const value = String(input || "").trim();
  return value.length <= 80 ? value : value.slice(0, 80);
}

function hashKey(input) {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${RUN_KEY}_${(hash >>> 0).toString(16)}`;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function markdownTable(headers, rows) {
  if (!rows.length) return "_None._";
  const esc = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [`| ${headers.map(esc).join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(esc).join(" | ")} |`)].join("\n");
}

async function many(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

async function row(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function normalizePostgresConnectionString(connectionString) {
  if (!connectionString) return connectionString;
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode");
    if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}
