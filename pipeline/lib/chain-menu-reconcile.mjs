import { createHash } from "node:crypto";

import { query as defaultQuery, withTransaction as defaultWithTransaction } from "./db.mjs";
import { normalizeWebsiteDomain } from "./matcher.mjs";
import { MENU_EXTRACT_PROMPT_VERSION } from "../tasks/menu_extract.mjs";

export const CHAIN_MENU_RECONCILE_CAMPAIGN = "chain_menu_reconcile_v1";
export const CHAIN_MENU_RECONCILE_PRIORITY = 70;
export const CHAIN_MENU_RECONCILE_MAX_ATTEMPTS = 3;

export const CHAIN_MENU_RECONCILE_LOAD_SQL = `
  SELECT
    location.id,
    location.org_id,
    location.name,
    location.website,
    location.address,
    location.locality,
    location.region,
    location.country_code,
    organization.canonical_name AS organization_name,
    count(offering.id) FILTER (
      WHERE offering.status = 'active'
        AND offering.deleted_at IS NULL
    )::integer AS menu_count,
    count(offering.id) FILTER (
      WHERE offering.status = 'active'
        AND offering.deleted_at IS NULL
        AND offering.price_amount IS NOT NULL
    )::integer AS priced_count
  FROM fountain.locations location
  JOIN fountain.organizations organization
    ON organization.id = location.org_id
   AND organization.deleted_at IS NULL
  LEFT JOIN fountain.offerings offering ON offering.location_id = location.id
  WHERE location.status = 'active'
    AND location.deleted_at IS NULL
    AND location.org_id IS NOT NULL
    AND nullif(btrim(location.website), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM fountain.source_records source_record
      JOIN fountain.sources source ON source.id = source_record.source_id
      JOIN fountain_raw.suppressed_source_listings suppressed
        ON suppressed.source_slug = source.slug
       AND suppressed.source_listing_id = source_record.source_listing_id
      WHERE source_record.entity_type = 'location'
        AND source_record.entity_id = location.id
        AND source_record.source_listing_id IS NOT NULL
    )
  GROUP BY location.id, organization.id
  ORDER BY location.org_id, location.id
`;

const CHAIN_MENU_RECONCILE_ENQUEUE_SQL = `
  WITH gate_lock AS MATERIALIZED (
    SELECT pg_advisory_xact_lock(
      hashtextextended('fountain:chain-menu-reconcile:enqueue', 0)
    )
  ), expected AS MATERIALIZED (
    SELECT *
    FROM jsonb_to_recordset($1::jsonb) AS candidate(
      entity_id integer,
      priority integer,
      max_attempts integer,
      payload jsonb
    )
  ), updated_pending AS (
    UPDATE fountain_ops.task_queue queue
    SET priority = LEAST(queue.priority, expected.priority),
        payload = expected.payload,
        max_attempts = GREATEST(queue.max_attempts, expected.max_attempts),
        run_id = $2,
        updated_at = now()
    FROM expected
    CROSS JOIN gate_lock
    WHERE queue.task_type = 'menu_extract'
      AND queue.entity_type = 'location'
      AND queue.entity_id = expected.entity_id
      AND queue.status = 'pending'
    RETURNING queue.entity_id
  ), inserted AS (
    INSERT INTO fountain_ops.task_queue (
      task_type,
      entity_type,
      entity_id,
      priority,
      payload,
      max_attempts,
      run_id
    )
    SELECT
      'menu_extract',
      'location',
      expected.entity_id,
      expected.priority,
      expected.payload,
      expected.max_attempts,
      $2
    FROM expected
    CROSS JOIN gate_lock
    WHERE NOT EXISTS (
      SELECT 1
      FROM fountain_ops.task_queue active
      WHERE active.task_type = 'menu_extract'
        AND active.entity_type = 'location'
        AND active.entity_id = expected.entity_id
        AND active.status IN ('pending', 'claimed')
    )
    ORDER BY expected.priority, expected.entity_id
    ON CONFLICT (task_type, entity_type, entity_id)
      WHERE status IN ('pending', 'claimed')
      DO NOTHING
    RETURNING entity_id
  )
  SELECT
    (SELECT count(*)::integer FROM expected) AS selected_count,
    (SELECT count(*)::integer FROM inserted) AS inserted_count,
    (SELECT count(*)::integer FROM updated_pending) AS adopted_pending_count,
    (
      (SELECT count(*) FROM inserted)
      + (SELECT count(*) FROM updated_pending)
    )::integer AS queued_count,
    (
      SELECT count(*)::integer
      FROM expected
      JOIN fountain_ops.task_queue active
        ON active.task_type = 'menu_extract'
       AND active.entity_type = 'location'
       AND active.entity_id = expected.entity_id
       AND active.status = 'claimed'
    ) AS claimed_conflict_count,
    COALESCE(
      (
        SELECT array_agg(entity_id ORDER BY entity_id)
        FROM (
          SELECT entity_id FROM inserted
          UNION
          SELECT entity_id FROM updated_pending
        ) queued
      ),
      ARRAY[]::integer[]
    ) AS queued_entity_ids
`;

