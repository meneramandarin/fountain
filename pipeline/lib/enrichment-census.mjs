import { createHash } from "node:crypto";

import { query as defaultQuery } from "./db.mjs";

export const ENRICHMENT_CENSUS_VERSION = 1;
export const ENRICHMENT_UNATTRIBUTED_SOURCE = "_unattributed";
export const ENRICHMENT_UNKNOWN_COUNTRY = "_UNKNOWN";

export const ENRICHMENT_TASK_TYPES = Object.freeze([
  "contact_fill",
  "geocode",
  "image_harvest",
  "menu_extract",
  "reviews_fetch",
]);

export const ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE = "image_classify";
export const ENRICHMENT_CENSUS_CAMPAIGN = "enrichment_census_v1";
export const ENRICHMENT_MENU_PROMPT_VERSION = "menu-extract-v1";
export const ENRICHMENT_MENU_GAP_KINDS = Object.freeze([
  "menu_missing",
  "prices_missing",
]);
export const ENRICHMENT_POST_CONTACT_TASK_TYPES = Object.freeze([
  "geocode",
  "image_harvest",
  "menu_extract",
]);

export const ENRICHMENT_FIELDS = Object.freeze([
  "website",
  "phone",
  "email",
  "address",
  "locality",
  "region",
  "postal_code",
  "country_code",
  "latitude",
  "longitude",
  "geocode",
  "images",
  "menus",
  "reviews",
]);

const FIELD_PROPERTY = Object.freeze({
  website: "hasWebsite",
  phone: "hasPhone",
  email: "hasEmail",
  address: "hasAddress",
  locality: "hasLocality",
  region: "hasRegion",
  postal_code: "hasPostalCode",
  country_code: "hasCountryCode",
  latitude: "hasLatitude",
  longitude: "hasLongitude",
  geocode: "hasGeocode",
  images: "hasImages",
  menus: "hasMenus",
  reviews: "hasReviews",
});

const ACTIVE_NON_SUPPRESSED_CTES = `
  active_non_suppressed AS MATERIALIZED (
    SELECT
      location.id,
      location.name,
      location.country_code,
      location.website,
      location.phone,
      location.email,
      location.address,
      location.locality,
      location.region,
      location.postal_code,
      location.latitude,
      location.longitude,
      location.is_virtual
    FROM fountain.locations location
    WHERE location.status = 'active'
      AND location.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM fountain.source_records source_record
        JOIN fountain.sources source ON source.id = source_record.source_id
        JOIN fountain_raw.suppressed_source_listings suppressed
          ON suppressed.source_slug = source.slug
         AND suppressed.source_listing_id = source_record.source_listing_id
        WHERE source_record.entity_type = 'location'
          AND source_record.entity_id = location.id
          AND source_record.source_listing_id IS NOT NULL
      )
  ),
  image_counts AS MATERIALIZED (
    SELECT
      image.entity_id AS location_id,
      count(*)::integer AS image_count,
      count(*) FILTER (WHERE image.image_kind IS NULL)::integer AS unclassified_image_count
    FROM fountain.images image
    WHERE image.entity_type = 'location'
      AND image.status = 'active'
      AND image.deleted_at IS NULL
    GROUP BY image.entity_id
  ),
  menu_counts AS MATERIALIZED (
    SELECT
      offering.location_id,
      count(*)::integer AS menu_count,
      count(*) FILTER (WHERE offering.price_amount IS NOT NULL)::integer AS priced_count
    FROM fountain.offerings offering
    WHERE offering.status = 'active'
      AND offering.deleted_at IS NULL
    GROUP BY offering.location_id
  ),
  menu_attempts AS MATERIALIZED (
    SELECT
      queue.entity_id AS location_id,
      true AS menu_extraction_attempted
    FROM fountain_ops.task_queue queue
    WHERE queue.task_type = 'menu_extract'
      AND queue.entity_type = 'location'
      AND queue.payload->>'campaign' = '${ENRICHMENT_CENSUS_CAMPAIGN}'
      AND COALESCE(
        queue.payload->>'prompt_version',
        '${ENRICHMENT_MENU_PROMPT_VERSION}'
      ) = '${ENRICHMENT_MENU_PROMPT_VERSION}'
    GROUP BY queue.entity_id
  ),
  review_counts AS MATERIALIZED (
    SELECT review.location_id, count(*)::integer AS review_count
    FROM fountain.reviews review
    WHERE review.location_id IS NOT NULL
      AND review.status = 'active'
      AND review.deleted_at IS NULL
    GROUP BY review.location_id
  ),
  place_matches AS MATERIALIZED (
    SELECT place_match.location_id, count(*)::integer AS place_match_count
    FROM fountain.external_place_matches place_match
    WHERE nullif(btrim(place_match.provider_place_id), '') IS NOT NULL
    GROUP BY place_match.location_id
  ),
  source_lists AS MATERIALIZED (
    SELECT
      source_record.entity_id AS location_id,
      array_agg(DISTINCT source.slug ORDER BY source.slug) AS source_slugs
    FROM fountain.source_records source_record
    JOIN fountain.sources source ON source.id = source_record.source_id
    WHERE source_record.entity_type = 'location'
    GROUP BY source_record.entity_id
  ),
  coverage AS MATERIALIZED (
    SELECT
      location.id,
      location.name,
      upper(COALESCE(nullif(btrim(location.country_code), ''), '${ENRICHMENT_UNKNOWN_COUNTRY}'))
        AS country_code,
      location.is_virtual,
      COALESCE(source_lists.source_slugs, ARRAY[]::text[]) AS source_slugs,
      nullif(btrim(location.website), '') IS NOT NULL AS has_website,
      nullif(btrim(location.phone), '') IS NOT NULL AS has_phone,
      nullif(btrim(location.email), '') IS NOT NULL AS has_email,
      nullif(btrim(location.address), '') IS NOT NULL AS has_address,
      nullif(btrim(location.locality), '') IS NOT NULL AS has_locality,
      nullif(btrim(location.region), '') IS NOT NULL AS has_region,
      nullif(btrim(location.postal_code), '') IS NOT NULL AS has_postal_code,
      nullif(btrim(location.country_code), '') IS NOT NULL AS has_country_code,
      location.latitude IS NOT NULL
        AND location.latitude BETWEEN -90 AND 90 AS has_latitude,
      location.longitude IS NOT NULL
        AND location.longitude BETWEEN -180 AND 180 AS has_longitude,
      location.latitude IS NOT NULL
        AND location.latitude BETWEEN -90 AND 90
        AND location.longitude IS NOT NULL
        AND location.longitude BETWEEN -180 AND 180 AS has_geocode,
      COALESCE(image_counts.image_count, 0) AS image_count,
      COALESCE(image_counts.unclassified_image_count, 0) AS unclassified_image_count,
      COALESCE(menu_counts.menu_count, 0) AS menu_count,
      COALESCE(menu_counts.priced_count, 0) AS priced_count,
      COALESCE(menu_attempts.menu_extraction_attempted, false) AS menu_extraction_attempted,
      COALESCE(review_counts.review_count, 0) AS review_count,
      COALESCE(place_matches.place_match_count, 0) AS place_match_count
    FROM active_non_suppressed location
    LEFT JOIN image_counts ON image_counts.location_id = location.id
    LEFT JOIN menu_counts ON menu_counts.location_id = location.id
    LEFT JOIN menu_attempts ON menu_attempts.location_id = location.id
    LEFT JOIN review_counts ON review_counts.location_id = location.id
    LEFT JOIN place_matches ON place_matches.location_id = location.id
    LEFT JOIN source_lists ON source_lists.location_id = location.id
  )
`;

export const ENRICHMENT_CENSUS_SQL = `
  WITH
  ${ACTIVE_NON_SUPPRESSED_CTES}
  SELECT *
  FROM coverage
  ORDER BY id
`;

export const ENRICHMENT_ENQUEUE_SQL = `
  WITH
  gate_lock AS MATERIALIZED (
    SELECT
      pg_advisory_xact_lock(hashtextextended('fountain:enrichment:enqueue', 0)),
      $3::text AS snapshot_digest
  ),
  ${ACTIVE_NON_SUPPRESSED_CTES},
  live_candidates AS MATERIALIZED (
    SELECT 'contact_fill'::text AS task_type, id AS entity_id
    FROM coverage
    WHERE (NOT has_website OR NOT has_phone OR NOT has_email OR NOT has_address)
      AND nullif(btrim(name), '') IS NOT NULL
    UNION ALL
    SELECT 'geocode', id
    FROM coverage
    WHERE NOT is_virtual AND NOT has_geocode AND (has_address OR has_locality)
    UNION ALL
    SELECT 'image_harvest', id
    FROM coverage
    WHERE NOT is_virtual AND image_count = 0 AND has_website
    UNION ALL
    SELECT 'menu_extract', id
    FROM coverage
    WHERE has_website
      AND (
        (menu_count = 0 AND NOT menu_extraction_attempted)
        OR (menu_count > 0 AND priced_count = 0 AND NOT menu_extraction_attempted)
      )
    UNION ALL
    SELECT 'reviews_fetch', id
    FROM coverage
    WHERE review_count < 3
  ),
  expected AS MATERIALIZED (
    SELECT task_type, entity_id, priority, max_attempts, payload
    FROM jsonb_to_recordset($1::jsonb) AS expected_row(
      task_type text,
      entity_id integer,
      priority integer,
      max_attempts integer,
      payload jsonb
    )
  ),
  drift AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM (
      (SELECT task_type, entity_id FROM expected
       EXCEPT
       SELECT task_type, entity_id FROM live_candidates)
      UNION ALL
      (SELECT task_type, entity_id FROM live_candidates
       EXCEPT
       SELECT task_type, entity_id FROM expected)
    ) changed
  ),
  active_conflicts AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM expected
    JOIN fountain_ops.task_queue queue
      ON queue.task_type = expected.task_type
     AND queue.entity_type = 'location'
     AND queue.entity_id = expected.entity_id
     AND queue.status IN ('pending', 'claimed')
  ),
  readiness AS MATERIALIZED (
    SELECT
      (SELECT count FROM drift) = 0
      AND (SELECT count FROM active_conflicts) = 0 AS ready
  ),
  inserted AS (
    INSERT INTO fountain_ops.task_queue (
      task_type,
      entity_type,
      entity_id,
      priority,
      payload,
      max_attempts,
      run_id
    )
    SELECT
      expected.task_type,
      'location',
      expected.entity_id,
      expected.priority,
      expected.payload,
      expected.max_attempts,
      $2
    FROM expected
    CROSS JOIN readiness
    CROSS JOIN gate_lock
    WHERE readiness.ready
    ORDER BY expected.task_type, expected.entity_id
    RETURNING task_type, entity_id
  )
  SELECT
    (SELECT ready FROM readiness) AS ready,
    (SELECT count(*)::integer FROM expected) AS expected_count,
    (SELECT count(*)::integer FROM live_candidates) AS live_count,
    (SELECT count FROM drift) AS drift_count,
    (SELECT count FROM active_conflicts) AS active_conflict_count,
    (SELECT count(*)::integer FROM inserted) AS inserted_count,
    COALESCE(
      (SELECT jsonb_object_agg(task_type, count ORDER BY task_type)
       FROM (
         SELECT task_type, count(*)::integer AS count
         FROM inserted
         GROUP BY task_type
       ) inserted_counts),
      '{}'::jsonb
    ) AS inserted_by_task
`;

