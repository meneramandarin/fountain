-- Keep one copy of the repeated DexaFit Tampa image and hide the three
-- duplicate database rows. The shared Vercel Blob object remains untouched.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'dexafit_tampa_duplicate_image_cleanup_20260805'
);

CREATE TABLE IF NOT EXISTS fountain_raw.dexafit_tampa_duplicate_images_backup_20260805 AS
SELECT *
FROM fountain.images
WHERE entity_type = 'location'
  AND entity_id = 2192;

UPDATE fountain.images
SET status = 'hidden',
    deleted_at = COALESCE(deleted_at, now()),
    updated_at = now()
WHERE entity_type = 'location'
  AND entity_id = 2192
  AND content_sha256 = 'f358be0658da0922804404fddfc287fa2a18527d9519ec8ac76815eec256e00f'
  AND id <> 34706
  AND status = 'active'
  AND deleted_at IS NULL;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM fountain.images
    WHERE entity_type = 'location'
      AND entity_id = 2192
      AND status = 'active'
      AND deleted_at IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'DexaFit Tampa should have exactly one active image';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.images
    WHERE id = 34706
      AND entity_type = 'location'
      AND entity_id = 2192
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'DexaFit Tampa retained image is missing';
  END IF;
END;
$$;

COMMIT;
