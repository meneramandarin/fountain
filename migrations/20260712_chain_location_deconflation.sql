-- Split physical chain branches that were collapsed by the retired canonical builder.
--
-- Evidence sources:
-- - fountain.source_records and fountain_raw.source_listings retain the original branch rows.
-- - Physical addresses were verified against the brands' official location pages on 2026-07-12.
-- - Ambiguous/non-current branches are preserved as hidden or pending rather than published.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'chain_location_deconflation_20260712'
);

CREATE TABLE IF NOT EXISTS fountain.location_slug_aliases (
  slug text PRIMARY KEY,
  location_id integer NOT NULL REFERENCES fountain.locations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_slug_aliases_location
  ON fountain.location_slug_aliases(location_id);

CREATE TEMP TABLE chain_branch_specs (
  branch_key text PRIMARY KEY,
  target_location_id integer,
  target_slug text NOT NULL UNIQUE,
  org_id integer NOT NULL,
  name text NOT NULL,
  address text,
  locality text,
  region text,
  postal_code text,
  country_code text NOT NULL,
  country_name text NOT NULL,
  website text,
  phone text,
  status text NOT NULL DEFAULT 'active',
  verification_status text NOT NULL DEFAULT 'unverified'
) ON COMMIT DROP;

INSERT INTO chain_branch_specs (
  branch_key, target_location_id, target_slug, org_id, name, address, locality, region,
  postal_code, country_code, country_name, website, phone, status
)
VALUES
  ('fountain_new_york', 2523, 'fountain-life-new-york-white-plains', 889, 'Fountain Life - New York', '4 Westchester Park Dr, Suite 200, White Plains, NY 10604', 'White Plains', 'NY', '10604', 'US', 'United States', 'https://www.fountainlife.com/location/new-york', NULL, 'active'),
  ('fountain_naples', 13415, 'fountain-life-naples', 889, 'Fountain Life - Naples', '1000 Immokalee Rd, Suite 90, Naples, FL 34110', 'Naples', 'FL', '34110', 'US', 'United States', 'https://www.fountainlife.com/location/naples', NULL, 'active'),
  ('fountain_dallas', 2391, 'fountain-life-dallas-the-colony', 889, 'Fountain Life - Dallas', '5762 Grandscape Blvd, Suite 115, The Colony, TX 75056', 'The Colony', 'TX', '75056', 'US', 'United States', 'https://www.fountainlife.com/location/dallas', NULL, 'active'),
  ('fountain_orlando', 1382, 'fountain-life-orlando', 889, 'Fountain Life - Orlando', '6424 Alexandra Louise Dr, Suite 120, Orlando, FL 32827', 'Orlando', 'FL', '32827', 'US', 'United States', 'https://www.fountainlife.com/location/orlando', NULL, 'active'),

  ('clean_fontainebleau', 2004, 'nutridrip-fontainebleau-las-vegas', 34, 'NutriDrip IV Drip Lounge at Fontainebleau Las Vegas', '2777 S Las Vegas Blvd, Level 2, Las Vegas, NV 89109', 'Las Vegas', 'NV', '89109', 'US', 'United States', 'https://cleanmarket.com/pages/fontainebleau-las-vegas', '888-320-1699', 'active'),
  ('clean_wynn', 2584, 'clean-market-wynn-las-vegas', 34, 'Clean Market IV Drip Lounge at Wynn Las Vegas', '3131 S Las Vegas Blvd, Spa Level, Las Vegas, NV 89109', 'Las Vegas', 'NV', '89109', 'US', 'United States', 'https://cleanmarket.com/pages/clean-market-iv-drip-lounge-at-wynn', '888-320-1699', 'active'),
  ('clean_midtown', 398, 'clean-market-midtown-east-new-york', 34, 'Clean Market Midtown East', '240 E 54th St, New York, NY 10022', 'New York', 'NY', '10022', 'US', 'United States', 'https://cleanmarket.com/pages/clean-market-54th-st-manhattan', '888-320-1699', 'active'),
  ('clean_noho', 34, 'clean-market-noho-new-york', 34, 'Clean Market NoHo', '40 Bleecker St, New York, NY 10012', 'New York', 'NY', '10012', 'US', 'United States', 'https://cleanmarket.com/pages/clean-market-noho', '888-320-1699', 'active'),
  ('clean_fidi', 15, 'clean-market-fidi-brookfield-place-new-york', 34, 'Clean Market FiDi at Brookfield Place', '250 Vesey St, 2nd Floor, New York, NY 10281', 'New York', 'NY', '10281', 'US', 'United States', 'https://cleanmarket.com/pages/clean-market-financial-district', '888-320-1699', 'active'),
  ('clean_uws', NULL, 'clean-market-uws-equinox-sports-club-new-york', 34, 'Clean Market IV Drip Lounge at Equinox Sports Club', '160 Columbus Ave, Floor 2, New York, NY 10023', 'New York', 'NY', '10023', 'US', 'United States', 'https://cleanmarket.com/pages/clean-market-at-equinox-sports-club', '888-320-1699', 'active'),
  ('clean_hudson_yards', NULL, 'clean-market-equinox-hotel-hudson-yards-new-york', 34, 'Clean Market IV Drip Lounge at Equinox Hotel Hudson Yards', '33 Hudson Yards, Level 5, New York, NY 10001', 'New York', 'NY', '10001', 'US', 'United States', 'https://cleanmarket.com/pages/clean-market-iv-drip-lounge-at-equinox-hotel-hudson-yards', '888-320-1699', 'active'),
  ('clean_williamsburg', NULL, 'clean-market-equinox-domino-williamsburg-brooklyn', 34, 'Clean Market IV Drip Lounge at Equinox Domino', '24 River St, Brooklyn, NY 11249', 'Brooklyn', 'NY', '11249', 'US', 'United States', 'https://cleanmarket.com/pages/clean-market-iv-drip-lounge-at-equinox-domino', '888-320-1699', 'active'),

  ('icryo_blakeney', 2027, 'icryo-charlotte-blakeney', 1471, 'iCRYO Charlotte - Blakeney', '9856 Rea Rd, Suite G, Charlotte, NC 28277', 'Charlotte', 'NC', '28277', 'US', 'United States', 'https://icryo.com/location/charlotte-nc-blakeney/', '980-266-0115', 'active'),
  ('icryo_southpark', NULL, 'icryo-charlotte-southpark', 1471, 'iCRYO Charlotte - SouthPark', '4425 Sharon Rd, Suite 100, Charlotte, NC 28211', 'Charlotte', 'NC', '28211', 'US', 'United States', 'https://icryo.com/location/charlotte-nc-southpark/', '704-589-2697', 'active'),

  ('next_nashville_gulch', 2059, 'next-health-nashville-the-gulch', 1, 'Next Health Nashville - The Gulch', '616 8th Ave South, Nashville, TN 37203', 'Nashville', 'TN', '37203', 'US', 'United States', 'https://www.next-health.com/location/nashville', NULL, 'active'),
  ('next_nashville_green_hills', NULL, 'next-health-nashville-green-hills', 1, 'Next Health Nashville - Green Hills', '3710 Hillsboro Pike, Nashville, TN 37215', 'Nashville', 'TN', '37215', 'US', 'United States', 'https://www.next-health.com/location/green-hills-tn', NULL, 'active'),
  ('next_newport_beach', 2064, 'next-health-newport-beach', 1, 'Next Health Newport Beach', 'Fashion Island Mall, 1165 Newport Center Dr, Newport Beach, CA 92660', 'Newport Beach', 'CA', '92660', 'US', 'United States', 'https://www.next-health.com/inside/locations', NULL, 'active'),
  ('next_montecito', 2063, 'next-health-montecito', 1, 'Next Health Montecito', '559 San Ysidro Rd, Suite C, Montecito, CA 93108', 'Montecito', 'CA', '93108', 'US', 'United States', 'https://www.next-health.com/inside/locations', NULL, 'active'),
  ('next_woodland_hills', 2061, 'next-health-woodland-hills-calabasas', 1, 'Next Health Woodland Hills - Calabasas', 'El Camino Shopping Center, 23383 Mulholland Dr, Woodland Hills, CA 91364', 'Woodland Hills', 'CA', '91364', 'US', 'United States', 'https://www.next-health.com/inside/locations', NULL, 'active'),
  ('next_dubai', 2060, 'next-health-dubai-business-bay', 1, 'Next Health Dubai', 'Sonder Hotel, Shop 1, Business Bay, Dubai, United Arab Emirates', 'Dubai', 'Dubai', NULL, 'AE', 'United Arab Emirates', 'https://nexthealth.ae', NULL, 'active'),
  ('next_maui', 2058, 'next-health-four-seasons-resort-maui-wailea', 1, 'Next Health Four Seasons Resort Maui', 'Four Seasons Resort Maui, 3900 Wailea Alanui Dr, Wailea, HI 96753', 'Wailea', 'HI', '96753', 'US', 'United States', 'https://www.next-health.com/inside/locations', NULL, 'active'),
  ('next_new_york', 2057, 'next-health-new-york-city', 1, 'Next Health New York City', 'The Parlor, 160 Madison Ave, Mezzanine Floor, New York, NY 10016', 'New York', 'NY', '10016', 'US', 'United States', 'https://www.next-health.com/inside/locations', NULL, 'active'),
  ('next_studio_city', 1548, 'next-health-studio-city', 1, 'Next Health Studio City', 'The Shops at Sportsmen''s Lodge, 12833 Ventura Blvd, Suite 161, Studio City, CA 91604', 'Studio City', 'CA', '91604', 'US', 'United States', 'https://www.next-health.com/inside/locations', NULL, 'active'),
  ('next_century_city', 2055, 'next-health-century-city', 1, 'Next Health Century City', 'Westfield Century City Mall, 10250 Santa Monica Blvd, Suite 1440, Los Angeles, CA 90067', 'Los Angeles', 'CA', '90067', 'US', 'United States', 'https://www.next-health.com/inside/locations', NULL, 'active'),
  ('next_west_hollywood', 2054, 'next-health-west-hollywood', 1, 'Next Health West Hollywood', 'The Sunset, 8570 Sunset Blvd, Suite 6.1A, West Hollywood, CA 90069', 'West Hollywood', 'CA', '90069', 'US', 'United States', 'https://www.next-health.com/inside/locations', NULL, 'active'),

  ('remedy_flatiron', 2118, 'remedy-place-flatiron-new-york', 24, 'Remedy Place Flatiron', '12 West 21st St, New York, NY 10010', 'New York', 'NY', '10010', 'US', 'United States', 'https://www.remedyplace.com/clubs/flatiron', NULL, 'active'),
  ('remedy_soho', 20, 'remedy-place-soho-new-york', 24, 'Remedy Place SoHo', '11 Greene St, New York, NY 10013', 'New York', 'NY', '10013', 'US', 'United States', 'https://www.remedyplace.com/clubs/soho', NULL, 'active'),

  ('biograph_new_york', 1, 'biograph-new-york-city', 11, 'Biograph New York City', '27 Park Row, New York, NY 10038', 'New York', 'NY', '10038', 'US', 'United States', 'https://www.biograph.com/', NULL, 'active'),
  ('biograph_bay_area', 2564, 'biograph-san-francisco-bay-area', 11, 'Biograph San Francisco Bay Area', '2850 S Delaware St, Suite 100, San Mateo, CA 94403', 'San Mateo', 'CA', '94403', 'US', 'United States', 'https://www.biograph.com/', NULL, 'active'),

  ('gaia_lipa', 2514, 'house-of-gaia-lipa-batangas', 1749, 'House of Gaia Longevity Center - Lipa', 'Purok 2, Sitio Timbugan, Brgy. Sto. Toribio, Lipa City, Batangas 4217, Philippines', 'Lipa City', 'Batangas', '4217', 'PH', 'Philippines', 'https://houseofgaia.ph/', NULL, 'active'),
  ('gaia_makati', NULL, 'gaia-longevity-house-of-gaia-makati', 1749, 'Gaia Longevity by House of Gaia - Makati', '6th Floor, Gaia Longevity, Balesin City, Ayala Avenue, Makati City, Philippines', 'Makati City', 'Metro Manila', NULL, 'PH', 'Philippines', 'https://houseofgaia.ph/', NULL, 'active'),

  ('maison_shenyang', NULL, 'maison-epigenetic-shenyang', 7881, 'Maison Epigenetic Shenyang', NULL, 'Shenyang', 'Liaoning', NULL, 'CN', 'China', 'https://www.maisonepigenetic.com/', NULL, 'hidden'),
  ('maison_cannes', 2524, 'maison-epigenetic-cannes-palm-beach', 7881, 'Maison Epigenetic Cannes', 'Place Franklin Roosevelt, 06400 Cannes, France', 'Cannes', NULL, '06400', 'FR', 'France', 'https://www.maisonepigenetic.com/cannes', NULL, 'pending'),
  ('maison_paris', 8823, 'maison-epigenetic-paris', 7881, 'Maison Epigenetic Paris', '4 bis rue Cimarosa, 75116 Paris, France', 'Paris', NULL, '75116', 'FR', 'France', 'https://www.maisonepigenetic.com/paris', NULL, 'active'),

  ('everlab_perth', NULL, 'everlab-perth-partner-testing-network', 1761, 'Everlab Perth - Partner Testing Network', '42 Bishop St, Lathlain, WA 6100, Australia', 'Perth', 'WA', '6100', 'AU', 'Australia', 'https://www.everlab.com.au/', NULL, 'active'),
  ('everlab_brisbane', NULL, 'everlab-brisbane-partner-testing-network', 1761, 'Everlab Brisbane - Partner Testing Network', 'Suite 2, 16 Thompson St, Bowen Hills, QLD 4006, Australia', 'Brisbane', 'QLD', '4006', 'AU', 'Australia', 'https://www.everlab.com.au/', NULL, 'active'),
  ('everlab_adelaide', 2532, 'everlab-adelaide-partner-testing-network', 1761, 'Everlab Adelaide - Partner Testing Network', '699 Port Rd, Woodville Park, SA 5011, Australia', 'Adelaide', 'SA', '5011', 'AU', 'Australia', 'https://www.everlab.com.au/', NULL, 'active'),
  ('everlab_sydney', NULL, 'everlab-sydney-partner-testing-network', 1761, 'Everlab Sydney - Partner Testing Network', 'Ground Floor, 287-289 New South Head Rd, Edgecliff, NSW 2027, Australia', 'Sydney', 'NSW', '2027', 'AU', 'Australia', 'https://www.everlab.com.au/', NULL, 'active'),
  ('everlab_melbourne', NULL, 'everlab-melbourne-clinic', 1761, 'Everlab Melbourne Clinic', 'Suite 203, Level 2, 517 Flinders Lane, Melbourne, VIC 3000, Australia', 'Melbourne', 'VIC', '3000', 'AU', 'Australia', 'https://www.everlab.com.au/', NULL, 'active'),

  ('levitas_esher', 2536, 'levitas-clinic-esher', 1764, 'Levitas Clinic Esher', '8 High St, Esher, Surrey KT10 9RT, United Kingdom', 'Esher', 'Surrey', 'KT10 9RT', 'GB', 'United Kingdom', 'https://levitasclinic.com/locations/', NULL, 'active'),
  ('levitas_guildford', 2537, 'levitas-clinic-guildford', 1764, 'Levitas Clinic Guildford', '116 London Rd, Guildford, Surrey GU1 1TN, United Kingdom', 'Guildford', 'Surrey', 'GU1 1TN', 'GB', 'United Kingdom', 'https://levitasclinic.com/locations/', NULL, 'active'),
  ('levitas_london', NULL, 'levitas-clinic-london', 1764, 'Levitas Clinic London', '19-20 Woodstock St, London W1C 2AN, United Kingdom', 'London', NULL, 'W1C 2AN', 'GB', 'United Kingdom', 'https://levitascliniclondon.com/contact/', NULL, 'active'),

  ('chi_camden', 2542, 'chi-longevity-camden-clinic-singapore', 1766, 'Chi Longevity Camden Clinic', 'Camden Medical Centre, 1 Orchard Blvd, #10-04, Singapore 248649', 'Singapore', NULL, '248649', 'SG', 'Singapore', 'https://chilongevity.com/contact/', NULL, 'active'),
  ('chi_four_seasons', NULL, 'chi-longevity-four-seasons-hotel-singapore', 1766, 'Chi Longevity Four Seasons Hotel', 'Four Seasons Hotel Singapore, 190 Orchard Blvd, #03-04, Level 3, Singapore 248646', 'Singapore', NULL, '248646', 'SG', 'Singapore', 'https://chilongevity.com/contact/', NULL, 'active');

CREATE TEMP TABLE chain_affected_location_ids(id integer PRIMARY KEY) ON COMMIT DROP;
INSERT INTO chain_affected_location_ids(id)
SELECT target_location_id FROM chain_branch_specs WHERE target_location_id IS NOT NULL
UNION
SELECT unnest(ARRAY[2006, 2056, 2519, 2527, 2528, 2585, 13414]);

CREATE TABLE IF NOT EXISTS fountain_raw.chain_deconflation_locations_backup_20260712 AS
SELECT l.* FROM fountain.locations l JOIN chain_affected_location_ids a ON a.id = l.id;

CREATE TABLE IF NOT EXISTS fountain_raw.chain_deconflation_organizations_backup_20260712 AS
SELECT o.* FROM fountain.organizations o
WHERE o.id IN (1, 11, 24, 34, 889, 1471, 1749, 1756, 1761, 1764, 1766, 7881);

CREATE TABLE IF NOT EXISTS fountain_raw.chain_deconflation_source_records_backup_20260712 AS
SELECT sr.* FROM fountain.source_records sr JOIN chain_affected_location_ids a ON a.id = sr.entity_id
WHERE sr.entity_type = 'location';

CREATE TABLE IF NOT EXISTS fountain_raw.chain_deconflation_offerings_backup_20260712 AS
SELECT o.* FROM fountain.offerings o JOIN chain_affected_location_ids a ON a.id = o.location_id;

CREATE TABLE IF NOT EXISTS fountain_raw.chain_deconflation_images_backup_20260712 AS
SELECT i.* FROM fountain.images i JOIN chain_affected_location_ids a ON a.id = i.entity_id
WHERE i.entity_type = 'location';

CREATE TABLE IF NOT EXISTS fountain_raw.chain_deconflation_reviews_backup_20260712 AS
SELECT r.* FROM fountain.reviews r JOIN chain_affected_location_ids a ON a.id = r.location_id;

CREATE TABLE IF NOT EXISTS fountain_raw.chain_deconflation_place_matches_backup_20260712 AS
SELECT e.* FROM fountain.external_place_matches e JOIN chain_affected_location_ids a ON a.id = e.location_id;

INSERT INTO fountain.location_slug_aliases(slug, location_id, reason)
SELECT l.slug, b.target_location_id, 'chain_location_deconflation_20260712'
FROM chain_branch_specs b
JOIN fountain.locations l ON l.id = b.target_location_id
WHERE l.slug <> b.target_slug
ON CONFLICT (slug) DO UPDATE
SET location_id = EXCLUDED.location_id,
    reason = EXCLUDED.reason;

INSERT INTO fountain.locations (
  org_id, name, address, locality, region, postal_code, country_code, country_name,
  phone, website, slug, status, data_origin, verification_status, is_virtual
)
SELECT
  b.org_id, b.name, b.address, b.locality, b.region, b.postal_code, b.country_code, b.country_name,
  b.phone, b.website, b.target_slug, b.status, 'manual', b.verification_status, false
FROM chain_branch_specs b
WHERE b.target_location_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM fountain.locations l WHERE l.slug = b.target_slug);

