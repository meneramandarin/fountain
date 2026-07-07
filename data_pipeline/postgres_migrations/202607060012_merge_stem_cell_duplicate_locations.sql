-- Merge exact duplicate stem-cell location rows that were created before
-- marketplace-mode Postgres became the source of truth.

DELETE FROM __CANONICAL_SCHEMA__.treatment_aliases
WHERE alias_normalized IN ('stem cell clinic', 'stem cell clinics')
   OR lower(alias_text) IN ('stem cell clinic', 'stem cell clinics');

CREATE TEMP TABLE fountain_stem_cell_location_merge_plan (
    keep_id INTEGER NOT NULL,
    delete_id INTEGER PRIMARY KEY,
    name_key TEXT NOT NULL,
    locality_key TEXT NOT NULL,
    country_key TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO fountain_stem_cell_location_merge_plan(keep_id, delete_id, name_key, locality_key, country_key)
WITH scored AS (
    SELECT
        l.id,
        lower(regexp_replace(trim(coalesce(l.name, '')), '[[:space:]]+', ' ', 'g')) AS name_key,
        lower(regexp_replace(trim(coalesce(l.locality, '')), '[[:space:]]+', ' ', 'g')) AS locality_key,
        lower(trim(coalesce(l.country_code, ''))) AS country_key,
        coalesce(offering_stats.priced_offerings, 0) AS priced_offerings,
        coalesce(offering_stats.offerings, 0) AS offerings,
        coalesce(image_stats.images, 0) AS images,
        coalesce(external_review_stats.external_reviews, 0) AS external_reviews,
        coalesce(review_stats.reviews, 0) AS reviews,
        coalesce(source_record_stats.source_records, 0) AS source_records,
        coalesce(l.review_count, 0) AS review_count,
        CASE WHEN NULLIF(l.website, '') IS NOT NULL THEN 1 ELSE 0 END AS has_website,
        CASE WHEN NULLIF(l.address, '') IS NOT NULL THEN 1 ELSE 0 END AS has_address
    FROM __CANONICAL_SCHEMA__.locations l
    LEFT JOIN LATERAL (
        SELECT
            count(*) FILTER (WHERE o.price_amount IS NOT NULL)::INTEGER AS priced_offerings,
            count(*)::INTEGER AS offerings
        FROM __CANONICAL_SCHEMA__.offerings o
        WHERE o.location_id = l.id
    ) offering_stats ON true
    LEFT JOIN LATERAL (
        SELECT count(*)::INTEGER AS images
        FROM __CANONICAL_SCHEMA__.images i
        WHERE i.entity_type = 'location'
          AND i.entity_id = l.id
    ) image_stats ON true
    LEFT JOIN LATERAL (
        SELECT count(*)::INTEGER AS external_reviews
        FROM __CANONICAL_SCHEMA__.external_reviews er
        WHERE er.location_id = l.id
    ) external_review_stats ON true
    LEFT JOIN LATERAL (
        SELECT count(*)::INTEGER AS reviews
        FROM __CANONICAL_SCHEMA__.reviews r
        WHERE r.location_id = l.id
    ) review_stats ON true
    LEFT JOIN LATERAL (
        SELECT count(*)::INTEGER AS source_records
        FROM __CANONICAL_SCHEMA__.source_records sr
        WHERE sr.entity_type = 'location'
          AND sr.entity_id = l.id
    ) source_record_stats ON true
    WHERE l.name ILIKE '%stem cell%'
      AND coalesce(l.status, 'active') = 'active'
      AND l.deleted_at IS NULL
      AND NULLIF(trim(coalesce(l.locality, '')), '') IS NOT NULL
      AND NULLIF(trim(coalesce(l.country_code, '')), '') IS NOT NULL
),
clusters AS (
    SELECT name_key, locality_key, country_key
    FROM scored
    GROUP BY name_key, locality_key, country_key
    HAVING count(*) > 1
),
ranked AS (
    SELECT
        s.*,
        first_value(s.id) OVER (
            PARTITION BY s.name_key, s.locality_key, s.country_key
            ORDER BY
                s.priced_offerings DESC,
                s.offerings DESC,
                s.images DESC,
                s.external_reviews DESC,
                s.reviews DESC,
                s.source_records DESC,
                s.review_count DESC,
                s.has_website DESC,
                s.has_address DESC,
                s.id ASC
        ) AS keep_id
    FROM scored s
    JOIN clusters c USING (name_key, locality_key, country_key)
)
SELECT keep_id, id AS delete_id, name_key, locality_key, country_key
FROM ranked
WHERE id <> keep_id
ORDER BY keep_id, id;

DO $$
DECLARE
    duplicate_row RECORD;
BEGIN
    FOR duplicate_row IN
        SELECT keep_id, delete_id
        FROM fountain_stem_cell_location_merge_plan
        ORDER BY keep_id, delete_id
    LOOP
        UPDATE __CANONICAL_SCHEMA__.offerings keep_offering
        SET
            treatment_id = coalesce(keep_offering.treatment_id, delete_offering.treatment_id),
            price_amount = coalesce(keep_offering.price_amount, delete_offering.price_amount),
            price_currency = coalesce(NULLIF(keep_offering.price_currency, ''), delete_offering.price_currency),
            source_offer_url = coalesce(NULLIF(keep_offering.source_offer_url, ''), delete_offering.source_offer_url)
        FROM __CANONICAL_SCHEMA__.offerings delete_offering
        WHERE keep_offering.location_id = duplicate_row.keep_id
          AND delete_offering.location_id = duplicate_row.delete_id
          AND keep_offering.source_id IS NOT DISTINCT FROM delete_offering.source_id
          AND coalesce(keep_offering.raw_name, '') = coalesce(delete_offering.raw_name, '')
          AND (
              keep_offering.treatment_id IS NULL AND delete_offering.treatment_id IS NOT NULL
              OR keep_offering.price_amount IS NULL AND delete_offering.price_amount IS NOT NULL
              OR NULLIF(keep_offering.price_currency, '') IS NULL AND NULLIF(delete_offering.price_currency, '') IS NOT NULL
              OR NULLIF(keep_offering.source_offer_url, '') IS NULL AND NULLIF(delete_offering.source_offer_url, '') IS NOT NULL
          );

        PERFORM __CANONICAL_SCHEMA__.merge_locations(
            duplicate_row.keep_id,
            duplicate_row.delete_id,
            NULL,
            'merge exact duplicate stem-cell location rows'
        );
    END LOOP;
END $$;
