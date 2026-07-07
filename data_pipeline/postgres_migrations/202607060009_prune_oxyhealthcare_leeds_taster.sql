-- Remove OxyHealthCare Leeds taster rows from the displayed offering menu.

CREATE TEMP TABLE tmp_oxyhealthcare_leeds AS
SELECT DISTINCT location.entity_id AS location_id
FROM __CANONICAL_SCHEMA__.source_records location
WHERE location.entity_type = 'location'
  AND location.source_url = 'https://hyperbaric.app/clinic/oxyhealthcare-leeds';

DELETE FROM __CANONICAL_SCHEMA__.offerings offering
USING tmp_oxyhealthcare_leeds leeds
WHERE offering.location_id = leeds.location_id
  AND (
      lower(COALESCE(offering.raw_name, '')) = 'taster session'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'taster session - 1 session with consultation%'
  );

CREATE TEMP TABLE tmp_oxyhealthcare_leeds_treatment_text AS
SELECT
    offering.location_id,
    string_agg(
        DISTINCT COALESCE(treatment.canonical_name, offering.raw_name),
        ' '
        ORDER BY COALESCE(treatment.canonical_name, offering.raw_name)
    ) AS treatments
FROM __CANONICAL_SCHEMA__.offerings offering
LEFT JOIN __CANONICAL_SCHEMA__.treatments treatment ON treatment.id = offering.treatment_id
JOIN tmp_oxyhealthcare_leeds leeds ON leeds.location_id = offering.location_id
GROUP BY offering.location_id;

UPDATE __CANONICAL_SCHEMA__.search_index search_row
SET treatments = COALESCE(treatment_text.treatments, '')
FROM tmp_oxyhealthcare_leeds leeds
LEFT JOIN tmp_oxyhealthcare_leeds_treatment_text treatment_text
  ON treatment_text.location_id = leeds.location_id
WHERE search_row.entity_type = 'location'
  AND search_row.entity_id = leeds.location_id;
