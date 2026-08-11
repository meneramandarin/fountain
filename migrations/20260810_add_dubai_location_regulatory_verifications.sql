-- Facility-level regulatory evidence for Dubai listings.
--
-- DHA and MOHAP evidence are intentionally separate:
--   * DHA rows are primary-source matches in the Dubai Medical Registry. DHA
--     describes that registry as covering facilities with an active licence.
--   * MOHAP rows record a health-advertisement licence number displayed on the
--     facility's official website. They are not facility licences and are not
--     represented as independently verified in the absence of a public lookup.

BEGIN;

CREATE TABLE IF NOT EXISTS fountain.location_regulatory_verifications (
  id bigserial PRIMARY KEY,
  location_id integer NOT NULL REFERENCES fountain.locations(id) ON DELETE CASCADE,
  authority_code text NOT NULL,
  verification_kind text NOT NULL,
  credential_number text NOT NULL,
  credential_status text NOT NULL,
  authority_name text NOT NULL,
  evidence_level text NOT NULL,
  source_url text NOT NULL,
  verified_at timestamptz NOT NULL,
  next_review_at timestamptz NOT NULL,
  verification_status text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_regulatory_verifications_authority_check
    CHECK (authority_code IN ('DHA', 'MOHAP')),
  CONSTRAINT location_regulatory_verifications_kind_check
    CHECK (verification_kind IN ('facility_license', 'health_advertisement_license')),
  CONSTRAINT location_regulatory_verifications_evidence_level_check
    CHECK (evidence_level IN ('regulator_registry', 'first_party_disclosure')),
  CONSTRAINT location_regulatory_verifications_status_check
    CHECK (verification_status IN ('verified', 'disclosed', 'expired', 'revoked')),
  CONSTRAINT location_regulatory_verifications_review_window_check
    CHECK (next_review_at > verified_at),
  CONSTRAINT location_regulatory_verifications_evidence_check
    CHECK (jsonb_typeof(evidence) = 'object'),
  UNIQUE (location_id, authority_code, verification_kind)
);

CREATE INDEX IF NOT EXISTS location_regulatory_verifications_location_current_idx
  ON fountain.location_regulatory_verifications (location_id, authority_code, next_review_at DESC)
  WHERE verification_status IN ('verified', 'disclosed');

