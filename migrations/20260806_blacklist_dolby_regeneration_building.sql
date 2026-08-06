-- Hide the non-clinic Ray and Dagmar Dolby Regeneration Medicine Building
-- listing and suppress its source records so it cannot be imported again.
-- Preserve the location and provenance rows for reversibility and auditability.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'blacklist_dolby_regeneration_building_20260806'
);

CREATE TABLE IF NOT EXISTS fountain_raw.dolby_regeneration_building_backup_20260806 AS
SELECT *
FROM fountain.locations
WHERE id = 11328
  AND slug = 'ray-and-dagmar-dolby-regeneration-medicine-building-san-francisco';

CREATE TABLE IF NOT EXISTS fountain_raw.dolby_regeneration_building_sources_backup_20260806 AS
SELECT
  source_record.*,
  source.slug AS source_slug
FROM fountain.source_records source_record
JOIN fountain.sources source ON source.id = source_record.source_id
WHERE source_record.entity_type = 'location'
  AND source_record.entity_id = 11328;

DO $$
BEGIN
  IF (SELECT count(*)
      FROM fountain_raw.dolby_regeneration_building_backup_20260806) <> 1 THEN
    RAISE EXCEPTION 'Expected one Dolby Regeneration Medicine Building location backup';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 11328
      AND (
        slug <> 'ray-and-dagmar-dolby-regeneration-medicine-building-san-francisco'
        OR deleted_at IS NOT NULL
        OR owner_account_id IS NOT NULL
        OR coalesce(verification_status, '') IN ('owner_verified', 'claimed')
      )
  ) THEN
    RAISE EXCEPTION 'Dolby Regeneration Medicine Building location is not safe to suppress';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.clinic_claims claim
    JOIN fountain.locations location
      ON claim.location_id = location.id OR claim.org_id = location.org_id
    WHERE location.id = 11328
      AND claim.status IN ('pending', 'approved', 'verified', 'active')
  ) THEN
    RAISE EXCEPTION 'Dolby Regeneration Medicine Building has an active clinic claim';
  END IF;

  IF (SELECT count(*)
      FROM fountain_raw.dolby_regeneration_building_sources_backup_20260806) <> 2 THEN
    RAISE EXCEPTION 'Expected two source records for Dolby Regeneration Medicine Building';
  END IF;
END;
$$;

INSERT INTO fountain_raw.suppressed_source_listings (
  source_slug,
  source_listing_id,
  reason,
  suppressed_by
)
SELECT
  source.slug,
  source_record.source_listing_id,
  'manual_non_clinic_building_listing',
  'blacklist_dolby_regeneration_building_20260806'
FROM fountain.source_records source_record
JOIN fountain.sources source ON source.id = source_record.source_id
WHERE source_record.entity_type = 'location'
  AND source_record.entity_id = 11328
ON CONFLICT (source_slug, source_listing_id) DO UPDATE
SET reason = EXCLUDED.reason,
    suppressed_by = EXCLUDED.suppressed_by,
    suppressed_at = now();

UPDATE fountain.locations
SET status = 'hidden',
    data_origin = 'manual',
    updated_at = now()
WHERE id = 11328
  AND slug = 'ray-and-dagmar-dolby-regeneration-medicine-building-san-francisco'
  AND status = 'active'
  AND deleted_at IS NULL
  AND owner_account_id IS NULL;

SELECT fountain.refresh_search_index_for_location(11328);
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 11328
      AND slug = 'ray-and-dagmar-dolby-regeneration-medicine-building-san-francisco'
      AND status = 'hidden'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Dolby Regeneration Medicine Building was not hidden';
  END IF;

  IF (SELECT count(*)
      FROM fountain_raw.suppressed_source_listings suppression
      JOIN fountain_raw.dolby_regeneration_building_sources_backup_20260806 source_record
        ON source_record.source_slug = suppression.source_slug
       AND source_record.source_listing_id = suppression.source_listing_id
      WHERE suppression.suppressed_by = 'blacklist_dolby_regeneration_building_20260806') <> 2 THEN
    RAISE EXCEPTION 'Dolby Regeneration Medicine Building source suppression is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.search_index
    WHERE entity_type = 'location'
      AND entity_id = 11328
  ) THEN
    RAISE EXCEPTION 'Dolby Regeneration Medicine Building remains in the search index';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 4490
      AND slug = 'rbh-medical-center-hopewell'
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The real RBH Medical Center location was unexpectedly changed';
  END IF;
END;
$$;

COMMIT;
