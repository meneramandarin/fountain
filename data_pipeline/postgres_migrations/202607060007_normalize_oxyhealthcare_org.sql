-- Normalize the shared OxyHealthCare organization row after branch merges.
--
-- The surviving Leeds, Sheffield, and Glasgow locations all point at this org.
-- Keep the branch names on locations, but make the parent organization generic.

UPDATE __CANONICAL_SCHEMA__.organizations org
SET
    canonical_name = 'OxyHealthCare',
    name_normalized = 'oxyhealthcare'
WHERE org.website_domain = 'oxyhealthcare.co.uk'
  AND org.canonical_name = 'OxyHealthCare Leeds';
