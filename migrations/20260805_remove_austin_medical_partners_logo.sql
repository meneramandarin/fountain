-- Remove the retired Austin Medical Partners logo image after its Vercel Blob
-- object was deleted. Keep the database row as hidden audit history so the
-- listing cannot reference the removed object.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'remove_austin_medical_partners_logo_20260805'
);

CREATE TABLE IF NOT EXISTS fountain_raw.austin_medical_partners_removed_logo_backup_20260805 AS
SELECT *
FROM fountain.images
WHERE id = 34703
  AND entity_type = 'location'
  AND entity_id = 2212
  AND blob_url = 'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/remote/81/811588d887a0b060427b639add2401e32e5dec633f105e1d5000df1d8d2cf320.jpg';

UPDATE fountain.images
SET status = 'hidden',
    deleted_at = COALESCE(deleted_at, now()),
    updated_at = now()
WHERE id = 34703
  AND entity_type = 'location'
  AND entity_id = 2212
  AND blob_url = 'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/remote/81/811588d887a0b060427b639add2401e32e5dec633f105e1d5000df1d8d2cf320.jpg';

SELECT fountain.refresh_search_index_for_location(2212);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fountain.images
    WHERE id = 34703
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Removed Austin Medical Partners logo is still active';
  END IF;
END;
$$;

COMMIT;
