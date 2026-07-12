BEGIN;

-- Live Google Places reviews use the existing raw source-listing/review shape.
-- Registering the source is required by source_listings/source_reviews FKs.
INSERT INTO fountain.sources (id, slug, trust_weight)
VALUES (
  nextval(pg_get_serial_sequence('fountain.sources', 'id'))::integer,
  'google_places_reviews',
  1.0
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO fountain_raw.source_databases (
  source_slug,
  source_db_path,
  file_size_bytes,
  file_mtime_ms,
  file_sha256,
  listing_count,
  image_count,
  review_count,
  field_count,
  page_count,
  metadata,
  last_synced_at,
  sync_status
)
VALUES (
  'google_places_reviews',
  'google-places://reviews',
  0,
  0,
  NULL,
  0,
  0,
  0,
  0,
  0,
  '{"provider":"google_places","ingest":"reviews_fetch"}'::jsonb,
  NULL,
  'complete'
)
ON CONFLICT (source_slug) DO NOTHING;

COMMIT;
