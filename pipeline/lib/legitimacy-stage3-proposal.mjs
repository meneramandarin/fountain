import { query as defaultQuery } from "./db.mjs";
import {
  LEGITIMACY_GATE_B_CAMPAIGN,
  LEGITIMACY_GATE_B_PROMPT_VERSION,
} from "./legitimacy-full.mjs";

export const LEGITIMACY_STAGE3_PROPOSAL_SEED = "pass1-stage3-proposal-v1";
export const LEGITIMACY_STAGE3_AAI_LOCATION_ID = 9390;

export const LEGITIMACY_STAGE3_PROPOSAL_SAMPLE_IDS = Object.freeze([
  9390,
  1827,
  13641,
  13585,
  14026,
  313,
  9408,
  9441,
  9428,
  9398,
  2698,
  9979,
  5032,
  9092,
  3402,
  2038,
  7203,
  2001,
  6830,
  327,
  13306,
  7955,
  2061,
  2113,
  7774,
  4043,
  12618,
  3730,
  1474,
  7540,
  13072,
  9004,
  1877,
  12367,
  9765,
  1331,
  11673,
  11649,
  11658,
  11669,
  1631,
  12742,
  2216,
  1723,
  1706,
  8627,
  10344,
  9579,
  10295,
  5178,
]);

export const LEGITIMACY_STAGE3_EXPECTED_COUNTS = Object.freeze({
  gateBReviewRows: 2_156,
  rawReviewRows: 1_704,
  subjects: 1_187,
  organizationSubjects: 1_133,
  organizationRows: 2_102,
  standaloneSubjects: 54,
  standaloneRows: 54,
  organizationConflictSubjects: 62,
  organizationConflictRows: 723,
});

export const LEGITIMACY_STAGE3_SAMPLE_COMPOSITION = Object.freeze({
  reference: 1,
  missing_site_provider: 5,
  missing_site_search: 4,
  org_conflict: 15,
  guard_junk_evidence: 6,
  guard_destination: 2,
  guard_research: 2,
  parser_failure: 5,
  non_us: 5,
  general: 5,
});

const LEGITIMACY_CLASSES = new Set([
  "in_scope",
  "junk",
  "plain_hospital",
  "destination_medical",
  "review",
]);

const CLASS_ORDER = new Map([
  ["junk", 0],
  ["plain_hospital", 1],
  ["review", 2],
  ["destination_medical", 3],
  ["in_scope", 4],
]);

/**
 * This query reads the complete effective Gate B review cohort. The conflict
 * CTE deliberately evaluates every Gate B task before filtering so a confident
 * branch is retained when any sibling received a different organization-level
 * class. No statement in this module mutates the database.
 */
export const LEGITIMACY_STAGE3_PROPOSAL_ROWS_SQL = `
  WITH campaign AS MATERIALIZED (
    SELECT
      queue.id AS task_id,
      queue.entity_id,
      queue.status AS task_status,
      queue.payload,
      queue.result,
      queue.result->'final'->>'class' AS raw_class,
      location.org_id,
      location.name,
      location.address,
      location.locality,
      location.region,
      location.postal_code,
      location.country_code,
      location.latitude,
      location.longitude,
      location.website,
      organization.canonical_name AS organization_name,
      organization.website_domain AS organization_website_domain,
      organization.description AS organization_description
    FROM fountain_ops.task_queue queue
    JOIN fountain.locations location ON location.id = queue.entity_id
    LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
    WHERE queue.task_type = 'legitimacy_check'
      AND queue.entity_type = 'location'
      AND queue.payload->>'campaign' = $1
      AND queue.payload->>'prompt_version' = $2
  ),
  conflict_keys AS MATERIALIZED (
    SELECT
      payload->>'classification_key' AS classification_key,
      array_agg(DISTINCT raw_class ORDER BY raw_class) AS conflict_classes
    FROM campaign
    WHERE payload->>'classification_level' = 'organization'
    GROUP BY payload->>'classification_key'
    HAVING count(DISTINCT raw_class) > 1
  ),
  effective_review AS MATERIALIZED (
    SELECT
      campaign.*,
      conflict_keys.conflict_classes,
      conflict_keys.classification_key IS NOT NULL AS organization_conflict
    FROM campaign
    LEFT JOIN conflict_keys
      ON conflict_keys.classification_key = campaign.payload->>'classification_key'
    WHERE campaign.raw_class = 'review'
       OR conflict_keys.classification_key IS NOT NULL
  )
  SELECT
    effective_review.*,
    COALESCE(source_data.source_slugs, ARRAY[]::text[]) AS source_slugs,
    COALESCE(offering_data.offering_names, ARRAY[]::text[]) AS offering_names,
    COALESCE(tag_data.tags, '[]'::jsonb) AS tags,
    COALESCE(place_data.external_place_matches, '[]'::jsonb) AS external_place_matches
  FROM effective_review
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT source.slug ORDER BY source.slug) AS source_slugs
    FROM fountain.source_records source_record
    JOIN fountain.sources source ON source.id = source_record.source_id
    WHERE source_record.entity_type = 'location'
      AND source_record.entity_id = effective_review.entity_id
  ) source_data ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(selected.raw_name ORDER BY lower(selected.raw_name), selected.raw_name)
      AS offering_names
    FROM (
      SELECT DISTINCT btrim(offering.raw_name) AS raw_name
      FROM fountain.offerings offering
      WHERE offering.location_id = effective_review.entity_id
        AND offering.status = 'active'
        AND offering.deleted_at IS NULL
        AND btrim(COALESCE(offering.raw_name, '')) <> ''
    ) selected
  ) offering_data ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object('facet', tag.facet, 'value', tag.value)
      ORDER BY tag.facet, tag.value
    ) AS tags
    FROM fountain.entity_tags entity_tag
    JOIN fountain.tags tag ON tag.id = entity_tag.tag_id
    WHERE entity_tag.entity_type = 'location'
      AND entity_tag.entity_id = effective_review.entity_id
  ) tag_data ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'provider', place_match.provider,
        'provider_place_id', place_match.provider_place_id,
        'display_name', place_match.display_name,
        'match_status', place_match.match_status,
        'match_confidence', place_match.match_confidence
      )
      ORDER BY place_match.provider
    ) AS external_place_matches
    FROM fountain.external_place_matches place_match
    WHERE place_match.location_id = effective_review.entity_id
      AND place_match.provider_place_id IS NOT NULL
  ) place_data ON true
  ORDER BY effective_review.entity_id
`;

