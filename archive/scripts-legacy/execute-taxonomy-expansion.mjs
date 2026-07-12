#!/usr/bin/env node

import "./lib/pipeline-env.mjs";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const ROOT = process.cwd();
const options = parseArgs(process.argv.slice(2));
const phaseDate = options.phaseDate || "20260710";
const schema = normalizeIdentifier(options.schema || process.env.POSTGRES_SCHEMA || "fountain");
const rawSchema = normalizeIdentifier(options.rawSchema || process.env.POSTGRES_RAW_SCHEMA || "fountain_raw");
const dryRun = Boolean(options.dryRun);
const sourceSlug = `taxonomy_expansion_${phaseDate}`;
const reportJsonPath = path.resolve(ROOT, options.jsonOut || `taxonomy-expansion-report-${phaseDate}${dryRun ? ".dry-run" : ""}.json`);
const reportMdPath = path.resolve(ROOT, options.mdOut || `docs/taxonomy-expansion-report-${phaseDate}${dryRun ? ".dry-run" : ""}.md`);

const corpusTable = `taxonomy_term_corpus_${phaseDate}`;
const auditTable = `taxonomy_mapping_audit_${phaseDate}`;
const proposalTable = `taxonomy_new_treatment_proposals_${phaseDate}`;

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

let db = createDbClient();

try {
  await db.connect();
  const llmAvailable = Boolean(process.env.OPENROUTER_API_KEY);

  const beforeCoverage = await loadCoverage();
  const treatments = await loadTreatments();
  const aliasMap = await loadAliasMap();
  const activeOfferings = await loadActiveUnmappedOfferings();
  const unmappedTerms = await loadUnmappedTerms();

  const corpus = buildCorpus(activeOfferings, unmappedTerms);
  const mapping = classifyCorpus(corpus, treatments, aliasMap);

  await db.end().catch(() => {});
  db = null;

  if (llmAvailable && !options.skipLlm) {
    await runLlmClassification(corpus, treatments, mapping);
  }
  const proposals = buildProposals(corpus, mapping);

  db = createDbClient();
  await db.connect();

  if (!dryRun) {
    await ensureRunTables();
    await replaceCorpusTable(corpus);
    await replaceProposalTable(proposals);
    await applyHighConfidenceMappings(activeOfferings, corpus, mapping);
  }

  const afterCoverage = await loadCoverage();
  const dbRunSummary = dryRun ? emptyDbRunSummary() : await loadDbRunSummary();
  const report = {
    phase_date: phaseDate,
    mode: dryRun ? "dry-run" : "live",
    llm: {
      provider: "OpenRouter",
      available: llmAvailable,
      model: mapping.llm.model,
      classified_terms: mapping.llm.classifiedTerms,
      high_confidence_terms: mapping.llm.highConfidenceTerms,
      medium_confidence_terms: mapping.llm.mediumConfidenceTerms,
      requests: mapping.llm.requests,
      errors: mapping.llm.errors,
      spend_usd: mapping.llm.spendUsd,
      budget_gate_usd: mapping.llm.budgetUsd,
      status: llmAvailable
        ? mapping.llm.status
        : "skipped_missing_OPENROUTER_API_KEY; deterministic phases completed",
    },
    tables: {
      corpus: dryRun ? null : `${rawSchema}.${corpusTable}`,
      audit: dryRun ? null : `${rawSchema}.${auditTable}`,
      proposals: dryRun ? null : `${rawSchema}.${proposalTable}`,
    },
    before: beforeCoverage,
    after: afterCoverage,
    corpus_summary: summarizeCorpus(corpus),
    phase_2: {
      high_confidence_terms: mapping.high.size,
      medium_confidence_terms: mapping.medium.length,
      aliases_inserted: dbRunSummary.aliasesInserted,
      offerings_newly_linked: dbRunSummary.offeringsUpdated,
      top_auto_mappings: topMappingRows(corpus, mapping.high, treatments, 80),
      medium_confidence_review: mapping.medium.slice(0, 120),
    },
    phase_3: {
      proposed_candidates: proposals.filter((row) => row.status === "candidate").length,
      borderline_candidates: proposals.filter((row) => row.status === "borderline").length,
      out_of_scope_groups: proposals.filter((row) => row.status === "out_of_scope").length,
      candidates: proposals.filter((row) => row.status === "candidate"),
      borderline: proposals.filter((row) => row.status === "borderline"),
      out_of_scope: proposals.filter((row) => row.status === "out_of_scope"),
    },
    guardrails: [
      "No rows were inserted into fountain.treatments.",
      "Medium-confidence mappings were not applied to offerings.",
      "Candidate new treatments were written only to the raw proposal table.",
      "High-confidence writes were limited to treatment_aliases inserts and offerings.treatment_id updates.",
    ],
  };

  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, renderMarkdown(report));
  console.log(JSON.stringify({
    mode: report.mode,
    corpus_terms: report.corpus_summary.normalized_terms,
    high_confidence_terms: report.phase_2.high_confidence_terms,
    offerings_newly_linked: report.phase_2.offerings_newly_linked,
    aliases_inserted: report.phase_2.aliases_inserted,
    proposed_candidates: report.phase_3.proposed_candidates,
    borderline_candidates: report.phase_3.borderline_candidates,
    out_of_scope_groups: report.phase_3.out_of_scope_groups,
    llm_status: report.llm.status,
    report_md: path.relative(ROOT, reportMdPath),
    report_json: path.relative(ROOT, reportJsonPath),
  }, null, 2));
} finally {
  if (db) {
    await db.end().catch(() => {});
  }
}

async function loadCoverage() {
  const result = await db.query(`
    SELECT
      count(*)::integer AS active_offerings,
      count(*) FILTER (WHERE o.treatment_id IS NOT NULL)::integer AS mapped_active_offerings,
      count(*) FILTER (WHERE o.treatment_id IS NULL)::integer AS unmapped_active_offerings,
      round(100.0 * count(*) FILTER (WHERE o.treatment_id IS NOT NULL) / nullif(count(*), 0), 2)::float AS mapped_pct
    FROM ${quoteIdent(schema)}.offerings o
    JOIN ${quoteIdent(schema)}.locations l ON l.id = o.location_id
    WHERE o.deleted_at IS NULL
      AND l.deleted_at IS NULL
      AND coalesce(o.status, 'active') = 'active'
      AND coalesce(l.status, 'active') = 'active'
  `);
  return result.rows[0];
}

