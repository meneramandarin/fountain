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
    WHERE id = 21
      AND canonical_name <> 'IV nutrient therapy'
  ) THEN
    RAISE EXCEPTION 'Treatment 21 is not IV nutrient therapy';
  END IF;
END
$checks$;

UPDATE fountain.offerings
SET treatment_id = 74
WHERE treatment_id = 21;

UPDATE fountain.treatment_term_presentations
SET treatment_id = 74
WHERE treatment_id = 21;

UPDATE fountain_raw.treatment_aliases
SET treatment_id = 74
WHERE treatment_id = 21;

UPDATE fountain_raw.treatment_mapping_offering_backup
SET previous_treatment_id = 74
WHERE previous_treatment_id = 21;

UPDATE fountain_raw.treatment_mapping_reviews
SET old_treatment_id = 74
WHERE old_treatment_id = 21;

UPDATE fountain_raw.treatment_mapping_reviews
SET proposed_treatment_id = 74
WHERE proposed_treatment_id = 21;

DELETE FROM fountain.treatments
WHERE id = 21;

COMMIT;
