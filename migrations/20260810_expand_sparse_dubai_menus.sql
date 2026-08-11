-- Generated from high-confidence official-site research (pipeline run 707).
-- Numeric prices survive only when the saved verbatim evidence contains both
-- the amount and AED. Al Zahra's HBOT-specific record is kept service-scoped.
BEGIN;

SELECT set_config('fountain.actor_id', 'd3b4106a-7f23-4e60-9f12-202608100005', true);
SELECT set_config('fountain.actor_label', 'expand_sparse_dubai_menus_20260810', true);

CREATE TABLE IF NOT EXISTS fountain_raw.sparse_dubai_offerings_backup_20260810 AS
SELECT * FROM fountain.offerings WHERE location_id IN (13713, 13925, 14093, 14156, 14244, 14249, 14260, 15604, 15937, 15945, 15947, 16020, 16044, 16046, 16051, 16053, 16057, 16064, 16067, 16214);

CREATE TEMP TABLE sparse_menu (
  location_id integer NOT NULL,
  raw_name text NOT NULL,
  description text,
  duration_minutes integer,
  price_amount numeric,
  price_max_amount numeric,
  price_currency text,
  price_type text NOT NULL,
  price_unit text NOT NULL,
  price_context text,
  source_url text NOT NULL,
  evidence_text text NOT NULL
) ON COMMIT DROP;

