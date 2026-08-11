-- Additional prices published by official Dubai provider pages on 2026-08-10.
-- Each row preserves range/starting-price semantics instead of presenting a
-- variable provider quote as an exact price.
BEGIN;

SELECT set_config('fountain.actor_id', 'd3b4106a-7f23-4e60-9f12-202608100004', true);
SELECT set_config('fountain.actor_label', 'expand_published_dubai_pricing_20260810', true);

CREATE TABLE IF NOT EXISTS fountain_raw.dubai_published_pricing_backup_20260810 AS
SELECT * FROM fountain.offerings WHERE location_id IN (13551, 14412, 2551, 16096);

-- Backfill existing offerings where the provider publishes a matching price.
WITH prices(location_id, raw_name, amount, max_amount, price_type, price_unit, price_context, description, source_url) AS (
  VALUES
    (14412, 'Restylane', 1000, 3500, 'range', 'service', 'published treatment ranges vary by area and treatment plan', 'Restylane Skinboosters treatment; the provider publishes AED 1,000–2,500 for a targeted single area and AED 1,500–3,500+ for comprehensive treatment.', 'https://www.edenderma.com/restylane'),
    (14412, 'Radiesse', 2500, 4500, 'range', 'unit', 'per syringe', 'Radiesse collagen-stimulating filler priced by the provider at AED 2,500–4,500 per syringe.', 'https://www.edenderma.com/radiesse'),
    (14412, 'Stem Cell Therapy', 15000, NULL, 'starting_at', 'service', 'depends on treatment area and stem-cell amount', 'Physician-led regenerative stem-cell treatment; the provider publishes a starting price of AED 15,000.', 'https://www.edenderma.com/stem-cell-therapy'),
    (2551, 'NAD+ IV Therapy', 1100, 3000, 'range', 'session', 'depends on dose, duration, customization and package', 'NAD+ IV infusion supporting cellular energy and repair; the provider publishes AED 1,100–3,000 per session.', 'https://elitevita.ae/nad-iv-therapy-dubai/'),
    (16096, '12-lead ECG', 150, NULL, 'starting_at', 'service', 'published DCDC starting price', 'Resting 12-lead electrocardiogram; the clinic publishes a starting price of AED 150.', 'https://doctorsclinicdubai.ae/ru/blog/atrial-fibrillation-treatment-dubai'),
    (16096, '24-hour Holter Monitoring', 500, NULL, 'starting_at', 'service', 'published DCDC starting price', 'Twenty-four-hour ambulatory heart-rhythm monitoring; the clinic publishes a starting price of AED 500.', 'https://doctorsclinicdubai.ae/ru/blog/atrial-fibrillation-treatment-dubai'),
    (16096, '2D Echocardiogram with Doppler', 500, NULL, 'starting_at', 'service', 'published DCDC starting price', 'Transthoracic echocardiogram for cardiac structure and function; the clinic publishes a starting price of AED 500.', 'https://doctorsclinicdubai.ae/ru/blog/atrial-fibrillation-treatment-dubai'),
    (16096, 'Treadmill Stress Test', 500, NULL, 'starting_at', 'service', 'published DCDC starting price', 'Exercise treadmill test used in cardiac evaluation; the clinic publishes a starting price of AED 500.', 'https://doctorsclinicdubai.ae/ru/blog/atrial-fibrillation-treatment-dubai'),
    (16096, 'Dental Filling', 150, NULL, 'starting_at', 'service', 'composite filling; varies by complexity', 'Composite dental filling; the clinic publishes a starting price of AED 150.', 'https://doctorsclinicdubai.ae/blog/dental-emergency-guide-dubai'),
    (16096, 'Dental Cleaning', 200, NULL, 'starting_at', 'service', 'scale and polish', 'Dental scale-and-polish cleaning; the clinic publishes a starting price of AED 200.', 'https://doctorsclinicdubai.ae/ar/blog/toothache-causes-treatment-dubai'),
    (16096, 'Root-canal Treatment', 800, NULL, 'starting_at', 'service', 'varies by tooth and complexity', 'Root-canal treatment; the clinic publishes a starting price of AED 800.', 'https://doctorsclinicdubai.ae/blog/root-canal-cost-dubai'),
    (16096, 'Wisdom-tooth Extraction', 399, NULL, 'starting_at', 'service', 'varies by impaction and complexity', 'Wisdom-tooth extraction; the clinic publishes a starting price of AED 399.', 'https://doctorsclinicdubai.ae/blog/dental-emergency-guide-dubai'),
    (16096, 'Orthopedic Consultation', 500, NULL, 'starting_at', 'visit', 'published DCDC starting price', 'Orthopedic consultation for musculoskeletal assessment and treatment planning; the clinic publishes a starting price of AED 500.', 'https://doctorsclinicdubai.ae/blog/knee-pain-causes-when-to-worry-dubai'),
    (16096, 'Orthopedic PRP Therapy', 1500, NULL, 'starting_at', 'session', 'single session', 'Orthopedic PRP injection; the clinic publishes a starting price of AED 1,500 per session.', 'https://doctorsclinicdubai.ae/blog/knee-pain-causes-when-to-worry-dubai'),
    (16096, 'Physiotherapy', 350, NULL, 'starting_at', 'session', 'published DCDC starting price', 'Physiotherapy session; the clinic publishes a starting price of AED 350.', 'https://doctorsclinicdubai.ae/blog/knee-pain-causes-when-to-worry-dubai')
)
UPDATE fountain.offerings offering
SET price_amount = prices.amount,
    price_max_amount = prices.max_amount,
    price_currency = 'AED',
    price_type = prices.price_type,
    price_unit = prices.price_unit,
    price_context = prices.price_context,
    description = prices.description,
    source_offer_url = prices.source_url,
    verification_status = CASE WHEN offering.verification_status IN ('human_verified', 'owner_verified') THEN offering.verification_status ELSE 'agent_verified' END,
    updated_at = now()