async function loadTreatments() {
  const result = await db.query(`
    SELECT id, canonical_name, description, category
    FROM ${quoteIdent(schema)}.treatments
    ORDER BY id
  `);
  return result.rows;
}

async function loadAliasMap() {
  const result = await db.query(`
    SELECT treatment_id, alias_text, alias_normalized
    FROM ${quoteIdent(rawSchema)}.treatment_aliases
    ORDER BY id
  `);
  const map = new Map();
  for (const row of result.rows) {
    const normalized = normalizeTerm(row.alias_normalized || row.alias_text);
    if (!map.has(normalized)) {
      map.set(normalized, { treatment_id: Number(row.treatment_id), alias_text: row.alias_text });
    }
  }
  return map;
}

async function loadActiveUnmappedOfferings() {
  const result = await db.query(`
    SELECT o.id, o.location_id, o.raw_name
    FROM ${quoteIdent(schema)}.offerings o
    JOIN ${quoteIdent(schema)}.locations l ON l.id = o.location_id
    WHERE o.treatment_id IS NULL
      AND o.raw_name IS NOT NULL
      AND btrim(o.raw_name) <> ''
      AND o.deleted_at IS NULL
      AND l.deleted_at IS NULL
      AND coalesce(o.status, 'active') = 'active'
      AND coalesce(l.status, 'active') = 'active'
    ORDER BY o.id
  `);
  return result.rows;
}

async function loadUnmappedTerms() {
  const result = await db.query(`
    SELECT term, source_slug, occurrences
    FROM ${quoteIdent(rawSchema)}.unmapped_terms
    WHERE term IS NOT NULL
      AND btrim(term) <> ''
  `);
  return result.rows;
}

function buildCorpus(activeOfferings, unmappedTerms) {
  const corpus = new Map();

  for (const offering of activeOfferings) {
    const normalized = normalizeTerm(offering.raw_name);
    if (!normalized) continue;
    const item = ensureCorpusItem(corpus, normalized, offering.raw_name);
    item.terms.add(offering.raw_name.trim());
    item.locationIds.add(Number(offering.location_id));
    item.offeringRows += 1;
    if (item.examples.length < 8 && !item.examples.includes(offering.raw_name)) {
      item.examples.push(offering.raw_name);
    }
    item.sources.add("offerings.raw_name");
  }

  for (const termRow of unmappedTerms) {
    const normalized = normalizeTerm(termRow.term);
    if (!normalized) continue;
    const item = ensureCorpusItem(corpus, normalized, termRow.term);
    item.terms.add(termRow.term.trim());
    item.unmappedOccurrences += Number(termRow.occurrences || 1);
    item.sources.add("fountain_raw.unmapped_terms");
  }

  return [...corpus.values()]
    .map((item) => ({
      term: bestTerm(item),
      normalized: item.normalized,
      location_count: item.locationIds.size,
      offering_rows: item.offeringRows,
      unmapped_occurrences: item.unmappedOccurrences,
      example_raw_names: item.examples,
      sources: [...item.sources].sort(),
      terms: [...item.terms].sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 30),
    }))
    .sort((a, b) => b.location_count - a.location_count || b.unmapped_occurrences - a.unmapped_occurrences || a.normalized.localeCompare(b.normalized));
}

function ensureCorpusItem(corpus, normalized, term) {
  if (!corpus.has(normalized)) {
    corpus.set(normalized, {
      normalized,
      terms: new Set([term.trim()]),
      locationIds: new Set(),
      offeringRows: 0,
      unmappedOccurrences: 0,
      examples: [],
      sources: new Set(),
    });
  }
  return corpus.get(normalized);
}

function bestTerm(item) {
  const terms = [...item.terms].filter(Boolean);
  terms.sort((a, b) => {
    const aTitle = /^[A-Z][A-Za-z0-9+\-\s/()]+$/.test(a) ? 0 : 1;
    const bTitle = /^[A-Z][A-Za-z0-9+\-\s/()]+$/.test(b) ? 0 : 1;
    return aTitle - bTitle || a.length - b.length || a.localeCompare(b);
  });
  return terms[0] || item.normalized;
}

function classifyCorpus(corpus, treatments, aliasMap) {
  const treatmentByName = new Map(treatments.map((t) => [normalizeTerm(t.canonical_name), Number(t.id)]));
  const byId = new Map(treatments.map((t) => [Number(t.id), t]));
  const high = new Map();
  const medium = [];

  for (const row of corpus) {
    const normalized = row.normalized;
    const exactAlias = aliasMap.get(normalized);
    if (exactAlias) {
      high.set(normalized, {
        treatment_id: exactAlias.treatment_id,
        canonical_name: byId.get(exactAlias.treatment_id)?.canonical_name || "",
        method: "exact_alias",
        confidence: 1,
        rule: `alias:${exactAlias.alias_text}`,
      });
      continue;
    }

    const exactCanonical = treatmentByName.get(normalized);
    if (exactCanonical) {
      high.set(normalized, {
        treatment_id: exactCanonical,
        canonical_name: byId.get(exactCanonical)?.canonical_name || "",
        method: "exact_canonical",
        confidence: 1,
        rule: "canonical_name",
      });
      continue;
    }

    const deterministic = deterministicTreatmentMatch(normalized);
    if (deterministic) {
      const treatment = byId.get(deterministic.treatment_id);
      high.set(normalized, {
        ...deterministic,
        canonical_name: treatment?.canonical_name || "",
        method: "deterministic_synonym",
      });
      continue;
    }

    const review = mediumConfidenceTreatmentMatch(normalized);
    if (review) {
      const treatment = byId.get(review.treatment_id);
      medium.push({
        term: row.term,
        normalized,
        proposed_treatment_id: review.treatment_id,
        proposed_treatment: treatment?.canonical_name || "",
        location_count: row.location_count,
        confidence: review.confidence,
        reason: review.rule,
      });
    }
  }

  medium.sort((a, b) => b.location_count - a.location_count || b.confidence - a.confidence || a.normalized.localeCompare(b.normalized));
  return {
    high,
    medium,
    llm: {
      status: "not_run",
      model: null,
      requests: 0,
      classifiedTerms: 0,
      highConfidenceTerms: 0,
      mediumConfidenceTerms: 0,
      errors: [],
      spendUsd: 0,
      budgetUsd: Number(options.llmBudgetUsd || 40),
    },
  };
}

