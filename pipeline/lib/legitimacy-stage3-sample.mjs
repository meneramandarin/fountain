import { createHash } from "node:crypto";

import { query as defaultQuery } from "./db.mjs";
import { createLlmClient } from "./llm.mjs";
import { createPlacesClient } from "./places.mjs";
import { createWebClient } from "./web.mjs";
import { discoverWebsiteForLocation } from "./website-discovery.mjs";

export const LEGITIMACY_STAGE3_SAMPLE_CAMPAIGN = "pass1_stage3_proposal_sample";
export const LEGITIMACY_STAGE3_PROMPT_VERSION = "pass1-legitimacy-v3-proposal";
export const LEGITIMACY_STAGE3_CONFIDENCE_THRESHOLD = 0.9;
export const LEGITIMACY_STAGE3_SAMPLE_BATCH_SIZE = 4;

const CLASSES = new Set([
  "in_scope",
  "junk",
  "plain_hospital",
  "destination_medical",
  "review",
]);
const BASES = new Set([
  "consumer_wellness",
  "ordinary_care",
  "non_wellness_business",
  "research_only",
  "preventive_destination",
  "insufficient",
  "mixed",
]);

export const LEGITIMACY_STAGE3_SYSTEM_PROMPT = `You are the escalation-tier legitimacy reviewer for Fountain, a curated catalog of consumer longevity and wellness destinations.

The classification unit is the supplied subject. For organization subjects, pool and reconcile every supplied branch; return one organization verdict. Do not classify branches separately. Use only supplied evidence.

in_scope: the core business is consumer longevity, preventive, aesthetic, functional/integrative, recovery, or elective wellness care. Ordinary PT, chiropractic, injury rehabilitation, and ordinary medical treatment are not in_scope.

junk: affirmative evidence proves a non-wellness business, non-operating artifact, or research-only institution with no consumer-bookable care. Missing or sparse evidence is never junk.

plain_hospital: ordinary healthcare delivery, including hospitals, primary/urgent care, ordinary PT/chiro/rehab, and treatment tourism for surgery or disease care.

destination_medical: only an explicit consumer-facing preventive, diagnostic-for-the-well, executive-health, or longevity destination program. Treatment tourism is plain_hospital.

review: insufficient, contradictory, mixed, or uncertain evidence.

Every non-review result requires a concise positive_evidence statement grounded in supplied evidence. Use basis consumer_wellness for in_scope, ordinary_care for plain_hospital, non_wellness_business or research_only for junk, preventive_destination for destination_medical, and insufficient or mixed for review.`;

const RESPONSE_FORMAT = Object.freeze({
  type: "json_schema",
  json_schema: {
    name: "fountain_stage3_escalation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["results"],
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "classification_key",
              "class",
              "confidence",
              "basis",
              "positive_evidence",
              "rationale",
            ],
            properties: {
              classification_key: { type: "string" },
              class: {
                type: "string",
                enum: ["in_scope", "junk", "plain_hospital", "destination_medical", "review"],
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              basis: {
                type: "string",
                enum: [
                  "consumer_wellness",
                  "ordinary_care",
                  "non_wellness_business",
                  "research_only",
                  "preventive_destination",
                  "insufficient",
                  "mixed",
                ],
              },
              positive_evidence: { type: "string", maxLength: 400 },
              rationale: { type: "string", maxLength: 300 },
            },
          },
        },
      },
    },
  },
});