WITH dha_matches (
  location_id,
  expected_name,
  credential_number,
  registry_name,
  registry_location,
  match_basis
) AS (
  VALUES
    (2060, 'Next Health Dubai', '3744880', 'NEXT HEALTH WELLNESS AND MEDICAL CENTER L.L.C', 'BUSINESS BAY', 'brand, locality, and official website'),
    (2453, 'Biolite', '0000456', 'BIOLITE CLINIC L.L.C S.O.C', 'UM SUQAIM SECOND', 'distinctive name and official website'),
    (2476, 'Biongevity', '2852524', 'BIONGEVITY PRECISION HEALTH AND LONGEVITY CLINIC L L C', 'AL BARSHA FIRST', 'distinctive name and official website'),
    (2483, 'AEON Clinic', '0937962', 'AEON POLY CLINIC L L C', 'PALM JUMEIRAH', 'distinctive name and official website'),
    (2551, 'Elite Vita', '1198439', 'Elite Vita Polyclinic FZ LLC', 'Dubai Healthcare City', 'distinctive name and official website'),
    (13434, 'AEON Clinic', '0937962', 'AEON POLY CLINIC L L C', 'PALM JUMEIRAH', 'duplicate directory record with the same official website'),
    (13436, 'Biongevity', '2852524', 'BIONGEVITY PRECISION HEALTH AND LONGEVITY CLINIC L L C', 'AL BARSHA FIRST', 'duplicate directory record with the same official website'),
    (13626, 'Novomed — Integrative Medicine & HBOT', '0001035', 'NOVOMED WELLNESS CENTER (BR OF INTELLIGENT HEALTH INVESTMENT L.L.C)', 'UM SUQAIM THIRD', 'official address and Novomed wellness-facility match'),
    (14093, 'Hope Abilitation Medical Center', '0002207', 'Hope Abilitation Medical Center LLC', 'UM SUQAIM FIRST', 'exact name, locality, and official website'),
    (14249, 'Al Zahra Hospital Dubai — HBOT', '0000035', 'Al Zahra Pvt. Hospital', 'AL BARSHA FIRST', 'hospital name and official HBOT page'),
    (14260, 'HMS Mirdif Hospital — HBOT', '4255562', 'MIRDIF PRIVATE HOSPITAL LLC', 'MIRDIF', 'official HMS website, Mirdif hospital address, and listed HBOT specialty'),
    (14326, 'My London Skin Clinic', '3909160', 'MY LONDON SKIN CLINIC LLC', 'UM SUQAIM SECOND', 'official Jumeirah Beach Hotel location'),
    (14412, 'Eden Dermaclinic', '6780875', 'EDEN DERMA CLINIC LLC', 'BUSINESS BAY', 'exact name, locality, official website, and displayed DHA number'),
    (15934, 'Shookra', '3449309', 'SHOOKRA POLY CLINIC L L C S O C', 'BUSINESS BAY', 'registry match and identical displayed DHA permit number'),
    (15945, 'Dynasty Clinic', '7974281', 'Dynasty Clinic', 'AL SAFFA SECOND', 'exact name and locality'),
    (15947, 'Wellth Clinic', '3850910', 'Wellth by Medcare (BR OF MEDCARE HOSPITAL L.L.C)', 'JUMEIRAH FIRST', 'official website and Al Urouba Road A25 address'),
    (16022, 'DRFK Turkish Medical Center', '7154737', 'DRFK TURKISHINTERNATIONAL DAY SURGERY CENTER LLC', 'JUMEIRAH THIRD', 'distinctive legal name and exact locality'),
    (16034, 'UCRYO Wellness', '8422328', 'UCRYO FITNESS CENTER CLUB', 'UM SUQAIM THIRD', 'official RSMB Villas Al Wasl Road address'),
    (16044, 'Avida Longevity', '3498537', 'AVIDA LONGEVITY CLINICAL SUPPORT L.L.C', 'JUMEIRAH THIRD', 'official website and Triple 777 Center address'),
    (16067, 'Kings College Hospital Dubai', '0002536', 'Kings College Hospital London Br Of Kch Healthcare LLC', 'HADAEQ SHEIKH MOHAMMED BIN RASHID', 'official Dubai Hills hospital address'),
    (16096, 'Doctors Clinic Dubai', '8563784', 'Doctors Clinic Diagnostic Centre FZ-LLC', 'Dubai Healthcare City', 'official website and Building 64 address'),
    (16222, 'First Response Healthcare', '0002486', 'First Response Healthcare L.L.C', 'AL BARSHA FIRST', 'exact organization and official website')
)
INSERT INTO fountain.location_regulatory_verifications (
  location_id,
  authority_code,
  verification_kind,
  credential_number,
  credential_status,
  authority_name,
  evidence_level,
  source_url,
  verified_at,
  next_review_at,
  verification_status,
  evidence
)
SELECT
  location.id,
  'DHA',
  'facility_license',
  match.credential_number,
  'Active registry listing',
  'Dubai Health Authority',
  'regulator_registry',
  'https://services.dha.gov.ae/sheryan/wps/portal/home/medical-directory/facility-details?facilityId=' || match.credential_number,
  TIMESTAMPTZ '2026-08-10 18:00:00-07',
  TIMESTAMPTZ '2026-11-08 18:00:00-08',
  'verified',
  jsonb_build_object(
    'registry_name', match.registry_name,
    'registry_location', match.registry_location,
    'match_basis', match.match_basis,
    'registry_scope_source', 'https://www.dha.gov.ae/en/uploads/022022/health_regulation_5-12-192022212804.pdf',
    'registry_scope', 'Facilities with active registration/licence within Dubai Health Authority'
  )
