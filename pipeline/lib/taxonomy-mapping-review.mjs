import { createLlmClient } from "./llm.mjs";
import { normalizeTaxonomyTerm } from "./taxonomy-term.mjs";

export const TAXONOMY_MAPPING_REVIEW_MODEL = "openai/gpt-5.5";
export const TAXONOMY_MAPPING_REVIEW_PROMPT_VERSION = "taxonomy-mapping-review-v1";
export const TAXONOMY_MAPPING_REVIEW_BATCH_SIZE = 12;
export const TAXONOMY_MAPPING_REVIEW_MIN_CONFIDENCE = 0.85;

const DECISIONS = ["keep_mapping", "remap_existing", "unmap_valid_service", "reject_non_service"];

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "fountain_taxonomy_mapping_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["reviews"],
      properties: {
        reviews: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["term_normalized", "decision", "target_treatment_id", "confidence", "rationale"],
            properties: {
              term_normalized: { type: "string", minLength: 1, maxLength: 300 },
              decision: { type: "string", enum: DECISIONS },
              target_treatment_id: { type: ["integer", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string", minLength: 1, maxLength: 500 },
            },
          },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are the senior taxonomy safety reviewer for a medical and wellness directory.
Review whether each clinic menu term is truthfully mapped to its current canonical treatment. A mapping controls both public tags and treatment landing-page membership, so false positives are harmful.

Choose exactly one decision:
- keep_mapping: the term is the same treatment, a genuine synonym, a brand/product in that treatment family, or a legitimate narrower subtype.
- remap_existing: another supplied canonical treatment is clearly a better truthful mapping.
- unmap_valid_service: it is a real service, but none of the supplied canonical treatments is a sufficiently accurate match.
- reject_non_service: it is not a treatment/service menu item (for example a fee, product-only item, administrative label, or unusable fragment).

Rules:
- Never force a broad or merely adjacent concept into a canonical treatment.
- A shared word, body part, device acronym, or vague wellness association is not semantic equivalence.
- Prefer unmap_valid_service when the service is real but the taxonomy lacks it.
- remap_existing must use an ID from canonical_treatments; all other decisions must return null target_treatment_id.
- Judge the complete meaning of the source term, not token overlap.
- Return every supplied term_normalized exactly once.`;

export async function loadSuspectMappings(query, { limit = 100_000 } = {}) {
  const [candidateResult, treatmentResult] = await Promise.all([
    query(`
      SELECT
        alias.treatment_id AS old_treatment_id,
        treatment.canonical_name AS old_treatment_name,
        alias.alias_normalized AS term_normalized,
        (array_agg(alias.alias_text ORDER BY length(alias.alias_text), alias.alias_text))[1] AS display_term,
        array_agg(alias.id ORDER BY alias.id)::integer[] AS alias_ids,
        count(*)::integer AS alias_rows
      FROM fountain_raw.treatment_aliases alias
      JOIN fountain.treatments treatment ON treatment.id = alias.treatment_id
      WHERE alias.mapping_reviewed_at IS NULL
        AND alias.mapping_status = 'needs_review'
      GROUP BY alias.treatment_id, treatment.canonical_name, alias.alias_normalized
      ORDER BY alias.treatment_id, alias.alias_normalized
      LIMIT $1
    `, [limit]),
    query(`SELECT id, canonical_name, category FROM fountain.treatments ORDER BY id`),
  ]);
  const candidates = candidateResult.rows.map((row) => ({
    old_treatment_id: Number(row.old_treatment_id),
    old_treatment_name: row.old_treatment_name,
    term_normalized: row.term_normalized,
    display_term: row.display_term,
    alias_ids: row.alias_ids.map(Number),
    offering_ids: [],
    examples: [],
  }));
  if (candidates.length) await attachAffectedOfferings(query, candidates);
  return { candidates, treatments: treatmentResult.rows.map((row) => ({ ...row, id: Number(row.id) })) };
}

async function attachAffectedOfferings(query, candidates) {
  const treatmentIds = [...new Set(candidates.map((row) => row.old_treatment_id))];
  const result = await query(`
    SELECT offering.id, offering.treatment_id, offering.raw_name,
           CASE WHEN offering.price_amount IS NULL THEN NULL
             ELSE concat(offering.price_currency, ' ', offering.price_amount) END AS price_text,
           location.name AS location_name
    FROM fountain.offerings offering
    JOIN fountain.locations location ON location.id = offering.location_id
    WHERE offering.treatment_id = ANY($1::integer[])
      AND offering.status = 'active' AND offering.deleted_at IS NULL
  `, [treatmentIds]);
  const index = new Map(candidates.map((row) => [`${row.old_treatment_id}:${row.term_normalized}`, row]));
  for (const offering of result.rows) {
    const key = `${offering.treatment_id}:${normalizeTaxonomyTerm(offering.raw_name)}`;
    const candidate = index.get(key);
    if (!candidate) continue;
    candidate.offering_ids.push(Number(offering.id));
    if (candidate.examples.length < 3) {
      candidate.examples.push({ location: offering.location_name, raw_name: offering.raw_name, price: offering.price_text });
    }
  }
}

export async function runTaxonomyMappingReview({
  query,
  runId,
  model = TAXONOMY_MAPPING_REVIEW_MODEL,
  batchSize = TAXONOMY_MAPPING_REVIEW_BATCH_SIZE,
  limit = 100_000,
  budgetUsd = null,
  apply = false,
  llmClient = createLlmClient({ query }),
  onProgress = () => {},
}) {
  const { candidates, treatments } = await loadSuspectMappings(query, { limit });
  const reviewed = [];
  const batches = chunk(candidates, batchSize);
  for (let index = 0; index < batches.length; index += 1) {
    if (budgetUsd != null) {
      const spend = await query(`SELECT COALESCE(sum(cost_estimate_usd), 0)::numeric AS spend
        FROM fountain_ops.external_calls WHERE run_id=$1`, [runId]);
      if (Number(spend.rows[0]?.spend || 0) >= Number(budgetUsd)) break;
    }
    const terms = batches[index];
    const first = await reviewBatch({ llmClient, runId, model, terms, treatments, pass: 1 });
    const second = await reviewBatch({ llmClient, runId, model, terms, treatments, pass: 2, prior: first });
    const rows = reconcileMappingReviews(terms, first, second, treatments, model);
    await persistReviews(query, runId, rows);
    reviewed.push(...rows);
    onProgress({ batch: index + 1, batches: batches.length, reviewed: reviewed.length });
  }
  let application = { applied: 0, offerings_changed: 0, aliases_changed: 0, locations_refreshed: 0 };
  if (apply) application = await applyConsensusReviews(query, runId);
  return { candidates: candidates.length, reviewed: reviewed.length, ...summarize(reviewed), application };
}

async function reviewBatch({ llmClient, runId, model, terms, treatments, pass, prior = null }) {
  const completion = await llmClient.complete({
    runId,
    model,
    callType: `taxonomy_mapping_review_pass_${pass}`,
    reasoning: { effort: "medium" },
    temperature: 0,
    maxTokens: 8_000,
    responseFormat: RESPONSE_FORMAT,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({
        prompt_version: TAXONOMY_MAPPING_REVIEW_PROMPT_VERSION,
        review_pass: pass,
        instruction: pass === 1
          ? "Make an independent semantic judgment."
          : "Act as an independent adjudicator. Re-check each mapping; do not defer to the first pass.",
        canonical_treatments: treatments,
        terms: terms.map((term) => ({
          term_normalized: term.term_normalized,
          display_term: term.display_term,
          current_mapping: { id: term.old_treatment_id, name: term.old_treatment_name },
          active_offering_count: term.offering_ids.length,
          examples: term.examples,
          ...(pass === 2 ? { first_pass: prior.get(term.term_normalized) } : {}),
        })),
      }) },
    ],
  });
  const parsed = parseJson(completion.content);
  const result = new Map((parsed.reviews || []).map((row) => [row.term_normalized, normalizeDecision(row, treatments)]));
  const expected = new Set(terms.map((term) => term.term_normalized));
  if (result.size !== expected.size || [...result.keys()].some((key) => !expected.has(key))) {
    throw new Error(`Mapping review pass ${pass} coverage mismatch: expected ${expected.size}, received ${result.size}.`);
  }
  return result;
}

export function reconcileMappingReviews(terms, first, second, treatments, model) {
  const ids = new Set(treatments.map((row) => row.id));
  return terms.map((term) => {
    const a = first.get(term.term_normalized);
    const b = second.get(term.term_normalized);
    const same = a.decision === b.decision
      && (a.decision !== "remap_existing" || a.target_treatment_id === b.target_treatment_id);
    const confident = a.confidence >= TAXONOMY_MAPPING_REVIEW_MIN_CONFIDENCE
      && b.confidence >= TAXONOMY_MAPPING_REVIEW_MIN_CONFIDENCE;
    const validTarget = a.decision !== "remap_existing" || (ids.has(a.target_treatment_id) && a.target_treatment_id !== term.old_treatment_id);
    const consensus = same && confident && validTarget;
    return {
      ...term,
      first_pass: a,
      second_pass: b,
      final_decision: consensus ? a.decision : "unresolved",
      proposed_treatment_id: consensus && a.decision === "remap_existing" ? a.target_treatment_id : null,
      consensus_confidence: consensus ? Math.min(a.confidence, b.confidence) : null,
      model,
      review_status: consensus ? "consensus" : "needs_review",
    };
  });
}

async function persistReviews(query, runId, rows) {
  for (const row of rows) {
    await query(`
      INSERT INTO fountain_raw.treatment_mapping_reviews (
        run_id, term_normalized, display_term, old_treatment_id, proposed_treatment_id,
        first_pass, second_pass, final_decision, consensus_confidence, model,
        prompt_version, review_status, affected_alias_ids, affected_offering_ids
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13::integer[],$14::bigint[])
      ON CONFLICT (run_id, term_normalized, old_treatment_id) DO UPDATE SET
        proposed_treatment_id=excluded.proposed_treatment_id, first_pass=excluded.first_pass,
        second_pass=excluded.second_pass, final_decision=excluded.final_decision,
        consensus_confidence=excluded.consensus_confidence, review_status=excluded.review_status,
        affected_alias_ids=excluded.affected_alias_ids, affected_offering_ids=excluded.affected_offering_ids
    `, [runId, row.term_normalized, row.display_term, row.old_treatment_id, row.proposed_treatment_id,
      JSON.stringify(row.first_pass), JSON.stringify(row.second_pass), row.final_decision,
      row.consensus_confidence, row.model, TAXONOMY_MAPPING_REVIEW_PROMPT_VERSION,
      row.review_status, row.alias_ids, row.offering_ids]);
  }
}

export async function applyConsensusReviews(query, runId) {
  const result = await query(`SELECT * FROM fountain_raw.treatment_mapping_reviews
    WHERE run_id=$1 AND review_status='consensus' AND applied=false ORDER BY id`, [runId]);
  const summary = { applied: 0, offerings_changed: 0, aliases_changed: 0, locations_refreshed: 0 };
  for (const review of result.rows) {
    await query("BEGIN");
    try {
      await query(`INSERT INTO fountain_raw.treatment_mapping_offering_backup
        (review_id, offering_id, previous_treatment_id)
        SELECT $1, id, treatment_id FROM fountain.offerings WHERE id=ANY($2::bigint[])
        ON CONFLICT DO NOTHING`, [review.id, review.affected_offering_ids]);
      let aliasResult;
      let offeringResult = { rowCount: 0, rows: [] };
      if (review.final_decision === "keep_mapping") {
        aliasResult = await query(`UPDATE fountain_raw.treatment_aliases SET mapping_status='active',
          mapping_confidence=$2, mapping_review_model=$3, mapping_reviewed_at=now(),
          mapping_review_rationale=$4 WHERE id=ANY($1::integer[])`,
        [review.affected_alias_ids, review.consensus_confidence, review.model, review.second_pass.rationale]);
      } else {
        const remap = review.final_decision === "remap_existing";
        aliasResult = await query(`UPDATE fountain_raw.treatment_aliases SET
          treatment_id=CASE WHEN $2::boolean THEN $3::integer ELSE treatment_id END,
          mapping_status=CASE WHEN $2::boolean THEN 'active' ELSE 'rejected' END,
          mapping_confidence=$4, mapping_review_model=$5, mapping_reviewed_at=now(),
          mapping_review_rationale=$6 WHERE id=ANY($1::integer[])`,
        [review.affected_alias_ids, remap, review.proposed_treatment_id, review.consensus_confidence,
          review.model, review.second_pass.rationale]);
        offeringResult = await query(`UPDATE fountain.offerings SET treatment_id=$2, updated_at=now()
          WHERE id=ANY($1::bigint[]) RETURNING location_id`,
        [review.affected_offering_ids, remap ? review.proposed_treatment_id : null]);
      }
      const locationIds = [...new Set(offeringResult.rows.map((row) => Number(row.location_id)))];
      for (const locationId of locationIds) await query("SELECT fountain.refresh_search_index_for_location($1)", [locationId]);
      await query(`UPDATE fountain_raw.treatment_mapping_reviews SET applied=true,
        review_status='applied', applied_at=now() WHERE id=$1`, [review.id]);
      await query("COMMIT");
      summary.applied += 1;
      summary.aliases_changed += aliasResult.rowCount;
      summary.offerings_changed += offeringResult.rowCount;
      summary.locations_refreshed += locationIds.length;
    } catch (error) {
      await query("ROLLBACK");
      throw error;
    }
  }
  return summary;
}

function normalizeDecision(row, treatments) {
  const decision = DECISIONS.includes(row?.decision) ? row.decision : "unmap_valid_service";
  const target = row?.target_treatment_id == null ? null : Number(row.target_treatment_id);
  const targetValid = treatments.some((item) => item.id === target);
  return {
    decision,
    target_treatment_id: decision === "remap_existing" && targetValid ? target : null,
    confidence: Math.max(0, Math.min(1, Number(row?.confidence) || 0)),
    rationale: String(row?.rationale || "No rationale supplied.").replace(/\s+/gu, " ").trim().slice(0, 500),
  };
}

function parseJson(value) {
  const text = String(value || "").trim();
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error(`Could not parse mapping review JSON: ${text.slice(0, 300)}`);
  }
}

function chunk(items, size) {
  if (!Number.isInteger(size) || size < 1 || size > 20) throw new Error("batchSize must be between 1 and 20.");
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function summarize(rows) {
  const decisions = {};
  let consensus = 0;
  for (const row of rows) {
    decisions[row.final_decision] = (decisions[row.final_decision] || 0) + 1;
    if (row.review_status === "consensus") consensus += 1;
  }
  return { consensus, needs_review: rows.length - consensus, decisions };
}