export async function runLegitimacyStage3ProposalSample(
  {
    data,
    runId,
    webSearch,
    confidenceThreshold = LEGITIMACY_STAGE3_CONFIDENCE_THRESHOLD,
    batchSize = LEGITIMACY_STAGE3_SAMPLE_BATCH_SIZE,
    concurrency = 4,
  },
  {
    llmClient = createLlmClient(),
    placesClient = createPlacesClient(),
    webClient = createWebClient(),
  } = {},
) {
  assertProposalData(data);
  const normalizedRunId = positiveIntegerString(runId, "runId");
  const threshold = boundedConfidence(confidenceThreshold, "confidenceThreshold");
  const normalizedBatchSize = positiveInteger(batchSize, "batchSize");
  const normalizedConcurrency = positiveInteger(concurrency, "concurrency");
  if (webSearch != null && typeof webSearch !== "function") {
    throw new TypeError("webSearch must be a function when supplied.");
  }

  const subjectsByKey = new Map(data.subjects.map((subject) => [subject.classificationKey, subject]));
  const sampleEntries = data.sampleRows.map((sampleRow) => {
    const subject = subjectsByKey.get(sampleRow.classificationKey);
    if (!subject) throw new Error(`Missing pooled subject ${sampleRow.classificationKey}.`);
    const branch = subject.branches.find((item) => item.locationId === sampleRow.locationId);
    if (!branch) throw new Error(`Missing sample branch ${sampleRow.locationId}.`);
    return { sampleRow, subject, branch };
  });

  const discoveryEntries = await mapConcurrent(sampleEntries, normalizedConcurrency, async (entry) => {
    const discovery = await discoverWebsiteForLocation({
      location: {
        id: entry.branch.locationId,
        name: entry.branch.name,
        address: entry.branch.address,
        locality: entry.branch.locality,
        region: entry.branch.region,
        postal_code: entry.branch.postalCode,
        country_code: entry.branch.countryCode,
        // Discovery is location-field specific. An organization domain remains
        // pooled classification evidence, but it must not masquerade as a
        // stored location website or bypass the approved discovery/write path.
        website: entry.branch.website,
      },
      externalPlaceMatches: entry.branch.externalPlaceMatches,
      runId: normalizedRunId,
    }, { placesClient, webSearch });

    let discoveredWebsiteEvidence = null;
    if (discovery.would_write_website) {
      discoveredWebsiteEvidence = await fetchDiscoveredWebsite(
        discovery.would_write_website,
        webClient,
      );
    }
    return { ...entry, discovery, discoveredWebsiteEvidence };
  });

  const batches = chunk(discoveryEntries, normalizedBatchSize);
  const batchResponses = await mapConcurrent(batches, normalizedConcurrency, async (batch) => {
    const modelInputs = batch.map(modelInput);
    const response = await llmClient.complete({
      runId: normalizedRunId,
      entityId: null,
      tier: "escalation",
      callType: "legitimacy_stage_3_proposal",
      messages: [
        { role: "system", content: LEGITIMACY_STAGE3_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            confidence_threshold: threshold,
            subjects: modelInputs,
          }),
        },
      ],
      responseFormat: RESPONSE_FORMAT,
      reasoning: { effort: "medium", exclude: true },
      // Gemini Flash reasoning tokens share the completion ceiling. Leave
      // enough room for medium reasoning plus the strict JSON response.
      maxTokens: 8_000,
      temperature: 0,
      maxAttempts: 4,
    });
    return { batch, response };
  });

  const results = [];
  const calls = [];
  for (const { batch, response } of batchResponses) {
    const parsed = parseStage3Response(
      response.content,
      batch.map((entry) => entry.subject.classificationKey),
      { confidenceThreshold: threshold },
    );
    calls.push({
      externalCallId: response.externalCallId,
      model: response.model,
      usage: response.usage,
      costEstimateUsd: response.costEstimateUsd,
      attempts: response.attempts,
      batchSize: batch.length,
    });
    for (const entry of batch) {
      const classification = parsed.get(entry.subject.classificationKey);
      results.push({
        locationId: entry.sampleRow.locationId,
        classificationKey: entry.subject.classificationKey,
        class: classification.class,
        confidence: classification.confidence,
        basis: classification.basis,
        positiveEvidence: classification.positiveEvidence,
        rationale: classification.rationale,
        normalizationFlags: classification.normalizationFlags,
        model: response.model,
        externalCallId: response.externalCallId,
        discoveryOutcome: entry.discovery.outcome,
        discoverySource: entry.discovery.source,
        wouldWriteWebsite: entry.discovery.would_write_website,
        discovery: entry.discovery,
        servingWriteAttempted: false,
        servingWritten: false,
      });
    }
  }
  results.sort((left, right) => data.sampleIds.indexOf(left.locationId)
    - data.sampleIds.indexOf(right.locationId));
  return {
    runId: normalizedRunId,
    campaign: LEGITIMACY_STAGE3_SAMPLE_CAMPAIGN,
    promptVersion: LEGITIMACY_STAGE3_PROMPT_VERSION,
    confidenceThreshold: threshold,
    batchSize: normalizedBatchSize,
    concurrency: normalizedConcurrency,
    results,
    calls,
    servingWrites: { attempted: 0, written: 0 },
  };
}

export function parseStage3Response(content, expectedKeys, {
  confidenceThreshold = LEGITIMACY_STAGE3_CONFIDENCE_THRESHOLD,
} = {}) {
  const expected = [...new Set(expectedKeys.map((key) => nonemptyString(key, "classification key")))];
  const threshold = boundedConfidence(confidenceThreshold, "confidenceThreshold");
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(String(content || "")));
  } catch {
    return new Map(expected.map((key) => [key, reviewResult("invalid_json_response")]));
  }
  if (!Array.isArray(parsed?.results)) {
    return new Map(expected.map((key) => [key, reviewResult("missing_results_array")]));
  }
  const expectedSet = new Set(expected);
  const seen = new Set();
  let invalidSet = false;
  for (const item of parsed.results) {
    const key = String(item?.classification_key || "");
    if (!expectedSet.has(key) || seen.has(key)) invalidSet = true;
    seen.add(key);
  }
  if (invalidSet || expected.some((key) => !seen.has(key))) {
    return new Map(expected.map((key) => [key, reviewResult("id_set_mismatch")]));
  }
  const byKey = new Map(parsed.results.map((item) => [item.classification_key, item]));
  return new Map(expected.map((key) => [key, normalizeClassification(byKey.get(key), threshold)]));
}

