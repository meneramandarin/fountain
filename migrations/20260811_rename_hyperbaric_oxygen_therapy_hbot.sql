-- Expand the canonical consumer-facing HBOT label everywhere treatment names
-- drive tags, filters, search documents, and treatment-page metadata. Keep the
-- treatment ID and raw clinic offering names unchanged.

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'rename_hyperbaric_oxygen_therapy_hbot_20260811'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.treatments
    WHERE id = 27
      AND canonical_name = 'Hyperbaric oxygen therapy'
  ) THEN
    RAISE EXCEPTION 'Expected treatment 27 to be Hyperbaric oxygen therapy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.treatments
    WHERE canonical_name = 'Hyperbaric oxygen therapy (HBOT)'
      AND id <> 27
  ) THEN
    RAISE EXCEPTION 'The requested HBOT canonical name is already assigned to another treatment';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS fountain_raw.hyperbaric_oxygen_therapy_name_backup_20260811 AS
SELECT treatment.*, now() AS backed_up_at
FROM fountain.treatments treatment
WHERE treatment.id = 27;

UPDATE fountain.treatments
SET canonical_name = 'Hyperbaric oxygen therapy (HBOT)'
WHERE id = 27;

-- Canonical treatment names are embedded in location search documents.
SELECT fountain.refresh_search_index_for_location(location_id)
FROM (
  SELECT DISTINCT location_id
  FROM fountain.offerings
  WHERE treatment_id = 27
    AND deleted_at IS NULL
) affected_locations;

SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.treatments
    WHERE id = 27
      AND canonical_name = 'Hyperbaric oxygen therapy (HBOT)'
  ) THEN
    RAISE EXCEPTION 'HBOT canonical treatment rename failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.treatments
    WHERE canonical_name = 'Hyperbaric oxygen therapy'
  ) THEN
    RAISE EXCEPTION 'The deprecated HBOT treatment label remains';
  END IF;
END;
$$;

COMMIT;
