-- Add currently orderable diagnostics from the AgingBiotech directory after
-- re-verifying each product, price, fulfillment model, and direct product URL
-- against the provider's official site on 2026-08-10.
--
-- The source spreadsheet is mostly dated 2021-2023. Discontinued products,
-- broken order pages, generic self-calculators, and products already represented
-- in Fountain are intentionally excluded from this migration.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'add_agingbiotech_diagnostic_tests_20260810'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations
    WHERE id = 1387
      AND org_id = 894
      AND name = 'TruDiagnostic'
      AND slug = 'trudiagnostic'
      AND status = 'active'
      AND deleted_at IS NULL
      AND owner_account_id IS NULL
  ) THEN
    RAISE EXCEPTION 'TruDiagnostic location identity or ownership drifted';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.offerings
    WHERE id = 107237
      AND location_id = 1387
      AND raw_name = 'TruAge™ Test'
      AND status = 'active'
      AND deleted_at IS NULL
      AND owner_account_id IS NULL
  ) THEN
    RAISE EXCEPTION 'TruDiagnostic TruAge offering identity or ownership drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM fountain_ops.field_status
    WHERE (
      (entity_type = 'location' AND entity_id = 1387
        AND field IN ('name', 'website', 'locality', 'region', 'country_code', 'country_name', 'is_virtual'))
      OR
      (entity_type = 'offering' AND entity_id = 107237
        AND field IN ('raw_name', 'description', 'source_offer_url', 'price', 'treatment_id'))
    )
      AND (locked OR verification IN ('human_verified', 'owner_verified'))
  ) THEN
    RAISE EXCEPTION 'A protected TruDiagnostic field cannot be changed';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS fountain_raw.agingbiotech_diagnostics_trudiagnostic_location_backup_20260810 AS
SELECT *, now() AS backed_up_at
FROM fountain.locations
WHERE id = 1387;

CREATE TABLE IF NOT EXISTS fountain_raw.agingbiotech_diagnostics_trudiagnostic_offering_backup_20260810 AS
SELECT *, now() AS backed_up_at
FROM fountain.offerings
WHERE id = 107237;

CREATE TABLE IF NOT EXISTS fountain_raw.agingbiotech_diagnostics_trudiagnostic_field_status_backup_20260810 AS
SELECT *, now() AS backed_up_at
FROM fountain_ops.field_status
WHERE (entity_type = 'location' AND entity_id = 1387)
   OR (entity_type = 'offering' AND entity_id = 107237);

INSERT INTO fountain.sources (slug, trust_weight, offering_granularity)
VALUES ('agingbiotech_diagnostics_official_refresh_20260810', 1, 'menu_item')
ON CONFLICT (slug) DO UPDATE
SET trust_weight = EXCLUDED.trust_weight,
    offering_granularity = EXCLUDED.offering_granularity;

