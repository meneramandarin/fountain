import { createLlmClient } from "./llm.mjs";
import { createPlacesClient } from "./places.mjs";
import { createWebClient } from "./web.mjs";
import {
  query as defaultQuery,
  setMutationActor as defaultSetMutationActor,
  withTransaction as defaultWithTransaction,
} from "./db.mjs";
import { recordWrite as defaultRecordWrite } from "./ledger.mjs";
import { HARD_EXCLUSION_PREDICATE_SQL } from "./legitimacy-sample.mjs";
import {
  LEGITIMACY_STAGE3_SYSTEM_PROMPT,
  parseStage3Response,
} from "./legitimacy-stage3-sample.mjs";
import {
  buildLegitimacyStage3FullPlan,
  LEGITIMACY_STAGE3_FULL_CAMPAIGN,
  LEGITIMACY_STAGE3_FULL_CONCURRENCY,
  LEGITIMACY_STAGE3_FULL_CONFIDENCE_THRESHOLD,
  LEGITIMACY_STAGE3_FULL_EXPECTED_COUNTS,
  LEGITIMACY_STAGE3_FULL_PROMPT_VERSION,
} from "./legitimacy-stage3-full.mjs";
import { discoverWebsiteForLocation as defaultDiscoverWebsite } from "./website-discovery.mjs";

export const LEGITIMACY_STAGE3_APPLY_ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607120003";
export const LEGITIMACY_STAGE3_EXPECTED_BLANK_WEBSITES = 60;
export const LEGITIMACY_STAGE3_BATCH_SIZE = 8;
export const LEGITIMACY_STAGE3_LLM_CEILING_USD = 500;
export const LEGITIMACY_STAGE3_FAILURE_WINDOW = 500;
export const LEGITIMACY_STAGE3_FAILURE_RATE = 0.25;

const RESPONSE_FORMAT = Object.freeze({
  type: "json_schema",
  json_schema: {
    name: "fountain_stage3_full_escalation",
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
              positive_evidence: { type: "string", maxLength: 500 },
              rationale: { type: "string", maxLength: 400 },
            },
          },
        },
      },
    },
  },
});

const HARD_EXCLUSION_SQL = `
  SELECT location.id
  FROM fountain.locations location
  LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
  WHERE location.id = ANY($1::integer[])
    AND ${HARD_EXCLUSION_PREDICATE_SQL
    .replaceAll("l.", "location.")
    .replaceAll("o.", "organization.")}
  ORDER BY location.id
`;

/**
 * Run provider discovery and escalation classification, then atomically write
 * accepted websites plus the complete 2,156-row Stage 3 evidence set. Status
 * suppression is deliberately a separate atomic recipe driven by the returned
 * reconciled plan.
 */