export const ENRICHMENT_IMAGE_CLASSIFY_ENQUEUE_SQL = `
  WITH
  gate_lock AS MATERIALIZED (
    SELECT
      pg_advisory_xact_lock(hashtextextended('fountain:enrichment:image-classify:enqueue', 0)),
      $3::text AS snapshot_digest
  ),
  ${ACTIVE_NON_SUPPRESSED_CTES},
  live_candidates AS MATERIALIZED (
    SELECT '${ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE}'::text AS task_type, id AS entity_id
    FROM coverage
    WHERE unclassified_image_count > 0
  ),
  expected AS MATERIALIZED (
    SELECT task_type, entity_id, priority, max_attempts, payload
    FROM jsonb_to_recordset($1::jsonb) AS expected_row(
      task_type text,
      entity_id integer,
      priority integer,
      max_attempts integer,
      payload jsonb
    )
  ),
  drift AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM (
      (SELECT task_type, entity_id FROM expected
       EXCEPT
       SELECT task_type, entity_id FROM live_candidates)
      UNION ALL
      (SELECT task_type, entity_id FROM live_candidates
       EXCEPT
       SELECT task_type, entity_id FROM expected)
    ) changed
  ),
  active_conflicts AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM expected
    JOIN fountain_ops.task_queue queue
      ON queue.task_type = expected.task_type
     AND queue.entity_type = 'location'
     AND queue.entity_id = expected.entity_id
     AND queue.status IN ('pending', 'claimed')
  ),
  readiness AS MATERIALIZED (
    SELECT
      (SELECT count FROM drift) = 0
      AND (SELECT count FROM active_conflicts) = 0 AS ready
  ),
  inserted AS (
    INSERT INTO fountain_ops.task_queue (
      task_type,
      entity_type,
      entity_id,
      priority,
      payload,
      max_attempts,
      run_id
    )
    SELECT
      expected.task_type,
      'location',
      expected.entity_id,
      expected.priority,
      expected.payload,
      expected.max_attempts,
      $2
    FROM expected
    CROSS JOIN readiness
    CROSS JOIN gate_lock
    WHERE readiness.ready
    ORDER BY expected.entity_id
    RETURNING task_type, entity_id
  )
  SELECT
    (SELECT ready FROM readiness) AS ready,
    (SELECT count(*)::integer FROM expected) AS expected_count,
    (SELECT count(*)::integer FROM live_candidates) AS live_count,
    (SELECT count FROM drift) AS drift_count,
    (SELECT count FROM active_conflicts) AS active_conflict_count,
    (SELECT count(*)::integer FROM inserted) AS inserted_count
`;

export const ENRICHMENT_POST_CONTACT_CANDIDATES_SQL = `
  WITH
  ${ACTIVE_NON_SUPPRESSED_CTES},
  stage_candidates AS MATERIALIZED (
    SELECT 'geocode'::text AS task_type, id AS entity_id, NULL::text AS gap_kind
    FROM coverage
    WHERE NOT is_virtual AND NOT has_geocode AND (has_address OR has_locality)
    UNION ALL
    SELECT 'image_harvest', id, NULL::text
    FROM coverage
    WHERE NOT is_virtual AND image_count = 0 AND has_website
    UNION ALL
    SELECT
      'menu_extract',
      id,
      CASE WHEN menu_count = 0 THEN 'menu_missing' ELSE 'prices_missing' END
    FROM coverage
    WHERE has_website
      AND (menu_count = 0 OR (menu_count > 0 AND priced_count = 0))
  )
  SELECT candidate.task_type, candidate.entity_id, candidate.gap_kind
  FROM stage_candidates candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM fountain_ops.task_queue queue
    WHERE queue.task_type = candidate.task_type
      AND queue.entity_type = 'location'
      AND queue.entity_id = candidate.entity_id
      AND queue.payload->>'campaign' = $1
      AND (
        candidate.task_type <> 'menu_extract'
        OR COALESCE(
          queue.payload->>'prompt_version',
          '${ENRICHMENT_MENU_PROMPT_VERSION}'
        ) = '${ENRICHMENT_MENU_PROMPT_VERSION}'
      )
  )
  ORDER BY candidate.task_type, candidate.entity_id
`;

export const ENRICHMENT_POST_CONTACT_ENQUEUE_SQL = `
  WITH
  gate_lock AS MATERIALIZED (
    SELECT
      pg_advisory_xact_lock(hashtextextended('fountain:enrichment:post-contact:enqueue', 0)),
      $3::text AS snapshot_digest
  ),
  ${ACTIVE_NON_SUPPRESSED_CTES},
  stage_candidates AS MATERIALIZED (
    SELECT 'geocode'::text AS task_type, id AS entity_id, NULL::text AS gap_kind
    FROM coverage
    WHERE NOT is_virtual AND NOT has_geocode AND (has_address OR has_locality)
    UNION ALL
    SELECT 'image_harvest', id, NULL::text
    FROM coverage
    WHERE NOT is_virtual AND image_count = 0 AND has_website
    UNION ALL
    SELECT
      'menu_extract',
      id,
      CASE WHEN menu_count = 0 THEN 'menu_missing' ELSE 'prices_missing' END
    FROM coverage
    WHERE has_website
      AND (menu_count = 0 OR (menu_count > 0 AND priced_count = 0))
  ),
  live_candidates AS MATERIALIZED (
    SELECT candidate.task_type, candidate.entity_id, candidate.gap_kind
    FROM stage_candidates candidate
    WHERE NOT EXISTS (
      SELECT 1
      FROM fountain_ops.task_queue queue
      WHERE queue.task_type = candidate.task_type
        AND queue.entity_type = 'location'
        AND queue.entity_id = candidate.entity_id
        AND queue.payload->>'campaign' = $4
        AND (
          candidate.task_type <> 'menu_extract'
          OR COALESCE(
            queue.payload->>'prompt_version',
            '${ENRICHMENT_MENU_PROMPT_VERSION}'
          ) = '${ENRICHMENT_MENU_PROMPT_VERSION}'
        )
    )
  ),
  expected AS MATERIALIZED (
    SELECT task_type, entity_id, priority, max_attempts, payload
    FROM jsonb_to_recordset($1::jsonb) AS expected_row(
      task_type text,
      entity_id integer,
      priority integer,
      max_attempts integer,
      payload jsonb
    )
  ),
  drift AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM (
      (SELECT task_type, entity_id, payload->>'gap_kind' AS gap_kind FROM expected
       EXCEPT
       SELECT task_type, entity_id, gap_kind FROM live_candidates)
      UNION ALL
      (SELECT task_type, entity_id, gap_kind FROM live_candidates
       EXCEPT
       SELECT task_type, entity_id, payload->>'gap_kind' AS gap_kind FROM expected)
    ) changed
  ),
  active_conflicts AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM expected
    JOIN fountain_ops.task_queue queue
      ON queue.task_type = expected.task_type
     AND queue.entity_type = 'location'
     AND queue.entity_id = expected.entity_id
     AND queue.status IN ('pending', 'claimed')
  ),
  readiness AS MATERIALIZED (
    SELECT
      (SELECT count FROM drift) = 0
      AND (SELECT count FROM active_conflicts) = 0 AS ready
  ),
  inserted AS (
    INSERT INTO fountain_ops.task_queue (
      task_type,
      entity_type,
      entity_id,
      priority,
      payload,
      max_attempts,
      run_id
    )
    SELECT
      expected.task_type,
      'location',
      expected.entity_id,
      expected.priority,
      expected.payload,
      expected.max_attempts,
      $2
    FROM expected
    CROSS JOIN readiness
    CROSS JOIN gate_lock
    WHERE readiness.ready
    ORDER BY expected.task_type, expected.entity_id
    RETURNING task_type, entity_id
  )
  SELECT
    (SELECT ready FROM readiness) AS ready,
    (SELECT count(*)::integer FROM expected) AS expected_count,
    (SELECT count(*)::integer FROM live_candidates) AS live_count,
    (SELECT count FROM drift) AS drift_count,
    (SELECT count FROM active_conflicts) AS active_conflict_count,
    (SELECT count(*)::integer FROM inserted) AS inserted_count,
    COALESCE(
      (SELECT jsonb_object_agg(task_type, count ORDER BY task_type)
       FROM (
         SELECT task_type, count(*)::integer AS count
         FROM inserted
         GROUP BY task_type
       ) inserted_counts),
      '{}'::jsonb
    ) AS inserted_by_task
`;

export const ENRICHMENT_MENU_PRICES_ACTIVE_TASKS_SQL = `
  SELECT
    queue.id::text AS task_id,
    queue.entity_id,
    queue.status,
    queue.run_id::text AS run_id,
    queue.payload
  FROM fountain_ops.task_queue queue
  WHERE queue.task_type = 'menu_extract'
    AND queue.entity_type = 'location'
    AND queue.status IN ('pending', 'claimed')
  ORDER BY queue.entity_id, queue.id
`;

