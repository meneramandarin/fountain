-- Hide the older unverified Mattr Biowellness Club image that duplicates the
-- agent-verified MATTR-97.jpg photo. Preserve the row and blob for reversibility.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'hide_mattr_duplicate_image_20260827'
);

CREATE TABLE IF NOT EXISTS fountain_raw.mattr_duplicate_image_backup_20260827 AS
SELECT image.*
FROM fountain.images image
JOIN fountain.locations location
  ON location.id = image.entity_id
WHERE image.id = 22215
  AND image.entity_type = 'location'
  AND image.entity_id = 2369
  AND location.slug = 'mattr-biowellness-club-austin'
  AND image.content_sha256 = '44244e2d9211cd28661d391994f966d808403a0df0f3eccc48ab7dd61ff8646e';

DO $$
BEGIN
  IF (SELECT count(*)
      FROM fountain_raw.mattr_duplicate_image_backup_20260827) <> 1 THEN
    RAISE EXCEPTION 'Expected one Mattr duplicate image backup';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.images image
    WHERE image.id = 44399
      AND image.entity_type = 'location'
      AND image.entity_id = 2369
      AND image.content_sha256 = '3f02c01f44b18987f327979585b35765b590c9fa4b4ee57618fbbde65dd09b85'
      AND image.status = 'active'
      AND image.deleted_at IS NULL
      AND image.verification_status = 'agent_verified'
  ) THEN
    RAISE EXCEPTION 'Expected the verified Mattr image to remain active';
  END IF;
END;
$$;

UPDATE fountain.images
SET status = 'hidden',
    updated_at = now()
WHERE id = 22215
  AND entity_type = 'location'
  AND entity_id = 2369
  AND content_sha256 = '44244e2d9211cd28661d391994f966d808403a0df0f3eccc48ab7dd61ff8646e'
  AND status = 'active'
  AND deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fountain.images
    WHERE id = 22215
      AND entity_type = 'location'
      AND entity_id = 2369
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Mattr duplicate image remains active';
  END IF;

  IF (SELECT count(*)
      FROM fountain.images
      WHERE entity_type = 'location'
        AND entity_id = 2369
        AND status = 'active'
        AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Mattr Biowellness Club should retain exactly one active image';
  END IF;
END;
$$;

COMMIT;
