-- Add the official Live Lean Rx logo to the three active chain locations,
-- publish the screenshot-backed service descriptions and durations for their
-- matching menu items, and record that visits are by appointment only.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'live_lean_rx_chain_logo_descriptions_20260805'
);

ALTER TABLE fountain.locations
  ADD COLUMN IF NOT EXISTS opening_hours_note text;

COMMENT ON COLUMN fountain.locations.opening_hours_note IS
  'Freeform opening-hours note shown when a location does not publish fixed hours.';

CREATE TABLE IF NOT EXISTS fountain_raw.live_lean_rx_chain_images_backup_20260805 AS
SELECT image.*
FROM fountain.images image
JOIN fountain.locations location ON location.id = image.entity_id
WHERE image.entity_type = 'location'
  AND location.org_id = 4261;

CREATE TABLE IF NOT EXISTS fountain_raw.live_lean_rx_chain_offerings_backup_20260805 AS
SELECT offering.*
FROM fountain.offerings offering
JOIN fountain.locations location ON location.id = offering.location_id
WHERE location.org_id = 4261;

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
  location.id,
  'https://liveleanrx.com/assets/white-logo.png',
  'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/4261/live-lean-rx-white-logo-e868fdb9aeee06258c4f.png',
  'e868fdb9aeee06258c4f8425c0a34dc54e21fc566781400e73a1ad1db437b8f5',
  'Live Lean Rx logo',
  NULL,
  'active',
  'manual',
  'human_verified',
  'logo'
FROM fountain.locations location
WHERE location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM fountain.images existing
    WHERE existing.entity_type = 'location'
      AND existing.entity_id = location.id
      AND existing.content_sha256 = 'e868fdb9aeee06258c4f8425c0a34dc54e21fc566781400e73a1ad1db437b8f5'
      AND existing.status = 'active'
      AND existing.deleted_at IS NULL
  );

UPDATE fountain.images image
SET updated_at = now()
FROM fountain.locations location
WHERE image.entity_type = 'location'
  AND image.entity_id = location.id
  AND location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND image.content_sha256 = 'e868fdb9aeee06258c4f8425c0a34dc54e21fc566781400e73a1ad1db437b8f5'
  AND image.status = 'active'
  AND image.deleted_at IS NULL;

UPDATE fountain.locations
SET opening_hours_note = 'By appointment only',
    updated_at = now()
WHERE org_id = 4261
  AND status = 'active'
  AND deleted_at IS NULL;

UPDATE fountain.offerings
SET raw_name = 'DEXA Body Composition Scan',
    duration_minutes = 20,
    description = '98% accurate measurement of your lean muscle mass, fat mass, and bone mineral density with the gold standard of body composition analysis.\n• Find out if you have any muscle imbalances and how much visceral fat vs. subcutaneous fat you have stored in your body.\n• Your results are available immediately. Learn exactly what your results mean for your health and fitness from one of our experienced technicians. Visually track the changes in your body throughout the year.',
    data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
FROM fountain.locations location
WHERE fountain.offerings.location_id = location.id
  AND location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND lower(trim(fountain.offerings.raw_name)) IN ('dexa scan', 'dexa body composition scan')
  AND fountain.offerings.status = 'active'
  AND fountain.offerings.deleted_at IS NULL;

UPDATE fountain.offerings
SET raw_name = 'RMR Metabolic Health Analysis',
    duration_minutes = 40,
    description = 'The 40-minute RMR test measures the speed of your metabolism and the amount of calories you burn at rest.\n• Learn your metabolic health and how to optimize your diet to reach your personal fitness goals sooner.',
    data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
FROM fountain.locations location
WHERE fountain.offerings.location_id = location.id
  AND location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND lower(trim(fountain.offerings.raw_name)) = 'rmr test'
  AND fountain.offerings.status = 'active'
  AND fountain.offerings.deleted_at IS NULL;

UPDATE fountain.offerings
SET raw_name = 'VO2 Cardio Fitness Test',
    duration_minutes = 40,
    description = 'Discover your cardiovascular fitness health with the VO2 Cardio Fitness test.\n• Get clinical-grade data and feedback to identify the heart rate zone where you can train fastest, and discover your aerobic threshold, anaerobic threshold, and amount of calories you burn during exercise.\n• This is a clinical-grade measurement used by professional sports labs, and is far more accurate than any fitness tracker or treadmill estimate.',
    data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