export const ENRICHMENT_MENU_PRICES_ENQUEUE_SQL = `
  WITH
  gate_lock AS MATERIALIZED (
    SELECT
      pg_advisory_xact_lock(hashtextextended('fountain:enrichment:menu-prices:enqueue', 0)),
      $3::text AS snapshot_digest
  ),
  ${ACTIVE_NON_SUPPRESSED_CTES},
  live_menu_missing AS MATERIALIZED (
    SELECT id AS entity_id
    FROM coverage
    WHERE has_website AND menu_count = 0
  ),
  live_prices_missing AS MATERIALIZED (
    SELECT id AS entity_id
    FROM coverage
    WHERE has_website
      AND menu_count > 0
      AND priced_count = 0
      AND NOT menu_extraction_attempted
  ),
  expected AS MATERIALIZED (
    SELECT operation, task_id, entity_id, payload
    FROM jsonb_to_recordset($1::jsonb) AS expected_row(
      operation text,
      task_id bigint,
      entity_id integer,
      payload jsonb
    )
  ),
  expected_adoptions AS MATERIALIZED (
    SELECT task_id, entity_id, payload
    FROM expected
    WHERE operation = 'adopt'
  ),
  expected_insertions AS MATERIALIZED (
    SELECT entity_id, payload
    FROM expected
    WHERE operation = 'insert'
  ),
  invalid_expected AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM (
      SELECT operation, entity_id
      FROM expected
      GROUP BY operation, entity_id
      HAVING count(*) <> 1
      UNION ALL
      SELECT operation, entity_id
      FROM expected
      WHERE operation NOT IN ('adopt', 'insert')
        OR (operation = 'adopt' AND task_id IS NULL)
        OR (operation = 'insert' AND task_id IS NOT NULL)
    ) invalid
  ),
  expected_overlap AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM expected_adoptions adoption
    JOIN expected_insertions insertion USING (entity_id)
  ),
  adoption_drift AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM (
      (SELECT entity_id FROM expected_adoptions
       EXCEPT
       SELECT entity_id FROM live_menu_missing)
      UNION ALL
      (SELECT entity_id FROM live_menu_missing
       EXCEPT
       SELECT entity_id FROM expected_adoptions)
    ) changed
  ),
  insertion_drift AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM (
      (SELECT entity_id FROM expected_insertions
       EXCEPT
       SELECT entity_id FROM live_prices_missing)
      UNION ALL
      (SELECT entity_id FROM live_prices_missing
       EXCEPT
       SELECT entity_id FROM expected_insertions)
    ) changed
  ),
  pending_adoption_tasks AS MATERIALIZED (
    SELECT queue.id AS task_id, queue.entity_id
    FROM fountain_ops.task_queue queue
    JOIN live_menu_missing live USING (entity_id)
    WHERE queue.task_type = 'menu_extract'
      AND queue.entity_type = 'location'
      AND queue.status = 'pending'
      AND queue.payload->>'campaign' = $4
  ),
  adoption_queue_drift AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM (
      (SELECT task_id, entity_id FROM expected_adoptions
       EXCEPT
       SELECT task_id, entity_id FROM pending_adoption_tasks)
      UNION ALL
      (SELECT task_id, entity_id FROM pending_adoption_tasks
       EXCEPT
       SELECT task_id, entity_id FROM expected_adoptions)
    ) changed
  ),
  adoption_payload_conflicts AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM expected_adoptions expected_row
    JOIN fountain_ops.task_queue queue ON queue.id = expected_row.task_id
    WHERE queue.payload->>'campaign' IS DISTINCT FROM $4
      OR (
        queue.payload ? 'schema_version'
        AND queue.payload->>'schema_version' IS DISTINCT FROM '1'
      )
      OR (
        queue.payload ? 'coverage_task'
        AND queue.payload->>'coverage_task' IS DISTINCT FROM 'menu_extract'
      )
      OR (
        queue.payload ? 'prompt_version'
        AND queue.payload->>'prompt_version' IS DISTINCT FROM $5
      )
      OR (
        queue.payload ? 'gap_kind'
        AND queue.payload->>'gap_kind' IS DISTINCT FROM 'menu_missing'
      )
  ),
  active_scope_conflicts AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM expected expected_row
    JOIN fountain_ops.task_queue queue
      ON queue.task_type = 'menu_extract'
     AND queue.entity_type = 'location'
     AND queue.entity_id = expected_row.entity_id
     AND queue.status IN ('pending', 'claimed')
    WHERE NOT (
      expected_row.operation = 'adopt'
      AND queue.id = expected_row.task_id
      AND queue.status = 'pending'
    )
  ),
  price_history_conflicts AS MATERIALIZED (
    SELECT count(*)::integer AS count
    FROM expected_insertions expected_row
    JOIN fountain_ops.task_queue queue
      ON queue.task_type = 'menu_extract'
     AND queue.entity_type = 'location'
     AND queue.entity_id = expected_row.entity_id
     AND queue.payload->>'campaign' = $4
     AND queue.payload->>'gap_kind' = 'prices_missing'
     AND COALESCE(queue.payload->>'prompt_version', $5) = $5
  ),
  readiness AS MATERIALIZED (
    SELECT
      (SELECT count FROM invalid_expected) = 0
      AND (SELECT count FROM expected_overlap) = 0
      AND (SELECT count FROM adoption_drift) = 0
      AND (SELECT count FROM insertion_drift) = 0
      AND (SELECT count FROM adoption_queue_drift) = 0
      AND (SELECT count FROM adoption_payload_conflicts) = 0
      AND (SELECT count FROM active_scope_conflicts) = 0
      AND (SELECT count FROM price_history_conflicts) = 0 AS ready
  ),
  adopted AS (
    UPDATE fountain_ops.task_queue queue
    SET payload = queue.payload || jsonb_build_object(
          'schema_version', ${ENRICHMENT_CENSUS_VERSION},
          'campaign', $4::text,
          'coverage_task', 'menu_extract',
          'prompt_version', $5::text,
          'gap_kind', 'menu_missing',
          'menu_prices_census_snapshot', $3::text,
          'menu_prices_candidate_digest', $6::text,
          'menu_prices_combined_digest', $8::text
        ),
        updated_at = now()
    FROM expected_adoptions expected_row
    CROSS JOIN readiness
    CROSS JOIN gate_lock
    WHERE readiness.ready
      AND queue.id = expected_row.task_id
      AND queue.entity_id = expected_row.entity_id
      AND queue.task_type = 'menu_extract'
      AND queue.entity_type = 'location'
      AND queue.status = 'pending'
    RETURNING queue.id, queue.entity_id
  ),
  inserted AS (
    INSERT INTO fountain_ops.task_queue (
      task_type,
      entity_type,
      entity_id,
      priority,
      payload,
      max_attempts,
      run_id
    )
    SELECT
      'menu_extract',
      'location',
      expected_row.entity_id,
      $9::integer,
      expected_row.payload,
      $10::integer,
      $2
    FROM expected_insertions expected_row
    CROSS JOIN readiness
    CROSS JOIN gate_lock
    WHERE readiness.ready
    ORDER BY expected_row.entity_id
    RETURNING id, entity_id
  )
  SELECT
    (SELECT ready FROM readiness) AS ready,
    (SELECT count(*)::integer FROM expected_adoptions) AS expected_adoption_count,
    (SELECT count(*)::integer FROM expected_insertions) AS expected_insertion_count,
    (SELECT count(*)::integer FROM live_menu_missing) AS live_menu_count,
    (SELECT count(*)::integer FROM live_prices_missing) AS live_prices_count,
    (SELECT count FROM invalid_expected) AS invalid_expected_count,
    (SELECT count FROM expected_overlap) AS overlap_count,
    (SELECT count FROM adoption_drift) AS adoption_drift_count,
    (SELECT count FROM insertion_drift) AS insertion_drift_count,
    (SELECT count FROM adoption_queue_drift) AS adoption_queue_drift_count,
    (SELECT count FROM adoption_payload_conflicts) AS adoption_payload_conflict_count,
    (SELECT count FROM active_scope_conflicts) AS active_conflict_count,
    (SELECT count FROM price_history_conflicts) AS price_history_conflict_count,
    (SELECT count(*)::integer FROM adopted) AS adopted_count,
    (SELECT count(*)::integer FROM inserted) AS inserted_count,
    $7::text AS prices_candidate_digest
`;

export async function loadEnrichmentCensus(
  { label = "snapshot", capturedAt = null } = {},
  { query = defaultQuery } = {},
) {
  const result = await query(ENRICHMENT_CENSUS_SQL);
  return buildEnrichmentCensus(result?.rows || [], { label, capturedAt });
}

export function buildEnrichmentCensus(rows, {
  label = "snapshot",
  capturedAt = null,
} = {}) {
  if (!Array.isArray(rows)) throw new TypeError("census rows must be an array.");
  const locations = rows.map(normalizeCoverageRow).sort((left, right) => left.id - right.id);
  assertUniqueLocationIds(locations);
  const snapshot = {
    schemaVersion: ENRICHMENT_CENSUS_VERSION,
    label: nonemptyString(label, "census label"),
    capturedAt: optionalIsoTimestamp(capturedAt),
    locations,
  };
  snapshot.population = {
    eligible: locations.length,
    virtual: locations.filter((row) => row.isVirtual).length,
    nonVirtual: locations.filter((row) => !row.isVirtual).length,
  };
  snapshot.coverage = {
    overall: summarizeCoverageGroup("overall", locations),
    byCountry: summarizeGroupedCoverage(locations, (row) => [row.countryCode]),
    bySource: summarizeGroupedCoverage(locations, (row) => (
      row.sourceSlugs.length > 0 ? row.sourceSlugs : [ENRICHMENT_UNATTRIBUTED_SOURCE]
    )),
  };
  snapshot.gaps = buildGapCohorts(locations);
  snapshot.menuPrices = buildMenuPriceCohorts(locations);
  const imageClassifyIds = locations
    .filter((row) => row.unclassifiedImageCount > 0)
    .map((row) => row.id);
  snapshot.imageClassification = {
    ids: imageClassifyIds,
    locationCount: imageClassifyIds.length,
    imageCount: locations.reduce((total, row) => total + row.unclassifiedImageCount, 0),
    digest: digestIds(imageClassifyIds),
  };
  snapshot.digest = digestSnapshot(locations);
  return deepFreeze(snapshot);
}

export function compareEnrichmentCensuses(before, after) {
  assertCensus(before, "before");
  assertCensus(after, "after");
  return deepFreeze({
    schemaVersion: ENRICHMENT_CENSUS_VERSION,
    beforeLabel: before.label,
    afterLabel: after.label,
    population: {
      before: before.population.eligible,
      after: after.population.eligible,
      delta: after.population.eligible - before.population.eligible,
    },
    coverage: {
      overall: compareCoverageGroup(before.coverage.overall, after.coverage.overall),
      byCountry: compareCoverageGroups(before.coverage.byCountry, after.coverage.byCountry),
      bySource: compareCoverageGroups(before.coverage.bySource, after.coverage.bySource),
    },
    gaps: Object.fromEntries(ENRICHMENT_TASK_TYPES.map((taskType) => {
      const earlier = before.gaps[taskType];
      const later = after.gaps[taskType];
      return [taskType, {
        before: earlier.count,
        after: later.count,
        delta: later.count - earlier.count,
        resolvedIds: difference(earlier.ids, later.ids),
        newGapIds: difference(later.ids, earlier.ids),
        beforeActionable: earlier.actionableCount,
        afterActionable: later.actionableCount,
      }];
    })),
  });
}

export function buildEnrichmentEnqueuePlan(snapshot, {
  campaign = ENRICHMENT_CENSUS_CAMPAIGN,
  priority = 100,
  maxAttempts = 3,
} = {}) {
  assertCensus(snapshot, "snapshot");
  const normalizedCampaign = nonemptyString(campaign, "campaign");
  if (normalizedCampaign !== ENRICHMENT_CENSUS_CAMPAIGN) {
    throw new TypeError(
      `census campaign must be ${ENRICHMENT_CENSUS_CAMPAIGN}; retries require an explicit non-census enqueue.`,
    );
  }
  const normalizedPriority = integer(priority, "priority");
  const normalizedMaxAttempts = positiveInteger(maxAttempts, "maxAttempts");
  const tasks = ENRICHMENT_TASK_TYPES.map((taskType) => {
    if (taskType === "menu_extract") {
      const menuPrices = menuPriceSnapshot(snapshot);
      const candidateIds = [...menuPrices.combined.enqueueableIds];
      const candidateGapKinds = Object.fromEntries([
        ...menuPrices.menuMissing.enqueueableIds.map((id) => [String(id), "menu_missing"]),
        ...menuPrices.pricesMissing.enqueueableIds.map((id) => [String(id), "prices_missing"]),
      ]);
      return {
        taskType,
        entityType: "location",
        priority: normalizedPriority,
        maxAttempts: normalizedMaxAttempts,
        gapCount: menuPrices.combined.count,
        actionableCount: menuPrices.combined.actionableCount,
        attemptedUnresolvedCount: menuPrices.combined.attemptedUnresolvedCount,
        candidateCount: candidateIds.length,
        blockedCount: menuPrices.menuMissing.blockedCount
          + menuPrices.pricesMissing.blockedCount,
        candidateIds,
        blockedIds: sortedUniqueIntegers([
          ...menuPrices.menuMissing.blockedIds,
          ...menuPrices.pricesMissing.blockedIds,
        ]),
        candidateGapKinds,
        candidateDigest: digestIds(candidateIds),
      };
    }
    const gap = snapshot.gaps[taskType];
    return {
      taskType,
      entityType: "location",
      priority: normalizedPriority,
      maxAttempts: normalizedMaxAttempts,
      gapCount: gap.count,
      candidateCount: gap.actionableCount,
      blockedCount: gap.blockedCount,
      candidateIds: [...gap.actionableIds],
      blockedIds: [...gap.blockedIds],
      candidateDigest: digestIds(gap.actionableIds),
    };
  });
  return deepFreeze({
    schemaVersion: ENRICHMENT_CENSUS_VERSION,
    campaign: normalizedCampaign,
    menuPromptVersion: ENRICHMENT_MENU_PROMPT_VERSION,
    snapshotLabel: snapshot.label,
    snapshotDigest: snapshot.digest,
    expectedPopulation: snapshot.population.eligible,
    expectedInsertions: tasks.reduce((total, task) => total + task.candidateCount, 0),
    tasks,
  });
}

