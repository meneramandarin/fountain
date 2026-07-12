import { createLlmClient } from "./llm.mjs";

export const TAXONOMY_PRESENTATION_PROMPT_VERSION = "taxonomy-presentation-v1";
export const TAXONOMY_PRESENTATION_DEFAULT_MODEL = "openai/gpt-4o-mini";
export const TAXONOMY_PRESENTATION_DEFAULT_BATCH_SIZE = 40;
export const TAXONOMY_PRESENTATION_DEFAULT_CONCURRENCY = 6;
export const TAXONOMY_PRESENTATION_MAX_BATCH_SIZE = 50;
export const TAXONOMY_PRESENTATION_MAX_TOKENS = 8_000;

export const TAXONOMY_PRESENTATION_SYSTEM_PROMPT = `You classify how a clinic's source-facing treatment term relates to its currently mapped canonical Fountain treatment.

This is a presentation and taxonomy-audit task. Do not invent treatments and do not change mappings.

Allowed relationships:
- format_variant: only capitalization, punctuation, spacing, trademark marks, abbreviations, or trivial wording differs.
- equivalent: a genuine synonym or marketing phrase with no consumer-relevant distinction.
- brand: a named commercial brand or product in the same treatment family (for example Dysport mapped to Botox).
- subtype: a narrower technique, indication, body area, protocol, or meaningful variant of the canonical treatment.
- broader_match: the source term is broader or less specific than the canonical treatment.
- compound: the source term combines multiple distinct treatments or services.
- suspect: the term appears unrelated to the canonical treatment or the mapping is otherwise unsafe.

mapping_valid must be false for suspect relationships and normally false for compound terms that cannot truthfully map to one treatment. Be conservative. A source term that merely rephrases the canonical concept is equivalent, not subtype. A price, duration, package, or consultation modifier does not create a subtype. Return exactly one result for every supplied term_normalized and copy term_normalized exactly.`;

export const TAXONOMY_PRESENTATION_RESPONSE_FORMAT = Object.freeze({
  type: "json_schema",
  json_schema: {
    name: "fountain_taxonomy_presentation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["classifications"],
      properties: {
        classifications: {
          type: "array",
          maxItems: TAXONOMY_PRESENTATION_MAX_BATCH_SIZE,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["term_normalized", "relationship", "mapping_valid", "confidence", "rationale"],
            properties: {
              term_normalized: { type: "string", minLength: 1, maxLength: 300 },
              relationship: {
                type: "string",
                enum: ["equivalent", "brand", "subtype", "broader_match", "compound", "suspect"],
              },
              mapping_valid: { type: "boolean" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string", minLength: 1, maxLength: 280 },
            },
          },
        },
      },
    },
  },
});

export const LOAD_PENDING_TAXONOMY_PRESENTATIONS_SQL = `
  WITH alias_terms AS (
    SELECT
      alias.treatment_id,
      alias.alias_normalized AS term_normalized,
      (array_agg(alias.alias_text ORDER BY length(alias.alias_text), alias.alias_text))[1] AS display_term,
      count(*)::integer AS alias_rows
    FROM fountain_raw.treatment_aliases alias
    GROUP BY alias.treatment_id, alias.alias_normalized
  ), exact_usage AS (
    SELECT
      offering.treatment_id,
      lower(btrim(offering.raw_name)) AS raw_key,
      count(*)::integer AS active_offerings
    FROM fountain.offerings offering
    WHERE offering.status = 'active'
      AND offering.deleted_at IS NULL
      AND offering.treatment_id IS NOT NULL
      AND offering.raw_name IS NOT NULL
    GROUP BY offering.treatment_id, lower(btrim(offering.raw_name))
  )
  SELECT
    alias_term.treatment_id,
    treatment.canonical_name,
    treatment.category,
    alias_term.term_normalized,
    alias_term.display_term,
    alias_term.alias_rows,
    COALESCE(exact_usage.active_offerings, 0)::integer AS active_offerings
  FROM alias_terms alias_term
  JOIN fountain.treatments treatment ON treatment.id = alias_term.treatment_id
  LEFT JOIN exact_usage
    ON exact_usage.treatment_id = alias_term.treatment_id
   AND exact_usage.raw_key = lower(btrim(alias_term.display_term))
  LEFT JOIN fountain.treatment_term_presentations presentation
    ON presentation.treatment_id = alias_term.treatment_id
   AND presentation.term_normalized = alias_term.term_normalized
  WHERE presentation.treatment_id IS NULL
  ORDER BY COALESCE(exact_usage.active_offerings, 0) DESC,
           alias_term.treatment_id,
           alias_term.term_normalized
  LIMIT $1
`;