UPDATE chain_branch_specs b
SET target_location_id = l.id
FROM fountain.locations l
WHERE b.target_location_id IS NULL
  AND l.slug = b.target_slug;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM chain_branch_specs WHERE target_location_id IS NULL) THEN
    RAISE EXCEPTION 'chain deconflation failed to resolve every target location';
  END IF;
END;
$$;

-- Free slugs that belong on the surviving physical branch before updating it.
UPDATE fountain.locations
SET slug = 'retired-chain-composite-' || id::text
WHERE id IN (2006, 2056, 2519, 2527, 2528, 2585, 13414);

UPDATE fountain.locations l
SET org_id = b.org_id,
    name = b.name,
    address = b.address,
    locality = b.locality,
    region = b.region,
    postal_code = b.postal_code,
    country_code = b.country_code,
    country_name = b.country_name,
    -- A branch address must never inherit coordinates from the composite row.
    -- The follow-up coordinate repair migration repopulates these from verified
    -- branch-level evidence.
    latitude = NULL,
    longitude = NULL,
    phone = COALESCE(b.phone, l.phone),
    website = b.website,
    slug = b.target_slug,
    status = b.status,
    deleted_at = CASE WHEN b.status = 'deleted' THEN COALESCE(l.deleted_at, now()) ELSE NULL END,
    data_origin = CASE WHEN l.data_origin = 'owner' THEN l.data_origin ELSE 'manual' END,
    verification_status = b.verification_status,
    is_virtual = false