export async function loadChainMenuReconcilePlan({ limit = null } = {}, operations = {}) {
  const query = operations.query || defaultQuery;
  const result = await query(CHAIN_MENU_RECONCILE_LOAD_SQL);
  return buildChainMenuReconcilePlan(result.rows || [], { limit });
}

export function buildChainMenuReconcilePlan(rows, { limit = null } = {}) {
  const groups = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = normalizeRow(raw);
    if (!row) continue;
    const key = `${row.orgId}\0${row.domain}`;
    if (!groups.has(key)) {
      groups.set(key, {
        orgId: row.orgId,
        organizationName: row.organizationName,
        domain: row.domain,
        locations: [],
      });
    }
    groups.get(key).locations.push(row);
  }

  const cohorts = [];
  const candidates = [];
  for (const group of groups.values()) {
    if (group.locations.length < 2) continue;
    const distinctPlaces = new Set(group.locations.map(placeIdentity));
    if (distinctPlaces.size < 2) continue;

    const counts = group.locations.map((row) => row.menuCount).sort(numberAscending);
    const maximum = counts.at(-1) || 0;
    if (maximum < 4) continue;
    const median = counts[Math.floor(counts.length / 2)] || 0;
    const selected = group.locations
      .map((row) => ({ row, reason: reconcileReason(row.menuCount, maximum) }))
      .filter((item) => item.reason !== null);
    if (!selected.length) continue;

    cohorts.push({
      organization_id: group.orgId,
      organization_name: group.organizationName,
      domain: group.domain,
      location_count: group.locations.length,
      distinct_place_count: distinctPlaces.size,
      minimum_menu_count: counts[0],
      median_menu_count: median,
      maximum_menu_count: maximum,
      target_count: selected.length,
    });
    for (const { row, reason } of selected) {
      candidates.push({
        entity_id: row.id,
        location_name: row.name,
        organization_id: group.orgId,
        organization_name: group.organizationName,
        domain: group.domain,
        locality: row.locality,
        region: row.region,
        country_code: row.countryCode,
        current_menu_count: row.menuCount,
        current_priced_count: row.pricedCount,
        peer_menu_maximum: maximum,
        peer_menu_median: median,
        chain_location_count: group.locations.length,
        reason,
      });
    }
  }

  candidates.sort((left, right) => (
    left.organization_name.localeCompare(right.organization_name)
      || left.domain.localeCompare(right.domain)
      || left.current_menu_count - right.current_menu_count
      || left.entity_id - right.entity_id
  ));
  cohorts.sort((left, right) => (
    right.target_count - left.target_count
      || left.organization_name.localeCompare(right.organization_name)
      || left.domain.localeCompare(right.domain)
  ));

  const normalizedLimit = optionalPositiveInteger(limit, "limit");
  const limitedCandidates = normalizedLimit == null
    ? candidates
    : candidates.slice(0, normalizedLimit);
  const digest = createHash("sha256")
    .update(JSON.stringify(limitedCandidates.map((item) => [item.entity_id, item.reason])))
    .digest("hex");

  return {
    campaign: CHAIN_MENU_RECONCILE_CAMPAIGN,
    prompt_version: MENU_EXTRACT_PROMPT_VERSION,
    digest,
    cohort_count: cohorts.length,
    candidate_count: limitedCandidates.length,
    total_candidate_count: candidates.length,
    missing_menu_count: limitedCandidates.filter((item) => item.reason === "menu_missing").length,
    sparse_menu_count: limitedCandidates.filter((item) => item.reason !== "menu_missing").length,
    limited: normalizedLimit != null && limitedCandidates.length < candidates.length,
    cohorts,
    candidates: limitedCandidates,
  };
}