async function runLlmClassification(corpus, treatments, mapping) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const budgetUsd = Number(options.llmBudgetUsd || 40);
  const maxTerms = Number(options.llmMaxTerms || 8000);
  const minLocations = Number(options.llmMinLocations || 1);
  const batchSize = Number(options.llmBatchSize || 80);
  const autoThreshold = Number(options.llmAutoThreshold || 0.9);
  const mediumThreshold = Number(options.llmMediumThreshold || 0.65);
  const maxErrors = Number(options.llmMaxErrors || 5);
  const model = options.llmModel || await chooseOpenRouterModel(apiKey);
  const treatmentIds = new Set(treatments.map((row) => Number(row.id)));
  const treatmentById = new Map(treatments.map((row) => [Number(row.id), row]));
  const selectedTerms = corpus
    .filter((row) => !mapping.high.has(row.normalized))
    .filter((row) => Number(row.location_count || 0) >= minLocations)
    .sort((a, b) => b.location_count - a.location_count || a.normalized.localeCompare(b.normalized))
    .slice(0, maxTerms);

  mapping.llm.status = "running";
  mapping.llm.model = model;
  mapping.llm.budgetUsd = budgetUsd;

  const batches = chunks(selectedTerms, batchSize);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    if (mapping.llm.spendUsd >= budgetUsd) {
      mapping.llm.status = "budget_gate_reached";
      break;
    }

    console.error(`llm batch ${batchIndex + 1}/${batches.length}; spend=$${mapping.llm.spendUsd.toFixed(4)}; classified=${mapping.llm.classifiedTerms}`);

    let response;
    try {
      response = await classifyBatchWithOpenRouter(apiKey, model, treatments, batch);
    } catch (error) {
      mapping.llm.errors.push(String(error?.message || error));
      if (!options.llmModel) {
        const fallback = await chooseOpenRouterModel(apiKey, model);
        if (fallback && fallback !== model) {
          try {
            response = await classifyBatchWithOpenRouter(apiKey, fallback, treatments, batch);
            mapping.llm.model = fallback;
          } catch (fallbackError) {
            mapping.llm.errors.push(String(fallbackError?.message || fallbackError));
            if (mapping.llm.errors.length >= maxErrors) {
              mapping.llm.status = "stopped_after_openrouter_error";
              break;
            }
            continue;
          }
        } else {
          if (mapping.llm.errors.length >= maxErrors) {
            mapping.llm.status = "stopped_after_openrouter_error";
            break;
          }
          continue;
        }
      } else {
        if (mapping.llm.errors.length >= maxErrors) {
          mapping.llm.status = "stopped_after_openrouter_error";
          break;
        }
        continue;
      }
    }

    mapping.llm.requests += 1;
    mapping.llm.classifiedTerms += batch.length;
    mapping.llm.spendUsd += Number(response.costUsd || 0);

    for (const item of response.classifications) {
      const normalized = normalizeTerm(item.normalized || item.term);
      if (!normalized || mapping.high.has(normalized)) continue;
      const treatmentId = Number(item.treatment_id);
      const confidence = Number(item.confidence || 0);
      if (!treatmentIds.has(treatmentId)) continue;
      const treatment = treatmentById.get(treatmentId);
      const reason = String(item.reason || "llm_classification").slice(0, 500);
      const original = batch.find((row) => row.normalized === normalized);
      const locationCount = original?.location_count || 0;

      if (confidence >= autoThreshold) {
        mapping.high.set(normalized, {
          treatment_id: treatmentId,
          canonical_name: treatment?.canonical_name || "",
          method: "llm_openrouter",
          confidence,
          rule: reason,
        });
        mapping.llm.highConfidenceTerms += 1;
      } else if (confidence >= mediumThreshold) {
        mapping.medium.push({
          term: original?.term || normalized,
          normalized,
          proposed_treatment_id: treatmentId,
          proposed_treatment: treatment?.canonical_name || "",
          location_count: locationCount,
          confidence,
          reason: `llm_openrouter: ${reason}`,
        });
        mapping.llm.mediumConfidenceTerms += 1;
      }
    }
  }

  mapping.medium.sort((a, b) => b.location_count - a.location_count || b.confidence - a.confidence || a.normalized.localeCompare(b.normalized));
  if (mapping.llm.status === "running") {
    mapping.llm.status = "completed_within_budget";
  }
}

async function chooseOpenRouterModel(apiKey, excludeModel = null) {
  const preferred = [
    "google/gemini-2.0-flash-001",
    "openai/gpt-4o-mini",
    "anthropic/claude-3.5-haiku",
    "mistralai/mistral-small-3.1-24b-instruct",
  ].filter((model) => model !== excludeModel);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.ok) {
      const data = await response.json();
      const ids = new Set((data.data || []).map((model) => model.id));
      const found = preferred.find((model) => ids.has(model));
      if (found) return found;
    }
  } catch {
    // Fall back to the first preferred model; the request loop will capture errors.
  }

  return preferred[0] || "google/gemini-2.0-flash-001";
}

