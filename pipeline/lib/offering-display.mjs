import { normalizeName } from "./matcher.mjs";

export const OFFERING_DISPLAY_RULE_VERSION = "offering-display-v4";

export const LOAD_OFFERING_DISPLAY_ROWS_SQL = `
  SELECT
    offering.id,
    offering.location_id,
    offering.treatment_id,
    offering.raw_name,
    offering.price_amount,
    offering.price_currency,
    offering.source_offer_url,
    offering.source_id,
    offering.status,
    offering.data_origin,
    offering.verification_status,
    offering.owner_account_id,
    offering.created_at,
    offering.updated_at
  FROM fountain.offerings offering
  WHERE offering.status = 'active'
    AND offering.deleted_at IS NULL
    AND ($1::integer IS NULL OR offering.location_id = $1)
  ORDER BY offering.location_id, offering.id
`;

const APPLY_OFFERING_DISPLAY_DECISIONS_SQL = `
  WITH input_decisions AS (
    SELECT *
    FROM jsonb_to_recordset($1::jsonb) AS decision(
      offering_id integer,
      location_id integer,
      reason text,
      winner_offering_id integer,
      rule_version text,
      evidence jsonb
    )
  ), selected_locations AS (
    SELECT value::integer AS location_id
    FROM jsonb_array_elements_text($2::jsonb)
  ), deactivated AS (
    UPDATE fountain.offering_display_suppressions suppression
    SET active = false,
        updated_at = now()
    WHERE suppression.active
      AND suppression.rule_version LIKE 'offering-display-%'
      AND suppression.location_id IN (SELECT location_id FROM selected_locations)
      AND NOT EXISTS (
        SELECT 1 FROM input_decisions decision
        WHERE decision.offering_id = suppression.offering_id
      )
    RETURNING suppression.offering_id
  ), upserted AS (
    INSERT INTO fountain.offering_display_suppressions (
      offering_id,
      location_id,
      reason,
      winner_offering_id,
      rule_version,
      evidence,
      active,
      created_at,
      updated_at
    )
    SELECT
      offering_id,
      location_id,
      reason,
      winner_offering_id,
      rule_version,
      evidence,
      true,
      now(),
      now()
    FROM input_decisions
    ON CONFLICT (offering_id) DO UPDATE
    SET location_id = EXCLUDED.location_id,
        reason = EXCLUDED.reason,
        winner_offering_id = EXCLUDED.winner_offering_id,
        rule_version = EXCLUDED.rule_version,
        evidence = EXCLUDED.evidence,
        active = true,
        updated_at = now()
    RETURNING offering_id
  )
  SELECT
    (SELECT count(*)::integer FROM upserted) AS active_suppressions,
    (SELECT count(*)::integer FROM deactivated) AS deactivated_suppressions
`;

export async function loadOfferingDisplayRows({ query, locationId = null }) {
  if (typeof query !== "function") throw new TypeError("query must be a function.");
  const normalizedLocationId = locationId == null ? null : positiveInteger(locationId, "locationId");
  const result = await query(LOAD_OFFERING_DISPLAY_ROWS_SQL, [normalizedLocationId]);
  return result.rows.map(normalizeOfferingRow);
}

export function resolveOfferingDisplay(rows) {
  const byLocation = groupBy(rows, (row) => row.location_id);
  const decisions = [];
  const priceConflicts = [];

  for (const locationRows of byLocation.values()) {
    const suppressed = new Map();
    // Exact source-name duplicates are duplicates regardless of whether one
    // row has taxonomy metadata and the other has not been classified yet.
    const exactGroups = groupBy(locationRows, (row) => normalizeOfferingTerm(row.raw_name));

    for (const group of exactGroups.values()) {
      if (group.length < 2) continue;
      const priced = group.filter(hasExplicitPrice);
      const priceGroups = groupBy(priced, priceSignature);
      if (priceGroups.size > 1) {
        priceConflicts.push({
          location_id: group[0].location_id,
          treatment_id: group[0].treatment_id,
          normalized_term: normalizeOfferingTerm(group[0].raw_name),
          offering_ids: group.map((row) => row.id),
          price_signatures: [...priceGroups.keys()],
        });
      }

      for (const samePriceRows of priceGroups.values()) {
        suppressLosers(samePriceRows, "duplicate_same_term", suppressed);
      }

      const unpriced = group.filter((row) => !hasExplicitPrice(row));
      if (priced.length) {
        const winner = bestOffering(priced);
        for (const row of unpriced) {
          suppress(row, winner, "duplicate_unpriced_shadow", suppressed, {
            normalized_term: normalizeOfferingTerm(row.raw_name),
            winner_has_price: true,
          });
        }
      } else {
        suppressLosers(unpriced, "duplicate_same_term", suppressed);
      }
    }

    decisions.push(...suppressed.values());
  }

  return {
    decisions: decisions.sort((left, right) => left.offering_id - right.offering_id),
    price_conflicts: priceConflicts,
    summary: summarizeDecisions(decisions, priceConflicts),
  };
}

