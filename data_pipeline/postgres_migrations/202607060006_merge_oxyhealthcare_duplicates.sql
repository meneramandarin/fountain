-- Merge OxyHealthCare branch duplicates at the serving-data layer.
--
-- The correct branch rows carry address/images/review matches. The menu
-- enrichment rows carry priced offerings but reused the Sheffield HQ address.
-- Keep the branch rows, move all child records onto them, then delete the
-- duplicate location rows.

CREATE TEMP TABLE tmp_oxy_location_merge_plan (
    winner_id INTEGER NOT NULL,
    loser_id  INTEGER NOT NULL,
    PRIMARY KEY (winner_id, loser_id)
) ON COMMIT DROP;

INSERT INTO tmp_oxy_location_merge_plan(winner_id, loser_id)
SELECT DISTINCT winner.entity_id, loser.entity_id
FROM (
    VALUES
        ('https://hyperbaric.app/clinic/oxyhealthcare-leeds', 'menu-enrichment://0f7f3298de8f2a7442ee'),
        ('https://hyperbaric.app/clinic/oxyhealthcare-leeds', 'https://www.yorkshire.com/leeds/services/doctors/oxyhealthcare-leeds'),
        ('https://hyperbaric.app/clinic/oxyhealthcare-sheffield', 'menu-enrichment://e8e99177a28884017e73'),
        ('https://hyperbaric.app/clinic/oxyhealthcare-glasgow', 'menu-enrichment://4f2b1d430dc4663fa760')
) AS links(winner_source_url, loser_source_url)
JOIN __CANONICAL_SCHEMA__.source_records winner
  ON winner.entity_type = 'location'
 AND winner.source_url = links.winner_source_url
JOIN __CANONICAL_SCHEMA__.source_records loser
  ON loser.entity_type = 'location'
 AND loser.source_url = links.loser_source_url
WHERE winner.entity_id <> loser.entity_id
ON CONFLICT DO NOTHING;

DELETE FROM tmp_oxy_location_merge_plan plan
WHERE NOT EXISTS (SELECT 1 FROM __CANONICAL_SCHEMA__.locations l WHERE l.id = plan.winner_id)
   OR NOT EXISTS (SELECT 1 FROM __CANONICAL_SCHEMA__.locations l WHERE l.id = plan.loser_id);

CREATE TEMP TABLE tmp_oxy_location_merge_winners AS
SELECT DISTINCT winner_id
FROM tmp_oxy_location_merge_plan;

WITH loser_stats AS (
    SELECT
        plan.winner_id,
        MAX(loser.rating) FILTER (WHERE loser.rating IS NOT NULL) AS rating,
        MAX(loser.review_count) FILTER (WHERE loser.review_count IS NOT NULL) AS review_count
    FROM tmp_oxy_location_merge_plan plan
    JOIN __CANONICAL_SCHEMA__.locations loser ON loser.id = plan.loser_id
    GROUP BY plan.winner_id
)
UPDATE __CANONICAL_SCHEMA__.locations winner
SET
    rating = COALESCE(winner.rating, loser_stats.rating),
    review_count = CASE
        WHEN winner.review_count IS NULL THEN loser_stats.review_count
        WHEN loser_stats.review_count IS NULL THEN winner.review_count
        ELSE GREATEST(winner.review_count, loser_stats.review_count)
    END
FROM loser_stats
WHERE winner.id = loser_stats.winner_id;

DELETE FROM __CANONICAL_SCHEMA__.entity_tags tag
USING tmp_oxy_location_merge_plan plan
WHERE tag.entity_type = 'location'
  AND tag.entity_id = plan.loser_id
  AND (
      EXISTS (
          SELECT 1
          FROM __CANONICAL_SCHEMA__.entity_tags winner_tag
          WHERE winner_tag.entity_type = 'location'
            AND winner_tag.entity_id = plan.winner_id
            AND winner_tag.tag_id = tag.tag_id
      )
      OR EXISTS (
          SELECT 1
          FROM __CANONICAL_SCHEMA__.entity_tags other_tag
          JOIN tmp_oxy_location_merge_plan other_plan
            ON other_plan.winner_id = plan.winner_id
           AND other_plan.loser_id = other_tag.entity_id
          WHERE other_tag.entity_type = 'location'
            AND other_tag.tag_id = tag.tag_id
            AND other_tag.id < tag.id
      )
  );

UPDATE __CANONICAL_SCHEMA__.entity_tags tag
SET entity_id = plan.winner_id
FROM tmp_oxy_location_merge_plan plan
WHERE tag.entity_type = 'location'
  AND tag.entity_id = plan.loser_id;

UPDATE __CANONICAL_SCHEMA__.offerings winner_offering
SET
    treatment_id = COALESCE(winner_offering.treatment_id, loser_offering.treatment_id),
    price_amount = COALESCE(winner_offering.price_amount, loser_offering.price_amount),
    price_currency = COALESCE(winner_offering.price_currency, loser_offering.price_currency),
    source_offer_url = COALESCE(winner_offering.source_offer_url, loser_offering.source_offer_url)