export async function executeLegitimacyStage3Full(
  {
    data,
    runId,
    webSearch,
    apply = false,
    confidenceThreshold = LEGITIMACY_STAGE3_FULL_CONFIDENCE_THRESHOLD,
    concurrency = LEGITIMACY_STAGE3_FULL_CONCURRENCY,
    batchSize = LEGITIMACY_STAGE3_BATCH_SIZE,
    expectedCounts = LEGITIMACY_STAGE3_FULL_EXPECTED_COUNTS,
    expectedBlankWebsiteCount = LEGITIMACY_STAGE3_EXPECTED_BLANK_WEBSITES,
    llmCeilingUsd = LEGITIMACY_STAGE3_LLM_CEILING_USD,
  } = {},
  {
    llmClient = createLlmClient(),
    placesClient = createPlacesClient(),
    webClient = createWebClient(),
    discoverWebsite = defaultDiscoverWebsite,
    query = defaultQuery,
    withTransaction = defaultWithTransaction,
    setMutationActor = defaultSetMutationActor,
    recordWrite = defaultRecordWrite,
  } = {},
) {
  assertData(data, expectedCounts);
  const normalizedRunId = positiveIntegerString(runId, "runId");
  const threshold = boundedConfidence(confidenceThreshold, "confidenceThreshold");
  const workerCount = positiveInteger(concurrency, "concurrency");
  const normalizedBatchSize = positiveInteger(batchSize, "batchSize");
  const blankCount = nonnegativeInteger(expectedBlankWebsiteCount, "expectedBlankWebsiteCount");
  const ceiling = positiveNumber(llmCeilingUsd, "llmCeilingUsd");
  if (typeof webSearch !== "function") throw new TypeError("webSearch must be a function.");

  const branches = data.subjects.flatMap((subject) => subject.branches);
  const blankBranches = branches.filter((branch) => !text(branch.website));
  if (blankBranches.length !== blankCount) {
    throw new Error(`Stage 3 blank-website cohort drifted: ${blankBranches.length}/${blankCount}.`);
  }

  const discoveryEvidence = await mapConcurrent(blankBranches, workerCount, async (branch) => {
    const discovery = await discoverWebsite({
      location: branchLocation(branch),
      externalPlaceMatches: branch.externalPlaceMatches,
      runId: normalizedRunId,
    }, { placesClient, webSearch });
    const fetchedWebsite = discovery.would_write_website
      ? await fetchWebsiteEvidence(discovery.would_write_website, webClient)
      : null;
    return {
      ...discovery,
      fetched_website: fetchedWebsite,
    };
  });
  const discoveryByLocation = new Map(
    discoveryEvidence.map((result) => [Number(result.location_id), result]),
  );

  const batches = chunk(data.subjects, normalizedBatchSize);
  const classifiedBatches = await mapConcurrent(batches, workerCount, async (subjects) => {
    try {
      const response = await llmClient.complete({
        runId: normalizedRunId,
        entityId: null,
        tier: "escalation",
        callType: "legitimacy_stage_3_full",
        messages: [
          { role: "system", content: LEGITIMACY_STAGE3_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              confidence_threshold: threshold,
              subjects: subjects.map((subject) => subjectModelInput(subject, discoveryByLocation)),
            }),
          },
        ],
        responseFormat: RESPONSE_FORMAT,
        reasoning: { effort: "medium", exclude: true },
        maxTokens: 8_000,
        temperature: 0,
        maxAttempts: 4,
      });
      const parsed = parseStage3Response(
        response.content,
        subjects.map((subject) => subject.classificationKey),
        { confidenceThreshold: threshold },
      );
      const results = subjects.map((subject) => {
        const result = parsed.get(subject.classificationKey);
        return {
          classificationKey: subject.classificationKey,
          class: result.class,
          confidence: result.confidence,
          basis: result.basis,
          positiveEvidence: result.positiveEvidence,
          rationale: result.rationale,
          normalizationFlags: result.normalizationFlags,
          model: response.model,
          externalCallId: response.externalCallId,
          providerFailure: result.normalizationFlags.some((flag) => (
            ["invalid_json_response", "missing_results_array", "id_set_mismatch"].includes(flag)
          )),
        };
      });
      return {
        results,
        call: {
          externalCallId: response.externalCallId,
          model: response.model,
          usage: response.usage,
          costEstimateUsd: response.costEstimateUsd,
          attempts: response.attempts,
          subjectCount: subjects.length,
        },
      };
    } catch (error) {
      return {
        results: subjects.map((subject) => providerFailureResult(subject, error)),
        call: {
          externalCallId: null,
          model: "",
          usage: {},
          costEstimateUsd: 0,
          attempts: 0,
          subjectCount: subjects.length,
          error: errorMessage(error),
        },
      };
    }
  });

  const subjectResults = classifiedBatches.flatMap((batch) => batch.results);
  const calls = classifiedBatches.map((batch) => batch.call);
  assertFailureRate(subjectResults);
  const estimatedLlmSpend = calls.reduce(
    (sum, call) => sum + nonnegativeNumber(call.costEstimateUsd || 0, "call cost"),
    0,
  );
  if (estimatedLlmSpend > ceiling) {
    throw new Error(`Stage 3 LLM ceiling exceeded: $${estimatedLlmSpend.toFixed(4)} > $${ceiling.toFixed(2)}.`);
  }

  const aai = subjectResults.find((result) => result.classificationKey === "organization:4308");
  if (!aai || aai.class !== "in_scope") {
    throw new Error(`Stage 3 AAI invariant failed: ${aai?.class || "missing"}.`);
  }

  const locationIds = branches.map((branch) => branch.locationId);
  const hardExclusions = await loadHardExclusions(query, locationIds);
  let plan = buildLegitimacyStage3FullPlan({
    data,
    subjectResults,
    discoveryResults: discoveryEvidence,
    hardExclusions,
    confidenceThreshold: threshold,
    concurrency: workerCount,
    expectedCounts,
  });
  let persistence = {
    applied: false,
    websitesAttempted: 0,
    websitesWritten: 0,
    websiteSkips: [],
    tasksInserted: 0,
  };

  if (apply) {
    const persisted = await persistStage3Plan({
      data,
      plan,
      subjectResults,
      discoveryEvidence,
      runId: normalizedRunId,
      expectedCounts,
    }, {
      withTransaction,
      setMutationActor,
      recordWrite,
    });
    plan = persisted.plan;
    persistence = persisted.persistence;
  }

  return {
    runId: normalizedRunId,
    campaign: LEGITIMACY_STAGE3_FULL_CAMPAIGN,
    promptVersion: LEGITIMACY_STAGE3_FULL_PROMPT_VERSION,
    confidenceThreshold: threshold,
    concurrency: workerCount,
    batchSize: normalizedBatchSize,
    subjectResults,
    discoveryEvidence,
    calls,
    plan,
    persistence,
    counts: {
      ...plan.counts,
      discoveryRows: discoveryEvidence.length,
      discoveryOfficialWebsites: discoveryEvidence.filter((item) => item.outcome === "official_website_found").length,
      llmCalls: calls.length,
      llmSubjects: subjectResults.length,
      providerFailures: subjectResults.filter((item) => item.providerFailure).length,
      tasksInserted: persistence.tasksInserted,
      websitesWritten: persistence.websitesWritten,
    },
    estimatedLlmSpend,
  };
}

