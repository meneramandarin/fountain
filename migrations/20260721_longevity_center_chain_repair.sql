-- Consolidate the Longevity Center chain into its two physical branches:
-- Warsaw, Poland and Zurich, Switzerland.
--
-- Contact details were supplied by the directory owner on 2026-07-21.
-- Coordinates were resolved with the Google Maps Geocoding API on 2026-07-21;
-- both results were rooftop matches for the complete street address.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'longevity_center_chain_repair_20260721'
);

CREATE TABLE IF NOT EXISTS fountain_raw.longevity_center_locations_backup_20260721 AS
SELECT *
FROM fountain.locations
WHERE id IN (1519, 2530, 2531, 13444);

CREATE TABLE IF NOT EXISTS fountain_raw.longevity_center_organizations_backup_20260721 AS
SELECT *
FROM fountain.organizations
WHERE id IN (1016, 1760, 8120);

CREATE TABLE IF NOT EXISTS fountain_raw.longevity_center_source_records_backup_20260721 AS
SELECT *
FROM fountain.source_records
WHERE (entity_type = 'location' AND entity_id IN (1519, 2530, 2531, 13444))
   OR (entity_type = 'organization' AND entity_id IN (11, 1016, 1760, 8120));

CREATE TABLE IF NOT EXISTS fountain_raw.longevity_center_reviews_backup_20260721 AS
SELECT *
FROM fountain.reviews
WHERE location_id IN (1519, 2530, 2531, 13444);

CREATE TABLE IF NOT EXISTS fountain_raw.longevity_center_place_matches_backup_20260721 AS
SELECT *
FROM fountain.external_place_matches
WHERE location_id IN (1519, 2530, 2531, 13444);

CREATE TABLE IF NOT EXISTS fountain_raw.longevity_center_coordinate_evidence_20260721 (
  branch_key text PRIMARY KEY,
  target_location_id integer NOT NULL UNIQUE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  provider text NOT NULL,
  provider_place_id text NOT NULL,
  match_precision text NOT NULL,
  matched_address text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude BETWEEN -90 AND 90),
  CHECK (longitude BETWEEN -180 AND 180)
);

INSERT INTO fountain_raw.longevity_center_coordinate_evidence_20260721 (
  branch_key, target_location_id, latitude, longitude, provider,
  provider_place_id, match_precision, matched_address
)
VALUES
  (
    'warsaw', 2530, 52.2030658, 21.0333090,
    'google_maps_geocoding_api', 'ChIJnzyPSyTNHkcRx8PTnv5OyUc', 'rooftop',
    'Belwederska 9, 00-761 Warszawa, Poland'
  ),
  (
    'zurich', 1519, 47.3649947, 8.5373165,
    'google_maps_geocoding_api', 'ChIJpRs5r_8JkEcRsLAvgtwbzoI', 'rooftop',
    'Beethovenstrasse 1, 8002 Zürich, Switzerland'
  )
ON CONFLICT (branch_key) DO UPDATE
SET target_location_id = EXCLUDED.target_location_id,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    provider = EXCLUDED.provider,
    provider_place_id = EXCLUDED.provider_place_id,
    match_precision = EXCLUDED.match_precision,
    matched_address = EXCLUDED.matched_address,
    recorded_at = now();

-- Preserve every incoming public URL while consolidating the duplicate Zurich rows.
INSERT INTO fountain.location_slug_aliases(slug, location_id, reason)
VALUES
  ('longevity-center-ag-z-rich', 1519, 'longevity_center_chain_repair_20260721'),
  ('longevity-center-switzerland-longevity-center-poland', 1519, 'longevity_center_chain_repair_20260721'),
  ('longevity-center-poland', 2530, 'longevity_center_chain_repair_20260721')
ON CONFLICT (slug) DO UPDATE
SET location_id = EXCLUDED.location_id,
    reason = EXCLUDED.reason;

-- The legacy Zurich import contains the same four Google reviews already attached
-- to the retained Zurich row. Remove only exact duplicates before merging.
DELETE FROM fountain.reviews duplicate_review
WHERE duplicate_review.location_id = 13444
  AND EXISTS (
    SELECT 1
    FROM fountain.reviews retained_review
    WHERE retained_review.location_id = 1519
      AND retained_review.provider IS NOT DISTINCT FROM duplicate_review.provider
      AND retained_review.provider_place_id IS NOT DISTINCT FROM duplicate_review.provider_place_id
      AND retained_review.author IS NOT DISTINCT FROM duplicate_review.author
      AND retained_review.rating IS NOT DISTINCT FROM duplicate_review.rating
      AND retained_review.review_date IS NOT DISTINCT FROM duplicate_review.review_date
      AND retained_review.text IS NOT DISTINCT FROM duplicate_review.text
  );

SELECT fountain.merge_locations(
  1519,
  2531,
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'Consolidate duplicate Longevity Center Zurich import'
);

SELECT fountain.merge_locations(
  1519,
  13444,
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'Consolidate duplicate Longevity Center Zurich listing'
);

