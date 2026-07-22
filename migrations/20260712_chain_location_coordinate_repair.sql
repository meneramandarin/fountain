-- Repair branch coordinates after chain-location deconflation and prevent stale
-- coordinates from surviving future physical-address changes.
--
-- Coordinate evidence was collected on 2026-07-12 without the Google Maps API:
-- - exact/subaddress/POI matches from the ArcGIS World Geocoder;
-- - OpenStreetMap for the exact Sonder Business Bay building;
-- - the smallest verified locality for House of Gaia's non-street Lipa address.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'chain_location_coordinate_repair_20260712'
);

CREATE TABLE IF NOT EXISTS fountain_raw.chain_location_coordinate_evidence_20260712 (
  branch_key text PRIMARY KEY,
  target_slug text NOT NULL UNIQUE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  provider text NOT NULL,
  match_precision text NOT NULL,
  score double precision,
  matched_address text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude BETWEEN -90 AND 90),
  CHECK (longitude BETWEEN -180 AND 180)
);

INSERT INTO fountain_raw.chain_location_coordinate_evidence_20260712 (
  branch_key, target_slug, latitude, longitude, provider,
  match_precision, score, matched_address
)
VALUES
  ('biograph_new_york', 'biograph-new-york-city', 40.711446870450, -74.007498600524, 'arcgis_world_geocoder', 'subaddress', 100, '27 Park Row, New York, NY 10038'),
  ('biograph_bay_area', 'biograph-san-francisco-bay-area', 37.542405895676, -122.300454258127, 'arcgis_world_geocoder', 'subaddress', 100, '2850 S Delaware St, Suite 100, San Mateo, CA 94403'),

  ('clean_fontainebleau', 'nutridrip-fontainebleau-las-vegas', 36.137654663128, -115.158948029931, 'arcgis_world_geocoder', 'subaddress', 99.89, '2777 S Las Vegas Blvd, Level 2, Las Vegas, NV 89109'),
  ('clean_wynn', 'clean-market-wynn-las-vegas', 36.125884710870, -115.166810171291, 'arcgis_world_geocoder', 'point_address', 97.89, '3131 S Las Vegas Blvd, Las Vegas, NV 89109'),
  ('clean_midtown', 'clean-market-midtown-east-new-york', 40.757459579388, -73.967460931264, 'arcgis_world_geocoder', 'subaddress', 100, '240 E 54th St, New York, NY 10022'),
  ('clean_noho', 'clean-market-noho-new-york', 40.725506674836, -73.994399613698, 'arcgis_world_geocoder', 'point_address', 100, '40 Bleecker St, New York, NY 10012'),
  ('clean_fidi', 'clean-market-fidi-brookfield-place-new-york', 40.714450818819, -74.015850328848, 'arcgis_world_geocoder', 'subaddress', 100, '250 Vesey St, New York, NY 10281'),
  ('clean_uws', 'clean-market-uws-equinox-sports-club-new-york', 40.774620729859, -73.981064843936, 'arcgis_world_geocoder', 'subaddress', 100, '160 Columbus Ave, Floor 2, New York, NY 10023'),
  ('clean_hudson_yards', 'clean-market-equinox-hotel-hudson-yards-new-york', 40.754512627960, -74.002042987385, 'arcgis_world_geocoder', 'subaddress', 100, '33 Hudson Yards, Level 5, New York, NY 10001'),
  ('clean_williamsburg', 'clean-market-equinox-domino-williamsburg-brooklyn', 40.714655504895, -73.967423883252, 'arcgis_world_geocoder', 'subaddress', 100, '24 River St, Brooklyn, NY 11249'),

  ('icryo_blakeney', 'icryo-charlotte-blakeney', 35.035038727818, -80.808252552901, 'arcgis_world_geocoder', 'subaddress', 100, '9856 Rea Rd, Suite G, Charlotte, NC 28277'),
  ('icryo_southpark', 'icryo-charlotte-southpark', 35.151701367065, -80.826819055167, 'arcgis_world_geocoder', 'subaddress', 100, '4425 Sharon Rd, Suite 100, Charlotte, NC 28211'),

  ('next_nashville_gulch', 'next-health-nashville-the-gulch', 36.151174840588, -86.778714287457, 'arcgis_world_geocoder', 'point_address', 100, '616 8th Ave S, Nashville, TN 37203'),
  ('next_nashville_green_hills', 'next-health-nashville-green-hills', 36.109644941105, -86.811044545291, 'arcgis_world_geocoder', 'point_address', 100, '3710 Hillsboro Pike, Nashville, TN 37215'),
  ('next_newport_beach', 'next-health-newport-beach', 33.615063905537, -117.877268464247, 'arcgis_world_geocoder', 'subaddress', 96.91, '1165 Newport Center Dr, Newport Beach, CA 92660'),
  ('next_montecito', 'next-health-montecito', 34.438363436814, -119.632666809313, 'arcgis_world_geocoder', 'subaddress', 100, '559 San Ysidro Rd, Suite C, Montecito, CA 93108'),
  ('next_woodland_hills', 'next-health-woodland-hills-calabasas', 34.159552377723, -118.634417931845, 'arcgis_world_geocoder', 'point_address', 96.27, '23383 Mulholland Dr, Woodland Hills, CA 91364'),
  ('next_dubai', 'next-health-dubai-business-bay', 25.188913100000, 55.269625700000, 'openstreetmap', 'building', NULL, 'Sonder Business Bay, 6B Marasi Drive, Business Bay, Dubai'),
  ('next_maui', 'next-health-four-seasons-resort-maui-wailea', 20.680240000000, -156.442460000000, 'arcgis_world_geocoder', 'poi', 98.54, 'Four Seasons Resort Maui, 3900 Wailea Alanui Dr, Wailea, HI 96753'),
  ('next_new_york', 'next-health-new-york-city', 40.747032910933, -73.983698270276, 'arcgis_world_geocoder', 'point_address', 95.40, '160 Madison Ave, New York, NY 10016'),
  ('next_studio_city', 'next-health-studio-city', 34.146123000000, -118.413083000000, 'arcgis_world_geocoder', 'poi', 100, 'The Shops at Sportsmen''s Lodge, 12833 Ventura Blvd, Studio City, CA 91604'),
  ('next_century_city', 'next-health-century-city', 34.057940000000, -118.419930000000, 'arcgis_world_geocoder', 'poi', 99.43, 'Westfield Century City, 10250 Santa Monica Blvd, Los Angeles, CA 90067'),
  ('next_west_hollywood', 'next-health-west-hollywood', 34.092432108751, -118.378480206420, 'arcgis_world_geocoder', 'subaddress', 90.96, '8570 Sunset Blvd, Suite 6.1A, West Hollywood, CA 90069'),

  ('remedy_flatiron', 'remedy-place-flatiron-new-york', 40.740537355067, -73.991630232889, 'arcgis_world_geocoder', 'point_address', 100, '12 W 21st St, New York, NY 10010'),
  ('remedy_soho', 'remedy-place-soho-new-york', 40.720899436027, -74.002959967592, 'arcgis_world_geocoder', 'point_address', 100, '11 Greene St, New York, NY 10013'),

  ('fountain_new_york', 'fountain-life-new-york-white-plains', 41.022959757141, -73.725387795700, 'arcgis_world_geocoder', 'subaddress', 99.90, '4 Westchester Park Dr, Suite 200, White Plains, NY 10604'),
  ('fountain_naples', 'fountain-life-naples', 26.269308801866, -81.798577598202, 'arcgis_world_geocoder', 'subaddress', 100, '1000 Immokalee Rd, Suite 90, Naples, FL 34110'),
  ('fountain_dallas', 'fountain-life-dallas-the-colony', 33.075129656622, -96.859967194898, 'arcgis_world_geocoder', 'subaddress', 100, '5762 Grandscape Blvd, Suite 115, The Colony, TX 75056'),
  ('fountain_orlando', 'fountain-life-orlando', 28.371785286987, -81.282136943788, 'arcgis_world_geocoder', 'point_address', 100, '6424 Alexandra Louise Dr, Suite 120, Orlando, FL 32827'),

  ('gaia_lipa', 'house-of-gaia-lipa-batangas', 13.912787700000, 121.228360000000, 'arcgis_world_geocoder', 'locality', 80, 'Santo Toribio, Lipa City, Batangas, Philippines'),
  ('gaia_makati', 'gaia-longevity-house-of-gaia-makati', 14.562418000000, 121.015954000000, 'arcgis_world_geocoder', 'poi', 95.97, 'Alphaland Makati Place, 7232 Ayala Avenue Extension, Makati City 1209'),

  ('maison_cannes', 'maison-epigenetic-cannes-palm-beach', 43.536651475693, 7.037585752073, 'arcgis_world_geocoder', 'street', 100, 'Place Franklin Roosevelt, 06400 Cannes, France'),
  ('maison_paris', 'maison-epigenetic-paris', 48.868074456921, 2.290227274729, 'arcgis_world_geocoder', 'point_address', 100, '4 bis rue Cimarosa, 75116 Paris, France'),

  ('everlab_perth', 'everlab-perth-partner-testing-network', -31.972723226982, 115.908004350917, 'arcgis_world_geocoder', 'point_address', 93.87, '42 Bishopsgate Street, Lathlain, Perth, WA 6100'),
  ('everlab_brisbane', 'everlab-brisbane-partner-testing-network', -27.441528019235, 153.039631234966, 'arcgis_world_geocoder', 'subaddress', 100, 'Suite 2, 16 Thompson St, Bowen Hills, QLD 4006'),
  ('everlab_adelaide', 'everlab-adelaide-partner-testing-network', -34.885135472233, 138.542769606478, 'arcgis_world_geocoder', 'point_address', 100, '699 Port Rd, Woodville Park, SA 5011'),
  ('everlab_sydney', 'everlab-sydney-partner-testing-network', -33.879343720097, 151.238008705544, 'arcgis_world_geocoder', 'subaddress', 100, '287-289 New South Head Rd, Edgecliff, NSW 2027'),
  ('everlab_melbourne', 'everlab-melbourne-clinic', -37.819875431163, 144.956486413701, 'arcgis_world_geocoder', 'subaddress', 100, 'Suite 203, 517 Flinders Lane, Melbourne, VIC 3000'),

  ('levitas_esher', 'levitas-clinic-esher', 51.371034300554, -0.363204048264, 'arcgis_world_geocoder', 'point_address', 100, '8 High St, Esher, Surrey KT10 9RT'),
  ('levitas_guildford', 'levitas-clinic-guildford', 51.245740422331, -0.557343088047, 'arcgis_world_geocoder', 'point_address', 100, '116 London Rd, Guildford, Surrey GU1 1TN'),
  ('levitas_london', 'levitas-clinic-london', 51.513930808089, -0.147272869677, 'arcgis_world_geocoder', 'point_address', 99, '19-20 Woodstock St, London W1C 2AN'),

  ('chi_camden', 'chi-longevity-camden-clinic-singapore', 1.303373831931, 103.824251994409, 'arcgis_world_geocoder', 'subaddress', 100, 'Camden Medical Centre, 1 Orchard Blvd, #10-04, Singapore 248649'),
  ('chi_four_seasons', 'chi-longevity-four-seasons-hotel-singapore', 1.305210223098, 103.828652745033, 'arcgis_world_geocoder', 'subaddress', 99.22, 'Four Seasons Hotel Singapore, 190 Orchard Blvd, Singapore 248646')
