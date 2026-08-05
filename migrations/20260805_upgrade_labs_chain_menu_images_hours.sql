-- Publish the supplied shared Upgrade Labs menu across the full chain,
-- replace the existing active image on every location with the supplied logo
-- and two official photos, and add Austin's location-specific hours.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'upgrade_labs_chain_menu_images_hours_20260805'
);

ALTER TABLE fountain.locations
  ADD COLUMN IF NOT EXISTS opening_hours jsonb;

COMMENT ON COLUMN fountain.locations.opening_hours IS
  'Structured weekly opening hours with day, open, and close fields.';
CREATE TABLE IF NOT EXISTS fountain_raw.upgrade_labs_offerings_backup_20260805 AS
SELECT o.*
FROM fountain.offerings o
JOIN fountain.locations l ON l.id = o.location_id
WHERE l.org_id = 1081;

CREATE TABLE IF NOT EXISTS fountain_raw.upgrade_labs_images_backup_20260805 AS
SELECT i.*
FROM fountain.images i
JOIN fountain.locations l
  ON l.id = i.entity_id
WHERE i.entity_type = 'location'
  AND l.org_id = 1081;

DO $$
DECLARE
  target_location record;
  shared_menu jsonb := $upgrade_labs_menu$
  [
    {
      "treatment_id": null,
      "raw_name": "Single Service",
      "price_amount": 45,
      "price_currency": "USD",
      "description": "Includes 1 credit\n• Ideal for a focused visit\n• Redeem toward any technology\n• Great for trying something new"
    },
    {
      "treatment_id": null,
      "raw_name": "Day Pass",
      "price_amount": 90,
      "price_currency": "USD",
      "description": "Includes 3 services in one visit\n• Perfect for a full-body reset session\n• Experience multiple technologies in one day\n• Great for exploring the Upgrade Labs system"
    },
    {
      "treatment_id": null,
      "raw_name": "Six Pack",
      "price_amount": 119,
      "price_currency": "USD",
      "description": "Includes 6 credits\n• Great for getting started\n• Ideal for short-term flexibility\n• Redeem toward any technology\n• Never expires"
    },
    {
      "treatment_id": null,
      "raw_name": "Twelve Pack",
      "price_amount": 199,
      "price_currency": "USD",
      "description": "Includes 12 credits\n• Best value for consistent visits\n• Ideal for building momentum without commitment\n• Redeem toward any technology\n• Never expires"
    },
    {
      "treatment_id": null,
      "raw_name": "Brain Upgrade Session",
      "price_amount": 90,
      "price_currency": "USD",
      "description": "Sensors gently read your brain's electrical activity while you sit comfortably, and the system provides quiet feedback cues that guide your brain toward a calmer, more focused state. Over time your brain gets better at self-regulating, which shows up as less anxiety, sharper thinking, and deeper sleep. No effort, no discomfort, just real results for your mind. 30–40 minutes."
    },
    {
      "treatment_id": 28,
      "raw_name": "Cryotherapy",
      "price_amount": 45,
      "price_currency": "USD",
      "description": "Step into a chamber of intensely cold, dry air for under 3.5 minutes and walk out feeling like a completely different person. The cold triggers your body to flood with natural endorphins, dial down inflammation, and switch on a level of focus and energy that is hard to get any other way. Under 4 minutes."
    },
    {
      "treatment_id": 31,
      "raw_name": "REDcharger",
      "price_amount": 45,
      "price_currency": "USD",
      "description": "Lie back and let the light do the work. The REDcharger surrounds your whole body with red and infrared light that your cells absorb and use as energy, helping your muscles recover faster, your skin look healthier, and your mood lift. Most people walk out feeling clearer and more energized than when they came in."
    },
    {
      "treatment_id": 32,
      "raw_name": "PEMF",
      "price_amount": 45,
      "price_currency": "USD",
      "duration_minutes": 12,
      "description": "Think of this as a deep reset for your whole body. You lie on a mat and gentle electromagnetic pulses pass through you, helping your cells recover, your inflammation settle, and your nervous system shift into a calmer state. Most people feel a grounded, almost meditative calm that carries into better sleep that night. You do not feel much during the session, but the shift afterward is real."
    },
    {
      "treatment_id": null,
      "raw_name": "Big Squeeze",
      "price_amount": 45,
      "price_currency": "USD",
      "duration_minutes": 25,
      "description": "Imagine a gentle, wave-like squeeze moving from your feet upward, pushing out all the tightness, puffiness, and soreness you have been carrying around. The Big Squeeze moves fluid through your lymphatic system, the body's natural drainage network, so you walk out feeling lighter, less achy, and genuinely refreshed. Like a full-body massage, minus anyone touching you."
    },
    {
      "treatment_id": null,
      "raw_name": "Bio Charger",
      "price_amount": 45,
      "price_currency": "USD",
      "description": "You sit near the device fully clothed while it delivers a combination of light, frequencies, and a gentle electromagnetic field to help your body recharge at the cellular level. No contact, no effort required. Guests often walk away feeling more grounded and quietly energized, like their system got a tune-up they did not know they needed. 20–30 minutes."
    },
    {
      "treatment_id": null,
      "raw_name": "Wasabi 30",
      "price_amount": 225,
      "price_currency": "USD"
    },
    {
      "treatment_id": null,
      "raw_name": "Wasabi Demo",
      "price_amount": 0,
      "price_currency": "USD",
      "duration_minutes": 15,
      "description": "A 15-minute Wasabi Method consultation that includes a 5-minute demo."
    },
    {
      "treatment_id": null,
      "raw_name": "AI Strength Trainer",
      "price_amount": 45,
      "price_currency": "USD",
      "description": "Normal weights give you the same resistance whether your muscles are fresh or fatigued, which means most reps are either too easy or too hard. This machine reads your strength in real time and adjusts every single rep so you are always working at your actual limit. The result is faster muscle gains, less wasted effort, and fewer injuries. The same technology is used by NFL teams. 20–25 minutes."
    },
    {
      "treatment_id": null,
      "raw_name": "AI Adaptive Bike",
      "price_amount": 45,
      "price_currency": "USD",
      "duration_minutes": 9,
      "description": "This is the only cardio machine that actually keeps up with you. It reads your effort in real time and adjusts resistance instantly so every second of your two short sprints is working at your personal max. Nine minutes later, you have gotten the cardio benefit of a 45-minute workout. Your legs might feel it, but your schedule will not."
    },
    {
      "treatment_id": null,
      "raw_name": "Metabolic Trainer",
      "price_amount": 45,
      "price_currency": "USD",
      "description": "You breathe through a mask that alternates between oxygen-rich and lower-oxygen air, training your body to use oxygen more efficiently, like altitude training without the altitude. The result over time is more stamina, better daily energy levels, and faster recovery from workouts. It is completely passive; you just sit and breathe while your cardiovascular system quietly gets an upgrade. 30–40 minutes."
    },
    {
      "treatment_id": null,
      "raw_name": "AI Movement Trainer",
      "price_amount": 45,
      "price_currency": "USD",
      "description": "This one is for people who want to move better, not just get stronger. It guides you through precise, controlled movements that train your body's coordination, balance, and joint stability, the things that keep you out of pain and moving freely as you get older. Great for rehab, athletic performance, or anyone who wants to feel more capable in daily life. 20–25 minutes."
    },
    {
      "treatment_id": null,
      "raw_name": "Cell Health Analysis",
      "price_amount": 0,
      "price_currency": "USD",
      "duration_minutes": 5,
      "description": "A quick, non-invasive scan that shows exactly how much fat, muscle, and water your body is carrying and how your cells are functioning beneath the surface. No guessing, no generic advice. You review the results with a Biohacker Technician and leave with a clear picture of what your body actually needs. Included free with your first visit and used to track your real progress over time."
    },
    {
      "treatment_id": null,
      "raw_name": "Free Assessment and Consult",
      "price_amount": 0,
      "price_currency": "USD",
      "duration_minutes": 30,
      "description": "Your complimentary starting point for the 6-Week Longevity Reset. In this 30-minute session we capture a body-composition and wellness baseline using our Cell Health Analysis, walk you through the program, and map out exactly how the reset gets you to your goals. No pressure, no obligation. Just a clear picture of where you are and what is possible."
    },
    {
      "treatment_id": null,
      "raw_name": "Health Strategy Session",
      "price_amount": 0,
      "price_currency": "USD"
    },
    {
      "treatment_id": null,
      "raw_name": "Intro Tour & Cell Health Analysis",
      "price_amount": 0,
      "price_currency": "USD",
      "description": "Get a guided tour of the facility and a Cell Health Analysis to learn how your body is performing and how Upgrade Labs technologies can support your goals. Offer valid for area residents only. Limit one redemption per person."
    },
    {
      "treatment_id": null,
      "raw_name": "The Energy Protocol",
      "price_amount": 0,
      "price_currency": "USD",
      "description": "A personalized session you can try at no cost, valued at $149. Your visit begins with a Cell Health Analysis, which is fed into an AI engine informed by Dave Asprey to guide a custom protocol and recommend which technologies to try based on how your body is responding."
    },
    {
      "treatment_id": null,
      "raw_name": "Runners Protocol",
      "price_amount": 0,
      "price_currency": "USD",
      "description": "A personalized Runner’s Protocol you can try at no cost, valued at $149. Start with a Cell Health Analysis, then get an AI-guided plan designed to support endurance, mobility, and faster recovery between runs."
    }
  ]$upgrade_labs_menu$::jsonb;
