-- Deepen the active Dubai-emirate directory with official hours, durable
-- images, concrete official menus/prices, and non-duplicative standardized
-- explanations for otherwise blank taxonomy-mapped offerings.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'd3b4106a-7f23-4e60-9f12-202608100001'::uuid,
  'enrich_dubai_listing_depth_20260810'
);

CREATE TABLE IF NOT EXISTS fountain_raw.dubai_listing_depth_locations_backup_20260810 AS
SELECT location.*
FROM fountain.locations location
WHERE location.country_code = 'AE'
  AND (
    lower(coalesce(location.locality, '')) IN ('dubai', 'dubai healthcare city', 'deira')
    OR lower(coalesce(location.region, '')) = 'dubai'
  );

CREATE TABLE IF NOT EXISTS fountain_raw.dubai_listing_depth_offerings_backup_20260810 AS
SELECT offering.*
FROM fountain.offerings offering
JOIN fountain_raw.dubai_listing_depth_locations_backup_20260810 location
  ON location.id = offering.location_id;

CREATE TABLE IF NOT EXISTS fountain_raw.dubai_listing_depth_images_backup_20260810 AS
SELECT image.*
FROM fountain.images image
JOIN fountain_raw.dubai_listing_depth_locations_backup_20260810 location
  ON image.entity_type = 'location'
 AND image.entity_id = location.id;

