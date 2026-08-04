-- Restrict Biograph to its two physical branches (New York and the Bay Area),
-- merge the inferior duplicate Bay Area row, and remove unrelated clinics from
-- the Biograph organization.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'biograph_chain_repair_20260802'
);

CREATE TABLE IF NOT EXISTS fountain_raw.biograph_chain_locations_backup_20260802 AS
SELECT *
FROM fountain.locations
WHERE id IN (1, 2393, 2552, 2553, 2554, 2564);

CREATE TABLE IF NOT EXISTS fountain_raw.biograph_chain_source_records_backup_20260802 AS
SELECT *
FROM fountain.source_records
WHERE (entity_type = 'location' AND entity_id IN (2393, 2552, 2553, 2554, 2564))
   OR (entity_type = 'organization' AND entity_id IN (11, 936, 8119));

CREATE TABLE IF NOT EXISTS fountain_raw.biograph_chain_offerings_backup_20260802 AS
SELECT *
FROM fountain.offerings
WHERE location_id IN (2393, 2564);

CREATE TABLE IF NOT EXISTS fountain_raw.biograph_chain_reviews_backup_20260802 AS
SELECT *
FROM fountain.reviews
WHERE location_id IN (2393, 2564);

CREATE TABLE IF NOT EXISTS fountain_raw.biograph_chain_images_backup_20260802 AS
SELECT *
FROM fountain.images
WHERE entity_type = 'location'
  AND entity_id IN (2393, 2564);

CREATE TABLE IF NOT EXISTS fountain_raw.biograph_chain_place_matches_backup_20260802 AS
SELECT *
FROM fountain.external_place_matches
WHERE location_id IN (2393, 2564);

DO $$
BEGIN
  IF (SELECT count(*)
      FROM fountain_raw.biograph_chain_locations_backup_20260802) <> 6 THEN
    RAISE EXCEPTION 'Expected six Biograph repair location backups';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 2393
      AND slug = 'biograph'
      AND org_id = 11
  ) OR NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 2564
      AND slug = 'biograph-san-francisco-bay-area'
      AND org_id = 11
  ) THEN
    RAISE EXCEPTION 'Expected Biograph Bay Area duplicate pair was not found';
  END IF;
END;
$$;

-- These three clinics came from adjacent source rows and were accidentally
-- assigned to Biograph. Link known chains correctly and leave Osler standalone.
UPDATE fountain.locations
SET org_id = NULL,
    updated_at = now()
WHERE id = 2552
  AND slug = 'osler-health-singapore-city'
  AND org_id = 11;

UPDATE fountain.locations
SET org_id = 936,
    updated_at = now()
WHERE id = 2553
  AND slug = 'healthy-longevity-clinic-prague-boca-raton'
  AND org_id = 11;

UPDATE fountain.locations
SET org_id = 8119,
    updated_at = now()
WHERE id = 2554
  AND slug = 'years-berlin'
  AND org_id = 11;

-- Correct the organization-level provenance created by the same bad grouping.
UPDATE fountain.source_records sr
SET entity_id = 936
FROM fountain.sources s
WHERE sr.source_id = s.id
  AND sr.entity_type = 'organization'
  AND sr.entity_id = 11
  AND s.slug = 'longevity_technology_clinics'
  AND sr.source_listing_id = 123;

UPDATE fountain.source_records sr
SET entity_id = 8119
FROM fountain.sources s
WHERE sr.source_id = s.id
  AND sr.entity_type = 'organization'
  AND sr.entity_id = 11
  AND s.slug = 'longevity_technology_clinics'
  AND sr.source_listing_id = 124;

-- Osler has no organization row to attach to. Keep its location provenance and
-- remove only the false organization-level association with Biograph.
DELETE FROM fountain.source_records sr
USING fountain.sources s
WHERE sr.source_id = s.id
  AND sr.entity_type = 'organization'
  AND sr.entity_id = 11
  AND s.slug = 'longevity_technology_clinics'
  AND sr.source_listing_id = 122;