export async function loadLegitimacyStage3ProposalData(
  {
    campaign = LEGITIMACY_GATE_B_CAMPAIGN,
    promptVersion = LEGITIMACY_GATE_B_PROMPT_VERSION,
  } = {},
  { query = defaultQuery } = {},
) {
  const normalizedCampaign = nonemptyString(campaign, "campaign");
  const normalizedPromptVersion = nonemptyString(promptVersion, "promptVersion");
  const result = await executeQuery(
    query,
    LEGITIMACY_STAGE3_PROPOSAL_ROWS_SQL,
    [normalizedCampaign, normalizedPromptVersion],
  );
  return buildLegitimacyStage3ProposalData(rowsFrom(result), {
    campaign: normalizedCampaign,
    promptVersion: normalizedPromptVersion,
  });
}

export function buildLegitimacyStage3ProposalData(
  rows,
  {
    campaign = LEGITIMACY_GATE_B_CAMPAIGN,
    promptVersion = LEGITIMACY_GATE_B_PROMPT_VERSION,
    expectedCounts = LEGITIMACY_STAGE3_EXPECTED_COUNTS,
  } = {},
) {
  if (!Array.isArray(rows)) throw new TypeError("Gate B rows must be an array.");
  const normalizedRows = rows.map(normalizeGateBRow);
  assertUniqueLocations(normalizedRows);

  const classesByKey = new Map();
  for (const row of normalizedRows) {
    if (row.classificationLevel !== "organization") continue;
    if (!classesByKey.has(row.classificationKey)) classesByKey.set(row.classificationKey, new Set());
    classesByKey.get(row.classificationKey).add(row.rawClass);
  }
  const conflictKeys = new Set([...classesByKey]
    .filter(([, classes]) => classes.size > 1)
    .map(([key]) => key));

  const effectiveRows = normalizedRows.filter((row) => (
    row.rawClass === "review"
      || row.organizationConflict
      || conflictKeys.has(row.classificationKey)
  ));
  for (const row of effectiveRows) {
    row.organizationConflict = row.organizationConflict || conflictKeys.has(row.classificationKey);
  }

  const subjectsByKey = new Map();
  for (const row of effectiveRows) {
    const existing = subjectsByKey.get(row.classificationKey);
    if (existing) {
      appendBranch(existing, row);
    } else {
      subjectsByKey.set(row.classificationKey, createSubject(row));
    }
  }
  const subjects = [...subjectsByKey.values()]
    .map(finalizeSubject)
    .sort(compareSubjects);
  const finalizedSubjectsByKey = new Map(
    subjects.map((subject) => [subject.classificationKey, subject]),
  );
  const rowsByLocationId = new Map(effectiveRows.map((row) => [row.locationId, row]));
  const sampleRows = LEGITIMACY_STAGE3_PROPOSAL_SAMPLE_IDS.map((locationId, index) => {
    const row = rowsByLocationId.get(locationId);
    if (!row) {
      throw new Error(`Stage 3 proposal sample location ${locationId} is absent from the effective Gate B review cohort.`);
    }
    const subject = finalizedSubjectsByKey.get(row.classificationKey);
    return {
      samplePosition: index + 1,
      sampleStratum: sampleStratum(index),
      locationId,
      name: row.name,
      locality: row.locality,
      region: row.region,
      countryCode: row.countryCode,
      classificationKey: row.classificationKey,
      organizationConflict: subject.organizationConflict,
      subjectLocationCount: subject.locationIds.length,
      storedWebsite: row.website,
      organizationWebsiteDomain: row.organizationWebsiteDomain,
      hasProviderPlaceId: row.externalPlaceMatches.length > 0,
      priorClass: row.rawClass,
      priorConfidence: row.confidence,
    };
  });
  if (new Set(sampleRows.map((row) => row.classificationKey)).size !== sampleRows.length) {
    throw new Error("Stage 3 proposal sample must contain 50 distinct classification subjects.");
  }

  const counts = summarizeCounts(effectiveRows, subjects);
  assertExpectedCounts(counts, expectedCounts);
  const aai = sampleRows.find((row) => row.locationId === LEGITIMACY_STAGE3_AAI_LOCATION_ID);
  if (!aai || aai.classificationKey !== "organization:4308") {
    throw new Error("Stage 3 proposal requires location 9390 (AAI Rejuvenation, organization:4308).");
  }

  return {
    campaign: nonemptyString(campaign, "campaign"),
    promptVersion: nonemptyString(promptVersion, "promptVersion"),
    seed: LEGITIMACY_STAGE3_PROPOSAL_SEED,
    sampleIds: [...LEGITIMACY_STAGE3_PROPOSAL_SAMPLE_IDS],
    counts,
    rows: effectiveRows,
    subjects,
    sampleRows,
    aai,
    servingWrites: { attempted: 0, written: 0 },
  };
}