const UPSERT_PRESENTATIONS_SQL = `
  INSERT INTO fountain.treatment_term_presentations (
    treatment_id,
    term_normalized,
    relationship_type,
    display_mode,
    mapping_valid,
    confidence,
    rationale,
    model,
    prompt_version,
    review_status,
    created_at,
    updated_at
  )
  SELECT
    row.treatment_id,
    row.term_normalized,
    row.relationship_type,
    row.display_mode,
    row.mapping_valid,
    row.confidence,
    row.rationale,
    row.model,
    row.prompt_version,
    row.review_status,
    now(),
    now()
  FROM jsonb_to_recordset($1::jsonb) AS row(
    treatment_id integer,
    term_normalized text,
    relationship_type text,
    display_mode text,
    mapping_valid boolean,
    confidence double precision,
    rationale text,
    model text,
    prompt_version text,
    review_status text
  )
  ON CONFLICT (treatment_id, term_normalized) DO UPDATE
  SET relationship_type = EXCLUDED.relationship_type,
      display_mode = EXCLUDED.display_mode,
      mapping_valid = EXCLUDED.mapping_valid,
      confidence = EXCLUDED.confidence,
      rationale = EXCLUDED.rationale,
      model = EXCLUDED.model,
      prompt_version = EXCLUDED.prompt_version,
      review_status = CASE
        WHEN fountain.treatment_term_presentations.review_status IN ('human_approved', 'human_rejected')
          THEN fountain.treatment_term_presentations.review_status
        ELSE EXCLUDED.review_status
      END,
      updated_at = now()
`;

export async function loadPendingTaxonomyPresentations({ query, limit = 100_000 }) {
  if (typeof query !== "function") throw new TypeError("query must be a function.");
  const result = await query(LOAD_PENDING_TAXONOMY_PRESENTATIONS_SQL, [positiveInteger(limit, "limit")]);
  return result.rows.map(normalizePendingTerm);
}

export function buildDeterministicPresentation(term) {
  if (normalizeTaxonomyTerm(term.display_term) !== normalizeTaxonomyTerm(term.canonical_name)) return null;
  return presentationRow(term, {
    relationship: "format_variant",
    mappingValid: true,
    confidence: 1,
    rationale: "Deterministic normalized match to the canonical treatment.",
    model: null,
  });
}

export async function classifyTaxonomyPresentationBatch({
  terms,
  runId,
  model = TAXONOMY_PRESENTATION_DEFAULT_MODEL,
  llmClient = createLlmClient(),
}) {
  if (!Array.isArray(terms) || terms.length === 0) return { rows: [], completion: null };
  if (terms.length > TAXONOMY_PRESENTATION_MAX_BATCH_SIZE) {
    throw new Error(`Taxonomy presentation batch exceeds ${TAXONOMY_PRESENTATION_MAX_BATCH_SIZE} terms.`);
  }
  const completion = await llmClient.complete({
    runId,
    model,
    callType: "taxonomy_presentation",
    messages: [
      { role: "system", content: TAXONOMY_PRESENTATION_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          prompt_version: TAXONOMY_PRESENTATION_PROMPT_VERSION,
          terms: terms.map((term) => ({
            term_normalized: term.term_normalized,
            display_term: term.display_term,
            canonical_treatment: term.canonical_name,
            category: term.category,
            active_offerings: term.active_offerings,
          })),
        }),
      },
    ],
    temperature: 0,
    maxTokens: TAXONOMY_PRESENTATION_MAX_TOKENS,
    responseFormat: TAXONOMY_PRESENTATION_RESPONSE_FORMAT,
  });
  const parsed = parseJsonObject(completion.content);
  const classifications = Array.isArray(parsed.classifications) ? parsed.classifications : [];
  const byNormalized = new Map(classifications.map((item) => [String(item.term_normalized || ""), item]));
  const expected = new Set(terms.map((term) => term.term_normalized));
  if (byNormalized.size !== expected.size || [...byNormalized.keys()].some((key) => !expected.has(key))) {
    throw new Error(`Taxonomy presentation response coverage mismatch: expected ${expected.size}, received ${byNormalized.size}.`);
  }
  const rows = terms.map((term) => {
    const item = byNormalized.get(term.term_normalized);
    return presentationRow(term, {
      relationship: item.relationship,
      mappingValid: Boolean(item.mapping_valid),
      confidence: boundedConfidence(item.confidence),
      rationale: cleanText(item.rationale, 280),
      model: cleanText(completion.model || model, 200),
    });
  });
  return { rows, completion };
}

export async function upsertTaxonomyPresentations(rows, { query }) {
  if (!rows.length) return 0;
  const result = await query(UPSERT_PRESENTATIONS_SQL, [JSON.stringify(rows)]);
  return Number(result.rowCount || 0);
}

