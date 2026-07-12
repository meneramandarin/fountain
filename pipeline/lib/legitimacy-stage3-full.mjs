export const LEGITIMACY_STAGE3_FULL_CAMPAIGN = "pass1_stage3_full";
export const LEGITIMACY_STAGE3_FULL_PROMPT_VERSION = "pass1-legitimacy-v3-full";
export const LEGITIMACY_STAGE3_FULL_CONFIDENCE_THRESHOLD = 0.75;
export const LEGITIMACY_STAGE3_FULL_CONCURRENCY = 24;
export const LEGITIMACY_STAGE3_FULL_COMPLETION_PATH =
  "docs/runs/pass1-stage3-completion.md";
export const LEGITIMACY_STAGE3_FULL_HUMAN_REVIEW_PATH =
  "docs/runs/pass1-stage3-final-human-review.md";

export const LEGITIMACY_STAGE3_FULL_EXPECTED_COUNTS = Object.freeze({
  reviewRows: 2_156,
  subjects: 1_187,
});

export const LEGITIMACY_STAGE3_DISCOVERY_ORDER = Object.freeze([
  "stored_provider_id_contact_details_exception",
  "agent_web_search",
  "places_search_then_contact_details_fallback",
]);

export const LEGITIMACY_STAGE3_FULL_PREREQUISITES = Object.freeze([
  "Wire the stage3-full enqueue/drain/report scopes into pipeline/cli.mjs.",
  "Bind agent web search and Google Places clients; set PLACES_LIVE=1 for live contact-only calls.",
  "Persist every accepted website through the field ledger after a row lock and null-field recheck.",
  "Complete one escalation-tier result per pooled classification subject, never one result per organization branch.",
  "Generalize the Gate B atomic suppressor for the Stage 3 campaign and retain its hard-exclusion recheck.",
  "Resolve keep-class tasks without changing serving visibility; hold review/invalid/below-threshold rows for humans.",
  "Reconcile cohort, task-resolution, suppression, keep, and human-review counts before any suppression apply.",
]);

const CLASSES = Object.freeze([
  "junk",
  "plain_hospital",
  "review",
  "destination_medical",
  "in_scope",
]);
const CLASS_SET = new Set(CLASSES);
const SUPPRESSION_CLASS_SET = new Set(["junk", "plain_hospital"]);
const KEEP_CLASS_SET = new Set(["in_scope", "destination_medical"]);
const BASIS_SET = new Set([
  "consumer_wellness",
  "ordinary_care",
  "non_wellness_business",
  "research_only",
  "preventive_destination",
  "insufficient",
  "mixed",
]);
const BASIS_BY_CLASS = Object.freeze({
  in_scope: new Set(["consumer_wellness"]),
  plain_hospital: new Set(["ordinary_care"]),
  junk: new Set(["non_wellness_business", "research_only"]),
  destination_medical: new Set(["preventive_destination"]),
});
const ALLOWED_DISCOVERY_SOURCES = new Set(["web_search", "google_places"]);
const GOOGLE_PROVIDER_NAMES = new Set([
  "google",
  "google_place",
  "google_places",
  "places",
]);

/**
 * Convert one escalation result per pooled subject into an exhaustive, dry-run
 * Stage 3 action plan. This function performs no database or provider calls.
 */