export function renderLegitimacyStage3Proposal({
  data,
  sampleResults,
  sampleEvidence = null,
  model,
  projection,
  discoveryPlan,
  confidenceThreshold = 0.9,
} = {}) {
  assertProposalData(data);
  const results = normalizeSampleResults(sampleResults, data.sampleRows);
  const normalizedModel = normalizeModelPlan(model);
  const normalizedProjection = normalizeProjection(projection);
  const normalizedDiscovery = normalizeDiscoveryPlan(discoveryPlan);
  const normalizedSampleEvidence = normalizeSampleEvidence(sampleEvidence, results);
  const threshold = boundedConfidence(confidenceThreshold, "confidenceThreshold");
  const aaiResult = results.get(LEGITIMACY_STAGE3_AAI_LOCATION_ID);
  if (aaiResult.class !== "in_scope") {
    throw new Error("AAI Rejuvenation (location 9390) must resolve to in_scope in the Stage 3 proposal sample.");
  }

  const lines = [
    "# Pass 1 Legitimacy Triage — Stage 3 Escalation Proposal",
    "",
    "**STAGE 3 PROPOSAL — PRE-APPROVED BY FINAL STANDING ORDERS**",
    "",
    "**ZERO SERVING WRITES:** this proposal sample made no location, organization, suppression-ledger, or other serving-data writes.",
    "",
    `What is proposed: Escalate ${formatInteger(data.counts.reviewRows)} Gate B review rows as ${formatInteger(data.counts.subjects)} pooled organization/standalone subjects, then auto-resolve decisions at confidence ≥ ${threshold.toFixed(2)} after the documented guards.`,
    "",
    `Evidence boundary: the 50 persisted dry-run results from run ${escapeCell(normalizedSampleEvidence.finalRunId)} are joined to the fixed seed \`${escapeCell(data.seed)}\`; report rendering itself makes no provider or database calls.`,
    "",
    "Open questions: None. The final standing orders authorize autonomous execution.",
    "",
    "## Frozen cohort",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Effective Gate B review rows | ${formatInteger(data.counts.reviewRows)} |`,
    `| Classification subjects | ${formatInteger(data.counts.subjects)} |`,
    `| Organization subjects | ${formatInteger(data.counts.organizationSubjects)} |`,
    `| Organization rows | ${formatInteger(data.counts.organizationRows)} |`,
    `| Standalone subjects/rows | ${formatInteger(data.counts.standaloneSubjects)} |`,
    `| Organization-conflict subjects | ${formatInteger(data.counts.organizationConflictSubjects)} |`,
    `| Organization-conflict rows | ${formatInteger(data.counts.organizationConflictRows)} |`,
    "",
    "Organization subjects contain every cohort branch's stored location fields, sources, offerings, tags, provider IDs, prior Gate B evidence, and unique website evidence. One verdict fans out to every member location.",
    "",
    "## Website discovery plan",
    "",
    `1. Start with ${formatInteger(normalizedDiscovery.missingLocationWebsites)} rows whose location website is blank; ${formatInteger(normalizedDiscovery.existingProviderIds)} already have a Google provider ID.`,
    `2. Use a stored Places provider ID directly when present. For the remaining ${formatInteger(normalizedDiscovery.textSearchCandidates)} candidate rows, run ${escapeCell(normalizedDiscovery.webSearchFallback)} first. Reject generic/directory domains and require name plus locality/address identity evidence.`,
    "3. If agent search supplies no trustworthy official site, fall back to ID-only Places text search followed by the contact-field details mask.",
    `4. On the approved full run only, write a discovered site to the location through ${escapeCell(normalizedDiscovery.ledgerGuard)} after a locked null-field and hard-exclusion recheck.`,
    "",
    `Maximum planned Places-details cost: ${formatUsd(normalizedDiscovery.placesMaxCostUsd)} (${formatUsd(normalizedDiscovery.placesUnitCostUsd)} per details call).`,
    "The full run binds agent search to a ledger-aware OpenRouter web-search adapter and meters reported web-search requests. Provider behavior and request pricing are documented in the [OpenRouter web-search guide](https://openrouter.ai/docs/guides/features/server-tools/web-search).",
    "",
    "## Escalation model and projection",
    "",
    "| Metric | Proposal |",
    "| --- | --- |",
    `| Tier | ${escapeCell(normalizedModel.tier)} |`,
    `| Model | \`${escapeCell(normalizedModel.id)}\` |`,
    `| Reasoning | ${escapeCell(normalizedModel.reasoning)} |`,
    `| Input price | ${formatUsd(normalizedModel.inputUsdPerMillion)} / 1M tokens |`,
    `| Output price | ${formatUsd(normalizedModel.outputUsdPerMillion)} / 1M tokens |`,
    `| Projected input tokens | ${formatInteger(normalizedProjection.inputTokens)} |`,
    `| Projected output tokens | ${formatInteger(normalizedProjection.outputTokens)} |`,
    `| Projected model cost | ${formatUsd(normalizedProjection.modelCostUsd)} |`,
    `| Projected Places cost | ${formatUsd(normalizedProjection.placesCostUsd)} |`,
    `| Projected web-search cost | ${formatUsd(normalizedProjection.webSearchCostUsd)} |`,
    `| Projected total | ${formatUsd(normalizedProjection.totalCostUsd)} |`,
    `| Proposed budget cap | ${formatUsd(normalizedProjection.budgetUsd)} |`,
    "",
    "Model availability, structured-output support, context, and current unit pricing were verified against the [OpenRouter Gemini 3.5 Flash catalog](https://openrouter.ai/google/gemini-3.5-flash).",
    "",
    "## Dry-run execution evidence",
    "",
    `Final sample run: ${escapeCell(normalizedSampleEvidence.finalRunId)}; superseded calibration run(s): ${escapeCell(normalizedSampleEvidence.supersededRunIds.join(", ") || "none")}.`,
    "",
    "| Sample class | Subjects |",
    "| --- | ---: |",
  ];
  for (const className of ["junk", "plain_hospital", "review", "destination_medical", "in_scope"]) {
    lines.push(`| ${className} | ${formatInteger(normalizedSampleEvidence.classCounts[className])} |`);
  }
  lines.push(
    "",
    `The final fixed sample auto-resolved ${formatInteger(normalizedSampleEvidence.resolvedSubjects)}/50 subjects and held ${formatInteger(normalizedSampleEvidence.reviewSubjects)}. Row-weighted by the frozen strata, the full run projects ${formatInteger(normalizedSampleEvidence.projectedAutoResolvedRows)} auto-resolved rows and ${formatInteger(normalizedSampleEvidence.projectedHumanReviewRows)} final human-review rows (planning range ${formatInteger(normalizedSampleEvidence.projectedHumanReviewMin)}–${formatInteger(normalizedSampleEvidence.projectedHumanReviewMax)}).`,
    "",
    `Final sample usage: ${formatInteger(normalizedSampleEvidence.llmCalls)} LLM calls, ${formatInteger(normalizedSampleEvidence.placesSearchCalls)} Places ID searches, ${formatInteger(normalizedSampleEvidence.placesDetailsCalls)} contact-details calls, ${formatInteger(normalizedSampleEvidence.inputTokens)} input tokens, ${formatInteger(normalizedSampleEvidence.outputTokens)} output tokens (${formatInteger(normalizedSampleEvidence.reasoningTokens)} reasoning). Final spend: ${formatUsd(normalizedSampleEvidence.finalSpendUsd)}; all sample attempts: ${formatUsd(normalizedSampleEvidence.allAttemptSpendUsd)}.`,
    "",
    "Serving writes attempted/written: 0/0. The superseded attempt used an undersized completion ceiling for medium reasoning; no rubric, threshold, model, or serving data changed between attempts.",
    "",
    "## AAI Rejuvenation reference case",
    "",
    `- Location: ${LEGITIMACY_STAGE3_AAI_LOCATION_ID}, ${escapeCell(data.aai.name)} (${escapeCell(data.aai.classificationKey)}).`,
    "- Expected class: `in_scope`.",
    `- Actual final dry-run class: \`${escapeCell(aaiResult.class)}\` at confidence ${formatConfidence(aaiResult.confidence)}.`,
    `- Website discovery: ${escapeCell(aaiResult.discoveryOutcome || "not reported")}; would write: ${escapeCell(aaiResult.wouldWriteWebsite || "—")}.`,
    `- Rationale: ${escapeCell(aaiResult.rationale || "—")}`,
    "- Serving writes attempted/written: 0/0.",
    "",
    "## Deterministic 50-row dry-run sample",
    "",
    `Seed: \`${escapeCell(data.seed)}\`. Results below are persisted run evidence; the proposal renderer does not call external providers.`,
    "",
    "| # | ID | Name | Stratum | Subject | Locations | Prior | Actual | Confidence | Discovery | Would write website | Rationale |",
    "| ---: | ---: | --- | --- | --- | ---: | --- | --- | ---: | --- | --- | --- |",
  );
  for (const row of data.sampleRows) {
    const result = results.get(row.locationId);
    lines.push(tableRow([
      row.samplePosition,
      row.locationId,
      row.name || "—",
      row.sampleStratum,
      row.classificationKey,
      row.subjectLocationCount,
      row.priorClass,
      result.class,
      formatConfidence(result.confidence),
      result.discoveryOutcome || "—",
      result.wouldWriteWebsite || "—",
      result.rationale || "—",
    ]));
  }
  lines.push(
    "",
    "## Approval-gated full-run behavior",
    "",
    `- One escalation judgment per pooled subject; confidence below ${threshold.toFixed(2)}, model class \`review\`, invalid structured evidence, discovery mismatch, or hard-exclusion drift goes to the final human-review document.`,
    "- `junk` requires affirmative cited junk evidence; research requires explicit research-only/no-consumer-care evidence.",
    "- `destination_medical` remains limited to preventive, diagnostic, or longevity destination programs; treatment tourism remains `plain_hospital`.",
    "- Only high-confidence `junk` and `plain_hospital` rows use the same atomic hidden-status plus raw-source suppression recipe and hard exclusions as Gate B.",
    "- Website writes use the field ledger guard; no organization domain is inferred or written from a branch website.",
    "",
    "**EXECUTION AUTHORIZED — continue under the final standing orders.**",
  );
  return `${lines.join("\n")}\n`;
}