ON CONFLICT (branch_key) DO UPDATE
SET target_slug = EXCLUDED.target_slug,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    provider = EXCLUDED.provider,
    match_precision = EXCLUDED.match_precision,
    score = EXCLUDED.score,
    matched_address = EXCLUDED.matched_address,
    recorded_at = now();

CREATE TABLE IF NOT EXISTS fountain_raw.chain_location_coordinate_backup_20260712 AS
SELECT l.*
FROM fountain.locations l
JOIN fountain_raw.chain_location_coordinate_evidence_20260712 e
  ON e.target_slug = l.slug;

-- Balesin City publishes the building's complete street address; preserve that
-- precision together with the building coordinate.
UPDATE fountain.locations
SET address = '6th Floor, Gaia Longevity, Balesin City, Alphaland Makati Place, 7232 Ayala Avenue Extension, Makati City 1209, Philippines',
    postal_code = '1209'
WHERE slug = 'gaia-longevity-house-of-gaia-makati';

UPDATE fountain.locations l
SET latitude = e.latitude,
    longitude = e.longitude
FROM fountain_raw.chain_location_coordinate_evidence_20260712 e
WHERE l.slug = e.target_slug
  AND (l.latitude, l.longitude) IS DISTINCT FROM (e.latitude, e.longitude);