export function buildLegitimacyStage3FullPlan({
  data,
  subjectResults,
  discoveryResults = [],
  hardExclusions = [],
  confidenceThreshold = LEGITIMACY_STAGE3_FULL_CONFIDENCE_THRESHOLD,
  concurrency = LEGITIMACY_STAGE3_FULL_CONCURRENCY,
  expectedCounts = LEGITIMACY_STAGE3_FULL_EXPECTED_COUNTS,
} = {}) {
  const threshold = boundedConfidence(confidenceThreshold, "confidenceThreshold");
  const normalizedConcurrency = positiveInteger(concurrency, "concurrency");
  const cohort = normalizeCohort(data, expectedCounts);
  const resultsByKey = normalizeSubjectResults(subjectResults, cohort.subjectsByKey);
  const exclusionsByLocation = normalizeHardExclusions(
    hardExclusions,
    cohort.branchesByLocation,
  );
  addBranchHardExclusions(exclusionsByLocation, cohort.branchesByLocation);

  const classCountsBySubject = emptyClassCounts();
  const classCountsByRow = emptyClassCounts();
  const subjectPlans = [];
  const taskResolutionPlans = [];
  const keepDecisions = [];
  const suppressionCandidates = [];
  const humanReviewRows = [];

  for (const subject of cohort.subjects) {
    const classification = normalizeClassification(
      resultsByKey.get(subject.classificationKey),
      threshold,
    );
    classCountsBySubject[classification.countedClass] += 1;
    classCountsByRow[classification.countedClass] += subject.locationIds.length;
    const locationDispositions = [];

    for (const branch of subject.branches) {
      const exclusionReasons = exclusionsByLocation.get(branch.locationId) || [];
      const disposition = locationDisposition(classification, exclusionReasons);
      const taskResolution = taskResolutionPlan({
        subject,
        branch,
        classification,
        disposition,
        exclusionReasons,
      });
      taskResolutionPlans.push(taskResolution);
      locationDispositions.push(disposition.action);

      if (disposition.action === "keep") {
        keepDecisions.push({
          ...decisionEvidence(subject, branch, classification),
          action: "keep",
          servingMutationAllowed: false,
        });
      } else if (disposition.action === "suppress") {
        suppressionCandidates.push({
          ...decisionEvidence(subject, branch, classification),
          action: "suppress",
          atomicRecipe: "hidden_status_plus_raw_source_suppression",
          requiresHardExclusionRecheck: true,
          servingMutationAllowedOnlyInAtomicApply: true,
        });
      } else {
        humanReviewRows.push({
          ...decisionEvidence(subject, branch, classification),
          action: "needs_human_review",
          reviewReasons: disposition.reasons,
          staysActive: true,
          servingMutationAllowed: false,
        });
      }
    }

    subjectPlans.push({
      classificationKey: subject.classificationKey,
      classificationLevel: subject.classificationLevel,
      orgId: subject.orgId,
      organizationConflict: subject.organizationConflict,
      evidencePooledAcrossAllLocations: subject.classificationLevel === "organization",
      locationIds: [...subject.locationIds],
      rawClass: classification.rawClass,
      finalClass: classification.accepted ? classification.rawClass : "review",
      confidence: classification.confidence,
      basis: classification.basis,
      positiveEvidence: classification.positiveEvidence,
      rationale: classification.rationale,
      model: classification.model,
      externalCallId: classification.externalCallId,
      normalizationFlags: classification.normalizationFlags,
      disposition: summarizeSubjectDisposition(locationDispositions),
    });
  }

  sortByLocationId(taskResolutionPlans);
  sortByLocationId(keepDecisions);
  sortByLocationId(suppressionCandidates);
  sortByLocationId(humanReviewRows);
  const discovery = normalizeDiscoveryResults(discoveryResults, cohort.branchesByLocation);
  const reconciliation = reconcilePlan({
    cohort,
    subjectPlans,
    taskResolutionPlans,
    keepDecisions,
    suppressionCandidates,
    humanReviewRows,
  });

  return {
    schemaVersion: 1,
    status: "dry_run_only",
    campaign: LEGITIMACY_STAGE3_FULL_CAMPAIGN,
    promptVersion: LEGITIMACY_STAGE3_FULL_PROMPT_VERSION,
    confidenceThreshold: threshold,
    concurrency: normalizedConcurrency,
    discoveryOrder: [...LEGITIMACY_STAGE3_DISCOVERY_ORDER],
    counts: {
      cohortRows: cohort.rowCount,
      subjects: cohort.subjects.length,
      organizationSubjects: cohort.subjects.filter((subject) => (
        subject.classificationLevel === "organization"
      )).length,
      organizationConflictSubjects: cohort.subjects.filter((subject) => (
        subject.classificationLevel === "organization" && subject.organizationConflict
      )).length,
      classCountsBySubject,
      classCountsByRow,
      keepRows: keepDecisions.length,
      suppressionRows: suppressionCandidates.length,
      humanReviewRows: humanReviewRows.length,
      websiteWritePlans: discovery.websiteWritePlans.length,
      websiteWriteSkips: discovery.websiteWriteSkips.length,
      taskResolutionPlans: taskResolutionPlans.length,
    },
    subjectPlans,
    taskResolutionPlans,
    keepDecisions,
    suppressionCandidates,
    humanReviewRows,
    websiteWritePlans: discovery.websiteWritePlans,
    websiteWriteSkips: discovery.websiteWriteSkips,
    reconciliation,
    mutationEvidence: {
      databaseApplyExecuted: false,
      websiteWritesAttempted: 0,
      websiteWritesCompleted: 0,
      suppressionsAttempted: 0,
      suppressionsCompleted: 0,
    },
  };
}

