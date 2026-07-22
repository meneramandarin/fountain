-- Attach a verified photo of the Warsaw clinic from the official Longevity Center
-- Poland page. The source image is the first item in the page's "Visit us in
-- Warsaw" gallery and was copied to Vercel Blob on 2026-07-21.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'longevity_center_warsaw_image_20260721'
);

CREATE TABLE IF NOT EXISTS fountain_raw.longevity_center_warsaw_images_backup_20260721 AS
SELECT *
FROM fountain.images
WHERE entity_type = 'location'
  AND entity_id = 2530;

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
  2530,
  'https://longevity-center.eu/wp-content/uploads/2022/12/lc_misiurewicz_fot0082_full-scaled.jpg',
  'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/location/2530/1b906bf1b2837a7719a1.jpg',
  '1b906bf1b2837a7719a1c6229eb94114d240f215975a662a56fd83e7ff370c41',
  'Consultation at Longevity Center Warsaw',
  NULL,
  'active',
  'manual',
  'human_verified',
  'photo'
WHERE EXISTS (
  SELECT 1
  FROM fountain.locations
  WHERE id = 2530
    AND slug = 'longevity-center-warsaw'
    AND locality = 'Warsaw'
    AND country_code = 'PL'
)
AND NOT EXISTS (
  SELECT 1
  FROM fountain.images
  WHERE entity_type = 'location'
    AND entity_id = 2530
    AND content_sha256 = '1b906bf1b2837a7719a1c6229eb94114d240f215975a662a56fd83e7ff370c41'
    AND status = 'active'
    AND deleted_at IS NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.images
    WHERE entity_type = 'location'
      AND entity_id = 2530
      AND blob_url = 'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/location/2530/1b906bf1b2837a7719a1.jpg'
      AND content_sha256 = '1b906bf1b2837a7719a1c6229eb94114d240f215975a662a56fd83e7ff370c41'
      AND image_kind = 'photo'
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Longevity Center Warsaw image attachment is incomplete';
  END IF;
END;
$$;

COMMIT;
