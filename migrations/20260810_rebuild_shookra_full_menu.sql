-- Generated from Shookra's official 40-treatment catalog and 32-protocol IV menu.
-- Source pages were fetched on 2026-08-10. Numeric prices are not published;
-- Shookra explicitly confirms current pricing through WhatsApp.
BEGIN;

SELECT set_config('fountain.actor_id', 'd3b4106a-7f23-4e60-9f12-202608100002', true);
SELECT set_config('fountain.actor_label', 'rebuild_shookra_full_menu_20260810', true);

CREATE TABLE IF NOT EXISTS fountain_raw.shookra_offerings_backup_20260810 AS
SELECT * FROM fountain.offerings WHERE location_id = 15934;

WITH menu(raw_name, description, duration_minutes, price_context, source_url) AS (
  VALUES
    ('EBOO', 'EBOO is a medically supervised procedure carried out under DHA-licensed medical supervision at our Dubai clinic, in which a portion of your blood is drawn, passed through a sterile filter and a measured oxygen-and-ozone mixture, then returned to your body.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/eboo'),
    ('Plasmapheresis', 'A medically supervised procedure that separates the blood, removes a portion of the plasma and returns the remaining components alongside a replacement fluid — carried out under DHA-licensed clinical oversight at our Dubai clinic, following an assessment of suitability.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/plasmapheresis'),
    ('NAD+ Therapy', 'A physician-supervised infusion or injection of NAD+, a coenzyme the body uses for cellular energy and repair. Delivered in doses set by your doctor under DHA-licensed supervision at our Dubai clinic, as part of a considered longevity plan rather than a one-off.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/nad'),
    ('IHHT', 'IHHT — Intermittent Hypoxia–Hyperoxia Therapy — is a non-invasive protocol in which you breathe air with alternating low- and high-oxygen concentrations through a mask while resting. It is delivered under DHA-licensed medical supervision at our Dubai clinic, with no injections and no downtime.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/ihht'),
    ('Morpheus8', 'Morpheus8 combines microneedling with radiofrequency energy to deliver controlled heat into the deeper layers of the skin, stimulating collagen and elastin to firm and refine — performed under DHA-licensed medical supervision at our Dubai clinic, with minimal downtime.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/morpheus8'),
    ('HydraFacial', 'A technology-driven facial that cleanses, exfoliates, extracts and hydrates the skin in a single session — performed under DHA-licensed medical supervision at our Dubai clinic. Suitable for all skin types, with no downtime.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/hydrafacial'),
    ('Biostimulators', 'An injectable treatment that prompts the skin to rebuild its own collagen, gradually improving firmness, texture and volume — performed under DHA-licensed medical supervision at our Dubai clinic. Results develop over weeks rather than appearing on the day.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/biostimulators'),
    ('Polynucleotides', 'An injectable skin treatment that uses purified polynucleotides — short, naturally occurring fragments of DNA, often referred to as PDRN — to support the skin’s own repair processes. Delivered under DHA-licensed medical supervision at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/polynucleotides'),
    ('Exosomes', 'A regenerative treatment that delivers concentrated cell-signalling particles — exosomes — to support skin renewal and recovery after other procedures. Performed under DHA-licensed medical supervision at our Dubai clinic, with little to no downtime.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/exosomes'),
    ('Skin Boosters', 'An injectable treatment that improves the quality of your skin rather than its volume. Microdroplets of hyaluronic acid and bio-remodelling actives are placed across the dermis to restore hydration, texture and elasticity — administered by DHA-licensed doctors at our Dubai clinic, with minimal downtime.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/skin-boosters'),
    ('PRP Therapy', 'PRP — platelet-rich plasma — uses your own blood to support the skin and scalp. A small sample is drawn, the platelets are concentrated, and the plasma is re-applied or injected into the area being treated. Performed under DHA-licensed medical supervision at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/prp'),
    ('Mesotherapy', 'Mesotherapy delivers a personalised blend of vitamins, amino acids and other actives into the superficial layer of the skin through a series of fine micro-injections — placing nutrients exactly where they are needed. At Shookra it is doctor-led and tailored to your skin at consultation, with minimal downtime.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/mesotherapy'),
    ('Chemical Peels', 'A controlled application of skin-safe acids that exfoliates the surface and encourages fresher skin to come through — refining texture, easing pigmentation and evening out tone. Each peel is performed under DHA-licensed medical supervision at our Dubai clinic and matched to your skin at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/chemical-peels'),
    ('Anti-Wrinkle Injections', 'Small, measured doses of botulinum toxin placed in targeted facial muscles to relax them — softening the expression lines that movement creates and leaving a refreshed, natural-looking result. Each treatment is planned and performed under DHA-licensed medical supervision at our Dubai clinic and matched to your face at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/anti-wrinkle'),
    ('Dermal Fillers', 'A precise placement of hyaluronic acid gel to restore lost volume, soften folds and redefine facial contours — enhancing your features rather than altering them. Each treatment is administered by a DHA-licensed clinician at our Dubai clinic and tailored to your face at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/dermal-fillers'),
    ('Regenerative Aesthetics', 'Regenerative aesthetics is a family of treatments that work with your skin''s own repair processes rather than against them. Instead of a single product, it covers a set of modalities — exosomes, polynucleotides, platelet-rich plasma (PRP) and collagen-stimulating injectables — each chosen at consultation to suit your skin and your goals. Every treatment is delivered under DHA-licensed medical supervision at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/regenerative'),
    ('Stem Cell Therapy', 'Stem cell therapy is a regenerative approach built around stem cells — cells with the capacity to develop into other cell types. At Shookra it is considered only as a physician-led, medically supervised procedure: suitability is assessed and confirmed first, before anything is recommended, under DHA-licensed medical supervision.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/stem-cell-therapy'),
    ('Hair Loss Treatments', 'Thinning rarely has a single cause, so we start by assessing the scalp rather than reaching for a fixed protocol. Once the pattern and likely driver are clear, your clinician matches the right treatment — PRP, microneedling, mesotherapy or a regenerative scalp injectable — under DHA-licensed medical supervision at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/hair-loss-treatments'),
    ('Microneedling for Hair', 'A minimally invasive scalp treatment that uses fine needles to stimulate hair follicle regeneration — encouraging thicker, fuller hair over time. Sessions are performed under DHA-licensed medical supervision at our Dubai clinic and are often paired with targeted serums or hair injectables to support results.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/microneedling-for-hair'),
    ('Dermaplaning', 'A precise, gentle exfoliation that lifts away dull surface cells and fine vellus hair, revealing smoother, brighter skin. It is non-invasive and needs no downtime, so you can resume your day straight after. Each treatment is carried out by a trained clinician at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/dermaplaning'),
    ('Enzyme Facials', 'A gentle facial that uses natural enzymes from fruits and botanicals to lift away dead surface cells and impurities — no harsh acids, no scrubbing, no downtime. It suits sensitive and reactive skin, and is performed under DHA-licensed medical oversight at our Dubai clinic, matched to your skin at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/enzyme-facials'),
    ('Oxygen Facial', 'A gentle, restorative facial that delivers pressurised oxygen alongside hydrating serums to cleanse the skin, top up moisture and leave the complexion looking fresh and clear. It is a comfortable, no-downtime treatment, carried out at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/oxygen-facial'),
    ('Laser Skin Rejuvenation', 'A medically supervised treatment that directs measured laser or light energy at the skin to even tone, soften texture and refine the skin''s overall appearance. Each session is carried out under DHA-licensed medical supervision at our Dubai clinic, with the device and settings matched to your skin at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/laser-skin-rejuvenation'),
    ('LED Light Therapy', 'A gentle, non-invasive treatment that uses specific wavelengths of light — usually red and blue — delivered to the skin by a low-heat LED panel or mask. Comfortable and contactless, it is often added to a facial or used as a short standalone session, and is performed under DHA-licensed medical supervision at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/led-light-therapy'),
    ('Thread Lift', 'A thread lift uses fine, absorbable PDO threads placed beneath the skin to provide subtle lift and support along the face, neck and jawline. It is a minimally invasive procedure, carried out under DHA-licensed medical supervision at our Dubai clinic and matched to your face at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/threads'),
    ('Laser Tattoo Removal', 'A doctor-led laser treatment that targets tattoo ink beneath the skin, breaking it into smaller fragments the body can carry away over time. Removal is gradual and works over a course of sessions, each performed under DHA-licensed medical supervision at our Dubai clinic and matched to your skin and your tattoo at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/tattoo-removal'),
    ('Semi-Permanent Makeup', 'Semi-permanent makeup is a cosmetic tattooing service that places small amounts of pigment into the upper skin to shape and define the brows, add colour to the lips, or line the eyes. Each treatment is designed to your features at consultation and performed under DHA-licensed medical supervision at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/spmu'),
    ('HIFU', 'Focused ultrasound that reaches the deeper layers of the skin and warms them precisely, prompting the body to build new collagen so the skin firms and lifts over the following months — without incisions or downtime. Each treatment is performed under DHA-licensed medical supervision at our Dubai clinic and matched to your skin at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/hifu'),
    ('Laser Hair Removal', 'A course of laser sessions that targets the hair follicle to reduce regrowth and ease the cycle of shaving and waxing. At Shookra we use the Quanta Duetto system, suitable across a range of skin types, with every session delivered under DHA-licensed medical supervision at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/laser-hair-removal'),
    ('Broadband Light (BBL)', 'A medically supervised photofacial that delivers measured pulses of broad-spectrum light to the skin to even tone, ease redness and target pigment. Each session is carried out under DHA-licensed medical supervision at our Dubai clinic, with the filter and settings matched to your skin at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/bbl'),
    ('Body Sculpting', 'A doctor-led approach to non-surgical body contouring that targets stubborn fat and skin laxity without surgery. Treatments combine lipolysis injections, ultrasonic cavitation and HIFU, matched to your fat distribution, skin laxity and goals at consultation. Each session is performed under DHA-licensed medical supervision at our Dubai clinic.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/body-sculpting'),
    ('Ultrasonic Cavitation', 'A non-surgical way to refine stubborn contours: low-frequency ultrasound is applied to a targeted area to act on localised fat beneath the skin, helping smooth and slim the shape over a course of sessions. Treatment is carried out under DHA-licensed medical supervision at our Dubai clinic and matched to your body at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/cavitation'),
    ('Cryolipolysis', 'A non-surgical way to reduce stubborn, diet-resistant pockets of fat using controlled cooling — no incisions, no anaesthetic and no recovery period. Each session is performed under DHA-licensed medical supervision at our Dubai clinic and matched to the area you want to treat at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/cryolipolysis'),
    ('Injection Lipolysis', 'A minimally invasive treatment that uses targeted injections to break down small, stubborn fat deposits that resist diet and exercise — for areas such as the chin, abdomen, thighs and arms. Each treatment is administered under DHA-licensed medical supervision at our Dubai clinic and matched to your contours at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/lipolysis'),
    ('Cellulite Reduction', 'A set of body treatments aimed at the dimpled, uneven look of cellulite on areas such as the thighs, hips and buttocks. Rather than a single device, it combines approaches that work on the texture and firmness of the skin and the circulation beneath it. Each plan is performed under DHA-licensed medical supervision at our Dubai clinic and matched to your skin and goals at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/cellulite-reduction'),
    ('Medical Weight Loss', 'A physician-led approach to weight management, delivered under DHA-licensed medical supervision at our Dubai clinic. Every programme starts with a medical assessment to confirm whether treatment is appropriate for you; it is not available without that eligibility review. Where it is suitable, your physician sets out a supervised plan and reviews your progress over time.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/weight-loss'),
    ('Body Fillers', 'Injectable fillers used away from the face — to restore volume in areas that have lost it over time and to refine the shape of features such as hip dips, hands and the décolletage. Each treatment is administered under DHA-licensed medical supervision at our Dubai clinic and planned to your proportions at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/body-fillers'),
    ('Body Biostimulators', 'An injectable treatment for the body that prompts crepey, lax skin to rebuild its own collagen — gradually firming and smoothing areas such as the arms, abdomen, thighs and buttocks. Performed under DHA-licensed medical supervision at our Dubai clinic, with results that develop over weeks rather than appearing on the day.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/body-biostimulators'),
    ('Infrared Body Wrap', 'A gentle, warming session that uses infrared heat to raise your body’s temperature in a controlled way — supporting circulation and easing tension while you rest. Each wrap is delivered by trained clinicians at our Business Bay clinic and set to a temperature and duration that suits you.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/infrared-wrap'),
    ('Pressotherapy', 'A non-invasive compression treatment that uses inflatable garments to apply controlled, rhythmic pressure across the legs, arms and body — supporting the movement of lymph and blood, easing fluid retention and aiding recovery. Each session is carried out under DHA-licensed medical supervision at our Business Bay clinic and matched to your goals at consultation.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/treatments/pressotherapy'),
    ('NAD+ Drip', 'The NAD+ coenzyme by infusion — central to cellular energy and repair.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Cellular Repair NAD+ IV Drip', 'A higher-dose NAD+ protocol focused on cellular repair.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Wellness Anti-Aging IV Drip', 'A broad antioxidant and micronutrient infusion for general vitality.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Stem Cell IV Drip', 'A physician-assessed regenerative infusion.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Exosome IV Drip', 'Cell-signalling support by infusion, physician-assessed.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Skin Glow IV Drip', 'An antioxidant infusion that supports a clearer, brighter complexion.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Skin Brightening IV Drip', 'Targeted antioxidant support for uneven tone and dullness.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Collagen Support IV Drip', 'Nutrient support for skin structure and elasticity.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Skin, Hair & Nails IV Drip', 'Biotin and micronutrients for skin, hair and nail quality.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Anti Hair Loss IV Drip', 'Nutrient support for the scalp and hair where deficiency is a factor.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Energy Reboot IV Drip', 'A B-vitamin and amino infusion to lift low energy.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Athlete Recovery IV Drip', 'Rehydration and nutrients to support recovery after training.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Amino Recovery IV Drip', 'Amino acids and electrolytes around training, pre or post workout.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Multivitamin & Blood Boost IV Drip', 'A broad multivitamin infusion with iron and B12 support.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Surgery Recovery IV Drip', 'Nutrient and antioxidant support around a procedure, physician-guided.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Immune Booster IV Drip', 'A high-dose immune-support infusion.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Immune Defense IV Drip', 'Antioxidant and micronutrient support for your defenses.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Hi-C High-Dose Vitamin C IV Drip', 'A high-dose vitamin C infusion.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Post-Viral Restoration IV Drip', 'Antioxidant and nutrient support while recovering from illness.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Hydration Plus IV Drip', 'Rapid rehydration with electrolytes and essential nutrients.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Detox IV Drip', 'An antioxidant-led infusion to support the body''s clearance pathways.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Liver Detox & Renewal IV Drip', 'Antioxidant support oriented to liver health.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Gut Cleanse IV Drip', 'Hydration and nutrient support oriented to gut health.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Migraine Relief IV Drip', 'Hydration and magnesium to ease a migraine, suitability assessed.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Male Vitality & Hormonal IV Drip', 'Micronutrient support oriented to male vitality, physician-guided.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Female Vitality & Hormonal IV Drip', 'Micronutrient support oriented to female vitality, physician-guided.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Anti-Stress & Memory Boost IV Drip', 'Magnesium and B-vitamins to support stress resilience and focus.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Cognitive Clarity IV Drip', 'Nutrient support oriented to focus and mental clarity.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Jet Lag IV Drip', 'Rehydration and nutrients to reset after long-haul travel.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Pre / Post Party IV Drip', 'Rehydration and antioxidants before or after a big night.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Weight Loss Support IV Drip', 'Nutrient support alongside a physician-supervised weight programme.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy'),
    ('Fat-Burning Booster Plus IV Drip', 'Amino and metabolic support within a medically-guided plan.', NULL, 'Current price confirmed on request via Shookra WhatsApp', 'https://shookra.com/iv-therapy')
), normalized AS (
  SELECT menu.*,
         CASE
           WHEN lower(raw_name) LIKE '%nad+%' THEN 22
           WHEN lower(raw_name) LIKE '%exosome%' THEN 18
           WHEN lower(raw_name) LIKE '%stem cell%' THEN 17
           WHEN lower(raw_name) LIKE '%prp%' THEN 19
           WHEN lower(raw_name) LIKE '%hydrafacial%' THEN 53
           WHEN lower(raw_name) LIKE '%chemical peel%' THEN 57
           WHEN lower(raw_name) LIKE '%morpheus8%' THEN 47
           WHEN lower(raw_name) LIKE '%anti-wrinkle%' THEN 34
           WHEN lower(raw_name) LIKE '%dermal filler%' THEN 35
           WHEN lower(raw_name) LIKE '%hair loss%' THEN 51
           WHEN lower(raw_name) LIKE '%microneedling%' THEN 47
           WHEN lower(raw_name) LIKE '%laser skin rejuvenation%' THEN 96
           WHEN lower(raw_name) LIKE '%laser tattoo%' THEN 59
           WHEN lower(raw_name) LIKE '%semi-permanent makeup%' THEN 104
           WHEN lower(raw_name) LIKE '%laser hair removal%' THEN 50
           WHEN lower(raw_name) LIKE '%hifu%' THEN 52
           WHEN lower(raw_name) LIKE '%body sculpting%' THEN 48
           WHEN lower(raw_name) LIKE '%cryolipolysis%' THEN 48
           WHEN lower(raw_name) LIKE '%cellulite reduction%' THEN 88
           WHEN lower(raw_name) LIKE '%medical weight loss%' THEN 62
           WHEN lower(raw_name) LIKE '%pressotherapy%' THEN 56
           WHEN lower(raw_name) LIKE '%iv drip%' THEN 74
           ELSE NULL
         END AS treatment_id
  FROM menu
)
INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_currency,
  source_offer_url, source_id, status, data_origin, verification_status,
  duration_minutes, description, price_type, price_unit, price_context,
  created_at, updated_at
)
SELECT 15934, treatment_id, raw_name, NULL, 'AED', source_url, NULL,
       'active', 'manual', 'agent_verified', duration_minutes::integer, description,
       'on_request', 'service', price_context, now(), now()
FROM normalized
ON CONFLICT DO NOTHING;

-- Retire the four old generic/duplicate IV rows now superseded by the literal menu.
UPDATE fountain.offerings
SET status = 'deleted', deleted_at = COALESCE(deleted_at, now()), updated_at = now()
WHERE location_id = 15934
  AND id IN (119313, 119314, 119315, 119316)
  AND status = 'active';

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
VALUES (
  'location', 15934, 'offerings', 'agent_verified', false,
  'rebuild_shookra_full_menu_20260810', now(),
  'https://shookra.com/treatments | 40 treatments; https://shookra.com/iv-therapy | 32 named IV protocols with provider descriptions; pricing explicitly on request'
)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

COMMIT;
