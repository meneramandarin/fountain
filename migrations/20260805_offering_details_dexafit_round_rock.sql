-- Add structured duration and description fields to menu offerings, then
-- replace DexaFit Round Rock's duplicated scraped menu with the six services
-- supplied for editorial publication on Fountain.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'offering_details_dexafit_round_rock_20260805'
);

ALTER TABLE fountain.offerings
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS description text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'fountain.offerings'::regclass
      AND conname = 'offerings_duration_minutes_positive'
  ) THEN
    ALTER TABLE fountain.offerings
      ADD CONSTRAINT offerings_duration_minutes_positive
      CHECK (duration_minutes IS NULL OR duration_minutes > 0);
  END IF;
END;
$$;

COMMENT ON COLUMN fountain.offerings.duration_minutes IS
  'Published appointment duration in whole minutes.';
COMMENT ON COLUMN fountain.offerings.description IS
  'Consumer-facing editorial description of the offering.';

-- Keep the standard replacement helper compatible with the extended schema.
CREATE OR REPLACE FUNCTION fountain.replace_location_offerings(
  p_location_id integer,
  p_offerings jsonb,
  p_actor_id uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF jsonb_typeof(p_offerings) <> 'array' THEN
    RAISE EXCEPTION 'p_offerings must be a JSON array';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM fountain.locations WHERE id = p_location_id) THEN
    RAISE EXCEPTION 'Location % does not exist', p_location_id;
  END IF;

  PERFORM fountain.set_mutation_actor(p_actor_id, 'admin');

  -- Preserve historical offering IDs because taxonomy backup tables can hold
  -- restrictive foreign keys to them. Only retire the currently visible menu.
  UPDATE fountain.offerings
  SET status = 'deleted',
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  WHERE location_id = p_location_id
    AND status = 'active'
    AND deleted_at IS NULL;

  INSERT INTO fountain.offerings (
    location_id,
    treatment_id,
    raw_name,
    price_amount,
    price_currency,
    duration_minutes,
    description,
    source_offer_url,
    source_id,
    status,
    data_origin,
    verification_status
  )
  SELECT
    p_location_id,
    treatment_id,
    raw_name,
    price_amount,
    price_currency,
    duration_minutes,
    description,
    source_offer_url,
    source_id,
    'active',
    'manual',
    'unverified'
  FROM jsonb_to_recordset(p_offerings) AS offering (
    treatment_id integer,
    raw_name text,
    price_amount double precision,
    price_currency text,
    duration_minutes integer,
    description text,
    source_offer_url text,
    source_id integer
  )
  WHERE coalesce(raw_name, '') <> '';

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  PERFORM fountain.refresh_search_index_for_location(p_location_id);
  RETURN inserted_count;
END;
$$;

CREATE TABLE IF NOT EXISTS fountain_raw.dexafit_round_rock_offerings_backup_20260805 AS
SELECT *
FROM fountain.offerings
WHERE location_id = 2196;

