-- Reconcile the two canonical treatments that had no publicly eligible city.
--
-- Running Analysis is backed by Total Endurance's official Aberdeen menu.
-- Concussion Therapy is backed by three already verified Spine Center Atlanta
-- offerings that were incorrectly classified as valid-but-unmapped.

BEGIN;

SELECT fountain.set_mutation_actor(
  'd5608f46-d9fb-4144-a2a7-202608080102'::uuid,
  'orphan_treatment_supply_reconciliation_20260808'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM fountain.treatments
    WHERE id = 109 AND canonical_name = 'Running Analysis' AND category = 'Measure'
  ) THEN
    RAISE EXCEPTION 'Expected Running Analysis treatment 109 in Measure';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fountain.treatments
    WHERE id = 85 AND canonical_name = 'Concussion Therapy' AND category = 'Recover'
  ) THEN
    RAISE EXCEPTION 'Expected Concussion Therapy treatment 85 in Recover';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fountain.locations
    WHERE id = 13393
      AND status = 'active'
      AND deleted_at IS NULL
      AND owner_account_id IS NULL
      AND verification_status NOT IN ('human_verified', 'owner_verified')
  ) THEN
    RAISE EXCEPTION 'Total Endurance Aberdeen location 13393 is missing or protected';
  END IF;

  IF (
    SELECT count(*)
    FROM fountain.offerings
    WHERE id IN (36582, 166419, 166446)
      AND raw_name = 'Concussion Evaluation and Treatment'
      AND status = 'active'
      AND deleted_at IS NULL
      AND owner_account_id IS NULL
      AND verification_status NOT IN ('human_verified', 'owner_verified')
  ) <> 3 THEN
    RAISE EXCEPTION 'Expected three writable verified concussion offerings';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS fountain_raw.orphan_treatment_locations_backup_20260808 AS
SELECT *
FROM fountain.locations
WHERE id = 13393;

CREATE TABLE IF NOT EXISTS fountain_raw.orphan_treatment_offerings_backup_20260808 AS
SELECT *
FROM fountain.offerings
WHERE location_id = 13393
   OR id IN (36582, 166419, 166446);

CREATE TABLE IF NOT EXISTS fountain_raw.orphan_treatment_term_classifications_backup_20260808 AS
SELECT *
FROM fountain_raw.treatment_term_classifications
WHERE term_normalized IN (
  'biomechanical analysis',
  'biomechanical analysis with 12 week improvement plan',
  'bio mechanical analysis with follow up session',
  'concussion evaluation and treatment'
);

CREATE TABLE IF NOT EXISTS fountain_raw.orphan_treatment_aliases_backup_20260808 AS
SELECT *
FROM fountain_raw.treatment_aliases
WHERE alias_normalized IN (
  'biomechanical running analysis',
  'concussion evaluation and treatment'
);

CREATE TABLE IF NOT EXISTS fountain_raw.orphan_treatment_field_status_backup_20260808 AS
SELECT *
FROM fountain_ops.field_status
WHERE (entity_type = 'location' AND entity_id = 13393)
   OR (entity_type = 'offering' AND entity_id IN (36582, 166419, 166446));

