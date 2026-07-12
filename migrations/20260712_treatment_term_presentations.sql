-- Non-destructive presentation metadata for treatment aliases.
-- Mapping remains owned by fountain_raw.treatment_aliases; this table controls
-- only how a mapped clinic term is presented to consumers.

BEGIN;

CREATE TABLE fountain.treatment_term_presentations (
  treatment_id integer NOT NULL REFERENCES fountain.treatments(id),
  term_normalized text NOT NULL,
  relationship_type text NOT NULL,
  display_mode text NOT NULL,
  mapping_valid boolean NOT NULL,
  confidence double precision NOT NULL,
  rationale text,
  model text,
  prompt_version text NOT NULL,
  review_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (treatment_id, term_normalized),
  CONSTRAINT treatment_term_presentations_term_nonempty
    CHECK (btrim(term_normalized) <> ''),
  CONSTRAINT treatment_term_presentations_relationship_valid
    CHECK (relationship_type IN (
      'format_variant',
      'equivalent',
      'brand',
      'subtype',
      'broader_match',
      'compound',
      'suspect'
    )),
  CONSTRAINT treatment_term_presentations_display_mode_valid
    CHECK (display_mode IN ('raw_only', 'raw_and_canonical', 'canonical_only')),
  CONSTRAINT treatment_term_presentations_confidence_valid
    CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT treatment_term_presentations_review_status_valid
    CHECK (review_status IN (
      'auto_approved',
      'needs_review',
      'human_approved',
      'human_rejected'
    ))
);

CREATE INDEX treatment_term_presentations_review_idx
  ON fountain.treatment_term_presentations (review_status, relationship_type);

CREATE INDEX idx_treatment_aliases_treatment_term
  ON fountain_raw.treatment_aliases (treatment_id, alias_normalized);

COMMIT;
