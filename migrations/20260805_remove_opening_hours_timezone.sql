-- Opening hours remain structured and visible in the UI, but timezone metadata
-- is intentionally removed from the database and presentation.

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'remove_opening_hours_timezone_20260805'
);

ALTER TABLE fountain.locations
  DROP COLUMN IF EXISTS opening_hours_timezone;

COMMIT;
