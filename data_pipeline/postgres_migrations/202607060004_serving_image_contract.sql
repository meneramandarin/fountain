-- Serving schema image contract.
--
-- Image files live in Vercel Blob. The serving schema stores only the Blob URL
-- pointer needed to render each image.

DO $$
BEGIN
    IF to_regclass('__CANONICAL_SCHEMA__.images') IS NULL THEN
        RAISE EXCEPTION 'Missing %.images. Run the canonical import once before applying serving-schema migrations.', '__CANONICAL_SCHEMA__';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = '__CANONICAL_SCHEMA__'
          AND r.relname = 'images'
          AND c.conname = 'images_blob_backed'
    ) THEN
        ALTER TABLE __CANONICAL_SCHEMA__.images
            ADD CONSTRAINT images_blob_backed
            CHECK (
                blob_url IS NOT NULL
                AND blob_url <> ''
                AND (local_path IS NULL OR local_path = '')
            )
            NOT VALID;
    END IF;
END $$;

ALTER TABLE __CANONICAL_SCHEMA__.images
    VALIDATE CONSTRAINT images_blob_backed;

CREATE INDEX IF NOT EXISTS idx_images_blob_url
    ON __CANONICAL_SCHEMA__.images(blob_url);
