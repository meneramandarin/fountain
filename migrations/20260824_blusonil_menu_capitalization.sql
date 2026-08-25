-- Normalize the display capitalization of bluSONIL Scottsdale menu items.
-- Reviewed 2026-08-24. This changes casing only; it does not add, delete,
-- remap, suppress, or otherwise alter the underlying services.

BEGIN;

CREATE SCHEMA IF NOT EXISTS fountain_raw;

SELECT fountain.set_mutation_actor(
  'd1f7805c-89a7-4e3b-9f46-7f9350620820'::uuid,
  'blusonil_menu_capitalization_20260824'
);

CREATE TEMP TABLE blusonil_capitalization_updates (
  id integer PRIMARY KEY,
  old_name text NOT NULL,
  new_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO blusonil_capitalization_updates VALUES
  (94151,'SCULPTRA','Sculptra'),
  (94152,'INFRARED SAUNA','Infrared Sauna'),
  (94153,'HYDRAFACIAL','Hydrafacial'),
  (94154,'MICRONEEDLING','Microneedling'),
  (94155,'BOTOX','Botox'),
  (94156,'CHEMICAL PEELS','Chemical Peels'),
  (94157,'DERMAL FILLERS','Dermal Fillers'),
  (94159,'HAIR RESTORATION THERAPY','Hair Restoration Therapy'),
  (94160,'PRP (PLATELET-RICH PLASMA) THERAPY','PRP (Platelet-Rich Plasma) Therapy'),
  (94161,'HALO LASER TREATMENTS','Halo Laser Treatments'),
  (94162,'BBL HEROIC','BBL Heroic'),
  (94163,'LYMPHATIC DRAINAGE THERAPY','Lymphatic Drainage Therapy'),
  (94164,'VITAMIN INJECTIONS','Vitamin Injections'),
  (94165,'FACIAL REJUVENATION TREATMENTS','Facial Rejuvenation Treatments');

DO $$
DECLARE
  target_count integer;
BEGIN
  SELECT count(*) INTO target_count FROM blusonil_capitalization_updates;

  IF NOT EXISTS (
    SELECT 1 FROM fountain.locations
    WHERE id = 9360 AND status = 'active' AND deleted_at IS NULL
      AND owner_account_id IS NULL
  ) THEN
    RAISE EXCEPTION 'bluSONIL Scottsdale is missing, inactive, or owner-managed';
  END IF;

  IF (
    SELECT count(*)
    FROM fountain.offerings offering
    JOIN blusonil_capitalization_updates update_row
      ON update_row.id = offering.id AND update_row.old_name = offering.raw_name
    WHERE offering.location_id = 9360
      AND offering.status = 'active' AND offering.deleted_at IS NULL
      AND offering.owner_account_id IS NULL
  ) <> target_count THEN
    RAISE EXCEPTION 'A reviewed bluSONIL menu-name target changed or is unavailable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM fountain_ops.field_status status
    WHERE status.entity_type = 'location' AND status.entity_id = 9360
      AND status.field = 'offerings'
      AND (status.locked OR status.verification IN ('human_verified','owner_verified'))
  ) OR EXISTS (
    SELECT 1
    FROM fountain_ops.field_status status
    JOIN blusonil_capitalization_updates update_row ON update_row.id = status.entity_id
    WHERE status.entity_type = 'offering'
      AND status.field IN ('raw_name','data_origin','verification_status')
      AND (status.locked OR status.verification IN ('human_verified','owner_verified'))
  ) THEN
    RAISE EXCEPTION 'A protected bluSONIL menu field cannot be changed';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS fountain_raw.blusonil_menu_capitalization_offerings_backup_20260824 AS
SELECT offering.*, now() AS backed_up_at
FROM fountain.offerings offering
WHERE offering.id IN (SELECT id FROM blusonil_capitalization_updates);

CREATE TABLE IF NOT EXISTS fountain_raw.blusonil_menu_capitalization_field_status_backup_20260824 AS
SELECT status.*, now() AS backed_up_at
FROM fountain_ops.field_status status
WHERE (status.entity_type = 'location' AND status.entity_id = 9360 AND status.field = 'offerings')
   OR (status.entity_type = 'offering'
       AND status.entity_id IN (SELECT id FROM blusonil_capitalization_updates)
       AND status.field IN ('raw_name','data_origin','verification_status'));

CREATE TABLE IF NOT EXISTS fountain_raw.blusonil_menu_capitalization_evidence_20260824 (
  location_id integer PRIMARY KEY,
  source_url text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL
);

INSERT INTO fountain_raw.blusonil_menu_capitalization_evidence_20260824
  (location_id,source_url,note)
VALUES
  (9360,'https://www.blusonil.com/locations/az/scottsdale-quarter/',
   'Official location and service catalog reviewed; Fountain display casing normalized for readability while preserving acronyms.')
ON CONFLICT (location_id) DO UPDATE
SET source_url = EXCLUDED.source_url, reviewed_at = now(), note = EXCLUDED.note;

UPDATE fountain.offerings offering
SET raw_name = update_row.new_name,
    data_origin = 'manual',
    verification_status = 'agent_verified',
    updated_at = now()
FROM blusonil_capitalization_updates update_row
WHERE offering.id = update_row.id
  AND offering.location_id = 9360
  AND offering.raw_name = update_row.old_name
  AND offering.status = 'active' AND offering.deleted_at IS NULL
  AND offering.owner_account_id IS NULL;

INSERT INTO fountain_ops.field_status (
  entity_type,entity_id,field,verification,locked,verified_by,verified_at,source_note
)
VALUES (
  'location',9360,'offerings','agent_verified',false,
  'blusonil_menu_capitalization_20260824',now(),
  'https://www.blusonil.com/locations/az/scottsdale-quarter/ | display capitalization reviewed 2026-08-24'
)
ON CONFLICT (entity_type,entity_id,field) DO UPDATE
SET verification = EXCLUDED.verification, locked = false,
    verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

INSERT INTO fountain_ops.field_status (
  entity_type,entity_id,field,verification,locked,verified_by,verified_at,source_note
)
SELECT 'offering',update_row.id,field,'agent_verified',false,
       'blusonil_menu_capitalization_20260824',now(),
       'https://www.blusonil.com/locations/az/scottsdale-quarter/ | display capitalization reviewed 2026-08-24'
FROM blusonil_capitalization_updates update_row
CROSS JOIN unnest(ARRAY['raw_name','data_origin','verification_status']) AS field
ON CONFLICT (entity_type,entity_id,field) DO UPDATE
SET verification = EXCLUDED.verification, locked = false,
    verified_by = EXCLUDED.verified_by, verified_at = EXCLUDED.verified_at,
    source_note = EXCLUDED.source_note;

SELECT fountain.refresh_search_index_for_location(9360);
SELECT fountain.refresh_city_index();

DO $$
DECLARE
  target_count integer;
BEGIN
  SELECT count(*) INTO target_count FROM blusonil_capitalization_updates;

  IF (
    SELECT count(*)
    FROM fountain.offerings offering
    JOIN blusonil_capitalization_updates update_row
      ON update_row.id = offering.id AND update_row.new_name = offering.raw_name
    WHERE offering.location_id = 9360
      AND offering.data_origin = 'manual'
      AND offering.verification_status = 'agent_verified'
      AND offering.status = 'active' AND offering.deleted_at IS NULL
  ) <> target_count THEN
    RAISE EXCEPTION 'bluSONIL menu capitalization did not persist exactly';
  END IF;
END;
$$;

COMMIT;
