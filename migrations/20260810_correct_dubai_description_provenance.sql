-- Remove standardized-description provenance accidentally attached to Dubai
-- offerings whose descriptions already existed before the depth migration.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  '68d7859a-cf62-4f68-9f21-202608100002'::uuid,
  'correct_dubai_description_provenance_20260810'
);

CREATE TABLE IF NOT EXISTS fountain_raw.dubai_description_provenance_correction_backup_20260810 AS
SELECT status.*
FROM fountain_ops.field_status status
JOIN fountain_raw.dubai_listing_depth_offerings_backup_20260810 previous
  ON status.entity_type = 'offering'
 AND status.entity_id = previous.id
WHERE status.field = 'description'
  AND status.verified_by = 'enrich_dubai_listing_depth_20260810'
  AND status.source_note = 'Standardized explanation derived from Fountain canonical treatment taxonomy; provider-specific claims were not added'
  AND nullif(trim(previous.description), '') IS NOT NULL;

DELETE FROM fountain_ops.field_status status
USING fountain_raw.dubai_listing_depth_offerings_backup_20260810 previous
WHERE status.entity_type = 'offering'
  AND status.entity_id = previous.id
  AND status.field = 'description'
  AND status.verified_by = 'enrich_dubai_listing_depth_20260810'
  AND status.source_note = 'Standardized explanation derived from Fountain canonical treatment taxonomy; provider-specific claims were not added'
  AND nullif(trim(previous.description), '') IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fountain_ops.field_status status
    JOIN fountain_raw.dubai_listing_depth_offerings_backup_20260810 previous
      ON status.entity_type = 'offering'
     AND status.entity_id = previous.id
    WHERE status.field = 'description'
      AND status.verified_by = 'enrich_dubai_listing_depth_20260810'
      AND status.source_note = 'Standardized explanation derived from Fountain canonical treatment taxonomy; provider-specific claims were not added'
      AND nullif(trim(previous.description), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Incorrect standardized-description provenance remains';
  END IF;
END;
$$;

COMMIT;
