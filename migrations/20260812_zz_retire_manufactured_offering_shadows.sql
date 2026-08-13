-- Retire menu rows manufactured by two known legacy write paths:
-- 1. agent-discovery matched_treatments promoted as menu offerings;
-- 2. the 2026-07-07 bootstrap batch's generic treatment-summary rows.
--
-- A row is retired only when a real active sibling with the same canonical
-- treatment exists. Priced rows require an exact price/range/currency match,
-- so this repair cannot discard unique price evidence. Distinct services that
-- merely share a family or parent treatment are intentionally untouched.

BEGIN;

SELECT fountain.set_mutation_actor(
  'b5c71897-83d0-4c30-a7a3-202608120002'::uuid,
  'retire_manufactured_offering_shadows_20260812'
);

CREATE TEMP TABLE manufactured_offering_repairs (
  offering_id integer PRIMARY KEY,
  winner_offering_id integer NOT NULL,
  repair_reason text NOT NULL
) ON COMMIT DROP;

WITH candidate_evidence AS (
  SELECT
    candidate.id AS candidate_id,
    candidate.promoted_location_id AS location_id,
    ARRAY(
      SELECT fountain_raw.normalize_treatment_term(value)
      FROM jsonb_array_elements_text(coalesce(candidate.matched_treatments, '[]'::jsonb)) value
    ) AS matched_terms,
    ARRAY(
      SELECT fountain_raw.normalize_treatment_term(item->>'name')
      FROM jsonb_array_elements(coalesce(candidate.offerings, '[]'::jsonb)) item
    ) AS actual_offering_terms
  FROM fountain_raw.agent_discovery_candidates candidate
  WHERE candidate.promoted_location_id IS NOT NULL
), eligible AS (
  SELECT DISTINCT ON (shadow.id)
    shadow.id AS offering_id,
    winner.id AS winner_offering_id
  FROM candidate_evidence candidate
  JOIN fountain.source_records source_record
    ON source_record.entity_type = 'location'
   AND source_record.entity_id = candidate.location_id
   AND source_record.source_listing_id = candidate.candidate_id
  JOIN fountain.sources source
    ON source.id = source_record.source_id
   AND source.slug = 'agent_discovery'
  JOIN fountain.offerings shadow
    ON shadow.location_id = candidate.location_id
   AND shadow.source_id = source.id
   AND shadow.status = 'active'
   AND shadow.deleted_at IS NULL
  JOIN fountain.offerings winner
    ON winner.location_id = shadow.location_id
   AND winner.treatment_id = shadow.treatment_id
   AND winner.id <> shadow.id
   AND winner.status = 'active'
   AND winner.deleted_at IS NULL
   AND fountain_raw.normalize_treatment_term(winner.raw_name) = ANY(candidate.actual_offering_terms)
   AND (
     shadow.price_amount IS NULL
     OR (
       winner.price_amount IS NOT DISTINCT FROM shadow.price_amount
       AND winner.price_max_amount IS NOT DISTINCT FROM shadow.price_max_amount
       AND winner.price_currency IS NOT DISTINCT FROM shadow.price_currency
     )
   )
  WHERE fountain_raw.normalize_treatment_term(shadow.raw_name) = ANY(candidate.matched_terms)
    AND NOT fountain_raw.normalize_treatment_term(shadow.raw_name) = ANY(candidate.actual_offering_terms)
  ORDER BY
    shadow.id,
    (winner.verification_status IN ('human_verified', 'owner_verified')) DESC,
    (winner.source_id IS NOT NULL) DESC,
    (winner.price_amount IS NOT NULL) DESC,
    winner.id
)
INSERT INTO manufactured_offering_repairs (offering_id, winner_offering_id, repair_reason)
SELECT offering_id, winner_offering_id, 'agent_discovery_matched_treatment_shadow'
FROM eligible;