-- Officially published opening hours. A seven-row schedule is used whenever
-- the source explicitly describes all seven days, including closed days.
WITH hours(location_id, schedule, note, source_url) AS (
  VALUES
    (13715, '[{"day":"Monday","open":"11:00","close":"21:00"},{"day":"Tuesday","open":"11:00","close":"21:00"},{"day":"Wednesday","open":"11:00","close":"21:00"},{"day":"Thursday","open":"11:00","close":"21:00"},{"day":"Friday","closed":true},{"day":"Saturday","open":"11:00","close":"21:00"},{"day":"Sunday","open":"11:00","close":"21:00"}]'::jsonb, 'Friday closed.', 'https://o3clinic.com/services'),
    (14412, '[{"day":"Monday","open":"10:00","close":"20:00"},{"day":"Tuesday","open":"10:00","close":"20:00"},{"day":"Wednesday","open":"10:00","close":"20:00"},{"day":"Thursday","open":"10:00","close":"20:00"},{"day":"Friday","open":"10:00","close":"20:00"},{"day":"Saturday","open":"10:00","close":"19:00"},{"day":"Sunday","open":"10:00","close":"20:00"}]'::jsonb, NULL, 'https://www.edenderma.com/plastic-surgery-in-dubai'),
    (15937, '[{"day":"Monday","open":"08:30","close":"20:00"},{"day":"Tuesday","open":"08:30","close":"20:00"},{"day":"Wednesday","open":"08:30","close":"20:00"},{"day":"Thursday","open":"08:30","close":"20:00"},{"day":"Friday","open":"08:30","close":"20:00"},{"day":"Saturday","open":"08:30","close":"20:00"},{"day":"Sunday","open":"08:30","close":"20:00"}]'::jsonb, 'Al Wasl Road clinic hours.', 'https://dnahealthcorp.com/contact-us/'),
    (15945, '[{"day":"Monday","open":"10:00","close":"22:00"},{"day":"Tuesday","open":"10:00","close":"22:00"},{"day":"Wednesday","open":"10:00","close":"22:00"},{"day":"Thursday","open":"10:00","close":"22:00"},{"day":"Friday","open":"10:00","close":"22:00"},{"day":"Saturday","open":"10:00","close":"21:00"},{"day":"Sunday","open":"10:00","close":"22:00"}]'::jsonb, 'Saturday closes at 9 PM.', 'https://dynastyclinic.ae/get-in-touch-with-dynasty/'),
    (13626, '[{"day":"Monday","open":"08:00","close":"21:00"},{"day":"Tuesday","open":"08:00","close":"21:00"},{"day":"Wednesday","open":"08:00","close":"21:00"},{"day":"Thursday","open":"08:00","close":"21:00"},{"day":"Friday","closed":true},{"day":"Saturday","open":"08:00","close":"21:00"},{"day":"Sunday","open":"08:00","close":"21:00"}]'::jsonb, 'Novomed Wellness, 17C Street; Friday closed.', 'https://novomed.com/location/novomed-wellness/'),
    (13713, '[{"day":"Monday","open":"10:00","close":"20:00"},{"day":"Tuesday","open":"10:00","close":"20:00"},{"day":"Wednesday","open":"10:00","close":"20:00"},{"day":"Thursday","open":"10:00","close":"20:00"},{"day":"Friday","open":"10:00","close":"20:00"},{"day":"Saturday","open":"10:00","close":"20:00"},{"day":"Sunday","closed":true}]'::jsonb, 'Sunday closed.', 'https://www.oxygenome.ae/'),
    (15947, '[{"day":"Monday","open":"09:00","close":"20:00"},{"day":"Tuesday","open":"09:00","close":"20:00"},{"day":"Wednesday","open":"09:00","close":"20:00"},{"day":"Thursday","open":"09:00","close":"20:00"},{"day":"Friday","open":"09:00","close":"20:00"},{"day":"Saturday","open":"09:00","close":"20:00"},{"day":"Sunday","open":"09:00","close":"20:00"}]'::jsonb, NULL, 'https://wellth.ae/landing-page/'),
    (2551, '[{"day":"Monday","open":"10:00","close":"19:00"},{"day":"Tuesday","open":"10:00","close":"19:00"},{"day":"Wednesday","open":"10:00","close":"19:00"},{"day":"Thursday","open":"10:00","close":"19:00"},{"day":"Friday","open":"10:00","close":"19:00"},{"day":"Saturday","open":"10:00","close":"19:00"},{"day":"Sunday","closed":true}]'::jsonb, 'Sunday closed.', 'https://elitevita.ae/contact-us/'),
    (14326, '[{"day":"Monday","open":"09:00","close":"22:00"},{"day":"Tuesday","open":"09:00","close":"22:00"},{"day":"Wednesday","open":"09:00","close":"22:00"},{"day":"Thursday","open":"09:00","close":"22:00"},{"day":"Friday","open":"09:00","close":"22:00"},{"day":"Saturday","open":"09:00","close":"22:00"},{"day":"Sunday","open":"09:00","close":"22:00"}]'::jsonb, NULL, 'https://mylondonskinclinic.ae/'),
    (16046, '[{"day":"Monday","open":"05:00","close":"23:59"},{"day":"Tuesday","open":"05:00","close":"23:59"},{"day":"Wednesday","open":"05:00","close":"23:59"},{"day":"Thursday","open":"05:00","close":"23:59"},{"day":"Friday","open":"05:00","close":"23:59"},{"day":"Saturday","open":"05:00","close":"23:59"},{"day":"Sunday","open":"05:30","close":"23:30"}]'::jsonb, 'Family-gym hours; Monday-Saturday closes at midnight.', 'https://zaryawellnesshealthclub.com/'),
    (14249, '[{"day":"Monday","open":"08:00","close":"21:00"},{"day":"Tuesday","open":"08:00","close":"21:00"},{"day":"Wednesday","open":"08:00","close":"21:00"},{"day":"Thursday","open":"08:00","close":"21:00"},{"day":"Friday","open":"09:00","close":"19:00"},{"day":"Saturday","open":"08:00","close":"21:00"},{"day":"Sunday","open":"08:00","close":"21:00"}]'::jsonb, 'Hospital hours; emergency services are open 24 hours.', 'https://azhd.ae/contact/'),
    (14156, '[{"day":"Monday","open":"10:00","close":"22:00"},{"day":"Tuesday","open":"10:00","close":"22:00"},{"day":"Wednesday","open":"10:00","close":"22:00"},{"day":"Thursday","open":"10:00","close":"22:00"},{"day":"Friday","open":"10:00","close":"22:00"},{"day":"Saturday","open":"10:00","close":"22:00"},{"day":"Sunday","open":"10:00","close":"22:00"}]'::jsonb, 'Published visiting hours; emergency services are open 24 hours.', 'https://www.gph.ae/en/visitplan'),
    (16067, '[{"day":"Monday","open":"00:00","close":"23:59"},{"day":"Tuesday","open":"00:00","close":"23:59"},{"day":"Wednesday","open":"00:00","close":"23:59"},{"day":"Thursday","open":"00:00","close":"23:59"},{"day":"Friday","open":"00:00","close":"23:59"},{"day":"Saturday","open":"00:00","close":"23:59"},{"day":"Sunday","open":"00:00","close":"23:59"}]'::jsonb, 'Dubai Hills hospital is open 24 hours.', 'https://kingscollegehospitaldubai.com/location/dubai-hills-hospital/'),
    (13925, '[{"day":"Monday","open":"07:00","close":"19:00"},{"day":"Tuesday","open":"07:00","close":"19:00"},{"day":"Wednesday","open":"07:00","close":"19:00"},{"day":"Thursday","open":"07:00","close":"19:00"},{"day":"Friday","open":"07:00","close":"19:00"}]'::jsonb, 'Weekend availability by enquiry.', 'https://www.doctify.com/en-ae/practice/the-brain-and-performance-centre'),
    (14244, '[{"day":"Monday","open":"07:00","close":"19:00"},{"day":"Tuesday","open":"07:00","close":"19:00"},{"day":"Wednesday","open":"07:00","close":"19:00"},{"day":"Thursday","open":"07:00","close":"19:00"},{"day":"Friday","open":"07:00","close":"19:00"}]'::jsonb, 'Weekend availability by enquiry.', 'https://www.doctify.com/en-ae/practice/the-brain-and-performance-centre')
)
UPDATE fountain.locations location
SET opening_hours = hours.schedule,
    opening_hours_note = hours.note,
    verification_status = CASE
      WHEN location.verification_status IN ('human_verified', 'owner_verified')
        THEN location.verification_status
      ELSE 'agent_verified'
    END,
    updated_at = now()
FROM hours
WHERE location.id = hours.location_id
  AND location.status = 'active'
  AND location.deleted_at IS NULL
  AND (location.opening_hours IS NULL OR location.opening_hours = '[]'::jsonb);

