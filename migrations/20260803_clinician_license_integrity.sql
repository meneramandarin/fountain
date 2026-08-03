-- Tighten publication integrity after the nationwide clinician-license review.

BEGIN;

ALTER TABLE fountain.location_clinician_license_verifications
  DROP CONSTRAINT location_clinician_license_verifications_status_check,
  ADD CONSTRAINT location_clinician_license_verifications_status_check
    CHECK (verification_status IN ('verified', 'review_required', 'expired', 'revoked'));

-- A displayed verification must have a human/primary-source verified affiliation.
UPDATE fountain.affiliations affiliation
SET verification_status = 'verified', updated_at = now()
FROM fountain.location_clinician_license_verifications verification
WHERE verification.location_id = affiliation.location_id
  AND verification.practitioner_id = affiliation.practitioner_id
  AND verification.verification_status = 'verified'
  AND affiliation.status = 'active'
  AND affiliation.deleted_at IS NULL
  AND affiliation.verification_status <> 'verified';

-- Keep action-flagged Texas records for audit, but do not publish their icon.
UPDATE fountain.location_clinician_license_verifications
SET verification_status = 'review_required', updated_at = now()
WHERE jurisdiction_code = 'TX'
  AND verification_status = 'verified'
  AND COALESCE(evidence->>'disciplinary_status', '') NOT IN ('', 'NONE');

UPDATE fountain_raw.location_clinician_verification_attempts attempt
SET outcome = 'needs_review', attempted_at = now()
WHERE attempt.prompt_version = 'clinician-license-v1'
  AND EXISTS (
    SELECT 1
    FROM fountain.location_clinician_license_verifications verification
    WHERE verification.location_id = attempt.location_id
      AND verification.verification_status = 'review_required'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM fountain.location_clinician_license_verifications verification
    WHERE verification.location_id = attempt.location_id
      AND verification.verification_status = 'verified'
  );

-- Record the manual action screen consistently and review before expiry.
UPDATE fountain.location_clinician_license_verifications
SET evidence = evidence || jsonb_build_object(
      'action_screening', 'reviewed_no_disqualifying_public_action'
    ),
    updated_at = now()
WHERE verification_status = 'verified'
  AND evidence->>'manual_review' = 'true';

UPDATE fountain.location_clinician_license_verifications
SET next_review_at = CASE
      WHEN license_expires_at IS NULL THEN next_review_at
      ELSE GREATEST(
        verified_at + interval '1 day',
        LEAST(next_review_at, (license_expires_at::timestamp AT TIME ZONE 'UTC') - interval '7 days')
      )
    END,
    updated_at = now()
WHERE verification_status = 'verified';

COMMIT;