export function buildImageClassifyEnqueuePlan(snapshot, {
  campaign = "enrichment_image_classify_v1",
  priority = 100,
  maxAttempts = 3,
} = {}) {
  assertCensus(snapshot, "snapshot");
  const normalizedCampaign = nonemptyString(campaign, "campaign");
  const normalizedPriority = integer(priority, "priority");
  const normalizedMaxAttempts = positiveInteger(maxAttempts, "maxAttempts");
  const cohort = snapshot.imageClassification;
  const task = {
    taskType: ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE,
    entityType: "location",
    priority: normalizedPriority,
    maxAttempts: normalizedMaxAttempts,
    candidateCount: cohort.locationCount,
    candidateIds: [...cohort.ids],
    candidateDigest: cohort.digest,
  };
  return deepFreeze({
    schemaVersion: ENRICHMENT_CENSUS_VERSION,
    campaign: normalizedCampaign,
    snapshotLabel: snapshot.label,
    snapshotDigest: snapshot.digest,
    expectedPopulation: snapshot.population.eligible,
    expectedInsertions: task.candidateCount,
    unclassifiedImageCount: cohort.imageCount,
    taskType: ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE,
    tasks: [task],
  });
}

export async function loadPostContactEnqueuePlan(snapshot, {
  campaign = ENRICHMENT_CENSUS_CAMPAIGN,
  priority = 100,
  maxAttempts = 3,
} = {}, { query = defaultQuery } = {}) {
  const normalizedCampaign = nonemptyString(campaign, "campaign");
  if (normalizedCampaign !== ENRICHMENT_CENSUS_CAMPAIGN) {
    throw new TypeError(`post-contact campaign must be ${ENRICHMENT_CENSUS_CAMPAIGN}.`);
  }
  const result = await query(ENRICHMENT_POST_CONTACT_CANDIDATES_SQL, [normalizedCampaign]);
  return buildPostContactEnqueuePlan(snapshot, result?.rows || [], {
    campaign: normalizedCampaign,
    priority,
    maxAttempts,
  });
}

export function buildPostContactEnqueuePlan(snapshot, candidateRows, {
  campaign = ENRICHMENT_CENSUS_CAMPAIGN,
  priority = 100,
  maxAttempts = 3,
} = {}) {
  assertCensus(snapshot, "snapshot");
  if (!Array.isArray(candidateRows)) throw new TypeError("candidateRows must be an array.");
  const normalizedCampaign = nonemptyString(campaign, "campaign");
  if (normalizedCampaign !== ENRICHMENT_CENSUS_CAMPAIGN) {
    throw new TypeError(`post-contact campaign must be ${ENRICHMENT_CENSUS_CAMPAIGN}.`);
  }
  const normalizedPriority = integer(priority, "priority");
  const normalizedMaxAttempts = positiveInteger(maxAttempts, "maxAttempts");
  const candidates = candidateRows.map((row) => ({
    taskType: String(row?.task_type || ""),
    entityId: positiveInteger(Number(row?.entity_id), "candidate entity id"),
    gapKind: row?.gap_kind == null ? null : String(row.gap_kind),
  })).sort((left, right) => (
    left.taskType.localeCompare(right.taskType) || left.entityId - right.entityId
  ));
  const seen = new Set();
  for (const candidate of candidates) {
    if (!ENRICHMENT_POST_CONTACT_TASK_TYPES.includes(candidate.taskType)) {
      throw new TypeError(`Unsupported post-contact task type ${candidate.taskType}.`);
    }
    const key = `${candidate.taskType}:${candidate.entityId}`;
    if (seen.has(key)) throw new Error(`Duplicate post-contact candidate ${key}.`);
    seen.add(key);
    if (candidate.taskType === "menu_extract") {
      const menuPrices = menuPriceSnapshot(snapshot);
      const expectedGapKind = menuPrices.menuMissing.enqueueableIds.includes(candidate.entityId)
        ? "menu_missing"
        : menuPrices.pricesMissing.enqueueableIds.includes(candidate.entityId)
          ? "prices_missing"
          : null;
      candidate.gapKind ||= expectedGapKind;
      if (!expectedGapKind || candidate.gapKind !== expectedGapKind) {
        throw new Error(`Post-contact candidate ${key} is not an enqueueable menu gap.`);
      }
    } else if (candidate.gapKind != null) {
      throw new Error(`Post-contact candidate ${key} has an unexpected gap kind.`);
    } else if (!snapshot.gaps[candidate.taskType].actionableIds.includes(candidate.entityId)) {
      throw new Error(`Post-contact candidate ${key} is not actionable in the snapshot.`);
    }
  }
  const tasks = ENRICHMENT_POST_CONTACT_TASK_TYPES.map((taskType) => {
    const candidateIds = candidates
      .filter((candidate) => candidate.taskType === taskType)
      .map((candidate) => candidate.entityId);
    return {
      taskType,
      entityType: "location",
      priority: normalizedPriority,
      maxAttempts: normalizedMaxAttempts,
      candidateCount: candidateIds.length,
      candidateIds,
      ...(taskType === "menu_extract" ? {
        candidateGapKinds: Object.fromEntries(candidates
          .filter((candidate) => candidate.taskType === taskType)
          .map((candidate) => [String(candidate.entityId), candidate.gapKind])),
      } : {}),
      candidateDigest: digestIds(candidateIds),
    };
  });
  return deepFreeze({
    schemaVersion: ENRICHMENT_CENSUS_VERSION,
    campaign: normalizedCampaign,
    snapshotLabel: snapshot.label,
    snapshotDigest: snapshot.digest,
    expectedPopulation: snapshot.population.eligible,
    expectedInsertions: tasks.reduce((total, task) => total + task.candidateCount, 0),
    stage: "post_contact_refresh",
    tasks,
  });
}

export async function loadMenuPricesEnqueuePlan(snapshot, {
  campaign = ENRICHMENT_CENSUS_CAMPAIGN,
  promptVersion = ENRICHMENT_MENU_PROMPT_VERSION,
  priority = 100,
  maxAttempts = 3,
} = {}, { query = defaultQuery } = {}) {
  const result = await query(ENRICHMENT_MENU_PRICES_ACTIVE_TASKS_SQL);
  return buildMenuPricesEnqueuePlan(snapshot, result?.rows || [], {
    campaign,
    promptVersion,
    priority,
    maxAttempts,
  });
}

