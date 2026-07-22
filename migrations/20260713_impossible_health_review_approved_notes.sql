BEGIN;

-- Local review cohort only. Apply with DATABASE_URL pointing at
-- impossible_health_review; this migration is not part of production deploys.
SELECT fountain.set_mutation_actor(
  'b5c71897-83d0-4c30-a7a3-202607130017'::uuid,
  'impossible_health_review_notes_20260713'
);

-- Chain identities requested in reviewer notes.
INSERT INTO fountain.organizations (
  canonical_name, name_normalized, website_domain, dedup_key,
  status, data_origin, verification_status
)
VALUES
  ('Alive + Well', 'alive and well', 'aliveandwell.health', 'aliveandwell.health', 'active', 'manual', 'unverified'),
  ('Healios Laser Therapy', 'healios laser therapy', 'healioslasertherapy.com', 'healioslasertherapy.com', 'active', 'manual', 'unverified')
ON CONFLICT (dedup_key) DO UPDATE SET
  canonical_name = EXCLUDED.canonical_name,
  name_normalized = EXCLUDED.name_normalized,
  website_domain = EXCLUDED.website_domain,
  status = 'active';

UPDATE fountain.organizations
SET canonical_name = 'Life Imaging',
    name_normalized = 'life imaging',
    website_domain = 'lifeimaging.com',
    dedup_key = 'lifeimaging.com',
    status = 'active'
WHERE id = 4079;

-- Direct contact and identity corrections from approved reviewer notes.
UPDATE fountain.locations SET
  org_id = (SELECT id FROM fountain.organizations WHERE dedup_key = 'aliveandwell.health'),
  name = 'Alive + Well Austin',
  address = '3944 Ranch Road 620 S, Building 6, Suite 100, Bee Cave, TX 78738',
  locality = 'Bee Cave', region = 'TX', postal_code = '78738', country_code = 'US',
  phone = '+15125805775', email = 'austin@aliveandwell.health', status = 'active'
WHERE id = 14607;

UPDATE fountain.locations SET
  email = 'drdaneshrad@cardiologybeverlyhills.com'
WHERE id = 14628;

UPDATE fountain.locations SET
  website = 'https://www.instagram.com/chillspacenyc/'
WHERE id = 14644;

UPDATE fountain.locations SET
  email = 'hello@dexasf.com'
WHERE id = 14673;

UPDATE fountain.locations SET
  org_id = (SELECT id FROM fountain.organizations WHERE dedup_key = 'healioslasertherapy.com'),
  name = 'Healios Laser Therapy - Solana Beach',
  address = '722 Genevieve Street, Solana Beach, CA 92075',
  locality = 'Solana Beach', region = 'CA', postal_code = '92075', country_code = 'US',
  website = 'https://www.healioslasertherapy.com', status = 'active'
WHERE id = 14664;

UPDATE fountain.locations SET
  org_id = 4079,
  name = 'Life Imaging - Deerfield Beach',
  address = '1981 W Hillsboro Boulevard, Deerfield Beach, FL 33442',
  locality = 'Deerfield Beach', region = 'FL', postal_code = '33442', country_code = 'US',
  website = 'https://lifeimaging.com', status = 'active'
WHERE id = 14640;

UPDATE fountain.locations SET
  address = '4100 Salzedo Street, Suite 4, Coral Gables, FL 33146',
  locality = 'Coral Gables', region = 'FL', postal_code = '33146', country_code = 'US'
WHERE id = 14642;

UPDATE fountain.locations SET
  website = 'https://south-miami-sunset-drive.thedripbar.com',
  locality = 'South Miami'
WHERE id = 14638;

UPDATE fountain.locations SET postal_code = 'M5V 1B8' WHERE id = 14678;

-- The Bathhouse site itself publishes "123 Demo Street / 12345". Preserve the
-- reviewer-supplied phone, but do not promote the obvious placeholder address.
UPDATE fountain.locations SET phone = '+15122983029', status = 'draft' WHERE id = 14609;

CREATE TEMP TABLE ih_chain_locations (
  location_id integer PRIMARY KEY,
  cohort text NOT NULL
) ON COMMIT DROP;

