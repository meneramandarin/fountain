import { createLlmClient } from "./llm.mjs";

export const OFFERING_TRANSLATION_MODEL = "openai/gpt-4o-mini";
export const OFFERING_TRANSLATION_VERIFICATION_MODEL = "openai/gpt-5.5";
export const OFFERING_TRANSLATION_PROMPT_VERSION = "offering-translation-v2";
export const OFFERING_TRANSLATION_BATCH_SIZE = 50;
export const OFFERING_TRANSLATION_CONCURRENCY = 10;
export const OFFERING_TRANSLATION_MAX_BATCH_SIZE = 50;
export const OFFERING_TRANSLATION_MAX_TOKENS = 10_000;
export const OFFERING_TRANSLATION_CONFIDENCE_THRESHOLD = 0.85;

export const OFFERING_TRANSLATION_SYSTEM_PROMPT = `You are the English localization layer for a medical, wellness, longevity, and aesthetics directory.

For every supplied offering name:
- Detect whether its consumer-facing wording is already English.
- If it is English, set is_english=true and english_text=null.
- Otherwise translate the complete offering into concise, natural English while preserving its exact medical meaning.
- Preserve brand names, acronyms, product names, dosages, quantities, treatment counts, body areas, and first/subsequent-session distinctions.
- Translate every medically meaningful word. Do not shorten anatomical sources (for example, preserve "umbilical cord-derived", not merely "cord-derived").
- Preserve explicit ordinals exactly: "3rd and subsequent sessions" must not be reduced to just "subsequent sessions".
- Transliterate a proper name only when needed for an English reader.
- Do not add claims, explanations, prices, or concepts absent from the source.
- Mixed-language text is non-English if any consumer-relevant words require translation.
- source_language should be a lowercase ISO 639-1 code when known, or "und" when genuinely uncertain.
- Copy term_key exactly and return every term exactly once.`;

export const OFFERING_TRANSLATION_RESPONSE_FORMAT = Object.freeze({
  type: "json_schema",
  json_schema: {
    name: "fountain_offering_translation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["translations"],
      properties: {
        translations: {
          type: "array",
          maxItems: OFFERING_TRANSLATION_MAX_BATCH_SIZE,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["term_key", "source_language", "is_english", "english_text", "confidence", "rationale"],
            properties: {
              term_key: { type: "integer", minimum: 1, maximum: OFFERING_TRANSLATION_MAX_BATCH_SIZE },
              source_language: { type: "string", minLength: 2, maxLength: 12 },
              is_english: { type: "boolean" },
              english_text: { type: ["string", "null"], maxLength: 500 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string", minLength: 1, maxLength: 240 },
            },
          },
        },
      },
    },
  },
});

export const OFFERING_TRANSLATION_VERIFICATION_RESPONSE_FORMAT = Object.freeze({
  type: "json_schema",
  json_schema: {
    name: "fountain_offering_translation_verification",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["verifications"],
      properties: {
        verifications: {
          type: "array",
          maxItems: OFFERING_TRANSLATION_MAX_BATCH_SIZE,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["term_key", "should_translate", "source_language", "english_text", "confidence", "rationale"],
            properties: {
              term_key: { type: "integer", minimum: 1, maximum: OFFERING_TRANSLATION_MAX_BATCH_SIZE },
              should_translate: { type: "boolean" },
              source_language: { type: "string", minLength: 2, maxLength: 12 },
              english_text: { type: ["string", "null"], maxLength: 500 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string", minLength: 1, maxLength: 240 },
            },
          },
        },
      },
    },
  },
});

