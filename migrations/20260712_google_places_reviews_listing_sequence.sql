BEGIN;

-- Source listing ids are scoped by source_slug, but max(id) allocation forces
-- every concurrent reviews worker through one transaction-wide lock. A
-- dedicated sequence keeps allocation collision-free without serializing the
-- rest of each raw/serving write transaction.
CREATE SEQUENCE IF NOT EXISTS fountain_raw.google_places_reviews_listing_id_seq
  AS bigint
  MINVALUE 1;

SELECT setval(
  'fountain_raw.google_places_reviews_listing_id_seq'::regclass,
  GREATEST(
    (
      SELECT COALESCE(max(source_listing_id), 0)::bigint
      FROM fountain_raw.source_listings
      WHERE source_slug = 'google_places_reviews'
    ),
    (SELECT last_value FROM fountain_raw.google_places_reviews_listing_id_seq)
  ),
  true
);

COMMENT ON SEQUENCE fountain_raw.google_places_reviews_listing_id_seq IS
  'Collision-free source_listing_id allocator for concurrent reviews_fetch writes.';

COMMIT;
