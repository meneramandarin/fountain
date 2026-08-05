-- Keep Upgrade Labs offer descriptions and prices in the database, but remove
-- the package URLs from offering records. The directory does not render offer
-- booking links or embed links inside treatment descriptions.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'upgrade_labs_remove_offer_links_20260805'
);

CREATE TABLE IF NOT EXISTS fountain_raw.upgrade_labs_offer_links_backup_20260805 AS
SELECT offering.*
FROM fountain.offerings offering
JOIN fountain.locations location ON location.id = offering.location_id
WHERE location.org_id = 1081
  AND offering.source_offer_url IS NOT NULL;

UPDATE fountain.offerings offering
SET source_offer_url = NULL,
    updated_at = now()
FROM fountain.locations location
WHERE offering.location_id = location.id
  AND location.org_id = 1081
  AND offering.source_offer_url IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fountain.offerings offering
    JOIN fountain.locations location ON location.id = offering.location_id
    WHERE location.org_id = 1081
      AND offering.source_offer_url IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Upgrade Labs offer links were not removed';
  END IF;
END;
$$;

COMMIT;
