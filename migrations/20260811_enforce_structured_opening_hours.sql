-- Make structured seven-day opening hours the only supported representation.
-- Freeform opening-hours notes are retired so schedule facts cannot render as
-- prose below the standard Monday-Sunday rows.

BEGIN;

SELECT fountain.set_mutation_actor(
  '1e9c87f0-e95c-4492-a863-9eaf46011397'::uuid,
  'enforce_structured_opening_hours_20260811'
);

CREATE SCHEMA IF NOT EXISTS fountain_raw;

CREATE TABLE IF NOT EXISTS fountain_raw.structured_opening_hours_backup_20260811 AS
SELECT id, slug, opening_hours, opening_hours_note, updated_at
FROM fountain.locations
WHERE opening_hours IS NOT NULL OR opening_hours_note IS NOT NULL;

CREATE TABLE IF NOT EXISTS fountain_raw.structured_opening_hours_field_status_backup_20260811 AS
SELECT status.*
FROM fountain_ops.field_status status
WHERE status.entity_type = 'location'
  AND status.field IN ('opening_hours', 'opening_hours_note');

-- Convert the remaining meaningful notes into structured states before all
-- prose notes are removed.
UPDATE fountain.locations
SET opening_hours = '[
  {"day":"Monday","open":"07:00","close":"14:00"},
  {"day":"Tuesday","open":"07:00","close":"14:00"},
  {"day":"Wednesday","open":"07:00","close":"14:00"},
  {"day":"Thursday","open":"07:00","close":"14:00"},
  {"day":"Friday","open":"07:00","close":"14:00"},
  {"day":"Saturday","closed":true},
  {"day":"Sunday","closed":true}
]'::jsonb,
    opening_hours_note = NULL,
    updated_at = now()
WHERE id = 4878
  AND slug = 'florida-regen-hialeah';

UPDATE fountain.locations
SET opening_hours = coalesce(opening_hours, '[]'::jsonb)
      || '[{"day":"Saturday","by_appointment_only":true},{"day":"Sunday","by_appointment_only":true}]'::jsonb,
    opening_hours_note = NULL,
    updated_at = now()
WHERE id IN (13925, 14244)
  AND opening_hours_note = 'Weekend availability by enquiry.';

UPDATE fountain.locations
SET opening_hours = '[
  {"day":"Monday","by_appointment_only":true},
  {"day":"Tuesday","by_appointment_only":true},
  {"day":"Wednesday","by_appointment_only":true},
  {"day":"Thursday","by_appointment_only":true},
  {"day":"Friday","by_appointment_only":true},
  {"day":"Saturday","by_appointment_only":true},
  {"day":"Sunday","by_appointment_only":true}
]'::jsonb,
    opening_hours_note = NULL,
    updated_at = now()
WHERE id = 18254
  AND opening_hours_note = 'By appointment only';

WITH source_locations AS (
  SELECT id
  FROM fountain.locations
  WHERE jsonb_typeof(opening_hours) = 'array'
), raw_entries AS (
  SELECT
    location.id,
    CASE lower(left(entry.value->>'day', 3))
      WHEN 'mon' THEN 'Monday'
      WHEN 'tue' THEN 'Tuesday'
      WHEN 'wed' THEN 'Wednesday'
      WHEN 'thu' THEN 'Thursday'
      WHEN 'fri' THEN 'Friday'
      WHEN 'sat' THEN 'Saturday'
      WHEN 'sun' THEN 'Sunday'
    END AS day,
    entry.value
  FROM fountain.locations location
  CROSS JOIN LATERAL jsonb_array_elements(location.opening_hours) entry(value)
  WHERE jsonb_typeof(location.opening_hours) = 'array'
), parsed_entries AS (
  SELECT
    id,
    day,
    NULLIF(btrim(COALESCE(value->>'open', value->>'opens')), '') AS opens_at,
    NULLIF(btrim(COALESCE(value->>'close', value->>'closes')), '') AS closes_at,
    COALESCE(value->'closed' = 'true'::jsonb, false) AS is_closed,
    COALESCE(
      value->'by_appointment_only' = 'true'::jsonb,
      value->'by_appointment' = 'true'::jsonb,
      false
    ) AS by_appointment
  FROM raw_entries
  WHERE day IS NOT NULL
), identified_entries AS (
  SELECT *
  FROM parsed_entries
  WHERE is_closed
     OR by_appointment
     OR (
       opens_at IS NOT NULL
       AND closes_at IS NOT NULL
       AND lower(opens_at) NOT IN ('unidentified', 'unknown', 'not provided', 'n/a', 'null')
       AND lower(closes_at) NOT IN ('unidentified', 'unknown', 'not provided', 'n/a', 'null')
     )
), locations_with_hours AS (
  SELECT DISTINCT id FROM identified_entries
), weekdays(day, ordinal) AS (
  VALUES
    ('Monday', 1), ('Tuesday', 2), ('Wednesday', 3), ('Thursday', 4),
    ('Friday', 5), ('Saturday', 6), ('Sunday', 7)
), canonical_days AS (
  SELECT
    location.id,
    weekday.day,
    weekday.ordinal,
    CASE
      WHEN count(*) FILTER (WHERE entry.opens_at IS NOT NULL AND entry.closes_at IS NOT NULL) > 0 THEN
        jsonb_agg(
          jsonb_build_object('day', weekday.day, 'open', entry.opens_at, 'close', entry.closes_at)
          ORDER BY entry.opens_at
        ) FILTER (WHERE entry.opens_at IS NOT NULL AND entry.closes_at IS NOT NULL)
      WHEN bool_or(entry.by_appointment) THEN
        jsonb_build_array(jsonb_build_object('day', weekday.day, 'by_appointment_only', true))
      ELSE
        jsonb_build_array(jsonb_build_object('day', weekday.day, 'closed', true))
    END AS entries
  FROM locations_with_hours location
  CROSS JOIN weekdays weekday
  LEFT JOIN identified_entries entry ON entry.id = location.id AND entry.day = weekday.day
  GROUP BY location.id, weekday.day, weekday.ordinal
), canonical_hours AS (
  SELECT id, jsonb_agg(entry.value ORDER BY canonical_days.ordinal) AS opening_hours
  FROM canonical_days
  CROSS JOIN LATERAL jsonb_array_elements(canonical_days.entries) entry(value)
  GROUP BY id
)
UPDATE fountain.locations location
SET opening_hours = canonical.opening_hours,
    updated_at = now()