FROM chain_branch_specs b
WHERE l.id = b.target_location_id;

UPDATE fountain.organizations
SET canonical_name = 'iCRYO', name_normalized = 'icryo'
WHERE id = 1471;

UPDATE fountain.organizations
SET canonical_name = 'Remedy Place', name_normalized = 'remedy place'
WHERE id = 24;

UPDATE fountain.organizations
SET website_domain = 'houseofgaia.ph', dedup_key = 'houseofgaia.ph'
WHERE id = 1749;

UPDATE fountain.organizations
SET website_domain = 'everlab.com.au', dedup_key = 'everlab.com.au'
WHERE id = 1761;

UPDATE fountain.organizations
SET website_domain = 'levitasclinic.com', dedup_key = 'levitasclinic.com'
WHERE id = 1764;

UPDATE fountain.organizations
SET dedup_key = 'chilongevity.com'
WHERE id = 1766;

CREATE TEMP TABLE chain_source_routes (
  source_slug text NOT NULL,
  source_listing_id integer NOT NULL,
  old_location_id integer NOT NULL,
  branch_key text NOT NULL REFERENCES chain_branch_specs(branch_key),
  PRIMARY KEY(source_slug, source_listing_id, old_location_id)
) ON COMMIT DROP;

INSERT INTO chain_source_routes VALUES
  ('longevity_technology_clinics', 64, 2514, 'gaia_lipa'),
  ('longevity_technology_clinics', 65, 2514, 'gaia_makati'),
  ('longevity_technology_clinics', 70, 2519, 'biograph_new_york'),
  ('longevity_technology_clinics', 71, 2519, 'biograph_bay_area'),
  ('longevity_technology_clinics', 75, 2523, 'fountain_new_york'),
  ('longevity_technology_clinics', 76, 2523, 'fountain_naples'),
  ('longevity_technology_clinics', 77, 2523, 'fountain_dallas'),
  ('longevity_technology_clinics', 78, 2523, 'fountain_orlando'),
  ('longevity_technology_clinics', 79, 2524, 'maison_shenyang'),
  ('longevity_technology_clinics', 80, 2524, 'maison_cannes'),
  ('longevity_technology_clinics', 81, 2524, 'maison_paris'),
  ('longevity_technology_clinics', 84, 2527, 'next_newport_beach'),
  ('longevity_technology_clinics', 85, 2527, 'next_montecito'),
  ('longevity_technology_clinics', 86, 2527, 'next_woodland_hills'),
  ('longevity_technology_clinics', 87, 2527, 'next_dubai'),
  ('longevity_technology_clinics', 88, 2527, 'next_nashville_gulch'),
  ('longevity_technology_clinics', 89, 2527, 'next_maui'),
  ('longevity_technology_clinics', 90, 2528, 'next_new_york'),
  ('longevity_technology_clinics', 91, 2527, 'next_studio_city'),
  ('longevity_technology_clinics', 92, 2527, 'next_century_city'),
  ('longevity_technology_clinics', 93, 2527, 'next_west_hollywood'),
  ('longevity_technology_clinics', 97, 2532, 'everlab_perth'),
  ('longevity_technology_clinics', 98, 2532, 'everlab_brisbane'),
  ('longevity_technology_clinics', 99, 2532, 'everlab_adelaide'),
  ('longevity_technology_clinics', 100, 2532, 'everlab_sydney'),
  ('longevity_technology_clinics', 101, 2532, 'everlab_melbourne'),
  ('longevity_technology_clinics', 105, 2536, 'levitas_esher'),
  ('longevity_technology_clinics', 106, 2536, 'levitas_guildford'),
  ('longevity_technology_clinics', 107, 2537, 'levitas_london'),
  ('longevity_technology_clinics', 108, 2542, 'chi_four_seasons'),
  ('longevity_technology_clinics', 112, 2542, 'chi_camden'),

  ('chain_clean_market', 8, 2004, 'clean_fontainebleau'),
  ('chain_clean_market', 16, 2004, 'clean_wynn'),
  ('chain_clean_market', 10, 2006, 'clean_midtown'),
  ('chain_clean_market', 11, 2006, 'clean_noho'),
  ('chain_clean_market', 12, 2006, 'clean_fidi'),
  ('chain_clean_market', 13, 2006, 'clean_uws'),
  ('chain_clean_market', 14, 2006, 'clean_hudson_yards'),
  ('chain_icryo', 19, 2027, 'icryo_blakeney'),
  ('chain_icryo', 20, 2027, 'icryo_southpark'),
  ('chain_next_health', 6, 2059, 'next_nashville_gulch'),
  ('chain_next_health', 13, 2059, 'next_nashville_green_hills'),
  ('chain_remedy_place', 2, 2118, 'remedy_flatiron'),
  ('chain_remedy_place', 3, 2118, 'remedy_soho'),

  ('menu_enrichment', 44, 2006, 'clean_midtown'),
  ('menu_enrichment', 45, 2006, 'clean_noho'),
  ('menu_enrichment', 46, 2006, 'clean_fidi'),
  ('menu_enrichment', 47, 2006, 'clean_uws'),
  ('menu_enrichment', 48, 2006, 'clean_hudson_yards'),
  ('menu_enrichment', 49, 2006, 'clean_williamsburg'),
  ('menu_enrichment', 697, 2006, 'clean_williamsburg'),
  ('menu_enrichment', 701, 2006, 'clean_midtown'),
  ('menu_enrichment', 712, 2006, 'clean_uws'),
  ('menu_enrichment', 733, 2006, 'clean_williamsburg'),
  ('menu_enrichment', 770, 2006, 'clean_williamsburg'),
  ('menu_enrichment', 780, 2006, 'clean_williamsburg'),
  ('menu_enrichment', 869, 2004, 'clean_williamsburg'),
  ('menu_enrichment', 870, 2004, 'clean_williamsburg'),
  ('menu_enrichment', 51, 2585, 'clean_fontainebleau'),
  ('menu_enrichment', 84, 2585, 'clean_fontainebleau'),
  ('menu_enrichment', 699, 2585, 'clean_fontainebleau'),
  ('menu_enrichment', 740, 2585, 'clean_fontainebleau'),
  ('menu_enrichment', 750, 2585, 'clean_fontainebleau'),
  ('menu_enrichment', 753, 2585, 'clean_fontainebleau'),
  ('service_discovery_20', 6, 2006, 'clean_midtown'),
  ('google_places_reviews', 327, 2006, 'clean_midtown');