DO $review_branches$
DECLARE
  location_id integer;
  alive_org integer := (SELECT id FROM fountain.organizations WHERE dedup_key = 'aliveandwell.health');
  healios_org integer := (SELECT id FROM fountain.organizations WHERE dedup_key = 'healioslasertherapy.com');
BEGIN
  -- Alive + Well: the Austin/Bee Cave record is the reviewed base listing.
  SELECT id INTO location_id FROM fountain.locations
  WHERE lower(address) = lower('2700 Broadway, Suite 1205, Boulder, CO 80304') LIMIT 1;
  IF location_id IS NULL THEN
    location_id := fountain.create_location(jsonb_build_object(
      'org_id', alive_org, 'name', 'Alive + Well Boulder',
      'address', '2700 Broadway, Suite 1205, Boulder, CO 80304',
      'locality', 'Boulder', 'region', 'CO', 'postal_code', '80304',
      'country_code', 'US', 'country_name', 'United States',
      'phone', '+13034142900', 'email', 'boulder@aliveandwell.health',
      'website', 'https://aliveandwell.health', 'data_origin', 'manual'
    ), 'b5c71897-83d0-4c30-a7a3-202607130017'::uuid);
  END IF;
  INSERT INTO ih_chain_locations VALUES (location_id, 'alive') ON CONFLICT DO NOTHING;

  SELECT id INTO location_id FROM fountain.locations
  WHERE lower(address) = lower('4205 Buena Vista Street, Suite 250, Dallas, TX 75205') LIMIT 1;
  IF location_id IS NULL THEN
    location_id := fountain.create_location(jsonb_build_object(
      'org_id', alive_org, 'name', 'Alive + Well Dallas',
      'address', '4205 Buena Vista Street, Suite 250, Dallas, TX 75205',
      'locality', 'Dallas', 'region', 'TX', 'postal_code', '75205',
      'country_code', 'US', 'country_name', 'United States',
      'phone', '+12149190444', 'email', 'dallas@aliveandwell.health',
      'website', 'https://aliveandwell.health', 'data_origin', 'manual'
    ), 'b5c71897-83d0-4c30-a7a3-202607130017'::uuid);
  END IF;
  INSERT INTO ih_chain_locations VALUES (location_id, 'alive') ON CONFLICT DO NOTHING;

  -- Healios: six additional branches; Solana Beach is the reviewed base.
  FOR location_id IN
    SELECT fountain.create_location(item.payload, 'b5c71897-83d0-4c30-a7a3-202607130017'::uuid)
    FROM (VALUES
      (jsonb_build_object('org_id', healios_org, 'name', 'Healios Laser Therapy - Rancho Santa Fe', 'address', '16085 San Dieguito Road, Unit E5, Rancho Santa Fe, CA 92067', 'locality', 'Rancho Santa Fe', 'region', 'CA', 'postal_code', '92067', 'country_code', 'US', 'country_name', 'United States', 'phone', '+18007858505', 'email', 'info@healioslasertherapy.com', 'website', 'https://www.healioslasertherapy.com', 'data_origin', 'manual')),
      (jsonb_build_object('org_id', healios_org, 'name', 'Healios Laser Therapy - La Jolla', 'address', '909 Prospect Street, La Jolla, CA 92037', 'locality', 'La Jolla', 'region', 'CA', 'postal_code', '92037', 'country_code', 'US', 'country_name', 'United States', 'phone', '+18007858505', 'email', 'info@healioslasertherapy.com', 'website', 'https://www.healioslasertherapy.com', 'data_origin', 'manual')),
      (jsonb_build_object('org_id', healios_org, 'name', 'Healios Laser Therapy - Carlsbad', 'address', '7130 Avenida Encinas, Suite 200, Carlsbad, CA 92011', 'locality', 'Carlsbad', 'region', 'CA', 'postal_code', '92011', 'country_code', 'US', 'country_name', 'United States', 'phone', '+18007858505', 'email', 'info@healioslasertherapy.com', 'website', 'https://www.healioslasertherapy.com', 'data_origin', 'manual')),
      (jsonb_build_object('org_id', healios_org, 'name', 'Healios Laser Therapy - Costa Mesa', 'address', '740 W 16th Street, Costa Mesa, CA 92627', 'locality', 'Costa Mesa', 'region', 'CA', 'postal_code', '92627', 'country_code', 'US', 'country_name', 'United States', 'phone', '+18007858505', 'email', 'info@healioslasertherapy.com', 'website', 'https://www.healioslasertherapy.com', 'data_origin', 'manual')),
      (jsonb_build_object('org_id', healios_org, 'name', 'Healios Laser Therapy - Superior', 'address', '1 Superior Drive, Unit 1B, Superior, CO 80027', 'locality', 'Superior', 'region', 'CO', 'postal_code', '80027', 'country_code', 'US', 'country_name', 'United States', 'phone', '+18007858505', 'email', 'info@healioslasertherapy.com', 'website', 'https://www.healioslasertherapy.com', 'data_origin', 'manual')),
      (jsonb_build_object('org_id', healios_org, 'name', 'Healios Laser Therapy - Jupiter', 'address', '600 Heritage Drive, Suite 7, Jupiter, FL 33458', 'locality', 'Jupiter', 'region', 'FL', 'postal_code', '33458', 'country_code', 'US', 'country_name', 'United States', 'phone', '+18007858505', 'email', 'info@healioslasertherapy.com', 'website', 'https://www.healioslasertherapy.com', 'data_origin', 'manual'))
    ) AS item(payload)
    WHERE NOT EXISTS (
      SELECT 1 FROM fountain.locations existing
      WHERE lower(regexp_replace(coalesce(existing.address, ''), '[^a-z0-9]', '', 'g'))
        = lower(regexp_replace(item.payload->>'address', '[^a-z0-9]', '', 'g'))
    )
  LOOP
    INSERT INTO ih_chain_locations VALUES (location_id, 'healios') ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO ih_chain_locations(location_id, cohort)
  SELECT id, 'healios' FROM fountain.locations
  WHERE org_id = healios_org AND id <> 14664
  ON CONFLICT DO NOTHING;

  -- Life Imaging: reuse the existing Coral Gables identity and create two more.
  UPDATE fountain.locations SET
    org_id = 4079, name = 'Life Imaging - Coral Gables',
    address = '2344 S Douglas Road, Coral Gables, FL 33134',
    locality = 'Coral Gables', region = 'FL', postal_code = '33134', country_code = 'US',
    website = 'https://lifeimaging.com', status = 'active'
  WHERE id = 9078;
  INSERT INTO ih_chain_locations VALUES (9078, 'life') ON CONFLICT DO NOTHING;

  SELECT id INTO location_id FROM fountain.locations
  WHERE lower(address) = lower('311 W Indiantown Road, Jupiter, FL 33458') LIMIT 1;
  IF location_id IS NULL THEN
    location_id := fountain.create_location(jsonb_build_object(
      'org_id', 4079, 'name', 'Life Imaging - Jupiter',
      'address', '311 W Indiantown Road, Jupiter, FL 33458',
      'locality', 'Jupiter', 'region', 'FL', 'postal_code', '33458',
      'country_code', 'US', 'country_name', 'United States',
      'phone', '+19548346362', 'website', 'https://lifeimaging.com', 'data_origin', 'manual'
    ), 'b5c71897-83d0-4c30-a7a3-202607130017'::uuid);
  END IF;
  INSERT INTO ih_chain_locations VALUES (location_id, 'life') ON CONFLICT DO NOTHING;

  SELECT id INTO location_id FROM fountain.locations
  WHERE lower(address) = lower('930 S Orange Avenue, Orlando, FL 32806') LIMIT 1;
  IF location_id IS NULL THEN
    location_id := fountain.create_location(jsonb_build_object(
      'org_id', 4079, 'name', 'Life Imaging - Orlando',
      'address', '930 S Orange Avenue, Orlando, FL 32806',
      'locality', 'Orlando', 'region', 'FL', 'postal_code', '32806',
      'country_code', 'US', 'country_name', 'United States',
      'phone', '+19548346362', 'website', 'https://lifeimaging.com', 'data_origin', 'manual'
    ), 'b5c71897-83d0-4c30-a7a3-202607130017'::uuid);
  END IF;
  INSERT INTO ih_chain_locations VALUES (location_id, 'life') ON CONFLICT DO NOTHING;