FROM canonical_hours canonical
WHERE location.id = canonical.id
  AND location.opening_hours IS DISTINCT FROM canonical.opening_hours;

UPDATE fountain.locations
SET opening_hours = NULL,
    updated_at = now()
WHERE opening_hours IS NOT NULL
  AND (
    jsonb_typeof(opening_hours) <> 'array'
    OR jsonb_array_length(opening_hours) = 0
  );

UPDATE fountain.locations
SET opening_hours_note = NULL,
    updated_at = now()
WHERE opening_hours_note IS NOT NULL;

DELETE FROM fountain_ops.field_status
WHERE entity_type = 'location'
  AND field = 'opening_hours_note';

CREATE OR REPLACE FUNCTION fountain.is_structured_opening_hours(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  entry jsonb;
  entry_day text;
  opens_at text;
  closes_at text;
  is_closed boolean;
  is_by_appointment boolean;
  state_count integer;
  seen_days text[] := ARRAY[]::text[];
  required_day text;
BEGIN
  IF value IS NULL THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(value) <> 'array' OR jsonb_array_length(value) < 7 THEN
    RETURN false;
  END IF;

  FOR entry IN SELECT item FROM jsonb_array_elements(value) item LOOP
    IF jsonb_typeof(entry) <> 'object'
      OR (entry - ARRAY['day', 'open', 'close', 'closed', 'by_appointment_only']) <> '{}'::jsonb
    THEN
      RETURN false;
    END IF;

    entry_day := entry->>'day';
    IF entry_day IS NULL OR entry_day NOT IN (
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
    ) THEN
      RETURN false;
    END IF;

    opens_at := NULLIF(btrim(entry->>'open'), '');
    closes_at := NULLIF(btrim(entry->>'close'), '');
    is_closed := COALESCE(entry->'closed' = 'true'::jsonb, false);
    is_by_appointment := COALESCE(entry->'by_appointment_only' = 'true'::jsonb, false);
    state_count := is_closed::integer
      + is_by_appointment::integer
      + (opens_at IS NOT NULL AND closes_at IS NOT NULL)::integer;

    IF state_count <> 1
      OR (opens_at IS NULL) <> (closes_at IS NULL)
      OR lower(coalesce(opens_at, '')) IN ('unidentified', 'unknown', 'not provided', 'n/a', 'null')
      OR lower(coalesce(closes_at, '')) IN ('unidentified', 'unknown', 'not provided', 'n/a', 'null')
    THEN
      RETURN false;
    END IF;

    seen_days := array_append(seen_days, entry_day);
  END LOOP;

  FOREACH required_day IN ARRAY ARRAY[
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ] LOOP
    IF NOT required_day = ANY(seen_days) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

ALTER TABLE fountain.locations
  DROP CONSTRAINT IF EXISTS locations_opening_hours_note_must_be_null;
ALTER TABLE fountain.locations
  ADD CONSTRAINT locations_opening_hours_note_must_be_null
  CHECK (opening_hours_note IS NULL);

ALTER TABLE fountain.locations
  DROP CONSTRAINT IF EXISTS locations_opening_hours_structured_check;
ALTER TABLE fountain.locations
  ADD CONSTRAINT locations_opening_hours_structured_check
  CHECK (fountain.is_structured_opening_hours(opening_hours));

COMMENT ON COLUMN fountain.locations.opening_hours IS
  'Canonical Monday-Sunday JSON array. Each entry is open/close, closed, or by_appointment_only.';
COMMENT ON COLUMN fountain.locations.opening_hours_note IS
  'Retired. Freeform opening-hours notes are rejected; encode every schedule state in opening_hours.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM fountain.locations WHERE opening_hours_note IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Opening-hours note cleanup failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE NOT fountain.is_structured_opening_hours(opening_hours)
  ) THEN
    RAISE EXCEPTION 'Opening-hours canonicalization failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 4878
      AND opening_hours_note IS NULL
      AND jsonb_array_length(opening_hours) = 7
      AND opening_hours @> '[{"day":"Saturday","closed":true},{"day":"Sunday","closed":true}]'::jsonb
  ) THEN
    RAISE EXCEPTION 'Florida Regen Hialeah hours were not canonicalized';
  END IF;
END;
$$;

COMMIT;