FROM __CANONICAL_SCHEMA__.offerings loser_offering
JOIN tmp_oxy_location_merge_plan plan ON plan.loser_id = loser_offering.location_id
WHERE winner_offering.location_id = plan.winner_id
  AND winner_offering.source_id IS NOT DISTINCT FROM loser_offering.source_id
  AND winner_offering.raw_name IS NOT DISTINCT FROM loser_offering.raw_name;

DELETE FROM __CANONICAL_SCHEMA__.offerings loser_offering
USING tmp_oxy_location_merge_plan plan
WHERE loser_offering.location_id = plan.loser_id
  AND EXISTS (
      SELECT 1
      FROM __CANONICAL_SCHEMA__.offerings winner_offering
      WHERE winner_offering.location_id = plan.winner_id
        AND winner_offering.source_id IS NOT DISTINCT FROM loser_offering.source_id
        AND winner_offering.raw_name IS NOT DISTINCT FROM loser_offering.raw_name
  );

DELETE FROM __CANONICAL_SCHEMA__.offerings loser_offering
USING tmp_oxy_location_merge_plan plan
WHERE loser_offering.location_id = plan.loser_id
  AND EXISTS (
      SELECT 1
      FROM __CANONICAL_SCHEMA__.offerings other_offering
      JOIN tmp_oxy_location_merge_plan other_plan
        ON other_plan.winner_id = plan.winner_id
       AND other_plan.loser_id = other_offering.location_id
      WHERE other_offering.source_id IS NOT DISTINCT FROM loser_offering.source_id
        AND other_offering.raw_name IS NOT DISTINCT FROM loser_offering.raw_name
        AND other_offering.id <> loser_offering.id
        AND (
            (other_offering.price_amount IS NOT NULL AND loser_offering.price_amount IS NULL)
            OR (
                (other_offering.price_amount IS NULL) = (loser_offering.price_amount IS NULL)
                AND other_offering.id < loser_offering.id
            )
        )
  );

UPDATE __CANONICAL_SCHEMA__.offerings offering
SET location_id = plan.winner_id
FROM tmp_oxy_location_merge_plan plan
WHERE offering.location_id = plan.loser_id;

DELETE FROM __CANONICAL_SCHEMA__.offerings unpriced
USING __CANONICAL_SCHEMA__.offerings priced, tmp_oxy_location_merge_winners winners
WHERE unpriced.location_id = winners.winner_id
  AND priced.location_id = unpriced.location_id
  AND unpriced.id <> priced.id
  AND unpriced.price_amount IS NULL
  AND priced.price_amount IS NOT NULL
  AND (
      (
          unpriced.treatment_id IS NOT NULL
          AND priced.treatment_id = unpriced.treatment_id
      )
      OR regexp_replace(lower(COALESCE(unpriced.raw_name, '')), '[^a-z0-9]+', '', 'g')
       = regexp_replace(lower(COALESCE(priced.raw_name, '')), '[^a-z0-9]+', '', 'g')
  );

DELETE FROM __CANONICAL_SCHEMA__.offerings unpriced
USING tmp_oxy_location_merge_winners winners
WHERE unpriced.location_id = winners.winner_id
  AND unpriced.price_amount IS NULL
  AND EXISTS (
      SELECT 1
      FROM __CANONICAL_SCHEMA__.offerings priced
      WHERE priced.location_id = unpriced.location_id
        AND priced.price_amount IS NOT NULL
  );

DELETE FROM __CANONICAL_SCHEMA__.affiliations affiliation
USING tmp_oxy_location_merge_plan plan
WHERE affiliation.location_id = plan.loser_id
  AND (
      EXISTS (
          SELECT 1
          FROM __CANONICAL_SCHEMA__.affiliations winner_affiliation
          WHERE winner_affiliation.location_id = plan.winner_id
            AND winner_affiliation.practitioner_id = affiliation.practitioner_id
            AND winner_affiliation.org_id IS NOT DISTINCT FROM affiliation.org_id
      )
      OR EXISTS (
          SELECT 1
          FROM __CANONICAL_SCHEMA__.affiliations other_affiliation
          JOIN tmp_oxy_location_merge_plan other_plan
            ON other_plan.winner_id = plan.winner_id
           AND other_plan.loser_id = other_affiliation.location_id
          WHERE other_affiliation.practitioner_id = affiliation.practitioner_id
            AND other_affiliation.org_id IS NOT DISTINCT FROM affiliation.org_id
            AND other_affiliation.id < affiliation.id
      )
  );

UPDATE __CANONICAL_SCHEMA__.affiliations affiliation
SET location_id = plan.winner_id
FROM tmp_oxy_location_merge_plan plan
WHERE affiliation.location_id = plan.loser_id;

UPDATE __CANONICAL_SCHEMA__.images image
SET entity_id = plan.winner_id
FROM tmp_oxy_location_merge_plan plan
WHERE image.entity_type = 'location'
  AND image.entity_id = plan.loser_id;