export function buildMenuPricesEnqueuePlan(snapshot, activeTaskRows, {
  campaign = ENRICHMENT_CENSUS_CAMPAIGN,
  promptVersion = ENRICHMENT_MENU_PROMPT_VERSION,
  priority = 100,
  maxAttempts = 3,
} = {}) {
  assertCensus(snapshot, "snapshot");
  if (!snapshot.menuPrices) {
    throw new TypeError("menu-prices census requires a price-aware enrichment snapshot.");
  }
  if (!Array.isArray(activeTaskRows)) throw new TypeError("activeTaskRows must be an array.");
  const normalizedCampaign = nonemptyString(campaign, "campaign");
  const normalizedPromptVersion = nonemptyString(promptVersion, "promptVersion");
  if (normalizedCampaign !== ENRICHMENT_CENSUS_CAMPAIGN) {
    throw new TypeError(`menu-prices campaign must be ${ENRICHMENT_CENSUS_CAMPAIGN}.`);
  }
  if (normalizedPromptVersion !== ENRICHMENT_MENU_PROMPT_VERSION) {
    throw new TypeError(`menu-prices promptVersion must be ${ENRICHMENT_MENU_PROMPT_VERSION}.`);
  }
  const normalizedPriority = integer(priority, "priority");
  const normalizedMaxAttempts = positiveInteger(maxAttempts, "maxAttempts");
  const menu = snapshot.menuPrices.menuMissing;
  const prices = snapshot.menuPrices.pricesMissing;
  const adoptIds = [...menu.actionableIds];
  const insertIds = [...prices.enqueueableIds];
  const insertIdSet = new Set(insertIds);
  const overlap = adoptIds.filter((id) => insertIdSet.has(id));
  if (overlap.length) {
    throw new Error(`Menu-price cohorts overlap at location ${overlap[0]}.`);
  }
  if (!sameIntegerArray(menu.attemptedUnresolvedIds, adoptIds)) {
    throw new Error(
      "Menu-price adoption requires every actionable menu_missing row to have an existing campaign attempt.",
    );
  }

  const normalizedRows = activeTaskRows.map(normalizeActiveMenuTask);
  const byEntity = new Map();
  for (const row of normalizedRows) {
    if (!byEntity.has(row.entityId)) byEntity.set(row.entityId, []);
    byEntity.get(row.entityId).push(row);
  }
  const adoptions = adoptIds.map((entityId) => {
    const matches = byEntity.get(entityId) || [];
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one active menu_missing task for location ${entityId}; found ${matches.length}.`,
      );
    }
    const match = matches[0];
    if (match.status !== "pending") {
      throw new Error(`Menu-price adoption task ${match.taskId} is ${match.status}, not pending.`);
    }
    if (match.payload.campaign !== normalizedCampaign) {
      throw new Error(`Menu-price adoption task ${match.taskId} belongs to another campaign.`);
    }
    if (match.payload.schema_version != null
        && Number(match.payload.schema_version) !== ENRICHMENT_CENSUS_VERSION) {
      throw new Error(`Menu-price adoption task ${match.taskId} has a conflicting schema version.`);
    }
    if (match.payload.coverage_task != null && match.payload.coverage_task !== "menu_extract") {
      throw new Error(`Menu-price adoption task ${match.taskId} has a conflicting coverage task.`);
    }
    if (match.payload.prompt_version != null
        && match.payload.prompt_version !== normalizedPromptVersion) {
      throw new Error(`Menu-price adoption task ${match.taskId} has a conflicting prompt version.`);
    }
    if (match.payload.gap_kind != null && match.payload.gap_kind !== "menu_missing") {
      throw new Error(`Menu-price adoption task ${match.taskId} has a conflicting gap kind.`);
    }
    return match;
  });
  const insertionConflicts = insertIds.flatMap((entityId) => byEntity.get(entityId) || []);
  if (insertionConflicts.length) {
    throw new Error(
      `prices_missing location ${insertionConflicts[0].entityId} already has active menu task ${insertionConflicts[0].taskId}.`,
    );
  }
  const alreadyAttemptedPriceTasks = prices.attemptedUnresolvedIds.flatMap(
    (entityId) => byEntity.get(entityId) || [],
  );
  if (alreadyAttemptedPriceTasks.length) {
    throw new Error(
      "menu-prices census is an incremental adoption stage and cannot be re-applied to active prices_missing tasks.",
    );
  }

  const combinedIds = sortedUniqueIntegers([...adoptIds, ...insertIds]);
  return deepFreeze({
    schemaVersion: ENRICHMENT_CENSUS_VERSION,
    stage: "menu_prices_refresh",
    campaign: normalizedCampaign,
    promptVersion: normalizedPromptVersion,
    snapshotLabel: snapshot.label,
    snapshotDigest: snapshot.digest,
    expectedPopulation: snapshot.population.eligible,
    priority: normalizedPriority,
    maxAttempts: normalizedMaxAttempts,
    expectedAdoptions: adoptions.length,
    expectedInsertions: insertIds.length,
    expectedTasks: combinedIds.length,
    menuMissing: {
      rawCount: menu.count,
      actionableCount: menu.actionableCount,
      attemptedUnresolvedCount: menu.attemptedUnresolvedCount,
      blockedCount: menu.blockedCount,
      candidateIds: adoptIds,
      candidateDigest: digestIds(adoptIds),
      adoptions: adoptions.map((row) => ({
        taskId: row.taskId,
        entityId: row.entityId,
        runId: row.runId,
      })),
    },
    pricesMissing: {
      rawCount: prices.count,
      actionableCount: prices.actionableCount,
      attemptedUnresolvedCount: prices.attemptedUnresolvedCount,
      blockedCount: prices.blockedCount,
      candidateIds: insertIds,
      candidateDigest: digestIds(insertIds),
    },
    combined: {
      candidateIds: combinedIds,
      candidateDigest: digestIds(combinedIds),
    },
    tasks: [{
      taskType: "menu_extract",
      entityType: "location",
      priority: normalizedPriority,
      maxAttempts: normalizedMaxAttempts,
      candidateCount: insertIds.length,
      candidateIds: insertIds,
      candidateDigest: digestIds(insertIds),
      candidateGapKinds: Object.fromEntries(insertIds.map((id) => [String(id), "prices_missing"])),
    }],
  });
}

export function assertEnrichmentEnqueuePlan(plan, liveSnapshot, {
  implementedTaskTypes = [],
} = {}) {
  assertPlan(plan);
  assertCensus(liveSnapshot, "liveSnapshot");
  if (plan.snapshotDigest !== liveSnapshot.digest) {
    throw new Error(
      `Enrichment census drifted: planned ${plan.snapshotDigest}, live ${liveSnapshot.digest}.`,
    );
  }
  const implemented = new Set(implementedTaskTypes.map((value) => String(value)));
  for (const task of plan.tasks) {
    if (task.taskType === "menu_extract") {
      const live = menuPriceSnapshot(liveSnapshot);
      if (task.candidateDigest !== live.combined.enqueueableDigest
          || !sameIntegerArray(task.candidateIds, live.combined.enqueueableIds)) {
        throw new Error("Enrichment candidate drift for menu_extract.");
      }
      for (const entityId of task.candidateIds) {
        const expectedKind = live.menuMissing.enqueueableIds.includes(entityId)
          ? "menu_missing"
          : "prices_missing";
        if (task.candidateGapKinds?.[String(entityId)] !== expectedKind) {
          throw new Error(`Enrichment menu gap-kind drift for location ${entityId}.`);
        }
      }
      if (task.candidateCount > 0 && !implemented.has(task.taskType)) {
        throw new Error(`Task handler ${task.taskType} is not implemented; refusing enqueue.`);
      }
      continue;
    }
    const live = liveSnapshot.gaps[task.taskType];
    if (task.candidateDigest !== digestIds(live.actionableIds)
        || !sameIntegerArray(task.candidateIds, live.actionableIds)) {
      throw new Error(`Enrichment candidate drift for ${task.taskType}.`);
    }
    if (task.candidateCount > 0 && !implemented.has(task.taskType)) {
      throw new Error(`Task handler ${task.taskType} is not implemented; refusing enqueue.`);
    }
  }
  return true;
}

export function assertImageClassifyEnqueuePlan(plan, liveSnapshot, {
  implementedTaskTypes = [],
} = {}) {
  assertPlan(plan);
  assertCensus(liveSnapshot, "liveSnapshot");
  if (plan.taskType !== ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE
      || plan.tasks.length !== 1
      || plan.tasks[0].taskType !== ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE) {
    throw new TypeError("plan must be an image_classify enqueue plan.");
  }
  if (plan.snapshotDigest !== liveSnapshot.digest) {
    throw new Error(
      `Image classification census drifted: planned ${plan.snapshotDigest}, live ${liveSnapshot.digest}.`,
    );
  }
  const task = plan.tasks[0];
  const live = liveSnapshot.imageClassification;
  if (task.candidateDigest !== live.digest || !sameIntegerArray(task.candidateIds, live.ids)) {
    throw new Error("Image classification candidate drift.");
  }
  const implemented = new Set(implementedTaskTypes.map((value) => String(value)));
  if (task.candidateCount > 0 && !implemented.has(ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE)) {
    throw new Error("Task handler image_classify is not implemented; refusing enqueue.");
  }
  return true;
}

export function assertPostContactEnqueuePlan(plan, liveSnapshot, {
  implementedTaskTypes = [],
} = {}) {
  assertPlan(plan);
  assertCensus(liveSnapshot, "liveSnapshot");
  if (plan.stage !== "post_contact_refresh"
      || plan.tasks.length !== ENRICHMENT_POST_CONTACT_TASK_TYPES.length) {
    throw new TypeError("plan must be a post-contact enrichment enqueue plan.");
  }
  if (plan.snapshotDigest !== liveSnapshot.digest) {
    throw new Error(
      `Post-contact census drifted: planned ${plan.snapshotDigest}, live ${liveSnapshot.digest}.`,
    );
  }
  const implemented = new Set(implementedTaskTypes.map((value) => String(value)));
  for (const task of plan.tasks) {
    if (!ENRICHMENT_POST_CONTACT_TASK_TYPES.includes(task.taskType)) {
      throw new TypeError(`Unsupported post-contact task type ${task.taskType}.`);
    }
    if (task.taskType === "menu_extract") {
      const menuPrices = menuPriceSnapshot(liveSnapshot);
      for (const entityId of task.candidateIds) {
        const expectedGapKind = menuPrices.menuMissing.enqueueableIds.includes(entityId)
          ? "menu_missing"
          : menuPrices.pricesMissing.enqueueableIds.includes(entityId)
            ? "prices_missing"
            : null;
        if (!expectedGapKind || task.candidateGapKinds?.[String(entityId)] !== expectedGapKind) {
          throw new Error("Post-contact candidate drift for menu_extract.");
        }
      }
    } else {
      const actionable = new Set(liveSnapshot.gaps[task.taskType].actionableIds);
      if (task.candidateIds.some((id) => !actionable.has(id))) {
        throw new Error(`Post-contact candidate drift for ${task.taskType}.`);
      }
    }
    if (task.candidateDigest !== digestIds(task.candidateIds)) {
      throw new Error(`Post-contact candidate digest drift for ${task.taskType}.`);
    }
    if (task.candidateCount > 0 && !implemented.has(task.taskType)) {
      throw new Error(`Task handler ${task.taskType} is not implemented; refusing enqueue.`);
    }
  }
  return true;
}

export function assertMenuPricesEnqueuePlan(plan, liveSnapshot, {
  implementedTaskTypes = [],
} = {}) {
  assertPlan(plan);
  assertCensus(liveSnapshot, "liveSnapshot");
  if (plan.stage !== "menu_prices_refresh" || !liveSnapshot.menuPrices) {
    throw new TypeError("plan must be a price-aware menu-prices enqueue plan.");
  }
  if (plan.snapshotDigest !== liveSnapshot.digest) {
    throw new Error(
      `Menu-prices census drifted: planned ${plan.snapshotDigest}, live ${liveSnapshot.digest}.`,
    );
  }
  const liveMenu = liveSnapshot.menuPrices.menuMissing;
  const livePrices = liveSnapshot.menuPrices.pricesMissing;
  if (!sameIntegerArray(plan.menuMissing.candidateIds, liveMenu.actionableIds)
      || plan.menuMissing.candidateDigest !== liveMenu.actionableDigest) {
    throw new Error("Menu-prices menu_missing adoption cohort drifted.");
  }
  if (!sameIntegerArray(plan.pricesMissing.candidateIds, livePrices.enqueueableIds)
      || plan.pricesMissing.candidateDigest !== livePrices.enqueueableDigest) {
    throw new Error("Menu-prices prices_missing insertion cohort drifted.");
  }
  const priceCandidateIds = new Set(plan.pricesMissing.candidateIds);
  const overlap = plan.menuMissing.candidateIds.filter((id) => priceCandidateIds.has(id));
  if (overlap.length || plan.expectedTasks !== plan.expectedAdoptions + plan.expectedInsertions) {
    throw new Error("Menu-prices plan has overlapping or inconsistent cohorts.");
  }
  const implemented = new Set(implementedTaskTypes.map((value) => String(value)));
  if (plan.expectedTasks > 0 && !implemented.has("menu_extract")) {
    throw new Error("Task handler menu_extract is not implemented; refusing enqueue.");
  }
  return true;
}

export async function enqueueEnrichmentPlan({
  plan,
  liveSnapshot,
  runId,
  implementedTaskTypes = [],
  apply = false,
} = {}, { query = defaultQuery } = {}) {
  assertEnrichmentEnqueuePlan(plan, liveSnapshot, { implementedTaskTypes });
  const normalizedRunId = normalizeRunId(runId);
  if (!apply) {
    return {
      apply: false,
      ready: true,
      expectedCount: plan.expectedInsertions,
      insertedCount: 0,
      insertedByTask: {},
      snapshotDigest: plan.snapshotDigest,
    };
  }
  const expectedRows = planRows(plan);
  const result = await query(ENRICHMENT_ENQUEUE_SQL, [
    JSON.stringify(expectedRows),
    normalizedRunId,
    plan.snapshotDigest,
  ]);
  const row = result?.rows?.[0];
  if (!row) throw new Error("Enrichment enqueue query returned no reconciliation row.");
  const normalized = {
    apply: true,
    ready: Boolean(row.ready),
    expectedCount: number(row.expected_count),
    liveCount: number(row.live_count),
    driftCount: number(row.drift_count),
    activeConflictCount: number(row.active_conflict_count),
    insertedCount: number(row.inserted_count),
    insertedByTask: object(row.inserted_by_task),
    snapshotDigest: plan.snapshotDigest,
  };
  if (!normalized.ready
      || normalized.driftCount !== 0
      || normalized.activeConflictCount !== 0
      || normalized.expectedCount !== plan.expectedInsertions
      || normalized.liveCount !== plan.expectedInsertions
      || normalized.insertedCount !== plan.expectedInsertions) {
    throw new Error(
      "Enrichment enqueue reconciliation failed: "
        + `ready=${normalized.ready}, expected=${normalized.expectedCount}/${plan.expectedInsertions}, `
        + `live=${normalized.liveCount}, drift=${normalized.driftCount}, `
        + `active_conflicts=${normalized.activeConflictCount}, inserted=${normalized.insertedCount}.`,
    );
  }
  return normalized;
}

export async function enqueueImageClassifyPlan({
  plan,
  liveSnapshot,
  runId,
  implementedTaskTypes = [],
  apply = false,
} = {}, { query = defaultQuery } = {}) {
  assertImageClassifyEnqueuePlan(plan, liveSnapshot, { implementedTaskTypes });
  const normalizedRunId = normalizeRunId(runId);
  if (!apply) {
    return {
      apply: false,
      ready: true,
      expectedCount: plan.expectedInsertions,
      insertedCount: 0,
      snapshotDigest: plan.snapshotDigest,
    };
  }
  const result = await query(ENRICHMENT_IMAGE_CLASSIFY_ENQUEUE_SQL, [
    JSON.stringify(planRows(plan)),
    normalizedRunId,
    plan.snapshotDigest,
  ]);
  const row = result?.rows?.[0];
  if (!row) throw new Error("Image classification enqueue query returned no reconciliation row.");
  const normalized = {
    apply: true,
    ready: Boolean(row.ready),
    expectedCount: number(row.expected_count),
    liveCount: number(row.live_count),
    driftCount: number(row.drift_count),
    activeConflictCount: number(row.active_conflict_count),
    insertedCount: number(row.inserted_count),
    snapshotDigest: plan.snapshotDigest,
  };
  if (!normalized.ready
      || normalized.driftCount !== 0
      || normalized.activeConflictCount !== 0
      || normalized.expectedCount !== plan.expectedInsertions
      || normalized.liveCount !== plan.expectedInsertions
      || normalized.insertedCount !== plan.expectedInsertions) {
    throw new Error(
      "Image classification enqueue reconciliation failed: "
        + `ready=${normalized.ready}, expected=${normalized.expectedCount}/${plan.expectedInsertions}, `
        + `live=${normalized.liveCount}, drift=${normalized.driftCount}, `
        + `active_conflicts=${normalized.activeConflictCount}, inserted=${normalized.insertedCount}.`,
    );
  }
  return normalized;
}

export async function enqueuePostContactPlan({
  plan,
  liveSnapshot,
  runId,
  implementedTaskTypes = [],
  apply = false,
} = {}, { query = defaultQuery } = {}) {
  assertPostContactEnqueuePlan(plan, liveSnapshot, { implementedTaskTypes });
  const normalizedRunId = normalizeRunId(runId);
  if (!apply) {
    return {
      apply: false,
      ready: true,
      expectedCount: plan.expectedInsertions,
      insertedCount: 0,
      insertedByTask: {},
      snapshotDigest: plan.snapshotDigest,
    };
  }
  const result = await query(ENRICHMENT_POST_CONTACT_ENQUEUE_SQL, [
    JSON.stringify(planRows(plan)),
    normalizedRunId,
    plan.snapshotDigest,
    plan.campaign,
  ]);
  const row = result?.rows?.[0];
  if (!row) throw new Error("Post-contact enqueue query returned no reconciliation row.");
  const normalized = {
    apply: true,
    ready: Boolean(row.ready),
    expectedCount: number(row.expected_count),
    liveCount: number(row.live_count),
    driftCount: number(row.drift_count),
    activeConflictCount: number(row.active_conflict_count),
    insertedCount: number(row.inserted_count),
    insertedByTask: object(row.inserted_by_task),
    snapshotDigest: plan.snapshotDigest,
  };
  if (!normalized.ready
      || normalized.driftCount !== 0
      || normalized.activeConflictCount !== 0
      || normalized.expectedCount !== plan.expectedInsertions
      || normalized.liveCount !== plan.expectedInsertions
      || normalized.insertedCount !== plan.expectedInsertions) {
    throw new Error(
      "Post-contact enqueue reconciliation failed: "
        + `ready=${normalized.ready}, expected=${normalized.expectedCount}/${plan.expectedInsertions}, `
        + `live=${normalized.liveCount}, drift=${normalized.driftCount}, `
        + `active_conflicts=${normalized.activeConflictCount}, inserted=${normalized.insertedCount}.`,
    );
  }
  return normalized;
}

export async function enqueueMenuPricesPlan({
  plan,
  liveSnapshot,
  runId,
  implementedTaskTypes = [],
  apply = false,
} = {}, { query = defaultQuery } = {}) {
  assertMenuPricesEnqueuePlan(plan, liveSnapshot, { implementedTaskTypes });
  const normalizedRunId = normalizeRunId(runId);
  if (!apply) {
    return {
      apply: false,
      ready: true,
      expectedAdoptionCount: plan.expectedAdoptions,
      expectedInsertionCount: plan.expectedInsertions,
      adoptedCount: 0,
      insertedCount: 0,
      snapshotDigest: plan.snapshotDigest,
    };
  }
  const insertionPayload = {
    schema_version: ENRICHMENT_CENSUS_VERSION,
    campaign: plan.campaign,
    prompt_version: plan.promptVersion,
    census_snapshot: plan.snapshotDigest,
    candidate_digest: plan.pricesMissing.candidateDigest,
    coverage_task: "menu_extract",
    gap_kind: "prices_missing",
    menu_prices_census_snapshot: plan.snapshotDigest,
    menu_prices_candidate_digest: plan.pricesMissing.candidateDigest,
    menu_prices_combined_digest: plan.combined.candidateDigest,
  };
  const expectedRows = [
    ...plan.menuMissing.adoptions.map((row) => ({
      operation: "adopt",
      task_id: row.taskId,
      entity_id: row.entityId,
      payload: null,
    })),
    ...plan.pricesMissing.candidateIds.map((entityId) => ({
      operation: "insert",
      task_id: null,
      entity_id: entityId,
      payload: insertionPayload,
    })),
  ];
  const result = await query(ENRICHMENT_MENU_PRICES_ENQUEUE_SQL, [
    JSON.stringify(expectedRows),
    normalizedRunId,
    plan.snapshotDigest,
    plan.campaign,
    plan.promptVersion,
    plan.menuMissing.candidateDigest,
    plan.pricesMissing.candidateDigest,
    plan.combined.candidateDigest,
    plan.priority,
    plan.maxAttempts,
  ]);
  const row = result?.rows?.[0];
  if (!row) throw new Error("Menu-prices enqueue query returned no reconciliation row.");
  const normalized = {
    apply: true,
    ready: Boolean(row.ready),
    expectedAdoptionCount: number(row.expected_adoption_count),
    expectedInsertionCount: number(row.expected_insertion_count),
    liveMenuCount: number(row.live_menu_count),
    livePricesCount: number(row.live_prices_count),
    invalidExpectedCount: number(row.invalid_expected_count),
    overlapCount: number(row.overlap_count),
    adoptionDriftCount: number(row.adoption_drift_count),
    insertionDriftCount: number(row.insertion_drift_count),
    adoptionQueueDriftCount: number(row.adoption_queue_drift_count),
    adoptionPayloadConflictCount: number(row.adoption_payload_conflict_count),
    activeConflictCount: number(row.active_conflict_count),
    priceHistoryConflictCount: number(row.price_history_conflict_count),
    adoptedCount: number(row.adopted_count),
    insertedCount: number(row.inserted_count),
    snapshotDigest: plan.snapshotDigest,
  };
  if (!normalized.ready
      || normalized.expectedAdoptionCount !== plan.expectedAdoptions
      || normalized.expectedInsertionCount !== plan.expectedInsertions
      || normalized.liveMenuCount !== plan.expectedAdoptions
      || normalized.livePricesCount !== plan.expectedInsertions
      || normalized.invalidExpectedCount !== 0
      || normalized.overlapCount !== 0
      || normalized.adoptionDriftCount !== 0
      || normalized.insertionDriftCount !== 0
      || normalized.adoptionQueueDriftCount !== 0
      || normalized.adoptionPayloadConflictCount !== 0
      || normalized.activeConflictCount !== 0
      || normalized.priceHistoryConflictCount !== 0
      || normalized.adoptedCount !== plan.expectedAdoptions
      || normalized.insertedCount !== plan.expectedInsertions) {
    throw new Error(
      "Menu-prices enqueue reconciliation failed: "
        + `ready=${normalized.ready}, adoptions=${normalized.adoptedCount}/${plan.expectedAdoptions}, `
        + `insertions=${normalized.insertedCount}/${plan.expectedInsertions}, `
        + `live=${normalized.liveMenuCount}+${normalized.livePricesCount}, `
        + `drift=${normalized.adoptionDriftCount}+${normalized.insertionDriftCount}, `
        + `queue_drift=${normalized.adoptionQueueDriftCount}, overlap=${normalized.overlapCount}, `
        + `active_conflicts=${normalized.activeConflictCount}, `
        + `history_conflicts=${normalized.priceHistoryConflictCount}.`,
    );
  }
  return normalized;
}

export function renderEnrichmentCensusReport({ before, after = null, plan = null } = {}) {
  assertCensus(before, "before");
  if (after) assertCensus(after, "after");
  const latest = after || before;
  if (plan) {
    assertPlan(plan);
    if (plan.snapshotDigest !== latest.digest) {
      throw new Error("Enqueue plan does not belong to the latest census snapshot.");
    }
  }
  const comparison = after ? compareEnrichmentCensuses(before, after) : null;
  const lines = [
    "# Enrichment Coverage Census",
    "",
    `Census version: ${ENRICHMENT_CENSUS_VERSION}. Population: active, non-deleted locations with no linked source listing in the suppression ledger.`,
    "",
    "Source groups are multi-attribution: a location linked to multiple sources appears once in each source denominator.",
    "",
    "## Snapshot reconciliation",
    "",
    "| Snapshot | Captured at | Eligible | Non-virtual | Virtual | Digest |",
    "| --- | --- | ---: | ---: | ---: | --- |",
    snapshotRow(before),
  ];
  if (after) lines.push(snapshotRow(after));
  lines.push(
    "",
    "## Overall field coverage",
    "",
    ...coverageTable(before.coverage.overall, after?.coverage.overall),
    "",
    "## Exact enrichment gap cohorts",
    "",
    "Contact gaps mean any missing website, phone, email, or address. Reviews are complete at three active rows. Geocode and image gaps exclude virtual locations.",
    "",
    "| Task | Gap before | Gap after | Actionable now | Blocked now | Exact digest | First IDs |",
    "| --- | ---: | ---: | ---: | ---: | --- | --- |",
  );
  for (const taskType of ENRICHMENT_TASK_TYPES) {
    const beforeGap = before.gaps[taskType];
    const latestGap = latest.gaps[taskType];
    lines.push(
      `| ${taskType} | ${formatInteger(beforeGap.count)} | ${formatInteger(after ? latestGap.count : beforeGap.count)} | ${formatInteger(latestGap.actionableCount)} | ${formatInteger(latestGap.blockedCount)} | ${latestGap.digest} | ${latestGap.ids.slice(0, 10).join(", ") || "—"} |`,
    );
  }
  if (comparison) {
    lines.push(
      "",
      "## Before/after gap movement",
      "",
      "| Task | Resolved | New gaps | Net change |",
      "| --- | ---: | ---: | ---: |",
      ...ENRICHMENT_TASK_TYPES.map((taskType) => {
        const gap = comparison.gaps[taskType];
        return `| ${taskType} | ${formatInteger(gap.resolvedIds.length)} | ${formatInteger(gap.newGapIds.length)} | ${formatSigned(gap.delta)} |`;
      }),
    );
  }
  if (latest.menuPrices) {
    lines.push(
      "",
      "## Menu and price gap state",
      "",
      "Raw gaps are serving-state gaps. Actionable gaps have a website. Attempted-unresolved gaps remain visible but are not enqueueable again in this campaign.",
      "",
      "| Gap kind | Raw | Actionable | Attempted unresolved | Enqueueable once | Blocked | Raw digest | Enqueueable digest |",
      "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
      ...ENRICHMENT_MENU_GAP_KINDS.map((gapKind) => {
        const cohort = gapKind === "menu_missing"
          ? latest.menuPrices.menuMissing
          : latest.menuPrices.pricesMissing;
        return `| ${gapKind} | ${formatInteger(cohort.count)} | ${formatInteger(cohort.actionableCount)} | ${formatInteger(cohort.attemptedUnresolvedCount)} | ${formatInteger(cohort.enqueueableCount)} | ${formatInteger(cohort.blockedCount)} | ${cohort.digest} | ${cohort.enqueueableDigest} |`;
      }),
    );
  }
  lines.push(
    "",
    "## Coverage by country",
    "",
    ...groupCoverageTable(before.coverage.byCountry, after?.coverage.byCountry, "Country"),
    "",
    "## Coverage by source",
    "",
    ...groupCoverageTable(before.coverage.bySource, after?.coverage.bySource, "Source"),
  );
  if (plan) {
    lines.push(
      "",
      "## Guarded enqueue plan",
      "",
      `Campaign: ${escapeCell(plan.campaign)}; snapshot: ${plan.snapshotDigest}; exact planned insertions: ${formatInteger(plan.expectedInsertions)}.`,
      "",
      "| Task | Exact gaps | Planned enqueueable | Blocked dependency | Candidate digest |",
      "| --- | ---: | ---: | ---: | --- |",
      ...plan.tasks.map((task) => (
        `| ${task.taskType} | ${formatInteger(task.gapCount)} | ${formatInteger(task.candidateCount)} | ${formatInteger(task.blockedCount)} | ${task.candidateDigest} |`
      )),
      "",
      "Apply remains guarded by an exact live snapshot/candidate match, zero active queue conflicts, and explicit handler readiness for every non-empty task cohort.",
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderImageClassifyEnqueueReport({ snapshot, plan, enqueue = null } = {}) {
  assertCensus(snapshot, "snapshot");
  assertPlan(plan);
  if (plan.taskType !== ENRICHMENT_IMAGE_CLASSIFY_TASK_TYPE
      || plan.snapshotDigest !== snapshot.digest) {
    throw new Error("Image classification plan does not belong to this census snapshot.");
  }
  const outcome = enqueue?.apply
    ? `${formatInteger(enqueue.insertedCount)} inserted`
    : "dry-run preview; no queue writes";
  return [
    "# Enrichment Image Classification Enqueue",
    "",
    `Census version: ${ENRICHMENT_CENSUS_VERSION}. Population: active, non-deleted locations with no linked source listing in the suppression ledger.`,
    "",
    "This post-harvest stage selects locations with at least one active image whose image_kind is null.",
    "",
    "| Snapshot | Eligible locations | Candidate locations | Unclassified images | Candidate digest |",
    "| --- | ---: | ---: | ---: | --- |",
    `| ${escapeCell(snapshot.label)} | ${formatInteger(snapshot.population.eligible)} | ${formatInteger(plan.expectedInsertions)} | ${formatInteger(plan.unclassifiedImageCount)} | ${plan.tasks[0].candidateDigest} |`,
    "",
    `Campaign: ${escapeCell(plan.campaign)}. Reconciliation: ${outcome}.`,
    "",
    "Apply is guarded by an exact live snapshot/candidate match, zero pending or claimed image_classify conflicts, and explicit handler readiness.",
    "",
  ].join("\n");
}

export function renderPostContactEnqueueReport({ snapshot, plan, enqueue = null } = {}) {
  assertCensus(snapshot, "snapshot");
  assertPlan(plan);
  if (plan.stage !== "post_contact_refresh" || plan.snapshotDigest !== snapshot.digest) {
    throw new Error("Post-contact plan does not belong to this census snapshot.");
  }
  const outcome = enqueue?.apply
    ? `${formatInteger(enqueue.insertedCount)} inserted`
    : "dry-run preview; no queue writes";
  return [
    "# Enrichment Post-Contact Refresh",
    "",
    `Census version: ${ENRICHMENT_CENSUS_VERSION}. Population: active, non-deleted locations with no linked source listing in the suppression ledger.`,
    "",
    "This stage adds only downstream work newly unlocked by contact_fill. A task already represented anywhere in the same census campaign is excluded, regardless of queue status.",
    "",
    "| Task | Newly unlocked locations | Candidate digest |",
    "| --- | ---: | --- |",
    ...plan.tasks.map((task) => (
      `| ${task.taskType} | ${formatInteger(task.candidateCount)} | ${task.candidateDigest} |`
    )),
    "",
    `Campaign: ${escapeCell(plan.campaign)}. Exact planned insertions: ${formatInteger(plan.expectedInsertions)}. Reconciliation: ${outcome}.`,
    "",
    "Apply is guarded by an exact live candidate match, zero pending or claimed conflicts from other campaigns, and explicit downstream handler readiness.",
    "",
  ].join("\n");
}

export function renderMenuPricesEnqueueReport({ snapshot, plan, enqueue = null } = {}) {
  assertCensus(snapshot, "snapshot");
  assertPlan(plan);
  if (plan.stage !== "menu_prices_refresh" || plan.snapshotDigest !== snapshot.digest) {
    throw new Error("Menu-prices plan does not belong to this census snapshot.");
  }
  const outcome = enqueue?.apply
    ? `${formatInteger(enqueue.adoptedCount)} adopted; ${formatInteger(enqueue.insertedCount)} inserted`
    : "dry-run preview; no queue writes";
  return [
    "# Enrichment Menu + Price Census",
    "",
    `Census version: ${ENRICHMENT_CENSUS_VERSION}. Population: active, non-deleted locations with no linked source listing in the suppression ledger.`,
    "",
    "The conservative price cohort contains locations with one or more active offerings and zero active offerings with a non-null price amount. Partially priced locations are intentionally excluded.",
    "",
    "Actionable means a website is present. Attempted-unresolved rows remain visible but are not enqueued again in the same campaign.",
    "",
    "| Gap kind | Raw | Actionable | Attempted unresolved | Blocked | Queue action | Candidate digest |",
    "| --- | ---: | ---: | ---: | ---: | --- | --- |",
    `| menu_missing | ${formatInteger(plan.menuMissing.rawCount)} | ${formatInteger(plan.menuMissing.actionableCount)} | ${formatInteger(plan.menuMissing.attemptedUnresolvedCount)} | ${formatInteger(plan.menuMissing.blockedCount)} | adopt ${formatInteger(plan.expectedAdoptions)} pending tasks | ${plan.menuMissing.candidateDigest} |`,
    `| prices_missing | ${formatInteger(plan.pricesMissing.rawCount)} | ${formatInteger(plan.pricesMissing.actionableCount)} | ${formatInteger(plan.pricesMissing.attemptedUnresolvedCount)} | ${formatInteger(plan.pricesMissing.blockedCount)} | insert ${formatInteger(plan.expectedInsertions)} tasks | ${plan.pricesMissing.candidateDigest} |`,
    "",
    `Campaign: ${escapeCell(plan.campaign)}. Prompt: ${escapeCell(plan.promptVersion)}. Snapshot: ${plan.snapshotDigest}.`,
    "",
    `Combined exact task population: ${formatInteger(plan.expectedTasks)} (${plan.combined.candidateDigest}). Reconciliation: ${outcome}.`,
    "",
    "Apply uses one advisory-lock-guarded statement and fails closed on live cohort drift, overlap, queue or payload conflicts, historical price attempts, or adoption/insertion count mismatches. Adopted tasks retain their original run IDs and original census evidence while receiving menu-price scope metadata.",
    "",
  ].join("\n");
}

function normalizeCoverageRow(row) {
  const id = positiveInteger(Number(row?.id), "location id");
  const imageCount = nonnegativeInteger(row?.image_count, "image count");
  const unclassifiedImageCount = nonnegativeInteger(
    row?.unclassified_image_count,
    "unclassified image count",
  );
  if (unclassifiedImageCount > imageCount) {
    throw new TypeError("unclassified image count cannot exceed image count.");
  }
  const menuCount = nonnegativeInteger(row?.menu_count, "menu count");
  const pricedCount = nonnegativeInteger(row?.priced_count, "priced offering count");
  if (pricedCount > menuCount) {
    throw new TypeError("priced offering count cannot exceed menu count.");
  }
  const reviewCount = nonnegativeInteger(row?.review_count, "review count");
  const placeMatchCount = nonnegativeInteger(row?.place_match_count, "place match count");
  const menuExtractionAttempted = Boolean(
    row?.menu_extraction_attempted
      ?? (row?.menu_missing_attempted || row?.prices_missing_attempted),
  );
  return {
    id,
    countryCode: normalizedGroupKey(row?.country_code, ENRICHMENT_UNKNOWN_COUNTRY).toUpperCase(),
    isVirtual: Boolean(row?.is_virtual),
    sourceSlugs: normalizedStringArray(row?.source_slugs),
    hasName: Boolean(row?.name && String(row.name).trim()),
    hasWebsite: Boolean(row?.has_website),
    hasPhone: Boolean(row?.has_phone),
    hasEmail: Boolean(row?.has_email),
    hasAddress: Boolean(row?.has_address),
    hasLocality: Boolean(row?.has_locality),
    hasRegion: Boolean(row?.has_region),
    hasPostalCode: Boolean(row?.has_postal_code),
    hasCountryCode: Boolean(row?.has_country_code),
    hasLatitude: Boolean(row?.has_latitude),
    hasLongitude: Boolean(row?.has_longitude),
    hasGeocode: Boolean(row?.has_geocode),
    imageCount,
    unclassifiedImageCount,
    menuCount,
    pricedCount,
    menuExtractionAttempted,
    menuMissingAttempted: menuExtractionAttempted,
    pricesMissingAttempted: menuExtractionAttempted,
    reviewCount,
    placeMatchCount,
    hasImages: imageCount > 0,
    hasMenus: menuCount > 0,
    hasReviews: reviewCount >= 3,
    hasPlaceMatch: placeMatchCount > 0,
  };
}

function buildGapCohorts(rows) {
  const definitions = {
    contact_fill: {
      gap: (row) => !row.hasWebsite || !row.hasPhone || !row.hasEmail || !row.hasAddress,
      actionable: (row) => row.hasName,
    },
    geocode: {
      gap: (row) => !row.isVirtual && !row.hasGeocode,
      actionable: (row) => row.hasAddress || row.hasLocality,
    },
    image_harvest: {
      gap: (row) => !row.isVirtual && !row.hasImages,
      actionable: (row) => row.hasWebsite,
    },
    menu_extract: {
      gap: (row) => !row.hasMenus,
      actionable: (row) => row.hasWebsite,
    },
    reviews_fetch: {
      gap: (row) => !row.hasReviews,
      actionable: () => true,
    },
  };
  return Object.fromEntries(ENRICHMENT_TASK_TYPES.map((taskType) => {
    const definition = definitions[taskType];
    const gapRows = rows.filter(definition.gap);
    const actionableIds = gapRows.filter(definition.actionable).map((row) => row.id);
    const blockedIds = gapRows.filter((row) => !definition.actionable(row)).map((row) => row.id);
    const ids = gapRows.map((row) => row.id);
    return [taskType, {
      ids,
      count: ids.length,
      actionableIds,
      actionableCount: actionableIds.length,
      blockedIds,
      blockedCount: blockedIds.length,
      digest: digestIds(ids),
      actionableDigest: digestIds(actionableIds),
    }];
  }));
}

function buildMenuPriceCohorts(rows) {
  const menuMissing = buildMenuPriceCohort(
    rows,
    (row) => row.menuCount === 0,
    (row) => row.menuExtractionAttempted,
  );
  const pricesMissing = buildMenuPriceCohort(
    rows,
    (row) => row.menuCount > 0 && row.pricedCount === 0,
    (row) => row.menuExtractionAttempted,
  );
  const combinedIds = sortedUniqueIntegers([
    ...menuMissing.ids,
    ...pricesMissing.ids,
  ]);
  const combinedActionableIds = sortedUniqueIntegers([
    ...menuMissing.actionableIds,
    ...pricesMissing.actionableIds,
  ]);
  const combinedAttemptedIds = sortedUniqueIntegers([
    ...menuMissing.attemptedUnresolvedIds,
    ...pricesMissing.attemptedUnresolvedIds,
  ]);
  const combinedEnqueueableIds = sortedUniqueIntegers([
    ...menuMissing.enqueueableIds,
    ...pricesMissing.enqueueableIds,
  ]);
  return {
    menuMissing,
    pricesMissing,
    combined: {
      ids: combinedIds,
      count: combinedIds.length,
      actionableIds: combinedActionableIds,
      actionableCount: combinedActionableIds.length,
      attemptedUnresolvedIds: combinedAttemptedIds,
      attemptedUnresolvedCount: combinedAttemptedIds.length,
      enqueueableIds: combinedEnqueueableIds,
      enqueueableCount: combinedEnqueueableIds.length,
      digest: digestIds(combinedIds),
      actionableDigest: digestIds(combinedActionableIds),
      attemptedUnresolvedDigest: digestIds(combinedAttemptedIds),
      enqueueableDigest: digestIds(combinedEnqueueableIds),
    },
  };
}

function menuPriceSnapshot(snapshot) {
  if (snapshot.menuPrices) return snapshot.menuPrices;
  const legacy = snapshot.gaps?.menu_extract;
  if (!legacy) throw new TypeError("snapshot has no menu gap evidence.");
  const menuMissing = {
    ...legacy,
    attemptedUnresolvedIds: [],
    attemptedUnresolvedCount: 0,
    attemptedUnresolvedDigest: digestIds([]),
    enqueueableIds: [...legacy.actionableIds],
    enqueueableCount: legacy.actionableCount,
    enqueueableDigest: digestIds(legacy.actionableIds),
  };
  const pricesMissing = emptyMenuPriceCohort();
  return {
    menuMissing,
    pricesMissing,
    combined: {
      ids: [...menuMissing.ids],
      count: menuMissing.count,
      actionableIds: [...menuMissing.actionableIds],
      actionableCount: menuMissing.actionableCount,
      attemptedUnresolvedIds: [],
      attemptedUnresolvedCount: 0,
      enqueueableIds: [...menuMissing.enqueueableIds],
      enqueueableCount: menuMissing.enqueueableCount,
      digest: menuMissing.digest,
      actionableDigest: menuMissing.actionableDigest,
      attemptedUnresolvedDigest: digestIds([]),
      enqueueableDigest: menuMissing.enqueueableDigest,
    },
  };
}

function emptyMenuPriceCohort() {
  const digest = digestIds([]);
  return {
    ids: [],
    count: 0,
    actionableIds: [],
    actionableCount: 0,
    attemptedUnresolvedIds: [],
    attemptedUnresolvedCount: 0,
    enqueueableIds: [],
    enqueueableCount: 0,
    blockedIds: [],
    blockedCount: 0,
    digest,
    actionableDigest: digest,
    attemptedUnresolvedDigest: digest,
    enqueueableDigest: digest,
  };
}

function buildMenuPriceCohort(rows, isGap, wasAttempted) {
  const gapRows = rows.filter(isGap);
  const actionableRows = gapRows.filter((row) => row.hasWebsite);
  const attemptedRows = actionableRows.filter(wasAttempted);
  const enqueueableRows = actionableRows.filter((row) => !wasAttempted(row));
  const ids = gapRows.map((row) => row.id);
  const actionableIds = actionableRows.map((row) => row.id);
  const attemptedUnresolvedIds = attemptedRows.map((row) => row.id);
  const enqueueableIds = enqueueableRows.map((row) => row.id);
  const blockedIds = gapRows.filter((row) => !row.hasWebsite).map((row) => row.id);
  return {
    ids,
    count: ids.length,
    actionableIds,
    actionableCount: actionableIds.length,
    attemptedUnresolvedIds,
    attemptedUnresolvedCount: attemptedUnresolvedIds.length,
    enqueueableIds,
    enqueueableCount: enqueueableIds.length,
    blockedIds,
    blockedCount: blockedIds.length,
    digest: digestIds(ids),
    actionableDigest: digestIds(actionableIds),
    attemptedUnresolvedDigest: digestIds(attemptedUnresolvedIds),
    enqueueableDigest: digestIds(enqueueableIds),
  };
}

function summarizeGroupedCoverage(rows, keysForRow) {
  const groups = new Map();
  for (const row of rows) {
    const keys = [...new Set(keysForRow(row).map((key) => normalizedGroupKey(key, "_unknown")))];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
  }
  return [...groups]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, members]) => summarizeCoverageGroup(key, members));
}

function summarizeCoverageGroup(key, rows) {
  const total = rows.length;
  const fields = Object.fromEntries(ENRICHMENT_FIELDS.map((field) => {
    const property = FIELD_PROPERTY[field];
    const covered = rows.filter((row) => row[property]).length;
    return [field, {
      covered,
      missing: total - covered,
      coveragePct: percentage(covered, total),
    }];
  }));
  return { key, total, fields };
}

function compareCoverageGroups(beforeGroups, afterGroups) {
  const before = new Map(beforeGroups.map((group) => [group.key, group]));
  const after = new Map(afterGroups.map((group) => [group.key, group]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => compareCoverageGroup(
      before.get(key) || emptyCoverageGroup(key),
      after.get(key) || emptyCoverageGroup(key),
    ));
}

function compareCoverageGroup(before, after) {
  return {
    key: before.key || after.key,
    beforeTotal: before.total,
    afterTotal: after.total,
    totalDelta: after.total - before.total,
    fields: Object.fromEntries(ENRICHMENT_FIELDS.map((field) => [field, {
      beforeCovered: before.fields[field].covered,
      afterCovered: after.fields[field].covered,
      coveredDelta: after.fields[field].covered - before.fields[field].covered,
      beforePct: before.fields[field].coveragePct,
      afterPct: after.fields[field].coveragePct,
      percentagePointDelta: round(after.fields[field].coveragePct - before.fields[field].coveragePct, 2),
    }])),
  };
}

function emptyCoverageGroup(key) {
  return summarizeCoverageGroup(key, []);
}

function planRows(plan) {
  return plan.tasks.flatMap((task) => task.candidateIds.map((entityId) => ({
    task_type: task.taskType,
    entity_id: entityId,
    priority: task.priority,
    max_attempts: task.maxAttempts,
    payload: {
      schema_version: ENRICHMENT_CENSUS_VERSION,
      campaign: plan.campaign,
      census_snapshot: plan.snapshotDigest,
      candidate_digest: task.candidateDigest,
      coverage_task: task.taskType,
      ...(task.taskType === "menu_extract" ? {
        prompt_version: ENRICHMENT_MENU_PROMPT_VERSION,
        gap_kind: task.candidateGapKinds?.[String(entityId)] || "menu_missing",
      } : {}),
    },
  })));
}

function coverageTable(before, after) {
  const lines = [
    "| Field | Before covered | Before % | After covered | After % | Δ pp |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const field of ENRICHMENT_FIELDS) {
    const earlier = before.fields[field];
    const later = after?.fields[field] || earlier;
    lines.push(
      `| ${field} | ${formatInteger(earlier.covered)}/${formatInteger(before.total)} | ${formatPct(earlier.coveragePct)} | ${formatInteger(later.covered)}/${formatInteger(after?.total ?? before.total)} | ${formatPct(later.coveragePct)} | ${formatSigned(round(later.coveragePct - earlier.coveragePct, 2))} |`,
    );
  }
  return lines;
}

function groupCoverageTable(beforeGroups, afterGroups = null, groupLabel) {
  const before = new Map(beforeGroups.map((group) => [group.key, group]));
  const after = new Map((afterGroups || beforeGroups).map((group) => [group.key, group]));
  const keys = [...new Set([...before.keys(), ...after.keys()])]
    .sort((left, right) => left.localeCompare(right));
  const lines = [
    `| ${groupLabel} | Field | Before | Before % | After | After % | Δ pp |`,
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const key of keys) {
    const earlier = before.get(key) || emptyCoverageGroup(key);
    const later = after.get(key) || emptyCoverageGroup(key);
    for (const field of ENRICHMENT_FIELDS) {
      lines.push(
        `| ${escapeCell(key)} | ${field} | ${formatInteger(earlier.fields[field].covered)}/${formatInteger(earlier.total)} | ${formatPct(earlier.fields[field].coveragePct)} | ${formatInteger(later.fields[field].covered)}/${formatInteger(later.total)} | ${formatPct(later.fields[field].coveragePct)} | ${formatSigned(round(later.fields[field].coveragePct - earlier.fields[field].coveragePct, 2))} |`,
      );
    }
  }
  return lines;
}

function snapshotRow(snapshot) {
  return `| ${escapeCell(snapshot.label)} | ${snapshot.capturedAt || "not supplied"} | ${formatInteger(snapshot.population.eligible)} | ${formatInteger(snapshot.population.nonVirtual)} | ${formatInteger(snapshot.population.virtual)} | ${snapshot.digest} |`;
}

function digestSnapshot(rows) {
  return sha256(rows.map((row) => ({
    id: row.id,
    countryCode: row.countryCode,
    isVirtual: row.isVirtual,
    sourceSlugs: row.sourceSlugs,
    fields: ENRICHMENT_FIELDS.map((field) => Boolean(row[FIELD_PROPERTY[field]])),
    hasName: row.hasName,
    hasPlaceMatch: row.hasPlaceMatch,
    unclassifiedImageCount: row.unclassifiedImageCount,
    menuCount: row.menuCount,
    pricedCount: row.pricedCount,
    menuExtractionAttempted: row.menuExtractionAttempted,
  })));
}

function digestIds(ids) {
  return sha256(ids.map(Number).sort((left, right) => left - right));
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

function sameIntegerArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sortedUniqueIntegers(values) {
  return [...new Set(values.map(Number))].sort((left, right) => left - right);
}

function normalizedStringArray(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function normalizeActiveMenuTask(row) {
  const payload = typeof row?.payload === "string"
    ? parseJsonObject(row.payload, "active menu task payload")
    : object(row?.payload);
  const status = String(row?.status || "");
  if (!new Set(["pending", "claimed"]).has(status)) {
    throw new TypeError(`Active menu task has unsupported status ${status || "(empty)"}.`);
  }
  return {
    taskId: positiveIntegerString(row?.task_id ?? row?.id, "active menu task id"),
    entityId: positiveInteger(Number(row?.entity_id), "active menu task entity id"),
    runId: row?.run_id == null ? null : positiveIntegerString(row.run_id, "active menu task run id"),
    status,
    payload,
  };
}

function parseJsonObject(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new TypeError(`${label} must be valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(`${label} must be a JSON object.`);
  }
  return parsed;
}

function normalizedGroupKey(value, fallback) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function assertUniqueLocationIds(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) throw new Error(`Duplicate census location ${row.id}.`);
    seen.add(row.id);
  }
}

