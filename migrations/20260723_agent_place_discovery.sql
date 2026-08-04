BEGIN;

CREATE OR REPLACE FUNCTION fountain_raw.jsonb_text_array_union(left_value jsonb, right_value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
  FROM (
    SELECT DISTINCT value
    FROM jsonb_array_elements_text(left_value || right_value) AS item(value)
  ) deduplicated
$$;

CREATE TABLE IF NOT EXISTS fountain_raw.agent_discovery_searches (
  id bigserial PRIMARY KEY,
  campaign text NOT NULL,
  run_id bigint NOT NULL REFERENCES fountain_ops.runs(id) ON DELETE RESTRICT,
  query_id integer NOT NULL,
  market text NOT NULL,
  treatment_group text NOT NULL,
  treatments jsonb NOT NULL,
  model text,
  response_content text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_count integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign, run_id, query_id),
  CHECK (btrim(campaign) <> ''),
  CHECK (btrim(market) <> ''),
  CHECK (btrim(treatment_group) <> ''),
  CHECK (jsonb_typeof(treatments) = 'array'),
  CHECK (jsonb_typeof(citations) = 'array'),
  CHECK (candidate_count >= 0)
);

CREATE INDEX IF NOT EXISTS agent_discovery_searches_campaign_idx
  ON fountain_raw.agent_discovery_searches(campaign, created_at DESC);

CREATE TABLE IF NOT EXISTS fountain_raw.agent_discovery_candidates (
  id bigserial PRIMARY KEY,
  campaign text NOT NULL,
  candidate_key text NOT NULL,
  first_run_id bigint NOT NULL REFERENCES fountain_ops.runs(id) ON DELETE RESTRICT,
  last_run_id bigint NOT NULL REFERENCES fountain_ops.runs(id) ON DELETE RESTRICT,
  name text NOT NULL,
  website text,
  address text,
  locality text,
  region text,
  postal_code text,
  country_code text NOT NULL DEFAULT 'US',
  phone text,
  email text,
  image_url text,
  chain_name text,
  chain_locations_url text,
  matched_treatments jsonb NOT NULL DEFAULT '[]'::jsonb,
  offerings jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  discovered_markets jsonb NOT NULL DEFAULT '[]'::jsonb,
  discovered_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  agent_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'discovered',
  match_result jsonb,
  promoted_location_id integer REFERENCES fountain.locations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign, candidate_key),
  CHECK (btrim(campaign) <> ''),
  CHECK (btrim(candidate_key) <> ''),
  CHECK (btrim(name) <> ''),
  CHECK (jsonb_typeof(matched_treatments) = 'array'),
  CHECK (jsonb_typeof(offerings) = 'array'),
  CHECK (jsonb_typeof(evidence_urls) = 'array'),
  CHECK (jsonb_typeof(discovered_markets) = 'array'),
  CHECK (jsonb_typeof(discovered_groups) = 'array'),
  CHECK (jsonb_typeof(agent_payload) = 'object'),
  CHECK (match_result IS NULL OR jsonb_typeof(match_result) = 'object'),
  CHECK (status IN (
    'discovered',
    'needs_review',
    'existing_match',
    'ready',
    'rejected',
    'promoted'
  ))
);

CREATE INDEX IF NOT EXISTS agent_discovery_candidates_campaign_status_idx
  ON fountain_raw.agent_discovery_candidates(campaign, status, id);

CREATE INDEX IF NOT EXISTS agent_discovery_candidates_promoted_idx
  ON fountain_raw.agent_discovery_candidates(promoted_location_id)
  WHERE promoted_location_id IS NOT NULL;

COMMIT;