DELETE FROM __CANONICAL_SCHEMA__.images image
USING tmp_oxy_location_merge_winners winners
WHERE image.entity_type = 'location'
  AND image.entity_id = winners.winner_id
  AND image.id NOT IN (
      SELECT MIN(keep_image.id)
      FROM __CANONICAL_SCHEMA__.images keep_image
      WHERE keep_image.entity_type = 'location'
        AND keep_image.entity_id = winners.winner_id
      GROUP BY
        COALESCE(keep_image.content_sha256, ''),
        COALESCE(keep_image.blob_url, ''),
        COALESCE(keep_image.local_path, ''),
        COALESCE(keep_image.image_url, '')
  );

UPDATE __CANONICAL_SCHEMA__.reviews review
SET location_id = plan.winner_id
FROM tmp_oxy_location_merge_plan plan
WHERE review.location_id = plan.loser_id;

DELETE FROM __CANONICAL_SCHEMA__.external_place_matches match
USING tmp_oxy_location_merge_plan plan
WHERE match.location_id = plan.loser_id
  AND (
      EXISTS (
          SELECT 1
          FROM __CANONICAL_SCHEMA__.external_place_matches winner_match
          WHERE winner_match.location_id = plan.winner_id
            AND winner_match.provider = match.provider
      )
      OR EXISTS (
          SELECT 1
          FROM __CANONICAL_SCHEMA__.external_place_matches other_match
          JOIN tmp_oxy_location_merge_plan other_plan
            ON other_plan.winner_id = plan.winner_id
           AND other_plan.loser_id = other_match.location_id
          WHERE other_match.provider = match.provider
            AND other_match.location_id < match.location_id
      )
  );

UPDATE __CANONICAL_SCHEMA__.external_place_matches match
SET location_id = plan.winner_id
FROM tmp_oxy_location_merge_plan plan
WHERE match.location_id = plan.loser_id;

DELETE FROM __CANONICAL_SCHEMA__.external_reviews loser_review
USING tmp_oxy_location_merge_plan plan
WHERE loser_review.location_id = plan.loser_id
  AND EXISTS (
      SELECT 1
      FROM __CANONICAL_SCHEMA__.external_reviews winner_review
      WHERE winner_review.location_id = plan.winner_id
        AND winner_review.provider = loser_review.provider
        AND winner_review.provider_review_id = loser_review.provider_review_id
  );

UPDATE __CANONICAL_SCHEMA__.external_reviews review
SET location_id = plan.winner_id
FROM tmp_oxy_location_merge_plan plan
WHERE review.location_id = plan.loser_id;

UPDATE __CANONICAL_SCHEMA__.source_records source_record
SET entity_id = plan.winner_id
FROM tmp_oxy_location_merge_plan plan
WHERE source_record.entity_type = 'location'
  AND source_record.entity_id = plan.loser_id;

DELETE FROM __CANONICAL_SCHEMA__.search_index search_row
USING tmp_oxy_location_merge_plan plan
WHERE search_row.entity_type = 'location'
  AND search_row.entity_id = plan.loser_id;

DELETE FROM __CANONICAL_SCHEMA__.locations location
USING tmp_oxy_location_merge_plan plan
WHERE location.id = plan.loser_id;

CREATE TEMP TABLE tmp_oxy_location_treatment_text AS
SELECT
    offering.location_id,
    string_agg(
        DISTINCT COALESCE(treatment.canonical_name, offering.raw_name),
        ' '
        ORDER BY COALESCE(treatment.canonical_name, offering.raw_name)
    ) AS treatments
FROM __CANONICAL_SCHEMA__.offerings offering
LEFT JOIN __CANONICAL_SCHEMA__.treatments treatment ON treatment.id = offering.treatment_id
JOIN tmp_oxy_location_merge_winners winners ON winners.winner_id = offering.location_id
GROUP BY offering.location_id;

UPDATE __CANONICAL_SCHEMA__.search_index search_row
SET
    name = location.name,
    locality = location.locality,
    country = COALESCE(location.country_name, location.country_code),
    treatments = COALESCE(treatment_text.treatments, search_row.treatments)
FROM __CANONICAL_SCHEMA__.locations location
LEFT JOIN tmp_oxy_location_treatment_text treatment_text ON treatment_text.location_id = location.id
WHERE search_row.entity_type = 'location'
  AND search_row.entity_id = location.id
  AND location.id IN (SELECT winner_id FROM tmp_oxy_location_merge_winners);

INSERT INTO __CANONICAL_SCHEMA__.search_index(entity_type, entity_id, name, locality, country, treatments, specialties, tags)
SELECT
    'location',
    location.id,
    location.name,
    location.locality,
    COALESCE(location.country_name, location.country_code),
    COALESCE(treatment_text.treatments, ''),
    '',
    ''
FROM __CANONICAL_SCHEMA__.locations location
LEFT JOIN tmp_oxy_location_treatment_text treatment_text ON treatment_text.location_id = location.id
WHERE location.id IN (SELECT winner_id FROM tmp_oxy_location_merge_winners)
  AND NOT EXISTS (
      SELECT 1
      FROM __CANONICAL_SCHEMA__.search_index search_row
      WHERE search_row.entity_type = 'location'
        AND search_row.entity_id = location.id
  );
