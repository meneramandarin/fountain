-- Remove OxyHealthCare retail/catalog products from clinic offerings.
--
-- A menu-enrichment scrape pulled shop catalog rows into the branch listings
-- along with the real pricing-page HBOT services. The directory should show
-- services, not retail supplements, gift cards, bottles, or chamber products.

CREATE TEMP TABLE tmp_oxyhealthcare_locations AS
SELECT id AS location_id
FROM __CANONICAL_SCHEMA__.locations
WHERE lower(COALESCE(website, '')) LIKE '%oxyhealthcare.co.uk%';

DELETE FROM __CANONICAL_SCHEMA__.offerings offering
USING tmp_oxyhealthcare_locations oxy
WHERE offering.location_id = oxy.location_id
  AND (
      lower(COALESCE(offering.source_offer_url, '')) LIKE 'https://oxyhealthcare.co.uk/shop%'
      OR lower(COALESCE(offering.source_offer_url, '')) LIKE 'https://www.oxyhealthcare.co.uk/shop%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'celtic salt%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE '6 mushroom complex%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'lion''s mane%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'reishi%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'turkey tail%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'gift card%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'gift voucher%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'primitive total wellness%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'bundle offer: primitive total wellness%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'hydrogen o2 drinking bottle%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'oxy one%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'oxy two%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'oxy three%'
      OR lower(COALESCE(offering.raw_name, '')) LIKE 'oxy four%'
  );

CREATE TEMP TABLE tmp_oxyhealthcare_treatment_text AS
SELECT
    offering.location_id,
    string_agg(
        DISTINCT COALESCE(treatment.canonical_name, offering.raw_name),
        ' '
        ORDER BY COALESCE(treatment.canonical_name, offering.raw_name)
    ) AS treatments
FROM __CANONICAL_SCHEMA__.offerings offering
LEFT JOIN __CANONICAL_SCHEMA__.treatments treatment ON treatment.id = offering.treatment_id
JOIN tmp_oxyhealthcare_locations oxy ON oxy.location_id = offering.location_id
GROUP BY offering.location_id;

UPDATE __CANONICAL_SCHEMA__.search_index search_row
SET treatments = COALESCE(treatment_text.treatments, '')
FROM tmp_oxyhealthcare_locations oxy
LEFT JOIN tmp_oxyhealthcare_treatment_text treatment_text
  ON treatment_text.location_id = oxy.location_id
WHERE search_row.entity_type = 'location'
  AND search_row.entity_id = oxy.location_id;