CREATE TABLE IF NOT EXISTS fountain_raw.chain_deconflation_branch_map_20260712 (
  source_slug text NOT NULL,
  source_listing_id integer NOT NULL,
  old_location_id integer NOT NULL,
  target_location_id integer NOT NULL,
  target_slug text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_slug, source_listing_id, old_location_id)
);

INSERT INTO fountain_raw.chain_deconflation_branch_map_20260712 (
  source_slug, source_listing_id, old_location_id, target_location_id, target_slug
)
SELECT r.source_slug, r.source_listing_id, r.old_location_id, b.target_location_id, b.target_slug
FROM chain_source_routes r
JOIN chain_branch_specs b USING (branch_key)
ON CONFLICT (source_slug, source_listing_id, old_location_id) DO UPDATE
SET target_location_id = EXCLUDED.target_location_id,
    target_slug = EXCLUDED.target_slug;

-- Clone source-owned offerings to every physical branch represented by that source.
WITH routes AS (
  SELECT DISTINCT r.old_location_id, s.id AS source_id, b.target_location_id
  FROM chain_source_routes r
  JOIN fountain.sources s ON s.slug = r.source_slug
  JOIN chain_branch_specs b USING (branch_key)
)
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency, source_offer_url,
  source_id, status, data_origin, verification_status, deleted_at, owner_account_id
)
SELECT DISTINCT ON (routes.target_location_id, o.source_id, o.raw_name)
  routes.target_location_id, o.treatment_id, o.raw_name, o.price_amount, o.price_currency,
  o.source_offer_url, o.source_id, o.status, o.data_origin, o.verification_status,
  o.deleted_at, o.owner_account_id
