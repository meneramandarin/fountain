BEGIN;

WITH ketamine AS (
  INSERT INTO fountain.treatments (
    id,
    canonical_name,
    description,
    category
  )
  VALUES (
    nextval(pg_get_serial_sequence('fountain.treatments', 'id'))::integer,
    'Ketamine therapy',
    'Clinician-supervised ketamine or esketamine treatment, including infusion, injection, and assisted-psychotherapy programs.',
    'Optimize'
  )
  ON CONFLICT (canonical_name) DO UPDATE SET
    description = EXCLUDED.description,
    category = EXCLUDED.category
  RETURNING id
),
aliases(alias_text, alias_normalized) AS (
  VALUES
    ('Ketamine', 'ketamine'),
    ('Ketamine therapy', 'ketamine therapy'),
    ('Ketamine infusion', 'ketamine infusion'),
    ('Ketamine infusions', 'ketamine infusions'),
    ('Ketamine injection', 'ketamine injection'),
    ('Ketamine IV', 'ketamine iv'),
    ('Ketamine IV therapy', 'ketamine iv therapy'),
    ('Ketamine IV infusion', 'ketamine iv infusion'),
    ('Ketamine IV infusions', 'ketamine iv infusions'),
    ('IV ketamine therapy', 'iv ketamine therapy'),
    ('Ketamine assisted psychotherapy', 'ketamine assisted psychotherapy'),
    ('Spravato', 'spravato'),
    ('Spravato treatment', 'spravato treatment'),
    ('Esketamine', 'esketamine'),
    ('Esketamine treatment', 'esketamine treatment')
)
INSERT INTO fountain_raw.treatment_aliases (
  id,
  treatment_id,
  alias_text,
  alias_normalized,
  source_slug,
  mapping_status,
  mapping_confidence,
  mapping_review_model,
  mapping_reviewed_at,
  mapping_review_rationale
)
SELECT
  nextval(pg_get_serial_sequence('fountain_raw.treatment_aliases', 'id'))::integer,
  ketamine.id,
  aliases.alias_text,
  aliases.alias_normalized,
  'ketamine_taxonomy_20260724',
  'active',
  1.0,
  'human',
  now(),
  'Canonical ketamine category added after user review of held treatment evidence.'
FROM aliases
CROSS JOIN ketamine
ON CONFLICT (alias_normalized, source_slug) DO UPDATE SET
  treatment_id = EXCLUDED.treatment_id,
  alias_text = EXCLUDED.alias_text,
  mapping_status = 'active',
  mapping_confidence = 1.0,
  mapping_review_model = 'human',
  mapping_reviewed_at = now(),
  mapping_review_rationale = EXCLUDED.mapping_review_rationale;

WITH ketamine AS (
  SELECT id
  FROM fountain.treatments
  WHERE canonical_name = 'Ketamine therapy'
)
UPDATE fountain.offerings offering
SET treatment_id = ketamine.id,
    verification_status = 'human_verified',
    updated_at = now()
FROM ketamine
WHERE offering.location_id IN (
    SELECT candidate.promoted_location_id
    FROM fountain_raw.agent_discovery_candidates candidate
    WHERE candidate.agent_payload ? '_manual_treatment_approval_v1'
      AND candidate.promoted_location_id IS NOT NULL
  )
  AND lower(offering.raw_name) ~ 'ketamine|spravato|esketamine';

UPDATE fountain.offerings offering
SET treatment_id = 12,
    verification_status = 'human_verified',
    updated_at = now()
WHERE offering.location_id IN (
    SELECT candidate.promoted_location_id
    FROM fountain_raw.agent_discovery_candidates candidate
    WHERE candidate.agent_payload ? '_manual_treatment_approval_v1'
      AND candidate.promoted_location_id IS NOT NULL
  )
  AND lower(offering.raw_name) ~ 'sleep stud|sleep apnea test|home sleep test';

UPDATE fountain.offerings offering
SET treatment_id = 10,
    verification_status = 'human_verified',
    updated_at = now()
WHERE offering.location_id IN (
    SELECT candidate.promoted_location_id
    FROM fountain_raw.agent_discovery_candidates candidate
    WHERE candidate.agent_payload ? '_manual_treatment_approval_v1'
      AND candidate.promoted_location_id IS NOT NULL
  )
  AND lower(offering.raw_name) IN ('cancer imaging', 'whole-body pet scans', 'whole body pet scans');

COMMIT;