CREATE TABLE IF NOT EXISTS fountain_raw.orphan_treatment_official_evidence_20260808 (
  evidence_key text PRIMARY KEY,
  source_url text NOT NULL,
  assertion text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fountain_raw.orphan_treatment_official_evidence_20260808 (
  evidence_key, source_url, assertion
)
VALUES
  (
    'total_endurance_running_analysis',
    'https://www.total-endurance.co.uk/run-analysis',
    'Official menu publishes three biomechanical running-analysis options at GBP 85, GBP 125, and GBP 190 at the Aberdeen location.'
  ),
  (
    'spine_center_atlanta_concussion_treatment',
    'https://spinecenteratlanta.com/service/concussion-treatment/',
    'Official service page publishes diagnostic testing and therapies for concussion symptoms.'
  )
ON CONFLICT (evidence_key) DO UPDATE
SET source_url = EXCLUDED.source_url,
    assertion = EXCLUDED.assertion,
    recorded_at = now();

UPDATE fountain.locations
SET data_origin = 'manual',
    verification_status = 'agent_verified',
    updated_at = now()
WHERE id = 13393;

WITH running_menu(raw_name, price_amount, description) AS (
  VALUES
    (
      'Biomechanical Analysis',
      85::double precision,
      'High-speed video analysis of running technique to identify inefficiencies, asymmetries, and potential injury risks, with expert feedback and practical recommendations.'
    ),
    (
      'Biomechanical Analysis with 12-week improvement plan',
      125::double precision,
      'A detailed running analysis plus a personalized 12-week plan designed to improve mechanics and address identified inefficiencies.'
    ),
    (
      'Bio-mechanical Analysis with follow-up session',
      190::double precision,
      'A detailed running analysis, a personalized 12-week improvement plan, and a follow-up analysis to measure progress and refine technique.'
    )
)
INSERT INTO fountain.offerings (
  id,
  location_id,
  treatment_id,
  raw_name,
  price_amount,
  price_currency,
  source_offer_url,
  source_id,
  status,
  data_origin,
  verification_status,
  description,
  price_type,
  price_unit,
  price_context,
  price_audience
)
SELECT
  nextval(pg_get_serial_sequence('fountain.offerings', 'id'))::integer,
  13393,
  109,
  running_menu.raw_name,
  running_menu.price_amount,
  'GBP',
  'https://www.total-endurance.co.uk/run-analysis',
  266,
  'active',
  'manual',
  'agent_verified',
  running_menu.description,
  'exact',
  'session',
  'Official standalone running-analysis menu price.',
  'retail'
FROM running_menu
ON CONFLICT (location_id, source_id, raw_name) DO UPDATE
SET treatment_id = EXCLUDED.treatment_id,
    price_amount = EXCLUDED.price_amount,
    price_currency = EXCLUDED.price_currency,
    source_offer_url = EXCLUDED.source_offer_url,
    status = EXCLUDED.status,
    data_origin = EXCLUDED.data_origin,
    verification_status = EXCLUDED.verification_status,
    description = EXCLUDED.description,
    price_type = EXCLUDED.price_type,
    price_unit = EXCLUDED.price_unit,
    price_max_amount = NULL,
    price_context = EXCLUDED.price_context,
    price_audience = EXCLUDED.price_audience,
    updated_at = now();

UPDATE fountain.offerings
SET treatment_id = 85,
    updated_at = now()
WHERE id IN (36582, 166419, 166446)
  AND raw_name = 'Concussion Evaluation and Treatment'
  AND status = 'active'
  AND deleted_at IS NULL;

INSERT INTO fountain_raw.treatment_aliases (
  id,
  treatment_id,
  alias_text,
  alias_normalized,
  source_slug,
  mapping_status,
  mapping_confidence,
  mapping_review_model,
  mapping_reviewed_at,
  mapping_review_rationale
)
VALUES
  (
    nextval(pg_get_serial_sequence('fountain_raw.treatment_aliases', 'id'))::integer,
    109,
    'Biomechanical Running Analysis',
    'biomechanical running analysis',
    'orphan_supply_reconciliation_20260808',
    'active',
    1,
    'manual_official_provider_reconciliation',
    now(),
    'Total Endurance publishes biomechanical run analysis as a dedicated service.'
  ),
  (
    nextval(pg_get_serial_sequence('fountain_raw.treatment_aliases', 'id'))::integer,
    85,
    'Concussion Evaluation and Treatment',
    'concussion evaluation and treatment',
    'orphan_supply_reconciliation_20260808',
    'active',
    1,
    'manual_official_provider_reconciliation',
    now(),
    'Spine Center Atlanta publishes evaluation and treatment specifically for concussion.'
  )
ON CONFLICT (alias_normalized, source_slug) DO UPDATE
SET treatment_id = EXCLUDED.treatment_id,
    alias_text = EXCLUDED.alias_text,
    mapping_status = EXCLUDED.mapping_status,
    mapping_confidence = EXCLUDED.mapping_confidence,
    mapping_review_model = EXCLUDED.mapping_review_model,
    mapping_reviewed_at = now(),
    mapping_review_rationale = EXCLUDED.mapping_review_rationale;

INSERT INTO fountain_raw.treatment_term_classifications (
  term_normalized,
  display_term,
  disposition,
  treatment_id,
  broad_category,
  confidence,
  method,
  model,
  rationale,
  first_pass,
  second_pass,
  occurrence_count,
  run_id,
  classified_at,
  updated_at
)
VALUES
  (
    'concussion evaluation and treatment',
    'Concussion Evaluation and Treatment',
    'mapped_existing',
    85,
    'Recover',
    1,
    'manual_official_provider_reconciliation',
    NULL,
    'Exact provider service is a direct match for canonical Concussion Therapy.',
    NULL,
    NULL,
    3,
    NULL,
    now(),
    now()
  )
ON CONFLICT (term_normalized) DO UPDATE
SET display_term = EXCLUDED.display_term,
    disposition = EXCLUDED.disposition,
    treatment_id = EXCLUDED.treatment_id,
    broad_category = EXCLUDED.broad_category,
    confidence = EXCLUDED.confidence,
    method = EXCLUDED.method,
    model = NULL,
    rationale = EXCLUDED.rationale,
    first_pass = NULL,
    second_pass = NULL,
    occurrence_count = GREATEST(
      fountain_raw.treatment_term_classifications.occurrence_count,
      EXCLUDED.occurrence_count
    ),
    run_id = NULL,
    classified_at = now(),
    updated_at = now();

INSERT INTO fountain_ops.field_status (
  entity_type,
  entity_id,
  field,
  verification,
  locked,
  verified_by,
  verified_at,
  source_note
)
SELECT
  'location',
  13393,
  field,
  'agent_verified',
  false,
  'orphan_treatment_supply_reconciliation_20260808',
  now(),
  'https://www.total-endurance.co.uk/run-analysis | official provider page reviewed 2026-08-08'
FROM unnest(ARRAY['data_origin', 'verification_status']) AS field
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

INSERT INTO fountain_ops.field_status (
  entity_type,
  entity_id,
  field,
  verification,
  locked,
  verified_by,
  verified_at,
  source_note
)
SELECT
  'offering',
  offering.id,
  field,
  'agent_verified',
  false,
  'orphan_treatment_supply_reconciliation_20260808',
  now(),
  offering.source_offer_url || ' | official provider service evidence reviewed 2026-08-08'
FROM fountain.offerings offering
CROSS JOIN unnest(ARRAY[
  'treatment_id', 'raw_name', 'price_amount', 'price_currency',
  'source_offer_url', 'status', 'data_origin', 'verification_status',
  'description', 'price_type', 'price_unit', 'price_context', 'price_audience'
]) AS field
WHERE offering.location_id = 13393
  AND offering.source_offer_url = 'https://www.total-endurance.co.uk/run-analysis'
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

INSERT INTO fountain_ops.field_status (
  entity_type,
  entity_id,
  field,
  verification,
  locked,
  verified_by,
  verified_at,
  source_note
)
SELECT
  'offering',
  offering.id,
  'treatment_id',
  'agent_verified',
  false,
  'orphan_treatment_supply_reconciliation_20260808',
  now(),
  offering.source_offer_url || ' | exact canonical mapping reviewed 2026-08-08'
FROM fountain.offerings offering
WHERE offering.id IN (36582, 166419, 166446)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

SELECT fountain.refresh_search_index_for_location(location_id)
FROM (VALUES (13393), (5265), (5268), (5270)) target(location_id);

DO $$
DECLARE
  canonical_count integer;
  publicly_eligible_count integer;
  running_location_count integer;
  concussion_location_count integer;
BEGIN
  SELECT count(*) INTO canonical_count
  FROM fountain.treatments;

  WITH eligible_treatments AS (
    SELECT offering.treatment_id
    FROM fountain.offerings offering
    JOIN fountain.locations location
      ON location.id = offering.location_id
     AND location.status = 'active'
     AND location.deleted_at IS NULL
    JOIN fountain.city_index city
      ON lower(trim(city.city)) = lower(trim(location.locality))
     AND city.country_code = location.country_code
    WHERE offering.status = 'active'
      AND offering.deleted_at IS NULL
      AND offering.treatment_id IS NOT NULL
      AND NOT coalesce(location.is_virtual, false)
      AND NOT EXISTS (
        SELECT 1
        FROM fountain.offering_display_suppressions suppression
        WHERE suppression.offering_id = offering.id
          AND suppression.active
      )
    GROUP BY offering.treatment_id
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE treatment_id = 109),
    count(*) FILTER (WHERE treatment_id = 85)
  INTO publicly_eligible_count, running_location_count, concussion_location_count
  FROM eligible_treatments;

  IF canonical_count <> 102 OR publicly_eligible_count <> canonical_count THEN
    RAISE EXCEPTION
      'Treatment catalog mismatch after reconciliation: % canonical, % publicly eligible',
      canonical_count,
      publicly_eligible_count;
  END IF;

  IF running_location_count <> 1 OR concussion_location_count <> 1 THEN
    RAISE EXCEPTION
      'Orphan treatments remain ineligible: Running Analysis %, Concussion Therapy %',
      running_location_count,
      concussion_location_count;
  END IF;

  IF (
    SELECT count(*)
    FROM fountain.offerings
    WHERE location_id = 13393
      AND treatment_id = 109
      AND source_offer_url = 'https://www.total-endurance.co.uk/run-analysis'
      AND status = 'active'
      AND deleted_at IS NULL
  ) <> 3 THEN
    RAISE EXCEPTION 'Expected three published Total Endurance running-analysis menu items';
  END IF;

  IF (
    SELECT count(*)
    FROM fountain.offerings
    WHERE id IN (36582, 166419, 166446)
      AND treatment_id = 85
  ) <> 3 THEN
    RAISE EXCEPTION 'Expected all three Spine Center concussion offerings to map to treatment 85';
  END IF;
END;
$$;

COMMIT;
