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
    SELECT offering.location_id, count(*)::integer AS menu_count
    FROM fountain.offerings offering
    WHERE offering.status = 'active'
      AND offering.deleted_at IS NULL
    GROUP BY offering.location_id
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
      COALESCE(review_counts.review_count, 0) AS review_count,
      COALESCE(place_matches.place_match_count, 0) AS place_match_count
    FROM active_non_suppressed location
    LEFT JOIN image_counts ON image_counts.location_id = location.id
    LEFT JOIN menu_counts ON menu_counts.location_id = location.id
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
    WHERE menu_count = 0 AND has_website
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
    SELECT 'geocode'::text AS task_type, id AS entity_id
    FROM coverage
    WHERE NOT is_virtual AND NOT has_geocode AND (has_address OR has_locality)
    UNION ALL
    SELECT 'image_harvest', id
    FROM coverage
    WHERE NOT is_virtual AND image_count = 0 AND has_website
    UNION ALL
    SELECT 'menu_extract', id
    FROM coverage
    WHERE menu_count = 0 AND has_website
  )
  SELECT candidate.task_type, candidate.entity_id
  FROM stage_candidates candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM fountain_ops.task_queue queue
    WHERE queue.task_type = candidate.task_type
      AND queue.entity_type = 'location'
      AND queue.entity_id = candidate.entity_id
      AND queue.payload->>'campaign' = $1
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
    SELECT 'geocode'::text AS task_type, id AS entity_id
    FROM coverage
    WHERE NOT is_virtual AND NOT has_geocode AND (has_address OR has_locality)
    UNION ALL
    SELECT 'image_harvest', id
    FROM coverage
    WHERE NOT is_virtual AND image_count = 0 AND has_website
    UNION ALL
    SELECT 'menu_extract', id
    FROM coverage
    WHERE menu_count = 0 AND has_website
  ),
  live_candidates AS MATERIALIZED (
    SELECT candidate.task_type, candidate.entity_id
    FROM stage_candidates candidate
    WHERE NOT EXISTS (
      SELECT 1
      FROM fountain_ops.task_queue queue
      WHERE queue.task_type = candidate.task_type
        AND queue.entity_type = 'location'
        AND queue.entity_id = candidate.entity_id
        AND queue.payload->>'campaign' = $4
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
  const normalizedPriority = integer(priority, "priority");
  const normalizedMaxAttempts = positiveInteger(maxAttempts, "maxAttempts");
  const tasks = ENRICHMENT_TASK_TYPES.map((taskType) => {
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
  const normalizedPriority = integer(priority, "priority");
  const normalizedMaxAttempts = positiveInteger(maxAttempts, "maxAttempts");
  const candidates = candidateRows.map((row) => ({
    taskType: String(row?.task_type || ""),
    entityId: positiveInteger(Number(row?.entity_id), "candidate entity id"),
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
    if (!snapshot.gaps[candidate.taskType].actionableIds.includes(candidate.entityId)) {
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
    const actionable = new Set(liveSnapshot.gaps[task.taskType].actionableIds);
    if (task.candidateDigest !== digestIds(task.candidateIds)
        || task.candidateIds.some((id) => !actionable.has(id))) {
      throw new Error(`Post-contact candidate drift for ${task.taskType}.`);
    }
    if (task.candidateCount > 0 && !implemented.has(task.taskType)) {
      throw new Error(`Task handler ${task.taskType} is not implemented; refusing enqueue.`);
    }
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
      "| Task | Exact gaps | Planned actionable | Blocked dependency | Candidate digest |",
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
  const reviewCount = nonnegativeInteger(row?.review_count, "review count");
  const placeMatchCount = nonnegativeInteger(row?.place_match_count, "place match count");
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

function normalizedStringArray(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
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