FROM fountain.locations location
WHERE fountain.offerings.location_id = location.id
  AND location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND lower(trim(fountain.offerings.raw_name)) = 'vo2 max test'
  AND fountain.offerings.status = 'active'
  AND fountain.offerings.deleted_at IS NULL;

UPDATE fountain.offerings
SET raw_name = 'DEXA + RMR',
    duration_minutes = 60,
    data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
FROM fountain.locations location
WHERE fountain.offerings.location_id = location.id
  AND location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND lower(trim(fountain.offerings.raw_name)) LIKE 'dexa + rmr%'
  AND fountain.offerings.status = 'active'
  AND fountain.offerings.deleted_at IS NULL;

UPDATE fountain.offerings
SET raw_name = 'DEXA + VO2',
    duration_minutes = 60,
    data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
FROM fountain.locations location
WHERE fountain.offerings.location_id = location.id
  AND location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND lower(trim(fountain.offerings.raw_name)) LIKE 'dexa + vo2%'
  AND fountain.offerings.status = 'active'
  AND fountain.offerings.deleted_at IS NULL;

UPDATE fountain.offerings
SET raw_name = 'LLRx Starter Pack (DEXA + RMR + VO2)',
    duration_minutes = 80,
    description = 'Complete baseline assessment of your body composition, cardio fitness level, and metabolic health — includes DEXA scan, VO2 assessment, and RMR analysis.\nEverything you need to optimize your planning and accurately track your progress.',
    data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
FROM fountain.locations location
WHERE fountain.offerings.location_id = location.id
  AND location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND lower(trim(fountain.offerings.raw_name)) LIKE 'llrx starter pack%'
  AND fountain.offerings.status = 'active'
  AND fountain.offerings.deleted_at IS NULL;

UPDATE fountain.offerings
SET raw_name = 'Food Intolerance Test 96 Marker',
    duration_minutes = 15,
    description = 'Food Intolerance Test',
    data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
FROM fountain.locations location
WHERE fountain.offerings.location_id = location.id
  AND location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND lower(trim(fountain.offerings.raw_name)) LIKE 'food sensitivity 96 panel%'
  AND fountain.offerings.status = 'active'
  AND fountain.offerings.deleted_at IS NULL;

UPDATE fountain.offerings
SET raw_name = 'Food Intolerance Test 184 Marker',
    duration_minutes = 15,
    description = '184 Marker Test',
    data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
FROM fountain.locations location
WHERE fountain.offerings.location_id = location.id
  AND location.org_id = 4261
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND lower(trim(fountain.offerings.raw_name)) LIKE 'food sensitivity 184 panel%'
  AND fountain.offerings.status = 'active'
  AND fountain.offerings.deleted_at IS NULL;

DO $$
DECLARE
  target_location record;
BEGIN
  FOR target_location IN
    SELECT id
    FROM fountain.locations
    WHERE org_id = 4261 AND status = 'active' AND deleted_at IS NULL
  LOOP
    PERFORM fountain.refresh_search_index_for_location(target_location.id);
  END LOOP;
END;
$$;
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF (SELECT count(*) FROM fountain.locations WHERE org_id = 4261 AND status = 'active' AND deleted_at IS NULL) <> 3 THEN
    RAISE EXCEPTION 'Expected three active Live Lean Rx chain locations';
  END IF;

  IF (
    SELECT count(*)
    FROM fountain.images image
    JOIN fountain.locations location ON location.id = image.entity_id
    WHERE image.entity_type = 'location'
      AND location.org_id = 4261
      AND image.content_sha256 = 'e868fdb9aeee06258c4f8425c0a34dc54e21fc566781400e73a1ad1db437b8f5'
      AND image.status = 'active'
      AND image.deleted_at IS NULL
  ) <> 3 THEN
    RAISE EXCEPTION 'Expected the Live Lean Rx logo on three active locations';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE org_id = 4261
      AND status = 'active'
      AND deleted_at IS NULL
      AND opening_hours_note <> 'By appointment only'
  ) THEN
    RAISE EXCEPTION 'Live Lean Rx appointment-only note is incomplete';
  END IF;
END;
$$;

COMMIT;
