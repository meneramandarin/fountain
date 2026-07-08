-- Structural schema streamlining, 2026-07-08.
--
-- Down path:
-- - Backups are written into fountain_raw.schema_streamlining_*_20260708 tables.
-- - Restoring dropped tables/columns is possible from those backups:
--   fountain_raw.schema_streamlining_sources_backup_20260708
--   fountain_raw.schema_streamlining_pre_migration_counts_20260708
--   fountain_raw.schema_streamlining_external_place_matches_text_backup_20260708
--   fountain_raw.schema_streamlining_categories_backup_20260708
--   fountain_raw.schema_streamlining_treatments_backup_20260708
--   fountain_raw.schema_streamlining_images_local_path_backup_20260708
--   fountain_raw.locations_price_text_backup
--   fountain_raw.schema_streamlining_documents_backup_20260708
-- - Pipeline tables are moved, not dropped: move them back with ALTER TABLE ... SET SCHEMA fountain.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_retired_raw_tables_20260708 AS
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  pg_total_relation_size(c.oid) AS total_bytes,
  now() AS retired_at
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'fountain_raw'
  AND c.relkind = 'r'
  AND c.relname = ANY(ARRAY[
    'locations_backup_20260707_places_website_backfill',
    'closeout_locations_backup_20260707',
    'locations_backup_20260707_org_dedup_phase2',
    'locations_backup_20260707_location_normalization',
    'entity_tags_backup_20260707',
    'closeout_organizations_backup_20260707',
    'organizations_backup_20260707_places_website_backfill',
    'organizations_backup_20260707_org_dedup_phase2',
    'closeout_document_search_index_backup_20260707',
    'closeout_documents_backup_20260707',
    'closeout_document_source_records_backup_20260707',
    'service_area_entity_tags_backup_20260707',
    'tags_backup_20260707',
    'service_area_tags_backup_20260707',
    'service_area_entities_backup_20260707'
  ]);

DROP TABLE IF EXISTS
  fountain_raw.locations_backup_20260707_places_website_backfill,
  fountain_raw.closeout_locations_backup_20260707,
  fountain_raw.locations_backup_20260707_org_dedup_phase2,
  fountain_raw.locations_backup_20260707_location_normalization,
  fountain_raw.entity_tags_backup_20260707,
  fountain_raw.closeout_organizations_backup_20260707,
  fountain_raw.organizations_backup_20260707_places_website_backfill,
  fountain_raw.organizations_backup_20260707_org_dedup_phase2,
  fountain_raw.closeout_document_search_index_backup_20260707,
  fountain_raw.closeout_documents_backup_20260707,
  fountain_raw.closeout_document_source_records_backup_20260707,
  fountain_raw.service_area_entity_tags_backup_20260707,
  fountain_raw.tags_backup_20260707,
  fountain_raw.service_area_tags_backup_20260707,
  fountain_raw.service_area_entities_backup_20260707;

COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.schema_streamlining_parse_rating(raw_value text)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  trimmed text := NULLIF(btrim(raw_value), '');
  json_value text;
