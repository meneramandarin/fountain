-- Correct the REDcharger image references to the exact Vercel Blob pathname.
-- The object was uploaded with a shortened hash suffix; the original active
-- rows contained the full hash and therefore pointed at a 404 URL.

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'upgrade_labs_redcharger_blob_path_fix_20260805'
);

UPDATE fountain.images image
SET blob_url = 'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/1081/redcharger-before-e8586f956acae73cb0fe.png',
    updated_at = now()
FROM fountain.locations location
WHERE image.entity_type = 'location'
  AND image.entity_id = location.id
  AND location.org_id = 1081
  AND image.content_sha256 = 'e8586f956acae73cb0fe14ef2cccc6c4587e7d0c043e21cdfca1f1ec065f46a6'
  AND image.status = 'active'
  AND image.deleted_at IS NULL;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM fountain.images image
    JOIN fountain.locations location ON location.id = image.entity_id
    WHERE image.entity_type = 'location'
      AND location.org_id = 1081
      AND image.content_sha256 = 'e8586f956acae73cb0fe14ef2cccc6c4587e7d0c043e21cdfca1f1ec065f46a6'
      AND image.blob_url = 'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/1081/redcharger-before-e8586f956acae73cb0fe.png'
      AND image.status = 'active'
      AND image.deleted_at IS NULL
  ) <> 10 THEN
    RAISE EXCEPTION 'Expected ten repaired REDcharger image references';
  END IF;
END;
$$;

COMMIT;