async function persistStage3Plan(
  { data, plan, subjectResults, discoveryEvidence, runId, expectedCounts },
  { withTransaction, setMutationActor, recordWrite },
) {
  const actorLabel = `pass1_stage3_evidence_run_${runId}`;
  return withTransaction(async (tx) => {
    await tx.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [`fountain:${LEGITIMACY_STAGE3_FULL_CAMPAIGN}:evidence`],
    );
    await setMutationActor(tx, {
      actorId: LEGITIMACY_STAGE3_APPLY_ACTOR_ID,
      actorLabel,
    });
    const locked = await tx.query(`
      SELECT id
      FROM fountain.locations
      WHERE id = ANY($1::integer[])
      ORDER BY id
      FOR UPDATE
    `, [data.rows.map((row) => row.locationId)]);
    assertRowCount("Stage 3 location locks", locked, expectedCounts.reviewRows);

    const hardResult = await tx.query(HARD_EXCLUSION_SQL, [data.rows.map((row) => row.locationId)]);
    const hardExclusions = hardResult.rows.map((row) => ({
      locationId: Number(row.id),
      reasons: ["apply_time_hard_exclusion"],
    }));
    const reconciledPlan = buildLegitimacyStage3FullPlan({
      data,
      subjectResults,
      discoveryResults: discoveryEvidence,
      hardExclusions,
      confidenceThreshold: plan.confidenceThreshold,
      concurrency: plan.concurrency,
      expectedCounts,
    });

    const websiteSkips = [];
    let websitesWritten = 0;
    for (const website of reconciledPlan.websiteWritePlans) {
      const write = await recordWrite({
        entity: { entity_type: "location", entity_id: website.locationId },
        field: "website",
        verification: "agent_verified",
        actor: actorLabel,
        tx,
        mutate: async (innerTx) => {
          const guard = await innerTx.query(`
            SELECT
              location.id,
              nullif(btrim(location.website), '') AS website,
              location.status,
              location.deleted_at,
              ${HARD_EXCLUSION_PREDICATE_SQL
    .replaceAll("l.", "location.")
    .replaceAll("o.", "organization.")} AS hard_excluded
            FROM fountain.locations location
            LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
            WHERE location.id = $1
            FOR UPDATE OF location
          `, [website.locationId]);
          const row = guard.rows[0];
          if (!row || row.website || row.status !== "active" || row.deleted_at || row.hard_excluded) {
            throw new Error(`Website apply guard refused location ${website.locationId}.`);
          }
          const updated = await innerTx.query(`
            UPDATE fountain.locations
            SET website = $2, updated_at = now()
            WHERE id = $1
              AND nullif(btrim(website), '') IS NULL
              AND status = 'active'
              AND deleted_at IS NULL
            RETURNING id
          `, [website.locationId, website.website]);
          assertRowCount(`website ${website.locationId}`, updated, 1);
          return updated.rows[0];
        },
      });
      if (write?.written) websitesWritten += 1;
      else websiteSkips.push({ locationId: website.locationId, reason: write?.reason || "ledger_guard" });
    }

    const existing = await tx.query(`
      SELECT count(*)::integer AS count
      FROM fountain_ops.task_queue
      WHERE task_type = 'legitimacy_check'
        AND payload->>'campaign' = $1
        AND payload->>'prompt_version' = $2
    `, [LEGITIMACY_STAGE3_FULL_CAMPAIGN, LEGITIMACY_STAGE3_FULL_PROMPT_VERSION]);
    if (Number(existing.rows[0]?.count) !== 0) {
      throw new Error(`Stage 3 evidence already exists: ${existing.rows[0]?.count}.`);
    }

    const subjectsByKey = new Map(reconciledPlan.subjectPlans.map((item) => [item.classificationKey, item]));
    const taskRows = reconciledPlan.taskResolutionPlans.map((task) => {
      const subject = subjectsByKey.get(task.classificationKey);
      return {
        entity_id: task.locationId,
        payload: {
          schema_version: 1,
          campaign: LEGITIMACY_STAGE3_FULL_CAMPAIGN,
          prompt_version: LEGITIMACY_STAGE3_FULL_PROMPT_VERSION,
          stage: "stage_3",
          classification_level: task.classificationLevel,
          classification_key: task.classificationKey,
          affected_location_ids: data.subjects.find((item) => (
            item.classificationKey === task.classificationKey
          ))?.locationIds || [task.locationId],
          confidence_threshold: reconciledPlan.confidenceThreshold,
        },
        result: {
          schema_version: 1,
          campaign: LEGITIMACY_STAGE3_FULL_CAMPAIGN,
          prompt_version: LEGITIMACY_STAGE3_FULL_PROMPT_VERSION,
          outcome: "classified",
          final: {
            class: task.finalClass,
            proposed_class: task.proposedClass,
            confidence: task.confidence,
            basis: task.basis,
            positive_evidence: task.positiveEvidence,
            rationale: task.rationale,
            model: subject?.model || "",
            external_call_id: subject?.externalCallId || null,
            normalization_flags: subject?.normalizationFlags || [],
          },
          resolution: task.resolution,
          needs_human_review: task.needsHumanReview,
          tags: task.needsHumanReview ? ["needs_human_review"] : [],
          review_reasons: task.reviewReasons,
          hard_exclusion_reasons: task.hardExclusionReasons,
          serving_write: { attempted: false, written: false },
        },
      };
    });
    const inserted = await tx.query(`
      INSERT INTO fountain_ops.task_queue (
        task_type, entity_type, entity_id, priority, payload, status,
        attempts, max_attempts, result, run_id
      )
      SELECT
        'legitimacy_check', 'location', item.entity_id, 20, item.payload,
        'done', 1, 1, item.result, $2::bigint
      FROM jsonb_to_recordset($1::jsonb) AS item(
        entity_id integer,
        payload jsonb,
        result jsonb
      )
      ORDER BY item.entity_id
      RETURNING entity_id
    `, [JSON.stringify(taskRows), runId]);
    assertRowCount("Stage 3 task evidence", inserted, expectedCounts.reviewRows);

    const verified = await tx.query(`
      SELECT
        count(*)::integer AS task_count,
        count(*) FILTER (WHERE result->>'needs_human_review' = 'true')::integer AS human_count,
        count(*) FILTER (WHERE result->>'resolution' = 'suppress')::integer AS suppress_count,
        count(*) FILTER (WHERE result->>'resolution' = 'keep')::integer AS keep_count
      FROM fountain_ops.task_queue
      WHERE task_type = 'legitimacy_check'
        AND payload->>'campaign' = $1
        AND payload->>'prompt_version' = $2
        AND run_id = $3::bigint
    `, [LEGITIMACY_STAGE3_FULL_CAMPAIGN, LEGITIMACY_STAGE3_FULL_PROMPT_VERSION, runId]);
    const counts = verified.rows[0] || {};
    if (Number(counts.task_count) !== expectedCounts.reviewRows
      || Number(counts.human_count) !== reconciledPlan.counts.humanReviewRows
      || Number(counts.suppress_count) !== reconciledPlan.counts.suppressionRows
      || Number(counts.keep_count) !== reconciledPlan.counts.keepRows) {
      throw new Error(`Stage 3 persistence reconciliation failed: ${JSON.stringify(counts)}.`);
    }
    return {
      plan: reconciledPlan,
      persistence: {
        applied: true,
        actorLabel,
        websitesAttempted: reconciledPlan.websiteWritePlans.length,
        websitesWritten,
        websiteSkips,
        tasksInserted: Number(counts.task_count),
      },
    };
  });
}

