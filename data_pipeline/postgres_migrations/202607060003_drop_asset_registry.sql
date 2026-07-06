-- Remove the redundant Blob asset registry.
--
-- Image bytes live in Vercel Blob. Neon keeps only serving/source URL strings
-- needed to associate a Blob object with an entity.

DROP SCHEMA IF EXISTS __ASSET_SCHEMA__ CASCADE;
