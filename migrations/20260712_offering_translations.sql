-- Durable English display translations for source-facing offering names.
-- Original text remains in fountain.offerings.raw_name for provenance.

BEGIN;

CREATE TABLE fountain.offering_term_translations (
  source_text text PRIMARY KEY,
  source_language text NOT NULL,
  english_text text NOT NULL,
  is_english boolean NOT NULL,
  confidence double precision NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  review_status text NOT NULL,
  last_run_id bigint REFERENCES fountain_ops.runs(id),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offering_term_translations_source_nonempty CHECK (btrim(source_text) <> ''),
  CONSTRAINT offering_term_translations_english_nonempty CHECK (btrim(english_text) <> ''),
  CONSTRAINT offering_term_translations_language_nonempty CHECK (btrim(source_language) <> ''),
  CONSTRAINT offering_term_translations_confidence_valid CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT offering_term_translations_review_status_valid CHECK (
    review_status IN ('auto_approved', 'needs_review', 'human_approved', 'human_rejected')
  )
);

CREATE INDEX offering_term_translations_review_idx
  ON fountain.offering_term_translations (review_status, is_english, updated_at DESC);

CREATE INDEX offering_term_translations_run_idx
  ON fountain.offering_term_translations (last_run_id);

CREATE OR REPLACE FUNCTION fountain.refresh_search_index_for_location(p_location_id integer)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations location
    WHERE location.id = p_location_id
      AND location.status = 'active'
      AND location.deleted_at IS NULL
  ) THEN
    DELETE FROM fountain.search_index
    WHERE entity_type = 'location'
      AND entity_id = p_location_id;
    RETURN;
  END IF;

  INSERT INTO fountain.search_index (
    entity_type, entity_id, name, locality, country, treatments, specialties, tags
  )
  SELECT
    'location',
    location.id,
    COALESCE(location.name, organization.canonical_name),
    location.locality,
    COALESCE(location.country_name, location.country_code),
    COALESCE((
      SELECT string_agg(DISTINCT label, ' ' ORDER BY label)
      FROM (
        SELECT treatment.canonical_name AS label
        FROM fountain.offerings offering
        JOIN fountain.treatments treatment ON treatment.id = offering.treatment_id
        WHERE offering.location_id = location.id
          AND offering.status = 'active'
          AND offering.deleted_at IS NULL
          AND btrim(coalesce(treatment.canonical_name, '')) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM fountain.offering_display_suppressions suppression
            WHERE suppression.offering_id = offering.id AND suppression.active
          )
        UNION
        SELECT offering.raw_name AS label
        FROM fountain.offerings offering
        WHERE offering.location_id = location.id
          AND offering.status = 'active'
          AND offering.deleted_at IS NULL
          AND btrim(coalesce(offering.raw_name, '')) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM fountain.offering_display_suppressions suppression
            WHERE suppression.offering_id = offering.id AND suppression.active
          )
        UNION
        SELECT translation.english_text AS label
        FROM fountain.offerings offering
        JOIN fountain.offering_term_translations translation
          ON translation.source_text = offering.raw_name
         AND translation.review_status IN ('auto_approved', 'human_approved')
        WHERE offering.location_id = location.id
          AND offering.status = 'active'
          AND offering.deleted_at IS NULL
          AND btrim(translation.english_text) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM fountain.offering_display_suppressions suppression
            WHERE suppression.offering_id = offering.id AND suppression.active
          )
      ) visible_labels
    ), ''),
    '',
    ''
  FROM fountain.locations location
  LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
  WHERE location.id = p_location_id
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    name = EXCLUDED.name,
    locality = EXCLUDED.locality,
    country = EXCLUDED.country,
    treatments = EXCLUDED.treatments,
    specialties = EXCLUDED.specialties,
    tags = EXCLUDED.tags;
END;
$function$;

COMMIT;