export function buildLegitimacyStage3FullCommands({
  runId,
  budgetUsd,
  suppressionCount,
  campaign = LEGITIMACY_STAGE3_FULL_CAMPAIGN,
  promptVersion = LEGITIMACY_STAGE3_FULL_PROMPT_VERSION,
  concurrency = LEGITIMACY_STAGE3_FULL_CONCURRENCY,
} = {}) {
  const normalizedRunId = positiveIntegerString(runId, "runId");
  const normalizedBudget = positiveNumber(budgetUsd, "budgetUsd");
  const normalizedSuppressionCount = nonnegativeInteger(
    suppressionCount,
    "suppressionCount",
  );
  const normalizedConcurrency = positiveInteger(concurrency, "concurrency");
  const normalizedCampaign = shellToken(campaign, "campaign");
  const normalizedPromptVersion = shellToken(promptVersion, "promptVersion");
  return Object.freeze({
    enqueue: `node pipeline/cli.mjs enqueue --task legitimacy_check --scope stage3-full --apply`,
    drain: `PLACES_LIVE=1 node pipeline/cli.mjs drain --task legitimacy_check --stage stage_3 --campaign ${normalizedCampaign} --prompt-version ${normalizedPromptVersion} --concurrency ${normalizedConcurrency} --budget ${formatCommandNumber(normalizedBudget)} --apply`,
    report: `node pipeline/cli.mjs report --campaign ${normalizedCampaign} --run ${normalizedRunId}`,
    suppressPreview: `node pipeline/cli.mjs suppress --campaign ${normalizedCampaign} --run ${normalizedRunId} --expected ${normalizedSuppressionCount} --dry-run`,
    suppressApply: `node pipeline/cli.mjs suppress --campaign ${normalizedCampaign} --run ${normalizedRunId} --expected ${normalizedSuppressionCount} --apply`,
    requiresCliWiring: true,
  });
}

export function renderLegitimacyStage3FullReport(plan, {
  model = null,
  projectedCost = null,
  runIds = [],
} = {}) {
  assertPlan(plan);
  const lines = [
    "# Pass 1 Legitimacy Triage — Stage 3 Full-Cohort Dry Run",
    "",
    "**NOT APPLIED:** this artifact is an implementation/dry-run plan. No website, status, raw-suppression, search-index, or other serving-data write is claimed.",
    "",
    `Campaign: \`${escapeCell(plan.campaign)}\`; prompt: \`${escapeCell(plan.promptVersion)}\`; confidence threshold: ${formatConfidence(plan.confidenceThreshold)}; concurrency: ${formatInteger(plan.concurrency)}.`,
    "",
    `Run IDs: ${runIds.length > 0 ? runIds.map(String).join(", ") : "not executed"}.`,
    "",
    "## Reconciliation",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Cohort rows | ${formatInteger(plan.counts.cohortRows)} |`,
    `| Pooled classification subjects | ${formatInteger(plan.counts.subjects)} |`,
    `| Organization subjects | ${formatInteger(plan.counts.organizationSubjects)} |`,
    `| Organization-conflict subjects | ${formatInteger(plan.counts.organizationConflictSubjects)} |`,
    `| Keep rows | ${formatInteger(plan.counts.keepRows)} |`,
    `| Atomic suppression candidates | ${formatInteger(plan.counts.suppressionRows)} |`,
    `| Final human-review rows | ${formatInteger(plan.counts.humanReviewRows)} |`,
    `| Guarded website-write plans | ${formatInteger(plan.counts.websiteWritePlans)} |`,
    `| Task-resolution plans | ${formatInteger(plan.counts.taskResolutionPlans)} |`,
    "",
    `Row partition: ${formatInteger(plan.counts.keepRows)} + ${formatInteger(plan.counts.suppressionRows)} + ${formatInteger(plan.counts.humanReviewRows)} = ${formatInteger(plan.counts.cohortRows)} (${plan.reconciliation.valid ? "reconciled" : "NOT RECONCILED"}).`,
    "",
    "## Classification counts",
    "",
    "| Class | Subjects | Rows |",
    "| --- | ---: | ---: |",
  ];
  for (const className of [...CLASSES, "invalid"]) {
    lines.push(tableRow([
      className,
      plan.counts.classCountsBySubject[className],
      plan.counts.classCountsByRow[className],
    ]));
  }
  lines.push(
    "",
    "## Required execution behavior",
    "",
    "1. For a blank location website, use agent web search first. A stored Google provider ID may go directly to contact-only Places details; otherwise Places search plus contact-only details is fallback only.",
    "2. Write an accepted official site only through the field ledger after a row lock and a null-field recheck; never overwrite a stored value.",
    "3. Classify each organization once with every cohort branch's evidence pooled, then fan that verdict out to all member locations.",
    `4. Auto-resolve only at confidence ≥ ${formatConfidence(plan.confidenceThreshold)} with valid positive evidence and the class-specific basis guard.`,
    "5. Resolve `in_scope` and `destination_medical` tasks as keep with no serving visibility change. Send `junk` and `plain_hospital` through the atomic suppression recipe only after the hard-exclusion recheck.",
    `6. Write all remaining rows to \`${LEGITIMACY_STAGE3_FULL_HUMAN_REVIEW_PATH}\` and leave them active.`,
  );
  if (model) {
    lines.push(
      "",
      "## Escalation model",
      "",
      `- Model: \`${escapeCell(model.id || model.model || "unknown")}\`.`,
      `- Input price: ${formatUsd(model.inputUsdPerMillion)} / 1M tokens.`,
      `- Output price: ${formatUsd(model.outputUsdPerMillion)} / 1M tokens.`,
    );
  }
  if (projectedCost) {
    lines.push(
      "",
      "## Cost projection",
      "",
      `- Input/output tokens: ${formatInteger(projectedCost.inputTokens)} / ${formatInteger(projectedCost.outputTokens)}.`,
      `- Model/provider/total: ${formatUsd(projectedCost.modelUsd)} / ${formatUsd(projectedCost.providerUsd)} / ${formatUsd(projectedCost.totalUsd)}.`,
      `- Budget cap: ${formatUsd(projectedCost.budgetUsd)}.`,
    );
  }
  lines.push(
    "",
    "## Mutation evidence",
    "",
    `- Database apply executed: ${plan.mutationEvidence.databaseApplyExecuted ? "yes" : "no"}.`,
    `- Website writes attempted/completed: ${formatInteger(plan.mutationEvidence.websiteWritesAttempted)}/${formatInteger(plan.mutationEvidence.websiteWritesCompleted)}.`,
    `- Suppressions attempted/completed: ${formatInteger(plan.mutationEvidence.suppressionsAttempted)}/${formatInteger(plan.mutationEvidence.suppressionsCompleted)}.`,
    "",
    "**HOLD:** wire and verify the prerequisites before running any apply command.",
  );
  return `${lines.join("\n")}\n`;
}

