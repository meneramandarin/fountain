-- Restore SYNC Life Baton Rouge coordinates after the postal-code correction in
-- the dedupe migration intentionally triggered the stale-coordinate guard.
-- Google Maps Geocoding API returned a rooftop match for the complete Suite 403
-- address on 2026-07-22.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'sync_life_baton_rouge_coordinate_repair_20260722'
);

CREATE TABLE IF NOT EXISTS fountain_raw.sync_life_baton_rouge_coordinate_backup_20260722 AS
SELECT *
FROM fountain.locations
WHERE id = 12322;

CREATE TABLE IF NOT EXISTS fountain_raw.sync_life_baton_rouge_coordinate_evidence_20260722 (
  location_id integer PRIMARY KEY,
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

INSERT INTO fountain_raw.sync_life_baton_rouge_coordinate_evidence_20260722 (
  location_id,
  latitude,
  longitude,
  provider,
  provider_place_id,
  match_precision,
  matched_address
)
VALUES (
  12322,
  30.3482128,
  -91.0240394,
  'google_maps_geocoding_api',
  'ChIJi_IpYIa6JoYR7oYLPEPQvPY',
  'rooftop',
  '18303 Perkins Rd E #403, Baton Rouge, LA 70810, USA'
)
ON CONFLICT (location_id) DO UPDATE
SET latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    provider = EXCLUDED.provider,
    provider_place_id = EXCLUDED.provider_place_id,
    match_precision = EXCLUDED.match_precision,
    matched_address = EXCLUDED.matched_address,
    recorded_at = now();

UPDATE fountain.locations l
SET latitude = evidence.latitude,
    longitude = evidence.longitude
FROM fountain_raw.sync_life_baton_rouge_coordinate_evidence_20260722 evidence
WHERE l.id = evidence.location_id
  AND l.slug = 'sync-life-baton-rouge'
  AND l.address = '18303 Perkins Rd E Suite 403, Baton Rouge, LA 70810'
  AND l.postal_code = '70810';

SELECT fountain.refresh_search_index_for_location(12322);
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 12322
      AND slug = 'sync-life-baton-rouge'
      AND latitude = 30.3482128
      AND longitude = -91.0240394
  ) THEN
    RAISE EXCEPTION 'SYNC Life Baton Rouge coordinate repair is incomplete';
  END IF;
END;
$$;

COMMIT;