export async function runTaxonomyPresentationClassification({
  runId,
  apply = false,
  model = TAXONOMY_PRESENTATION_DEFAULT_MODEL,
  batchSize = TAXONOMY_PRESENTATION_DEFAULT_BATCH_SIZE,
  concurrency = TAXONOMY_PRESENTATION_DEFAULT_CONCURRENCY,
  limit = 100_000,
  budgetUsd = null,
  query,
  llmClient = createLlmClient(),
  getSpend = async () => 0,
  onProgress = () => {},
}) {
  const size = positiveInteger(batchSize, "batchSize");
  const workerCount = positiveInteger(concurrency, "concurrency");
  if (size > TAXONOMY_PRESENTATION_MAX_BATCH_SIZE) {
    throw new Error(`batchSize cannot exceed ${TAXONOMY_PRESENTATION_MAX_BATCH_SIZE}.`);
  }
  const pending = await loadPendingTaxonomyPresentations({ query, limit });
  const deterministic = [];
  const modelTerms = [];
  for (const term of pending) {
    const row = buildDeterministicPresentation(term);
    if (row) deterministic.push(row);
    else modelTerms.push(term);
  }
  const preview = {
    pending: pending.length,
    deterministic: deterministic.length,
    llm_terms: modelTerms.length,
    llm_batches: Math.ceil(modelTerms.length / size),
  };
  if (!apply) return { ...preview, written: 0, classified: [], budget_exhausted: false };

  let written = await upsertTaxonomyPresentations(deterministic, { query });
  const classified = [...deterministic];
  let completedBatches = 0;
  let budgetExhausted = false;
  const batches = chunks(modelTerms, size);
  for (const wave of chunks(batches, workerCount)) {
    const spend = await getSpend(runId);
    if (budgetUsd != null && spend >= Number(budgetUsd)) {
      budgetExhausted = true;
      break;
    }
    const settled = await Promise.allSettled(wave.map((batch) => (
      classifyTaxonomyPresentationBatch({ terms: batch, runId, model, llmClient })
    )));
    const errors = [];
    for (const result of settled) {
      if (result.status === "rejected") {
        errors.push(result.reason);
        continue;
      }
      written += await upsertTaxonomyPresentations(result.value.rows, { query });
      classified.push(...result.value.rows);
      completedBatches += 1;
      await onProgress({ completedBatches, totalBatches: preview.llm_batches, classified: classified.length });
    }
    if (errors.length) {
      throw new AggregateError(errors, `${errors.length} taxonomy presentation batch(es) failed.`);
    }
  }
  return {
    ...preview,
    written,
    classified,
    completed_batches: completedBatches,
    budget_exhausted: budgetExhausted,
    summary: summarizeRows(classified),
  };
}

export function normalizeTaxonomyTerm(input) {
  return String(input || "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[™®©℠]/gu, " ")
    .replace(/&/gu, " and ")
    .replace(/\+/gu, " plus ")
    .replace(/\bglp[-\s]?1\b/gu, "glp 1")
    .replace(/\bnad\s*plus\b/gu, "nad")
    .replace(/\bnad\+\b/gu, "nad")
    .replace(/\bintravenous\b/gu, "iv")
    .replace(/\bv\s*o\s*2\b/gu, "vo2")
    .replace(/\$[\d,.]+/gu, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?|sessions?|visits?|packs?|units?|mg|mcg|g|ml|cc|iu|oz)\b/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function presentationRow(term, { relationship, mappingValid, confidence, rationale, model }) {
  const normalizedRelationship = allowedRelationship(relationship);
  const valid = normalizedRelationship === "suspect" ? false : Boolean(mappingValid);
  const reviewStatus = !valid
    || confidence < 0.85
    || ["compound", "suspect"].includes(normalizedRelationship)
    ? "needs_review"
    : "auto_approved";
  return {
    treatment_id: term.treatment_id,
    term_normalized: term.term_normalized,
    relationship_type: normalizedRelationship,
    display_mode: displayMode(normalizedRelationship, valid),
    mapping_valid: valid,
    confidence,
    rationale,
    model,
    prompt_version: TAXONOMY_PRESENTATION_PROMPT_VERSION,
    review_status: reviewStatus,
  };
}

function displayMode(relationship, mappingValid) {
  if (!mappingValid) return "raw_only";
  if (["brand", "subtype"].includes(relationship)) return "raw_and_canonical";
  if (relationship === "broader_match") return "canonical_only";
  return "raw_only";
}

function allowedRelationship(value) {
  const relationship = String(value || "");
  return ["format_variant", "equivalent", "brand", "subtype", "broader_match", "compound", "suspect"].includes(relationship)
    ? relationship
    : "suspect";
}

function normalizePendingTerm(row) {
  return {
    treatment_id: positiveInteger(row.treatment_id, "treatment_id"),
    canonical_name: cleanText(row.canonical_name, 300),
    category: cleanText(row.category, 200),
    term_normalized: cleanText(row.term_normalized, 300),
    display_term: cleanText(row.display_term, 300),
    alias_rows: Number(row.alias_rows || 0),
    active_offerings: Number(row.active_offerings || 0),
  };
}

function summarizeRows(rows) {
  const relationships = {};
  const displayModes = {};
  let needsReview = 0;
  for (const row of rows) {
    relationships[row.relationship_type] = (relationships[row.relationship_type] || 0) + 1;
    displayModes[row.display_mode] = (displayModes[row.display_mode] || 0) + 1;
    if (row.review_status === "needs_review") needsReview += 1;
  }
  return { relationships, display_modes: displayModes, needs_review: needsReview };
}

function parseJsonObject(value) {
  const text = String(value || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);
    if (fenced) return JSON.parse(fenced[1]);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error(`Could not parse taxonomy presentation JSON: ${text.slice(0, 300)}`);
  }
}

function boundedConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return number;
}

function chunks(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}