WITH hours(location_id, source_url) AS (
  VALUES
    (13715, 'https://o3clinic.com/services'),
    (14412, 'https://www.edenderma.com/plastic-surgery-in-dubai'),
    (15937, 'https://dnahealthcorp.com/contact-us/'),
    (15945, 'https://dynastyclinic.ae/get-in-touch-with-dynasty/'),
    (13626, 'https://novomed.com/location/novomed-wellness/'),
    (13713, 'https://www.oxygenome.ae/'),
    (15947, 'https://wellth.ae/landing-page/'),
    (2551, 'https://elitevita.ae/contact-us/'),
    (14326, 'https://mylondonskinclinic.ae/'),
    (16046, 'https://zaryawellnesshealthclub.com/'),
    (14249, 'https://azhd.ae/contact/'),
    (14156, 'https://www.gph.ae/en/visitplan'),
    (16067, 'https://kingscollegehospitaldubai.com/location/dubai-hills-hospital/'),
    (13925, 'https://www.doctify.com/en-ae/practice/the-brain-and-performance-centre'),
    (14244, 'https://www.doctify.com/en-ae/practice/the-brain-and-performance-centre')
)
INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
SELECT 'location', hours.location_id, 'opening_hours', 'agent_verified', false,
       'enrich_dubai_listing_depth_20260810', now(),
       hours.source_url || ' | published opening hours'
FROM hours
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

-- Official images were downloaded, visually checked, normalized to WebP, and
-- stored in Vercel Blob so cards do not depend on third-party hotlinks.
WITH assets(entity_id, image_url, blob_url, content_sha256, alt, image_kind) AS (
  VALUES
    (13715,
     'https://storage.googleapis.com/gpt-engineer-file-uploads/z1zxz43JZve5lmTNkM1zgbNDahw2/social-images/social-1774877834655-Favicon.webp',
     'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/dubai-20260810/location/13715/4ef73152006aefe43830.webp',
     '4ef73152006aefe438309894f45d674b206ecb323f21e96cf68113f4ed04e8c8',
     'O3 Wellness Center logo', 'logo'),
    (14412,
     'https://static.wixstatic.com/media/f6cd74_e7659383c0404bda8e38a00c46307ea9~mv2.jpg/v1/fill/w_1024,h_749,al_c/f6cd74_e7659383c0404bda8e38a00c46307ea9~mv2.jpg',
     'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/dubai-20260810/location/14412/21b4b3b31404fdb515a2.webp',
     '21b4b3b31404fdb515a26ea4b98b116a8228b7d1e3dece20a8ae5174c152f815',
     'Eden Aesthetics Clinic in Dubai', 'photo'),
    (16222,
     'https://peptide.firstresponsehealthcare.com/images/Hero%20image%20-%20Copy.jpg',
     'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/dubai-20260810/location/16222/03565061ebbe20958afa.webp',
     '03565061ebbe20958afa8bfc6a193483c068c7a9a7afbef93ece814230838048',
     'First Response Healthcare peptide therapy', 'photo')
)
INSERT INTO fountain.images (
  entity_type, entity_id, image_url, blob_url, content_sha256, alt,
  source_id, status, data_origin, verification_status, image_kind,
  created_at, updated_at
)
SELECT 'location', assets.entity_id, assets.image_url, assets.blob_url,
       assets.content_sha256, assets.alt, NULL, 'active', 'manual',
       'agent_verified', assets.image_kind, now(), now()
FROM assets
WHERE NOT EXISTS (
  SELECT 1
  FROM fountain.images existing
  WHERE existing.entity_type = 'location'
    AND existing.entity_id = assets.entity_id
    AND existing.content_sha256 = assets.content_sha256
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
);

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
SELECT 'location', entity_id, 'images', 'agent_verified', false,
       'enrich_dubai_listing_depth_20260810', now(),
       'Official website image, downloaded and stored in Vercel Blob'
FROM (VALUES (13715), (14412), (16222)) image_locations(entity_id)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

-- O3 previously exposed one unverified generic HBOT row. Replace it with the
-- complete, currently published service menu and official durations/details.
UPDATE fountain.offerings
SET status = 'deleted', deleted_at = coalesce(deleted_at, now()), updated_at = now()
WHERE location_id = 13715
  AND status = 'active'
  AND deleted_at IS NULL;

WITH menu(treatment_id, raw_name, duration_minutes, description) AS (
  VALUES
    (27, 'Hyperbaric Oxygen Therapy', 75, 'A pressurized oxygen session designed to increase oxygen delivery, support recovery, and help reduce inflammation.'),
    (NULL, 'Neurovizer Brain Therapy', 60, 'Light-and-sound neurostimulation delivered through a headset to support focus, creativity, relaxation, sleep, and mood.'),
    (74, 'IV Drips', 60, 'An intravenous blend of vitamins and ozone intended to support nutrient delivery, detoxification, immunity, and vitality.'),
    (45, 'Chiropractic Care', 60, 'Spinal adjustments intended to improve alignment, ease tension, and support mobility and nervous-system function.'),
    (32, 'O3 Plasma (PEMF)', 60, 'Pulsed electromagnetic field therapy used to support circulation, tissue recovery, pain relief, and inflammation management.'),
    (NULL, 'Hijama (Cupping Therapy)', 60, 'Vacuum-cup therapy used to stimulate circulation, release muscular tension, and support recovery.'),
    (NULL, 'Fire Cupping', 60, 'Traditional heated-cup therapy used to stimulate circulation, release muscular tension, and support recovery.'),
    (NULL, 'Kinesio Tape', 60, 'Elastic therapeutic taping applied to support muscles and joints while allowing movement during rehabilitation or sport.'),
    (56, 'Lymphatic Drainage (Machine)', 60, 'Machine-assisted lymphatic drainage intended to reduce fluid retention and puffiness while supporting circulation and relaxation.'),
    (44, 'Physiotherapy', 60, 'Hands-on rehabilitation and movement care used to relieve pain, improve mobility and posture, and support injury recovery.'),
    (46, 'Acupuncture', 60, 'Fine-needle therapy applied at selected points to relieve tension and pain and support mobility and recovery.'),
    (NULL, 'O3 Bio Electricity Treatment', 35, 'A practitioner-delivered microcurrent treatment using a specialized device to support circulation, muscle relaxation, and pain management.'),
    (49, 'Sport Massage', 60, 'Targeted massage for muscles used in training or physical activity, intended to ease tightness and support flexibility and recovery.'),
    (30, 'Infrared Salted Sauna', 60, 'Infrared heat therapy intended to promote relaxation, circulation, sweating, and muscle recovery in a salt-sauna setting.'),
    (NULL, 'Traditional Chinese Medicine', 60, 'A holistic consultation and treatment approach that may combine acupuncture, herbal care, and traditional techniques to restore balance.')
)
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency,
  source_offer_url, source_id, status, data_origin, verification_status,
  duration_minutes, description, price_type, price_unit, created_at, updated_at
)
SELECT 13715, menu.treatment_id, menu.raw_name, NULL, NULL,
       'https://o3clinic.com/services', NULL, 'active', 'manual',
       'agent_verified', menu.duration_minutes, menu.description,
       'on_request', 'service', now(), now()
