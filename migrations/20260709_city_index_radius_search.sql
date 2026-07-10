CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS fountain.city_index (
  city text NOT NULL,
  city_key text NOT NULL,
  region text,
  country_code text NOT NULL,
  country_name text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  listing_count integer NOT NULL DEFAULT 0,
  image_coverage double precision NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (city_key, country_code)
);

CREATE OR REPLACE FUNCTION fountain.refresh_city_index()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  TRUNCATE fountain.city_index;

  INSERT INTO fountain.city_index (
    city,
    city_key,
    region,
    country_code,
    country_name,
    latitude,
    longitude,
    listing_count,
    image_coverage,
    refreshed_at
  )
  WITH active_locations AS (
    SELECT
      l.id,
      trim(l.locality) AS city,
      lower(trim(l.locality)) AS city_key,
      NULLIF(trim(l.region), '') AS region,
      l.country_code,
      NULLIF(trim(l.country_name), '') AS country_name,
      l.latitude,
      l.longitude,
      EXISTS (
        SELECT 1
        FROM fountain.images img
        WHERE img.entity_type = 'location'
          AND img.entity_id = l.id
      ) AS has_image
    FROM fountain.locations l
    WHERE l.status = 'active'
      AND l.deleted_at IS NULL
      AND COALESCE(l.is_virtual, false) = false
      AND l.latitude IS NOT NULL
      AND l.longitude IS NOT NULL
      AND l.locality IS NOT NULL
      AND trim(l.locality) <> ''
      AND l.country_code IS NOT NULL
      AND trim(l.country_code) <> ''
  )
  SELECT
    MIN(city) AS city,
    city_key,
    mode() WITHIN GROUP (ORDER BY region) FILTER (WHERE region IS NOT NULL) AS region,
    country_code,
    mode() WITHIN GROUP (ORDER BY country_name) FILTER (WHERE country_name IS NOT NULL) AS country_name,
    AVG(latitude)::double precision AS latitude,
    AVG(longitude)::double precision AS longitude,
    COUNT(*)::integer AS listing_count,
    (COUNT(*) FILTER (WHERE has_image)::double precision / COUNT(*)::double precision) AS image_coverage,
    now() AS refreshed_at
  FROM active_locations
  GROUP BY city_key, country_code;
END;
$$;

SELECT fountain.refresh_city_index();

CREATE INDEX IF NOT EXISTS idx_city_index_country_city
  ON fountain.city_index (country_code, lower(city));

CREATE INDEX IF NOT EXISTS idx_city_index_city_prefix
  ON fountain.city_index (lower(city) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_city_index_city_trgm
  ON fountain.city_index USING gin (lower(city) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_city_index_listing_rank
  ON fountain.city_index (listing_count DESC, image_coverage DESC);

CREATE INDEX IF NOT EXISTS idx_locations_geo
  ON fountain.locations (latitude, longitude)
  WHERE latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND status = 'active'
    AND deleted_at IS NULL
    AND COALESCE(is_virtual, false) = false;
