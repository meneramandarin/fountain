-- Raw image staging should keep source URLs, not local filesystem paths.
--
-- Local image files are transient processing artifacts. Vercel Blob is the
-- durable image-file store.

DO $$
BEGIN
    IF to_regclass('__RAW_SCHEMA__.source_images') IS NOT NULL THEN
        UPDATE __RAW_SCHEMA__.source_images
        SET local_path = NULL
        WHERE local_path IS NOT NULL
          AND local_path <> '';
    END IF;
END $$;