FROM menu
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.offerings existing
  WHERE existing.location_id = 13715
    AND lower(trim(existing.raw_name)) = lower(trim(menu.raw_name))
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
);

-- RESYNC publishes a complete AED price list. Retire the generic HBOT row and
-- represent duration/session-count variants independently so prices are not
-- collapsed across materially different products.
UPDATE fountain.offerings
SET status = 'deleted', deleted_at = coalesce(deleted_at, now()), updated_at = now()
WHERE location_id = 13860
  AND status = 'active'
  AND deleted_at IS NULL;

WITH menu(treatment_id, raw_name, price_amount, duration_minutes, price_unit, price_context, description, price_type) AS (
  VALUES
    (27, 'Hyperbaric Oxygen Therapy — 30 min, 1 session', 450, 30, 'service', NULL, 'One 30-minute hyperbaric oxygen therapy session.', 'exact'),
    (27, 'Hyperbaric Oxygen Therapy — 30 min, 5 sessions', 2000, 30, 'package', 'AED 400 per session', 'Package of five 30-minute hyperbaric oxygen therapy sessions.', 'exact'),
    (27, 'Hyperbaric Oxygen Therapy — 30 min, 10 sessions', 3500, 30, 'package', 'AED 350 per session', 'Package of ten 30-minute hyperbaric oxygen therapy sessions.', 'exact'),
    (27, 'Hyperbaric Oxygen Therapy — 60 min, 1 session', 750, 60, 'service', NULL, 'One 60-minute hyperbaric oxygen therapy session.', 'exact'),
    (27, 'Hyperbaric Oxygen Therapy — 60 min, 5 sessions', 3500, 60, 'package', 'AED 700 per session', 'Package of five 60-minute hyperbaric oxygen therapy sessions.', 'exact'),
    (27, 'Hyperbaric Oxygen Therapy — 60 min, 10 sessions', 6500, 60, 'package', 'AED 650 per session', 'Package of ten 60-minute hyperbaric oxygen therapy sessions.', 'exact'),
    (27, 'Hyperbaric Oxygen Therapy — 90 min, 1 session', 950, 90, 'service', NULL, 'One 90-minute hyperbaric oxygen therapy session.', 'exact'),
    (27, 'Hyperbaric Oxygen Therapy — 90 min, 5 sessions', 4250, 90, 'package', 'AED 850 per session', 'Package of five 90-minute hyperbaric oxygen therapy sessions.', 'exact'),
    (27, 'Hyperbaric Oxygen Therapy — 90 min, 10 sessions', 7500, 90, 'package', 'AED 750 per session', 'Package of ten 90-minute hyperbaric oxygen therapy sessions.', 'exact'),
    (28, 'Whole Body Cryotherapy — 1 session', 350, NULL, 'service', NULL, 'One whole-body cryotherapy session.', 'exact'),
    (28, 'Whole Body Cryotherapy — 5 sessions', 1250, NULL, 'package', 'AED 250 per session', 'Package of five whole-body cryotherapy sessions.', 'exact'),
    (28, 'Whole Body Cryotherapy — 10 sessions', 2000, NULL, 'package', 'AED 200 per session', 'Package of ten whole-body cryotherapy sessions.', 'exact'),
    (28, 'Cryo With Friends — 2 people', 440, NULL, 'package', 'two people', 'Whole-body cryotherapy booking for two people.', 'exact'),
    (28, 'Cryo With Friends — 3 people', 540, NULL, 'package', 'three people', 'Whole-body cryotherapy booking for three people.', 'exact'),
    (28, 'Cryo With Friends — 4 people', 600, NULL, 'package', 'four people', 'Whole-body cryotherapy booking for four people.', 'exact'),
    (52, 'Cryo T-Shock Face — 1 session', 700, NULL, 'service', NULL, 'One face-focused Cryo T-Shock treatment.', 'exact'),
    (52, 'Cryo T-Shock Face — 6 sessions', 3000, NULL, 'package', 'AED 500 per session', 'Package of six face-focused Cryo T-Shock treatments.', 'exact'),
    (52, 'Cryo T-Shock Face — 12 sessions', 4800, NULL, 'package', 'AED 400 per session', 'Package of twelve face-focused Cryo T-Shock treatments.', 'exact'),
    (48, 'Cryo T-Shock Body — 1 session', 1000, NULL, 'service', NULL, 'One body-focused Cryo T-Shock contouring treatment.', 'exact'),
    (48, 'Cryo T-Shock Body — 6 sessions', 3600, NULL, 'package', 'AED 600 per session', 'Package of six body-focused Cryo T-Shock contouring treatments.', 'exact'),
    (48, 'Cryo T-Shock Body — 12 sessions', 6000, NULL, 'package', 'AED 500 per session', 'Package of twelve body-focused Cryo T-Shock contouring treatments.', 'exact'),
    (31, 'Red Light Therapy — 1 session', 350, NULL, 'service', NULL, 'One red-light therapy session.', 'exact'),
    (31, 'Red Light Therapy — 5 sessions', 1250, NULL, 'package', 'AED 250 per session', 'Package of five red-light therapy sessions.', 'exact'),
    (31, 'Red Light Therapy — 10 sessions', 2000, NULL, 'package', 'AED 200 per session', 'Package of ten red-light therapy sessions.', 'exact'),
    (52, 'Endosphères Face — 1 session', 450, NULL, 'service', NULL, 'One face-focused Endosphères treatment.', 'exact'),
    (52, 'Endosphères Face — 6 sessions', 2100, NULL, 'package', 'AED 350 per session', 'Package of six face-focused Endosphères treatments.', 'exact'),
    (52, 'Endosphères Face — 12 sessions', 3000, NULL, 'package', 'AED 250 per session', 'Package of twelve face-focused Endosphères treatments.', 'exact'),
    (48, 'Endosphères Body — 1 session', 700, NULL, 'service', NULL, 'One body-focused Endosphères treatment.', 'exact'),
    (48, 'Endosphères Body — 6 sessions', 3300, NULL, 'package', 'AED 550 per session', 'Package of six body-focused Endosphères treatments.', 'exact'),
    (48, 'Endosphères Body — 12 sessions', 4800, NULL, 'package', 'AED 400 per session', 'Package of twelve body-focused Endosphères treatments.', 'exact'),
    (53, 'Hydra Glow Facial', 650, NULL, 'service', 'starting from', 'Hydrating glow facial, with the published price shown as a starting rate.', 'starting_at'),
    (56, 'Lymphatic Face Massage', 350, NULL, 'service', 'starting from', 'Face massage focused on lymphatic drainage, with the published price shown as a starting rate.', 'starting_at'),
    (49, 'Lifting Face Massage', 350, NULL, 'service', 'starting from', 'Face massage focused on lifting techniques, with the published price shown as a starting rate.', 'starting_at'),
    (49, 'Muscle Release Massage — 30 min', 350, 30, 'service', NULL, 'Thirty-minute muscle-release massage.', 'exact'),
    (49, 'Muscle Release Massage — 60 min', 480, 60, 'service', NULL, 'Sixty-minute muscle-release massage.', 'exact'),
    (49, 'Muscle Release Massage — 90 min', 550, 90, 'service', NULL, 'Ninety-minute muscle-release massage.', 'exact'),
    (49, 'Deep Tissue Massage — 30 min', 350, 30, 'service', NULL, 'Thirty-minute deep-tissue massage.', 'exact'),
    (49, 'Deep Tissue Massage — 60 min', 480, 60, 'service', NULL, 'Sixty-minute deep-tissue massage.', 'exact'),
    (49, 'Deep Tissue Massage — 90 min', 550, 90, 'service', NULL, 'Ninety-minute deep-tissue massage.', 'exact'),
    (56, 'Lymphatic Massage — 30 min', 350, 30, 'service', NULL, 'Thirty-minute lymphatic massage.', 'exact'),
    (56, 'Lymphatic Massage — 60 min', 480, 60, 'service', NULL, 'Sixty-minute lymphatic massage.', 'exact'),
    (56, 'Lymphatic Massage — 90 min', 550, 90, 'service', NULL, 'Ninety-minute lymphatic massage.', 'exact'),
    (49, 'Massage Package — 5 sessions plus 1 free', 2400, NULL, 'package', 'six total sessions', 'Five paid massage sessions plus one complimentary session.', 'exact'),
    (49, 'Massage Package — 10 sessions plus 2 free', 4800, NULL, 'package', 'twelve total sessions', 'Ten paid massage sessions plus two complimentary sessions.', 'exact'),
    (48, 'Slim & Sculpt — 6 sessions', 4200, NULL, 'package', 'Endosphères and Cryo T-Shock Body', 'Six-session body-contouring package combining Endosphères and Cryo T-Shock Body.', 'exact'),
    (48, 'Slim & Sculpt — 12 sessions', 7200, NULL, 'package', 'Endosphères and Cryo T-Shock Body', 'Twelve-session body-contouring package combining Endosphères and Cryo T-Shock Body.', 'exact'),
    (53, 'Glow Getter Facial Package — 1 session', 650, NULL, 'service', NULL, 'One facial selected from the published Glow Getter menu.', 'exact'),
    (53, 'Glow Getter Facial Package — 5 sessions', 3200, NULL, 'package', 'AED 640 per session', 'Package of five facials selected from the published Glow Getter menu.', 'exact'),
    (53, 'Glow Getter Facial Package — 10 sessions', 4800, NULL, 'package', 'AED 480 per session', 'Package of ten facials selected from the published Glow Getter menu.', 'exact')
)
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency,
  source_offer_url, source_id, status, data_origin, verification_status,
  duration_minutes, description, price_type, price_unit, price_context,
  created_at, updated_at
)
SELECT 13860, menu.treatment_id, menu.raw_name, menu.price_amount, 'AED',
       'https://resync.ae/pricing/', NULL, 'active', 'manual',
       'agent_verified', menu.duration_minutes, menu.description,
       menu.price_type, menu.price_unit, menu.price_context, now(), now()
