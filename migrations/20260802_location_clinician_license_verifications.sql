-- Primary-source clinician license checks that may be surfaced on a location.
--
-- This deliberately does not call a clinic "medical board verified": U.S. state
-- medical boards generally license clinicians, not clinic brands. A row is
-- location-scoped because both the clinician's license and their affiliation
-- with that specific clinic must be supported by primary sources.

BEGIN;

CREATE TABLE IF NOT EXISTS fountain.location_clinician_license_verifications (
  id bigserial PRIMARY KEY,
  location_id integer NOT NULL REFERENCES fountain.locations(id) ON DELETE CASCADE,
  practitioner_id integer NOT NULL REFERENCES fountain.practitioners(id) ON DELETE CASCADE,
  jurisdiction_code text NOT NULL,
  license_number text NOT NULL,
  license_type text NOT NULL,
  licensing_authority text NOT NULL,
  license_status text NOT NULL,
  license_expires_at date,
  board_source_url text NOT NULL,
  affiliation_source_url text NOT NULL,
  verified_at timestamptz NOT NULL,
  next_review_at timestamptz NOT NULL,
  verification_status text NOT NULL DEFAULT 'verified',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_clinician_license_verifications_jurisdiction_check
    CHECK (jurisdiction_code ~ '^[A-Z]{2}$'),
  CONSTRAINT location_clinician_license_verifications_status_check
    CHECK (verification_status IN ('verified', 'expired', 'revoked')),
  CONSTRAINT location_clinician_license_verifications_review_window_check
    CHECK (next_review_at > verified_at),
  CONSTRAINT location_clinician_license_verifications_evidence_check
    CHECK (jsonb_typeof(evidence) = 'object'),
  UNIQUE (location_id, practitioner_id, jurisdiction_code, license_number)
);

CREATE INDEX IF NOT EXISTS location_clinician_license_verifications_location_current_idx
  ON fountain.location_clinician_license_verifications (location_id, next_review_at DESC)
  WHERE verification_status = 'verified';

-- Rose Marie Phillip is the only active U.S. clinician-to-location affiliation
-- currently represented in the directory. NYSED's primary-source record lists
-- license 196888 as Registered through 2027-10-31, and the clinic's official
-- site identifies her as a founding principal/owner at this location.
INSERT INTO fountain.location_clinician_license_verifications (
  location_id,
  practitioner_id,
  jurisdiction_code,
  license_number,
  license_type,
  licensing_authority,
  license_status,
  license_expires_at,
  board_source_url,
  affiliation_source_url,
  verified_at,
  next_review_at,
  evidence
)
SELECT
  location.id,
  practitioner.id,
  'NY',
  '196888',
  'Medicine (060)',
  'New York State Education Department, Office of the Professions',
  'Registered',
  DATE '2027-10-31',
  'https://eservices.nysed.gov/professions/verification-search?licenseNumber=196888&professionCode=060',
  'https://www.stemcellsspecialistny.com/our-doctors/',
  TIMESTAMPTZ '2026-08-02 12:00:00-07',
  TIMESTAMPTZ '2026-11-01 12:00:00-07',
  jsonb_build_object(
    'board_record_name', 'PHILLIP ROSE MARIE MONICA',
    'board_record_address', 'NEW YORK NY',
    'date_of_licensure', '1994-08-16',
    'board_data_current_as_of', '2026-08-01T16:12:00-04:00',
    'affiliation_claim', 'Founding principal and owner'
  )
FROM fountain.locations location
JOIN fountain.affiliations affiliation
  ON affiliation.location_id = location.id
 AND affiliation.status = 'active'
 AND affiliation.deleted_at IS NULL
JOIN fountain.practitioners practitioner
  ON practitioner.id = affiliation.practitioner_id
 AND practitioner.status = 'active'
 AND practitioner.deleted_at IS NULL
WHERE location.id = 12191
  AND location.name = 'Stem Cells Specialist NY'
  AND location.country_code = 'US'
  AND location.region = 'NY'
  AND practitioner.id = 22
  AND practitioner.full_name = 'Rose Marie Phillip'
ON CONFLICT (location_id, practitioner_id, jurisdiction_code, license_number)
DO UPDATE SET
  license_type = EXCLUDED.license_type,
  licensing_authority = EXCLUDED.licensing_authority,
  license_status = EXCLUDED.license_status,
  license_expires_at = EXCLUDED.license_expires_at,
  board_source_url = EXCLUDED.board_source_url,
  affiliation_source_url = EXCLUDED.affiliation_source_url,
  verified_at = EXCLUDED.verified_at,
  next_review_at = EXCLUDED.next_review_at,
  verification_status = EXCLUDED.verification_status,
  evidence = EXCLUDED.evidence,
  updated_at = now();

COMMIT;
