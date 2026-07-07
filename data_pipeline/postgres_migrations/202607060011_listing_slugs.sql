-- Durable listing slugs for public detail URLs.
--
-- Slugs live in Neon so public URLs are stable and editable. The route layer can
-- keep accepting numeric ids as a fallback, but canonical links should use slug.

CREATE OR REPLACE FUNCTION __CANONICAL_SCHEMA__.slugify_listing_text(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT trim(both '-' FROM regexp_replace(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION __CANONICAL_SCHEMA__.location_slug_base(
    p_name TEXT,
    p_org_name TEXT,
    p_locality TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    name_slug TEXT;
    locality_slug TEXT;
BEGIN
    name_slug := __CANONICAL_SCHEMA__.slugify_listing_text(coalesce(nullif(p_name, ''), nullif(p_org_name, ''), 'location'));
    locality_slug := __CANONICAL_SCHEMA__.slugify_listing_text(p_locality);

    IF name_slug = '' THEN
        name_slug := 'location';
    END IF;

    IF locality_slug <> '' AND position(locality_slug IN name_slug) = 0 THEN
        RETURN name_slug || '-' || locality_slug;
    END IF;

    RETURN name_slug;
END;
$$;

CREATE OR REPLACE FUNCTION __CANONICAL_SCHEMA__.practitioner_slug_base(p_full_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT coalesce(nullif(__CANONICAL_SCHEMA__.slugify_listing_text(p_full_name), ''), 'practitioner');
$$;

CREATE OR REPLACE FUNCTION __CANONICAL_SCHEMA__.unique_location_slug(
    p_location_id INTEGER,
    p_name TEXT,
    p_org_name TEXT,
    p_locality TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    base_slug TEXT;
    candidate_slug TEXT;
    suffix INTEGER := 2;
BEGIN
    base_slug := __CANONICAL_SCHEMA__.location_slug_base(p_name, p_org_name, p_locality);
    candidate_slug := base_slug;

    WHILE EXISTS (
        SELECT 1
        FROM __CANONICAL_SCHEMA__.locations l
        WHERE l.slug = candidate_slug
          AND l.id IS DISTINCT FROM p_location_id
    ) LOOP
        candidate_slug := base_slug || '-' || suffix::text;
        suffix := suffix + 1;
    END LOOP;

    RETURN candidate_slug;
END;
$$;

CREATE OR REPLACE FUNCTION __CANONICAL_SCHEMA__.unique_practitioner_slug(
    p_practitioner_id INTEGER,
    p_full_name TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    base_slug TEXT;
    candidate_slug TEXT;
    suffix INTEGER := 2;
BEGIN
    base_slug := __CANONICAL_SCHEMA__.practitioner_slug_base(p_full_name);
    candidate_slug := base_slug;

    WHILE EXISTS (
        SELECT 1
        FROM __CANONICAL_SCHEMA__.practitioners p
        WHERE p.slug = candidate_slug
          AND p.id IS DISTINCT FROM p_practitioner_id
    ) LOOP
        candidate_slug := base_slug || '-' || suffix::text;
        suffix := suffix + 1;
    END LOOP;

    RETURN candidate_slug;
END;
$$;

ALTER TABLE __CANONICAL_SCHEMA__.locations
    ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE __CANONICAL_SCHEMA__.practitioners
    ADD COLUMN IF NOT EXISTS slug TEXT;

DO $$
DECLARE
    location_row RECORD;
    practitioner_row RECORD;
BEGIN
    FOR location_row IN
        SELECT l.id, l.name, org.canonical_name AS org_name, l.locality
        FROM __CANONICAL_SCHEMA__.locations l
        LEFT JOIN __CANONICAL_SCHEMA__.organizations org ON org.id = l.org_id
        WHERE l.slug IS NULL OR l.slug = ''
        ORDER BY l.id
    LOOP
        UPDATE __CANONICAL_SCHEMA__.locations
        SET slug = __CANONICAL_SCHEMA__.unique_location_slug(location_row.id, location_row.name, location_row.org_name, location_row.locality)
        WHERE id = location_row.id;
    END LOOP;

    FOR practitioner_row IN
        SELECT id, full_name
        FROM __CANONICAL_SCHEMA__.practitioners
        WHERE slug IS NULL OR slug = ''
        ORDER BY id
    LOOP
        UPDATE __CANONICAL_SCHEMA__.practitioners
        SET slug = __CANONICAL_SCHEMA__.unique_practitioner_slug(practitioner_row.id, practitioner_row.full_name)
        WHERE id = practitioner_row.id;
    END LOOP;
END $$;

ALTER TABLE __CANONICAL_SCHEMA__.locations
    ALTER COLUMN slug SET NOT NULL;

ALTER TABLE __CANONICAL_SCHEMA__.practitioners
    ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_slug
    ON __CANONICAL_SCHEMA__.locations(slug);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practitioners_slug
    ON __CANONICAL_SCHEMA__.practitioners(slug);

CREATE OR REPLACE FUNCTION __CANONICAL_SCHEMA__.assign_location_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    org_name TEXT;
BEGIN
    IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
        NEW.slug := __CANONICAL_SCHEMA__.slugify_listing_text(NEW.slug);
    END IF;

    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        SELECT canonical_name
        INTO org_name
        FROM __CANONICAL_SCHEMA__.organizations
        WHERE id = NEW.org_id;

        NEW.slug := __CANONICAL_SCHEMA__.unique_location_slug(NEW.id, NEW.name, org_name, NEW.locality);
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION __CANONICAL_SCHEMA__.assign_practitioner_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
        NEW.slug := __CANONICAL_SCHEMA__.slugify_listing_text(NEW.slug);
    END IF;

    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := __CANONICAL_SCHEMA__.unique_practitioner_slug(NEW.id, NEW.full_name);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_location_slug ON __CANONICAL_SCHEMA__.locations;
CREATE TRIGGER trg_assign_location_slug
    BEFORE INSERT OR UPDATE OF slug, name, org_id, locality
    ON __CANONICAL_SCHEMA__.locations
    FOR EACH ROW
    EXECUTE FUNCTION __CANONICAL_SCHEMA__.assign_location_slug();

DROP TRIGGER IF EXISTS trg_assign_practitioner_slug ON __CANONICAL_SCHEMA__.practitioners;
CREATE TRIGGER trg_assign_practitioner_slug
    BEFORE INSERT OR UPDATE OF slug, full_name
    ON __CANONICAL_SCHEMA__.practitioners
    FOR EACH ROW
    EXECUTE FUNCTION __CANONICAL_SCHEMA__.assign_practitioner_slug();