function assertCensus(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an enrichment census snapshot.`);
  }
  if (value.schemaVersion !== ENRICHMENT_CENSUS_VERSION
      || !Array.isArray(value.locations)
      || !value.coverage
      || !value.gaps
      || !value.imageClassification
      || typeof value.digest !== "string") {
    throw new TypeError(`${label} is not a valid enrichment census snapshot.`);
  }
}

function assertPlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || value.schemaVersion !== ENRICHMENT_CENSUS_VERSION
      || !Array.isArray(value.tasks)
      || typeof value.snapshotDigest !== "string") {
    throw new TypeError("plan must be a valid enrichment enqueue plan.");
  }
}

function optionalIsoTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("capturedAt must be an ISO timestamp.");
  return date.toISOString();
}

function normalizeRunId(value) {
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (Number.isSafeInteger(value) && value > 0) return value;
  throw new TypeError("runId must be a positive integer or decimal integer string.");
}

function positiveIntegerString(value, label) {
  try {
    return String(normalizeRunId(value));
  } catch {
    throw new TypeError(`${label} must be a positive integer or decimal integer string.`);
  }
}

function nonemptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function integer(value, label) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue)) throw new TypeError(`${label} must be an integer.`);
  return numberValue;
}

function positiveInteger(value, label) {
  const numberValue = integer(value, label);
  if (numberValue <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return numberValue;
}

function nonnegativeInteger(value, label) {
  const numberValue = integer(value ?? 0, label);
  if (numberValue < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return numberValue;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function percentage(covered, total) {
  return total === 0 ? 0 : round((covered / total) * 100, 2);
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatSigned(value) {
  const numberValue = Number(value || 0);
  return `${numberValue > 0 ? "+" : ""}${numberValue.toFixed(2)}`;
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
