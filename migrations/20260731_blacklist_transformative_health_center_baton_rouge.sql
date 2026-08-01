-- Hide the out-of-scope Transformative Health Center Baton Rouge listing while
-- preserving the imported row and its dependent provenance for reversibility.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'blacklist_transformative_health_center_baton_rouge_20260731'
);

CREATE TABLE IF NOT EXISTS fountain_raw.transformative_health_center_baton_rouge_backup_20260731 AS
SELECT *
FROM fountain.locations
WHERE id = 12714
  AND slug = 'transformative-health-center-medical-marijuana-doctors-in-louisiana-baton-rouge';

DO $$
BEGIN
  IF (SELECT count(*)
      FROM fountain_raw.transformative_health_center_baton_rouge_backup_20260731) <> 1 THEN
    RAISE EXCEPTION 'Expected one Transformative Health Center Baton Rouge location backup';
  END IF;
END;
$$;

UPDATE fountain.locations
SET status = 'hidden',
    updated_at = now()
WHERE id = 12714
  AND slug = 'transformative-health-center-medical-marijuana-doctors-in-louisiana-baton-rouge';

SELECT fountain.refresh_search_index_for_location(12714);
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 12714
      AND slug = 'transformative-health-center-medical-marijuana-doctors-in-louisiana-baton-rouge'
      AND status = 'hidden'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Transformative Health Center Baton Rouge was not hidden';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.search_index
    WHERE entity_type = 'location'
      AND entity_id = 12714
  ) THEN
    RAISE EXCEPTION 'Transformative Health Center Baton Rouge remains in the search index';
  END IF;
END;
$$;

COMMIT;