FROM prices
WHERE offering.location_id = prices.location_id
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
  AND lower(trim(offering.raw_name)) = lower(trim(prices.raw_name));

-- Literal packages and services not previously present in the directory.
WITH menu(location_id, treatment_id, raw_name, amount, max_amount, price_type, price_unit, price_context, description, source_url) AS (
  VALUES
    (13551, NULL, 'Unlimited Contrast Membership', 999, NULL, 'exact', 'month', 'monthly membership', 'Monthly membership for unlimited contrast therapy access.', 'https://www.rejuven8wellness.club/check?day=2026-07-11&token=eyJwcmljZV9pZCI6MjAwLCJxdWFudGl0eSI6MSwicHJpY2UiOiIyNTAuMDAiLCJkdXJhdGlvbiI6NjB9'),
    (13551, NULL, '12 Week Program', 7500, NULL, 'exact', 'package', 'no activation fee', 'Twelve-week Rejuven8 wellness program.', 'https://www.rejuven8wellness.club/check?day=2026-07-11&token=eyJwcmljZV9pZCI6MjAwLCJxdWFudGl0eSI6MSwicHJpY2UiOiIyNTAuMDAiLCJkdXJhdGlvbiI6NjB9'),
    (13551, NULL, '1 Day Pass', 199, NULL, 'exact', 'visit', 'no activation fee', 'Single-day access pass to Rejuven8 Wellness Club.', 'https://www.rejuven8wellness.club/check?day=2026-07-11&token=eyJwcmljZV9pZCI6MjAwLCJxdWFudGl0eSI6MSwicHJpY2UiOiIyNTAuMDAiLCJkdXJhdGlvbiI6NjB9'),
    (13551, NULL, '8 Day Pass', 599, NULL, 'exact', 'package', 'AED 75 per day; no activation fee', 'Eight-day Rejuven8 access pass.', 'https://www.rejuven8wellness.club/check?day=2026-07-11&token=eyJwcmljZV9pZCI6MjAwLCJxdWFudGl0eSI6MSwicHJpY2UiOiIyNTAuMDAiLCJkdXJhdGlvbiI6NjB9'),
    (13551, NULL, 'Monthly Pass', 999, NULL, 'exact', 'month', 'AED 33 per day; no activation fee', 'Monthly Rejuven8 access pass.', 'https://www.rejuven8wellness.club/check?day=2026-07-11&token=eyJwcmljZV9pZCI6MjAwLCJxdWFudGl0eSI6MSwicHJpY2UiOiIyNTAuMDAiLCJkdXJhdGlvbiI6NjB9'),
    (13551, NULL, '12 Month Commitment Membership', 1499, NULL, 'exact', 'month', 'two months paid upfront; final month not billed', 'Rejuven8 monthly membership on a twelve-month commitment.', 'https://www.rejuven8wellness.club/check?day=2026-07-11&token=eyJwcmljZV9pZCI6MjAwLCJxdWFudGl0eSI6MSwicHJpY2UiOiIyNTAuMDAiLCJkdXJhdGlvbiI6NjB9'),
    (13551, NULL, '6 Month Commitment Membership', 1750, NULL, 'exact', 'month', 'two months paid upfront; final month not billed', 'Rejuven8 monthly membership on a six-month commitment.', 'https://www.rejuven8wellness.club/check?day=2026-07-11&token=eyJwcmljZV9pZCI6MjAwLCJxdWFudGl0eSI6MSwicHJpY2UiOiIyNTAuMDAiLCJkdXJhdGlvbiI6NjB9'),
    (14412, NULL, 'Regenerative Medicine Consultation with Dr. Ehsan', 500, NULL, 'exact', 'visit', 'official online booking price', 'Consultation focused on regenerative medicine, stem cells, exosomes, peptides, Endolift and health optimization.', 'https://www.edenderma.com/book-online'),
    (2551, NULL, 'NeuroVita VR Therapy', 300, 1500, 'range', 'session', 'published range varies by session length and therapy complexity', 'Personalized virtual-reality therapy for stress, focus, anxiety, phobias or trauma support.', 'https://elitevita.ae/neurovita-vr-dubai/'),
    (16096, NULL, 'Emergency Dental Consultation', 200, 500, 'range', 'visit', 'includes examination, diagnostic X-rays and treatment plan', 'Same-day assessment for urgent dental pain, injury or infection.', 'https://doctorsclinicdubai.ae/blog/dental-emergency-guide-dubai'),
    (16096, NULL, 'Simple Tooth Extraction', 200, NULL, 'starting_at', 'service', 'varies by complexity', 'Simple extraction for a tooth that cannot be saved.', 'https://doctorsclinicdubai.ae/blog/dental-emergency-guide-dubai'),
    (16096, NULL, 'Dental Crown', 800, NULL, 'starting_at', 'service', 'varies by material and complexity', 'Full-coverage dental crown for restoration of a damaged tooth.', 'https://doctorsclinicdubai.ae/blog/dental-emergency-guide-dubai'),
    (16096, NULL, 'Dental Bridge', 1500, NULL, 'starting_at', 'service', 'varies by span and materials', 'Fixed dental bridge used to replace a missing tooth.', 'https://doctorsclinicdubai.ae/blog/dental-emergency-guide-dubai'),
    (16096, NULL, 'Dental Abscess Drainage and Treatment', 200, 500, 'range', 'service', 'published DCDC range', 'Urgent drainage and treatment of a dental abscess or infection.', 'https://doctorsclinicdubai.ae/blog/dental-emergency-guide-dubai'),
    (16096, NULL, 'Tooth Splinting', 300, 800, 'range', 'service', 'published DCDC range', 'Stabilization of a loose or displaced tooth following injury.', 'https://doctorsclinicdubai.ae/blog/dental-emergency-guide-dubai'),
    (16096, NULL, 'Dental Crown Re-cementation', 150, 300, 'range', 'service', 'published DCDC range', 'Reattachment of a dental crown that has come loose.', 'https://doctorsclinicdubai.ae/blog/dental-emergency-guide-dubai')
)
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_max_amount,
  price_currency, source_offer_url, source_id, status, data_origin,
  verification_status, duration_minutes, description, price_type,
  price_unit, price_context, created_at, updated_at
)
SELECT location_id, treatment_id::integer, raw_name, amount, max_amount, 'AED',
       source_url, NULL, 'active', 'manual', 'agent_verified', NULL,
       description, price_type, price_unit, price_context, now(), now()
FROM menu
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.offerings existing
  WHERE existing.location_id = menu.location_id
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
    AND lower(trim(existing.raw_name)) = lower(trim(menu.raw_name))
);

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
SELECT 'location', location_id, 'offerings', 'agent_verified', false,
       'expand_published_dubai_pricing_20260810', now(),
       'Official provider pages with published AED prices; exact/range/starting-at semantics preserved'
FROM (VALUES (13551), (14412), (2551), (16096)) locations(location_id)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

COMMIT;