FROM menu
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.offerings existing
  WHERE existing.location_id = 13860
    AND lower(trim(existing.raw_name)) = lower(trim(menu.raw_name))
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
);

-- Additional official, currently priced products for other Dubai listings.
WITH priced_menu(location_id, treatment_id, raw_name, price_amount, price_type, price_unit, price_context, duration_minutes, description, source_url) AS (
  VALUES
    (2060, NULL, 'Premium Monthly Membership', 2999, 'exact', 'month', 'minimum three-month commitment', NULL, 'Monthly Next Health membership with baseline testing, vitamin shots, IV vitamin therapy, and 20 customizable Next Tech credits.', 'https://nexthealth.ae/group/wellness-programs/'),
    (2060, NULL, 'Optimize Monthly Membership', 1999, 'exact', 'month', 'minimum three-month commitment', NULL, 'Monthly Next Health membership with body and skin analysis, baseline tests, one IM shot, and 10 customizable optimization credits.', 'https://nexthealth.ae/group/wellness-programs/'),
    (16034, NULL, 'Platinum+ Membership', 1590, 'exact', 'package', 'membership price', NULL, 'UCRYO Platinum+ membership sold through the official UCRYO store.', 'https://ucryowellness.com/ucryo-store/'),
    (16034, NULL, 'Platinum Membership', 1290, 'exact', 'package', 'membership price', NULL, 'UCRYO Platinum membership sold through the official UCRYO store.', 'https://ucryowellness.com/ucryo-store/'),
    (16034, NULL, 'Gold Membership', 990, 'exact', 'package', 'membership price', NULL, 'UCRYO Gold membership sold through the official UCRYO store.', 'https://ucryowellness.com/ucryo-store/'),
    (16034, 53, 'HydroFacial Express', 549, 'exact', 'service', NULL, NULL, 'Express hydrating facial sold through the official UCRYO store.', 'https://ucryowellness.com/ucryo-store/'),
    (16034, 48, 'Slim & Glow', 999, 'exact', 'package', 'Cryo T-Shock Body plus complimentary Cryo T-Shock Facial', NULL, 'Same-day package pairing one Cryo T-Shock Body treatment with one complimentary Cryo T-Shock Facial.', 'https://ucryowellness.com/products/slim-glow/'),
    (16034, 28, 'Freeze and Squeeze', 299, 'exact', 'package', 'whole-body cryotherapy plus compression therapy', NULL, 'Same-day package combining whole-body cryotherapy with compression recovery therapy.', 'https://ucryowellness.com/products/freeze-and-squeeze/'),
    (16034, NULL, 'VIP Access — 5 sessions', 690, 'exact', 'package', 'five mix-and-match lifestyle-treatment sessions', NULL, 'Five UCRYO lifestyle-treatment sessions that may be mixed and matched under the published offer terms.', 'https://ucryowellness.com/products/vip-access/'),
    (14412, 36, 'Plastic Surgery Consultation', 500, 'exact', 'service', 'redeemable toward treatment', 30, 'Thirty-minute plastic-surgery consultation; the published AED 500 fee is redeemable toward treatment.', 'https://www.edenderma.com/service-page/plastic-surgery-%D8%AC%D8%B1%D8%A7%D8%AD%D8%A9-%D8%AA%D8%AC%D9%85%D9%8A%D9%84%D9%8A%D8%A9'),
    (2551, 74, 'Vitamin IV Drip', 490, 'starting_at', 'service', 'after discount; free home visit for qualifying drips', NULL, 'Customized vitamin IV drip administered by the clinic medical team; official pricing starts at AED 490 after discount.', 'https://elitevita.ae/vitamin-drips-dubai/')
)
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency,
  source_offer_url, source_id, status, data_origin, verification_status,
  duration_minutes, description, price_type, price_unit, price_context,
  created_at, updated_at
)
SELECT priced_menu.location_id, priced_menu.treatment_id, priced_menu.raw_name,
       priced_menu.price_amount, 'AED', priced_menu.source_url, NULL, 'active',
       'manual', 'agent_verified', priced_menu.duration_minutes,
       priced_menu.description, priced_menu.price_type, priced_menu.price_unit,
       priced_menu.price_context, now(), now()