export async function persistLegitimacyStage3ProposalSample(
  { data, sample, runId, replaceExisting = false },
  { query = defaultQuery } = {},
) {
  assertProposalData(data);
  if (!sample || !Array.isArray(sample.results) || sample.results.length !== data.sampleRows.length) {
    throw new Error("Stage 3 proposal sample results must reconcile before persistence.");
  }
  const normalizedRunId = positiveIntegerString(runId, "runId");
  const rows = data.sampleRows.map((sampleRow) => {
    const result = sample.results.find((item) => item.locationId === sampleRow.locationId);
    if (!result) throw new Error(`Missing Stage 3 result for ${sampleRow.locationId}.`);
    return {
      entity_id: sampleRow.locationId,
      payload: {
        schema_version: 1,
        campaign: LEGITIMACY_STAGE3_SAMPLE_CAMPAIGN,
        prompt_version: LEGITIMACY_STAGE3_PROMPT_VERSION,
        stage: "stage_3_escalation_proposal",
        confidence_threshold: sample.confidenceThreshold,
        classification_level: sampleRow.classificationKey.startsWith("organization:")
          ? "organization"
          : "location",
        classification_key: sampleRow.classificationKey,
        affected_location_ids: data.subjects
          .find((subject) => subject.classificationKey === sampleRow.classificationKey)?.locationIds || [],
        serving_writes_enabled: false,
      },
      result: {
        schema_version: 1,
        campaign: LEGITIMACY_STAGE3_SAMPLE_CAMPAIGN,
        prompt_version: LEGITIMACY_STAGE3_PROMPT_VERSION,
        outcome: "classified",
        final: {
          class: result.class,
          confidence: result.confidence,
          basis: result.basis,
          positive_evidence: result.positiveEvidence,
          rationale: result.rationale,
          model: result.model,
          normalization_flags: result.normalizationFlags,
        },
        discovery: result.discovery,
        serving_write: { attempted: false, written: false },
      },
    };
  });
  const result = await executeQuery(query, `
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb) AS item(
        entity_id integer,
        payload jsonb,
        result jsonb
      )
    ), existing AS (
      SELECT count(*)::integer AS count
      FROM fountain_ops.task_queue queue
      WHERE queue.task_type = 'legitimacy_check'
        AND queue.payload->>'campaign' = $2
        AND queue.payload->>'prompt_version' = $3
    ), updated AS (
      UPDATE fountain_ops.task_queue queue
      SET payload = input.payload,
          result = input.result,
          run_id = $4::bigint,
          status = 'done',
          error = NULL,
          updated_at = now()
      FROM input, existing
      WHERE $5::boolean
        AND existing.count = $6::integer
        AND queue.task_type = 'legitimacy_check'
        AND queue.entity_type = 'location'
        AND queue.entity_id = input.entity_id
        AND queue.payload->>'campaign' = $2
        AND queue.payload->>'prompt_version' = $3
      RETURNING queue.entity_id
    ), inserted AS (
      INSERT INTO fountain_ops.task_queue (
        task_type, entity_type, entity_id, priority, payload, status,
        attempts, max_attempts, result, run_id
      )
      SELECT
        'legitimacy_check', 'location', input.entity_id, 20, input.payload,
        'done', 1, 1, input.result, $4::bigint
      FROM input, existing
      WHERE existing.count = 0
        AND NOT $5::boolean
      ORDER BY input.entity_id
      RETURNING entity_id
    )
    SELECT
      (SELECT count FROM existing)::integer AS existing_count,
      (SELECT count(*) FROM inserted)::integer AS inserted_count,
      (SELECT count(*) FROM updated)::integer AS updated_count
  `, [
    JSON.stringify(rows),
    LEGITIMACY_STAGE3_SAMPLE_CAMPAIGN,
    LEGITIMACY_STAGE3_PROMPT_VERSION,
    normalizedRunId,
    Boolean(replaceExisting),
    rows.length,
  ]);
  const counts = rowsFrom(result)[0] || {};
  const inserted = Number(counts.inserted_count);
  const updated = Number(counts.updated_count);
  const validInsert = !replaceExisting && Number(counts.existing_count) === 0 && inserted === rows.length;
  const validUpdate = replaceExisting
    && Number(counts.existing_count) === rows.length
    && updated === rows.length;
  if (!validInsert && !validUpdate) {
    throw new Error(
      `Stage 3 proposal task evidence did not reconcile: existing=${counts.existing_count}, `
        + `inserted=${inserted}, updated=${updated}/${rows.length}.`,
    );
  }
  return { inserted, updated, servingWrites: 0 };
}

