-- Prevent future merge jobs from moving two distinct branch listings from a protected
-- physical-location source onto one canonical location.

BEGIN;

CREATE OR REPLACE FUNCTION fountain.guard_distinct_branch_source_reassignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_slug text;
BEGIN
  IF NEW.entity_type <> 'location'
     OR OLD.entity_type <> 'location'
     OR NEW.entity_id = OLD.entity_id
     OR NEW.source_listing_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT slug INTO source_slug
  FROM fountain.sources
  WHERE id = NEW.source_id;

  IF source_slug LIKE 'chain\_%' ESCAPE '\'
     OR source_slug IN ('longevity_technology_clinics', 'hyperbaric_app') THEN
    IF EXISTS (
      SELECT 1
      FROM fountain.source_records existing
      WHERE existing.entity_type = 'location'
        AND existing.entity_id = NEW.entity_id
        AND existing.source_id = NEW.source_id
        AND existing.source_listing_id IS NOT NULL
        AND existing.source_listing_id <> NEW.source_listing_id
    ) THEN
      RAISE EXCEPTION
        'Refusing to combine distinct % branch listings % and % on location %',
        source_slug,
        NEW.source_listing_id,
        (
          SELECT existing.source_listing_id
          FROM fountain.source_records existing
          WHERE existing.entity_type = 'location'
            AND existing.entity_id = NEW.entity_id
            AND existing.source_id = NEW.source_id
            AND existing.source_listing_id IS NOT NULL
            AND existing.source_listing_id <> NEW.source_listing_id
          ORDER BY existing.id
          LIMIT 1
        ),
        NEW.entity_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_distinct_branch_source_reassignment
  ON fountain.source_records;

CREATE TRIGGER trg_guard_distinct_branch_source_reassignment
BEFORE UPDATE OF entity_id ON fountain.source_records
FOR EACH ROW
EXECUTE FUNCTION fountain.guard_distinct_branch_source_reassignment();

COMMIT;