FROM priced_menu
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.offerings existing
  WHERE existing.location_id = priced_menu.location_id
    AND lower(trim(existing.raw_name)) = lower(trim(priced_menu.raw_name))
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
);

-- Fill blank descriptions for taxonomy-mapped Dubai offerings without
-- pretending that the standardized explanation is provider-specific.
WITH catalog(treatment_id, description) AS (
  VALUES
    (1, 'Magnetic resonance imaging used to create detailed images of internal anatomy without ionizing radiation.'),
    (2, 'Computed tomography imaging that uses X-rays to create cross-sectional views of the body.'),
    (3, 'Dual-energy X-ray absorptiometry used to assess bone density and, when offered, body composition.'),
    (4, 'Measurement of body fat, lean mass, and related composition metrics used to establish or track a health baseline.'),
    (5, 'A biological-age assessment that analyzes epigenetic markers associated with aging.'),
    (6, 'A comprehensive blood-testing panel used to assess multiple health markers.'),
    (7, 'A broad biomarker panel used to measure health, performance, or longevity-related indicators.'),
    (8, 'A graded exercise test that estimates maximal oxygen uptake and cardiorespiratory fitness.'),
    (9, 'Genetic analysis used to identify inherited traits or health-related variants.'),
    (10, 'Screening intended to identify signs or risk markers associated with one or more cancers.'),
    (11, 'Testing used to assess cardiovascular health and risk factors.'),
    (12, 'An overnight or at-home assessment used to evaluate sleep patterns and possible sleep disorders.'),
    (13, 'Testing that measures telomere-related markers sometimes used in biological-aging assessments.'),
    (14, 'Laboratory testing used to measure hormone levels and identify possible imbalances.'),
    (15, 'Testing focused on metabolic and cardiovascular health markers.'),
    (16, 'A comprehensive preventive assessment that combines clinical review with selected diagnostics and screening.'),
    (17, 'Clinician-directed regenerative treatment involving stem cells or stem-cell-derived products, subject to medical assessment and local regulation.'),
    (18, 'Clinician-directed regenerative treatment using exosome-based products, subject to medical assessment and local regulation.'),
    (19, 'Platelet-rich plasma treatment prepared from the patient''s blood and used in regenerative or aesthetic care.'),
    (20, 'Clinician-supervised peptide protocol selected for an individual treatment goal after medical assessment.'),
    (22, 'An intravenous infusion containing NAD+ used in medically supervised wellness or recovery programs.'),
    (24, 'Clinician-supervised care intended to assess and optimize hormone levels based on symptoms and laboratory findings.'),
    (27, 'Hyperbaric oxygen therapy delivered in a pressurized chamber under an appropriate clinical or wellness protocol.'),
    (28, 'Cold-exposure treatment used in recovery, pain-management, or wellness programs.'),
    (30, 'Heat-based sauna or infrared treatment used for relaxation, circulation, and recovery.'),
    (31, 'Red or near-infrared light exposure used in photobiomodulation and recovery protocols.'),
    (34, 'Botulinum-toxin injections used for selected aesthetic or therapeutic indications after clinical assessment.'),
    (35, 'Injectable gel treatment used to restore volume, contour features, or soften selected lines.'),
    (36, 'Clinician-delivered aesthetic consultation or treatment selected for an individual cosmetic goal.'),
    (39, 'Personalized nutrition guidance based on health goals, assessment findings, and dietary needs.'),
    (40, 'A personalized supplement plan selected from health history, goals, and relevant test findings.'),
    (41, 'Individualized exercise guidance designed around fitness, health, performance, or rehabilitation goals.'),
    (42, 'A personalized program intended to improve sleep quality, timing, habits, or contributing health factors.'),
    (43, 'A systems-oriented medical approach that evaluates health history, lifestyle, and contributing factors to create an individualized plan.'),
    (44, 'Rehabilitation and movement therapy provided to restore mobility, function, and recovery.'),
    (46, 'Needle-based traditional or medical acupuncture treatment selected after practitioner assessment.'),
    (47, 'Collagen-induction skin treatment using fine needles, with or without radiofrequency energy.'),
    (48, 'Non-surgical body-sculpting treatment intended to contour selected areas or reduce the appearance of localized fat or cellulite.'),
    (50, 'Laser-based treatment intended to reduce unwanted hair growth.'),
    (51, 'Assessment and treatment options intended to address hair thinning or hair loss.'),
    (52, 'Non-surgical treatment using energy-based or related modalities to improve skin firmness.'),
    (53, 'Hydradermabrasion-style facial treatment that cleanses, exfoliates, extracts, and hydrates the skin.'),
    (57, 'Controlled application of a chemical solution to exfoliate the skin and address selected texture or pigmentation concerns.'),
    (61, 'Clinician-supervised hormone therapy for menopause or perimenopause based on symptoms, risk assessment, and appropriate testing.'),
    (67, 'Preventive clinical care focused on risk assessment, screening, and maintaining health before disease develops.'),
    (74, 'Intravenous infusion formulated with selected fluids, vitamins, minerals, or other clinician-approved ingredients.'),
    (114, 'Clinician-supervised ketamine or esketamine treatment delivered under an appropriate medical protocol.')
), dubai_locations AS (
  SELECT id
  FROM fountain.locations
  WHERE status = 'active'
    AND deleted_at IS NULL
    AND country_code = 'AE'
    AND (
      lower(coalesce(locality, '')) IN ('dubai', 'dubai healthcare city', 'deira')
      OR lower(coalesce(region, '')) = 'dubai'
    )
)
UPDATE fountain.offerings offering
SET description = catalog.description,
    updated_at = now()