FROM routes
JOIN fountain.offerings o
  ON o.location_id = routes.old_location_id
 AND o.source_id = routes.source_id
ORDER BY routes.target_location_id, o.source_id, o.raw_name, o.id
ON CONFLICT (location_id, source_id, raw_name) DO UPDATE
SET treatment_id = COALESCE(fountain.offerings.treatment_id, EXCLUDED.treatment_id),
    price_amount = COALESCE(fountain.offerings.price_amount, EXCLUDED.price_amount),
    price_currency = COALESCE(fountain.offerings.price_currency, EXCLUDED.price_currency),
    source_offer_url = COALESCE(fountain.offerings.source_offer_url, EXCLUDED.source_offer_url);

-- Preserve branch-specific source images where the raw image provenance is still available.
INSERT INTO fountain.images (
  entity_type, entity_id, image_url, blob_url, content_sha256, alt, source_id,
  status, data_origin, verification_status, deleted_at, owner_account_id, image_kind
)
SELECT DISTINCT ON (b.target_location_id, i.blob_url)
  'location', b.target_location_id, i.image_url, i.blob_url, i.content_sha256, i.alt,
  i.source_id, i.status, i.data_origin, i.verification_status, i.deleted_at,
  i.owner_account_id, i.image_kind
FROM chain_source_routes r
JOIN chain_branch_specs b USING (branch_key)
JOIN fountain.sources s ON s.slug = r.source_slug
JOIN fountain.images i
  ON i.entity_type = 'location'
 AND i.entity_id = r.old_location_id
 AND i.source_id = s.id
