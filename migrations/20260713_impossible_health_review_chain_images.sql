BEGIN;

SELECT fountain.set_mutation_actor(
  'b5c71897-83d0-4c30-a7a3-202607130017'::uuid,
  'impossible_health_review_chain_images_20260713'
);

-- Reviewer-confirmed branches share the same brand/menu. Reuse the already
-- downloaded and validated base image rather than downloading duplicate blobs.
WITH targets(location_id, base_location_id) AS (
  VALUES
    (14680, 14607),
    (14681, 14607),
    (14682, 14664),
    (14683, 14664),
    (14684, 14664),
    (14685, 14664),
    (14686, 14664),
    (14687, 14664),
    (9078, 14640),
    (14688, 14640),
    (14689, 14640)
), base_images AS (
  SELECT DISTINCT ON (target.location_id)
    target.location_id,
    image.image_url,
    image.blob_url,
    image.content_sha256,
    image.alt,
    image.source_id,
    image.data_origin,
    image.verification_status,
    image.image_kind
  FROM targets target
  JOIN fountain.images image
    ON image.entity_type = 'location'
   AND image.entity_id = target.base_location_id
   AND image.status = 'active'
   AND image.deleted_at IS NULL
  ORDER BY target.location_id, image.id
)
INSERT INTO fountain.images (
  id, entity_type, entity_id, image_url, blob_url, content_sha256, alt,
  source_id, status, data_origin, verification_status, image_kind
)
SELECT
  nextval(pg_get_serial_sequence('fountain.images', 'id'))::integer,
  'location', base.location_id, base.image_url, base.blob_url,
  base.content_sha256, base.alt, base.source_id, 'active',
  base.data_origin, base.verification_status, base.image_kind
FROM base_images base
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.images existing
  WHERE existing.entity_type = 'location'
    AND existing.entity_id = base.location_id
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
);

COMMIT;
