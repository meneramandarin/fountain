-- Consolidate the duplicate SYNC Life / Sync Wellness Baton Rouge listings.
-- Keep the richer SYNC Life record (12322), preserve unique offerings and source
-- provenance, discard duplicate reviews and the inferior duplicate image, and
-- delete the duplicate location (12323). This is a genuine duplicate merge, not
-- a blacklist or suppression action.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'sync_life_baton_rouge_dedupe_20260722'
);

CREATE TABLE IF NOT EXISTS fountain_raw.sync_life_baton_rouge_locations_backup_20260722 AS
SELECT *
FROM fountain.locations
WHERE id IN (12322, 12323);

CREATE TABLE IF NOT EXISTS fountain_raw.sync_life_baton_rouge_organizations_backup_20260722 AS
SELECT *
FROM fountain.organizations
WHERE id IN (5833, 5834);

CREATE TABLE IF NOT EXISTS fountain_raw.sync_life_baton_rouge_offerings_backup_20260722 AS
SELECT *
FROM fountain.offerings
WHERE location_id IN (12322, 12323);

CREATE TABLE IF NOT EXISTS fountain_raw.sync_life_baton_rouge_images_backup_20260722 AS
SELECT *
FROM fountain.images
WHERE entity_type = 'location'
  AND entity_id IN (12322, 12323);

CREATE TABLE IF NOT EXISTS fountain_raw.sync_life_baton_rouge_reviews_backup_20260722 AS
SELECT *
FROM fountain.reviews
WHERE location_id IN (12322, 12323);

CREATE TABLE IF NOT EXISTS fountain_raw.sync_life_baton_rouge_place_matches_backup_20260722 AS
SELECT *
FROM fountain.external_place_matches
WHERE location_id IN (12322, 12323);

CREATE TABLE IF NOT EXISTS fountain_raw.sync_life_baton_rouge_source_records_backup_20260722 AS
SELECT *
FROM fountain.source_records
WHERE (entity_type = 'location' AND entity_id IN (12322, 12323))
   OR (entity_type = 'organization' AND entity_id IN (5833, 5834));

-- Keep the retired public URL useful without retaining a second location row.
INSERT INTO fountain.location_slug_aliases(slug, location_id, reason)
VALUES (
  'sync-wellness-baton-rouge',
  12322,
  'sync_life_baton_rouge_dedupe_20260722'
)
ON CONFLICT (slug) DO UPDATE
SET location_id = EXCLUDED.location_id,
    reason = EXCLUDED.reason;

-- Both rows carry the same five Google reviews. Keep the copies belonging to the
-- richer survivor and remove exact duplicates before calling merge_locations.
DELETE FROM fountain.reviews duplicate_review
WHERE duplicate_review.location_id = 12323
  AND EXISTS (
    SELECT 1
    FROM fountain.reviews retained_review
    WHERE retained_review.location_id = 12322
      AND retained_review.provider IS NOT DISTINCT FROM duplicate_review.provider
      AND retained_review.provider_place_id IS NOT DISTINCT FROM duplicate_review.provider_place_id
      AND retained_review.author IS NOT DISTINCT FROM duplicate_review.author
      AND retained_review.rating IS NOT DISTINCT FROM duplicate_review.rating
      AND retained_review.review_date IS NOT DISTINCT FROM duplicate_review.review_date
      AND retained_review.text IS NOT DISTINCT FROM duplicate_review.text
  );

-- Do not syndicate the inferior duplicate photo onto the surviving listing. The
-- Blob URL remains recorded in the backup table for recoverability.
DELETE FROM fountain.images
WHERE entity_type = 'location'
  AND entity_id = 12323;

