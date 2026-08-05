-- Publish the Austin Medical Partners performance and metabolic-health menu
-- supplied for editorial publication on Fountain, and attach the supplied
-- clinic equipment photo. Existing records are retained in a raw backup and
-- retired through the canonical replacement helper.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'austin_medical_partners_menu_and_image_20260805'
);

CREATE TABLE IF NOT EXISTS fountain_raw.austin_medical_partners_offerings_backup_20260805 AS
SELECT *
FROM fountain.offerings
WHERE location_id = 2212;

CREATE TABLE IF NOT EXISTS fountain_raw.austin_medical_partners_images_backup_20260805 AS
SELECT *
FROM fountain.images
WHERE entity_type = 'location'
  AND entity_id = 2212;

SELECT fountain.replace_location_offerings(
  2212,
  $austin_medical_partners_menu$
  [
    {
      "treatment_id": 4,
      "raw_name": "DEXA Body Composition Analysis",
      "price_amount": 200,
      "price_currency": "USD",
      "description": "Physician interpretation\n• Body composition tracking\n• Lean body mass\n• % body fat\n• Visceral Adipose Tissue (VAT) analysis with medical treatment recommendations\n• Regional body composition analysis\n• Physician explanation and recommendations personalized to your test results"
    },
    {
      "treatment_id": 8,
      "raw_name": "Exercise & Sports Performance Testing",
      "price_amount": 350,
      "price_currency": "USD",
      "description": "VO2 Max testing\n• Aerobic Threshold (AeT)\n• Anaerobic Threshold (AT)\n• Optimal HR training zone\n• Recommendation to build exercise capacity\n• Recommendations to improve your Anaerobic Threshold (AT) and VO2 Max\n• Recommendations for you, your trainer, nutritionist, or coaches."
    },
    {
      "raw_name": "Initial Medical & Nutrition Evaluation",
      "price_amount": 500,
      "price_currency": "USD",
      "duration_minutes": 60,
      "description": "Initial medical and nutrition evaluation consisting of a 60-minute assessment."
    },
    {
      "raw_name": "RMR/RER Testing",
      "price_amount": 200,
      "price_currency": "USD",
      "description": "Resting Metabolic Rate (RMR) and Respiratory Exchange Ratio (RER) testing."
    },
    {
      "treatment_id": 62,
      "raw_name": "3-Month Weight Management Program",
      "price_amount": 5000,
      "price_currency": "USD",
      "description": "Includes:\n• Initial 90-minute assessment\n• Three 1-hour consultations with a certified Registered Dietitian Nutritionist (RDN)\n• Initial RMR, DEXA body composition, and VO2 testing\n• Weekly 30-minute in-clinic follow-up appointments over the 3-month program with an MD and RDN\n• Medication management of weight-management medications\n• DEXA body composition and VO2 testing at the end of the 3-month program"
    },
    {
      "raw_name": "Full Functional Medicine Assessment",
      "price_amount": null,
      "price_currency": "USD",
      "description": "Comprehensive functional medicine evaluation."
    }
  ]
  $austin_medical_partners_menu$::jsonb,
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid
);

UPDATE fountain.offerings
SET data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
WHERE location_id = 2212
  AND status = 'active'
  AND deleted_at IS NULL;

INSERT INTO fountain.images (
  id,
  entity_type,
  entity_id,
  image_url,
  blob_url,
  content_sha256,
  alt,
  source_id,
  status,
  data_origin,
  verification_status,
  image_kind
)
SELECT
  nextval(pg_get_serial_sequence('fountain.images', 'id'))::integer,
  'location',
  2212,
  'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/location/2212/austin-medical-partners-equipment-07e3ad29d0c17ac84954.png',
  'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/location/2212/austin-medical-partners-equipment-07e3ad29d0c17ac84954.png',
  '07e3ad29d0c17ac84954be55bc4d401a5b4629713acd175b6ecad6146dd0d311',
  'Exercise and body composition testing equipment at Austin Medical Partners',
  NULL,
  'active',
  'manual',
  'human_verified',
  'photo'
WHERE EXISTS (
  SELECT 1
  FROM fountain.locations
  WHERE id = 2212
    AND slug = 'austin-medical-partners'
    AND status = 'active'
    AND deleted_at IS NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM fountain.images
  WHERE entity_type = 'location'
    AND entity_id = 2212
    AND content_sha256 = '07e3ad29d0c17ac84954be55bc4d401a5b4629713acd175b6ecad6146dd0d311'
    AND status = 'active'
    AND deleted_at IS NULL
);

SELECT fountain.refresh_search_index_for_location(2212);
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 2212
      AND slug = 'austin-medical-partners'
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Austin Medical Partners location 2212 is missing or inactive';
  END IF;

  IF (
    SELECT count(*)
    FROM fountain.offerings
    WHERE location_id = 2212
      AND status = 'active'
      AND deleted_at IS NULL
  ) <> 6 THEN
    RAISE EXCEPTION 'Expected six active Austin Medical Partners offerings';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.images
    WHERE entity_type = 'location'
      AND entity_id = 2212
      AND content_sha256 = '07e3ad29d0c17ac84954be55bc4d401a5b4629713acd175b6ecad6146dd0d311'
      AND image_kind = 'photo'
      AND verification_status = 'human_verified'
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Austin Medical Partners supplied photo attachment is incomplete';
  END IF;
END;
$$;

COMMIT;