export async function loadPendingOfferingTerms({ query, locationId = null, limit = 100_000 }) {
  if (typeof query !== "function") throw new TypeError("query must be a function.");
  const result = await query(`
    SELECT
      offering.raw_name AS source_text,
      count(*)::integer AS offering_count,
      count(DISTINCT offering.location_id)::integer AS location_count,
      (array_agg(DISTINCT location.country_code) FILTER (WHERE location.country_code IS NOT NULL))[1:8] AS country_codes,
      (array_agg(DISTINCT location.name) FILTER (WHERE location.name IS NOT NULL))[1:3] AS example_locations
    FROM fountain.offerings offering
    JOIN fountain.locations location ON location.id = offering.location_id
    LEFT JOIN fountain.offering_term_translations translation ON translation.source_text = offering.raw_name
    WHERE offering.status = 'active'
      AND offering.deleted_at IS NULL
      AND btrim(coalesce(offering.raw_name, '')) <> ''
      AND (
        translation.source_text IS NULL
        OR translation.prompt_version <> $3
        OR translation.review_status = 'needs_review'
      )
      AND ($1::integer IS NULL OR offering.location_id = $1)
    GROUP BY offering.raw_name
    ORDER BY count(*) DESC, offering.raw_name
    LIMIT $2
  `, [
    locationId == null ? null : positiveInteger(locationId, "locationId"),
    positiveInteger(limit, "limit"),
    OFFERING_TRANSLATION_PROMPT_VERSION,
  ]);
  return result.rows.map((row) => ({
    source_text: String(row.source_text),
    offering_count: Number(row.offering_count || 0),
    location_count: Number(row.location_count || 0),
    country_codes: row.country_codes || [],
    example_locations: row.example_locations || [],
  }));
}

export async function classifyOfferingTranslationBatch({
  terms,
  runId,
  model = OFFERING_TRANSLATION_MODEL,
  verificationModel = OFFERING_TRANSLATION_VERIFICATION_MODEL,
  llmClient = createLlmClient(),
}) {
  if (!Array.isArray(terms) || !terms.length) return { rows: [], completion: null };
  if (terms.length > OFFERING_TRANSLATION_MAX_BATCH_SIZE) {
    throw new Error(`Offering translation batch exceeds ${OFFERING_TRANSLATION_MAX_BATCH_SIZE} terms.`);
  }
  const keyedTerms = terms.map((term, index) => ({ ...term, term_key: index + 1 }));
  const completion = await llmClient.complete({
    runId,
    model,
    callType: "offering_translation",
    temperature: 0,
    maxTokens: OFFERING_TRANSLATION_MAX_TOKENS,
    responseFormat: OFFERING_TRANSLATION_RESPONSE_FORMAT,
    messages: [
      { role: "system", content: OFFERING_TRANSLATION_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          prompt_version: OFFERING_TRANSLATION_PROMPT_VERSION,
          target_language: "en",
          terms: keyedTerms.map((term) => ({
            term_key: term.term_key,
            source_text: term.source_text,
            country_codes: term.country_codes,
            example_locations: term.example_locations,
          })),
        }),
      },
    ],
  });
  const parsed = parseJson(completion.content);
  const translations = Array.isArray(parsed.translations) ? parsed.translations : [];
  const byKey = new Map(translations.map((row) => [Number(row.term_key), row]));
  if (byKey.size !== keyedTerms.length || keyedTerms.some((term) => !byKey.has(term.term_key))) {
    throw new Error(`Offering translation response coverage mismatch: expected ${keyedTerms.length}, received ${byKey.size}.`);
  }
  const firstPassRows = keyedTerms.map((term) => normalizeTranslation(term, byKey.get(term.term_key), completion.model || model));
  const candidates = keyedTerms.filter((term) => !firstPassRows[term.term_key - 1].is_english);
  const verified = candidates.length
    ? await verifyOfferingTranslationCandidates({
        candidates,
        firstPassRows,
        runId,
        model,
        verificationModel,
        llmClient,
      })
    : new Map();
  const rows = firstPassRows.map((row, index) => verified.get(index + 1) || row);
  return { rows, completion };
}