export function renderLegitimacyStage3HumanReview(plan) {
  assertPlan(plan);
  const lines = [
    "# Pass 1 Legitimacy Triage — Stage 3 Final Human Review",
    "",
    `Rows requiring human review: ${formatInteger(plan.humanReviewRows.length)} of ${formatInteger(plan.counts.cohortRows)}. These rows stay active; this document performs no writes.`,
    "",
    "| Location | Name | Subject | Proposed class | Confidence | Basis | Reason(s) | Positive evidence | Rationale |",
    "| ---: | --- | --- | --- | ---: | --- | --- | --- | --- |",
  ];
  for (const row of plan.humanReviewRows) {
    lines.push(tableRow([
      row.locationId,
      row.name || "—",
      row.classificationKey,
      row.rawClass || "invalid",
      row.confidence == null ? "—" : formatConfidence(row.confidence),
      row.basis || "—",
      row.reviewReasons.join(", "),
      row.positiveEvidence || "—",
      row.rationale || "—",
    ]));
  }
  lines.push(
    "",
    `Reconciliation: keep ${formatInteger(plan.counts.keepRows)} + suppress ${formatInteger(plan.counts.suppressionRows)} + human ${formatInteger(plan.counts.humanReviewRows)} = cohort ${formatInteger(plan.counts.cohortRows)}.`,
  );
  return `${lines.join("\n")}\n`;
}

function normalizeCohort(data, expectedCounts) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("data must be Stage 3 proposal data.");
  }
  if (!Array.isArray(data.subjects) || data.subjects.length === 0) {
    throw new Error("Stage 3 data requires pooled subjects.");
  }
  const subjects = data.subjects.map(normalizeSubject);
  const subjectsByKey = new Map();
  const branchesByLocation = new Map();
  for (const subject of subjects) {
    if (subjectsByKey.has(subject.classificationKey)) {
      throw new Error(`Duplicate Stage 3 subject ${subject.classificationKey}.`);
    }
    subjectsByKey.set(subject.classificationKey, subject);
    for (const branch of subject.branches) {
      if (branchesByLocation.has(branch.locationId)) {
        throw new Error(`Stage 3 location ${branch.locationId} appears in multiple subjects.`);
      }
      branchesByLocation.set(branch.locationId, { subject, branch });
    }
  }
  const rowCount = branchesByLocation.size;
  if (Number(data.counts?.reviewRows) !== rowCount) {
    throw new Error(`Stage 3 data count ${data.counts?.reviewRows} does not match ${rowCount} subject rows.`);
  }
  if (Number(data.counts?.subjects) !== subjects.length) {
    throw new Error(`Stage 3 data subject count ${data.counts?.subjects} does not match ${subjects.length}.`);
  }
  if (expectedCounts != null) {
    const expectedRows = positiveInteger(expectedCounts.reviewRows, "expectedCounts.reviewRows");
    const expectedSubjects = positiveInteger(expectedCounts.subjects, "expectedCounts.subjects");
    if (rowCount !== expectedRows || subjects.length !== expectedSubjects) {
      throw new Error(`Stage 3 full cohort does not reconcile: rows=${rowCount} (expected ${expectedRows}), subjects=${subjects.length} (expected ${expectedSubjects}).`);
    }
  }
  return { subjects, subjectsByKey, branchesByLocation, rowCount };
}