-- The Google review-enrichment provenance is identical on both rows. Preserve one
-- copy while retaining the distinct Stem Cell Authority listing provenance.
DELETE FROM fountain.source_records duplicate_source
WHERE duplicate_source.entity_type = 'location'
  AND duplicate_source.entity_id = 12323
  AND EXISTS (
    SELECT 1
    FROM fountain.source_records retained_source
    WHERE retained_source.entity_type = 'location'
      AND retained_source.entity_id = 12322
      AND retained_source.source_id = duplicate_source.source_id
      AND retained_source.source_listing_id IS NOT DISTINCT FROM duplicate_source.source_listing_id
      AND retained_source.source_url IS NOT DISTINCT FROM duplicate_source.source_url
  );

-- Consolidate organization provenance before removing the duplicate organization.
UPDATE fountain.source_records
SET entity_id = 5833
WHERE entity_type = 'organization'
  AND entity_id = 5834;

SELECT fountain.merge_locations(
  12322,
  12323,
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'Reviewer-confirmed duplicate: Sync Wellness Baton Rouge is SYNC Life Baton Rouge'
);

DELETE FROM fountain.organizations duplicate_org
WHERE duplicate_org.id = 5834
  AND NOT EXISTS (SELECT 1 FROM fountain.locations l WHERE l.org_id = duplicate_org.id)
  AND NOT EXISTS (
    SELECT 1 FROM fountain.source_records sr
    WHERE sr.entity_type = 'organization' AND sr.entity_id = duplicate_org.id
  )
  AND NOT EXISTS (SELECT 1 FROM fountain.affiliations a WHERE a.org_id = duplicate_org.id)
  AND NOT EXISTS (SELECT 1 FROM fountain.clinic_claims cc WHERE cc.org_id = duplicate_org.id);

-- The imported row accidentally stored the street number as the postal code.
UPDATE fountain.locations
SET postal_code = '70810',
    data_origin = 'manual'
WHERE id = 12322;

SELECT fountain.refresh_search_index_for_location(12322);
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fountain.locations WHERE id = 12323) THEN
    RAISE EXCEPTION 'Duplicate Sync Wellness location 12323 still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 12322
      AND slug = 'sync-life-baton-rouge'
      AND status = 'active'
      AND deleted_at IS NULL
      AND postal_code = '70810'
  ) THEN
    RAISE EXCEPTION 'SYNC Life Baton Rouge survivor is missing or incomplete';
  END IF;

  IF (SELECT count(*) FROM fountain.offerings WHERE location_id = 12322) <> 30 THEN
    RAISE EXCEPTION 'Expected 30 distinct syndicated offerings on SYNC Life Baton Rouge';
  END IF;

  IF (SELECT count(*) FROM fountain.reviews WHERE location_id = 12322) <> 5 THEN
    RAISE EXCEPTION 'Expected five deduplicated reviews on SYNC Life Baton Rouge';
  END IF;

  IF (SELECT count(*) FROM fountain.images
      WHERE entity_type = 'location'
        AND entity_id = 12322
        AND status = 'active'
        AND deleted_at IS NULL) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM fountain.images
       WHERE entity_type = 'location'
         AND entity_id = 12322
         AND content_sha256 = '327815f1eb7107bfd4d67dceee034d0390dd57a2a5e25e34979ee10ff376765b'
         AND status = 'active'
         AND deleted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'SYNC Life Baton Rouge must retain only its preferred image';
  END IF;

  IF (SELECT count(*) FROM fountain.external_place_matches WHERE location_id = 12322) <> 1 THEN
    RAISE EXCEPTION 'Expected one deduplicated Google place match on SYNC Life Baton Rouge';
  END IF;

  IF EXISTS (SELECT 1 FROM fountain.organizations WHERE id = 5834) THEN
    RAISE EXCEPTION 'Duplicate Sync Wellness organization 5834 still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fountain.location_slug_aliases
    WHERE slug = 'sync-wellness-baton-rouge'
      AND location_id = 12322
  ) THEN
    RAISE EXCEPTION 'Retired Sync Wellness URL is not aliased to SYNC Life';
  END IF;
END;
$$;

COMMIT;