export async function verifyOfferingTranslationCandidates({
  candidates,
  firstPassRows,
  runId,
  model,
  verificationModel = OFFERING_TRANSLATION_VERIFICATION_MODEL,
  llmClient,
}) {
  const completion = await llmClient.complete({
    runId,
    model: verificationModel,
    callType: "offering_translation_verification",
    reasoning: { effort: "medium" },
    temperature: 0,
    maxTokens: OFFERING_TRANSLATION_MAX_TOKENS,
    responseFormat: OFFERING_TRANSLATION_VERIFICATION_RESPONSE_FORMAT,
    messages: [
      {
        role: "system",
        content: `Independently verify proposed English offering translations for a medical and wellness directory.

Judge the source text itself. Ignore clinic country and examples when deciding its language.
- should_translate=false if the source is already consumer-readable English. Do not rewrite English, expand abbreviations, correct spelling, change units, normalize punctuation, or reinterpret brands.
- Established brands, acronyms, transliterated proper names, and loanwords used in English do not alone require translation.
- should_translate=true only when consumer-relevant source words are genuinely non-English.
- When translation is needed, correct the proposal as necessary and preserve every medical detail, anatomy term, ordinal, quantity, dosage, session count, and brand.
- If should_translate=false, english_text must be null and source_language must be "en".
- Return every supplied term_key exactly once.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt_version: OFFERING_TRANSLATION_PROMPT_VERSION,
          terms: candidates.map((term) => ({
            term_key: term.term_key,
            source_text: term.source_text,
            proposed_source_language: firstPassRows[term.term_key - 1].source_language,
            proposed_english_text: firstPassRows[term.term_key - 1].english_text,
          })),
        }),
      },
    ],
  });
  const parsed = parseJson(completion.content);
  const verifications = Array.isArray(parsed.verifications) ? parsed.verifications : [];
  const byKey = new Map(verifications.map((row) => [Number(row.term_key), row]));
  if (byKey.size !== candidates.length || candidates.some((term) => !byKey.has(term.term_key))) {
    throw new Error(`Offering translation verification coverage mismatch: expected ${candidates.length}, received ${byKey.size}.`);
  }
  return new Map(candidates.map((term) => {
    const raw = byKey.get(term.term_key);
    return [term.term_key, normalizeVerifiedTranslation(term, raw, completion.model || verificationModel || model)];
  }));
}

export async function upsertOfferingTranslations(rows, { query, runId }) {
  if (!rows.length) return 0;
  const result = await query(`
    INSERT INTO fountain.offering_term_translations (
      source_text, source_language, english_text, is_english, confidence,
      model, prompt_version, review_status, last_run_id, rationale, created_at, updated_at
    )
    SELECT
      row.source_text, row.source_language, row.english_text, row.is_english, row.confidence,
      row.model, row.prompt_version, row.review_status, $2, row.rationale, now(), now()
    FROM jsonb_to_recordset($1::jsonb) AS row(
      source_text text, source_language text, english_text text, is_english boolean,
      confidence double precision, model text, prompt_version text, review_status text, rationale text
    )
    ON CONFLICT (source_text) DO UPDATE SET
      source_language = EXCLUDED.source_language,
      english_text = EXCLUDED.english_text,
      is_english = EXCLUDED.is_english,
      confidence = EXCLUDED.confidence,
      model = EXCLUDED.model,
      prompt_version = EXCLUDED.prompt_version,
      review_status = CASE
        WHEN fountain.offering_term_translations.review_status IN ('human_approved', 'human_rejected')
          THEN fountain.offering_term_translations.review_status
        ELSE EXCLUDED.review_status
      END,
      last_run_id = EXCLUDED.last_run_id,
      rationale = EXCLUDED.rationale,
      updated_at = now()
  `, [JSON.stringify(rows), runId]);
  return Number(result.rowCount || 0);
}

export async function refreshOfferingTranslationSearch({ query, runId, locationId = null }) {
  const result = await query(`
    SELECT count(*)::integer AS refreshed
    FROM (
      SELECT fountain.refresh_search_index_for_location(location.id)
      FROM fountain.locations location
      WHERE location.status = 'active'
        AND location.deleted_at IS NULL
        AND ($2::integer IS NULL OR location.id = $2)
        AND EXISTS (
          SELECT 1
          FROM fountain.offerings offering
          JOIN fountain.offering_term_translations translation
            ON translation.source_text = offering.raw_name
           AND translation.last_run_id = $1
          WHERE offering.location_id = location.id
            AND offering.status = 'active'
            AND offering.deleted_at IS NULL
        )
    ) refreshed_locations
  `, [runId, locationId]);
  return Number(result.rows[0]?.refreshed || 0);
}

export async function runOfferingTranslation({
  query,
  runId,
  apply = false,
  locationId = null,
  model = OFFERING_TRANSLATION_MODEL,
  verificationModel = OFFERING_TRANSLATION_VERIFICATION_MODEL,
  batchSize = OFFERING_TRANSLATION_BATCH_SIZE,
  concurrency = OFFERING_TRANSLATION_CONCURRENCY,
  limit = 100_000,
  budgetUsd = null,
  llmClient = createLlmClient({ query }),
  onProgress = () => {},
}) {
  const size = positiveInteger(batchSize, "batchSize");
  const workers = positiveInteger(concurrency, "concurrency");
  if (size > OFFERING_TRANSLATION_MAX_BATCH_SIZE) {
    throw new Error(`batchSize cannot exceed ${OFFERING_TRANSLATION_MAX_BATCH_SIZE}.`);
  }
  const pending = await loadPendingOfferingTerms({ query, locationId, limit });
  const batches = chunks(pending, size);
  if (!apply) {
    return { pending: pending.length, batches: batches.length, written: 0, translated: 0, english: 0, needs_review: 0, failed_batches: 0, refreshed: 0 };
  }
  const classified = [];
  let completedBatches = 0;
  let written = 0;
  let budgetExhausted = false;
  let failedBatches = 0;
  for (const wave of chunks(batches, workers)) {
    if (budgetUsd != null) {
      const spend = await query(`SELECT COALESCE(sum(cost_estimate_usd), 0)::numeric AS spend
        FROM fountain_ops.external_calls WHERE run_id=$1`, [runId]);
      if (Number(spend.rows[0]?.spend || 0) >= Number(budgetUsd)) {
        budgetExhausted = true;
        break;
      }
    }
    const settled = await Promise.allSettled(wave.map((terms) => (
      classifyOfferingTranslationBatch({ terms, runId, model, verificationModel, llmClient })
    )));
    const errors = [];
    for (const result of settled) {
      if (result.status === "rejected") {
        errors.push(result.reason);
        failedBatches += 1;
        continue;
      }
      written += await upsertOfferingTranslations(result.value.rows, { query, runId });
      classified.push(...result.value.rows);
      completedBatches += 1;
      await onProgress({ completedBatches, totalBatches: batches.length, classified: classified.length });
    }
    if (errors.length) {
      await onProgress({
        completedBatches,
        totalBatches: batches.length,
        classified: classified.length,
        failedBatches,
      });
    }
  }
  const refreshed = written ? await refreshOfferingTranslationSearch({ query, runId, locationId }) : 0;
  return {
    pending: pending.length,
    batches: batches.length,
    completed_batches: completedBatches,
    written,
    budget_exhausted: budgetExhausted,
    failed_batches: failedBatches,
    refreshed,
    ...summarize(classified),
  };
}

export function normalizeTranslation(term, raw, model) {
  const proposedEnglish = cleanText(raw?.english_text, 500);
  const isEnglish = Boolean(raw?.is_english);
  const confidence = boundedConfidence(raw?.confidence);
  const translated = isEnglish ? term.source_text : proposedEnglish;
  const safeEnglishText = translated || term.source_text;
  const reviewStatus = confidence >= OFFERING_TRANSLATION_CONFIDENCE_THRESHOLD && (isEnglish || Boolean(translated))
    ? "auto_approved"
    : "needs_review";
  return {
    source_text: term.source_text,
    source_language: cleanLanguage(raw?.source_language, isEnglish),
    english_text: safeEnglishText,
    is_english: isEnglish,
    confidence,
    model: cleanText(model, 200),
    prompt_version: OFFERING_TRANSLATION_PROMPT_VERSION,
    review_status: reviewStatus,
    rationale: cleanText(raw?.rationale, 240),
  };
}

export function normalizeVerifiedTranslation(term, raw, model) {
  const shouldTranslate = Boolean(raw?.should_translate);
  return normalizeTranslation(term, {
    source_language: shouldTranslate ? raw?.source_language : "en",
    is_english: !shouldTranslate,
    english_text: shouldTranslate ? raw?.english_text : null,
    confidence: raw?.confidence,
    rationale: raw?.rationale,
  }, model);
}

function summarize(rows) {
  return {
    translated: rows.filter((row) => !row.is_english && row.review_status === "auto_approved").length,
    english: rows.filter((row) => row.is_english && row.review_status === "auto_approved").length,
    needs_review: rows.filter((row) => row.review_status === "needs_review").length,
  };
}

function parseJson(value) {
  const text = String(value || "").trim();
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error(`Could not parse offering translation JSON: ${text.slice(0, 300)}`);
  }
}

function cleanLanguage(value, isEnglish) {
  const language = cleanText(value, 12).toLocaleLowerCase();
  if (isEnglish) return "en";
  return /^[a-z]{2,3}(?:-[a-z0-9]+)?$/u.test(language) ? language : "und";
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function boundedConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return number;
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