async function loadHardExclusions(query, locationIds) {
  const result = await executeQuery(query, HARD_EXCLUSION_SQL, [locationIds]);
  return rowsFrom(result).map((row) => ({
    locationId: Number(row.id),
    reasons: ["preflight_hard_exclusion"],
  }));
}

function subjectModelInput(subject, discoveryByLocation) {
  return {
    classification_key: subject.classificationKey,
    classification_level: subject.classificationLevel,
    organization_evidence: subject.organizationEvidence,
    organization_conflict: subject.organizationConflict,
    prior_classes: subject.priorClasses,
    normalization_flags: subject.normalizationFlags,
    pooled_evidence: subject.pooledEvidence,
    branches: subject.branches.map((branch) => {
      const discovery = discoveryByLocation.get(branch.locationId) || null;
      return {
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
        website_evidence: discovery
          ? {
              outcome: discovery.outcome,
              source: discovery.source,
              official_website: discovery.would_write_website,
              validation: discovery.validation,
              fetched: discovery.fetched_website,
            }
          : branch.websiteEvidence,
      };
    }),
  };
}

function branchLocation(branch) {
  return {
    id: branch.locationId,
    name: branch.name,
    address: branch.address,
    locality: branch.locality,
    region: branch.region,
    postal_code: branch.postalCode,
    country_code: branch.countryCode,
    website: branch.website,
  };
}