function normalizeSubject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Each Stage 3 subject must be an object.");
  }
  const classificationKey = nonemptyString(value.classificationKey, "classificationKey");
  const classificationLevel = String(value.classificationLevel || "");
  if (!["organization", "location"].includes(classificationLevel)) {
    throw new Error(`Stage 3 subject ${classificationKey} has invalid classificationLevel.`);
  }
  if (!Array.isArray(value.branches) || value.branches.length === 0) {
    throw new Error(`Stage 3 subject ${classificationKey} requires at least one branch.`);
  }
  const branches = value.branches.map((branch) => normalizeBranch(branch, classificationKey));
  const locationIds = branches.map((branch) => branch.locationId);
  if (new Set(locationIds).size !== locationIds.length) {
    throw new Error(`Stage 3 subject ${classificationKey} contains duplicate locations.`);
  }
  if (Array.isArray(value.locationIds)) {
    const supplied = value.locationIds.map((id) => positiveInteger(id, "subject location id"));
    if (supplied.length !== locationIds.length
      || supplied.some((id, index) => id !== locationIds[index])) {
      throw new Error(`Stage 3 subject ${classificationKey} locationIds do not match its branches.`);
    }
  }
  return {
    classificationKey,
    classificationLevel,
    orgId: value.orgId == null ? null : positiveInteger(value.orgId, "orgId"),
    organizationConflict: Boolean(value.organizationConflict),
    organizationEvidence: object(value.organizationEvidence),
    pooledEvidence: object(value.pooledEvidence),
    branches,
    locationIds,
  };
}

