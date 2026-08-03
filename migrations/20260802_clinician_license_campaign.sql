-- Resumable U.S. clinician-discovery and license-verification campaign state.

BEGIN;

ALTER TABLE fountain_ops.task_queue
  DROP CONSTRAINT task_queue_task_type_check,
  ADD CONSTRAINT task_queue_task_type_check
    CHECK (task_type IN (
      'legitimacy_check',
      'contact_fill',
      'geocode',
      'image_harvest',
      'image_classify',
      'menu_extract',
      'reviews_fetch',
      'clinician_license_verify',
      'dedup_scan',
      'freshness_check',
      'noop',
      'llm_smoke'
    ));

CREATE TABLE IF NOT EXISTS fountain_raw.location_clinician_verification_attempts (
  location_id integer NOT NULL REFERENCES fountain.locations(id) ON DELETE CASCADE,
  prompt_version text NOT NULL,
  campaign text NOT NULL,
  jurisdiction_code text,
  outcome text NOT NULL,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  external_call_id bigint REFERENCES fountain_ops.external_calls(id) ON DELETE SET NULL,
  cost_estimate_usd numeric(18, 10),
  run_id bigint NOT NULL REFERENCES fountain_ops.runs(id) ON DELETE RESTRICT,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, prompt_version),
  CONSTRAINT location_clinician_attempts_outcome_check
    CHECK (outcome IN (
      'candidates_found',
      'no_physician_found',
      'no_website',
      'invalid_jurisdiction',
      'crawl_unavailable',
      'ambiguous_affiliation',
      'board_record_not_found',
      'board_source_unsupported',
      'needs_review',
      'verified'
    )),
  CONSTRAINT location_clinician_attempts_candidates_check
    CHECK (jsonb_typeof(candidates) = 'array'),
  CONSTRAINT location_clinician_attempts_sources_check
    CHECK (jsonb_typeof(source_urls) = 'array'),
  CONSTRAINT location_clinician_attempts_cost_check
    CHECK (cost_estimate_usd IS NULL OR cost_estimate_usd >= 0)
);

CREATE INDEX IF NOT EXISTS location_clinician_attempts_outcome_idx
  ON fountain_raw.location_clinician_verification_attempts
  (campaign, outcome, jurisdiction_code, location_id);

COMMIT;
