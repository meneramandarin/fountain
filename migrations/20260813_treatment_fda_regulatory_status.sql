-- Consumer-facing FDA status is stored as a constrained code, never prose.
-- The application owns the small, fixed copy vocabulary for these codes.

BEGIN;

ALTER TABLE fountain.treatments
  ADD COLUMN IF NOT EXISTS fda_regulatory_status text NOT NULL DEFAULT 'not_determined',
  ADD COLUMN IF NOT EXISTS fda_regulatory_status_updated_at timestamptz;

ALTER TABLE fountain.treatments
  DROP CONSTRAINT IF EXISTS treatments_fda_regulatory_status_check;

ALTER TABLE fountain.treatments
  ADD CONSTRAINT treatments_fda_regulatory_status_check
  CHECK (fda_regulatory_status IN (
    'approved_drug',
    'approved_drug_discontinued',
    'cleared_or_approved_device',
    'product_specific',
    'device_specific',
    'no_matching_approved_drug',
    'not_applicable',
    'not_determined'
  ));

COMMENT ON COLUMN fountain.treatments.fda_regulatory_status IS
  'Constrained FDA status code. Never store consumer prose or generated summaries in this field.';

COMMENT ON COLUMN fountain.treatments.fda_regulatory_status_updated_at IS
  'Time the stored FDA status last changed.';

COMMIT;