function modelInput(entry) {
  const { subject, discoveredWebsiteEvidence, discovery } = entry;
  return {
    classification_key: subject.classificationKey,
    classification_level: subject.classificationLevel,
    organization_evidence: subject.organizationEvidence,
    prior_classes: subject.priorClasses,
    organization_conflict: subject.organizationConflict,
    normalization_flags: subject.normalizationFlags,
    branches: subject.branches.map((branch) => ({
      location_id: branch.locationId,
      name: branch.name,
      address: branch.address,
      locality: branch.locality,
      region: branch.region,
      postal_code: branch.postalCode,
      country_code: branch.countryCode,
      website: branch.website,
      source_slugs: branch.sourceSlugs,
      offering_names: branch.offeringNames,
      tags: branch.tags,
      prior_gate_b: branch.priorGateB,
    })),
    pooled_evidence: subject.pooledEvidence,
    website_discovery: {
      outcome: discovery.outcome,
      source: discovery.source,
      would_write_website: discovery.would_write_website,
      validation: discovery.validation,
      fetched_evidence: discoveredWebsiteEvidence,
    },
  };
}

async function fetchDiscoveredWebsite(url, webClient) {
  try {
    const page = await webClient.fetchHomepage(url);
    return {
      ok: Boolean(page.ok),
      url: page.finalUrl || page.requestedUrl || url,
      title: truncate(page.title, 500),
      description: truncate(page.description, 1_000),
      text_excerpt: truncate(page.textExcerpt, 3_000),
      outcome: page.outcome || (page.ok ? "ok" : "fetch_failed"),
    };
  } catch (error) {
    return { ok: false, url, outcome: "network_error", error: String(error?.message || error) };
  }
}

function normalizeClassification(item, threshold) {
  const rawClass = CLASSES.has(item?.class) ? item.class : "review";
  const confidence = boundedConfidence(item?.confidence, "classification confidence", 0);
  const basis = BASES.has(item?.basis) ? item.basis : "insufficient";
  const positiveEvidence = truncate(item?.positive_evidence, 400);
  const rationale = truncate(item?.rationale, 300) || "Escalation evidence was insufficient.";
  const flags = [];
  let className = rawClass;
  if (confidence < threshold && className !== "review") {
    className = "review";
    flags.push("forced_review_below_threshold");
  }
  if (className !== "review" && !positiveEvidence) {
    className = "review";
    flags.push("missing_positive_evidence");
  }
  if (className === "junk" && !["non_wellness_business", "research_only"].includes(basis)) {
    className = "review";
    flags.push("junk_without_affirmative_basis");
  }
  if (className === "destination_medical" && basis !== "preventive_destination") {
    className = "review";
    flags.push("destination_without_qualifying_basis");
  }
  if (className === "in_scope" && basis !== "consumer_wellness") {
    className = "review";
    flags.push("in_scope_without_consumer_wellness_basis");
  }
  if (className === "plain_hospital" && basis !== "ordinary_care") {
    className = "review";
    flags.push("plain_hospital_without_ordinary_care_basis");
  }
  return {
    class: className,
    confidence,
    basis,
    positiveEvidence,
    rationale,
    normalizationFlags: flags,
  };
}

function reviewResult(flag) {
  return {
    class: "review",
    confidence: 0,
    basis: "insufficient",
    positiveEvidence: "",
    rationale: "Escalation response was invalid; human review is required.",
    normalizationFlags: [flag],
  };
}

async function mapConcurrent(values, concurrency, operation) {
  const results = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await operation(values[index], index);
    }
  }));
  return results;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function assertProposalData(data) {
  if (!data || !Array.isArray(data.sampleRows) || data.sampleRows.length !== 50) {
    throw new Error("Stage 3 proposal data must contain exactly 50 sample rows.");
  }
  if (!Array.isArray(data.subjects) || !Array.isArray(data.sampleIds)) {
    throw new Error("Stage 3 proposal data requires pooled subjects and sample ids.");
  }
}

function stripCodeFence(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return match ? match[1] : trimmed;
}

function truncate(value, length) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ").trim().slice(0, length);
}

function nonemptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be non-empty.`);
  return value.trim();
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be positive.`);
  return number;
}

function positiveIntegerString(value, label) {
  const string = String(value ?? "");
  if (!/^[1-9]\d*$/u.test(string)) throw new TypeError(`${label} must be a positive integer.`);
  return string;
}

function boundedConfidence(value, label, fallback = null) {
  if ((value == null || value === "") && fallback !== null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new TypeError(`${label} must be between 0 and 1.`);
  }
  return number;
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or pg-compatible client.");
}

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

export function stage3SampleInputFingerprint(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