DO $$
DECLARE
  expected_count integer;
  resolved_count integer;
BEGIN
  SELECT count(*) INTO expected_count
  FROM fountain_raw.chain_location_coordinate_evidence_20260712;

  SELECT count(*) INTO resolved_count
  FROM fountain.locations l
  JOIN fountain_raw.chain_location_coordinate_evidence_20260712 e
    ON e.target_slug = l.slug
  WHERE l.latitude = e.latitude
    AND l.longitude = e.longitude;

  IF expected_count <> 43 OR resolved_count <> expected_count THEN
    RAISE EXCEPTION
      'chain coordinate repair incomplete: expected 43 evidence rows and resolved %, got % evidence rows',
      resolved_count,
      expected_count;
  END IF;

  IF (
    SELECT count(DISTINCT (latitude, longitude))
    FROM fountain.locations
    WHERE slug IN (
      'fountain-life-new-york-white-plains',
      'fountain-life-naples',
      'fountain-life-dallas-the-colony',
      'fountain-life-orlando'
    )
  ) <> 4 THEN
    RAISE EXCEPTION 'Fountain Life branches do not have four distinct coordinate pairs';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fountain.clear_stale_location_coordinates_on_address_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
       NEW.address,
       NEW.locality,
       NEW.region,
       NEW.postal_code,
       NEW.country_code,
       NEW.country_name
     ) IS DISTINCT FROM ROW(
       OLD.address,
       OLD.locality,
       OLD.region,
       OLD.postal_code,
       OLD.country_code,
       OLD.country_name
     )
     AND NEW.latitude IS NOT DISTINCT FROM OLD.latitude
     AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude THEN
    NEW.latitude := NULL;
    NEW.longitude := NULL;
  END IF;

  IF (NEW.latitude IS NULL) <> (NEW.longitude IS NULL) THEN
    RAISE EXCEPTION 'location latitude and longitude must both be set or both be null';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_stale_coordinates_on_address_change
  ON fountain.locations;

CREATE TRIGGER trg_clear_stale_coordinates_on_address_change
BEFORE UPDATE OF address, locality, region, postal_code, country_code, country_name, latitude, longitude
ON fountain.locations
FOR EACH ROW
EXECUTE FUNCTION fountain.clear_stale_location_coordinates_on_address_change();

SELECT fountain.refresh_city_index();

COMMIT;
