BEGIN;

ALTER TABLE fountain_raw.agent_discovery_candidates
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS geocode_provider text,
  ADD COLUMN IF NOT EXISTS geocode_result jsonb;

ALTER TABLE fountain_raw.agent_discovery_candidates
  DROP CONSTRAINT IF EXISTS agent_discovery_candidates_latitude_check,
  ADD CONSTRAINT agent_discovery_candidates_latitude_check
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  DROP CONSTRAINT IF EXISTS agent_discovery_candidates_longitude_check,
  ADD CONSTRAINT agent_discovery_candidates_longitude_check
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  DROP CONSTRAINT IF EXISTS agent_discovery_candidates_coordinates_pair_check,
  ADD CONSTRAINT agent_discovery_candidates_coordinates_pair_check
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
  DROP CONSTRAINT IF EXISTS agent_discovery_candidates_geocode_result_check,
  ADD CONSTRAINT agent_discovery_candidates_geocode_result_check
    CHECK (geocode_result IS NULL OR jsonb_typeof(geocode_result) = 'object');

COMMIT;