JOIN fountain_raw.source_images raw_image
  ON raw_image.source_slug = r.source_slug
 AND raw_image.source_listing_id = r.source_listing_id
 AND raw_image.image_url = i.image_url
WHERE b.target_location_id <> r.old_location_id
  AND NOT EXISTS (
    SELECT 1 FROM fountain.images existing
    WHERE existing.entity_type = 'location'
      AND existing.entity_id = b.target_location_id
      AND existing.blob_url = i.blob_url
  )
ORDER BY b.target_location_id, i.blob_url, i.id;

-- Remove images that can be proven to belong only to a sibling branch from a reused
-- composite row. Shared/unmatched brand assets remain available as fallbacks.
DELETE FROM fountain.images i
WHERE i.entity_type = 'location'
  AND EXISTS (
    SELECT 1
    FROM chain_source_routes sibling_route
    JOIN chain_branch_specs sibling_branch USING (branch_key)
    JOIN fountain.sources sibling_source ON sibling_source.slug = sibling_route.source_slug
    JOIN fountain_raw.source_images sibling_image
      ON sibling_image.source_slug = sibling_route.source_slug
     AND sibling_image.source_listing_id = sibling_route.source_listing_id
     AND sibling_image.image_url = i.image_url
    WHERE sibling_route.old_location_id = i.entity_id
      AND sibling_branch.target_location_id <> i.entity_id
      AND sibling_source.id = i.source_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM chain_source_routes retained_route
    JOIN chain_branch_specs retained_branch USING (branch_key)
    JOIN fountain.sources retained_source ON retained_source.slug = retained_route.source_slug
    JOIN fountain_raw.source_images retained_image
      ON retained_image.source_slug = retained_route.source_slug
     AND retained_image.source_listing_id = retained_route.source_listing_id
     AND retained_image.image_url = i.image_url
    WHERE retained_route.old_location_id = i.entity_id
      AND retained_branch.target_location_id = i.entity_id
      AND retained_source.id = i.source_id
  );

