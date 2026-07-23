BEGIN;

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.treatments
    WHERE id = 74
      AND canonical_name = 'IV Infusions'
  ) THEN
    RAISE EXCEPTION 'Expected canonical treatment 74 to be IV Infusions';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.treatments
    WHERE id = 23
      AND canonical_name <> 'Vitamin infusion'
  ) THEN
    RAISE EXCEPTION 'Treatment 23 is not Vitamin infusion';
  END IF;
END
$checks$;

UPDATE fountain.offerings
SET treatment_id = 74
WHERE treatment_id = 23;

UPDATE fountain.treatment_term_presentations
SET treatment_id = 74
WHERE treatment_id = 23;

UPDATE fountain_raw.treatment_aliases
SET treatment_id = 74
WHERE treatment_id = 23;

INSERT INTO fountain_raw.treatment_aliases (
  treatment_id,
  alias_text,
  alias_normalized,
  source_slug,
  mapping_status
)
VALUES (
  74,
  'Vitamin infusion',
  'vitamin infusion',
  '',
  'active'
)
ON CONFLICT (alias_normalized, source_slug) DO UPDATE
SET treatment_id = EXCLUDED.treatment_id,
    alias_text = EXCLUDED.alias_text,
    mapping_status = EXCLUDED.mapping_status;

UPDATE fountain_raw.treatment_mapping_offering_backup
SET previous_treatment_id = 74
WHERE previous_treatment_id = 23;

UPDATE fountain_raw.treatment_mapping_reviews
SET old_treatment_id = 74
WHERE old_treatment_id = 23;

UPDATE fountain_raw.treatment_mapping_reviews
SET proposed_treatment_id = 74
WHERE proposed_treatment_id = 23;

DELETE FROM fountain.treatments
WHERE id = 23;

COMMIT;
