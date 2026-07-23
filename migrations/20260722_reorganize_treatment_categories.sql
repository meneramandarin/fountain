BEGIN;

CREATE TEMP TABLE treatment_category_reorganization (
  canonical_name text PRIMARY KEY,
  category text NOT NULL CHECK (category IN (
    'Measure',
    'Optimize',
    'Recover',
    'Regenerate',
    'Rejuvenate'
  ))
) ON COMMIT DROP;

INSERT INTO treatment_category_reorganization (category, canonical_name)
VALUES
  ('Measure', 'Advanced biomarker panel'),
  ('Measure', 'Advanced blood panel'),
  ('Measure', 'Body composition analysis'),
  ('Measure', 'Cancer screening'),
  ('Measure', 'Cardiac screening'),
  ('Measure', 'Cardiometabolic testing'),
  ('Measure', 'DEXA scan'),
  ('Measure', 'Dot Physicals'),
  ('Measure', 'Epigenetic age clock'),
  ('Measure', 'Executive health checkup'),
  ('Measure', 'Full-body CT'),
  ('Measure', 'Full-body MRI'),
  ('Measure', 'Gait Analysis'),
  ('Measure', 'Genetic testing'),
  ('Measure', 'Hormone testing'),
  ('Measure', 'Running Analysis'),
  ('Measure', 'Sleep study'),
  ('Measure', 'Telomere testing'),
  ('Measure', 'VO2 max test'),

  ('Optimize', 'B12 Injections'),
  ('Optimize', 'Colon hydrotherapy'),
  ('Optimize', 'Endocrine therapy'),
  ('Optimize', 'Exercise programming'),
  ('Optimize', 'Functional medicine'),
  ('Optimize', 'GLP-1 weight management'),
  ('Optimize', 'Health Consultant'),
  ('Optimize', 'Hormone optimization'),
  ('Optimize', 'IV Infusions'),
  ('Optimize', 'Medical weight loss'),
  ('Optimize', 'Menopause hormone therapy (HRT)'),
  ('Optimize', 'NAD+ IV therapy'),
  ('Optimize', 'Naturopathic Medicine'),
  ('Optimize', 'Ozone therapy'),
  ('Optimize', 'Personal Trainer'),
  ('Optimize', 'Personalized nutrition'),
  ('Optimize', 'Pilates'),
  ('Optimize', 'Pregnancy Care'),
  ('Optimize', 'Preventive Care'),
  ('Optimize', 'Primary Care Services'),
  ('Optimize', 'Sleep optimization'),
  ('Optimize', 'Strength And Conditioning'),
  ('Optimize', 'Supplementation'),
  ('Optimize', 'Telehealth Services'),
  ('Optimize', 'Testosterone replacement therapy (TRT)'),
  ('Optimize', 'Wellness And Performance'),

  ('Recover', 'Active Release Technique'),
  ('Recover', 'Acupuncture'),
  ('Recover', 'Balance Therapy'),
  ('Recover', 'Chiropractic care'),
  ('Recover', 'Cold Laser Therapy'),
  ('Recover', 'Cold plunge'),
  ('Recover', 'Concussion Therapy'),
  ('Recover', 'Cryotherapy'),
  ('Recover', 'Emsella'),
  ('Recover', 'Group Therapy'),
  ('Recover', 'Hyperbaric oxygen therapy'),
  ('Recover', 'Individual Therapy'),
  ('Recover', 'Lymphatic drainage'),
  ('Recover', 'Massage therapy'),
  ('Recover', 'Orthotics'),
  ('Recover', 'PEMF therapy'),
  ('Recover', 'Physical therapy'),
  ('Recover', 'Psychotherapy'),
  ('Recover', 'Red light therapy'),
  ('Recover', 'Sauna and infrared'),
  ('Recover', 'Shockwave therapy'),
  ('Recover', 'Soft Tissue Mobilization'),
  ('Recover', 'Sound Healing'),
  ('Recover', 'Sports Recovery'),
  ('Recover', 'Sports Rehabilitation'),
  ('Recover', 'Vestibular Rehabilitation Therapy'),
  ('Recover', 'Vestibular Therapy'),

  ('Regenerate', 'Exosome therapy'),
  ('Regenerate', 'Peptide therapy'),
  ('Regenerate', 'PRP therapy'),
  ('Regenerate', 'Stem cell therapy'),

  ('Rejuvenate', 'Aesthetic medicine'),
  ('Rejuvenate', 'Anti Aging'),
  ('Rejuvenate', 'Body contouring'),
  ('Rejuvenate', 'Botox'),
  ('Rejuvenate', 'Cellulite Reduction'),
  ('Rejuvenate', 'Chemical peel'),
  ('Rejuvenate', 'Coolpeel'),
  ('Rejuvenate', 'Dermal fillers'),
  ('Rejuvenate', 'Emtone®'),
  ('Rejuvenate', 'Hair restoration'),
  ('Rejuvenate', 'Hyaluronic Acid Injections'),
  ('Rejuvenate', 'Hydrafacial'),
  ('Rejuvenate', 'Ipl Photofacial'),
  ('Rejuvenate', 'Laser hair removal'),
  ('Rejuvenate', 'Laser Skin Rejuvenation'),
  ('Rejuvenate', 'Laser skin resurfacing'),
  ('Rejuvenate', 'Laser tattoo removal'),
  ('Rejuvenate', 'Med spa'),
  ('Rejuvenate', 'Microcurrent therapy'),
  ('Rejuvenate', 'Microneedling'),
  ('Rejuvenate', 'Permanent Makeup'),
  ('Rejuvenate', 'Skin Care'),
  ('Rejuvenate', 'Skin tightening'),
  ('Rejuvenate', 'Skinvive'),
  ('Rejuvenate', 'Vampire Facial');

DO $validation$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM treatment_category_reorganization mapping
    LEFT JOIN fountain.treatments treatment
      ON treatment.canonical_name = mapping.canonical_name
    WHERE treatment.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Treatment category mapping contains names not found in fountain.treatments';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain.treatments treatment
    LEFT JOIN treatment_category_reorganization mapping
      ON mapping.canonical_name = treatment.canonical_name
    WHERE mapping.canonical_name IS NULL
  ) THEN
    RAISE EXCEPTION 'Treatment category mapping does not cover every treatment';
  END IF;
END
$validation$;

UPDATE fountain.treatments treatment
SET category = mapping.category
FROM treatment_category_reorganization mapping
WHERE treatment.canonical_name = mapping.canonical_name
  AND treatment.category IS DISTINCT FROM mapping.category;

COMMIT;