SELECT fountain.replace_location_offerings(
  2196,
  $dexafit_menu$
  [
    {
      "treatment_id": 3,
      "raw_name": "DexaFit Body Composition Scan + Consultation",
      "price_amount": 119,
      "price_currency": "USD",
      "duration_minutes": 30,
      "description": "An FDA-approved DEXA body composition scan with AI-enhanced reporting and a consultation. Measures body fat distribution, visceral fat, lean muscle and symmetry, bone health, biological age, ideal body weight, and personalized health targets. Results are delivered in the DexaFit app.",
      "source_offer_url": "https://www.roundrock.dexafit.com/"
    },
    {
      "treatment_id": 8,
      "raw_name": "VO2 Max Test",
      "price_amount": 149,
      "price_currency": "USD",
      "duration_minutes": 40,
      "description": "A treadmill- or bike-based cardiovascular fitness test that measures VO2 max, endurance potential, and aerobic health. The active test typically takes 5 to 10 minutes within the appointment.",
      "source_offer_url": "https://www.roundrock.dexafit.com/"
    },
    {
      "treatment_id": 15,
      "raw_name": "Resting Metabolic Rate (RMR) Test",
      "price_amount": 139,
      "price_currency": "USD",
      "duration_minutes": 30,
      "description": "Measures resting calorie expenditure to estimate daily energy needs for weight loss, maintenance, or gain. Includes an immediate results review. A five-hour fast is required before testing.",
      "source_offer_url": "https://www.roundrock.dexafit.com/"
    },
    {
      "treatment_id": 3,
      "raw_name": "Partner DEXA Scans",
      "price_amount": 198,
      "price_currency": "USD",
      "duration_minutes": 50,
      "description": "Two DEXA body composition scans scheduled together for partners, friends, or family members. Each scan measures body fat distribution, visceral fat, lean muscle, bone health, biological age, and personalized health targets, with results delivered in the DexaFit app.",
      "source_offer_url": "https://www.roundrock.dexafit.com/"
    },
    {
      "treatment_id": 3,
      "raw_name": "DexaStrong Bone Density Scan + Doctor Consultation",
      "price_amount": 349,
      "price_currency": "USD",
      "duration_minutes": 30,
      "description": "Includes a site-specific DEXA scan of the hip, spine, or forearm, radiologist review, and doctor consultation. Designed to evaluate bone density and fracture risk, particularly for adults with elevated risk factors or treatments that may affect bone health.",
      "source_offer_url": "https://www.roundrock.dexafit.com/"
    },
    {
      "treatment_id": 3,
      "raw_name": "DEXA Scan and Go",
      "price_amount": 89,
      "price_currency": "USD",
      "duration_minutes": 15,
      "description": "A streamlined DEXA body composition scan for returning clients who already use the DexaFit app. This appointment does not include a staff report review or nutrition consultation. Results are delivered directly in the app.",
      "source_offer_url": "https://www.roundrock.dexafit.com/"
    }
  ]
  $dexafit_menu$::jsonb,
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid
);

UPDATE fountain.offerings
SET verification_status = 'human_verified',
    updated_at = now()
WHERE location_id = 2196
  AND status = 'active'
  AND deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 2196
      AND slug = 'dexafit-round-rock'
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'DexaFit Round Rock location 2196 is missing or inactive';
  END IF;

  IF (
    SELECT count(*)
    FROM fountain.offerings
    WHERE location_id = 2196
      AND status = 'active'
      AND deleted_at IS NULL
  ) <> 6 THEN
    RAISE EXCEPTION 'Expected six canonical DexaFit Round Rock offerings';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.offerings
    WHERE location_id = 2196
      AND status = 'active'
      AND deleted_at IS NULL
      AND (
        price_amount IS NULL
        OR price_currency <> 'USD'
        OR duration_minutes IS NULL
        OR description IS NULL
        OR btrim(description) = ''
      )
  ) THEN
    RAISE EXCEPTION 'DexaFit Round Rock offering details are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fountain.offerings
    WHERE location_id = 2196
      AND status = 'active'
      AND deleted_at IS NULL
      AND raw_name = 'DexaFit Body Composition Scan + Consultation'
      AND price_amount = 119
  ) OR NOT EXISTS (
    SELECT 1 FROM fountain.offerings
    WHERE location_id = 2196
      AND status = 'active'
      AND deleted_at IS NULL
      AND raw_name = 'VO2 Max Test'
      AND price_amount = 149
  ) OR NOT EXISTS (
    SELECT 1 FROM fountain.offerings
    WHERE location_id = 2196
      AND status = 'active'
      AND deleted_at IS NULL
      AND raw_name = 'Resting Metabolic Rate (RMR) Test'
      AND price_amount = 139
  ) OR NOT EXISTS (
    SELECT 1 FROM fountain.offerings
    WHERE location_id = 2196
      AND status = 'active'
      AND deleted_at IS NULL
      AND raw_name = 'Partner DEXA Scans'
      AND price_amount = 198
  ) OR NOT EXISTS (
    SELECT 1 FROM fountain.offerings
    WHERE location_id = 2196
      AND status = 'active'
      AND deleted_at IS NULL
      AND raw_name = 'DexaStrong Bone Density Scan + Doctor Consultation'
      AND price_amount = 349
  ) OR NOT EXISTS (
    SELECT 1 FROM fountain.offerings
    WHERE location_id = 2196
      AND status = 'active'
      AND deleted_at IS NULL
      AND raw_name = 'DEXA Scan and Go'
      AND price_amount = 89
  ) THEN
    RAISE EXCEPTION 'DexaFit Round Rock menu prices are incomplete';
  END IF;
END;
$$;

COMMIT;
