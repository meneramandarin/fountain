-- Generated from My London Skin Clinic's official WooCommerce booking menu.
-- Prices are the current AED amounts exposed by the clinic on 2026-08-10.
BEGIN;

SELECT set_config('fountain.actor_id', 'd3b4106a-7f23-4e60-9f12-202608100003', true);
SELECT set_config('fountain.actor_label', 'import_my_london_official_booking_menu_20260810', true);

CREATE TABLE IF NOT EXISTS fountain_raw.my_london_offerings_backup_20260810 AS
SELECT * FROM fountain.offerings WHERE location_id = 14326;

CREATE TEMP TABLE my_london_menu (
  raw_name text NOT NULL,
  price_amount numeric NOT NULL,
  description text NOT NULL,
  source_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO my_london_menu (raw_name, price_amount, description, source_url)
VALUES
    ('Anti Wrinkle (Consultation)', 500, 'Consultation for Anti Wrinkle, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/anti-wrinkle/'),
    ('Biosomes (Consultation)', 500, 'Consultation for Biosomes, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/biosomes-consultation/'),
    ('Blepharoplasty (Consultation)', 500, 'Consultation for Blepharoplasty, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/blepharoplasty/'),
    ('Body Sculpting (Consultation)', 250, 'Consultation for Body Sculpting, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/body-sculpting/'),
    ('Botox in 3 Areas (Offer)', 1488, 'Official online booking offer for Botox in 3 Areas.', 'https://mylondonskinclinic.ae/product/botox-in-3-areas-offer/'),
    ('Carbon Laser Facial (Consultation)', 500, 'Consultation for Carbon Laser Facial, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/carbon-laser-facial-consultation/'),
    ('Consultation', 500, 'Official online booking menu item for Consultation.', 'https://mylondonskinclinic.ae/product/consultation/'),
    ('Dental (Consultation)', 500, 'Consultation for Dental, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/dental-consultation/'),
    ('Depigmentation (Consultation)', 500, 'Consultation for Depigmentation, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/depigmentation-consultation/'),
    ('Dermal Fillers (Consultation)', 1500, 'Consultation for Dermal Fillers, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/dermal-fillers/'),
    ('Dermal Fillers (Offer)', 1350, 'Official online booking offer for Dermal Fillers.', 'https://mylondonskinclinic.ae/product/dermal-fillers-offer/'),
    ('Dermapen Microneedling (Offer)', 999, 'Official online booking offer for Dermapen Microneedling.', 'https://mylondonskinclinic.ae/product/dermapen-microneedling-offer/'),
    ('Eye Health Checkup (Consultation)', 500, 'Consultation for Eye Health Checkup, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/eye-health-checkup-consultation/'),
    ('Family Medicine (Consultation)', 500, 'Consultation for Family Medicine, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/family-medicine/'),
    ('General Health (Consultation)', 500, 'Consultation for General Health, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/general-health-consultation/'),
    ('Genetic Methylation Testing (Consultation)', 500, 'Consultation for Genetic Methylation Testing, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/genetic-methylation-testing-consultation/'),
    ('Genetic Screening (Consultation)', 500, 'Consultation for Genetic Screening, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/genetic-screening-consultation/'),
    ('Hair Bleaching (Consultation)', 500, 'Consultation for Hair Bleaching, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/hair-bleaching-consultation/'),
    ('Health & Wellness (Consultation)', 500, 'Consultation for Health & Wellness, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/health-wellness/'),
    ('Health Screening (Consultation)', 500, 'Consultation for Health Screening, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/health-screening/'),
    ('HydraFacial (Consultation)', 999, 'Consultation for HydraFacial, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/hydrafacial/'),
    ('HydraFacial MD (Offer)', 799, 'Official online booking offer for HydraFacial MD.', 'https://mylondonskinclinic.ae/product/hydrafacial-md-offer/'),
    ('Intensif Skin Treatment (Offer)', 1500, 'Official online booking offer for Intensif Skin Treatment.', 'https://mylondonskinclinic.ae/product/intensif-skin-treatment-offer/'),
    ('IV Drips', 1500, 'Official online booking menu item for IV Drips.', 'https://mylondonskinclinic.ae/product/iv-drips/'),
    ('IV Nutrition (Consultation)', 500, 'Consultation for IV Nutrition, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/iv-nutrition/'),
    ('IV Vitamin Drip (Offer)', 1350, 'Official online booking offer for IV Vitamin Drip.', 'https://mylondonskinclinic.ae/product/iv-vitamin-drip-offer/'),
    ('Laser Hair Removal (Consultation)', 250, 'Consultation for Laser Hair Removal, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/laser-hair-removal/'),
    ('Liquid Gold PRP- Platelet Rich Plasma (Consultation)', 500, 'Consultation for Liquid Gold PRP- Platelet Rich Plasma, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/liquid-gold-prp-platelet-rich-plasma/'),
    ('Methylene Blue (Consultation)', 500, 'Consultation for Methylene Blue, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/methylene-blue-consultation/'),
    ('Osteopath (Consultation)', 500, 'Consultation for Osteopath, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/osteopath-consultation/'),
    ('Ozone Therapy (Consultation)', 500, 'Consultation for Ozone Therapy, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/ozone-therapy-consultation/'),
    ('Profhilo Skin Booster (Consultation)', 2000, 'Consultation for Profhilo Skin Booster, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/profhilo-skin-booster/'),
    ('RTA Testing (Consultation)', 500, 'Consultation for RTA Testing, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/rta-testing-consultation/'),
    ('Scalp MicroPigmentation or SMP', 500, 'Official online booking menu item for Scalp MicroPigmentation or SMP.', 'https://mylondonskinclinic.ae/product/scalp-micropigmentation-or-smp/'),
    ('Sexual Health (Consultation)', 500, 'Consultation for Sexual Health, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/sexual-health/'),
    ('Skin Boosters (Offer)', 1350, 'Official online booking offer for Skin Boosters.', 'https://mylondonskinclinic.ae/product/skin-boosters-offer/'),
    ('Skin Tag and Mole Removal (Consultation)', 500, 'Consultation for Skin Tag and Mole Removal, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/skin-tag-and-mole-removal-consultation/'),
    ('Skin Tightening (Consultation)', 1200, 'Consultation for Skin Tightening, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/skin-tightening/'),
    ('STD/STI Testing (Consultation)', 500, 'Consultation for STD/STI Testing, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/std-sti-testing/'),
    ('Stem Cells (Consultation)', 2000, 'Consultation for Stem Cells, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/stem-cells/'),
    ('Tattoo Removal (Consultation)', 500, 'Consultation for Tattoo Removal, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/tattoo-removal-consultation/'),
    ('Teeth Whitening and Clean (Offer)', 2000, 'Official online booking offer for Teeth Whitening and Clean.', 'https://mylondonskinclinic.ae/product/teeth-whitening-clean-offer/'),
    ('Telomere Testing (Consultation)', 500, 'Consultation for Telomere Testing, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/telomere-testing-consultation/'),
    ('Vaccinations (Consultation)', 500, 'Consultation for Vaccinations, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/vaccinations-consultation/'),
    ('Weight Loss (Consultation)', 500, 'Consultation for Weight Loss, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/weight-loss/'),
    ('XERF Face & Neck Skin Tightening (Consultation)', 8000, 'Consultation for XERF Face & Neck Skin Tightening, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/xerf-skin-tightening-consultation/'),
    ('XERF Face Skin Tightening (Consultation)', 5500, 'Consultation for XERF Face Skin Tightening, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/xerf-face-skin-tightening-consultation/'),
    ('XERF Neck Skin Tightening (Consultation)', 2500, 'Consultation for XERF Neck Skin Tightening, bookable through the clinic''s official online menu.', 'https://mylondonskinclinic.ae/product/xerf-neck-skin-tightening-consultation/');

UPDATE fountain.offerings offering
SET price_amount = menu.price_amount,
    price_currency = 'AED',
    price_type = 'exact',
    price_unit = 'service',
    price_context = 'official online booking price',
    description = COALESCE(NULLIF(trim(offering.description), ''), menu.description),
    source_offer_url = menu.source_url,
    verification_status = CASE WHEN offering.verification_status IN ('human_verified', 'owner_verified') THEN offering.verification_status ELSE 'agent_verified' END,
    updated_at = now()
FROM my_london_menu menu
WHERE offering.location_id = 14326
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
  AND lower(trim(offering.raw_name)) = lower(trim(menu.raw_name));

WITH normalized AS (
  SELECT menu.*,
         CASE
           WHEN lower(raw_name) LIKE '%botox%' OR lower(raw_name) LIKE '%anti wrinkle%' THEN 34
           WHEN lower(raw_name) LIKE '%dermal filler%' THEN 35
           WHEN lower(raw_name) LIKE '%microneedling%' THEN 47
           WHEN lower(raw_name) LIKE '%body sculpting%' THEN 48
           WHEN lower(raw_name) LIKE '%hydrafacial%' THEN 53
           WHEN lower(raw_name) LIKE '%chemical peel%' THEN 57
           WHEN lower(raw_name) LIKE '%laser hair%' THEN 50
           WHEN lower(raw_name) LIKE '%laser tattoo%' THEN 59
           WHEN lower(raw_name) LIKE '%prp%' THEN 19
           WHEN lower(raw_name) LIKE '%exosome%' OR lower(raw_name) LIKE '%biosome%' THEN 18
           WHEN lower(raw_name) LIKE '%weight%' THEN 62
           ELSE NULL
         END AS treatment_id
  FROM my_london_menu menu
)
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency,
  source_offer_url, source_id, status, data_origin, verification_status,
  duration_minutes, description, price_type, price_unit, price_context,
  created_at, updated_at
)
SELECT 14326, normalized.treatment_id, normalized.raw_name,
       normalized.price_amount, 'AED', normalized.source_url, NULL,
       'active', 'manual', 'agent_verified', NULL, normalized.description,
       'exact', 'service', 'official online booking price', now(), now()
FROM normalized
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.offerings existing
  WHERE existing.location_id = 14326
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
    AND lower(trim(existing.raw_name)) = lower(trim(normalized.raw_name))
);

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
VALUES (
  'location', 14326, 'offerings', 'agent_verified', false,
  'import_my_london_official_booking_menu_20260810', now(),
  'https://mylondonskinclinic.ae/product-category/uncategorised/ | official online booking catalog with current AED prices'
)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

COMMIT;
