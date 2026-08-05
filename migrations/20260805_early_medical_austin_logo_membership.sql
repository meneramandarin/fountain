-- Add the official Early Medical logo as the primary listing image and publish
-- the supplied annual membership offering for Early Medical Austin.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'early_medical_austin_logo_membership_20260805'
);

CREATE TABLE IF NOT EXISTS fountain_raw.early_medical_austin_images_backup_20260805 AS
SELECT *
FROM fountain.images
WHERE entity_type = 'location'
  AND entity_id = 13422;

CREATE TABLE IF NOT EXISTS fountain_raw.early_medical_austin_offerings_backup_20260805 AS
SELECT *
FROM fountain.offerings
WHERE location_id = 13422;

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
  13422,
  'https://earlymedical.com/wp-content/themes/early-medical-2023/assets/images/logo-reverse.svg',
  'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/location/13422/early-medical-logo-reverse-d7049e25f1843fccf302.svg',
  'd7049e25f1843fccf3021b7c76d641de700262e4b4b0485af3a838f62e5a9416',
  'Early Medical logo',
  NULL,
  'active',
  'manual',
  'human_verified',
  'logo'
WHERE EXISTS (
  SELECT 1
  FROM fountain.locations
  WHERE id = 13422
    AND slug = 'early-medical-austin'
    AND status = 'active'
    AND deleted_at IS NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM fountain.images
  WHERE entity_type = 'location'
    AND entity_id = 13422
    AND content_sha256 = 'd7049e25f1843fccf3021b7c76d641de700262e4b4b0485af3a838f62e5a9416'
    AND status = 'active'
    AND deleted_at IS NULL
);

UPDATE fountain.images
SET updated_at = now()
WHERE entity_type = 'location'
  AND entity_id = 13422
  AND content_sha256 = 'd7049e25f1843fccf3021b7c76d641de700262e4b4b0485af3a838f62e5a9416'
  AND status = 'active'
  AND deleted_at IS NULL;

INSERT INTO fountain.offerings (
  id,
  location_id,
  treatment_id,
  raw_name,
  price_amount,
  price_currency,
  description,
  source_offer_url,
  status,
  data_origin,
  verification_status
)
SELECT
  nextval(pg_get_serial_sequence('fountain.offerings', 'id'))::integer,
  13422,
  NULL,
  'Early Medical Membership (annual)',
  60000,
  'USD',
  'Early Medical is Peter Attia’s virtual longevity medical practice, headquartered in Austin. Its Medicine 3.0 approach provides proactive, personalized care through a dedicated physician and specialist team, with an emphasis on preventing chronic disease and preserving physical, cognitive, and emotional health. Membership costs $60,000 per year. The practice is currently at capacity and accepting waitlist applications.',
  'https://earlymedical.com/',
  'active',
  'manual',
  'human_verified'
WHERE EXISTS (
  SELECT 1
  FROM fountain.locations
  WHERE id = 13422
    AND slug = 'early-medical-austin'
    AND status = 'active'
    AND deleted_at IS NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM fountain.offerings
  WHERE location_id = 13422
    AND raw_name = 'Early Medical Membership (annual)'
    AND status = 'active'
    AND deleted_at IS NULL
);

SELECT fountain.refresh_search_index_for_location(13422);
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.images
    WHERE entity_type = 'location'
      AND entity_id = 13422
      AND blob_url = 'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/location/13422/early-medical-logo-reverse-d7049e25f1843fccf302.svg'
      AND image_kind = 'logo'
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Early Medical logo was not attached';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.offerings
    WHERE location_id = 13422
      AND raw_name = 'Early Medical Membership (annual)'
      AND price_amount = 60000
      AND price_currency = 'USD'
      AND verification_status = 'human_verified'
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Early Medical annual membership was not published';
  END IF;
END;
$$;

COMMIT;
