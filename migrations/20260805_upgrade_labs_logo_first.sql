-- Make the supplied Upgrade Labs logo the primary gallery image across the
-- chain. Location detail galleries order active images by updated_at DESC.

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'upgrade_labs_logo_first_20260805'
);

UPDATE fountain.images image
SET updated_at = now()
FROM fountain.locations location
WHERE image.entity_type = 'location'
  AND image.entity_id = location.id
  AND location.org_id = 1081
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND image.blob_url = 'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/1081/upgrade-labs-logo-0ab5bf6cc0634c7968a9.png'
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
      AND image.blob_url = 'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/1081/upgrade-labs-logo-0ab5bf6cc0634c7968a9.png'
      AND image.status = 'active'
      AND image.deleted_at IS NULL
  ) <> 10 THEN
    RAISE EXCEPTION 'Expected the Upgrade Labs logo on ten active locations';
  END IF;
END;
$$;

COMMIT;