BEGIN
  FOR target_location IN
    SELECT id
    FROM fountain.locations
    WHERE org_id = 1081
      AND status = 'active'
      AND deleted_at IS NULL
  LOOP
    PERFORM fountain.replace_location_offerings(
      target_location.id,
      shared_menu,
      'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid
    );
  END LOOP;
END;
$$;

UPDATE fountain.offerings
SET data_origin = 'manual',
    verification_status = 'human_verified',
    updated_at = now()
WHERE location_id IN (
    SELECT id FROM fountain.locations
    WHERE org_id = 1081 AND status = 'active' AND deleted_at IS NULL
  )
  AND status = 'active'
  AND deleted_at IS NULL;

UPDATE fountain.images
SET status = 'hidden',
    deleted_at = COALESCE(deleted_at, now()),
    updated_at = now()
WHERE entity_type = 'location'
  AND entity_id IN (
    SELECT id FROM fountain.locations
    WHERE org_id = 1081 AND status = 'active' AND deleted_at IS NULL
  )
  AND status = 'active'
  AND deleted_at IS NULL;

INSERT INTO fountain.images (
  id, entity_type, entity_id, image_url, blob_url, content_sha256, alt,
  source_id, status, data_origin, verification_status, image_kind
)
SELECT
  nextval(pg_get_serial_sequence('fountain.images', 'id'))::integer,
  'location',
  location.id,
  asset.image_url,
  asset.blob_url,
  asset.content_sha256,
  asset.alt,
  NULL,
  'active',
  'manual',
  'human_verified',
  asset.image_kind