FROM catalog
WHERE offering.treatment_id = catalog.treatment_id
  AND offering.location_id IN (SELECT id FROM dubai_locations)
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
  AND nullif(trim(offering.description), '') IS NULL;

-- Field-level provenance for all official menu rows and standardized fallback
-- descriptions. Official rows carry their page URL; standardized rows are
-- clearly labeled as taxonomy explanations.
INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
SELECT 'offering', offering.id, field.field, 'agent_verified', false,
       'enrich_dubai_listing_depth_20260810', now(),
       offering.source_offer_url || ' | official published menu'
FROM fountain.offerings offering
CROSS JOIN (VALUES
  ('raw_name'), ('description'), ('duration_minutes'),
  ('price_amount'), ('price_currency'), ('price_type'), ('price_unit')
) field(field)
WHERE offering.location_id IN (13715, 13860, 2060, 16034, 14412, 2551)
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
  AND offering.verification_status = 'agent_verified'
  AND offering.source_offer_url IS NOT NULL
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

WITH standardized AS (
  SELECT offering.id
  FROM fountain.offerings offering
  JOIN fountain_raw.dubai_listing_depth_offerings_backup_20260810 previous
    ON previous.id = offering.id
  JOIN fountain.locations location ON location.id = offering.location_id
  WHERE location.status = 'active'
    AND location.deleted_at IS NULL
    AND location.country_code = 'AE'
    AND (
      lower(coalesce(location.locality, '')) IN ('dubai', 'dubai healthcare city', 'deira')
      OR lower(coalesce(location.region, '')) = 'dubai'
    )
    AND offering.status = 'active'
    AND offering.deleted_at IS NULL
    AND offering.treatment_id IS NOT NULL
    AND nullif(trim(previous.description), '') IS NULL
    AND nullif(trim(offering.description), '') IS NOT NULL
)
INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
SELECT 'offering', standardized.id, 'description', 'agent_verified', false,
       'enrich_dubai_listing_depth_20260810', now(),
       'Standardized explanation derived from Fountain canonical treatment taxonomy; provider-specific claims were not added'