function normalizeGateBRow(row) {
  const payload = object(row?.payload);
  const result = object(row?.result);
  const final = object(result.final);
  const locationId = positiveInteger(row?.entity_id ?? row?.location_id, "location id");
  const orgId = nullablePositiveInteger(row?.org_id, "organization id");
  const expectedLevel = orgId == null ? "location" : "organization";
  const expectedKey = `${expectedLevel}:${orgId ?? locationId}`;
  const classificationLevel = String(payload.classification_level || expectedLevel);
  const classificationKey = String(payload.classification_key || expectedKey);
  const rawClass = String(row?.raw_class || final.class || "");
  if (String(row?.task_status || "done") !== "done") {
    throw new Error(`Gate B task for location ${locationId} is not done.`);
  }
  if (result.outcome && result.outcome !== "classified") {
    throw new Error(`Gate B task for location ${locationId} is not classified.`);
  }
  if (!LEGITIMACY_CLASSES.has(rawClass)) {
    throw new Error(`Gate B task for location ${locationId} has invalid class ${rawClass || "<missing>"}.`);
  }
  if (classificationLevel !== expectedLevel || classificationKey !== expectedKey) {
    throw new Error(`Gate B task for location ${locationId} has an invalid classification key.`);
  }
  const stages = object(result.stages);
  const stage2 = object(stages.stage_2);
  const websiteEvidence = object(stage2.website);
  const finalEvidence = Object.keys(object(stage2.classification)).length > 0
    ? object(stage2.classification)
    : object(stages.stage_1);
  return {
    taskId: String(row?.task_id ?? ""),
    locationId,
    orgId,
    classificationLevel,
    classificationKey,
    rawClass,
    confidence: nullableConfidence(final.confidence),
    rationale: String(final.rationale || ""),
    normalizationFlags: stringArray(finalEvidence.normalization_flags),
    organizationConflict: Boolean(row?.organization_conflict),
    conflictClasses: stringArray(row?.conflict_classes),
    name: text(row?.name),
    address: text(row?.address),
    locality: text(row?.locality),
    region: text(row?.region),
    postalCode: text(row?.postal_code),
    countryCode: text(row?.country_code).toUpperCase(),
    latitude: nullableNumber(row?.latitude),
    longitude: nullableNumber(row?.longitude),
    website: text(row?.website),
    organizationName: text(row?.organization_name),
    organizationWebsiteDomain: text(row?.organization_website_domain),
    organizationDescription: text(row?.organization_description),
    sourceSlugs: stringArray(row?.source_slugs),
    offeringNames: stringArray(row?.offering_names),
    tags: tagArray(row?.tags),
    externalPlaceMatches: objectArray(row?.external_place_matches),
    websiteEvidence: Object.keys(websiteEvidence).length > 0 ? websiteEvidence : null,
  };
}