CREATE TEMP TABLE agingbiotech_diagnostic_providers_20260810 (
  canonical_name text PRIMARY KEY,
  name_normalized text NOT NULL,
  website_domain text NOT NULL UNIQUE,
  description text NOT NULL,
  dedup_key text NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO agingbiotech_diagnostic_providers_20260810 (
  canonical_name, name_normalized, website_domain, description, dedup_key
)
VALUES
  ('Elysium Health', 'elysium health', 'elysiumhealth.com', 'Consumer health company offering an at-home saliva-based epigenetic biological-age test.', 'elysiumhealth.com'),
  ('myDNAge', 'mydnage', 'mydnage.com', 'Epigenetic testing service that estimates biological age from DNA methylation in a small at-home blood sample.', 'mydnage.com'),
  ('TruMe Labs', 'trume labs', 'trumelabs.com', 'At-home DNA methylation testing company offering saliva-based biological-age analysis.', 'trumelabs.com'),
  ('Prosper', 'prosper', 'liveprosperstrong.com', 'At-home epigenetic testing program pairing DNA methylation results with personalized lifestyle recommendations.', 'liveprosperstrong.com'),
  ('AgeMeter', 'agemeter', 'agemeter.com', 'Provider-oriented software platform for repeated, non-invasive functional biological-age assessments.', 'agemeter.com'),
  ('GlycanAge', 'glycanage', 'glycanage.com', 'At-home biological-age testing service that analyzes immunoglobulin G glycan patterns associated with chronic inflammation.', 'glycanage.com'),
  ('KlothoYears', 'klothoyears', 'klothoyears.com', 'Blood-testing service that measures soluble alpha-Klotho and compares the result with age-based reference data.', 'klothoyears.com'),
  ('Edifice Health', 'edifice health', 'edificehealth.com', 'Inflammatory-age testing company built on research from the Stanford 1,000 Immunomes Project.', 'edificehealth.com'),
  ('Jinfiniti', 'jinfiniti', 'jinfiniti.com', 'CLIA-certified longevity laboratory offering at-home and mobile-collection biomarker tests.', 'jinfiniti.com'),
  ('C2N Diagnostics', 'c2n diagnostics', 'precivityad.com', 'Specialty brain-health diagnostics company offering clinician-ordered blood tests that aid Alzheimer''s disease evaluation.', 'precivityad.com'),
  ('Private MD Labs', 'private md labs', 'privatemdlabs.com', 'Direct-access laboratory ordering service that includes a remote physician order and collection through a national lab network.', 'privatemdlabs.com'),
  ('GRAIL', 'grail', 'galleri.com', 'Healthcare company offering the Galleri multi-cancer early-detection blood test for eligible adults.', 'galleri.com'),
  ('Life Length', 'life length', 'lifelength.com', 'CLIA- and ISO-certified laboratory specializing in single-cell telomere and cellular-aging biomarkers.', 'lifelength.com'),
  ('Q Bio', 'q bio', 'q.bio', 'Health-technology company combining whole-body MRI, biomarkers, genetics, wearable data, and physician review in a comprehensive in-clinic exam.', 'q.bio');

INSERT INTO fountain.organizations (
  canonical_name,
  name_normalized,
  website_domain,
  description,
  dedup_key,
  status,
  data_origin,
  verification_status
)
SELECT
  provider.canonical_name,
  provider.name_normalized,
  provider.website_domain,
  provider.description,
  provider.dedup_key,
  'active',
  'manual',
  'agent_verified'
FROM agingbiotech_diagnostic_providers_20260810 provider
WHERE NOT EXISTS (
  SELECT 1
  FROM fountain.organizations existing
  WHERE existing.deleted_at IS NULL
    AND (
      lower(existing.canonical_name) = lower(provider.canonical_name)
      OR lower(coalesce(existing.website_domain, '')) = lower(provider.website_domain)
      OR existing.dedup_key = provider.dedup_key
    )
);

CREATE TEMP TABLE agingbiotech_diagnostic_listings_20260810 (
  provider_name text NOT NULL,
  listing_name text NOT NULL,
  slug text PRIMARY KEY,
  address text,
  locality text,
  region text,
  postal_code text,
  country_code text,
  country_name text,
  latitude double precision,
  longitude double precision,
  website text NOT NULL,
  dedup_key text NOT NULL UNIQUE,
  is_virtual boolean NOT NULL,
  treatment_id integer,
  offering_name text NOT NULL,
  description text NOT NULL,
  price_type text NOT NULL,
  price_amount double precision,
  price_max_amount double precision,
  price_currency text,
  price_unit text,
  price_context text NOT NULL,
  price_audience text NOT NULL,
  duration_minutes integer,
  source_offer_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO agingbiotech_diagnostic_listings_20260810 (
  provider_name, listing_name, slug, address, locality, region, postal_code,
  country_code, country_name, latitude, longitude, website, dedup_key,
  is_virtual, treatment_id, offering_name, description, price_type,
  price_amount, price_max_amount, price_currency, price_unit, price_context,
  price_audience, duration_minutes, source_offer_url
)
VALUES
  (
    'Elysium Health', 'Elysium Health — Index Biological Age Test',
    'elysium-index-biological-age-test', NULL, NULL, NULL, NULL, 'US',
    'United States', NULL, NULL,
    'https://www.elysiumhealth.com/products/index',
    'elysiumhealth.com|virtual|index', true, 5, 'Index Biological Age Test',
    'An at-home saliva test that analyzes DNA methylation to estimate overall biological age, cumulative pace of aging, and biological ages for nine systems: brain, heart, metabolic, immune, inflammation, kidney, liver, hormone, and blood. The report also includes more than 100 research-based lifestyle recommendations; results are typically released about six weeks after the laboratory receives the sample.',
    'exact', 299, NULL, 'USD', 'package',
    'One at-home collection kit and laboratory analysis.', 'retail', NULL,
    'https://www.elysiumhealth.com/products/index'
  ),
  (
    'myDNAge', 'myDNAge — Blood Biological Age Test',
    'mydnage-blood-biological-age-test', NULL, NULL, NULL, NULL, 'US',
    'United States', NULL, NULL,
    'https://www.mydnage.com/products/blood',
    'mydnage.com|virtual|blood-biological-age-test', true, 5,
    'Blood Biological Age Test',
    'A lancet-based at-home test requiring two to three drops of blood. myDNAge uses its SWARM method to analyze DNA methylation at more than 2,000 genomic loci and estimate epigenetic age using a method based on the Horvath clock; the emailed report is generally available four to six weeks after sample return and can be compared with future tests.',
    'exact', 299, NULL, 'USD', 'package',
    'One blood collection kit, return shipping, analysis, and digital report.',
    'retail', NULL, 'https://www.mydnage.com/products/blood'
  ),
  (
    'TruMe Labs', 'TruMe Labs — TruAge Explorer',
    'trume-labs-truage-explorer', NULL, NULL, NULL, NULL, 'US',
    'United States', NULL, NULL,
    'https://shop.trumelabs.com/products/truage-explorer-test',
    'trumelabs.com|virtual|truage-explorer', true, 5,
    'TruAge Explorer Biological Age DNA Test',
    'A non-invasive at-home saliva test that estimates biological age by analyzing DNA methylation across selected loci. The result is intended as an informational aging biomarker that can be repeated to monitor change over time, rather than as a disease diagnostic.',
    'exact', 149, NULL, 'USD', 'package',
    'One saliva collection kit and biological-age analysis; shipping is calculated at checkout.',
    'retail', NULL,
    'https://shop.trumelabs.com/products/truage-explorer-test'
  ),
  (
    'Prosper', 'Prosper — Epigenetics Kit and Lifestyle Program',
    'prosper-epigenetics-kit-lifestyle-program', NULL, NULL, NULL, NULL,
    'US', 'United States', NULL, NULL,
    'https://liveprosperstrong.com/products/epigenetics-kit-and-lifestyle-program-silver-subscription',
    'liveprosperstrong.com|virtual|epigenetics-silver', true, 5,
    'Epigenetics Kit and Lifestyle Program — Silver',
    'An annual at-home epigenetic test paired with personalized recommendations covering nutrition, fitness, mindfulness, environmental exposures, and aging. The user collects the supplied specimen, returns it in the prepaid envelope, and receives the report online approximately six to eight weeks later.',
    'exact', 149.99, NULL, 'USD', 'package',
    'Annual Silver subscription including one test per year and personalized recommendations.',
    'retail', NULL,
    'https://liveprosperstrong.com/products/epigenetics-kit-and-lifestyle-program-silver-subscription'
  ),
  (
    'AgeMeter', 'AgeMeter — Functional Biological Age Platform',
    'agemeter-functional-biological-age-platform', NULL, NULL, NULL, NULL,
    'US', 'United States', NULL, NULL,
    'https://agemeter.com/products/agemeter-system-and-subscription',
    'agemeter.com|virtual|functional-age-platform', true, NULL,
    'AgeMeter License and Subscription',
    'A provider-oriented, self-guided functional-age assessment delivered on an iPad. A 20- to 30-minute session measures non-invasive sensory, cognitive, and motor performance biomarkers and immediately reports a functional biological-age estimate plus individual results and percentile ranks; the license supports repeated testing for an unlimited number of users.',
    'exact', 3995, NULL, 'USD', 'package',
    'Up-front software license; the official order page also requires a $199 monthly subscription and compatible iPad hardware.',
    'retail', 30,
    'https://agemeter.com/products/agemeter-system-and-subscription'
  ),
  (
    'GlycanAge', 'GlycanAge — Biological Age Test',
    'glycanage-biological-age-test', NULL, NULL, NULL, NULL, 'GB',
    'United Kingdom', NULL, NULL, 'https://glycanage.com/',
    'glycanage.com|virtual|biological-age-test', true, 7,
    'GlycanAge Biological Age Test — One-off',
    'An at-home finger-prick test that analyzes immunoglobulin G glycan patterns associated with chronic inflammation. The report includes a biological-age estimate, glycan indexes related to inflammatory activity and immune protection, personalized health insights, and a one-to-one interpretation call; results are usually available in three to four weeks.',
    'exact', 379, NULL, 'GBP', 'package',
    'One-off test including the collection kit, full report, and one-to-one interpretation call.',
    'retail', NULL, 'https://glycanage.com/'
  ),
  (
    'KlothoYears', 'KlothoYears — Klotho Test',
    'klothoyears-klotho-test', NULL, NULL, NULL, NULL, 'US',
    'United States', NULL, NULL,
    'https://klothoyears.com/product/klotho-test/',
    'klothoyears.com|virtual|klotho-test', true, 7,
    'Klotho Test — Individual',
    'A serum blood test that measures soluble alpha-Klotho by ELISA and compares the result with age-based reference data. The kit is ordered online, but collection requires a venous blood draw through a mobile phlebotomist or participating laboratory; the result is informational and is not intended to diagnose or treat a condition.',
    'exact', 1059, NULL, 'USD', 'package',
    'Test kit and laboratory analysis only. The provider says shipping and third-party blood-draw charges are additional, commonly about $60–$140 for collection.',
    'retail', NULL, 'https://klothoyears.com/product/klotho-test/'
  ),
  (
    'Edifice Health', 'Edifice Health — iAge Inflammatory Age Test',
    'edifice-health-iage-inflammatory-age-test', NULL, NULL, NULL, NULL,
    'US', 'United States', NULL, NULL, 'https://edificehealthstore.com/',
    'edificehealth.com|virtual|iage-test', true, 7,
    'iAge Inflammatory Age Test',
    'A CLIA-certified at-home blood test that uses an upper-arm capillary collection device to quantify proteins associated with systemic chronic inflammation. The report includes an inflammatory-age score, biomarker concentrations and peer-cohort comparisons, a secure dashboard, and personalized lifestyle recommendations; collection takes about five minutes and results are typically available in about two weeks.',
    'exact', 299, NULL, 'USD', 'package',
    'Early-access baseline package with one collection device, one laboratory analysis, an individualized report, and shipping.',
    'retail', 5, 'https://edificehealthstore.com/'
  ),
  (
    'Jinfiniti', 'Jinfiniti — AgingSOS Advanced Longevity Panel',
    'jinfiniti-agingsos-advanced-longevity-panel', NULL, NULL, NULL, NULL,
    'US', 'United States', NULL, NULL,
    'https://www.jinfiniti.com/product/agingsos-advanced-panel/',
    'jinfiniti.com|virtual|agingsos-advanced-panel', true, 7,
    'AgingSOS Advanced Longevity Panel',
    'A 28-biomarker longevity panel covering cellular aging, inflammation, oxidative stress, metabolism, and cardiovascular risk. It includes less-common markers such as circulating NAD+, soluble alpha-Klotho, and senescence-associated beta-galactosidase, with a personalized report and expert consultation; collection can be arranged at home through mobile phlebotomy or at a nearby laboratory.',
    'starting_at', 1198, NULL, 'USD', 'package',
    'Starting price for one Advanced panel; mobile blood-draw availability and any collection charge depend on location.',
    'retail', NULL,
    'https://www.jinfiniti.com/product/agingsos-advanced-panel/'
  ),
  (
    'Jinfiniti', 'Jinfiniti — Intracellular NAD Test',
    'jinfiniti-intracellular-nad-test', NULL, NULL, NULL, NULL, 'US',
    'United States', NULL, NULL,
    'https://www.jinfiniti.com/product/intracellular-nad-test/',
    'jinfiniti.com|virtual|intracellular-nad-test', true, 7,
    'Intracellular NAD Test',
    'A CLIA-certified at-home finger-prick test that measures NAD+ inside blood cells. The kit includes a stabilizing buffer and prepaid return shipping; the report provides the measured intracellular NAD+ concentration, an interpretation, and dosing guidance for people monitoring an NAD+ supplementation protocol, with results generally delivered in about one week.',
    'starting_at', 198, NULL, 'USD', 'package',
    'Starting price for one at-home finger-prick kit, laboratory measurement, and personalized result.',
    'retail', NULL,
    'https://www.jinfiniti.com/product/intracellular-nad-test/'
  ),
  (
    'C2N Diagnostics', 'C2N Diagnostics — PrecivityAD2',
    'c2n-diagnostics-precivityad2', NULL, NULL, NULL, NULL, 'US',
    'United States', NULL, NULL,
    'https://precivityad.com/precivityad2-patients',
    'precivityad.com|virtual|precivityad2', true, 7,
    'PrecivityAD2 Blood Test',
    'A clinician-ordered blood test for patients being evaluated for cognitive decline or dementia. It measures amyloid-beta 42/40 and phosphorylated/non-phosphorylated tau 217 peptide ratios and combines them into the Amyloid Probability Score 2, which reports a positive or negative likelihood of brain amyloid plaques; results go to the ordering healthcare provider for interpretation.',
    'on_request', NULL, NULL, NULL, NULL,
    'C2N does not publish a fixed self-pay price. Insurance billing, payment plans, and need-based financial assistance may apply; an authorized healthcare provider must order the test.',
    'retail', NULL, 'https://precivityad.com/precivityad2-patients'
  ),
  (
    'Private MD Labs', 'Private MD Labs — CMV IgG Antibody Test',
    'private-md-labs-cmv-igg-antibody-test', NULL, NULL, NULL, NULL, 'US',
    'United States', NULL, NULL,
    'https://www.privatemdlabs.com/product/cytomegalovirus-cmv-antibodies-igg',
    'privatemdlabs.com|virtual|cmv-igg', true, 7,
    'Cytomegalovirus (CMV) Antibodies, IgG',
    'A direct-access venous blood test for CMV IgG antibodies, which indicate prior exposure to cytomegalovirus. The online price includes the remote physician order, laboratory fees, a standard report, and plain-language doctor notes; after ordering, the customer visits a participating collection site rather than collecting the sample at home.',
    'exact', 80, NULL, 'USD', 'package',
    'Self-pay price including the physician order and laboratory fees; insurance is not billed.',
    'retail', NULL,
    'https://www.privatemdlabs.com/product/cytomegalovirus-cmv-antibodies-igg'
  ),
  (
    'Private MD Labs', 'Private MD Labs — Toxoplasma IgG Antibody Test',
    'private-md-labs-toxoplasma-igg-antibody-test', NULL, NULL, NULL, NULL,
    'US', 'United States', NULL, NULL,
    'https://www.privatemdlabs.com/product/toxoplasma-antibody-igg',
    'privatemdlabs.com|virtual|toxoplasma-igg', true, 7,
    'Toxoplasma Antibody (IgG)',
    'A direct-access venous blood test that checks for IgG antibodies to Toxoplasma gondii, indicating previous exposure and immune response to the parasite. The order is generated online by a licensed physician and the sample is collected at a participating laboratory; results include the standard lab report and an explanatory clinical note.',
    'exact', 80, NULL, 'USD', 'package',
    'Self-pay price including the physician order and laboratory fees; insurance is not billed.',
    'retail', NULL,
    'https://www.privatemdlabs.com/product/toxoplasma-antibody-igg'
  ),
  (
    'GRAIL', 'GRAIL — Galleri Multi-Cancer Early Detection Test',
    'grail-galleri-multi-cancer-early-detection-test', NULL, NULL, NULL,
    NULL, 'US', 'United States', NULL, NULL,
    'https://www.galleri.com/get-started/patients',
    'galleri.com|virtual|galleri', true, 10,
    'Galleri Multi-Cancer Early Detection Test',
    'A prescription blood test recommended for adults at elevated cancer risk, such as people age 50 or older. It analyzes cell-free DNA methylation patterns for a cancer signal shared across many cancer types and predicts the likely tissue of origin when a signal is detected; it is used alongside, not instead of, guideline-recommended screening, and positive results require diagnostic follow-up.',
    'range', 799, 949, 'USD', 'package',
    'Published patient self-pay pricing ranges from $799 through many ordering providers to the $949 list price. Collection is included when a GRAIL-contracted laboratory partner is used.',
    'retail', NULL, 'https://www.galleri.com/get-started/patients'
  ),
  (
    'Life Length', 'Life Length — HealthTAV Telomere Test',
    'life-length-healthtav-telomere-test', NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    'https://lifelength.com/healthtav-telomere-testing-for-healthy-aging/',
    'lifelength.com|virtual|healthtav', true, 13,
    'HealthTAV Telomere Test',
    'A whole-blood telomere analysis using Life Length''s high-throughput quantitative FISH platform to measure telomeres at single-cell and chromosome-level resolution. The clinical-style report includes median and average telomere length, the 20th-percentile short-telomere measure, and the burden of critically short telomeres, creating a baseline that can be repeated to track change over time; collection requires an approximately 8 mL EDTA blood draw.',
    'on_request', NULL, NULL, NULL, NULL,
    'Life Length does not publish a current consumer price on the official HealthTAV page; contact the provider or an authorized clinic for current availability and pricing.',
    'retail', NULL,
    'https://lifelength.com/healthtav-telomere-testing-for-healthy-aging/'
  ),
  (
    'Q Bio', 'Q Bio — Q Exam', 'q-bio-q-exam-redwood-city',
    '410 Brewster Avenue', 'Redwood City', 'CA', '94063', 'US',
    'United States', 37.4922354, -122.2299017,
    'https://q.bio/q-exam', 'q.bio|redwood-city|ca|94063', false, 16,
    'Q Exam',
    'An in-clinic comprehensive baseline combining a non-contrast whole-body MRI with more than 120 blood and urine biomarkers, analysis of 163 clinically actionable genes, wearable data, board-certified radiologist review, and physician review. The exam itself takes about 75 minutes, with roughly 90 minutes on site; results are generally available in two to three weeks and include a 45-minute physician data-review session.',
    'exact', 3495, NULL, 'USD', 'package',
    'Annual member fee covering the exam, all five clinical inputs, and the physician data review. Insurance is not accepted directly; HSA/FSA reimbursement may be available.',
    'retail', 75, 'https://q.bio/q-exam'
  );

DO $$
BEGIN
  IF (SELECT count(*) FROM agingbiotech_diagnostic_listings_20260810) <> 16 THEN
    RAISE EXCEPTION 'Expected exactly 16 new verified diagnostic listings';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agingbiotech_diagnostic_listings_20260810 candidate
    JOIN fountain.locations existing
      ON existing.deleted_at IS NULL
     AND (
       existing.slug = candidate.slug
       OR existing.dedup_key = candidate.dedup_key
     )
  ) THEN
    RAISE EXCEPTION 'A candidate diagnostic listing already exists';
  END IF;

  IF (SELECT count(*)
      FROM agingbiotech_diagnostic_providers_20260810 provider
      JOIN fountain.organizations organization
        ON organization.dedup_key = provider.dedup_key
       AND organization.status = 'active'
       AND organization.deleted_at IS NULL) <> 14 THEN
    RAISE EXCEPTION 'Diagnostic provider organization resolution failed';
  END IF;
END;
$$;

INSERT INTO fountain.locations (
  org_id,
  name,
  slug,
  address,
  locality,
  region,
  postal_code,
  country_code,
  country_name,
  latitude,
  longitude,
  website,
  dedup_key,
  is_virtual,
  status,
  data_origin,
  verification_status
)
SELECT
  organization.id,
  candidate.listing_name,
  candidate.slug,
  candidate.address,
  candidate.locality,
  candidate.region,
  candidate.postal_code,
  candidate.country_code,
  candidate.country_name,
  candidate.latitude,
  candidate.longitude,
  candidate.website,
  candidate.dedup_key,
  candidate.is_virtual,
  'active',
  'manual',
  'agent_verified'
FROM agingbiotech_diagnostic_listings_20260810 candidate
JOIN fountain.organizations organization
  ON organization.dedup_key = (
    SELECT provider.dedup_key
    FROM agingbiotech_diagnostic_providers_20260810 provider
    WHERE provider.canonical_name = candidate.provider_name
  );

CREATE TEMP TABLE agingbiotech_diagnostic_location_ids_20260810 (
  location_id integer PRIMARY KEY,
  slug text NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO agingbiotech_diagnostic_location_ids_20260810 (location_id, slug)
SELECT location.id, location.slug
FROM fountain.locations location
JOIN agingbiotech_diagnostic_listings_20260810 candidate
  ON candidate.dedup_key = location.dedup_key
WHERE location.status = 'active'
  AND location.deleted_at IS NULL;

INSERT INTO fountain.offerings (
  location_id,
  treatment_id,
  raw_name,
  description,
  source_offer_url,
  source_id,
  price_type,
  price_amount,
  price_max_amount,
  price_currency,
  price_unit,
  price_context,
  price_audience,
  duration_minutes,
  status,
  data_origin,
  verification_status
)
SELECT
  location.id,
  candidate.treatment_id,
  candidate.offering_name,
  candidate.description,
  candidate.source_offer_url,
  source.id,
  candidate.price_type,
  candidate.price_amount,
  candidate.price_max_amount,
  candidate.price_currency,
  candidate.price_unit,
  candidate.price_context,
  candidate.price_audience,
  candidate.duration_minutes,
  'active',
  'manual',
  'agent_verified'
FROM agingbiotech_diagnostic_listings_20260810 candidate
JOIN fountain.locations location
  ON location.dedup_key = candidate.dedup_key
JOIN fountain.sources source
  ON source.slug = 'agingbiotech_diagnostics_official_refresh_20260810';

UPDATE fountain.locations
SET name = 'TruDiagnostic — TruAge Test',
    locality = NULL,
    region = NULL,
    country_code = 'US',
    country_name = 'United States',
    website = 'https://shop.trudiagnostic.com/products/truage-complete-epigenetic-collection',
    is_virtual = true,
    data_origin = 'manual',
    verification_status = 'agent_verified',
    updated_at = now()
WHERE id = 1387;

UPDATE fountain.offerings
SET treatment_id = 5,
    description = 'An at-home finger-prick epigenetic test that analyzes more than 100,000 DNA methylation markers. The report includes OMICmAge biological age, DunedinPACE rate of aging, biological ages for 11 organ systems, telomere length, immune-cell and inflammation estimates, and lifestyle-impact measures; results are generally available two to three weeks after the sample reaches the laboratory.',
    source_offer_url = 'https://shop.trudiagnostic.com/products/truage-complete-epigenetic-collection',
    source_id = (
      SELECT id FROM fountain.sources
      WHERE slug = 'agingbiotech_diagnostics_official_refresh_20260810'
    ),
    price_type = 'exact',
    price_amount = 499,
    price_max_amount = NULL,
    price_currency = 'USD',
    price_unit = 'package',
    price_context = 'One-time purchase for one at-home collection kit, laboratory analysis, and digital report.',
    price_audience = 'retail',
    data_origin = 'manual',
    verification_status = 'agent_verified',
    updated_at = now()
WHERE id = 107237;

INSERT INTO fountain.source_records (
  source_id, entity_type, entity_id, source_url, raw_ref
)
SELECT
  source.id,
  'location',
  location.id,
  candidate.source_offer_url,
  'agingbiotech-diagnostics:' || candidate.slug
FROM agingbiotech_diagnostic_listings_20260810 candidate
JOIN fountain.locations location ON location.dedup_key = candidate.dedup_key
JOIN fountain.sources source
  ON source.slug = 'agingbiotech_diagnostics_official_refresh_20260810'
UNION ALL
SELECT
  source.id,
  'offering',
  offering.id,
  candidate.source_offer_url,
  'agingbiotech-diagnostics:' || candidate.slug || ':offering'
FROM agingbiotech_diagnostic_listings_20260810 candidate
JOIN fountain.locations location ON location.dedup_key = candidate.dedup_key
JOIN fountain.offerings offering
  ON offering.location_id = location.id
 AND offering.raw_name = candidate.offering_name
 AND offering.deleted_at IS NULL
JOIN fountain.sources source
  ON source.slug = 'agingbiotech_diagnostics_official_refresh_20260810'
UNION ALL
SELECT
  source.id,
  'location',
  1387,
  'https://shop.trudiagnostic.com/products/truage-complete-epigenetic-collection',
  'agingbiotech-diagnostics:trudiagnostic-truage'
FROM fountain.sources source
WHERE source.slug = 'agingbiotech_diagnostics_official_refresh_20260810'
UNION ALL
SELECT
  source.id,
  'offering',
  107237,
  'https://shop.trudiagnostic.com/products/truage-complete-epigenetic-collection',
  'agingbiotech-diagnostics:trudiagnostic-truage:offering'
FROM fountain.sources source
WHERE source.slug = 'agingbiotech_diagnostics_official_refresh_20260810';

INSERT INTO fountain_ops.field_status (
  entity_type,
  entity_id,
  field,
  verification,
  locked,
  verified_by,
  verified_at,
  source_note
)
SELECT
  'organization',
  organization.id,
  field,
  'agent_verified',
  false,
  'add_agingbiotech_diagnostic_tests_20260810',
  now(),
  'Provider identity and description verified from the official product page on 2026-08-10; candidate discovered via https://agingbiotech.info/diagnostics/.'
FROM agingbiotech_diagnostic_providers_20260810 provider
JOIN fountain.organizations organization
  ON organization.dedup_key = provider.dedup_key
CROSS JOIN unnest(ARRAY[
  'canonical_name', 'name_normalized', 'website_domain', 'description', 'dedup_key'
]) AS fields(field)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = EXCLUDED.locked,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

INSERT INTO fountain_ops.field_status (
  entity_type,
  entity_id,
  field,
  verification,
  locked,
  verified_by,
  verified_at,
  source_note
)
SELECT
  'location',
  location.id,
  field,
  'agent_verified',
  false,
  'add_agingbiotech_diagnostic_tests_20260810',
  now(),
  'Official product page reviewed 2026-08-10: ' || candidate.source_offer_url
FROM agingbiotech_diagnostic_listings_20260810 candidate
JOIN fountain.locations location ON location.dedup_key = candidate.dedup_key
CROSS JOIN unnest(ARRAY[
  'identity', 'name', 'website', 'country_code', 'country_name', 'is_virtual',
  'address', 'locality', 'region', 'postal_code', 'latitude', 'longitude',
  'offerings'
]) AS fields(field)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = EXCLUDED.locked,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

INSERT INTO fountain_ops.field_status (
  entity_type,
  entity_id,
  field,
  verification,
  locked,
  verified_by,
  verified_at,
  source_note
)
SELECT
  'offering',
  offering.id,
  field,
  'agent_verified',
  false,
  'add_agingbiotech_diagnostic_tests_20260810',
  now(),
  CASE field
    WHEN 'price' THEN candidate.price_context || ' Official product page reviewed 2026-08-10: ' || candidate.source_offer_url
    ELSE 'Official product page reviewed 2026-08-10: ' || candidate.source_offer_url
  END
FROM agingbiotech_diagnostic_listings_20260810 candidate
JOIN fountain.locations location ON location.dedup_key = candidate.dedup_key
JOIN fountain.offerings offering
  ON offering.location_id = location.id
 AND offering.raw_name = candidate.offering_name
 AND offering.deleted_at IS NULL
CROSS JOIN unnest(ARRAY[
  'raw_name', 'description', 'source_offer_url', 'price', 'duration_minutes',
  'treatment_id'
]) AS fields(field)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = EXCLUDED.locked,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked, verified_by,
  verified_at, source_note
)
SELECT
  'location', 1387, field, 'agent_verified', false,
  'add_agingbiotech_diagnostic_tests_20260810', now(),
  'Official TruAge product page reviewed 2026-08-10: https://shop.trudiagnostic.com/products/truage-complete-epigenetic-collection'
FROM unnest(ARRAY[
  'identity', 'name', 'website', 'locality', 'region', 'country_code',
  'country_name', 'is_virtual', 'offerings'
]) AS fields(field)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = EXCLUDED.locked,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

INSERT INTO fountain_ops.field_status (
  entity_type, entity_id, field, verification, locked, verified_by,
  verified_at, source_note
)
SELECT
  'offering', 107237, field, 'agent_verified', false,
  'add_agingbiotech_diagnostic_tests_20260810', now(),
  'Official TruAge product page reviewed 2026-08-10: https://shop.trudiagnostic.com/products/truage-complete-epigenetic-collection'
FROM unnest(ARRAY[
  'raw_name', 'description', 'source_offer_url', 'price', 'treatment_id'
]) AS fields(field)
ON CONFLICT (entity_type, entity_id, field) DO UPDATE
SET verification = EXCLUDED.verification,
    locked = EXCLUDED.locked,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

SELECT fountain.refresh_search_index_for_location(location_id)
FROM agingbiotech_diagnostic_location_ids_20260810;

SELECT fountain.refresh_search_index_for_location(1387);
SELECT fountain.refresh_city_index();

DO $$
BEGIN
  IF (SELECT count(*) FROM agingbiotech_diagnostic_location_ids_20260810) <> 16 THEN
    RAISE EXCEPTION 'Diagnostic location insertion failed';
  END IF;

  IF (SELECT count(*)
      FROM agingbiotech_diagnostic_listings_20260810 candidate
      JOIN fountain.locations location ON location.dedup_key = candidate.dedup_key
      JOIN fountain.offerings offering
        ON offering.location_id = location.id
       AND offering.raw_name = candidate.offering_name
      WHERE location.status = 'active'
        AND location.deleted_at IS NULL
        AND offering.status = 'active'
        AND offering.deleted_at IS NULL
        AND location.website = candidate.source_offer_url
        AND offering.source_offer_url = candidate.source_offer_url
        AND length(offering.description) >= 180
        AND offering.price_type = candidate.price_type
        AND offering.price_amount IS NOT DISTINCT FROM candidate.price_amount
        AND offering.price_max_amount IS NOT DISTINCT FROM candidate.price_max_amount
        AND offering.price_currency IS NOT DISTINCT FROM candidate.price_currency
        AND offering.price_context = candidate.price_context) <> 16 THEN
    RAISE EXCEPTION 'Diagnostic offering content, pricing, or direct URLs failed verification';
  END IF;

  IF (SELECT count(*)
      FROM fountain.locations location
      JOIN agingbiotech_diagnostic_listings_20260810 candidate
        ON candidate.dedup_key = location.dedup_key
      WHERE location.is_virtual) <> 15 THEN
    RAISE EXCEPTION 'Expected 15 virtual diagnostics and one physical Q Bio location';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM fountain.locations location
    JOIN fountain.offerings offering ON offering.location_id = location.id
    WHERE location.id = 1387
      AND location.name = 'TruDiagnostic — TruAge Test'
      AND location.website = 'https://shop.trudiagnostic.com/products/truage-complete-epigenetic-collection'
      AND location.is_virtual
      AND location.country_code = 'US'
      AND offering.id = 107237
      AND offering.treatment_id = 5
      AND offering.price_type = 'exact'
      AND offering.price_amount = 499
      AND offering.price_currency = 'USD'
      AND offering.source_offer_url = location.website
      AND length(offering.description) >= 180
  ) THEN
    RAISE EXCEPTION 'TruDiagnostic enrichment failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM agingbiotech_diagnostic_listings_20260810 candidate
    WHERE candidate.price_amount IS NULL
      AND (candidate.price_type <> 'on_request' OR candidate.price_context = '')
  ) THEN
    RAISE EXCEPTION 'A diagnostic listing lacks usable price semantics';
  END IF;

  IF (SELECT count(*)
      FROM fountain.source_records record
      JOIN fountain.sources source ON source.id = record.source_id
      WHERE source.slug = 'agingbiotech_diagnostics_official_refresh_20260810'
        AND record.raw_ref LIKE 'agingbiotech-diagnostics:%') <> 34 THEN
    RAISE EXCEPTION 'Diagnostic source provenance is incomplete';
  END IF;
END;
$$;

COMMIT;