-- Keep the short public URL useful after consolidating the duplicate Bay Area row.
INSERT INTO fountain.location_slug_aliases(slug, location_id, reason)
VALUES ('biograph', 2564, 'biograph_chain_repair_20260802')
ON CONFLICT (slug) DO UPDATE
SET location_id = EXCLUDED.location_id,
    reason = EXCLUDED.reason;

-- Both rows contain the same five Google reviews. Retain the copies attached to
-- the richer, verified Bay Area listing.
DELETE FROM fountain.reviews duplicate_review
WHERE duplicate_review.location_id = 2393
  AND EXISTS (
    SELECT 1
    FROM fountain.reviews retained_review
    WHERE retained_review.location_id = 2564
      AND retained_review.provider IS NOT DISTINCT FROM duplicate_review.provider
      AND retained_review.provider_place_id IS NOT DISTINCT FROM duplicate_review.provider_place_id
      AND retained_review.author IS NOT DISTINCT FROM duplicate_review.author
      AND retained_review.rating IS NOT DISTINCT FROM duplicate_review.rating
      AND retained_review.review_date IS NOT DISTINCT FROM duplicate_review.review_date
      AND retained_review.text IS NOT DISTINCT FROM duplicate_review.text
  );

-- Discard the lower-confidence legacy match for the same Google place. The
-- retained row is details-verified and has the newer rating/review count.
DELETE FROM fountain.external_place_matches
WHERE location_id = 2393
  AND provider_place_id = 'ChIJEXaP816fj4ARGU6Mp8cB9A4';

SELECT fountain.merge_locations(
  2564,
  2393,
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'Merge duplicate Biograph Bay Area listing and retain verified San Mateo branch'
);

SELECT fountain.refresh_search_index_for_location(id)
FROM fountain.locations
WHERE id IN (1, 2552, 2553, 2554, 2564);

SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF (SELECT array_agg(id ORDER BY id)
      FROM fountain.locations
      WHERE org_id = 11
        AND status = 'active'
        AND deleted_at IS NULL) IS DISTINCT FROM ARRAY[1, 2564] THEN
    RAISE EXCEPTION 'Biograph must have exactly the New York and Bay Area active locations';
  END IF;

  IF EXISTS (SELECT 1 FROM fountain.locations WHERE id = 2393) THEN
    RAISE EXCEPTION 'Duplicate Biograph location 2393 still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.location_slug_aliases
    WHERE slug = 'biograph'
      AND location_id = 2564
  ) THEN
    RAISE EXCEPTION 'The /biograph URL does not redirect to the Bay Area listing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 2564
      AND slug = 'biograph-san-francisco-bay-area'
      AND name = 'Biograph San Francisco Bay Area'
      AND address = '2850 S Delaware St, Suite 100, San Mateo, CA 94403'
      AND locality = 'San Mateo'
      AND region = 'CA'
      AND postal_code = '94403'
      AND org_id = 11
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Retained Biograph Bay Area listing is incomplete';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM fountain.locations WHERE id = 2552 AND org_id IS NULL)
     OR NOT EXISTS (SELECT 1 FROM fountain.locations WHERE id = 2553 AND org_id = 936)
     OR NOT EXISTS (SELECT 1 FROM fountain.locations WHERE id = 2554 AND org_id = 8119) THEN
    RAISE EXCEPTION 'Unrelated clinics were not removed from Biograph';
  END IF;

  IF (SELECT count(*) FROM fountain.reviews WHERE location_id = 2564) <> 5 THEN
    RAISE EXCEPTION 'Expected five deduplicated reviews on Biograph Bay Area';
  END IF;

  IF (SELECT count(*)
      FROM fountain.external_place_matches
      WHERE location_id = 2564
        AND provider_place_id = 'ChIJEXaP816fj4ARGU6Mp8cB9A4'
        AND match_status = 'details_verified') <> 1 THEN
    RAISE EXCEPTION 'Expected one verified Google place match on Biograph Bay Area';
  END IF;
END;
$$;

COMMIT;