function createSubject(row) {
  const subject = {
    classificationLevel: row.classificationLevel,
    classificationKey: row.classificationKey,
    orgId: row.orgId,
    organizationEvidence: {
      name: row.organizationName || row.name,
      websiteDomain: row.organizationWebsiteDomain,
      description: row.organizationDescription,
    },
    organizationConflict: row.organizationConflict,
    priorClasses: new Set(),
    normalizationFlags: new Set(),
    pooledSourceSlugs: new Set(),
    pooledOfferingNames: new Set(),
    pooledTags: new Map(),
    pooledWebsites: new Map(),
    branches: [],
  };
  appendBranch(subject, row);
  return subject;
}

function appendBranch(subject, row) {
  if (subject.classificationLevel !== row.classificationLevel || subject.orgId !== row.orgId) {
    throw new Error(`Classification subject ${subject.classificationKey} mixes organization identities.`);
  }
  subject.organizationConflict ||= row.organizationConflict;
  subject.priorClasses.add(row.rawClass);
  for (const flag of row.normalizationFlags) subject.normalizationFlags.add(flag);
  for (const source of row.sourceSlugs) subject.pooledSourceSlugs.add(source);
  for (const offering of row.offeringNames) subject.pooledOfferingNames.add(offering);
  for (const tag of row.tags) subject.pooledTags.set(`${tag.facet}\0${tag.value}`, tag);
  addWebsite(subject.pooledWebsites, row.website, { source: "location", locationId: row.locationId });
  addWebsite(subject.pooledWebsites, row.organizationWebsiteDomain, { source: "organization", locationId: null });
  const evidenceUrl = text(row.websiteEvidence?.final_url || row.websiteEvidence?.requested_url);
  addWebsite(subject.pooledWebsites, evidenceUrl, {
    source: "gate_b_website_evidence",
    locationId: row.locationId,
    title: text(row.websiteEvidence?.title),
    description: text(row.websiteEvidence?.description),
    textExcerpt: text(row.websiteEvidence?.text_excerpt),
  });
  subject.branches.push({
    locationId: row.locationId,
    name: row.name,
    address: row.address,
    locality: row.locality,
    region: row.region,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    latitude: row.latitude,
    longitude: row.longitude,
    website: row.website,
    sourceSlugs: row.sourceSlugs,
    offeringNames: row.offeringNames,
    tags: row.tags,
    externalPlaceMatches: row.externalPlaceMatches,
    priorGateB: {
      class: row.rawClass,
      confidence: row.confidence,
      rationale: row.rationale,
      normalizationFlags: row.normalizationFlags,
    },
    websiteEvidence: row.websiteEvidence,
  });
}

