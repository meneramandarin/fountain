-- Durable review state and audit history for treatment alias mappings.
-- No taxonomy, alias, or offering rows are deleted by this migration.

BEGIN;

ALTER TABLE fountain_raw.treatment_aliases
  ADD COLUMN IF NOT EXISTS mapping_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS mapping_confidence double precision,
  ADD COLUMN IF NOT EXISTS mapping_review_model text,
  ADD COLUMN IF NOT EXISTS mapping_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS mapping_review_rationale text;

-- Existing rows were backfilled as active by ADD COLUMN. New aliases must be
-- reviewed before the menu matcher is allowed to consume them.
ALTER TABLE fountain_raw.treatment_aliases
  ALTER COLUMN mapping_status SET DEFAULT 'needs_review';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'treatment_aliases_mapping_status_valid'
      AND conrelid = 'fountain_raw.treatment_aliases'::regclass
  ) THEN
    ALTER TABLE fountain_raw.treatment_aliases
      ADD CONSTRAINT treatment_aliases_mapping_status_valid
      CHECK (mapping_status IN ('active', 'rejected', 'needs_review'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'treatment_aliases_mapping_confidence_valid'
      AND conrelid = 'fountain_raw.treatment_aliases'::regclass
  ) THEN
    ALTER TABLE fountain_raw.treatment_aliases
      ADD CONSTRAINT treatment_aliases_mapping_confidence_valid
      CHECK (mapping_confidence IS NULL OR (mapping_confidence >= 0 AND mapping_confidence <= 1));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS treatment_aliases_active_normalized_idx
  ON fountain_raw.treatment_aliases (alias_normalized, treatment_id)
  WHERE mapping_status = 'active';

CREATE TABLE IF NOT EXISTS fountain_raw.treatment_mapping_reviews (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES fountain_ops.runs(id),
  term_normalized text NOT NULL,
  display_term text NOT NULL,
  old_treatment_id integer NOT NULL REFERENCES fountain.treatments(id),
  proposed_treatment_id integer REFERENCES fountain.treatments(id),
  first_pass jsonb NOT NULL,
  second_pass jsonb,
  final_decision text NOT NULL,
  consensus_confidence double precision,
  model text NOT NULL,
  prompt_version text NOT NULL,
  review_status text NOT NULL,
  applied boolean NOT NULL DEFAULT false,
  affected_alias_ids integer[] NOT NULL DEFAULT '{}',
  affected_offering_ids bigint[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  CONSTRAINT treatment_mapping_reviews_decision_valid CHECK (
    final_decision IN ('keep_mapping', 'remap_existing', 'unmap_valid_service', 'reject_non_service', 'unresolved')
  ),
  CONSTRAINT treatment_mapping_reviews_status_valid CHECK (
    review_status IN ('consensus', 'needs_review', 'applied', 'not_applicable')
  ),
  CONSTRAINT treatment_mapping_reviews_confidence_valid CHECK (
    consensus_confidence IS NULL OR (consensus_confidence >= 0 AND consensus_confidence <= 1)
  ),
  UNIQUE (run_id, term_normalized, old_treatment_id)
);

CREATE INDEX IF NOT EXISTS treatment_mapping_reviews_queue_idx
  ON fountain_raw.treatment_mapping_reviews (review_status, final_decision, created_at DESC);

CREATE TABLE IF NOT EXISTS fountain_raw.treatment_mapping_offering_backup (
  review_id bigint NOT NULL REFERENCES fountain_raw.treatment_mapping_reviews(id),
  offering_id bigint NOT NULL REFERENCES fountain.offerings(id),
  previous_treatment_id integer REFERENCES fountain.treatments(id),
  restored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, offering_id)
);

COMMIT;