async function fetchWebsiteEvidence(url, webClient) {
  try {
    const page = await webClient.fetchHomepage(url);
    return {
      ok: Boolean(page.ok),
      url: page.finalUrl || page.requestedUrl || url,
      title: truncate(page.title, 500),
      description: truncate(page.description, 1_000),
      text_excerpt: truncate(page.textExcerpt, 4_000),
      outcome: page.outcome || (page.ok ? "ok" : "fetch_failed"),
    };
  } catch (error) {
    return { ok: false, url, outcome: "network_error", error: errorMessage(error) };
  }
}

function providerFailureResult(subject, error) {
  return {
    classificationKey: subject.classificationKey,
    class: "review",
    confidence: 0,
    basis: "insufficient",
    positiveEvidence: "",
    rationale: "Escalation provider failure; human review is required.",
    normalizationFlags: ["provider_failure"],
    model: "",
    externalCallId: null,
    providerFailure: true,
    error: errorMessage(error),
  };
}

export function assertFailureRate(results, {
  windowSize = LEGITIMACY_STAGE3_FAILURE_WINDOW,
  maximumRate = LEGITIMACY_STAGE3_FAILURE_RATE,
} = {}) {
  const size = positiveInteger(windowSize, "windowSize");
  const rate = boundedConfidence(maximumRate, "maximumRate");
  for (let end = size; end <= results.length; end += 1) {
    const window = results.slice(end - size, end);
    const failures = window.filter((result) => result.providerFailure).length;
    if (failures / size > rate) {
      throw new Error(
        `Stage 3 rolling failure rate exceeded: ${failures}/${size} (${(failures / size * 100).toFixed(1)}%).`,
      );
    }
  }
  return true;
}