export async function applyOfferingDisplayDecisions({ decisions, locationIds, query }) {
  if (typeof query !== "function") throw new TypeError("query must be a function.");
  const normalizedLocations = [...new Set(locationIds.map((id) => positiveInteger(id, "location id")))];
  if (!normalizedLocations.length) {
    return { active_suppressions: 0, deactivated_suppressions: 0 };
  }
  const result = await query(APPLY_OFFERING_DISPLAY_DECISIONS_SQL, [
    JSON.stringify(decisions),
    JSON.stringify(normalizedLocations),
  ]);
  const row = result.rows[0] || {};
  return {
    active_suppressions: Number(row.active_suppressions || 0),
    deactivated_suppressions: Number(row.deactivated_suppressions || 0),
  };
}

export async function recomputeOfferingDisplay({ query, locationId = null, apply = false }) {
  const rows = await loadOfferingDisplayRows({ query, locationId });
  const resolved = resolveOfferingDisplay(rows);
  const locationIds = [...new Set(rows.map((row) => row.location_id))];
  const write = apply
    ? await applyOfferingDisplayDecisions({ decisions: resolved.decisions, locationIds, query })
    : { active_suppressions: 0, deactivated_suppressions: 0 };
  return {
    location_id: locationId == null ? null : Number(locationId),
    locations_scanned: locationIds.length,
    offerings_scanned: rows.length,
    ...resolved,
    write,
  };
}

export function normalizeOfferingTerm(value) {
  return normalizeName(value)
    .replace(/\s+/gu, " ")
    .trim();
}

function suppressLosers(rows, reason, suppressed) {
  if (rows.length < 2) return;
  const winner = bestOffering(rows);
  for (const row of rows) {
    if (row.id === winner.id) continue;
    suppress(row, winner, reason, suppressed, {
      normalized_term: normalizeOfferingTerm(row.raw_name),
      price_signature: priceSignature(row),
    });
  }
}

function suppress(row, winner, reason, suppressed, evidence) {
  if (row.id === winner.id) return;
  const current = suppressed.get(row.id);
  const decision = {
    offering_id: row.id,
    location_id: row.location_id,
    reason,
    winner_offering_id: winner.id,
    rule_version: OFFERING_DISPLAY_RULE_VERSION,
    evidence,
  };
  if (!current || decisionPriority(reason) > decisionPriority(current.reason)) {
    suppressed.set(row.id, decision);
  }
}

function bestOffering(rows) {
  return [...rows].sort((left, right) => (
    offeringScore(right) - offeringScore(left)
    || timestamp(right.updated_at) - timestamp(left.updated_at)
    || right.id - left.id
  ))[0];
}

function offeringScore(row) {
  const verification = {
    owner_verified: 1_000,
    human_verified: 900,
    agent_verified: 200,
    unverified: 0,
  }[row.verification_status] || 0;
  return verification
    + (row.owner_account_id ? 300 : 0)
    + (hasExplicitPrice(row) ? 100 : 0)
    + (row.source_offer_url ? 50 : 0);
}

function hasExplicitPrice(row) {
  return row.price_amount != null && Number.isFinite(Number(row.price_amount));
}

function priceSignature(row) {
  if (!hasExplicitPrice(row)) return "unpriced";
  return `${Number(row.price_amount)}:${String(row.price_currency || "").toUpperCase()}`;
}

function decisionPriority(reason) {
  return {
    duplicate_unpriced_shadow: 2,
    duplicate_same_term: 1,
  }[reason] || 0;
}

function summarizeDecisions(decisions, priceConflicts) {
  const reasons = {};
  for (const decision of decisions) reasons[decision.reason] = (reasons[decision.reason] || 0) + 1;
  return {
    suppressions: decisions.length,
    reasons,
    price_conflicts: priceConflicts.length,
  };
}

function normalizeOfferingRow(row) {
  return {
    ...row,
    id: positiveInteger(row.id, "offering id"),
    location_id: positiveInteger(row.location_id, "location id"),
    treatment_id: row.treatment_id == null ? null : positiveInteger(row.treatment_id, "treatment id"),
    price_amount: row.price_amount == null ? null : Number(row.price_amount),
  };
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function timestamp(value) {
  const number = new Date(value || 0).getTime();
  return Number.isFinite(number) ? number : 0;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return number;
}
