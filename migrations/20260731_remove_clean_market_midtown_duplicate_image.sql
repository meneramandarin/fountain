-- Hide the lower-resolution duplicate image on the Clean Market Midtown East
-- listing while preserving the image row and blob for reversibility.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'remove_clean_market_midtown_duplicate_image_20260731'
);

CREATE TABLE IF NOT EXISTS fountain_raw.clean_market_midtown_duplicate_image_backup_20260731 AS
SELECT image.*
FROM fountain.images image
JOIN fountain.locations location
  ON location.id = image.entity_id
WHERE image.id = 40980
  AND image.entity_type = 'location'
  AND image.entity_id = 398
  AND location.slug = 'clean-market-midtown-east-new-york'
  AND image.content_sha256 = '527048664d2ce4485eb7420c92466536cdd769265725e228e5a716f9e8164b47';

DO $$
BEGIN
  IF (SELECT count(*)
      FROM fountain_raw.clean_market_midtown_duplicate_image_backup_20260731) <> 1 THEN
    RAISE EXCEPTION 'Expected one Clean Market Midtown East duplicate image backup';
  END IF;
END;
$$;

UPDATE fountain.images
SET status = 'hidden',
    updated_at = now()
WHERE id = 40980
  AND entity_type = 'location'
  AND entity_id = 398
  AND content_sha256 = '527048664d2ce4485eb7420c92466536cdd769265725e228e5a716f9e8164b47';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fountain.images
    WHERE id = 40980
      AND entity_type = 'location'
      AND entity_id = 398
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Clean Market Midtown East duplicate image remains active';
  END IF;

  IF (SELECT count(*)
      FROM fountain.images
      WHERE entity_type = 'location'
        AND entity_id = 398
        AND status = 'active'
        AND deleted_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Clean Market Midtown East should retain exactly one active image';
  END IF;
END;
$$;

COMMIT;