END
$review_branches$;

-- Source provenance for reviewer-added branches.
INSERT INTO fountain.source_records (source_id, entity_type, entity_id, source_url, raw_ref)
SELECT 266, 'location', chain.location_id, location.website,
       'review-note:impossible-health:' || chain.cohort
FROM ih_chain_locations chain
JOIN fountain.locations location ON location.id = chain.location_id
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.source_records existing
  WHERE existing.entity_type = 'location'
    AND existing.entity_id = chain.location_id
    AND existing.raw_ref = 'review-note:impossible-health:' || chain.cohort
);

-- Each requested chain branch inherits the official-site menu of its reviewed base.
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency,
  source_offer_url, source_id, status, data_origin, verification_status
)
SELECT chain.location_id, offering.treatment_id, offering.raw_name,
       offering.price_amount, offering.price_currency, offering.source_offer_url,
       offering.source_id, 'active', offering.data_origin, offering.verification_status
FROM ih_chain_locations chain
JOIN fountain.offerings offering ON offering.location_id = CASE chain.cohort
  WHEN 'alive' THEN 14607 WHEN 'healios' THEN 14664 WHEN 'life' THEN 14640 END
WHERE offering.status = 'active' AND offering.deleted_at IS NULL
ON CONFLICT (location_id, source_id, raw_name) DO UPDATE SET
  price_amount = EXCLUDED.price_amount,
  price_currency = EXCLUDED.price_currency,
  source_offer_url = EXCLUDED.source_offer_url,
  status = 'active';