FROM standardized
ON CONFLICT (entity_type, entity_id, field) DO NOTHING;

SELECT fountain.refresh_search_index_for_location(location_id)
FROM (VALUES
  (13715), (13860), (2060), (16034), (14412), (2551),
  (15937), (15945), (13626), (13713), (15947), (14326),
  (16046), (14249), (14156), (16067), (13925), (14244), (16222)
) changed(location_id);

SELECT fountain.refresh_city_index();

DO $$
DECLARE
  dubai_count integer;
  hours_count integer;
  priced_count integer;
  described_count integer;
  o3_menu_count integer;
  resync_menu_count integer;
  newly_imaged_count integer;
BEGIN
  SELECT count(*) INTO dubai_count
  FROM fountain.locations
  WHERE status = 'active' AND deleted_at IS NULL AND country_code = 'AE'
    AND (lower(coalesce(locality, '')) IN ('dubai', 'dubai healthcare city', 'deira')
         OR lower(coalesce(region, '')) = 'dubai');

  SELECT count(*) INTO hours_count
  FROM fountain.locations
  WHERE status = 'active' AND deleted_at IS NULL AND country_code = 'AE'
    AND (lower(coalesce(locality, '')) IN ('dubai', 'dubai healthcare city', 'deira')
         OR lower(coalesce(region, '')) = 'dubai')
    AND opening_hours IS NOT NULL AND opening_hours <> '[]'::jsonb;

  SELECT count(*) FILTER (WHERE offering.price_amount IS NOT NULL),
         count(*) FILTER (WHERE nullif(trim(offering.description), '') IS NOT NULL)
    INTO priced_count, described_count
  FROM fountain.offerings offering
  JOIN fountain.locations location ON location.id = offering.location_id
  WHERE location.status = 'active' AND location.deleted_at IS NULL
    AND location.country_code = 'AE'
    AND (lower(coalesce(location.locality, '')) IN ('dubai', 'dubai healthcare city', 'deira')
         OR lower(coalesce(location.region, '')) = 'dubai')
    AND offering.status = 'active' AND offering.deleted_at IS NULL;

  SELECT count(*) INTO o3_menu_count
  FROM fountain.offerings
  WHERE location_id = 13715 AND status = 'active' AND deleted_at IS NULL;

  SELECT count(*) INTO resync_menu_count
  FROM fountain.offerings
  WHERE location_id = 13860 AND status = 'active' AND deleted_at IS NULL;

  SELECT count(*) INTO newly_imaged_count
  FROM fountain.images
  WHERE entity_type = 'location' AND entity_id IN (13715, 14412, 16222)
    AND status = 'active' AND deleted_at IS NULL;

  IF dubai_count < 46 THEN
    RAISE EXCEPTION 'Dubai scope unexpectedly shrank to % active listings', dubai_count;
  END IF;
  IF hours_count < 31 THEN
    RAISE EXCEPTION 'Expected at least 31 Dubai listings with hours, found %', hours_count;
  END IF;
  IF priced_count < 98 THEN
    RAISE EXCEPTION 'Expected at least 98 priced Dubai offerings, found %', priced_count;
  END IF;
  IF described_count < 330 THEN
    RAISE EXCEPTION 'Expected at least 330 described Dubai offerings, found %', described_count;
  END IF;
  IF o3_menu_count <> 15 THEN
    RAISE EXCEPTION 'Expected 15 active O3 offerings, found %', o3_menu_count;
  END IF;
  IF resync_menu_count <> 49 THEN
    RAISE EXCEPTION 'Expected 49 active RESYNC offerings, found %', resync_menu_count;
  END IF;
  IF newly_imaged_count < 3 THEN
    RAISE EXCEPTION 'Expected three active newly imaged locations, found %', newly_imaged_count;
  END IF;
END;
$$;

COMMIT;