function normalizeBranch(value, classificationKey) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Stage 3 subject ${classificationKey} has an invalid branch.`);
  }
  return {
    ...value,
    locationId: positiveInteger(value.locationId ?? value.location_id, "branch location id"),
    name: text(value.name),
    website: text(value.website),
    externalPlaceMatches: Array.isArray(value.externalPlaceMatches)
      ? value.externalPlaceMatches
      : [],
    hardExcluded: Boolean(value.hardExcluded ?? value.hard_excluded),
    hardExclusionReasons: stringArray(
      value.hardExclusionReasons ?? value.hard_exclusion_reasons,
    ),
  };
}

function normalizeSubjectResults(values, subjectsByKey) {
  if (!Array.isArray(values)) throw new TypeError("subjectResults must be an array.");
  const byKey = new Map();
  for (const value of values) {
    const classificationKey = nonemptyString(
      value?.classificationKey
        ?? value?.classification_key
        ?? value?.payload?.classification_key,
      "subject result classificationKey",
    );
    if (!subjectsByKey.has(classificationKey)) {
      throw new Error(`Unexpected Stage 3 result for ${classificationKey}.`);
    }
    if (byKey.has(classificationKey)) {
      throw new Error(`Duplicate Stage 3 result for ${classificationKey}.`);
    }
    byKey.set(classificationKey, value);
  }
  const missing = [...subjectsByKey.keys()].filter((key) => !byKey.has(key));
  if (missing.length > 0 || byKey.size !== subjectsByKey.size) {
    throw new Error(`Stage 3 subject results do not reconcile; missing: ${missing.join(", ") || "none"}.`);
  }
  return byKey;
}

function normalizeClassification(value, threshold) {
  const final = object(value?.result?.final ?? value?.final ?? value);
  const rawClass = text(final.class);
  const rawBasis = text(final.basis);
  const rawConfidence = final.confidence;
  const positiveEvidence = text(
    final.positiveEvidence
      ?? final.positive_evidence
      ?? value?.positiveEvidence
      ?? value?.positive_evidence,
  );
  const rationale = text(final.rationale ?? value?.rationale);
  const normalizationFlags = stringArray(
    final.normalizationFlags
      ?? final.normalization_flags
      ?? value?.normalizationFlags
      ?? value?.normalization_flags,
  );
  const classValid = CLASS_SET.has(rawClass);
  const basisValid = BASIS_SET.has(rawBasis);
  const confidence = nullableBoundedConfidence(rawConfidence);
  if (!classValid) normalizationFlags.push("invalid_class");
  if (!basisValid) normalizationFlags.push("invalid_basis");
  if (confidence == null) normalizationFlags.push("invalid_confidence");

  const reviewReasons = [];
  if (!classValid) reviewReasons.push("invalid_class");
  if (confidence == null) reviewReasons.push("invalid_confidence");
  if (classValid && rawClass === "review") reviewReasons.push("model_review");
  if (classValid && rawClass !== "review" && confidence != null && confidence < threshold) {
    reviewReasons.push("below_confidence_threshold");
  }
  if (classValid && rawClass !== "review" && !positiveEvidence) {
    reviewReasons.push("missing_positive_evidence");
  }
  if (classValid && rawClass !== "review"
    && (!basisValid || !BASIS_BY_CLASS[rawClass]?.has(rawBasis))) {
    reviewReasons.push(classBasisFailure(rawClass));
  }
  const accepted = reviewReasons.length === 0;
  return {
    rawClass,
    countedClass: classValid ? rawClass : "invalid",
    confidence,
    basis: basisValid ? rawBasis : rawBasis || null,
    positiveEvidence,
    rationale,
    normalizationFlags: [...new Set(normalizationFlags)],
    reviewReasons,
    accepted,
    model: text(value?.model ?? final.model ?? value?.result?.model),
    externalCallId: text(
      value?.externalCallId
        ?? value?.external_call_id
        ?? final.external_call_id,
    ),
  };
}

function classBasisFailure(className) {
  if (className === "junk") return "junk_without_affirmative_basis";
  if (className === "destination_medical") return "destination_without_preventive_basis";
  if (className === "plain_hospital") return "plain_hospital_without_ordinary_care_basis";
  if (className === "in_scope") return "in_scope_without_consumer_wellness_basis";
  return "invalid_class_basis";
}

function locationDisposition(classification, exclusionReasons) {
  if (!classification.accepted) {
    return { action: "needs_human_review", reasons: classification.reviewReasons };
  }
  if (KEEP_CLASS_SET.has(classification.rawClass)) {
    return { action: "keep", reasons: [] };
  }
  if (SUPPRESSION_CLASS_SET.has(classification.rawClass)) {
    if (exclusionReasons.length > 0) {
      return {
        action: "needs_human_review",
        reasons: ["hard_exclusion", ...exclusionReasons.map((reason) => `hard_exclusion:${reason}`)],
      };
    }
    return { action: "suppress", reasons: [] };
  }
  return { action: "needs_human_review", reasons: ["unhandled_class"] };
}

function taskResolutionPlan({
  subject,
  branch,
  classification,
  disposition,
  exclusionReasons,
}) {
  const needsHumanReview = disposition.action === "needs_human_review";
  return {
    locationId: branch.locationId,
    classificationKey: subject.classificationKey,
    classificationLevel: subject.classificationLevel,
    orgId: subject.orgId,
    queueStatus: "done",
    resultOutcome: "classified",
    finalClass: needsHumanReview ? "review" : classification.rawClass,
    proposedClass: classification.rawClass,
    confidence: classification.confidence,
    basis: classification.basis,
    positiveEvidence: classification.positiveEvidence,
    rationale: classification.rationale,
    resolution: disposition.action,
    suppressionEligible: disposition.action === "suppress",
    needsHumanReview,
    reviewReasons: disposition.reasons,
    hardExclusionReasons: exclusionReasons,
    servingWrite: { attempted: false, written: false },
  };
}

function decisionEvidence(subject, branch, classification) {
  return {
    locationId: branch.locationId,
    name: branch.name,
    classificationKey: subject.classificationKey,
    classificationLevel: subject.classificationLevel,
    orgId: subject.orgId,
    organizationConflict: subject.organizationConflict,
    subjectLocationCount: subject.locationIds.length,
    rawClass: classification.rawClass,
    confidence: classification.confidence,
    basis: classification.basis,
    positiveEvidence: classification.positiveEvidence,
    rationale: classification.rationale,
    model: classification.model,
    externalCallId: classification.externalCallId,
  };
}

function normalizeHardExclusions(values, branchesByLocation) {
  if (!Array.isArray(values)) throw new TypeError("hardExclusions must be an array.");
  const byLocation = new Map();
  for (const value of values) {
    const locationId = positiveInteger(
      typeof value === "number" ? value : value?.locationId ?? value?.location_id,
      "hard exclusion location id",
    );
    if (!branchesByLocation.has(locationId)) {
      throw new Error(`Hard exclusion location ${locationId} is outside the Stage 3 cohort.`);
    }
    const reasons = typeof value === "number"
      ? ["preflight_match"]
      : stringArray(value?.reasons ?? value?.reason ?? value?.hard_exclusion_reasons);
    const existing = byLocation.get(locationId) || [];
    byLocation.set(locationId, [...new Set([...existing, ...(reasons.length > 0 ? reasons : ["preflight_match"])])]);
  }
  return byLocation;
}

function addBranchHardExclusions(byLocation, branchesByLocation) {
  for (const [locationId, { branch }] of branchesByLocation) {
    if (!branch.hardExcluded && branch.hardExclusionReasons.length === 0) continue;
    const existing = byLocation.get(locationId) || [];
    const reasons = branch.hardExclusionReasons.length > 0
      ? branch.hardExclusionReasons
      : ["cohort_preflight_match"];
    byLocation.set(locationId, [...new Set([...existing, ...reasons])]);
  }
}

function normalizeDiscoveryResults(values, branchesByLocation) {
  if (!Array.isArray(values)) throw new TypeError("discoveryResults must be an array.");
  const seen = new Set();
  const websiteWritePlans = [];
  const websiteWriteSkips = [];
  for (const value of values) {
    const locationId = positiveInteger(
      value?.locationId ?? value?.location_id,
      "discovery result location id",
    );
    const cohortEntry = branchesByLocation.get(locationId);
    if (!cohortEntry) {
      throw new Error(`Website discovery location ${locationId} is outside the Stage 3 cohort.`);
    }
    if (seen.has(locationId)) {
      throw new Error(`Duplicate website discovery result for location ${locationId}.`);
    }
    seen.add(locationId);
    if (value?.write_attempted === true || value?.database_mutated === true
      || value?.writeAttempted === true || value?.databaseMutated === true) {
      throw new Error(`Website discovery result ${locationId} is not dry-run evidence.`);
    }
    assertDiscoveryAttemptOrder(value, cohortEntry.branch);
    const proposedWebsite = text(
      value?.wouldWriteWebsite
        ?? value?.would_write_website
        ?? value?.discoveredWebsite
        ?? value?.discovered_website,
    );
    if (!proposedWebsite) continue;
    const source = text(value?.source);
    const official = value?.validation?.official === true;
    if (cohortEntry.branch.website) {
      websiteWriteSkips.push({
        locationId,
        website: proposedWebsite,
        reason: "stored_website_present",
      });
      continue;
    }
    if (value?.outcome !== "official_website_found" || !official
      || !ALLOWED_DISCOVERY_SOURCES.has(source)) {
      websiteWriteSkips.push({
        locationId,
        website: proposedWebsite,
        reason: "unverified_official_website",
      });
      continue;
    }
    const website = normalizedHttpUrl(proposedWebsite, `discovery result ${locationId} website`);
    websiteWritePlans.push({
      locationId,
      website,
      source,
      provider: text(value?.provider),
      providerPlaceId: text(value?.provider_place_id ?? value?.providerPlaceId),
      validation: value.validation,
      ledgerGuard: {
        entityType: "location",
        field: "website",
        expectedCurrentValue: null,
        lockLocationRow: true,
        recheckBlankAfterLock: true,
        recordWriteRequired: true,
      },
      applyAttempted: false,
      databaseMutated: false,
    });
  }
  sortByLocationId(websiteWritePlans);
  sortByLocationId(websiteWriteSkips);
  return { websiteWritePlans, websiteWriteSkips };
}

function assertDiscoveryAttemptOrder(value, branch) {
  if (!Array.isArray(value?.attempts) || value.attempts.length === 0) return;
  const sources = value.attempts.map((attempt) => text(attempt?.source));
  const hasStoredProviderId = branch.externalPlaceMatches.some((match) => (
    GOOGLE_PROVIDER_NAMES.has(text(match?.provider).toLowerCase())
      && text(match?.providerPlaceId ?? match?.provider_place_id)
  ));
  const firstWebSearch = sources.indexOf("web_search");
  const firstPlacesSearch = sources.indexOf("google_places_search");
  const firstPlacesDetails = sources.indexOf("google_places");
  if (!hasStoredProviderId) {
    const firstPlaces = [firstPlacesSearch, firstPlacesDetails]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];
    if (firstPlaces != null && (firstWebSearch < 0 || firstPlaces < firstWebSearch)) {
      throw new Error(`Website discovery ${branch.locationId} violated agent-first ordering.`);
    }
    if (firstPlacesDetails >= 0
      && (firstPlacesSearch < 0 || firstPlacesDetails < firstPlacesSearch)) {
      throw new Error(`Website discovery ${branch.locationId} used Places details without a stored or searched provider ID.`);
    }
  } else if (firstPlacesSearch >= 0) {
    throw new Error(`Website discovery ${branch.locationId} searched Places despite a stored provider ID.`);
  }
}

function reconcilePlan({
  cohort,
  subjectPlans,
  taskResolutionPlans,
  keepDecisions,
  suppressionCandidates,
  humanReviewRows,
}) {
  const partitionCount = keepDecisions.length
    + suppressionCandidates.length
    + humanReviewRows.length;
  const ids = [
    ...keepDecisions.map((item) => item.locationId),
    ...suppressionCandidates.map((item) => item.locationId),
    ...humanReviewRows.map((item) => item.locationId),
  ];
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missingIds = [...cohort.branchesByLocation.keys()].filter((id) => !ids.includes(id));
  const valid = partitionCount === cohort.rowCount
    && taskResolutionPlans.length === cohort.rowCount
    && subjectPlans.length === cohort.subjects.length
    && duplicateIds.length === 0
    && missingIds.length === 0;
  if (!valid) {
    throw new Error(`Stage 3 action plan does not reconcile: partition=${partitionCount}/${cohort.rowCount}, tasks=${taskResolutionPlans.length}/${cohort.rowCount}, subjects=${subjectPlans.length}/${cohort.subjects.length}, duplicates=${duplicateIds.length}, missing=${missingIds.length}.`);
  }
  return {
    valid: true,
    cohortRows: cohort.rowCount,
    partitionRows: partitionCount,
    taskResolutionRows: taskResolutionPlans.length,
    subjectResults: subjectPlans.length,
    duplicateLocationDecisions: 0,
    missingLocationDecisions: 0,
  };
}

function summarizeSubjectDisposition(actions) {
  const unique = [...new Set(actions)];
  if (unique.length === 1) return unique[0];
  if (unique.includes("suppress") && unique.includes("needs_human_review")) {
    return "mixed_suppress_and_review";
  }
  return "mixed";
}

function emptyClassCounts() {
  return {
    junk: 0,
    plain_hospital: 0,
    review: 0,
    destination_medical: 0,
    in_scope: 0,
    invalid: 0,
  };
}

function assertPlan(plan) {
  if (!plan || plan.status !== "dry_run_only" || !plan.reconciliation?.valid) {
    throw new Error("A reconciled Stage 3 dry-run plan is required.");
  }
  if (!Array.isArray(plan.humanReviewRows)) {
    throw new Error("Stage 3 plan requires humanReviewRows.");
  }
}

function sortByLocationId(values) {
  values.sort((left, right) => left.locationId - right.locationId);
}

function stringArray(value) {
  if (value == null || value === "") return [];
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(text).filter(Boolean))];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .trim();
}

function nonemptyString(value, label) {
  const normalized = text(value);
  if (!normalized) throw new TypeError(`${label} must be non-empty.`);
  return normalized;
}

function positiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return normalized;
}

function nonnegativeInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} must be a nonnegative integer.`);
  }
  return normalized;
}

function positiveIntegerString(value, label) {
  const normalized = String(value ?? "");
  if (!/^[1-9]\d*$/u.test(normalized)) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return normalized;
}

function positiveNumber(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new TypeError(`${label} must be positive.`);
  }
  return normalized;
}

function boundedConfidence(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new TypeError(`${label} must be between 0 and 1.`);
  }
  return normalized;
}

function nullableBoundedConfidence(value) {
  if (value == null || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 && normalized <= 1
    ? normalized
    : null;
}

function normalizedHttpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new TypeError(`${label} must be an absolute HTTP(S) URL.`);
  }
  url.hash = "";
  return url.href;
}

function shellToken(value, label) {
  const normalized = nonemptyString(value, label);
  if (!/^[A-Za-z0-9._-]+$/u.test(normalized)) {
    throw new TypeError(`${label} contains unsupported shell characters.`);
  }
  return normalized;
}

function formatCommandNumber(value) {
  return String(Number(value.toFixed(4)));
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatConfidence(value) {
  return Number(value).toFixed(2);
}

function formatUsd(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? `$${normalized.toFixed(2)}` : "—";
}

function escapeCell(value) {
  return text(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function tableRow(values) {
  return `| ${values.map(escapeCell).join(" | ")} |`;
}