-- Correct organization-level provenance that was previously attached to Biograph
-- or to the duplicate Switzerland organization.
UPDATE fountain.source_records sr
SET entity_id = 1016
FROM fountain.sources s
WHERE sr.source_id = s.id
  AND sr.entity_type = 'organization'
  AND s.slug = 'longevity_technology_clinics'
  AND sr.source_listing_id IN (95, 96);

-- Both surviving physical branches belong to one chain organization.
UPDATE fountain.locations
SET org_id = 1016
WHERE id IN (1519, 2530);

DELETE FROM fountain.organizations o
WHERE o.id IN (1760, 8120)
  AND NOT EXISTS (SELECT 1 FROM fountain.locations l WHERE l.org_id = o.id)
  AND NOT EXISTS (
    SELECT 1 FROM fountain.source_records sr
    WHERE sr.entity_type = 'organization' AND sr.entity_id = o.id
  )
  AND NOT EXISTS (SELECT 1 FROM fountain.affiliations a WHERE a.org_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM fountain.clinic_claims cc WHERE cc.org_id = o.id);

UPDATE fountain.organizations
SET canonical_name = 'Longevity Center',
    name_normalized = 'longevity center',
    website_domain = 'longevity-center.eu',
    dedup_key = 'longevity-center.eu',
    data_origin = 'manual'
WHERE id = 1016;

-- The previous Warsaw match pointed to the Zurich business. Remove it so Warsaw
-- cannot inherit Zurich reviews or metadata during refreshes.
DELETE FROM fountain.external_place_matches
WHERE location_id = 2530
  AND provider_place_id = 'ChIJedvuBNULkEcR2PExU-9vmZ0';

UPDATE fountain.locations
SET name = 'Longevity Center Warsaw',
    slug = 'longevity-center-warsaw',
    address = 'Belwederska 9, 00-761 Warsaw, Poland',
    locality = 'Warsaw',
    region = NULL,
    postal_code = '00-761',
    country_code = 'PL',
    country_name = 'Poland',
    latitude = 52.2030658,
    longitude = 21.0333090,
    email = 'warsaw@longevity-center.eu',
    phone = '+48 22 400 22 77; +48 884 084 040',
    website = 'https://longevity-center.eu/',
    status = 'active',
    deleted_at = NULL,
    data_origin = 'manual',
    is_virtual = false
WHERE id = 2530;

UPDATE fountain.locations
SET name = 'Longevity Center Zürich',
    slug = 'longevity-center-zurich',
    address = 'Beethovenstrasse 1 (Rotes Schloss), 8002 Zürich, Switzerland',
    locality = 'Zürich',
    region = NULL,
    postal_code = '8002',
    country_code = 'CH',
    country_name = 'Switzerland',
    latitude = 47.3649947,
    longitude = 8.5373165,
    email = 'zurich@longevitycenter.ch',
    phone = '+41 43 243 0459',
    website = 'https://www.longevitycenter.ch/',
    status = 'active',
    deleted_at = NULL,
    data_origin = 'manual',
    is_virtual = false
WHERE id = 1519;

-- The address-change guard deliberately clears a coordinate pair when an address
-- changes but its numbers do not. Zurich already had the correct rooftop numbers,
-- so reapply both verified pairs after all address fields have settled.
UPDATE fountain.locations l
SET latitude = e.latitude,
    longitude = e.longitude
FROM fountain_raw.longevity_center_coordinate_evidence_20260721 e
WHERE l.id = e.target_location_id;

SELECT fountain.refresh_search_index_for_location(1519);
SELECT fountain.refresh_search_index_for_location(2530);
SELECT fountain.refresh_city_index();

DO $$
DECLARE
  resolved_count integer;
BEGIN
  SELECT count(*) INTO resolved_count
  FROM fountain.locations
  WHERE org_id = 1016
    AND status = 'active'
    AND deleted_at IS NULL;

  IF resolved_count <> 2 THEN
    RAISE EXCEPTION 'Longevity Center chain must have exactly two active listings; found %', resolved_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id IN (2531, 13444)
  ) THEN
    RAISE EXCEPTION 'Duplicate Longevity Center Zurich rows still exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fountain.locations
    WHERE id = 2530
      AND country_code = 'PL'
      AND locality = 'Warsaw'
      AND latitude = 52.2030658
      AND longitude = 21.0333090
  ) OR NOT EXISTS (
    SELECT 1 FROM fountain.locations
    WHERE id = 1519
      AND country_code = 'CH'
      AND locality = 'Zürich'
      AND latitude = 47.3649947
      AND longitude = 8.5373165
  ) THEN
    RAISE EXCEPTION 'Longevity Center branch address or coordinate repair is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM fountain.external_place_matches
    WHERE location_id = 2530
      AND provider_place_id = 'ChIJedvuBNULkEcR2PExU-9vmZ0'
  ) THEN
    RAISE EXCEPTION 'Warsaw still points to the Zurich Google place';
  END IF;
END;
$$;

COMMIT;
