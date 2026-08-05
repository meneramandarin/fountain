-- Correct the Early Medical logo reference to the exact Vercel Blob pathname.

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'early_medical_logo_blob_path_fix_20260805'
);

UPDATE fountain.images
SET blob_url = 'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/location/13422/early-medical-logo-reverse-d7049e25f1843fccf302.svg',
    updated_at = now()
WHERE entity_type = 'location'
  AND entity_id = 13422
  AND content_sha256 = 'd7049e25f1843fccf3021b7c76d641de700262e4b4b0485af3a838f62e5a9416'
  AND image_kind = 'logo'
  AND status = 'active'
  AND deleted_at IS NULL;

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
    RAISE EXCEPTION 'Early Medical logo path was not repaired';
  END IF;
END;
$$;

COMMIT;