function finalizeSubject(subject) {
  const branches = [...subject.branches].sort((left, right) => left.locationId - right.locationId);
  const priorClasses = [...subject.priorClasses].sort(compareClasses);
  const organizationConflict = subject.organizationConflict || priorClasses.length > 1;
  return {
    classificationLevel: subject.classificationLevel,
    classificationKey: subject.classificationKey,
    orgId: subject.orgId,
    organizationEvidence: subject.organizationEvidence,
    organizationConflict,
    priorClasses,
    normalizationFlags: [...subject.normalizationFlags].sort(),
    locationIds: branches.map((branch) => branch.locationId),
    branches,
    pooledEvidence: {
      sourceSlugs: [...subject.pooledSourceSlugs].sort(),
      offeringNames: [...subject.pooledOfferingNames].sort((left, right) => left.localeCompare(right)),
      tags: [...subject.pooledTags.values()].sort(compareTags),
      websites: [...subject.pooledWebsites.values()].sort(compareWebsites),
    },
  };
}

function summarizeCounts(rows, subjects) {
  const organizationSubjects = subjects.filter((subject) => subject.classificationLevel === "organization");
  const standaloneSubjects = subjects.filter((subject) => subject.classificationLevel === "location");
  const conflictSubjects = organizationSubjects.filter((subject) => subject.organizationConflict);
  return {
    reviewRows: rows.length,
    rawReviewRows: rows.filter((row) => row.rawClass === "review").length,
    subjects: subjects.length,
    organizationSubjects: organizationSubjects.length,
    organizationRows: organizationSubjects.reduce((sum, subject) => sum + subject.locationIds.length, 0),
    standaloneSubjects: standaloneSubjects.length,
    standaloneRows: standaloneSubjects.reduce((sum, subject) => sum + subject.locationIds.length, 0),
    organizationConflictSubjects: conflictSubjects.length,
    organizationConflictRows: conflictSubjects.reduce((sum, subject) => sum + subject.locationIds.length, 0),
  };
}

function assertExpectedCounts(actual, expected) {
  const normalized = {
    reviewRows: number(expected?.gateBReviewRows ?? expected?.reviewRows),
    rawReviewRows: number(expected?.rawReviewRows),
    subjects: number(expected?.subjects),
    organizationSubjects: number(expected?.organizationSubjects),
    organizationRows: number(expected?.organizationRows),
    standaloneSubjects: number(expected?.standaloneSubjects),
    standaloneRows: number(expected?.standaloneRows),
    organizationConflictSubjects: number(expected?.organizationConflictSubjects),
    organizationConflictRows: number(expected?.organizationConflictRows),
  };
  const mismatches = Object.entries(normalized)
    .filter(([key, value]) => actual[key] !== value)
    .map(([key, value]) => `${key}=${actual[key]} (expected ${value})`);
  if (mismatches.length > 0) {
    throw new Error(`Stage 3 proposal cohort does not reconcile: ${mismatches.join(", ")}.`);
  }
}

function normalizeSampleResults(results, sampleRows) {
  if (!Array.isArray(results)) throw new TypeError("sampleResults must be an array.");
  const expectedIds = new Set(sampleRows.map((row) => row.locationId));
  const byId = new Map();
  for (const result of results) {
    const locationId = positiveInteger(result?.locationId ?? result?.location_id, "sample result location id");
    if (!expectedIds.has(locationId)) throw new Error(`Unexpected Stage 3 sample result for location ${locationId}.`);
    if (byId.has(locationId)) throw new Error(`Duplicate Stage 3 sample result for location ${locationId}.`);
    const className = String(result?.class || "");
    if (!LEGITIMACY_CLASSES.has(className)) {
      throw new Error(`Stage 3 sample result ${locationId} has invalid class ${className || "<missing>"}.`);
    }
    const servingWriteAttempted = result?.servingWriteAttempted
      ?? result?.serving_write?.attempted;
    const servingWritten = result?.servingWritten
      ?? result?.serving_write?.written;
    if (servingWriteAttempted !== false || servingWritten !== false) {
      throw new Error(`Stage 3 proposal sample ${locationId} lacks zero-serving-write evidence.`);
    }
    byId.set(locationId, {
      locationId,
      class: className,
      confidence: boundedConfidence(result?.confidence, `sample result ${locationId} confidence`),
      rationale: text(result?.rationale),
      discoveryOutcome: text(result?.discoveryOutcome ?? result?.discovery_outcome),
      wouldWriteWebsite: text(result?.wouldWriteWebsite ?? result?.would_write_website),
    });
  }
  const missing = [...expectedIds].filter((locationId) => !byId.has(locationId));
  if (missing.length > 0 || byId.size !== expectedIds.size) {
    throw new Error(`Stage 3 proposal sample results do not reconcile; missing: ${missing.join(", ") || "none"}.`);
  }
  return byId;
}

function normalizeModelPlan(model) {
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    throw new TypeError("model plan must be an object.");
  }
  return {
    id: nonemptyString(model.id, "model.id"),
    tier: nonemptyString(model.tier || "escalation", "model.tier"),
    reasoning: nonemptyString(model.reasoning || model.reasoningEffort, "model.reasoning"),
    inputUsdPerMillion: nonnegativeNumber(model.inputUsdPerMillion, "model.inputUsdPerMillion"),
    outputUsdPerMillion: nonnegativeNumber(model.outputUsdPerMillion, "model.outputUsdPerMillion"),
  };
}