FROM dha_matches match
JOIN fountain.locations location
  ON location.id = match.location_id
 AND location.name = match.expected_name
 AND location.country_code = 'AE'
 AND location.status = 'active'
 AND location.deleted_at IS NULL
ON CONFLICT (location_id, authority_code, verification_kind)
DO UPDATE SET
  credential_number = EXCLUDED.credential_number,
  credential_status = EXCLUDED.credential_status,
  authority_name = EXCLUDED.authority_name,
  evidence_level = EXCLUDED.evidence_level,
  source_url = EXCLUDED.source_url,
  verified_at = EXCLUDED.verified_at,
  next_review_at = EXCLUDED.next_review_at,
  verification_status = EXCLUDED.verification_status,
  evidence = EXCLUDED.evidence,
  updated_at = now();

WITH mohap_disclosures (
  location_id,
  expected_name,
  credential_number,
  source_url,
  displayed_label
) AS (
  VALUES
    (14249, 'Al Zahra Hospital Dubai — HBOT', 'NMNP8BFM-260522', 'https://azhd.ae/packages/hyperbaric-oxygen-therapy/', 'MOH License No'),
    (14412, 'Eden Dermaclinic', 'CI71HQNU-150626', 'https://www.edenderma.com/', 'MOH License No'),
    (15934, 'Shookra', 'T0UOE5NK-020526', 'https://shookra.com/', 'MOHAP Advertisement Licence'),
    (15937, 'DNA Health & Wellness Clinic', '97HZYK41-180226', 'https://dnahealthcorp.com/', 'MOH License No'),
    (15947, 'Wellth Clinic', 'LAMKY4TV-130225', 'https://wellth.ae/', 'MOH License no'),
    (16096, 'Doctors Clinic Dubai', 'NIMY7VY5-240925', 'https://doctorsclinicdubai.ae/', 'MOHAP License')
)
INSERT INTO fountain.location_regulatory_verifications (
  location_id,
  authority_code,
  verification_kind,
  credential_number,
  credential_status,
  authority_name,
  evidence_level,
  source_url,
  verified_at,
  next_review_at,
  verification_status,
  evidence
)
SELECT
  location.id,
  'MOHAP',
  'health_advertisement_license',
  disclosure.credential_number,
  'Displayed on current official website; public status not independently queryable',
  'UAE Ministry of Health and Prevention',
  'first_party_disclosure',
  disclosure.source_url,
  TIMESTAMPTZ '2026-08-10 18:00:00-07',
  TIMESTAMPTZ '2026-11-08 18:00:00-08',
  'disclosed',
  jsonb_build_object(
    'displayed_label', disclosure.displayed_label,
    'regulatory_scope', 'health advertisement',
    'not_a_facility_license', true,
    'mohap_service_source', 'https://mohap.gov.ae/en/w/issue-license-/-renew-license-for-a-health-advertisement'
  )
FROM mohap_disclosures disclosure
JOIN fountain.locations location
  ON location.id = disclosure.location_id
 AND location.name = disclosure.expected_name
 AND location.country_code = 'AE'
 AND location.status = 'active'
 AND location.deleted_at IS NULL
ON CONFLICT (location_id, authority_code, verification_kind)
DO UPDATE SET
  credential_number = EXCLUDED.credential_number,
  credential_status = EXCLUDED.credential_status,
  authority_name = EXCLUDED.authority_name,
  evidence_level = EXCLUDED.evidence_level,
  source_url = EXCLUDED.source_url,
  verified_at = EXCLUDED.verified_at,
  next_review_at = EXCLUDED.next_review_at,
  verification_status = EXCLUDED.verification_status,
  evidence = EXCLUDED.evidence,
  updated_at = now();

COMMIT;
