BEGIN;

DROP TABLE IF EXISTS fountain_raw.impossible_health_final_cohort_20260713;

CREATE TABLE fountain_raw.impossible_health_final_cohort_20260713 AS
WITH reviewed AS (
  SELECT
    quality.candidate_id AS location_id,
    quality.candidate_id AS source_candidate_id,
    CASE
      WHEN quality.decision = 'ready' THEN 'pipeline_quality_gate'
      ELSE decision.decision_source
    END AS approval_source
  FROM fountain_raw.impossible_health_review_quality_20260713 quality
  LEFT JOIN fountain_raw.impossible_health_review_decisions_20260713 decision
    USING (candidate_id)
  WHERE quality.decision = 'ready' OR decision.decision = 'approved'
), branches AS (
  SELECT DISTINCT ON (record.entity_id)
    record.entity_id AS location_id,
    CASE
      WHEN record.raw_ref = 'review-note:impossible-health:alive' THEN 14607
      WHEN record.raw_ref = 'review-note:impossible-health:healios' THEN 14664
      WHEN record.raw_ref = 'review-note:impossible-health:life' THEN 14640
    END AS source_candidate_id,
    'reviewer_chain_branch'::text AS approval_source
  FROM fountain.source_records record
  WHERE record.raw_ref LIKE 'review-note:impossible-health:%'
    AND NOT EXISTS (SELECT 1 FROM reviewed WHERE reviewed.location_id = record.entity_id)
  ORDER BY record.entity_id, record.id
), cohort AS (
  SELECT * FROM reviewed
  UNION ALL
  SELECT * FROM branches
), facts AS (
  SELECT
    cohort.*,
    location.name,
    location.address,
    location.locality,
    location.region,
    location.postal_code,
    location.country_code,
    location.phone,
    location.email,
    location.website,
    location.slug,
    location.latitude,
    location.longitude,
    location.org_id,
    location.status,
    COALESCE(offerings.offering_count, 0) AS offering_count,
    COALESCE(offerings.priced_offering_count, 0) AS priced_offering_count,
    COALESCE(images.image_count, 0) AS image_count
  FROM cohort
  JOIN fountain.locations location ON location.id = cohort.location_id
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS offering_count,
      count(*) FILTER (WHERE offering.price_amount IS NOT NULL)::integer AS priced_offering_count
    FROM fountain.offerings offering
    WHERE offering.location_id = cohort.location_id
      AND offering.status = 'active'
      AND offering.deleted_at IS NULL
  ) offerings ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS image_count
    FROM fountain.images image
    WHERE image.entity_type = 'location'
      AND image.entity_id = cohort.location_id
      AND image.status = 'active'
      AND image.deleted_at IS NULL
  ) images ON true
), evaluated AS (
  SELECT
    facts.*,
    array_remove(ARRAY[
      CASE WHEN nullif(btrim(facts.address), '') IS NULL THEN 'missing_address' END,
      CASE WHEN nullif(btrim(facts.phone), '') IS NULL THEN 'missing_phone' END,
      CASE WHEN nullif(btrim(facts.website), '') IS NULL THEN 'missing_website' END,
      CASE WHEN facts.offering_count = 0 THEN 'missing_offerings' END,
      CASE WHEN facts.image_count = 0 THEN 'missing_image' END
    ], NULL) AS blockers,
    array_remove(ARRAY[
      CASE WHEN nullif(btrim(facts.email), '') IS NULL THEN 'email_unavailable_optional' END,
      CASE WHEN facts.priced_offering_count = 0 THEN 'approved_without_public_price' END,
      CASE WHEN facts.latitude IS NULL OR facts.longitude IS NULL THEN 'coordinates_unresolved_nonblocking' END
    ], NULL) AS advisories
  FROM facts
)
SELECT
  evaluated.*,
  CASE WHEN cardinality(blockers) = 0 THEN 'ready' ELSE 'held_back' END AS final_decision,
  now() AS finalized_at
FROM evaluated;

ALTER TABLE fountain_raw.impossible_health_final_cohort_20260713
  ADD PRIMARY KEY (location_id);

UPDATE fountain.locations location
SET status = CASE WHEN final.final_decision = 'ready' THEN 'active' ELSE 'draft' END
FROM fountain_raw.impossible_health_final_cohort_20260713 final
WHERE location.id = final.location_id
  AND location.status IS DISTINCT FROM CASE WHEN final.final_decision = 'ready' THEN 'active' ELSE 'draft' END;

COMMIT;