WITH bootstrap_rows AS (
  SELECT offering.*
  FROM fountain.offerings offering
  WHERE offering.source_id IS NULL
    AND offering.created_at = '2026-07-07 21:32:59.580832+00'::timestamptz
    AND offering.status = 'active'
    AND offering.deleted_at IS NULL
    AND offering.verification_status NOT IN ('human_verified', 'owner_verified')
), eligible AS (
  SELECT DISTINCT ON (shadow.id)
    shadow.id AS offering_id,
    winner.id AS winner_offering_id
  FROM bootstrap_rows shadow
  JOIN fountain.offerings winner
    ON winner.location_id = shadow.location_id
   AND winner.treatment_id = shadow.treatment_id
   AND winner.id <> shadow.id
   AND winner.status = 'active'
   AND winner.deleted_at IS NULL
   AND (
     winner.source_id IS NOT NULL
     OR winner.created_at IS DISTINCT FROM shadow.created_at
   )
   AND (
     shadow.price_amount IS NULL
     OR (
       winner.price_amount IS NOT DISTINCT FROM shadow.price_amount
       AND winner.price_max_amount IS NOT DISTINCT FROM shadow.price_max_amount
       AND winner.price_currency IS NOT DISTINCT FROM shadow.price_currency
     )
   )
  ORDER BY
    shadow.id,
    (winner.verification_status IN ('human_verified', 'owner_verified')) DESC,
    (winner.source_id IS NOT NULL) DESC,
    (winner.price_amount IS NOT NULL) DESC,
    winner.id
)
INSERT INTO manufactured_offering_repairs (offering_id, winner_offering_id, repair_reason)
SELECT offering_id, winner_offering_id, 'legacy_bootstrap_treatment_shadow'
FROM eligible
ON CONFLICT (offering_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS fountain_raw.manufactured_offering_shadows_backup_20260812 AS
SELECT
  offering.*,
  repair.winner_offering_id,
  repair.repair_reason,
  now() AS backed_up_at
FROM manufactured_offering_repairs repair
JOIN fountain.offerings offering ON offering.id = repair.offering_id;

CREATE TABLE IF NOT EXISTS fountain_raw.manufactured_offering_shadow_suppressions_backup_20260812 AS
SELECT suppression.*, now() AS backed_up_at
FROM fountain.offering_display_suppressions suppression
WHERE suppression.offering_id IN (
  SELECT offering_id FROM manufactured_offering_repairs
);

UPDATE fountain.offering_display_suppressions suppression
SET active = false,
    updated_at = now(),
    evidence = suppression.evidence || jsonb_build_object(
      'retired_by', 'retire_manufactured_offering_shadows_20260812'
    )
WHERE suppression.offering_id IN (
  SELECT offering_id FROM manufactured_offering_repairs
)
  AND suppression.active;

UPDATE fountain.offerings offering
SET status = 'deleted',
    deleted_at = now(),
    updated_at = now()
FROM manufactured_offering_repairs repair
WHERE offering.id = repair.offering_id;

DO $$
DECLARE
  agent_count integer;
  bootstrap_count integer;
BEGIN
  SELECT count(*) INTO agent_count
  FROM manufactured_offering_repairs
  WHERE repair_reason = 'agent_discovery_matched_treatment_shadow';

  SELECT count(*) INTO bootstrap_count
  FROM manufactured_offering_repairs
  WHERE repair_reason = 'legacy_bootstrap_treatment_shadow';

  IF agent_count <> 174 THEN
    RAISE EXCEPTION 'Expected 174 agent-discovery shadows, found %', agent_count;
  END IF;

  IF bootstrap_count <> 181 THEN
    RAISE EXCEPTION 'Expected 181 bootstrap shadows, found %', bootstrap_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM manufactured_offering_repairs repair
    JOIN fountain.offerings offering ON offering.id = repair.offering_id
    WHERE offering.status <> 'deleted' OR offering.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'A manufactured offering shadow remained active';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain_raw.manufactured_offering_shadows_backup_20260812 shadow
    JOIN fountain.offerings winner ON winner.id = shadow.winner_offering_id
    WHERE shadow.price_amount IS NOT NULL
      AND (
        winner.price_amount IS DISTINCT FROM shadow.price_amount
        OR winner.price_max_amount IS DISTINCT FROM shadow.price_max_amount
        OR winner.price_currency IS DISTINCT FROM shadow.price_currency
      )
  ) THEN
    RAISE EXCEPTION 'A retired priced shadow lacks an exact-price winner';
  END IF;
END;
$$;

COMMIT;
