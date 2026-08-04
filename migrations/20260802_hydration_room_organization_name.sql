-- Correct the Hydration Room chain name so organization-level UI labels do not
-- inherit the name of the Huntington Beach – Adams Ave. branch.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'hydration_room_organization_name_20260802'
);

CREATE TABLE IF NOT EXISTS fountain_raw.hydration_room_organization_backup_20260802 AS
SELECT *
FROM fountain.organizations
WHERE id = 2754
  AND website_domain = 'hydrationroom.com';

DO $$
BEGIN
  IF (SELECT count(*)
      FROM fountain_raw.hydration_room_organization_backup_20260802) <> 1 THEN
    RAISE EXCEPTION 'Expected one Hydration Room organization backup';
  END IF;
END;
$$;

UPDATE fountain.organizations
SET canonical_name = 'Hydration Room',
    name_normalized = 'hydration room',
    data_origin = 'manual',
    updated_at = now()
WHERE id = 2754
  AND website_domain = 'hydrationroom.com';

-- Keep search documents aligned with the corrected organization name.
SELECT fountain.refresh_search_index_for_location(l.id)
FROM fountain.locations l
WHERE l.org_id = 2754
  AND l.status = 'active'
  AND l.deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.organizations
    WHERE id = 2754
      AND canonical_name = 'Hydration Room'
      AND name_normalized = 'hydration room'
      AND website_domain = 'hydrationroom.com'
      AND dedup_key = 'hydrationroom.com'
  ) THEN
    RAISE EXCEPTION 'Hydration Room organization name was not corrected';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 14950
      AND org_id = 2754
      AND slug = 'hydration-room-san-jose'
      AND name = 'Hydration Room - San Jose'
      AND status = 'active'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Hydration Room San Jose branch identity changed unexpectedly';
  END IF;
END;
$$;

COMMIT;