INSERT INTO sparse_menu (
  location_id, raw_name, description, duration_minutes, price_amount,
  price_max_amount, price_currency, price_type, price_unit, price_context,
  source_url, evidence_text
)
VALUES
    (13713, '1 Week 6 Sessions', 'Ideal to accelerate healing after post-operative procedures, reduce inflammation, and initiate cellular repair.', 90, 4000, NULL, 'AED', 'exact', 'package', NULL, 'https://www.oxygenome.ae/pricing/individuals', '1 Week 6 Sessions (90 minutes) 4,000 AED Ideal to accelerate healing after post-operative procedures, reduce inflammation, and initiate cellular repair.'),
    (13713, '2 Weeks 12 Sessions', 'A strong therapeutic cycle. Best value for consistent therapy and noticeable results.', 90, 6500, NULL, 'AED', 'exact', 'package', 'Best Value!', 'https://www.oxygenome.ae/pricing/individuals', '2 Weeks 12 Sessions (90 minutes) 6,500 AED A strong therapeutic cycle. Best value for consistent therapy and noticeable results.'),
    (13713, '3 Weeks 18 Sessions', 'High-impact protocol. Comprehensive program for significant improvements.', 90, 9000, NULL, 'AED', 'exact', 'package', 'High-Impact!', 'https://www.oxygenome.ae/pricing/individuals', '3 Weeks 18 Sessions (90 minutes) 9,000 AED High-impact protocol. Comprehensive program for significant improvements.'),
    (13713, 'Monthly Unlimited', 'Our strongest and most cost-efficient program. The most effective program for chronic cases, long-term wellness, neurological support, chronic inflammation, and anti-aging goals.', NULL, 11000, NULL, 'AED', 'exact', 'month', 'Most Popular!', 'https://www.oxygenome.ae/pricing/individuals', 'Monthly Unlimited Unlimited Sessions 11,000 AED Our strongest and most cost-efficient program. The most effective program for chronic cases, long-term wellness, neurological support, chronic inflammation, and anti-aging goals.'),
    (13713, 'Short-Term Unlimited', 'Unlimited sessions with flexible scheduling for a 2-week minimum rental period.', NULL, 4800, NULL, 'AED', 'exact', 'week', NULL, 'https://www.oxygenome.ae/pricing/individuals', 'Unlimited AED 4,800 /week 2-Week minimum rental period ✓ Unlimited sessions ✓ Flexible scheduling'),
    (13713, 'Long-Term Unlimited', 'Unlimited sessions with priority support for a rental period of 3+ months.', NULL, 12000, NULL, 'AED', 'exact', 'month', 'Best For: Chronic illness, athletes, biohackers, and multi-user households', 'https://www.oxygenome.ae/pricing/individuals', 'Long-Term Unlimited AED 12,000 /month 3+ months rental period ✓ Unlimited sessions ✓ Priority support'),
    (13925, 'Peak Performance Assessments', 'A structured, data-driven protocol designed to improve cognitive and physical performance.', 180, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://braindubai.com/programme/', 'The Brain & Performance Programme integrates advanced hyperbaric oxygen therapy with cognitive assessments, physical conditioning and evidence-based lifestyle guidance.'),
    (13925, 'Physiotherapy', 'Tailored physiotherapy packages to improve health, mobility, and performance.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/assessment/physiotherapy/', 'Our physiotherapy packages are tailored to the needs of each individual client to ensure comprehensive care.'),
    (13925, 'Hip Surveillance Programme', 'A program for early detection of hip changes in children with cerebral palsy.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/assessment/hip-surveillance/', 'Our Hip Surveillance Programme helps detect early changes in your child’s hips and joints – reducing pain, improving mobility, and preventing hip dislocation.'),
    (13925, 'Dietitian Services', 'Personalized clinical nutrition for brain health, metabolic health, and long-term performance.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/assessment/dietitian-services/', 'Our clinical dietitian works with you using a data-driven, evidence-based approach, drawing on your blood work, body composition, gut health, symptoms, and lifestyle to build a nutrition strategy that delivers real, measurable results.'),
    (13925, 'Metabolic Weight Loss Programme', 'A medically supervised pathway designed for sustainable weight loss.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/assessment/metabolic-weight-loss-programme/', 'The Metabolic Weight Loss Programme is a medically supervised pathway designed for individuals who want real, measurable results, not another quick-fix diet.'),
    (13925, 'Paediatric Occupational Therapy', 'Therapy to help children regain quality of life and optimize participation in daily activities.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/indication/paediatric-occupational-therapy/', 'Occupational Therapy (OT) can help. The Brain & Performance Centre – A DP World Company occupational therapists are experts at helping them regain their quality of life.'),
    (14093, 'ABA Therapy', 'Extensive one-on-one sessions that include behavior modification and skill development in children with Autism Spectrum Disorder (ASD).', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.hope-amc.com/', 'ABA Therapy Extensive one-on-one sessions that include behavior modification and skill development in children with Autism Spectrum Disorder (ASD).'),
    (14093, 'Intensive Therapy', 'Unique therapy sessions for children with neurological disorders helps in improving balance, functional skills, stamina, and muscles.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.hope-amc.com/', 'Intensive Therapy Unique therapy sessions for children with neurological disorders helps in improving balance, functional skills, stamina, and muscles.'),
    (14093, 'Pediatric Physiotherapy', 'Physiotherapy exercises aimed at improving the strength, gross motor skills, coordination, flexibility, balance, and sensory integration in children.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.hope-amc.com/', 'Pediatric Physiotherapy Physiotherapy exercises aimed at improving the strength, gross motor skills, coordination, flexibility, balance, and sensory integration in children.'),
    (14093, 'Speech and Language Therapy', 'Dynamic techniques that empower children with speech and language disorders with the power to communicate effectively.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.hope-amc.com/', 'Speech and Language Therapy Dynamic techniques that empower children with speech and language disorders with the power to communicate effectively.'),
    (14093, 'Occupational Therapy', 'Techniques that improve the motor skills of children and preparing them to be more independent and self-reliant.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.hope-amc.com/', 'Occupational Therapy Techniques that improve the motor skills of children and preparing them to be more independent and self-reliant.'),
    (14093, 'Feeding Therapy', 'Expert pediatric feeding therapy programs are curated to help your child eat, swallow, and enjoy mealtimes with confidence.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.hope-amc.com/rehabilitation/feeding-therapy/', 'Expert Pediatric Feeding Therapy for All Ages Our professional pediatric feeding therapy programs are curated to help your child eat, swallow, and enjoy mealtimes with confidence.'),
    (14093, 'Non-surgical Ear Reshaping Treatment', 'Otoplasty or pediatric ear reshaping treatment changes a child’s ear’s shape, size, or proportion.', NULL, NULL, NULL, NULL, 'on_request', 'session', NULL, 'https://www.hope-amc.com/clinic/pediatrics-ear-reshaping/', 'Otoplasty or pediatric ear reshaping treatment changes a child’s ear’s shape, size, or proportion.'),
    (14093, 'Helmet Therapy', 'Cranial orthosis helmet therapy helps support healthy head shape development without causing discomfort.', NULL, NULL, NULL, NULL, 'on_request', 'session', NULL, 'https://www.hope-amc.com/helmet-therapy-for-babies-what-parents-can-expect-at-the-beginning-of-the-journey/', 'Cranial orthosis helmet therapy helps support healthy head shape development without causing discomfort.'),
    (14156, 'Hyperbaric Oxygen Therapy (HBOT)', 'Hyperbaric Oxygen Therapy (HBOT) is a medical treatment that involves breathing 100% oxygen in a pressurized chamber. The increased pressure allows more oxygen to be dissolved in the blood and transported throughout the body, which can help promote healing and improve various medical conditions.', 60, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing', 'https://www.gph.ae/en/departments/hyperbaric-oxygen-therapy-hbot-dubai', 'Hyperbaric Oxygen Therapy (HBOT) is a medical treatment that involves breathing 100% oxygen in a pressurized chamber.'),
    (14244, 'Peak Performance Assessments', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Peak Performance Assessments'),
    (14244, 'Adult Assessment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Adult Assessment'),
    (14244, 'Youth Assessment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Youth Assessment'),
    (14244, 'Autism Assessment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Autism Assessment'),
    (14244, 'Executive Health & Performance Check-up', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Executive Health & Performance Check-up'),
    (14244, 'Long Covid Assessment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Long Covid Assessment'),
    (14244, 'Radiology', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Radiology'),
    (14244, 'Physiotherapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Physiotherapy'),
    (14244, 'Hip Surveillance Programme', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Hip Surveillance Programme'),
    (14244, 'Dietitian Services', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Dietitian Services'),
    (14244, 'Metabolic Weight Loss Programme', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/', 'Metabolic Weight Loss Programme'),
    (14244, 'Paediatric Occupational Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/indication/paediatric-occupational-therapy/', 'Paediatric Occupational Therapy'),
    (14244, 'Hyperbaric Oxygen Therapy (HBOT)', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://braindubai.com/programme/', 'Hyperbaric oxygen therapy (HBOT) is a medical treatment that involves the breathing of 100% pure oxygen in a pressurized HBOT suite (often called a hyperbaric oxygen chamber).'),
    (14249, 'Hyperbaric Oxygen Therapy (HBOT)', 'Hyperbaric Oxygen Therapy (HBOT) is a cutting-edge treatment where patients breathe 100% pure oxygen in a pressurized chamber, typically three times higher than normal atmospheric pressure.', 60, 1346, 60000, 'AED', 'range', 'session', '1 Session : 1.346 AED, 5 Sessions: 5.500 AED, 10 Sessions: 10.000 AED, 20 Sessions: 18.000 AED, 40 Sessions: 32.000 AED, 100 Sessions: 60.000 AED', 'https://azhd.ae/packages/hyperbaric-oxygen-therapy/', '1 Session : 1.346 AED 5 Sessions: 5.500 AED 10 Sessions: 10.000 AED 20 Sessions: 18.000 AED 40 Sessions: 32.000 AED 100 Sessions: 60.000 AED'),
    (14260, 'Hyperbaric Oxygen Therapy (HBOT)', 'Explore The Exclusive Packages for Hyperbaric Oxygen Therapy (HBOT).', 60, 600, 21600, 'AED', 'range', 'session', 'For one session 600 AED; For a package of 9 sessions + 1 complimentary session 5,400 AED; For a package of 18 sessions + 2 complimentary sessions 10,800 AED; For a package of 27 sessions + 3 complimentary sessions 16,200 AED; For a package of 36 sessions + 4  ', 'https://www.hmsmirdifhospital.ae/en/package/hyperbaric-oxygen-therapy-hbot-packages', 'Hyperbaric Oxygen Packages Prices (AED) For one session 600 AED For a package of 9 sessions + 1 complimentary session 5,400 AED For a package of 18 sessions + 2 complimentary sessions 10,800 AED For a package of 27 sessions + 3 complimentary sessions 16,200 AED For a package of 36 sessions + 4 complimentary sessions 21,600 AED'),
    (14260, 'Diabetic Foot Package', NULL, 60, 510, 10200, 'AED', 'range', 'session', 'For one session 510/- AED; For a package of 5 sessions 2550/- AED; For a package of 10 sessions 5100/- AED; For a package of 15 sessions 10200/- AED', 'https://www.hmsmirdifhospital.ae/en/package/hyperbaric-oxygen-therapy-hbot-packages', 'Diabetic Foot Package Prices For one session 510/- AED For a package of 5 sessions 2550/- AED For a package of 10 sessions 5100/- AED For a package of 15 sessions 10200/- AED'),
    (14260, 'Sports Medicine Package', NULL, 30, 255, 5100, 'AED', 'range', 'session', 'For one session (30 mins.) 255/- AED; For one session (1 hour) 510/- AED; For a package of 10 sessions (30 mins.) 2550/- AED; For a package of 10 sessions (1 hour) 5100/- AED', 'https://www.hmsmirdifhospital.ae/en/package/hyperbaric-oxygen-therapy-hbot-packages', 'Sports Medicine Package Prices For one session (30 mins.) 255/- AED For one session (1 hour) 510/- AED For a package of 10 sessions (30 mins.) 2550/- AED For a package of 10 sessions (1 hour) 5100/- AED'),
    (14260, 'Restore & Vitality Package', NULL, 60, 510, 2550, 'AED', 'range', 'session', 'For one session 510/- AED; For a package of 5 sessions 2550/- AED', 'https://www.hmsmirdifhospital.ae/en/package/hyperbaric-oxygen-therapy-hbot-packages', 'Restore & Vitality Package Prices For one session 510/- AED For a package of 5 sessions 2550/- AED'),
    (14260, 'Fibromyalgia Package', NULL, 60, 5100, 10200, 'AED', 'range', 'session', 'For a package of 10 sessions 5100/- AED; For a package of 20 sessions 10200/- AED', 'https://www.hmsmirdifhospital.ae/en/package/hyperbaric-oxygen-therapy-hbot-packages', 'Fibromyalgia Package Prices For a package of 10 sessions 5100/- AED For a package of 20 sessions 10200/- AED'),
    (15604, 'Bodylines Fitness & Wellness Club', 'Enjoy a fully equipped gym, fitness studio, outdoor pool with city views, steam and sauna facilities, plus expert instructors.', 660, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.rotana.com/rotanahotelandresorts/unitedarabemirates/dubai/towersrotana/fitness', 'Stay active and unwind at Bodylines Fitness & Wellness Club, located on the rooftop of Towers Rotana Dubai’s annex building. Enjoy a fully equipped gym, fitness studio, outdoor pool with city views, steam and sauna facilities, plus expert instructors. Open daily from 6 AM to 11 PM, it’s the perfect wellness escape near Downtown Dubai and DIFC.'),
    (15604, 'Pool Day Pass', 'Unwind with a day of leisure and fitness, and enjoy your AED 50 back in food and beverages.', NULL, 50, NULL, 'AED', 'exact', 'visit', 'Fully Redeemable on F&B', 'https://www.rotana.com/rotanahotelandresorts/unitedarabemirates/dubai/towersrotana', 'Does Towers Rotana offer a pool day pass for non-hotel guests? Yes, Towers Rotana does offer a pool day pass with redeemable F&B credit of AED 50 for non-hotel guests.'),
    (15937, 'Annual Health Screenings', NULL, 30, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Annual Health Screenings'),
    (15937, 'Cancer Screenings', NULL, 30, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Cancer Screenings'),
    (15937, 'Genetic Screenings', NULL, 30, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Genetic Screenings'),
    (15937, 'IV Therapy & Booster Shots', NULL, 60, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'IV Therapy & Booster Shots'),
    (15937, 'NAD+ IV', NULL, 60, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'NAD+ IV'),
    (15937, 'Ozone IV Therapy', NULL, 60, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Ozone IV Therapy'),
    (15937, 'Peptides', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Peptides'),
    (15937, 'Exosomes', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Exosomes'),
    (15937, 'Hormonal Therapy', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/optimisation/performance/hormonal-therapy/', 'Hormonal Therapy'),
    (15937, 'Facial Treatments', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Facial Treatments'),
    (15937, 'Morpheus8 Pro', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Morpheus8 Pro'),
    (15937, 'Laser Facials', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Laser Facials'),
    (15937, 'PRP & Mesotherapy', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'PRP & Mesotherapy'),
    (15937, 'Hydra Facials', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Hydra Facials'),
    (15937, 'Oxygen Facials', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Oxygen Facials'),
    (15937, 'Corrective Treatments', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Corrective Treatments'),
    (15937, 'Body Treatments', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Body Treatments'),
    (15937, 'CoolSculpting® Elite', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'CoolSculpting® Elite'),
    (15937, 'Laser Hair Removal', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Laser Hair Removal'),
    (15937, 'Injectables', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Injectables'),
    (15937, 'Anti-Wrinkle Injections', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Anti-Wrinkle Injections'),
    (15937, 'Dermal Fillers', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Dermal Fillers'),
    (15937, 'Longevity Health Screening', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Longevity Health Screening'),
    (15937, 'Biological Aging Test', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Biological Aging Test'),
    (15937, 'Inuspheresis®', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Inuspheresis®'),
    (15937, 'Health @ Home', NULL, NULL, NULL, NULL, NULL, 'on_request', 'session', 'Contact for pricing details', 'https://dnahealthcorp.com/', 'Health @ Home'),
    (15945, 'Longevity IV Therapy', NULL, 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://dynastyclinic.ae/', 'Longevity IV Therapy'),
    (15945, 'Muse Cells', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Muse Cells'),
    (15945, 'Peptide Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Peptide Therapy'),
    (15945, 'EBOO Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'EBOO Treatment'),
    (15945, 'NAD+ IV Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'NAD+ IV Therapy'),
    (15945, 'Exosome Injections', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Exosome Injections'),
    (15945, 'Stem Cell IV Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Stem Cell IV Therapy'),
    (15945, 'Methylene Blue IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Methylene Blue IV'),
    (15945, 'Functional Medicine', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Functional Medicine'),
    (15945, 'Eboo Ozone Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Eboo Ozone Therapy'),
    (15945, 'Microplastic Removal', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Microplastic Removal'),
    (15945, 'Plasma Exchange Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Plasma Exchange Therapy'),
    (15945, 'Derma Endolift', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Derma Endolift'),
    (15945, 'LightScan', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'LightScan'),
    (15945, 'Body Fillers', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Body Fillers'),
    (15945, 'Salmon DNA Dermal Fillers', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Salmon DNA Dermal Fillers'),
    (15945, 'Botox Injections', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Botox Injections'),
    (15945, 'Face Lift Surgery', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Face Lift Surgery'),
    (15945, 'Jawline Correction', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Jawline Correction'),
    (15945, 'Fractional CO2 Laser', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Fractional CO2 Laser'),
    (15945, 'Lip Filler Injection', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Lip Filler Injection'),
    (15945, 'Peeling Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Peeling Treatment'),
    (15945, 'Under Eye Whitening', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Under Eye Whitening'),
    (15945, 'Double Chin Removal', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Double Chin Removal'),
    (15945, 'Rhinoplasty', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Rhinoplasty'),
    (15945, 'Eyebrow Lift Surgery', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Eyebrow Lift Surgery'),
    (15945, 'Thread Lift Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Thread Lift Treatment'),
    (15945, 'Fat Melting Injections', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Fat Melting Injections'),
    (15945, 'Skin Glowing Injections', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Skin Glowing Injections'),
    (15945, 'Mesotherapy Injections', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Mesotherapy Injections'),
    (15945, 'Stem Cell Hair Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Stem Cell Hair Treatment'),
    (15945, 'Skin Booster Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Skin Booster Treatment'),
    (15945, 'Liaison Psychiatry', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Liaison Psychiatry'),
    (15945, 'Forensic Psychiatry', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Forensic Psychiatry'),
    (15945, 'General Psychiatry', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'General Psychiatry'),
    (15945, 'Old Age Psychiatry', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Old Age Psychiatry'),
    (15945, 'Child Physiotherapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Child Physiotherapy'),
    (15945, 'Medical Psychotherapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Medical Psychotherapy'),
    (15945, 'Home Care', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Home Care'),
    (15945, 'At Home Consultation', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'At Home Consultation'),
    (15945, 'Care By Licensed Nurses', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Care By Licensed Nurses'),
    (15945, 'Cast Care, Major Dressing', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Cast Care, Major Dressing'),
    (15945, 'Full Body Checkup', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Full Body Checkup'),
    (15945, 'General Home Nursing', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'General Home Nursing'),
    (15945, 'Hormone Profile Test', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Hormone Profile Test'),
    (15945, 'Infant Care To Senior Care', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Infant Care To Senior Care'),
    (15945, 'Medication Management', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Medication Management'),
    (15945, 'Personalized Medical Care', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Personalized Medical Care'),
    (15945, 'Post Operative Care', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Post Operative Care'),
    (15945, 'Routine Lab Tests At Home', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Routine Lab Tests At Home'),
    (15945, 'Physiotherapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Physiotherapy'),
    (15945, 'Reflexology', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Reflexology'),
    (15945, 'Dry Needles', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Dry Needles'),
    (15945, 'Posture Correction', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Posture Correction'),
    (15945, 'Fascia Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Fascia Treatment'),
    (15945, 'Dry Cupping Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Dry Cupping Therapy'),
    (15945, 'Blood Cupping Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Blood Cupping Therapy'),
    (15945, 'Hijama Cupping Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Hijama Cupping Therapy'),
    (15945, 'Lymphatic Drainage Massage', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Lymphatic Drainage Massage'),
    (15945, 'Sport Injury Physiotherapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Sport Injury Physiotherapy'),
    (15945, 'Breathing Assessment and Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Breathing Assessment and Treatment'),
    (15945, 'Cheek Lift Surgery', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Cheek Lift Surgery'),
    (15945, 'Mommy Makeover', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Mommy Makeover'),
    (15945, 'Liposuction in Dubai', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Liposuction in Dubai'),
    (15945, 'Blepharoplasty', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Blepharoplasty'),
    (15945, 'Abdominoplasty (Tummy Tuck)', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Abdominoplasty (Tummy Tuck)'),
    (15945, 'Rhinoplasty in Dubai', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Rhinoplasty in Dubai'),
    (15945, 'Labiaplasty', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Labiaplasty'),
    (15945, 'Brazilian Butt Lift (BBL)', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Brazilian Butt Lift (BBL)'),
    (15945, 'Concussions', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Concussions'),
    (15945, 'Ankle Surgery', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Ankle Surgery'),
    (15945, 'Knee Arthroscopy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Knee Arthroscopy'),
    (15945, 'Stem Cell Treatments', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Stem Cell Treatments'),
    (15945, 'Stem Cell for Knee', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Stem Cell for Knee'),
    (15945, 'Stem Cell for Arthritis', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Stem Cell for Arthritis'),
    (15945, 'Stem Cell Therapy for Back Pain', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Stem Cell Therapy for Back Pain'),
    (15945, 'Stem Cell Therapy for Wrist Pain', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Stem Cell Therapy for Wrist Pain'),
    (15945, 'Spine Disc Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Spine Disc Treatment'),
    (15945, 'Shoulder Arthroscopy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Shoulder Arthroscopy'),
    (15945, 'Spine Surgery in Dubai', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Spine Surgery in Dubai'),
    (15945, 'Sports Injury Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Sports Injury Treatment'),
    (15945, 'Chiropractic Adjustment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Chiropractic Adjustment'),
    (15945, 'Hip Replacement Surgery', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Hip Replacement Surgery'),
    (15945, 'Knee Replacement Surgery', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Knee Replacement Surgery'),
    (15945, 'Shoulder Replacement Surgery', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Shoulder Replacement Surgery'),
    (15945, 'Cosmetic Aesthetic Gynecology', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Cosmetic Aesthetic Gynecology'),
    (15945, 'Vagina Tightening – Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://dynastyclinic.ae/', 'Vagina Tightening – Treatment'),
    (15947, 'Osteopathy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Osteopathy from France'),
    (15947, 'Physiotherapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Physiotherapy from Greece'),
    (15947, 'Nutrition Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Nutrition Therapy from UAE'),
    (15947, 'IV Vitamin Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'IV Vitamin Therapy'),
    (15947, 'Yoga & Pilates', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Yoga & Pilates'),
    (15947, 'Hair Regrowth Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Hair Regrowth Therapy'),
    (15947, 'Functional Medicine', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Functional Medicine from USA'),
    (15947, 'Anti-Ageing', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Anti-Ageing'),
    (15947, 'Ayurveda', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Ayurveda'),
    (15947, 'Chinese Medicine', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Chinese Medicine'),
    (15947, 'Emotional Wellbeing', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Emotional Wellbeing from Germany'),
    (15947, 'Homeopathy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Homeopathy'),
    (15947, 'Natural Aesthetics', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Natural Aesthetics'),
    (15947, 'Cryotherapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/', 'Cryotherapy'),
    (15947, 'IV Drip Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/iv-drip-packages/', 'IV Drip Infusion / IV Drip Therapy'),
    (15947, 'Membership Packages', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/wellth-packages/', 'Membership Packages'),
    (15947, 'Weight Loss Package', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://wellth.ae/wellth-packages/', 'Weight Loss Package'),
    (16020, 'Glow Skin Package', NULL, NULL, 299, NULL, 'AED', 'exact', 'package', '40% Off till Eid Al Adha', 'https://nvc-medical.ae/', 'Glow Skin Package --> AED 599 --> AED 299'),
    (16020, 'Full Body Checkup', NULL, NULL, 249, NULL, 'AED', 'exact', 'package', '40% Off till Eid Al Adha', 'https://nvc-medical.ae/', 'Full Body Checkup --> AED 499 --> AED 249'),
    (16020, 'Dental Treatment', NULL, NULL, 199, NULL, 'AED', 'exact', 'package', '40% Off till Eid Al Adha', 'https://nvc-medical.ae/', 'Dental Treatment --> AED 399 --> AED 199'),
    (16020, 'Botox Treatment', 'Non-surgical treatments to reduce wrinkles and enhance facial aesthetics using Botox injections.', 20, NULL, NULL, NULL, 'on_request', 'session', NULL, 'https://nvc-medical.ae/departments/botox-clinic-dubai/', 'A Botox session is quick and usually takes around 10–20 minutes, so you can easily fit it into your daily schedule.'),
    (16020, 'PRP for Hair', 'Platelet Rich Plasma therapy uses the healing components of your own blood to rejuvenate hair follicles.', NULL, NULL, NULL, NULL, 'on_request', 'session', NULL, 'https://nvc-medical.ae/departments/hair-loss-treatment-dubai/', 'PRP for Hair Platelet Rich Plasma therapy uses the healing components of your own blood to rejuvenate hair follicles.'),
    (16020, 'Mesotherapy for Hair', 'Mesotherapy involves delivering essential vitamins, minerals, and nutrients directly into the scalp.', NULL, NULL, NULL, NULL, 'on_request', 'session', NULL, 'https://nvc-medical.ae/departments/hair-loss-treatment-dubai/', 'Mesotherapy involves delivering essential vitamins, minerals, and nutrients directly into the scalp.'),
    (16020, 'Exosome Therapy for Hair', 'This innovative approach utilizes regenerative exosome factors to repair damaged follicles and stimulate new hair growth.', NULL, NULL, NULL, NULL, 'on_request', 'session', NULL, 'https://nvc-medical.ae/departments/hair-loss-treatment-dubai/', 'Exosome Therapy for Hair This innovative approach utilizes regenerative exosome factors to repair damaged follicles and stimulate new hair growth.'),
    (16020, 'Hair Medical Treatment', 'Different medications have been proven scientifically to help the hair follicles to regenerate.', NULL, NULL, NULL, NULL, 'on_request', 'session', NULL, 'https://nvc-medical.ae/departments/hair-loss-treatment-dubai/', 'Different medications have been proven scientifically to help the hair follicles to regenerate.'),
    (16044, 'Advanced Longevity Blood Panel', 'A comprehensive diagnostic test that measures key biomarkers linked to ageing, metabolism, inflammation, and overall health.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/programs/advanced-longevity-blood-panel', 'Our Comprehensive Blood Test is designed for those who want to understand what’s really happening inside their body, beyond what a routine check-up can reveal. This advanced test goes deeper into your health profile, assessing hormones, vitamins, minerals, organ function, and inflammation markers.'),
    (16044, 'Nutrition Consultation', 'Transform your relationship with food and energy through a one-on-one consultation with our Clinical Dietitian.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/services', 'Transform your relationship with food and energy through a one-on-one consultation with our Clinical Dietitian. Whether in-person or remote, you''ll get a science-backed nutrition plan designed specifically for your body and lifestyle.'),
    (16044, 'Performance Coaching', 'Performance coaching driven by science, and evidence-based practice, aimed to guide athletic populations and business professionals to achieve sustainable success.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/services', 'Performance coaching driven by science, and evidence-based practice, aimed to guide athletic populations and business professionals to achieve sustainable success.'),
    (16044, 'Physiotherapy and Rehabilitation', 'Guided rehabilitation can accelerate the healing process, alleviate pain, and lower the risk of re-injury.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/services', 'Return to the same level of exercise and training you engaged in before your injury and regain your previous functional capacity. Guided rehabilitation can accelerate the healing process, alleviate pain, and lower the risk of re-injury.'),
    (16044, 'Cryotherapy', 'Whole Body Cryotherapy briefly exposes the body to -110°C, reducing inflammation, enhancing muscle recovery, improving mood and sleep.', 30, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/services', 'Whole Body Cryotherapy briefly exposes the body to -110°C, reducing inflammation, enhancing muscle recovery, improving mood and sleep.'),
    (16044, 'Red Light Therapy', 'Harness the power of light to reduce inflammation, promote cell repair, and leave you feeling renewed.', 30, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/services', 'Harness the power of light to reduce inflammation, promote cell repair, and leave you feeling renewed.'),
    (16044, 'Manual Lymphatic Drainage', 'Stimulate your lymphatic system for detoxification and improved immunity. Ideal for reducing bloating and tension.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/services', 'Stimulate your lymphatic system for detoxification and improved immunity. Ideal for reducing bloating and tension.'),
    (16044, 'LPG Lymph Drainage', 'Target and reduce cellulite, water retention, and swelling with advanced technology that supports your lymphatic system.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/services', 'Target and reduce cellulite, water retention, and swelling with advanced technology that supports your lymphatic system.'),
    (16044, 'Skin Rejuvenation', 'Skin rejuvenation treatments focus on restoring vitality and youthfulness to the skin through advanced facials, collagen-stimulating therapies, and circulation-enhancing techniques.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/services', 'Skin rejuvenation treatments at Avida focus on restoring vitality and youthfulness to the skin through advanced facials, collagen-stimulating therapies, and circulation-enhancing techniques.'),
    (16044, 'Longevity Body Detox', 'Longevity body detox treatments combine therapeutic massage, lymphatic drainage, and targeted regenerative techniques to clear toxins, reduce inflammation, and support whole-body recovery.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://www.avidalongevity.com/services', 'Longevity body detox treatments combine therapeutic massage, lymphatic drainage, and targeted regenerative techniques to clear toxins, reduce inflammation, and support whole-body recovery.'),
    (16046, 'Personal Training (Gym)', 'Get personalized one-on-one coaching for the gym. Our certified trainers customize sessions to match your goals, fitness level, and lifestyle—so you see real results, safely and effectively.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://zaryawellnesshealthclub.com/our-services/', 'Personal Training (Gym) Get personalized one-on-one coaching for the gym. Our certified trainers customize sessions to match your goals, fitness level, and lifestyle—so you see real results, safely and effectively.'),
    (16046, 'Swimming Classes', 'Our swimming classes cater to all age groups and skill levels, offering expert instruction in a safe and supportive environment to build confidence, improve technique, and promote overall fitness and fun.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://zaryawellnesshealthclub.com/our-services/', 'Swimming Classes Our swimming classes cater to all age groups and skill levels, offering expert instruction in a safe and supportive environment to build confidence, improve technique, and promote overall fitness and fun.'),
    (16046, 'Group Aerobic Classes', 'Group aerobic classes combine energetic movements with motivating music, helping improve cardiovascular health, burn calories, and boost endurance—all in a fun, social, and encouraging group fitness environment.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://zaryawellnesshealthclub.com/our-services/', 'Group aerobic classes Group aerobic classes combine energetic movements with motivating music, helping improve cardiovascular health, burn calories, and boost endurance—all in a fun, social, and encouraging group fitness environment.'),
    (16046, 'Aqua Fitness', 'Our swimming classes cater to all age groups and skill levels, offering expert instruction in a safe and supportive environment to build confidence, improve technique, and promote overall fitness and fun.', 60, NULL, NULL, NULL, 'unknown', 'session', NULL, 'https://zaryawellnesshealthclub.com/our-services/', 'Aqua fitness Our swimming classes cater to all age groups and skill levels, offering expert instruction in a safe and supportive environment to build confidence, improve technique, and promote overall fitness and fun.'),
    (16046, 'After School Kids Club', 'After school kids club offers exciting, themed activities during school breaks, keeping children active, creative, and socially engaged while learning new skills and making unforgettable memories in a safe environment.', NULL, NULL, NULL, NULL, 'unknown', 'package', NULL, 'https://zaryawellnesshealthclub.com/our-services/', 'After school kids club Group aerobic classes combine energetic movements with motivating music, helping improve cardiovascular health, burn calories, and boost endurance—all in a fun, social, and encouraging group fitness environment.'),
    (16046, 'Junior Active Club', 'Junior active club offers exciting, themed activities during school breaks, keeping children active, creative, and socially engaged while learning new skills and making unforgettable memories in a safe environment.', NULL, NULL, NULL, NULL, 'unknown', 'package', NULL, 'https://zaryawellnesshealthclub.com/our-services/', 'Junior active club Our swimming classes cater to all age groups and skill levels, offering expert instruction in a safe and supportive environment to build confidence, improve technique, and promote overall fitness and fun.'),
    (16046, 'Kids Seasonal Camp', 'Kids Seasonal Camp offers exciting, themed activities during school breaks, keeping children active, creative, and socially engaged while learning new skills and making unforgettable memories in a safe environment.', NULL, NULL, NULL, NULL, 'unknown', 'package', NULL, 'https://zaryawellnesshealthclub.com/our-services/', 'Kids Seasonal Camp offers exciting, themed activities during school breaks, keeping children active, creative, and socially engaged while learning new skills and making unforgettable memories in a safe environment.'),
    (16046, 'Kids Karate', 'Kids Karate classes teach discipline, confidence, and self-defense in a structured, fun environment, promoting physical fitness, focus, and respect while helping children build strength, coordination, and emotional resilience.', NULL, NULL, NULL, NULL, 'unknown', 'package', NULL, 'https://zaryawellnesshealthclub.com/our-services/', 'Kids Karate Kids Karate classes teach discipline, confidence, and self-defense in a structured, fun environment, promoting physical fitness, focus, and respect while helping children build strength, coordination, and emotional resilience.'),
    (16051, 'InBody Scan', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'InBody Scan at Nour Clinic'),
    (16051, 'Laser Hair Removal', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Laser Hair Removal'),
    (16051, 'Body Contouring', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Body Contouring'),
    (16051, 'Laser Tattoo Removal', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Laser Tattoo Removal'),
    (16051, 'LPG (M6)', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'LPG (M6)'),
    (16051, 'Body Piercing', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Body Piercing'),
    (16051, 'Cooltech', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Cooltech'),
    (16051, 'Diolazexl', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Diolazexl'),
    (16051, 'PB Serum', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'PB Serum'),
    (16051, 'Emsculpt evolvex (EMS + RF)', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Emsculpt evolvex (EMS + RF)'),
    (16051, 'Slimming Treatments', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Slimming Treatments'),
    (16051, 'Slimming Mesotherapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Slimming Mesotherapy'),
    (16051, 'Slimming Injections', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Slimming Injections'),
    (16051, 'Vasculaze', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Vasculaze'),
    (16051, 'Velashape 3 Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Velashape 3 Treatment'),
    (16051, 'Anti-Wrinkle Injection', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Anti-Wrinkle Injection'),
    (16051, 'Botox Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Botox Treatment'),
    (16051, 'Aquagold', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Aquagold'),
    (16051, 'Pigmentation and Melasma Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Pigmentation and Melasma Treatment'),
    (16051, 'Carbon Peel Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Carbon Peel Treatment'),
    (16051, 'Dermal Fillers', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Dermal Fillers'),
    (16051, 'Radiesse Filler', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Radiesse Filler'),
    (16051, 'Nose Filler', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Nose Filler'),
    (16051, 'Lip Fillers', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Lip Fillers'),
    (16051, 'Cheek Filler', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Cheek Filler'),
    (16051, 'Filler Dissolving(Removal)', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Filler Dissolving(Removal)'),
    (16051, 'Thread Lift', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Thread Lift'),
    (16051, 'Face Lift', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Face Lift'),
    (16051, 'Nose Lift', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Nose Lift'),
    (16051, 'PRP Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'PRP Treatment'),
    (16051, 'Super PRP', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Super PRP'),
    (16051, 'Radio Frequency Lifting', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Radio Frequency Lifting at Nour Clinic'),
    (16051, 'HydraFacial Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'HydraFacial Treatment'),
    (16051, 'IPL Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IPL Treatment'),
    (16051, 'Mesotherapy Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Mesotherapy Treatment'),
    (16051, 'Exosomes Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Exosomes Treatment'),
    (16051, 'Morpheus8 Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Morpheus8 Treatment'),
    (16051, 'Plasmage Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Plasmage Treatment'),
    (16051, 'Stem Cell Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Stem Cell Therapy'),
    (16051, 'Skin Boosters', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Skin Boosters'),
    (16051, 'Q-Switched Nd:YAG Laser', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Q-Switched Nd:YAG Laser'),
    (16051, 'Ultherapy Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Ultherapy Treatment'),
    (16051, 'Dermapen Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Dermapen Treatment'),
    (16051, 'Profhilo Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Profhilo Treatment'),
    (16051, 'Dubai Sculptra Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Dubai Sculptra Treatment'),
    (16051, 'HIFU Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'HIFU Treatment'),
    (16051, 'Hair Filler Treatment', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Hair Filler Treatment'),
    (16051, 'Hair Stem Cell Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Hair Stem Cell Therapy'),
    (16051, 'Hair Exosomes', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Hair Exosomes'),
    (16051, 'Super PRP Hair', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Super PRP Hair'),
    (16051, 'Hair PRP For Hair', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Hair PRP For Hair'),
    (16051, 'Hair Mesotherapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Hair Mesotherapy'),
    (16051, 'IV Drip', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Drip'),
    (16051, 'OligoScan Test (pre iv screen)', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'OligoScan Test (pre iv screen)'),
    (16051, 'Energy Booster IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Energy Booster IV'),
    (16051, 'Hangover Jet Lag IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Hangover Jet Lag IV'),
    (16051, 'IV Hydration & Energy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Hydration & Energy'),
    (16051, 'IV Hydration', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Hydration'),
    (16051, 'IV Energy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Energy'),
    (16051, 'IV Anti-Stress', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Anti-Stress'),
    (16051, 'IV Immune Boost & Vitamin', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Immune Boost & Vitamin'),
    (16051, 'IV Immune Boost', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Immune Boost'),
    (16051, 'IV Immuno Defense Drip', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Immuno Defense Drip'),
    (16051, 'IV Immune Armor Drip', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Immune Armor Drip'),
    (16051, 'IV Multi-Vitamin', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'IV Multi-Vitamin'),
    (16051, 'Multivitamin for Women', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Multivitamin for Women'),
    (16051, 'Multivitamins', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Multivitamins'),
    (16051, 'Optimum Power C-Shield Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Optimum Power C-Shield Therapy'),
    (16051, 'HI-C IV All-in-One', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'HI-C IV All-in-One'),
    (16051, 'Iron IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Iron IV'),
    (16051, 'Standard Iron Infusion', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Standard Iron Infusion'),
    (16051, 'Iron Restoration Plan', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Iron Restoration Plan'),
    (16051, 'Essential Iron Infusion', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Essential Iron Infusion'),
    (16051, 'Detox & Gut Balance IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Detox & Gut Balance IV'),
    (16051, 'Super Detox & Energy IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Super Detox & Energy IV'),
    (16051, 'Liver Detox IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Liver Detox IV'),
    (16051, 'Healthy Gut IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Healthy Gut IV'),
    (16051, 'Digestive Harmony Infusion', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Digestive Harmony Infusion'),
    (16051, 'Liver Support IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Liver Support IV'),
    (16051, 'NAD+ IV Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'NAD+ IV Therapy'),
    (16051, 'Standard NAD+ IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Standard NAD+ IV'),
    (16051, 'Memory Boost IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Memory Boost IV'),
    (16051, 'Cellular Rejuvenation Drip', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Cellular Rejuvenation Drip'),
    (16051, 'Adrenal Recharge IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Adrenal Recharge IV'),
    (16051, 'Beauty & Anti-Aging IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Beauty & Anti-Aging IV'),
    (16051, 'Skin Whitening IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Skin Whitening IV'),
    (16051, 'Anti-Aging Beauty Bloom Drip', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Anti-Aging Beauty Bloom Drip'),
    (16051, 'Glow Revive Infusion', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Glow Revive Infusion'),
    (16051, 'Radiant Complexion Drip', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Radiant Complexion Drip'),
    (16051, 'Skin Glowing Drip', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Skin Glowing Drip'),
    (16051, 'Hair & Nails IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Hair & Nails IV'),
    (16051, 'Anti-Hair Loss Drip', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Anti-Hair Loss Drip'),
    (16051, 'Follicle Fuel Therapy', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Follicle Fuel Therapy'),
    (16051, 'Beauty All in one IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Beauty All in one IV'),
    (16051, 'Performance & Recovery IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Performance & Recovery IV'),
    (16051, 'Fitness IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Fitness IV'),
    (16051, 'Male IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Male IV'),
    (16051, 'Post Injury IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Post Injury IV'),
    (16051, 'Weight Loss IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Weight Loss IV'),
    (16051, 'Insulin Resistance IV', NULL, NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://nouraesthetic.com/', 'Insulin Resistance IV'),
    (16053, 'Lab at Home', 'As an Elite Diagnostic Center we offer convenient, faster healthcare at home – samples collected, diagnosed accurately, and delivered with personalized service.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://sidrahc.com/', 'Lab at Home As an Elite Diagnostic Center we offer convenient, faster healthcare at home – samples collected, diagnosed accurately, and delivered with personalized service.'),
    (16053, 'Nurse at Home', 'Skilled nursing care in Dubai: personalized care, wound care, chronic illness management, education, post-surgery comfort at home, reduced hospital exposure, and fast assessments.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://sidrahc.com/', 'Nurse at Home Skilled nursing care in Dubai: personalized care, wound care, chronic illness management, education, post-surgery comfort at home, reduced hospital exposure, and fast assessments.'),
    (16053, 'Doctor at Home', 'Doctor at home services offers convenient, personalized care at your doorstep, with benefits like faster diagnosis and peace of mind.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://sidrahc.com/', 'Doctor at Home Doctor at home services offers convenient, personalized care at your doorstep, with benefits like faster diagnosis and peace of mind.'),
    (16053, 'IV Therapy at Home', 'Our in-home IV therapy is administered by licensed nurses. We tailor vitamin and nutrient infusions to your needs and goals, which can include hydration, immunity boost, or even anti-aging effects.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://sidrahc.com/', 'IV Therapy at Home Our in-home IV therapy is administered by licensed nurses. We tailor vitamin and nutrient infusions to your needs and goals, which can include hydration, immunity boost, or even anti-aging effects.'),
    (16053, 'Physiotherapy at Home', 'Get physiotherapy treatment in the comfort of your own home! Our qualified therapists create personalized plans to improve your mobility, reduce pain, and recover from injuries.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://sidrahc.com/', 'Physiotherapy at Home Get physiotherapy treatment in the comfort of your own home! Our qualified therapists create personalized plans to improve your mobility, reduce pain, and recover from injuries.'),
    (16053, 'Childcare at Home', 'We provide reliable in-home childcare services for your precious little ones. Our qualified caregivers will ensure your child’s safety and happiness while you’re away.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://sidrahc.com/', 'Childcare at Home We provide reliable in-home childcare services for your precious little ones. Our qualified caregivers will ensure your child’s safety and happiness while you’re away.'),
    (16053, 'Flu Vaccination at Home', 'Stay healthy and safe this flu season with Sidra Healthcare’s at-home flu vaccination service in Dubai. Our service ensures timely vaccinations, reducing the risk of flu-related complications.', NULL, NULL, NULL, NULL, 'unknown', 'service', NULL, 'https://sidrahc.com/', 'Flu Vaccination at Home Stay healthy and safe this flu season with Sidra Healthcare’s at-home flu vaccination service in Dubai. Our service ensures timely vaccinations, reducing the risk of flu-related complications.'),
    (16053, 'Pharmacy on Call Service', 'Our Pharmacy on Call and At-Home Prescription Service is designed to bring convenience straight to your doorstep. Whether you need a quick medication refill or don’t have a prescription on hand, we’ve got you covered.', NULL, 149, NULL, 'AED', 'exact', 'service', NULL, 'https://sidrahc.com/product/pharmacy-on-call-service/', 'Pharmacy On Call Service AED 149 149.00 AED Imagine needing essential medication while at home or visiting family in Dubai, only to find yourself scrambling to reach a pharmacy or searching endlessly for delivery options. With Sidra Healthcare, that stress is a thing of the past.'),
    (16057, '12-week ‘Refocus’ membership', 'Membership program designed to optimize health performance and longevity.', NULL, NULL, NULL, NULL, 'on_request', 'month', NULL, 'https://www.byformation.com/memberships', 'the 12- week ‘Refocus’ and the annual ‘Full Reset’ membership.'),
    (16057, 'annual ‘Full Reset’ membership', 'Membership program designed to optimize health performance and longevity.', NULL, NULL, NULL, NULL, 'on_request', 'month', NULL, 'https://www.byformation.com/memberships', 'the 12- week ‘Refocus’ and the annual ‘Full Reset’ membership.'),
    (16057, 'Engineered Muscle Building', 'Specialized program designed to help you build strong, healthy muscles.', NULL, NULL, NULL, NULL, 'on_request', 'package', NULL, 'https://www.byformation.com/memberships', 'Focus Engineered Muscle Building Unleash your full potential and reach your peak performance with a specialized program designed to help you build strong, healthy muscles the right way.'),
    (16057, 'Prime Health Boost', 'Program leveraging performance data and AI-driven equipment to optimize health.', NULL, NULL, NULL, NULL, 'on_request', 'package', NULL, 'https://www.byformation.com/memberships', 'Prime Health Boost Experience the future by leveraging advancement in fitness technology with our program that leverages performance data and AI-driven equipment to supercharge your metabolic age.'),
    (16057, 'Optimal Fat Burning', 'Program designed to shed weight and jump-start metabolism.', NULL, NULL, NULL, NULL, 'on_request', 'package', NULL, 'https://www.byformation.com/memberships', 'Optimal Fat Burning Transform yourself and reach your goals with our proven program designed to shed weight, jump-start metabolism, and set a foundation for long-term success.'),
    (16057, 'IV & NAD+ Treatments', 'Bespoke IV drips and NAD+ treatments to optimize performance.', NULL, NULL, NULL, NULL, 'on_request', 'session', NULL, 'https://www.byformation.com/ivs-and-nad-treatments', 'Enjoy elevated recovery and optimize your performance with bespoke bespoke IV drips and NAD+ treatments to suit your needs.'),
    (16064, 'Longevity Program', 'Longevity medicine isn’t about chasing youth. It’s about protecting vitality — your energy, cognition, strength, and resilience — so that you live not only longer, but better. It means detecting decline before it takes root, and building the physiological reserve to thrive through every decade.', 120, NULL, NULL, NULL, 'on_request', 'package', 'Inquire for Waitlist availability', 'https://www.drrheakotecha.com/products/longevity-program', 'Longevity medicine isn’t about chasing youth. It’s about protecting vitality — your energy, cognition, strength, and resilience — so that you live not only longer, but better. It means detecting decline before it takes root, and building the physiological reserve to thrive through every decade.'),
    (16067, 'VO2 MAX TEST + CONSULTATION', 'VO2 MAX TEST + CONSULTATION with a Sports Medicine Doctor', 60, 700, NULL, 'AED', 'exact', 'session', NULL, 'https://kingscollegehospitaldubai.com/', 'VO2 MAX TEST + CONSULTATION with a Sports Medicine Doctor AED 700 ONLY'),
    (16067, 'Back-to-School Health Package', 'The package combines a pediatrician consultation with a dietitian consultation, giving parents a clearer picture of their child’s overall health and practical advice for the school term ahead.', 60, 600, NULL, 'AED', 'exact', 'package', NULL, 'https://kingscollegehospitaldubai.com/back-to-school-health-package/', 'Back-to-School Health Package: AED 600'),
    (16067, 'Intranasal Flu Vaccine', 'The intranasal flu vaccine is also available at the special rate of AED 140.', 30, 140, NULL, 'AED', 'exact', 'unit', NULL, 'https://kingscollegehospitaldubai.com/back-to-school-health-package/', 'Intranasal Flu Vaccine for AED 140'),
    (16067, 'Liver Transplant Centre Of Excellence', 'King’s Liver Transplant Centre Of Excellence For Adults and Pediatrics', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/service/liver-transplant-centre', 'King’s Liver Transplant Centre Of Excellence For Adults and Pediatrics'),
    (16067, 'Health Checkups', 'Comprehensive health checkup services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Health Checkups'),
    (16067, 'Sports Medicine Package', 'Comprehensive sports medicine services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Sports Medicine Package'),
    (16067, 'Executive Health Check', 'Comprehensive executive health check services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Executive Health Check'),
    (16067, 'Well Women Package', 'Comprehensive health services for women.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Well Women Package'),
    (16067, 'Paediatric Health Screening', 'Comprehensive health screening services for children.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Paediatric Health Screening'),
    (16067, 'Prostate Disease Screening', 'Comprehensive screening services for prostate diseases.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Prostate Disease Screening'),
    (16067, 'STD Screening', 'Comprehensive screening services for sexually transmitted diseases.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'STD Screening'),
    (16067, 'I/V Infusions', 'Intravenous infusion services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'I/V Infusions'),
    (16067, 'Genetic Screening', 'Comprehensive genetic screening services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Genetic Screening'),
    (16067, 'Cardiac Screening', 'Comprehensive cardiac screening services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Cardiac Screening'),
    (16067, 'Bariatric Surgery', 'Comprehensive bariatric surgery services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Bariatric Surgery'),
    (16067, 'Pap Smear Test and Consultation', 'Comprehensive pap smear testing and consultation services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Pap Smear Test and Consultation'),
    (16067, 'Mammogram', 'Comprehensive mammogram services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Mammogram'),
    (16067, 'Flu Vaccination With Consultation', 'Flu vaccination services with consultation.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Flu Vaccination With Consultation'),
    (16067, 'Flu Vaccination Without Consultation', 'Flu vaccination services without consultation.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Flu Vaccination Without Consultation'),
    (16067, 'Vitamin D & B12', 'Vitamin D and B12 testing services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Vitamin D & B12'),
    (16067, 'Dental Scaling & Polishing', 'Dental scaling and polishing services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Dental Scaling & Polishing'),
    (16067, 'Scoliosis and Kyphosis Complimentary Consultation', 'Complimentary consultation for scoliosis and kyphosis.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Scoliosis and Kyphosis Complimentary Consultation'),
    (16067, 'Cancer Screening Packages', 'Comprehensive cancer screening services.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Cancer Screening Packages'),
    (16067, 'Paediatrics Packages', 'Comprehensive pediatric health packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Paediatrics Packages'),
    (16067, 'Weight Loss Packages', 'Comprehensive weight loss packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Weight Loss Packages'),
    (16067, 'Cardiology Packages', 'Comprehensive cardiology packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Cardiology Packages'),
    (16067, 'Sports Medicine Packages', 'Comprehensive sports medicine packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Sports Medicine Packages'),
    (16067, 'Women Health Packages', 'Comprehensive health packages for women.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Women Health Packages'),
    (16067, 'Urology Packages', 'Comprehensive urology packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Urology Packages'),
    (16067, 'Hepatology Packages', 'Comprehensive hepatology packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Hepatology Packages'),
    (16067, 'Pulmonology Packages', 'Comprehensive pulmonology packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Pulmonology Packages'),
    (16067, 'Bone Health Packages', 'Comprehensive bone health packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Bone Health Packages'),
    (16067, 'Sexual Health Packages', 'Comprehensive sexual health packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Sexual Health Packages'),
    (16067, 'Maternity Packages', 'Comprehensive maternity packages.', NULL, NULL, NULL, NULL, 'on_request', 'service', NULL, 'https://kingscollegehospitaldubai.com/packages/', 'Maternity Packages'),
    (16214, 'Blood Test at Home', 'Convenient home-based lab tests, including full-body checkups, blood tests, and STD screenings.', 30, NULL, NULL, NULL, 'unknown', 'service', 'Home blood test packages start from AED 250, covering routine bloodwork, full body checkups, diabetes screening, thyroid panels, vitamin testing, and more.', 'https://medilifeglobal.com/blood-test-at-home-dubai/', 'A blood test is the most common diagnostic procedure that allows doctors to assess certain parameters of a patient’s health. Through the collected blood samples, we provide a hormone test, and diabetes test, diagnose the presence of pathogens, do full body checkups, and more. Our results of the Blood Analysis at Home Dubai are accurate and quick. Browse our full-body checkup package in Dubai. Besides blood tests, we also offer an STD test , a rapid PCR test , a flu vaccine at home and doctor on call services.'),
    (16214, 'Doctor on Call', 'Access medical consultations without leaving your home. Our licensed doctors provide advice, treatment, and follow-up visits.', 30, NULL, NULL, NULL, 'unknown', 'service', 'Consultation fees starting from AED 250–450, with detailed invoices for insurance reimbursement.', 'https://medilifeglobal.com/doctor-on-call/', 'Medilife Global sends a DHA-licensed doctor to your home, hotel, or office anywhere in Dubai, typically arriving within 20–30 minutes. Our doctors handle general consultations, pediatric care, IV therapy, chronic disease monitoring, and on-the-spot prescriptions, with service available 24/7, including weekends and public holidays.'),
    (16214, 'IV Therapy', 'Receive intravenous drips, including hydration therapy and vitamin infusions, directly in the comfort of your home.', 60, NULL, NULL, NULL, 'unknown', 'service', 'IV Drip Therapy services start from AED 350 for hydration therapy and can go up to AED 700 for immune boost IV therapy.', 'https://medilifeglobal.com/', 'Experience the benefits of intravenous therapy without leaving your residence or Hotel. Our trained nurses and professionals administer IV drips with expertise and care.'),
    (16214, 'NAD+ IV Therapy', 'NAD IV therapy for anti-aging and overall health benefits.', 60, NULL, NULL, NULL, 'unknown', 'service', 'NAD IV therapy is priced at AED 500 to AED 700 depending on the specific treatment.', 'https://medilifeglobal.com/', 'You can also book a std test or a flu shot at home, and a health care professional will come and administer it in a few hours.'),
    (16214, 'Flu Vaccination', 'Protect yourself and your family with our convenient vaccination services.', 30, NULL, NULL, NULL, 'unknown', 'service', 'Flu vaccination services are available at home starting from AED 100.', 'https://medilifeglobal.com/', 'Our team administers essential vaccinations in Dubai, including the HPV vaccine, chickenpox vaccine, and flu shot, all in the comfort of your own home or Hotel.'),
    (16214, 'STD Testing', 'Confidential and reliable STD testing services.', 30, NULL, NULL, NULL, 'unknown', 'service', 'STD testing services start from AED 200.', 'https://medilifeglobal.com/', 'Safeguard your sexual health with our confidential and reliable STD test in Dubai and treatment options. Choose between visiting our Dubai clinic or opting for convenient at-home STI testing services in Dubai.'),
    (16214, 'PCR Test at Home', 'Rapid PCR testing services available at home.', 30, NULL, NULL, NULL, 'unknown', 'service', 'PCR Test at Home is priced at AED 300.', 'https://medilifeglobal.com/', 'Our rapid PCR test in Dubai and at home pregnancy test are also the fastest and most affordable options you will find.');

CREATE TEMP TABLE sparse_menu_normalized ON COMMIT DROP AS
SELECT menu.*,
       CASE
         WHEN lower(raw_name) LIKE '%hyperbaric%' OR lower(raw_name) LIKE '%hbot%' THEN 27
         WHEN lower(raw_name) LIKE '%nad+%' OR lower(raw_name) LIKE '%nad iv%' THEN 22
         WHEN lower(raw_name) LIKE '%iv %' OR lower(raw_name) LIKE '%iv&%' OR lower(raw_name) LIKE '%infusion%' THEN 74
         WHEN lower(raw_name) LIKE '%exosome%' THEN 18
         WHEN lower(raw_name) LIKE '%stem cell%' OR lower(raw_name) LIKE '%muse cell%' THEN 17
         WHEN lower(raw_name) LIKE '%prp%' THEN 19
         WHEN lower(raw_name) LIKE '%peptide%' THEN 20
         WHEN lower(raw_name) LIKE '%ozone%' OR lower(raw_name) LIKE '%eboo%' THEN 54
         WHEN lower(raw_name) LIKE '%cryotherap%' OR lower(raw_name) LIKE '%localised cryo%' THEN 28
         WHEN lower(raw_name) LIKE '%red light%' OR lower(raw_name) LIKE '%led light%' THEN 31
         WHEN lower(raw_name) LIKE '%lymph%' THEN 56
         WHEN lower(raw_name) LIKE '%physiotherap%' OR lower(raw_name) LIKE '%physical therap%' THEN 44
         WHEN lower(raw_name) LIKE '%nutrition%' OR lower(raw_name) LIKE '%dietitian%' THEN 39
         WHEN lower(raw_name) LIKE '%vo2%' THEN 8
         WHEN lower(raw_name) LIKE '%blood panel%' OR lower(raw_name) LIKE '%blood test%' THEN 7
         WHEN lower(raw_name) LIKE '%genetic%' THEN 9
         WHEN lower(raw_name) LIKE '%cancer screen%' THEN 10
         WHEN lower(raw_name) LIKE '%body composition%' OR lower(raw_name) LIKE '%inbody%' THEN 4
         WHEN lower(raw_name) LIKE '%functional medicine%' THEN 43
         WHEN lower(raw_name) LIKE '%botox%' OR lower(raw_name) LIKE '%anti-wrinkle%' THEN 34
         WHEN lower(raw_name) LIKE '%filler%' THEN 35
         WHEN lower(raw_name) LIKE '%hydrafacial%' THEN 53
         WHEN lower(raw_name) LIKE '%microneedl%' OR lower(raw_name) LIKE '%dermapen%' OR lower(raw_name) LIKE '%morpheus8%' THEN 47
         WHEN lower(raw_name) LIKE '%chemical peel%' OR lower(raw_name) LIKE '%carbon peel%' THEN 57
         WHEN lower(raw_name) LIKE '%laser hair%' THEN 50
         WHEN lower(raw_name) LIKE '%tattoo removal%' THEN 59
         WHEN lower(raw_name) LIKE '%laser skin%' OR lower(raw_name) LIKE '%photofacial%' THEN 96
         WHEN lower(raw_name) LIKE '%body contour%' OR lower(raw_name) LIKE '%body sculpt%' OR lower(raw_name) LIKE '%cooltech%' OR lower(raw_name) LIKE '%emsculpt%' THEN 48
         WHEN lower(raw_name) LIKE '%cellulite%' THEN 88
         WHEN lower(raw_name) LIKE '%weight loss%' OR lower(raw_name) LIKE '%metabolic weight%' THEN 62
         WHEN lower(raw_name) LIKE '%hair regrowth%' OR lower(raw_name) LIKE '%hair restoration%' OR lower(raw_name) LIKE '%hair loss%' THEN 51
         WHEN lower(raw_name) LIKE '%massage%' OR lower(raw_name) LIKE '%reflexology%' THEN 49
         WHEN lower(raw_name) LIKE '%chiropractic%' THEN 45
         WHEN lower(raw_name) LIKE '%acupuncture%' OR lower(raw_name) LIKE '%dry needle%' THEN 46
         WHEN lower(raw_name) LIKE '%shockwave%' THEN 33
         WHEN lower(raw_name) LIKE '%permanent makeup%' THEN 104
         WHEN lower(raw_name) LIKE '%pilates%' THEN 79
         ELSE NULL
       END::integer AS treatment_id
FROM sparse_menu menu;

UPDATE fountain.offerings offering
SET treatment_id = COALESCE(offering.treatment_id, menu.treatment_id),
    description = COALESCE(NULLIF(menu.description, ''), offering.description),
    duration_minutes = COALESCE(menu.duration_minutes, offering.duration_minutes),
    price_amount = COALESCE(menu.price_amount, offering.price_amount),
    price_max_amount = CASE WHEN menu.price_amount IS NOT NULL THEN menu.price_max_amount ELSE offering.price_max_amount END,
    price_currency = COALESCE(menu.price_currency, offering.price_currency),
    price_type = CASE WHEN menu.price_amount IS NOT NULL OR menu.price_type = 'on_request' THEN menu.price_type ELSE offering.price_type END,
    price_unit = CASE WHEN menu.price_amount IS NOT NULL OR menu.price_type = 'on_request' THEN menu.price_unit ELSE offering.price_unit END,
    price_context = COALESCE(menu.price_context, offering.price_context),
    source_offer_url = menu.source_url,
    verification_status = CASE WHEN offering.verification_status IN ('human_verified', 'owner_verified') THEN offering.verification_status ELSE 'agent_verified' END,
    updated_at = now()
FROM sparse_menu_normalized menu
WHERE offering.location_id = menu.location_id
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
  AND lower(trim(offering.raw_name)) = lower(trim(menu.raw_name));

INSERT INTO fountain.offerings (
  location_id, treatment_id, raw_name, price_amount, price_max_amount,
  price_currency, source_offer_url, source_id, status, data_origin,
  verification_status, duration_minutes, description, price_type,
  price_unit, price_context, created_at, updated_at
)
SELECT menu.location_id, menu.treatment_id, menu.raw_name, menu.price_amount,
       menu.price_max_amount, menu.price_currency, menu.source_url, NULL,
       'active', 'manual', 'agent_verified', menu.duration_minutes,
       menu.description, menu.price_type, menu.price_unit, menu.price_context,
       now(), now()
FROM sparse_menu_normalized menu
WHERE NOT EXISTS (
  SELECT 1 FROM fountain.offerings existing
  WHERE existing.location_id = menu.location_id
    AND existing.status = 'active'
    AND existing.deleted_at IS NULL
    AND lower(trim(existing.raw_name)) = lower(trim(menu.raw_name))
);

-- Fill only blank descriptions, using the canonical treatment copy when an
-- extracted name maps cleanly to the Fountain taxonomy.
UPDATE fountain.offerings offering
SET description = treatment.description,
    updated_at = now()
FROM fountain.treatments treatment
WHERE offering.location_id IN (13713, 13925, 14093, 14156, 14244, 14249, 14260, 15604, 15937, 15945, 15947, 16020, 16044, 16046, 16051, 16053, 16057, 16064, 16067, 16214)
  AND offering.status = 'active'
  AND offering.deleted_at IS NULL
  AND offering.treatment_id = treatment.id
  AND NULLIF(trim(offering.description), '') IS NULL
  AND NULLIF(trim(treatment.description), '') IS NOT NULL;

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked,
  verified_by, verified_at, source_note
)
SELECT 'location', location_id, 'offerings', 'agent_verified', false,
       'expand_sparse_dubai_menus_20260810', now(),
       'Official-site menu research run 707; evidence URL and verbatim evidence retained in the research report'
FROM (VALUES (13713), (13925), (14093), (14156), (14244), (14249), (14260), (15604), (15937), (15945), (15947), (16020), (16044), (16046), (16051), (16053), (16057), (16064), (16067), (16214)) locations(location_id)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = false,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

COMMIT;
