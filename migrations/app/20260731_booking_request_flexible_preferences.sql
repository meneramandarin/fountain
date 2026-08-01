-- Unapplied migration: allow one to three appointment preferences. The API
-- validates each JSON preference's date and morning/afternoon/evening enum.

BEGIN;

DO $$
DECLARE
  preference_constraint record;
BEGIN
  FOR preference_constraint IN
    SELECT conname AS constraint_name
    FROM pg_constraint
    WHERE conrelid = 'booking_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%jsonb_array_length(preferences) = 3%'
  LOOP
    EXECUTE format(
      'ALTER TABLE booking_requests DROP CONSTRAINT %I',
      preference_constraint.constraint_name
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_requests_preferences_count_check'
      AND conrelid = 'booking_requests'::regclass
  ) THEN
    ALTER TABLE booking_requests
      ADD CONSTRAINT booking_requests_preferences_count_check
      CHECK (
        jsonb_typeof(preferences) = 'array'
        AND jsonb_array_length(preferences) BETWEEN 1 AND 3
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE booking_requests
  VALIDATE CONSTRAINT booking_requests_preferences_count_check;

COMMENT ON COLUMN booking_requests.preferences IS
  'One to three date preferences; time is morning, afternoon, or evening in clinic-local time.';

COMMIT;
