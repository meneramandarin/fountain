-- Treat taxonomy as optional discovery metadata rather than a requirement for
-- displaying or finding a clinic's source-facing menu offerings.

BEGIN;

CREATE OR REPLACE FUNCTION fountain.refresh_search_index_for_location(p_location_id integer)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations location
    WHERE location.id = p_location_id
      AND location.status = 'active'
      AND location.deleted_at IS NULL
  ) THEN
    DELETE FROM fountain.search_index
    WHERE entity_type = 'location'
      AND entity_id = p_location_id;
    RETURN;
  END IF;

  INSERT INTO fountain.search_index (
    entity_type,
    entity_id,
    name,
    locality,
    country,
    treatments,
    specialties,
    tags
  )
  SELECT
    'location',
    location.id,
    COALESCE(location.name, organization.canonical_name),
    location.locality,
    COALESCE(location.country_name, location.country_code),
    COALESCE((
      SELECT string_agg(DISTINCT label, ' ' ORDER BY label)
      FROM (
        SELECT treatment.canonical_name AS label
        FROM fountain.offerings offering
        JOIN fountain.treatments treatment ON treatment.id = offering.treatment_id
        WHERE offering.location_id = location.id
          AND offering.status = 'active'
          AND offering.deleted_at IS NULL
          AND treatment.canonical_name IS NOT NULL
          AND treatment.canonical_name <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM fountain.offering_display_suppressions suppression
            WHERE suppression.offering_id = offering.id
              AND suppression.active
          )
        UNION
        SELECT offering.raw_name AS label
        FROM fountain.offerings offering
        WHERE offering.location_id = location.id
          AND offering.status = 'active'
          AND offering.deleted_at IS NULL
          AND offering.raw_name IS NOT NULL
          AND btrim(offering.raw_name) <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM fountain.offering_display_suppressions suppression
            WHERE suppression.offering_id = offering.id
              AND suppression.active
          )
      ) visible_labels
    ), ''),
    '',
    ''
  FROM fountain.locations location
  LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
  WHERE location.id = p_location_id
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    name = EXCLUDED.name,
    locality = EXCLUDED.locality,
    country = EXCLUDED.country,
    treatments = EXCLUDED.treatments,
    specialties = EXCLUDED.specialties,
    tags = EXCLUDED.tags;
END;
$function$;

COMMIT;