function normalizeSampleEvidence(value, results) {
  const derivedClassCounts = {
    junk: 0,
    plain_hospital: 0,
    review: 0,
    destination_medical: 0,
    in_scope: 0,
  };
  for (const result of results.values()) derivedClassCounts[result.class] += 1;
  const supplied = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const classCounts = { ...derivedClassCounts };
  if (supplied.classCounts && typeof supplied.classCounts === "object") {
    for (const className of Object.keys(classCounts)) {
      const count = nonnegativeInteger(
        supplied.classCounts[className] ?? derivedClassCounts[className],
        `sampleEvidence.classCounts.${className}`,
      );
      if (count !== derivedClassCounts[className]) {
        throw new Error(`sampleEvidence class count for ${className} does not match sample results.`);
      }
      classCounts[className] = count;
    }
  }
  const reviewSubjects = classCounts.review;
  const normalized = {
    finalRunId: nonemptyString(supplied.finalRunId || "not supplied", "sampleEvidence.finalRunId"),
    supersededRunIds: Array.isArray(supplied.supersededRunIds)
      ? supplied.supersededRunIds.map((runId) => nonemptyString(String(runId), "sampleEvidence.supersededRunId"))
      : [],
    classCounts,
    reviewSubjects,
    resolvedSubjects: 50 - reviewSubjects,
    projectedHumanReviewRows: nonnegativeInteger(
      supplied.projectedHumanReviewRows ?? reviewSubjects,
      "sampleEvidence.projectedHumanReviewRows",
    ),
    projectedAutoResolvedRows: nonnegativeInteger(
      supplied.projectedAutoResolvedRows ?? (2_156 - reviewSubjects),
      "sampleEvidence.projectedAutoResolvedRows",
    ),
    projectedHumanReviewMin: nonnegativeInteger(
      supplied.projectedHumanReviewMin ?? reviewSubjects,
      "sampleEvidence.projectedHumanReviewMin",
    ),
    projectedHumanReviewMax: nonnegativeInteger(
      supplied.projectedHumanReviewMax ?? reviewSubjects,
      "sampleEvidence.projectedHumanReviewMax",
    ),
    finalSpendUsd: nonnegativeNumber(
      supplied.finalSpendUsd ?? 0,
      "sampleEvidence.finalSpendUsd",
    ),
    allAttemptSpendUsd: nonnegativeNumber(
      supplied.allAttemptSpendUsd ?? supplied.finalSpendUsd ?? 0,
      "sampleEvidence.allAttemptSpendUsd",
    ),
    llmCalls: nonnegativeInteger(supplied.llmCalls ?? 0, "sampleEvidence.llmCalls"),
    placesSearchCalls: nonnegativeInteger(
      supplied.placesSearchCalls ?? 0,
      "sampleEvidence.placesSearchCalls",
    ),
    placesDetailsCalls: nonnegativeInteger(
      supplied.placesDetailsCalls ?? 0,
      "sampleEvidence.placesDetailsCalls",
    ),
    inputTokens: nonnegativeInteger(
      supplied.inputTokens ?? 0,
      "sampleEvidence.inputTokens",
    ),
    outputTokens: nonnegativeInteger(
      supplied.outputTokens ?? 0,
      "sampleEvidence.outputTokens",
    ),
    reasoningTokens: nonnegativeInteger(
      supplied.reasoningTokens ?? 0,
      "sampleEvidence.reasoningTokens",
    ),
  };
  if (normalized.projectedHumanReviewRows + normalized.projectedAutoResolvedRows !== 2_156) {
    throw new Error("Stage 3 projected auto-resolved and human-review rows must total 2,156.");
  }
  if (normalized.projectedHumanReviewMin > normalized.projectedHumanReviewRows
      || normalized.projectedHumanReviewRows > normalized.projectedHumanReviewMax) {
    throw new Error("Stage 3 projected human-review point must fall inside its planning range.");
  }
  if (normalized.allAttemptSpendUsd < normalized.finalSpendUsd) {
    throw new Error("Stage 3 all-attempt spend cannot be lower than final sample spend.");
  }
  return normalized;
}

function normalizeProjection(projection) {
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    throw new TypeError("projection must be an object.");
  }
  const normalized = {
    inputTokens: nonnegativeInteger(projection.inputTokens, "projection.inputTokens"),
    outputTokens: nonnegativeInteger(projection.outputTokens, "projection.outputTokens"),
    modelCostUsd: nonnegativeNumber(projection.modelCostUsd, "projection.modelCostUsd"),
    placesCostUsd: nonnegativeNumber(projection.placesCostUsd, "projection.placesCostUsd"),
    webSearchCostUsd: nonnegativeNumber(projection.webSearchCostUsd, "projection.webSearchCostUsd"),
    totalCostUsd: nonnegativeNumber(projection.totalCostUsd, "projection.totalCostUsd"),
    budgetUsd: nonnegativeNumber(projection.budgetUsd, "projection.budgetUsd"),
  };
  const components = normalized.modelCostUsd + normalized.placesCostUsd + normalized.webSearchCostUsd;
  if (normalized.totalCostUsd + 1e-9 < components) {
    throw new Error("projection.totalCostUsd cannot be lower than its cost components.");
  }
  if (normalized.budgetUsd < normalized.totalCostUsd) {
    throw new Error("projection.budgetUsd cannot be lower than the projected total.");
  }
  return normalized;
}

function normalizeDiscoveryPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("discoveryPlan must be an object.");
  }
  const normalized = {
    missingLocationWebsites: nonnegativeInteger(plan.missingLocationWebsites, "discoveryPlan.missingLocationWebsites"),
    existingProviderIds: nonnegativeInteger(plan.existingProviderIds, "discoveryPlan.existingProviderIds"),
    textSearchCandidates: nonnegativeInteger(plan.textSearchCandidates, "discoveryPlan.textSearchCandidates"),
    placesUnitCostUsd: nonnegativeNumber(plan.placesUnitCostUsd, "discoveryPlan.placesUnitCostUsd"),
    placesMaxCostUsd: nonnegativeNumber(plan.placesMaxCostUsd, "discoveryPlan.placesMaxCostUsd"),
    webSearchFallback: nonemptyString(plan.webSearchFallback, "discoveryPlan.webSearchFallback"),
    ledgerGuard: nonemptyString(plan.ledgerGuard, "discoveryPlan.ledgerGuard"),
  };
  if (normalized.existingProviderIds + normalized.textSearchCandidates !== normalized.missingLocationWebsites) {
    throw new Error("Discovery provider-ID and text-search counts must cover every missing location website.");
  }
  return normalized;
}

function assertProposalData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Stage 3 proposal data is required.");
  }
  if (!Array.isArray(data.sampleRows) || data.sampleRows.length !== 50) {
    throw new Error("Stage 3 proposal data must contain the deterministic 50-row sample.");
  }
  if (number(data.servingWrites?.attempted) !== 0 || number(data.servingWrites?.written) !== 0) {
    throw new Error("Stage 3 proposal data contains serving writes.");
  }
}

function assertUniqueLocations(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.locationId)) throw new Error(`Duplicate Gate B review row for location ${row.locationId}.`);
    seen.add(row.locationId);
  }
}

function addWebsite(websites, rawUrl, details) {
  const value = text(rawUrl);
  if (!value) return;
  const key = websiteKey(value);
  if (!websites.has(key)) websites.set(key, { url: value, ...details });
}

function websiteKey(value) {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `https://${value}`);
    url.hash = "";
    return `${url.hostname.toLowerCase().replace(/^www\d?\./u, "")}${url.pathname.replace(/\/+$/u, "") || "/"}`;
  } catch {
    return value.toLowerCase();
  }
}

function sampleStratum(index) {
  if (index === 0) return "reference";
  if (index <= 5) return "missing_site_provider";
  if (index <= 9) return "missing_site_search";
  if (index <= 24) return "org_conflict";
  if (index <= 30) return "guard_junk_evidence";
  if (index <= 32) return "guard_destination";
  if (index <= 34) return "guard_research";
  if (index <= 39) return "parser_failure";
  if (index <= 44) return "non_us";
  return "general";
}

function compareSubjects(left, right) {
  if (left.classificationLevel !== right.classificationLevel) {
    return left.classificationLevel.localeCompare(right.classificationLevel);
  }
  return (left.orgId ?? left.locationIds[0]) - (right.orgId ?? right.locationIds[0]);
}

function compareClasses(left, right) {
  return (CLASS_ORDER.get(left) ?? 99) - (CLASS_ORDER.get(right) ?? 99)
    || left.localeCompare(right);
}

function compareTags(left, right) {
  return left.facet.localeCompare(right.facet) || left.value.localeCompare(right.value);
}

function compareWebsites(left, right) {
  return left.url.localeCompare(right.url) || number(left.locationId) - number(right.locationId);
}

function tagArray(value) {
  return objectArray(value)
    .map((tag) => ({ facet: text(tag.facet), value: text(tag.value) }))
    .filter((tag) => tag.facet && tag.value);
}

function objectArray(value) {
  if (typeof value === "string") {
    try {
      return objectArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item))
    : [];
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))].sort();
}

function object(value) {
  if (typeof value === "string") {
    try {
      return object(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableConfidence(value) {
  return value == null || value === "" ? null : boundedConfidence(value, "confidence");
}

function boundedConfidence(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new TypeError(`${label} must be between 0 and 1.`);
  }
  return parsed;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return parsed;
}

function nullablePositiveInteger(value, label) {
  return value == null || value === "" ? null : positiveInteger(value, label);
}

function nonnegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return parsed;
}

function nonnegativeNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new TypeError(`${label} must be a non-negative number.`);
  return parsed;
}

function nonemptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value.trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value) {
  return Math.round(number(value)).toLocaleString("en-US");
}

function formatUsd(value) {
  const numeric = number(value);
  return `$${numeric.toLocaleString("en-US", {
    minimumFractionDigits: numeric > 0 && numeric < 0.01 ? 3 : 2,
    maximumFractionDigits: numeric > 0 && numeric < 0.01 ? 4 : 2,
  })}`;
}

function formatConfidence(value) {
  return boundedConfidence(value, "confidence").toFixed(2);
}

function tableRow(values) {
  return `| ${values.map(escapeCell).join(" | ")} |`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/gu, "\\|").replace(/[\r\n]+/gu, " ").trim();
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or pg-compatible client.");
}

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}
