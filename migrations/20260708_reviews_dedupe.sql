BEGIN;

CREATE SCHEMA IF NOT EXISTS fountain_raw;

DROP TABLE IF EXISTS fountain_raw.reviews_dedupe_deleted_20260708;
DROP TABLE IF EXISTS fountain_raw.reviews_dedupe_report_20260708;

CREATE TABLE fountain_raw.reviews_dedupe_deleted_20260708 AS
WITH keyed AS (
  SELECT
    r.*,
    regexp_replace(lower(btrim(r.text)), '\s+', ' ', 'g') AS normalized_text,
    (
      (r.rating IS NOT NULL)::integer
      + (r.review_date IS NOT NULL)::integer
      + (r.raw_payload IS NOT NULL)::integer
    ) AS data_score
  FROM fountain.reviews r
),
ranked AS (
  SELECT
    keyed.*,
    first_value(id) OVER (
      PARTITION BY location_id, author, normalized_text
      ORDER BY
        data_score DESC,
        (rating IS NOT NULL) DESC,
        (review_date IS NOT NULL) DESC,
        (raw_payload IS NOT NULL) DESC,
        id ASC
    ) AS kept_review_id,
    row_number() OVER (
      PARTITION BY location_id, author, normalized_text
      ORDER BY
        data_score DESC,
        (rating IS NOT NULL) DESC,
        (review_date IS NOT NULL) DESC,
        (raw_payload IS NOT NULL) DESC,
        id ASC
    ) AS dedupe_rank,
    count(*) OVER (PARTITION BY location_id, author, normalized_text) AS dedupe_group_size
  FROM keyed
)
SELECT
  *,
  now() AS backed_up_at
FROM ranked
WHERE dedupe_group_size > 1
  AND dedupe_rank > 1;

CREATE TABLE fountain_raw.reviews_dedupe_report_20260708 AS
WITH keyed AS (
  SELECT
    r.id,
    r.location_id,
    r.author,
    r.rating,
    r.review_date,
    r.raw_payload,
    regexp_replace(lower(btrim(r.text)), '\s+', ' ', 'g') AS normalized_text,
    (
      (r.rating IS NOT NULL)::integer
      + (r.review_date IS NOT NULL)::integer
      + (r.raw_payload IS NOT NULL)::integer
    ) AS data_score
  FROM fountain.reviews r
),
ranked AS (
  SELECT
    keyed.*,
    row_number() OVER (
      PARTITION BY location_id, author, normalized_text
      ORDER BY
        data_score DESC,
        (rating IS NOT NULL) DESC,
        (review_date IS NOT NULL) DESC,
        (raw_payload IS NOT NULL) DESC,
        id ASC
    ) AS dedupe_rank,
    count(*) OVER (PARTITION BY location_id, author, normalized_text) AS dedupe_group_size
  FROM keyed
)
SELECT
  count(*) FILTER (WHERE dedupe_group_size > 1 AND dedupe_rank = 1)::integer AS groups_found,
  count(*) FILTER (WHERE dedupe_group_size > 1 AND dedupe_rank > 1)::integer AS rows_deleted,
  (SELECT count(*)::integer FROM fountain.reviews) AS reviews_before,
  ((SELECT count(*)::integer FROM fountain.reviews) - count(*) FILTER (WHERE dedupe_group_size > 1 AND dedupe_rank > 1)::integer) AS reviews_after,
  now() AS executed_at
FROM ranked;

DELETE FROM fountain.reviews r
USING fountain_raw.reviews_dedupe_deleted_20260708 d
WHERE r.id = d.id;

ANALYZE fountain.reviews;
ANALYZE fountain.external_place_matches;

COMMIT;