FROM fountain.locations location
CROSS JOIN (
  VALUES
    (
      'https://upgradelabs.com/wp-content/uploads/2026/01/MTittel_UpgradeLabs-UT-0637-1536x1024.jpg'::text,
      'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/1081/facility-photo-83eaf537d382f4514524.jpg'::text,
      '83eaf537d382f4514524e92e79f9d01b4b9ac40de75d76518b9ad9be2c67d631'::text,
      'Upgrade Labs recovery technology facility'::text,
      'photo'::text
    ),
    (
      'https://upgradelabs.com/wp-content/uploads/2025/11/REDcharger-before.png'::text,
      'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/1081/redcharger-before-e8586f956acae73cb0fe.png'::text,
      'e8586f956acae73cb0fe14ef2cccc6c4587e7d0c043e21cdfca1f1ec065f46a6'::text,
      'REDcharger red and infrared light therapy'::text,
      'photo'::text
    ),
    (
      NULL::text,
      'https://4tz9nkaz3fd0fh3k.public.blob.vercel-storage.com/listing-images/manual/organization/1081/upgrade-labs-logo-0ab5bf6cc0634c7968a9.png'::text,
      '0ab5bf6cc0634c7968a9338fbd8d3aec5ebab80978597ca28347a22ed03eafda'::text,
      'Upgrade Labs Human Upgrade Center logo'::text,
      'logo'::text
    )
) AS asset(image_url, blob_url, content_sha256, alt, image_kind)
WHERE location.org_id = 1081
  AND location.status = 'active'
  AND location.deleted_at IS NULL;

UPDATE fountain.locations
SET opening_hours = $opening_hours$
  [
    {"day":"Monday – Friday","open":"7:30 AM","close":"7:00 PM"},
    {"day":"Saturday","open":"9:00 AM","close":"5:00 PM"},
    {"day":"Sunday","open":"11:00 AM","close":"4:00 PM"}
  ]$opening_hours$::jsonb,
    updated_at = now()
WHERE id = 2121
  AND org_id = 1081
  AND slug = 'upgrade-labs-5th-street-austin'
  AND status = 'active'
  AND deleted_at IS NULL;

DO $$
DECLARE
  target_location record;
BEGIN
  FOR target_location IN
    SELECT id
    FROM fountain.locations
    WHERE org_id = 1081 AND status = 'active' AND deleted_at IS NULL
  LOOP
    PERFORM fountain.refresh_search_index_for_location(target_location.id);
  END LOOP;
END;
$$;
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF (SELECT count(*) FROM fountain.locations WHERE org_id = 1081 AND status = 'active' AND deleted_at IS NULL) <> 10 THEN
    RAISE EXCEPTION 'Expected ten active Upgrade Labs locations';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.locations location
    WHERE location.org_id = 1081
      AND location.status = 'active'
      AND location.deleted_at IS NULL
      AND (
        (SELECT count(*) FROM fountain.offerings offering WHERE offering.location_id = location.id AND offering.status = 'active' AND offering.deleted_at IS NULL) <> 22
        OR (SELECT count(*) FROM fountain.images image WHERE image.entity_type = 'location' AND image.entity_id = location.id AND image.status = 'active' AND image.deleted_at IS NULL) <> 3
      )
  ) THEN
    RAISE EXCEPTION 'Upgrade Labs chain menu or image counts are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 2121
      AND jsonb_array_length(opening_hours) = 3
  ) THEN
    RAISE EXCEPTION 'Austin Upgrade Labs opening hours are incomplete';
  END IF;
END;
$$;

COMMIT;