-- Replace off-target/incomplete menus with the approved concise menus.
DELETE FROM fountain.offerings
WHERE location_id IN (14609,14611,14623,14634,14638,14644,14650,14673,14678);

INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency,
  source_offer_url, source_id, status, data_origin, verification_status
)
SELECT location_id, NULL, raw_name, price_amount, price_currency,
       source_offer_url, 266, 'active', 'manual', 'unverified'
FROM (VALUES
  -- Castle Hill Fitness
  (14611, 'InBody Composition Assessment - starting at', 30::double precision, 'USD', 'https://www.castlehillfitness.com/'),
  (14611, 'Body Remapping', 145, 'USD', 'https://www.castlehillfitness.com/'),

  -- Chill Space NYC
  (14644, 'Cryotherapy', NULL, NULL, 'https://www.instagram.com/chillspacenyc/'),
  (14644, 'Floatation', NULL, NULL, 'https://www.instagram.com/chillspacenyc/'),
  (14644, 'Infrared Sauna', NULL, NULL, 'https://www.instagram.com/chillspacenyc/'),
  (14644, 'Salt Therapy + PEMF', NULL, NULL, 'https://www.instagram.com/chillspacenyc/'),
  (14644, 'Red Light & Cryo Facials', NULL, NULL, 'https://www.instagram.com/chillspacenyc/'),

  -- DEXA SF
  (14673, '1 DEXA Scan', 150, 'USD', 'https://www.dexasf.com/'),
  (14673, '2 DEXA Scans', 199, 'USD', 'https://www.dexasf.com/'),
  (14673, '4 DEXA Scans', 349, 'USD', 'https://www.dexasf.com/'),

  -- DexaFit Irvine
  (14650, 'DEXA Body Scan', 120, 'USD', 'https://www.oc.dexafit.com/'),
  (14650, '2-Person DEXA Scan & Go', 200, 'USD', 'https://www.oc.dexafit.com/'),
  (14650, 'RMR Metabolism Test', 130, 'USD', 'https://www.oc.dexafit.com/'),
  (14650, 'VO2 Max Fitness Test', 170, 'USD', 'https://www.oc.dexafit.com/'),
  (14650, 'Limited Promo', 120, 'USD', 'https://www.oc.dexafit.com/'),
  (14650, 'Bone Density Scan', 300, 'USD', 'https://www.oc.dexafit.com/'),
  (14650, 'Movement Assessment by Kinotek', 100, 'USD', 'https://www.oc.dexafit.com/'),

  -- GOAT Wellness: concise service menu with official single-session prices.
  (14623, 'Cryoskin Facial', 250, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Cryoskin Slimming + Toning', 350, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'CryoFacial', 50, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Localized Cryotherapy', 50, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Whole Body Cryotherapy', 60, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Endosphères Therapy - 45 minutes', 275, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Endosphères Therapy - 60 minutes', 300, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Infrared Sauna - 30 minutes', 30, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Infrared Sauna - 60 minutes', 40, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Normatec Compression', 30, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Hybrid Tanning - UV + Red Light', 35, 'USD', 'https://www.goatchicago.com/pricing'),
  (14623, 'Consultation', NULL, NULL, 'https://www.goatchicago.com/pricing'),

  -- Spa Palace
  (14634, 'Body Scrub - 30 minutes', 60, 'USD', 'https://spapalacela.com/'),
  (14634, 'Derma Scrub - 40 minutes', 80, 'USD', 'https://spapalacela.com/'),
  (14634, 'Body Scrub Massage - 70 minutes', 160, 'USD', 'https://spapalacela.com/'),
  (14634, 'Milk & Honey Nourishing - 70 minutes', 170, 'USD', 'https://spapalacela.com/'),
  (14634, 'Aroma Therapy - 90 minutes', 180, 'USD', 'https://spapalacela.com/'),
  (14634, 'Aroma Massage - 60 minutes', 160, 'USD', 'https://spapalacela.com/'),
  (14634, 'Palace Signature Ritual - 90 minutes', 190, 'USD', 'https://spapalacela.com/'),
  (14634, 'Seaweed Revitalizing Wrap - 90 minutes', 200, 'USD', 'https://spapalacela.com/'),
  (14634, 'Acupressure Massage - 50 minutes', 150, 'USD', 'https://spapalacela.com/'),
  (14634, 'Acupressure Massage - 80 minutes', 190, 'USD', 'https://spapalacela.com/'),
  (14634, 'Swedish Massage - 50 minutes', 160, 'USD', 'https://spapalacela.com/'),
  (14634, 'Swedish Massage - 80 minutes', 200, 'USD', 'https://spapalacela.com/'),
  (14634, 'Deep Tissue Massage - 50 minutes', 170, 'USD', 'https://spapalacela.com/'),
  (14634, 'Deep Tissue Massage - 80 minutes', 210, 'USD', 'https://spapalacela.com/'),
  (14634, 'Couple Escape Suite Experience - 50 minutes', 330, 'USD', 'https://spapalacela.com/'),
  (14634, 'Couple Escape Suite Experience - 80 minutes', 390, 'USD', 'https://spapalacela.com/'),
  (14634, 'CBD Massage - 50 minutes', 180, 'USD', 'https://spapalacela.com/'),
  (14634, 'CBD Massage - 80 minutes', 220, 'USD', 'https://spapalacela.com/'),
  (14634, 'CBD Couple - 50 minutes', 340, 'USD', 'https://spapalacela.com/'),
  (14634, 'CBD Couple - 80 minutes', 420, 'USD', 'https://spapalacela.com/'),

  -- The Austin Bathhouse; official site has no trustworthy prices.
  (14609, 'Nordic Sauna', NULL, NULL, 'https://www.bathhouseatx.com/'),
  (14609, 'Russian Banya', NULL, NULL, 'https://www.bathhouseatx.com/'),
  (14609, 'Hamam', NULL, NULL, 'https://www.bathhouseatx.com/'),
  (14609, 'Aromatherapy Sauna', NULL, NULL, 'https://www.bathhouseatx.com/'),
  (14609, 'Cold Plunge', NULL, NULL, 'https://www.bathhouseatx.com/'),
  (14609, 'Turkish Steam Bath', NULL, NULL, 'https://www.bathhouseatx.com/'),
  (14609, 'Foot Bath', NULL, NULL, 'https://www.bathhouseatx.com/'),
  (14609, 'Sunbed', NULL, NULL, 'https://www.bathhouseatx.com/'),

  -- DRIPBaR South Miami IV menu
  (14638, '100% Hydration IV', 124, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Allergy IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Allstar IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Firm IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Flu Fighter IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Glutathione IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Heavy Metal Detox IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Maternal Wellness IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Metabolize IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Powerpack IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Pre/Post-Op IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Restoration IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Shield IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Soother IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'The Debut IV', 159, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Time Machine IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Vitality IV', 249, 'USD', 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Alpha Lipoic Acid (ALA) IV', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'High Dose Vitamin C IV', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'NAD+ IV', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/iv-therapy/'),
  (14638, 'Sermorelin Peptide Therapy', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Semaglutide & Tirzepatide', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Hyperbaric Chambers', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Ozone Therapy', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Red Light Therapy', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Infrared Sauna', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Halotherapy', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Botox and Dysport', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Compression Boots', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Diamond Glow', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Hydrafacial', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Oral Supplements', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),
  (14638, 'Phlebotomy', NULL, NULL, 'https://south-miami-sunset-drive.thedripbar.com/services-menu/wellness-services/'),

  -- AIRE Toronto: location page confirms these service families but exposes no stable prices.
  (14678, 'Ancient Baths', NULL, NULL, 'https://beaire.com/en/aire-ancient-baths-toronto'),
  (14678, 'Relaxing Massage', NULL, NULL, 'https://beaire.com/en/aire-ancient-baths-toronto'),
  (14678, 'Couples Experience', NULL, NULL, 'https://beaire.com/en/aire-ancient-baths-toronto'),
  (14678, 'Body Ritual', NULL, NULL, 'https://beaire.com/en/aire-ancient-baths-toronto')
) AS approved_menu(location_id, raw_name, price_amount, price_currency, source_offer_url)
ON CONFLICT (location_id, source_id, raw_name) DO UPDATE SET
  price_amount = EXCLUDED.price_amount,
  price_currency = EXCLUDED.price_currency,
  source_offer_url = EXCLUDED.source_offer_url,
  status = 'active';

-- Confirmed duplicate merges. Preserve the established IDs/URLs but overwrite
-- identity fields with the reviewer-preferred enriched candidates first.
UPDATE fountain.locations SET
  name = 'Cardiology Beverly Hills',
  address = '8920 Wilshire Boulevard, Suite 420, Los Angeles, CA 90211',
  locality = 'Los Angeles', region = 'CA', postal_code = '90211', country_code = 'US',
  phone = '+13106525210', email = 'drdaneshrad@cardiologybeverlyhills.com',
  website = 'https://www.cardiologybeverlyhills.com', status = 'active'
WHERE id = 9062;
UPDATE fountain_raw.impossible_health_review_quality_20260713 SET candidate_id = 9062 WHERE candidate_id = 14628;
UPDATE fountain_raw.impossible_health_review_dedup_20260713 SET candidate_id = 9062 WHERE candidate_id = 14628;
UPDATE fountain_raw.impossible_health_review_decisions_20260713 SET candidate_id = 9062 WHERE candidate_id = 14628;
UPDATE fountain_raw.impossible_health_review_notes_20260713 SET candidate_id = 9062 WHERE candidate_id = 14628;
SELECT fountain.merge_locations(9062, 14628, 'b5c71897-83d0-4c30-a7a3-202607130017'::uuid, 'Impossible Health reviewer-approved dedupe; prefer enriched practice identity');

UPDATE fountain.locations SET
  name = 'Center For Diagnostic Imaging Miami',
  address = '7500 SW 87th Avenue, Suite 100, Miami, FL 33173',
  locality = 'Miami', region = 'FL', postal_code = '33173', country_code = 'US',
  phone = '+18003710002',
  website = 'https://www.cdimiami.com/cardiac-calcium-scoring/', status = 'active'
WHERE id = 9077;
UPDATE fountain_raw.impossible_health_review_quality_20260713 SET candidate_id = 9077 WHERE candidate_id = 14637;
UPDATE fountain_raw.impossible_health_review_dedup_20260713 SET candidate_id = 9077 WHERE candidate_id = 14637;
UPDATE fountain_raw.impossible_health_review_decisions_20260713 SET candidate_id = 9077 WHERE candidate_id = 14637;
UPDATE fountain_raw.impossible_health_review_notes_20260713 SET candidate_id = 9077 WHERE candidate_id = 14637;
SELECT fountain.merge_locations(9077, 14637, 'b5c71897-83d0-4c30-a7a3-202607130017'::uuid, 'Impossible Health reviewer-confirmed duplicate; prefer enriched candidate data');

COMMIT;