export function renderLegitimacyStage3Completion({
  execution,
  suppression,
  spendUsd,
} = {}) {
  if (!execution?.persistence?.applied || !execution?.plan?.reconciliation?.valid) {
    throw new Error("Stage 3 completion report requires reconciled applied evidence.");
  }
  if (!suppression?.apply) throw new Error("Stage 3 completion report requires suppression evidence.");
  const plan = execution.plan;
  const aai = execution.subjectResults.find((item) => item.classificationKey === "organization:4308");
  const classes = ["junk", "plain_hospital", "review", "destination_medical", "in_scope"];
  const lines = [
    "# Pass 1 Legitimacy Triage — Stage 3 Completion",
    "",
    "**STAGE 3 COMPLETE**",
    "",
    `Run ${execution.runId}; campaign \`${execution.campaign}\`; model \`google/gemini-3.5-flash\`; confidence threshold ${execution.confidenceThreshold.toFixed(2)}; concurrency ${execution.concurrency}.`,
    "",
    "## Cohort and disposition reconciliation",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Effective review rows | ${integer(plan.counts.cohortRows)} |`,
    `| Pooled subjects | ${integer(plan.counts.subjects)} |`,
    `| Keep rows | ${integer(plan.counts.keepRows)} |`,
    `| Atomically suppressed rows | ${integer(plan.counts.suppressionRows)} |`,
    `| Active needs_human_review rows | ${integer(plan.counts.humanReviewRows)} |`,
    `| Task evidence rows inserted | ${integer(execution.persistence.tasksInserted)} |`,
    "",
    `Partition: ${integer(plan.counts.keepRows)} + ${integer(plan.counts.suppressionRows)} + ${integer(plan.counts.humanReviewRows)} = ${integer(plan.counts.cohortRows)}.`,
    "",
    "## Classification counts",
    "",
    "| Class | Subjects | Rows |",
    "| --- | ---: | ---: |",
  ];
  for (const className of classes) {
    lines.push(`| ${className} | ${integer(plan.counts.classCountsBySubject[className])} | ${integer(plan.counts.classCountsByRow[className])} |`);
  }
  lines.push(
    "",
    "## Website discovery",
    "",
    `- Blank website rows searched: ${integer(execution.counts.discoveryRows)}.`,
    `- Official websites validated: ${integer(execution.counts.discoveryOfficialWebsites)}.`,
    `- Ledger-guarded writes attempted/completed: ${integer(execution.persistence.websitesAttempted)}/${integer(execution.persistence.websitesWritten)}.`,
    `- Guarded skips: ${integer(execution.persistence.websiteSkips.length)}.`,
    "- Order: stored provider ID may use direct contact details; otherwise agent web search precedes Places search/contact fallback.",
    "",
    "## Atomic suppression reconciliation",
    "",
    "| Check | Expected | Actual |",
    "| --- | ---: | ---: |",
    `| Hidden locations | ${integer(plan.counts.suppressionRows)} | ${integer(suppression.verification.hiddenCount)} |`,
    `| Suppression-ledger rows | ${integer(suppression.preflight.sourceRecordFanout)} | ${integer(suppression.verification.runSuppressionLedgerRows)} |`,
    `| Stamped events | ${integer(plan.counts.suppressionRows)} | ${integer(suppression.verification.stampedEventCount)} |`,
    `| Residual search rows | 0 | ${integer(suppression.verification.remainingSearchRows)} |`,
    `| Hard exclusions touched | 0 | ${integer(suppression.preflight.hardExcludedCandidateCount)} |`,
    "",
    "## Provider evidence and safety",
    "",
    `- LLM calls/subjects: ${integer(execution.counts.llmCalls)}/${integer(execution.counts.llmSubjects)}.`,
    `- Provider/parser failures: ${integer(execution.counts.providerFailures)}; rolling-500 halt threshold was not breached.`,
    `- Ledgered run spend at report time: $${Number(spendUsd || 0).toFixed(4)}.`,
    `- AAI Rejuvenation (location 9390): \`${aai?.class || "missing"}\` at ${Number(aai?.confidence || 0).toFixed(2)}.`,
    "",
    "All keep-class rows remained active. Ambiguous, invalid, below-threshold, or hard-excluded rows remained active with `needs_human_review` task evidence.",
  );
  return `${lines.join("\n")}\n`;
}

function assertData(data, expectedCounts) {
  if (!data || !Array.isArray(data.subjects) || !Array.isArray(data.rows)) {
    throw new TypeError("Stage 3 data requires subjects and rows.");
  }
  if (data.rows.length !== Number(expectedCounts.reviewRows)
    || data.subjects.length !== Number(expectedCounts.subjects)) {
    throw new Error(
      `Stage 3 cohort drifted: ${data.rows.length}/${expectedCounts.reviewRows} rows, `
        + `${data.subjects.length}/${expectedCounts.subjects} subjects.`,
    );
  }
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

function assertRowCount(label, result, expected) {
  const count = Number(result?.rowCount ?? rowsFrom(result).length);
  if (count !== expected) throw new Error(`${label} did not reconcile: ${count}/${expected}.`);
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or pg-compatible client.");
}

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be positive.`);
  return number;
}

function nonnegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new TypeError(`${label} must be non-negative.`);
  return number;
}

function positiveIntegerString(value, label) {
  const string = String(value ?? "");
  if (!/^[1-9]\d*$/u.test(string)) throw new TypeError(`${label} must be a positive integer.`);
  return string;
}

function boundedConfidence(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new TypeError(`${label} must be between 0 and 1.`);
  }
  return number;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${label} must be positive.`);
  return number;
}

function nonnegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} must be non-negative.`);
  return number;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value, length) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .trim()
    .slice(0, length);
}

function errorMessage(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 1_000);
}

function integer(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}