async function classifyBatchWithOpenRouter(apiKey, model, treatments, batch) {
  const timeoutMs = Number(options.llmTimeoutMs || 45000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const compactTreatments = treatments.map((row) => ({
    id: Number(row.id),
    name: row.canonical_name,
    category: row.category,
    description: row.description || "",
  }));
  const terms = batch.map((row) => ({
    term: row.term,
    normalized: row.normalized,
    location_count: row.location_count,
    examples: row.example_raw_names.slice(0, 3),
  }));

  let response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://fountain.local",
        "X-Title": "Fountain taxonomy expansion",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        usage: { include: true },
        messages: [
          {
            role: "system",
            content: [
              "Classify service terms into an existing treatment taxonomy.",
              "Return ONLY valid JSON with key classifications.",
              "Each classification must include normalized, treatment_id, confidence, reason.",
              "Use treatment_id null and confidence 0 when the term should not map to an existing treatment.",
              "Be conservative. Do not map brands/devices, conditions, body parts, commerce packages, or vague wellness words unless the service concept is clearly one of the existing treatments.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              treatments: compactTreatments,
              terms,
              output_schema: {
                classifications: [
                  {
                    normalized: "exact normalized input term",
                    treatment_id: "integer existing treatment id or null",
                    confidence: "0 to 1",
                    reason: "short explanation",
                  },
                ],
              },
            }),
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 500)}`);
  }

  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseJsonObject(content);
  const classifications = Array.isArray(parsed.classifications) ? parsed.classifications : [];
  const usage = data.usage || {};
  const costUsd = Number(usage.cost || usage.total_cost || usage.cost_usd || 0);
  return { classifications, costUsd };
}

function parseJsonObject(text) {
  const value = String(text || "").trim();
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const first = value.indexOf("{");
    const last = value.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(value.slice(first, last + 1));
    }
    throw new Error(`Could not parse JSON response: ${value.slice(0, 300)}`);
  }
}

function deterministicTreatmentMatch(value) {
  const v = ` ${value} `;
  const has = (pattern) => pattern.test(v);

  if (has(/\b(full|whole|total)\s+body\s+mri\b/) || has(/\bwb\s*mri\b/)) return match(1, "full_body_mri");
  if (has(/\b(full|whole|total)\s+body\s+ct\b/) || has(/\bct\s+(scan\s+)?(full|whole)\s+body\b/)) return match(2, "full_body_ct");
  if (has(/\bdexa\b/) || has(/\bdxa\b/) || has(/\bbone\s+density\s+scan\b/)) return match(3, "dexa");
  if (has(/\bbody\s+composition\b/) || has(/\binbody\b/) || has(/\bbod\s*pod\b/) || has(/\bbody\s+comp\b/)) return match(4, "body_composition");
  if (has(/\b(epigenetic|biological)\s+age\b/) || has(/\btruage\b/) || has(/\btrudiagnostic\b/) || has(/\bdunedinpace\b/)) return match(5, "epigenetic_age");
  if (has(/\bvo2\s*max\b/) || has(/\bv02\s*max\b/) || has(/\bcardiopulmonary\s+exercise\s+test\b/)) return match(8, "vo2_max");
  if (has(/\bgenetic\s+(test|testing|screen|screening|analysis)\b/) || has(/\bdna\s+(test|testing|analysis)\b/) || has(/\bnutrigenomic/)) return match(9, "genetic_testing");
  if (has(/\b(cancer|galleri|grail)\s+(screen|screening|test|testing)\b/) || has(/\bmulti\s+cancer\b/)) return match(10, "cancer_screening");
  if (has(/\b(coronary\s+calcium|calcium\s+score|cac\s+score|cardiac\s+screen|heart\s+scan)\b/)) return match(11, "cardiac_screening");
  if (has(/\bsleep\s+(study|test|testing)\b/) || has(/\bhome\s+sleep\s+test\b/)) return match(12, "sleep_study");
  if (has(/\btelomere/)) return match(13, "telomere_testing");
  if (has(/\bhormone\s+(test|testing|panel|lab|labs|assessment)\b/)) return match(14, "hormone_testing");
  if (has(/\bcardiometabolic\b/)) return match(15, "cardiometabolic_testing");
  if (has(/\bexecutive\s+(physical|health|checkup|check\s+up|exam)\b/)) return match(16, "executive_health_checkup");

  if (has(/\bstem\s+cell/)) return match(17, "stem_cell");
  if (has(/\bexosome/)) return match(18, "exosome");
  if (has(/\bprp\b/) || has(/\bplatelet\s+rich\s+plasma\b/)) return match(19, "prp");
  if (has(/\bpeptide\s+(therapy|treatment|injection|program|optimization)\b/) || has(/\b(bpc\s*157|sermorelin|ipamorelin|cjc\s*1295|tesamorelin|thymosin)\b/)) return match(20, "peptide");
  if (has(/\bnad\b/) || has(/\bnadplus\b/) || has(/\bnicotinamide\s+adenine\b/)) return match(22, "nad");
  if (has(/\biv\s+(therapy|drip|hydration|infusion|nutrient|nutrition)\b/) || has(/\bintravenous\s+(therapy|drip|hydration|infusion|nutrient)\b/) || has(/\bmyers\s+cocktail\b/)) return match(21, "iv_nutrient");
  if (has(/\bvitamin\s+(infusion|iv|injection|shot|therapy)\b/) || has(/\bb\s*12\s+(shot|injection|iv)\b/) || has(/\bglutathione\s+(iv|injection|infusion)\b/)) return match(23, "vitamin");
  if (has(/\b(hormone\s+replacement|hrt|bhrt|trt|testosterone\s+(therapy|replacement|optimization)|hormone\s+optimization)\b/)) return match(24, "hormone_optimization");
  if (has(/\b(glp\s*1|semaglutide|tirzepatide|ozempic|wegovy|mounjaro|zepbound)\b/)) return match(25, "glp1");
  if (has(/\bendocrine\s+therapy\b/)) return match(26, "endocrine");

  if (has(/\b(hbot|hyperbaric|hyperbaric\s+oxygen)\b/)) return match(27, "hbot");
  if (has(/\bcryotherapy\b/) || has(/\bwhole\s+body\s+cryo\b/) || has(/\blocalized\s+cryo\b/)) return match(28, "cryotherapy");
  if (has(/\b(cold\s+plunge|ice\s+bath|cold\s+water\s+immersion)\b/)) return match(29, "cold_plunge");
  if (has(/\b(infrared\s+sauna|sauna)\b/)) return match(30, "sauna");
  if (has(/\b(red\s+light|photobiomodulation|novo\s*thor|novothor|pbm\s+therapy)\b/)) return match(31, "red_light");
  if (has(/\bpemf\b/) || has(/\bpulsed\s+electromagnetic\b/)) return match(32, "pemf");
  if (has(/\b(shockwave|shock\s+wave|softwave|acoustic\s+wave|extracorporeal\s+shock)\b/)) return match(33, "shockwave");

  if (has(/\b(botox|dysport|xeomin|jeuveau|neurotoxin|neuromodulator)\b/)) return match(34, "botox");
  if (has(/\b(dermal\s+filler|fillers?|juvederm|restylane|radiesse|sculptra|versa\s+filler)\b/)) return match(35, "fillers");
  if (has(/\baesthetic\s+medicine\b/)) return match(36, "aesthetic_medicine");
  if (has(/\bmicrocurrent\b/)) return match(37, "microcurrent");
  if (has(/\bmed\s+spa\b/) || has(/\bmedical\s+spa\b/)) return match(38, "med_spa");

  if (has(/\b(nutrition|nutritional)\s+(counseling|consult|consultation|program|coaching|therapy)\b/) || has(/\bdietitian\b/) || has(/\bdietician\b/)) return match(39, "nutrition");
  if (has(/\bsupplement(s|ation)?\b/)) return match(40, "supplementation");
  if (has(/\b(exercise|fitness)\s+(program|programming|coaching|plan|training)\b/) || has(/\bpersonal\s+training\b/)) return match(41, "exercise_programming");
  if (has(/\bsleep\s+(optimization|coaching|program|consultation)\b/)) return match(42, "sleep_optimization");
  if (has(/\bfunctional\s+medicine\b/)) return match(43, "functional_medicine");

  return null;
}

function mediumConfidenceTreatmentMatch(value) {
  const v = ` ${value} `;
  const has = (pattern) => pattern.test(v);
  if (has(/\b(medical\s+weight\s+loss|weight\s+loss\s+(program|consultation|therapy|management))\b/)) return match(25, "possible_glp1_or_general_weight_loss", 0.72);
  if (has(/\b(blood\s+(work|test|testing|panel)|lab\s+(work|test|testing|panel)|labs)\b/)) return match(6, "possible_advanced_blood_panel", 0.74);
  if (has(/\bbiomarker/)) return match(7, "possible_biomarker_panel", 0.76);
  if (has(/\bmetabolic\s+(test|testing|panel|assessment)\b/)) return match(15, "possible_cardiometabolic_testing", 0.72);
  if (has(/\bwellness\s+(exam|check|checkup|assessment|physical)\b/)) return match(16, "possible_executive_checkup", 0.68);
  if (has(/\binjectables?\b/)) return match(34, "ambiguous_botox_or_fillers", 0.62);
  if (has(/\bfacial\s+rejuvenation\b/)) return match(36, "possible_aesthetic_medicine", 0.64);
  return null;
}

function match(treatment_id, rule, confidence = 0.93) {
  return { treatment_id, confidence, rule };
}

function buildProposals(corpus, mapping) {
  const remaining = corpus.filter((row) => !mapping.high.has(row.normalized));
  const proposals = [];
  for (const definition of proposalDefinitions()) {
    const matched = remaining.filter((row) => definition.patterns.some((pattern) => pattern.test(` ${row.normalized} `)));
    if (!matched.length) continue;
    const locationCount = sumLocationCoverage(matched);
    if (locationCount < 10 && definition.status !== "out_of_scope") continue;
    const status = definition.status || (locationCount >= 15 ? "candidate" : "borderline");
    if (status !== "out_of_scope" && locationCount < 10) continue;
    proposals.push({
      proposed_canonical_name: definition.name,
      category: definition.category,
      location_count: locationCount,
      top_aliases: matched
        .sort((a, b) => b.location_count - a.location_count || a.normalized.localeCompare(b.normalized))
        .slice(0, 12)
        .map((row) => row.normalized),
      example_raw_names: uniqueFlat(matched.flatMap((row) => row.example_raw_names)).slice(0, 5),
      status,
      reason: definition.reason || "",
    });
  }
  proposals.sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.location_count - a.location_count || a.proposed_canonical_name.localeCompare(b.proposed_canonical_name));
  return proposals;
}

function sumLocationCoverage(rows) {
  // The corpus is already grouped by normalized term. Without per-location sets at
  // this stage, summing term coverage intentionally ranks proposals by total term
  // footprint and can slightly overcount locations with multiple synonymous rows.
  return rows.reduce((sum, row) => sum + Number(row.location_count || 0), 0);
}

function proposalDefinitions() {
  return [
    candidate("Microneedling", "Aesthetic", [/\b(microneedling|micro\s+needling|skinpen|dermapen)\b/]),
    candidate("RF microneedling", "Aesthetic", [/\b(rf\s+microneedling|radiofrequency\s+microneedling|morpheus\s*8|secret\s+rf|sylfirm|vivace|potenza)\b/]),
    candidate("Chemical peel", "Aesthetic", [/\b(chemical\s+peel|vi\s+peel|perfect\s+derma\s+peel|glycolic\s+peel|tca\s+peel)\b/]),
    candidate("Hydrafacial", "Aesthetic", [/\b(hydrafacial|hydra\s+facial|diamondglow)\b/]),
    candidate("Laser skin resurfacing", "Aesthetic", [/\b(laser\s+(skin\s+)?resurfacing|co2\s+laser|fractional\s+laser|fraxel|clear\s+brilliant|halo\s+laser)\b/]),
    candidate("Laser hair removal", "Aesthetic", [/\blaser\s+hair\s+removal\b/]),
    candidate("Skin tightening", "Aesthetic", [/\b(skin\s+tightening|ultherapy|thermage)\b/]),
    candidate("Body contouring", "Aesthetic", [/\b(body\s+(contouring|sculpting)|coolsculpting|cool\s+sculpting|emsculpt|tru\s*sculpt|vanquish|cryoskin)\b/]),
    candidate("Hair restoration", "Regenerative & cellular", [/\b(hair\s+(restoration|regrowth|loss|rejuvenation)|keravive)\b/]),
    candidate("Ozone therapy", "Regenerative & cellular", [/\b(ozone\s+therapy|ebo2|eboo|major\s+autohemotherapy)\b/]),
    candidate("Acupuncture", "Lifestyle & foundational", [/\bacupuncture\b/]),
    candidate("Chiropractic care", "Lifestyle & foundational", [/\b(chiropractic|chiropractor)\b/]),
    candidate("Physical therapy", "Recovery & performance", [/\bphysical\s+therapy\b/]),
    candidate("Massage therapy", "Recovery & performance", [/\b(massage\s+therapy|therapeutic\s+massage|deep\s+tissue\s+massage|sports\s+massage)\b/]),
    candidate("Lymphatic drainage", "Recovery & performance", [/\blymphatic\s+(drainage|massage)\b/]),
    candidate("Colon hydrotherapy", "Lifestyle & foundational", [/\b(colon\s+hydrotherapy|colonics?|colonic\s+hydrotherapy)\b/]),
    candidate("Float therapy", "Recovery & performance", [/\b(float\s+(therapy|tank|session)|sensory\s+deprivation)\b/]),
    candidate("Laser tattoo removal", "Aesthetic", [/\blaser\s+tattoo\s+removal\b/]),
    candidate("Tanning", "Aesthetic", [/\b(tanning|spray\s+tan|sunless\s+tan)\b/], "out_of_scope", "commerce/beauty service outside longevity treatment taxonomy"),
    candidate("Retail products", "Lifestyle & foundational", [/\b(retail|products?|shop|store|gift\s+card|gift\s+certificate)\b/], "out_of_scope", "retail or gift-card commerce"),
    candidate("Memberships and packages", "Lifestyle & foundational", [/\b(membership|memberships|package|packages|bundle|specials?)\b/], "out_of_scope", "pricing/package construct, not a treatment"),
  ];
}

function candidate(name, category, patterns, status = null, reason = "") {
  return { name, category, patterns, status, reason };
}

function statusRank(status) {
  return { candidate: 0, borderline: 1, out_of_scope: 2 }[status] ?? 9;
}

async function ensureRunTables() {
  await db.query(`
    CREATE SCHEMA IF NOT EXISTS ${quoteIdent(rawSchema)};

    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(corpusTable)} (
      term text NOT NULL,
      normalized text NOT NULL PRIMARY KEY,
      location_count integer NOT NULL,
      offering_rows integer NOT NULL,
      unmapped_occurrences integer NOT NULL,
      example_raw_names text[] NOT NULL,
      sources text[] NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)} (
      offering_id integer PRIMARY KEY,
      location_id integer NOT NULL,
      raw_name text NOT NULL,
      normalized text NOT NULL,
      old_treatment_id integer,
      new_treatment_id integer NOT NULL,
      canonical_name text NOT NULL,
      match_method text NOT NULL,
      confidence double precision NOT NULL,
      rule text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ${quoteIdent(rawSchema)}.${quoteIdent(proposalTable)} (
      proposed_canonical_name text NOT NULL,
      category text NOT NULL,
      location_count integer NOT NULL,
      top_aliases text[] NOT NULL,
      example_raw_names text[] NOT NULL,
      status text NOT NULL,
      reason text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function replaceCorpusTable(corpus) {
  await db.query(`TRUNCATE ${quoteIdent(rawSchema)}.${quoteIdent(corpusTable)}`);
  for (const batch of chunks(corpus, 2000)) {
    await db.query(`
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(corpusTable)}
        (term, normalized, location_count, offering_rows, unmapped_occurrences, example_raw_names, sources)
      SELECT term, normalized, location_count, offering_rows, unmapped_occurrences, example_raw_names, sources
      FROM jsonb_to_recordset($1::jsonb) AS x(
        term text,
        normalized text,
        location_count integer,
        offering_rows integer,
        unmapped_occurrences integer,
        example_raw_names text[],
        sources text[]
      )
      ON CONFLICT (normalized) DO UPDATE SET
        term = excluded.term,
        location_count = excluded.location_count,
        offering_rows = excluded.offering_rows,
        unmapped_occurrences = excluded.unmapped_occurrences,
        example_raw_names = excluded.example_raw_names,
        sources = excluded.sources
    `, [JSON.stringify(batch)]);
  }
}

async function replaceProposalTable(proposals) {
  await db.query(`TRUNCATE ${quoteIdent(rawSchema)}.${quoteIdent(proposalTable)}`);
  if (!proposals.length) return;
  await db.query(`
    INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(proposalTable)}
      (proposed_canonical_name, category, location_count, top_aliases, example_raw_names, status, reason)
    SELECT proposed_canonical_name, category, location_count, top_aliases, example_raw_names, status, reason
    FROM jsonb_to_recordset($1::jsonb) AS x(
      proposed_canonical_name text,
      category text,
      location_count integer,
      top_aliases text[],
      example_raw_names text[],
      status text,
      reason text
    )
  `, [JSON.stringify(proposals)]);
}

async function applyHighConfidenceMappings(activeOfferings, corpus, mapping) {
  const normalizedByOffering = new Map();
  const representativeByNormalized = new Map(corpus.map((row) => [row.normalized, row.term]));
  for (const offering of activeOfferings) {
    const normalized = normalizeTerm(offering.raw_name);
    if (mapping.high.has(normalized)) {
      normalizedByOffering.set(Number(offering.id), { ...offering, normalized });
    }
  }

  const aliasRows = [];
  for (const [normalized, mapped] of mapping.high.entries()) {
    aliasRows.push({
      treatment_id: mapped.treatment_id,
      alias_text: representativeByNormalized.get(normalized) || normalized,
      alias_normalized: normalized,
      source_slug: sourceSlug,
    });
  }

  if (aliasRows.length) {
    await db.query(`
      INSERT INTO ${quoteIdent(rawSchema)}.treatment_aliases
        (treatment_id, alias_text, alias_normalized, source_slug)
      SELECT treatment_id, alias_text, alias_normalized, source_slug
      FROM jsonb_to_recordset($1::jsonb) AS x(
        treatment_id integer,
        alias_text text,
        alias_normalized text,
        source_slug text
      )
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${quoteIdent(rawSchema)}.treatment_aliases existing
        WHERE existing.alias_normalized = x.alias_normalized
      )
      ON CONFLICT (alias_normalized, source_slug) DO NOTHING
    `, [JSON.stringify(aliasRows)]);
  }

  const auditRows = [...normalizedByOffering.values()].map((offering) => {
    const mapped = mapping.high.get(offering.normalized);
    return {
      offering_id: Number(offering.id),
      location_id: Number(offering.location_id),
      raw_name: offering.raw_name,
      normalized: offering.normalized,
      old_treatment_id: null,
      new_treatment_id: mapped.treatment_id,
      canonical_name: mapped.canonical_name,
      match_method: mapped.method,
      confidence: mapped.confidence,
      rule: mapped.rule,
    };
  });

  for (const batch of chunks(auditRows, 5000)) {
    await db.query(`
      INSERT INTO ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)}
        (offering_id, location_id, raw_name, normalized, old_treatment_id, new_treatment_id, canonical_name, match_method, confidence, rule)
      SELECT offering_id, location_id, raw_name, normalized, old_treatment_id, new_treatment_id, canonical_name, match_method, confidence, rule
      FROM jsonb_to_recordset($1::jsonb) AS x(
        offering_id integer,
        location_id integer,
        raw_name text,
        normalized text,
        old_treatment_id integer,
        new_treatment_id integer,
        canonical_name text,
        match_method text,
        confidence double precision,
        rule text
      )
      ON CONFLICT (offering_id) DO NOTHING
    `, [JSON.stringify(batch)]);

    await db.query(`
      UPDATE ${quoteIdent(schema)}.offerings o
      SET treatment_id = x.new_treatment_id,
          updated_at = now()
      FROM jsonb_to_recordset($1::jsonb) AS x(offering_id integer, new_treatment_id integer)
      WHERE o.id = x.offering_id
        AND o.treatment_id IS NULL
        AND o.deleted_at IS NULL
    `, [JSON.stringify(batch.map((row) => ({ offering_id: row.offering_id, new_treatment_id: row.new_treatment_id })))]);
  }
}

async function loadDbRunSummary() {
  const result = await db.query(`
    SELECT
      (SELECT count(*)::integer FROM ${quoteIdent(rawSchema)}.${quoteIdent(auditTable)}) AS offerings_updated,
      (SELECT count(*)::integer FROM ${quoteIdent(rawSchema)}.treatment_aliases WHERE source_slug = $1) AS aliases_inserted
  `, [sourceSlug]);
  return {
    offeringsUpdated: Number(result.rows[0].offerings_updated || 0),
    aliasesInserted: Number(result.rows[0].aliases_inserted || 0),
  };
}

function emptyDbRunSummary() {
  return { offeringsUpdated: 0, aliasesInserted: 0 };
}

function summarizeCorpus(corpus) {
  return {
    normalized_terms: corpus.length,
    terms_with_active_location_coverage: corpus.filter((row) => row.location_count > 0).length,
    active_location_weight_sum: corpus.reduce((sum, row) => sum + Number(row.location_count || 0), 0),
    unmapped_term_occurrences: corpus.reduce((sum, row) => sum + Number(row.unmapped_occurrences || 0), 0),
    top_terms: corpus.slice(0, 30).map((row) => ({
      normalized: row.normalized,
      location_count: row.location_count,
      examples: row.example_raw_names.slice(0, 3),
    })),
  };
}

function topMappingRows(corpus, highMap, treatments, limit) {
  const byId = new Map(treatments.map((row) => [Number(row.id), row]));
  return corpus
    .filter((row) => highMap.has(row.normalized))
    .map((row) => {
      const mapped = highMap.get(row.normalized);
      return {
        term: row.term,
        normalized: row.normalized,
        treatment: byId.get(mapped.treatment_id)?.canonical_name || "",
        location_count: row.location_count,
        method: mapped.method,
        confidence: mapped.confidence,
      };
    })
    .sort((a, b) => b.location_count - a.location_count || a.normalized.localeCompare(b.normalized))
    .slice(0, limit);
}

function renderMarkdown(report) {
  const lines = [
    "# Taxonomy Expansion Approval Report",
    "",
    `- Date: ${report.phase_date}`,
    `- Mode: ${report.mode}`,
    `- Corpus table: ${report.tables.corpus ? `\`${report.tables.corpus}\`` : "not written; dry run"}`,
    `- Audit table: ${report.tables.audit ? `\`${report.tables.audit}\`` : "not written; dry run"}`,
    `- Proposal table: ${report.tables.proposals ? `\`${report.tables.proposals}\`` : "not written; dry run"}`,
    `- LLM status: ${report.llm.status}`,
    `- LLM model: ${report.llm.model || "none"}`,
    `- LLM classified terms: ${report.llm.classified_terms}`,
    `- LLM high-confidence terms: ${report.llm.high_confidence_terms}`,
    `- LLM medium-confidence terms: ${report.llm.medium_confidence_terms}`,
    `- LLM spend: $${report.llm.spend_usd.toFixed(4)} / $${report.llm.budget_gate_usd.toFixed(2)}`,
    "",
    "## Coverage",
    "",
    markdownTable(
      ["metric", "before", "after"],
      [
        ["active offerings", report.before.active_offerings, report.after.active_offerings],
        ["mapped active offerings", report.before.mapped_active_offerings, report.after.mapped_active_offerings],
        ["unmapped active offerings", report.before.unmapped_active_offerings, report.after.unmapped_active_offerings],
        ["mapped %", `${report.before.mapped_pct}%`, `${report.after.mapped_pct}%`],
      ],
    ),
    "",
    "## Phase 1 Corpus",
    "",
    `- Normalized terms: ${report.corpus_summary.normalized_terms}`,
    `- Terms with active location coverage: ${report.corpus_summary.terms_with_active_location_coverage}`,
    `- Weight sum by distinct active locations: ${report.corpus_summary.active_location_weight_sum}`,
    "",
    "## Phase 2 Existing Treatment Mapping",
    "",
    `- High-confidence normalized terms: ${report.phase_2.high_confidence_terms}`,
    `- Offerings newly linked: ${report.phase_2.offerings_newly_linked}`,
    `- Aliases inserted: ${report.phase_2.aliases_inserted}`,
    `- Medium-confidence mappings awaiting approval: ${report.phase_2.medium_confidence_terms}`,
    "",
    "### Top Auto-Mapped Terms",
    "",
    markdownTable(
      ["term", "treatment", "locations", "method", "confidence"],
      report.phase_2.top_auto_mappings.slice(0, 40).map((row) => [row.normalized, row.treatment, row.location_count, row.method, row.confidence]),
    ),
  ];

  if (report.phase_2.medium_confidence_review.length) {
    lines.push(
      "",
      "### Medium-Confidence Review",
      "",
      markdownTable(
        ["term", "proposed treatment", "locations", "confidence", "reason"],
        report.phase_2.medium_confidence_review.slice(0, 60).map((row) => [row.normalized, row.proposed_treatment, row.location_count, row.confidence, row.reason]),
      ),
    );
  }

  lines.push(
    "",
    "## Phase 3 Proposed New Treatments",
    "",
    "These are proposals only. Nothing here was inserted into `fountain.treatments` or applied to offerings.",
    "",
    markdownTable(
      ["canonical name", "category", "locations", "top aliases", "examples"],
      report.phase_3.candidates.map((row) => [
        row.proposed_canonical_name,
        row.category,
        row.location_count,
        row.top_aliases.slice(0, 5).join(", "),
        row.example_raw_names.slice(0, 3).join("; "),
      ]),
    ),
    "",
    "## Borderline 10-14 Location Calls",
    "",
    report.phase_3.borderline.length
      ? markdownTable(
          ["canonical name", "category", "locations", "top aliases", "examples"],
          report.phase_3.borderline.map((row) => [
            row.proposed_canonical_name,
            row.category,
            row.location_count,
            row.top_aliases.slice(0, 5).join(", "),
            row.example_raw_names.slice(0, 3).join("; "),
          ]),
        )
      : "No borderline deterministic proposal groups found.",
    "",
    "## Out Of Scope",
    "",
    report.phase_3.out_of_scope.length
      ? markdownTable(
          ["group", "count", "reason", "examples"],
          report.phase_3.out_of_scope.map((row) => [
            row.proposed_canonical_name,
            row.location_count,
            row.reason,
            row.example_raw_names.slice(0, 4).join("; "),
          ]),
        )
      : "No deterministic out-of-scope groups found.",
    "",
    "## Guardrails",
    "",
    ...report.guardrails.map((guardrail) => `- ${guardrail}`),
    "",
  );

  return `${lines.join("\n")}\n`;
}

function markdownTable(headers, rows) {
  if (!rows.length) return "_None._";
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.map(escape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function normalizeTerm(input) {
  let value = String(input || "").toLowerCase();
  value = value
    .replace(/[™®©℠]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/\bglp[-\s]?1\b/g, "glp 1")
    .replace(/\bnad\s*plus\b/g, "nad")
    .replace(/\bnad\+\b/g, "nad")
    .replace(/\biv\b/g, "iv")
    .replace(/\bintravenous\b/g, "iv")
    .replace(/\bv\s*o\s*2\b/g, "vo2")
    .replace(/\bconsultation\s+for\b/g, " ")
    .replace(/\bconsult\s+for\b/g, " ")
    .replace(/\b(new\s+patient|initial|introductory|intro|follow\s+up|followup|couples?|members?|membership|special|specials|promo|promotion|package\s+of\s+\d+|package|packages|bundle|virtual|mobile|online)\b/g, " ")
    .replace(/\$[\d,.]+/g, " ")
    .replace(/\b\d+(\.\d+)?\s*(minutes?|mins?|hours?|hrs?|sessions?|visits?|packs?|units?|mg|mcg|g|ml|cc|iu|oz)\b/g, " ")
    .replace(/\b\d+\s*(x|for)\s*\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  value = value
    .replace(/\bnad\s+plus\b/g, "nad")
    .replace(/\bcryo\s+therapy\b/g, "cryotherapy")
    .replace(/\bhyperbaric\s+oxygen\s+treatment\b/g, "hyperbaric oxygen therapy")
    .replace(/\bplatelet\s+rich\s+plasma\b/g, "prp")
    .replace(/\s+/g, " ")
    .trim();
  return value;
}

function uniqueFlat(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function normalizeIdentifier(identifier) {
  const value = String(identifier || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe identifier: ${identifier}`);
  }
  return value;
}

function normalizePostgresConnectionString(value) {
  if (!value) return value;
  return value.startsWith("postgres://") ? `postgresql://${value.slice("postgres://".length)}` : value;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function parseArgs(args) {
  const parsed = { envFile: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...rest] = arg.slice(2).split("=");
      assignArg(parsed, key, rest.join("="));
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[index + 1];
      if (!next || next.startsWith("--")) {
        assignArg(parsed, key, true);
      } else {
        assignArg(parsed, key, next);
        index += 1;
      }
    }
  }
  return parsed;
}

function assignArg(parsed, key, value) {
  const camel = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  if (camel === "envFile") {
    parsed.envFile.push(value);
  } else {
    parsed[camel] = value;
  }
}

function createDbClient() {
  return new Client({ connectionString: normalizePostgresConnectionString(connectionString) });
}