-- Re-link both location- and organization-level provenance.
UPDATE fountain.source_records sr
SET entity_id = b.target_location_id
FROM chain_source_routes r
JOIN chain_branch_specs b USING (branch_key)
JOIN fountain.sources s ON s.slug = r.source_slug
WHERE sr.entity_type = 'location'
  AND sr.entity_id = r.old_location_id
  AND sr.source_id = s.id
  AND sr.source_listing_id = r.source_listing_id;

UPDATE fountain.source_records sr
SET entity_id = b.org_id
FROM chain_source_routes r
JOIN chain_branch_specs b USING (branch_key)
JOIN fountain.sources s ON s.slug = r.source_slug
WHERE sr.entity_type = 'organization'
  AND sr.source_id = s.id
  AND sr.source_listing_id = r.source_listing_id;

-- Preserve incoming public URLs for rows that are about to be merged or retired.
INSERT INTO fountain.location_slug_aliases(slug, location_id, reason)
VALUES
  ('clean-market-midtown-east-new-york', 398, 'chain_location_deconflation_20260712'),
  ('clean-market-las-vegas-2', 2004, 'chain_location_deconflation_20260712'),
  ('biograph-new-york-2', 1, 'chain_location_deconflation_20260712'),
  ('biograph-new-york-3', 1, 'chain_location_deconflation_20260712'),
  ('next-health-century-city-2', 2055, 'chain_location_deconflation_20260712'),
  ('next-health-new-york-city-century-city', 2057, 'chain_location_deconflation_20260712'),
  ('next-health-studio-city-2', 1548, 'chain_location_deconflation_20260712')