export async function enqueueChainMenuReconcilePlan(plan, { runId } = {}, operations = {}) {
  const withTransaction = operations.withTransaction || defaultWithTransaction;
  const normalizedRunId = positiveInteger(runId, "runId");
  if (!plan || !Array.isArray(plan.candidates)) throw new TypeError("plan.candidates is required.");
  const tasks = plan.candidates.map((candidate) => ({
    entity_id: positiveInteger(candidate.entity_id, "candidate.entity_id"),
    priority: CHAIN_MENU_RECONCILE_PRIORITY,
    max_attempts: CHAIN_MENU_RECONCILE_MAX_ATTEMPTS,
    payload: {
      campaign: CHAIN_MENU_RECONCILE_CAMPAIGN,
      prompt_version: MENU_EXTRACT_PROMPT_VERSION,
      reconcile_reason: candidate.reason,
      organization_id: candidate.organization_id,
      chain_domain: candidate.domain,
      previous_menu_count: candidate.current_menu_count,
      peer_menu_maximum: candidate.peer_menu_maximum,
      plan_digest: plan.digest,
    },
  }));
  if (!tasks.length) {
    return {
      selectedCount: 0,
      insertedCount: 0,
      adoptedPendingCount: 0,
      queuedCount: 0,
      claimedConflictCount: 0,
      queuedEntityIds: [],
    };
  }
  return withTransaction(async (tx) => {
    const result = await tx.query(CHAIN_MENU_RECONCILE_ENQUEUE_SQL, [
      JSON.stringify(tasks),
      normalizedRunId,
    ]);
    const row = result.rows?.[0] || {};
    return {
      selectedCount: Number(row.selected_count || 0),
      insertedCount: Number(row.inserted_count || 0),
      adoptedPendingCount: Number(row.adopted_pending_count || 0),
      queuedCount: Number(row.queued_count || 0),
      claimedConflictCount: Number(row.claimed_conflict_count || 0),
      queuedEntityIds: row.queued_entity_ids || [],
    };
  });
}

function reconcileReason(menuCount, peerMaximum) {
  if (menuCount === 0) return "menu_missing";
  if (peerMaximum >= 12 && menuCount <= 2) return "menu_sparse_absolute";
  if (peerMaximum >= 20 && menuCount / peerMaximum < 0.2) return "menu_sparse_relative";
  return null;
}

function normalizeRow(row) {
  const id = Number(row?.id);
  const orgId = Number(row?.org_id);
  const domain = normalizeWebsiteDomain(row?.website);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(orgId) || orgId <= 0 || !domain) {
    return null;
  }
  return {
    id,
    orgId,
    domain,
    name: cleanText(row.name),
    organizationName: cleanText(row.organization_name) || `Organization ${orgId}`,
    address: cleanText(row.address),
    locality: cleanText(row.locality),
    region: cleanText(row.region),
    countryCode: cleanText(row.country_code).toUpperCase(),
    menuCount: nonnegativeInteger(row.menu_count),
    pricedCount: nonnegativeInteger(row.priced_count),
  };
}

function placeIdentity(row) {
  const locality = row.locality.toLowerCase();
  const region = row.region.toLowerCase();
  const country = row.countryCode.toLowerCase();
  if (locality || region || country) return `${locality}\0${region}\0${country}`;
  return row.address.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/gu, " ");
}

function nonnegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function numberAscending(left, right) {
  return left - right;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return parsed;
}

function optionalPositiveInteger(value, label) {
  if (value == null) return null;
  return positiveInteger(value, label);
}
