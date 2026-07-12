-- Non-destructive display resolution for duplicate and legacy-summary offerings.

BEGIN;

ALTER TABLE fountain.sources
  ADD COLUMN offering_granularity text NOT NULL DEFAULT 'unknown',
  ADD CONSTRAINT sources_offering_granularity_valid
    CHECK (offering_granularity IN ('unknown', 'summary', 'menu_item', 'direct_service'));

UPDATE fountain.sources
SET offering_granularity = CASE
  WHEN slug = 'bioedge_clinics' THEN 'summary'
  WHEN slug = 'clinic_websites' THEN 'direct_service'
  WHEN slug = 'menu_enrichment' OR slug LIKE 'menu_enrichment_agent_run_%' THEN 'menu_item'
  ELSE offering_granularity
END;

CREATE TABLE fountain.offering_display_suppressions (
  offering_id integer PRIMARY KEY REFERENCES fountain.offerings(id) ON DELETE CASCADE,
  location_id integer NOT NULL REFERENCES fountain.locations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  winner_offering_id integer NOT NULL REFERENCES fountain.offerings(id) ON DELETE CASCADE,
  rule_version text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offering_display_suppressions_not_self
    CHECK (offering_id <> winner_offering_id),
  CONSTRAINT offering_display_suppressions_reason_valid
    CHECK (reason IN (
      'duplicate_same_term',
      'duplicate_unpriced_shadow',
      'legacy_summary_shadow'
    )),
  CONSTRAINT offering_display_suppressions_evidence_object
    CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX offering_display_suppressions_location_active_idx
  ON fountain.offering_display_suppressions (location_id, active);

CREATE INDEX offering_display_suppressions_winner_idx
  ON fountain.offering_display_suppressions (winner_offering_id);

COMMIT;