BEGIN
  IF trimmed IS NULL THEN
    RETURN NULL;
  END IF;

  IF trimmed ~ '^[0-9]+(\.[0-9]+)?$' THEN
    RETURN trimmed::numeric;
  END IF;

  IF trimmed ~ '^\{' THEN
    BEGIN
      json_value := trimmed::jsonb ->> 'ratingValue';
      IF json_value IS NOT NULL AND json_value ~ '^[0-9]+(\.[0-9]+)?$' THEN
        RETURN json_value::numeric;
      END IF;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.schema_streamlining_parse_review_date(raw_value text, fetched_at timestamptz DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
AS $$
DECLARE
  trimmed text := NULLIF(btrim(raw_value), '');
  amount integer;
  unit text;
  match text[];
BEGIN
  IF trimmed IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    IF trimmed ~ '^\d{4}-\d{2}-\d{2}(T|\s|$)' THEN
      RETURN trimmed::timestamptz::date;
    END IF;
  EXCEPTION WHEN others THEN
  END;

  BEGIN
    IF trimmed ~ '^\d{2} [A-Za-z]{3} \d{4}$' THEN
      RETURN to_date(trimmed, 'DD Mon YYYY');
    END IF;
  EXCEPTION WHEN others THEN
  END;

  match := regexp_match(trimmed, '^[A-Za-z]{3}, ([A-Za-z]{3}) ([0-9]{1,2}), ([0-9]{4}) at ');
  IF match IS NOT NULL THEN
    BEGIN
      RETURN to_date(match[2] || ' ' || match[1] || ' ' || match[3], 'DD Mon YYYY');
    EXCEPTION WHEN others THEN
    END;
  END IF;

  IF fetched_at IS NOT NULL THEN
    match := regexp_match(lower(trimmed), '^([0-9]+) (day|days|week|weeks|month|months|year|years) ago$');
    IF match IS NOT NULL THEN
      amount := match[1]::integer;
      unit := match[2];
      IF unit IN ('day', 'days') THEN
        RETURN (fetched_at - make_interval(days => amount))::date;
      ELSIF unit IN ('week', 'weeks') THEN
        RETURN (fetched_at - make_interval(days => amount * 7))::date;
      ELSIF unit IN ('month', 'months') THEN
        RETURN date_trunc('month', fetched_at - make_interval(months => amount))::date;
      ELSIF unit IN ('year', 'years') THEN
        RETURN date_trunc('month', fetched_at - make_interval(years => amount))::date;
      END IF;
    END IF;

    match := regexp_match(lower(trimmed), '^(a|an) (day|week|month|year|hour) ago$');
    IF match IS NOT NULL THEN
      unit := match[2];
      IF unit = 'hour' THEN
        RETURN fetched_at::date;
      ELSIF unit = 'day' THEN
        RETURN (fetched_at - interval '1 day')::date;
      ELSIF unit = 'week' THEN
        RETURN (fetched_at - interval '1 week')::date;
      ELSIF unit = 'month' THEN
        RETURN date_trunc('month', fetched_at - interval '1 month')::date;
      ELSIF unit = 'year' THEN
        RETURN date_trunc('month', fetched_at - interval '1 year')::date;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_sources_backup_20260708 AS
SELECT * FROM fountain.sources;

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_pre_migration_counts_20260708 AS
SELECT
  now() AS captured_at,
  (SELECT COUNT(*)::integer FROM fountain.reviews) AS reviews_before,
  (SELECT COUNT(*)::integer FROM fountain.external_reviews) AS external_reviews_before,
  (SELECT COUNT(*)::integer FROM fountain.external_place_matches) AS external_place_matches_before,
  (SELECT COUNT(*)::integer FROM fountain.images WHERE local_path IS NOT NULL AND local_path <> '') AS images_local_path_nonempty_before,
  (SELECT COUNT(*)::integer FROM fountain.locations WHERE price_text IS NOT NULL AND price_text <> '') AS locations_price_text_nonempty_before,
  (SELECT COUNT(*)::integer FROM fountain.documents) AS documents_before;

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_external_place_matches_text_backup_20260708 AS
SELECT location_id, provider, fetched_at, expires_at, raw_json
FROM fountain.external_place_matches;

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_categories_backup_20260708 AS
SELECT * FROM fountain.categories;

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_treatments_backup_20260708 AS
SELECT * FROM fountain.treatments;

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_images_local_path_backup_20260708 AS
SELECT id, local_path
FROM fountain.images
WHERE local_path IS NOT NULL
  AND local_path <> '';

CREATE TABLE IF NOT EXISTS fountain_raw.locations_price_text_backup AS
SELECT id, name, slug, price_text, now() AS backed_up_at
FROM fountain.locations
WHERE price_text IS NOT NULL
  AND price_text <> '';

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_documents_backup_20260708 AS
SELECT * FROM fountain.documents;

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_review_format_audit_20260708 AS
SELECT
  'external_reviews'::text AS source_table,
  provider,
  COUNT(*)::integer AS total_rows,
  COUNT(*) FILTER (WHERE review_date ~ '^\d{4}-\d{2}-\d{2}T')::integer AS timestamp_review_dates,
  COUNT(*) FILTER (WHERE review_date ~ '^[0-9]+ (day|days|week|weeks|month|months|year|years) ago$')::integer AS relative_review_dates,
  COUNT(*) FILTER (WHERE review_date ~ '^(a|an) (day|week|month|year|hour) ago$')::integer AS singular_relative_review_dates,
  COUNT(*) FILTER (WHERE pg_temp.schema_streamlining_parse_review_date(review_date, NULLIF(fetched_at, '')::timestamptz) IS NULL)::integer AS unparseable_review_dates,
  COUNT(*) FILTER (WHERE rating IS NULL)::integer AS null_ratings,
  0::integer AS unparseable_ratings
FROM fountain.external_reviews
GROUP BY provider
UNION ALL
SELECT
  'reviews'::text AS source_table,
  'scrape'::text AS provider,
  COUNT(*)::integer AS total_rows,
  COUNT(*) FILTER (WHERE review_date ~ '^\d{4}-\d{2}-\d{2}(T|\s|$)')::integer AS timestamp_review_dates,
  0::integer AS relative_review_dates,
  0::integer AS singular_relative_review_dates,
  COUNT(*) FILTER (WHERE pg_temp.schema_streamlining_parse_review_date(review_date, created_at) IS NULL)::integer AS unparseable_review_dates,
  COUNT(*) FILTER (WHERE rating IS NULL)::integer AS null_ratings,
  COUNT(*) FILTER (WHERE rating IS NOT NULL AND pg_temp.schema_streamlining_parse_rating(rating) IS NULL)::integer AS unparseable_ratings
FROM fountain.reviews;

ALTER TABLE fountain.reviews
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'scrape',
  ADD COLUMN IF NOT EXISTS provider_place_id text,
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

ALTER TABLE fountain.reviews
  RENAME COLUMN reviewer TO author;

ALTER TABLE fountain.reviews
  RENAME COLUMN body TO text;

ALTER TABLE fountain.reviews
  ALTER COLUMN rating TYPE numeric USING pg_temp.schema_streamlining_parse_rating(rating),
  ALTER COLUMN review_date TYPE date USING pg_temp.schema_streamlining_parse_review_date(review_date, created_at);

CREATE TEMP TABLE schema_streamlining_external_reviews_prepared AS
WITH normalized AS (
  SELECT
    er.id AS external_review_id,
    er.location_id,
    er.provider,
    epm.provider_place_id,
    er.reviewer AS author,
    er.rating::numeric AS rating,
    pg_temp.schema_streamlining_parse_review_date(er.review_date, NULLIF(er.fetched_at, '')::timestamptz) AS review_date,
    er.body AS text,
    NULLIF(er.fetched_at, '')::timestamptz AS fetched_at,
    jsonb_strip_nulls(jsonb_build_object(
      'legacy_external_review_id', er.id,
      'provider_review_id', er.provider_review_id,
      'source_url', er.source_url,
      'expires_at', er.expires_at,
      'raw_json', CASE WHEN er.raw_json IS NOT NULL AND er.raw_json <> '' THEN er.raw_json::jsonb ELSE NULL END,
      'legacy_review_date', er.review_date
    )) AS raw_payload,
    lower(btrim(COALESCE(er.reviewer, ''))) AS author_key,
    lower(btrim(COALESCE(er.body, ''))) AS text_key,
    ROW_NUMBER() OVER (
      PARTITION BY er.location_id, lower(btrim(COALESCE(er.reviewer, ''))), lower(btrim(COALESCE(er.body, '')))
      ORDER BY pg_temp.schema_streamlining_parse_review_date(er.review_date, NULLIF(er.fetched_at, '')::timestamptz) DESC NULLS LAST, er.id DESC
    ) AS external_rank
  FROM fountain.external_reviews er
  LEFT JOIN fountain.external_place_matches epm
    ON epm.location_id = er.location_id
   AND epm.provider = er.provider
)
SELECT *,
  EXISTS (
    SELECT 1
    FROM fountain.reviews r
    WHERE r.location_id IS NOT DISTINCT FROM normalized.location_id
      AND lower(btrim(COALESCE(r.author, ''))) = normalized.author_key
      AND lower(btrim(COALESCE(r.text, ''))) = normalized.text_key
  ) AS duplicate_existing
FROM normalized;

ALTER TABLE fountain.reviews DISABLE TRIGGER trg_audit_entity_change;

INSERT INTO fountain.reviews (
  location_id,
  provider,
  provider_place_id,
  author,
  rating,
  review_date,
  text,
  source_id,
  status,
  data_origin,
  verification_status,
  created_at,
  updated_at,
  deleted_at,
  owner_account_id,
  fetched_at,
  raw_payload
)
SELECT
  location_id,
  provider,
  provider_place_id,
  author,
  rating,
  review_date,
  text,
  NULL,
  'active',
  'imported',
  'unverified',
  COALESCE(fetched_at, now()),
  COALESCE(fetched_at, now()),
  NULL,
  NULL,
  fetched_at,
  raw_payload
FROM schema_streamlining_external_reviews_prepared
WHERE external_rank = 1
  AND duplicate_existing = false;

ALTER TABLE fountain.reviews ENABLE TRIGGER trg_audit_entity_change;

CREATE TABLE IF NOT EXISTS fountain_raw.schema_streamlining_review_migration_audit_20260708 AS
SELECT
  (SELECT reviews_before FROM fountain_raw.schema_streamlining_pre_migration_counts_20260708 LIMIT 1) AS scrape_reviews_before,
  (SELECT external_reviews_before FROM fountain_raw.schema_streamlining_pre_migration_counts_20260708 LIMIT 1) AS external_reviews_before,
  (SELECT COUNT(*)::integer FROM schema_streamlining_external_reviews_prepared WHERE external_rank = 1 AND duplicate_existing = false) AS external_reviews_inserted,
  (SELECT COUNT(*)::integer FROM schema_streamlining_external_reviews_prepared WHERE external_rank > 1 OR duplicate_existing = true) AS external_reviews_deduped,
  (SELECT COUNT(*)::integer FROM schema_streamlining_external_reviews_prepared WHERE review_date IS NULL) AS external_review_dates_null_after_parse,
  (SELECT COUNT(*)::integer FROM fountain.reviews WHERE provider = 'scrape' AND rating IS NULL) AS scrape_ratings_null_after_parse,
  (SELECT COUNT(*)::integer FROM fountain.reviews WHERE provider = 'scrape' AND review_date IS NULL) AS scrape_review_dates_null_after_parse,
  (SELECT COUNT(*)::integer FROM fountain.reviews) AS reviews_after;

CREATE OR REPLACE FUNCTION fountain.attach_location_image(
  p_location_id integer,
  p_blob_url text,
  p_image_url text DEFAULT NULL::text,
  p_alt text DEFAULT NULL::text,
  p_source_id integer DEFAULT NULL::integer,
  p_actor_id uuid DEFAULT NULL::uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_image_id integer;
BEGIN
  IF COALESCE(p_blob_url, '') = '' THEN
    RAISE EXCEPTION 'p_blob_url is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM fountain.locations WHERE id = p_location_id) THEN
    RAISE EXCEPTION 'Location % does not exist', p_location_id;
  END IF;

  PERFORM fountain.set_mutation_actor(p_actor_id, 'admin');

  INSERT INTO fountain.images(
    entity_type,
    entity_id,
    image_url,
    blob_url,
    alt,
    source_id,
    data_origin,
    verification_status
  )
  VALUES (
    'location',
    p_location_id,
    p_image_url,
    p_blob_url,
    p_alt,
    p_source_id,
    'manual',
    'unverified'
  )
  RETURNING id INTO new_image_id;

  RETURN new_image_id;
END;
$$;

CREATE OR REPLACE FUNCTION fountain.create_location(p_location jsonb, p_actor_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_location_id integer;
BEGIN
  PERFORM fountain.set_mutation_actor(p_actor_id, 'admin');

  INSERT INTO fountain.locations(
    org_id,
    name,
    address,
    locality,
    region,
    postal_code,
    country_code,
    country_name,
    latitude,
    longitude,
    phone,
    email,
    website,
    rating,
    review_count,
    dedup_key,
    data_origin,
    owner_account_id,
    verification_status
  )
  VALUES (
    NULLIF(p_location->>'org_id', '')::integer,
    NULLIF(p_location->>'name', ''),
    NULLIF(p_location->>'address', ''),
    NULLIF(p_location->>'locality', ''),
    NULLIF(p_location->>'region', ''),
    NULLIF(p_location->>'postal_code', ''),
    NULLIF(p_location->>'country_code', ''),
    NULLIF(p_location->>'country_name', ''),
    NULLIF(p_location->>'latitude', '')::double precision,
    NULLIF(p_location->>'longitude', '')::double precision,
    NULLIF(p_location->>'phone', ''),
    NULLIF(p_location->>'email', ''),
    NULLIF(p_location->>'website', ''),
    NULLIF(p_location->>'rating', '')::double precision,
    NULLIF(p_location->>'review_count', '')::integer,
    NULLIF(p_location->>'dedup_key', ''),
    COALESCE(NULLIF(p_location->>'data_origin', ''), 'manual'),
    NULLIF(p_location->>'owner_account_id', '')::uuid,
    COALESCE(NULLIF(p_location->>'verification_status', ''), 'unverified')
  )
  RETURNING id INTO new_location_id;

  RETURN new_location_id;
END;
$$;

CREATE OR REPLACE FUNCTION fountain.delete_location_cascade(
  p_location_id integer,
  p_actor_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  affected_practitioner_id integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fountain.locations WHERE id = p_location_id) THEN
    RAISE EXCEPTION 'Location % does not exist', p_location_id;
  END IF;

  PERFORM fountain.set_mutation_actor(p_actor_id, 'admin');

  CREATE TEMP TABLE IF NOT EXISTS fountain_affected_practitioners(
    practitioner_id integer PRIMARY KEY
  ) ON COMMIT DROP;
  TRUNCATE fountain_affected_practitioners;

  INSERT INTO fountain_affected_practitioners(practitioner_id)
  SELECT DISTINCT practitioner_id
  FROM fountain.affiliations
  WHERE location_id = p_location_id
  ON CONFLICT DO NOTHING;

  DELETE FROM fountain.search_index WHERE entity_type = 'location' AND entity_id = p_location_id;
  DELETE FROM fountain.images WHERE entity_type = 'location' AND entity_id = p_location_id;
  DELETE FROM fountain.entity_tags WHERE entity_type = 'location' AND entity_id = p_location_id;
  DELETE FROM fountain.source_records WHERE entity_type = 'location' AND entity_id = p_location_id;
  DELETE FROM fountain.external_place_matches WHERE location_id = p_location_id;
  DELETE FROM fountain.reviews WHERE location_id = p_location_id;
  DELETE FROM fountain.offerings WHERE location_id = p_location_id;
  DELETE FROM fountain.affiliations WHERE location_id = p_location_id;
  DELETE FROM fountain.locations WHERE id = p_location_id;

  INSERT INTO fountain.entity_change_events(entity_type, entity_id, action, actor_type, actor_id, reason)
  VALUES ('location', p_location_id, 'delete_location_cascade', 'admin', p_actor_id, p_reason);

  FOR affected_practitioner_id IN SELECT practitioner_id FROM fountain_affected_practitioners LOOP
    PERFORM fountain.refresh_search_index_for_practitioner(affected_practitioner_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fountain.merge_locations(
  p_keep_location_id integer,
  p_delete_location_id integer,
  p_actor_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  affected_practitioner_id integer;
BEGIN
  IF p_keep_location_id = p_delete_location_id THEN
    RAISE EXCEPTION 'Cannot merge location % into itself', p_keep_location_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM fountain.locations WHERE id = p_keep_location_id) THEN
    RAISE EXCEPTION 'Keep location % does not exist', p_keep_location_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM fountain.locations WHERE id = p_delete_location_id) THEN
    RAISE EXCEPTION 'Delete location % does not exist', p_delete_location_id;
  END IF;

  PERFORM fountain.set_mutation_actor(p_actor_id, 'admin');

  CREATE TEMP TABLE IF NOT EXISTS fountain_affected_practitioners(
    practitioner_id integer PRIMARY KEY
  ) ON COMMIT DROP;
  TRUNCATE fountain_affected_practitioners;

  INSERT INTO fountain_affected_practitioners(practitioner_id)
  SELECT DISTINCT practitioner_id
  FROM fountain.affiliations
  WHERE location_id IN (p_keep_location_id, p_delete_location_id)
  ON CONFLICT DO NOTHING;

  UPDATE fountain.locations keep_location
  SET
    org_id = COALESCE(keep_location.org_id, delete_location.org_id),
    name = COALESCE(NULLIF(keep_location.name, ''), delete_location.name),
    address = COALESCE(NULLIF(keep_location.address, ''), delete_location.address),
    locality = COALESCE(NULLIF(keep_location.locality, ''), delete_location.locality),
    region = COALESCE(NULLIF(keep_location.region, ''), delete_location.region),
    postal_code = COALESCE(NULLIF(keep_location.postal_code, ''), delete_location.postal_code),
    country_code = COALESCE(NULLIF(keep_location.country_code, ''), delete_location.country_code),
    country_name = COALESCE(NULLIF(keep_location.country_name, ''), delete_location.country_name),
    latitude = COALESCE(keep_location.latitude, delete_location.latitude),
    longitude = COALESCE(keep_location.longitude, delete_location.longitude),
    phone = COALESCE(NULLIF(keep_location.phone, ''), delete_location.phone),
    email = COALESCE(NULLIF(keep_location.email, ''), delete_location.email),
    website = COALESCE(NULLIF(keep_location.website, ''), delete_location.website),
    rating = COALESCE(keep_location.rating, delete_location.rating),
    review_count = GREATEST(COALESCE(keep_location.review_count, 0), COALESCE(delete_location.review_count, 0)),
    verification_status = CASE
      WHEN keep_location.verification_status = 'unverified' THEN delete_location.verification_status
      ELSE keep_location.verification_status
    END
  FROM fountain.locations delete_location
  WHERE keep_location.id = p_keep_location_id
    AND delete_location.id = p_delete_location_id;

  DELETE FROM fountain.offerings loser
  USING fountain.offerings winner
  WHERE loser.location_id = p_delete_location_id
    AND winner.location_id = p_keep_location_id
    AND winner.source_id IS NOT DISTINCT FROM loser.source_id
    AND COALESCE(winner.raw_name, '') = COALESCE(loser.raw_name, '');

  UPDATE fountain.offerings SET location_id = p_keep_location_id WHERE location_id = p_delete_location_id;

  INSERT INTO fountain.entity_tags(entity_type, entity_id, tag_id)
  SELECT entity_type, p_keep_location_id, tag_id
  FROM fountain.entity_tags
  WHERE entity_type = 'location'
    AND entity_id = p_delete_location_id
  ON CONFLICT DO NOTHING;

  DELETE FROM fountain.entity_tags
  WHERE entity_type = 'location'
    AND entity_id = p_delete_location_id;

  DELETE FROM fountain.images loser
  USING fountain.images winner
  WHERE loser.entity_type = 'location'
    AND loser.entity_id = p_delete_location_id
    AND winner.entity_type = 'location'
    AND winner.entity_id = p_keep_location_id
    AND winner.blob_url = loser.blob_url;

  UPDATE fountain.images
  SET entity_id = p_keep_location_id
  WHERE entity_type = 'location'
    AND entity_id = p_delete_location_id;

  UPDATE fountain.source_records
  SET entity_id = p_keep_location_id
  WHERE entity_type = 'location'
    AND entity_id = p_delete_location_id;

  UPDATE fountain.reviews
  SET location_id = p_keep_location_id
  WHERE location_id = p_delete_location_id;

  DELETE FROM fountain.external_place_matches loser
  USING fountain.external_place_matches winner
  WHERE loser.location_id = p_delete_location_id
    AND winner.location_id = p_keep_location_id
    AND winner.provider = loser.provider;

  UPDATE fountain.external_place_matches
  SET location_id = p_keep_location_id
  WHERE location_id = p_delete_location_id;

  DELETE FROM fountain.affiliations loser
  USING fountain.affiliations winner
  WHERE loser.location_id = p_delete_location_id
    AND winner.location_id = p_keep_location_id
    AND winner.practitioner_id = loser.practitioner_id
    AND winner.org_id IS NOT DISTINCT FROM loser.org_id;

  UPDATE fountain.affiliations SET location_id = p_keep_location_id WHERE location_id = p_delete_location_id;
  UPDATE fountain.clinic_claims SET location_id = p_keep_location_id WHERE location_id = p_delete_location_id;
  UPDATE fountain.listing_submissions
  SET target_entity_id = p_keep_location_id
  WHERE target_entity_type = 'location'
    AND target_entity_id = p_delete_location_id;

  DELETE FROM fountain.search_index WHERE entity_type = 'location' AND entity_id = p_delete_location_id;
  DELETE FROM fountain.locations WHERE id = p_delete_location_id;

  INSERT INTO fountain.entity_change_events(entity_type, entity_id, action, actor_type, actor_id, reason, metadata)
  VALUES (
    'location',
    p_keep_location_id,
    'merge_locations',
    'admin',
    p_actor_id,
    p_reason,
    jsonb_build_object('deleted_location_id', p_delete_location_id)
  );

  PERFORM fountain.refresh_search_index_for_location(p_keep_location_id);

  FOR affected_practitioner_id IN SELECT practitioner_id FROM fountain_affected_practitioners LOOP
    PERFORM fountain.refresh_search_index_for_practitioner(affected_practitioner_id);
  END LOOP;
END;
$$;

DROP TABLE fountain.external_reviews;

ALTER TABLE fountain.external_place_matches
  ALTER COLUMN fetched_at TYPE timestamptz USING NULLIF(fetched_at, '')::timestamptz,
  ALTER COLUMN expires_at TYPE timestamptz USING NULLIF(expires_at, '')::timestamptz,
  ALTER COLUMN raw_json TYPE jsonb USING CASE WHEN raw_json IS NULL OR raw_json = '' THEN NULL ELSE raw_json::jsonb END;

ALTER TABLE fountain.treatments
  ADD COLUMN IF NOT EXISTS category text;

UPDATE fountain.treatments t
SET category = c.name
FROM fountain.categories c
WHERE c.id = t.category_id
  AND t.category IS DISTINCT FROM c.name;

ALTER TABLE fountain.treatments
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE fountain.treatments
  DROP CONSTRAINT IF EXISTS treatments_category_id_fkey,
  DROP COLUMN IF EXISTS category_id;

DROP TABLE fountain.categories;

DO $$
BEGIN
  IF to_regclass('fountain.unmapped_terms') IS NOT NULL THEN
    ALTER TABLE fountain.unmapped_terms SET SCHEMA fountain_raw;
  END IF;
  IF to_regclass('fountain.unmapped_terms_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE fountain.unmapped_terms_id_seq SET SCHEMA fountain_raw;
  END IF;

  IF to_regclass('fountain.treatment_aliases') IS NOT NULL THEN
    ALTER TABLE fountain.treatment_aliases SET SCHEMA fountain_raw;
  END IF;
  IF to_regclass('fountain.treatment_aliases_id_seq') IS NOT NULL THEN
    ALTER SEQUENCE fountain.treatment_aliases_id_seq SET SCHEMA fountain_raw;
  END IF;

  IF to_regclass('fountain.import_metadata') IS NOT NULL THEN
    ALTER TABLE fountain.import_metadata SET SCHEMA fountain_raw;
  END IF;
END;
$$;

ALTER TABLE fountain.sources
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS base_url,
  DROP COLUMN IF EXISTS scraped_at,
  DROP COLUMN IF EXISTS record_count;

ALTER TABLE fountain.images
  DROP CONSTRAINT IF EXISTS images_blob_backed,
  DROP COLUMN IF EXISTS local_path;

ALTER TABLE fountain.images
  ADD CONSTRAINT images_blob_backed CHECK (blob_url IS NOT NULL AND blob_url <> '');

ALTER TABLE fountain.locations
  DROP COLUMN IF EXISTS price_text;

ALTER TABLE fountain.accounts
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_auth_user_id_key
  ON fountain.accounts(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_auth_user_id_fkey'
      AND conrelid = 'fountain.accounts'::regclass
  ) THEN
    ALTER TABLE fountain.accounts
      ADD CONSTRAINT accounts_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES neon_auth."user"(id) ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN fountain.accounts.auth_user_id IS
  'Neon Auth user id. neon_auth owns authentication; fountain.accounts owns product profile and ownership.';

COMMENT ON TABLE fountain.accounts IS
  'Product account/profile table. Authentication identity is owned by neon_auth and linked through auth_user_id.';

DROP TABLE IF EXISTS fountain.documents CASCADE;

SELECT setval(
  pg_get_serial_sequence('fountain.reviews', 'id'),
  COALESCE((SELECT MAX(id) FROM fountain.reviews), 1),
  true
);

COMMIT;
