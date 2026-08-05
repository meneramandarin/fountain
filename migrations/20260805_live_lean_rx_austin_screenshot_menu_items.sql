-- Add the three Austin menu entries visible in the supplied booking-page
-- screenshot but absent from the existing directory menu.

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'live_lean_rx_austin_screenshot_menu_items_20260805'
);

INSERT INTO fountain.offerings (
  id,
  location_id,
  treatment_id,
  raw_name,
  price_amount,
  price_currency,
  duration_minutes,
  description,
  status,
  data_origin,
  verification_status
)
SELECT
  nextval(pg_get_serial_sequence('fountain.offerings', 'id'))::integer,
  9327,
  NULL,
  entry.raw_name,
  NULL,
  NULL,
  entry.duration_minutes,
  entry.description,
  'active',
  'manual',
  'human_verified'
FROM (
  VALUES
    (
      'VO2 + RMR'::text,
      60::integer,
      NULL::text
    ),
    (
      'Food Intolerance Test 96 Marker'::text,
      15::integer,
      'Food Intolerance Test'::text
    ),
    (
      'Food Intolerance Test 184 Marker'::text,
      15::integer,
      '184 Marker Test'::text
    )
) AS entry(raw_name, duration_minutes, description)
WHERE EXISTS (
  SELECT 1
  FROM fountain.locations
  WHERE id = 9327
    AND slug = 'live-lean-rx-west-lake-hills'
    AND org_id = 4261
    AND status = 'active'
    AND deleted_at IS NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM fountain.offerings existing
  WHERE existing.location_id = 9327
    AND existing.raw_name = entry.raw_name
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
);

SELECT fountain.refresh_search_index_for_location(9327);
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM fountain.offerings
    WHERE location_id = 9327
      AND raw_name IN ('VO2 + RMR', 'Food Intolerance Test 96 Marker', 'Food Intolerance Test 184 Marker')
      AND status = 'active'
      AND deleted_at IS NULL
  ) <> 3 THEN
    RAISE EXCEPTION 'Austin screenshot menu entries are incomplete';
  END IF;
END;
$$;

COMMIT;