ON CONFLICT (slug) DO UPDATE
SET location_id = EXCLUDED.location_id,
    reason = EXCLUDED.reason;

-- Merge only true duplicates; delete composites whose child provenance was already split.
SELECT fountain.merge_locations(398, 2006, 'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid, 'chain deconflation: retire composite Clean Market NYC row');
SELECT fountain.merge_locations(1, 13414, 'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid, 'chain deconflation: merge duplicate Biograph New York row');
SELECT fountain.merge_locations(1548, 2056, 'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid, 'chain deconflation: merge duplicate Next Health Studio City row');

SELECT fountain.delete_location_cascade(2585, 'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid, 'chain deconflation: retire duplicate Fontainebleau row with incorrect Wynn match');

-- These legacy composites have child rows referenced by audit/backup tables. Preserve them
-- for reversibility, but remove them from every consumer-facing query.
UPDATE fountain.locations
SET status = 'hidden',
    verification_status = 'unverified'
WHERE id IN (2519, 2527, 2528);

UPDATE fountain.source_records
SET entity_id = 7881
WHERE entity_type = 'organization'
  AND entity_id = 1756;

DELETE FROM fountain.organizations o
WHERE o.id = 1756
  AND NOT EXISTS (SELECT 1 FROM fountain.locations l WHERE l.org_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM fountain.source_records sr WHERE sr.entity_type = 'organization' AND sr.entity_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM fountain.affiliations a WHERE a.org_id = o.id);

SELECT fountain.refresh_city_index();

DO $$
DECLARE
  remaining_collapses integer;
  wrong_fountain_org integer;
BEGIN
  SELECT count(*) INTO remaining_collapses
  FROM (
    SELECT sr.entity_id, sr.source_id
    FROM fountain.source_records sr
    JOIN fountain.sources s ON s.id = sr.source_id
    WHERE sr.entity_type = 'location'
      AND (
        s.slug LIKE 'chain\_%' ESCAPE '\'
        OR s.slug = 'longevity_technology_clinics'
      )
    GROUP BY sr.entity_id, sr.source_id
    HAVING count(DISTINCT sr.source_listing_id) > 1
  ) remaining;

  SELECT count(*) INTO wrong_fountain_org
  FROM fountain.locations
  WHERE id IN (1382, 2391, 2523, 13415)
    AND org_id <> 889;

  IF remaining_collapses <> 0 THEN
    RAISE EXCEPTION 'chain deconflation left % protected multi-listing collapses', remaining_collapses;
  END IF;

  IF wrong_fountain_org <> 0 THEN
    RAISE EXCEPTION 'chain deconflation left % Fountain Life rows on the wrong organization', wrong_fountain_org;
  END IF;
END;
$$;

COMMIT;
