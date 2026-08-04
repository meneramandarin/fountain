BEGIN;

ALTER TABLE fountain_raw.agent_discovery_candidates
  ADD COLUMN IF NOT EXISTS official_site_verification jsonb,
  ADD COLUMN IF NOT EXISTS address_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS treatment_verified boolean NOT NULL DEFAULT false;

ALTER TABLE fountain_raw.agent_discovery_candidates
  DROP CONSTRAINT IF EXISTS agent_discovery_candidates_official_verification_check,
  ADD CONSTRAINT agent_discovery_candidates_official_verification_check
    CHECK (
      official_site_verification IS NULL
      OR jsonb_typeof(official_site_verification) = 'object'
    );

COMMIT;
