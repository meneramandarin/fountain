-- Incremental raw-source staging foundation.
--
-- Scrapers can continue producing source SQLite files. This schema gives us a
-- Postgres landing zone for only the changed source DBs, which is the bridge
-- away from full `canonical.db` rebuilds.

CREATE SCHEMA IF NOT EXISTS __RAW_SCHEMA__;

CREATE TABLE IF NOT EXISTS __RAW_SCHEMA__.source_databases (
    source_slug       TEXT PRIMARY KEY,
    source_db_path    TEXT NOT NULL,
    file_size_bytes   BIGINT NOT NULL,
    file_mtime_ms     BIGINT NOT NULL,
    file_sha256       TEXT,
    listing_count     INTEGER NOT NULL DEFAULT 0,
    image_count       INTEGER NOT NULL DEFAULT 0,
    review_count      INTEGER NOT NULL DEFAULT 0,
    field_count       INTEGER NOT NULL DEFAULT 0,
    page_count        INTEGER NOT NULL DEFAULT 0,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at    TIMESTAMPTZ,
    sync_status       TEXT NOT NULL DEFAULT 'pending',
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS __RAW_SCHEMA__.import_runs (
    id                BIGSERIAL PRIMARY KEY,
    source_slug       TEXT NOT NULL REFERENCES __RAW_SCHEMA__.source_databases(source_slug) ON DELETE CASCADE,
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at       TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'running',
    listing_count     INTEGER NOT NULL DEFAULT 0,
    image_count       INTEGER NOT NULL DEFAULT 0,
    review_count      INTEGER NOT NULL DEFAULT 0,
    field_count       INTEGER NOT NULL DEFAULT 0,
    error             TEXT
);

CREATE INDEX IF NOT EXISTS idx_raw_import_runs_source_started
    ON __RAW_SCHEMA__.import_runs(source_slug, started_at DESC);

CREATE TABLE IF NOT EXISTS __RAW_SCHEMA__.source_listings (
    source_slug        TEXT NOT NULL REFERENCES __RAW_SCHEMA__.source_databases(source_slug) ON DELETE CASCADE,
    source_listing_id  BIGINT NOT NULL,
    source_url         TEXT NOT NULL,
    name               TEXT,
    extracted_at       TEXT,
    payload            JSONB NOT NULL,
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(source_slug, source_listing_id),
    UNIQUE(source_slug, source_url)
);

CREATE INDEX IF NOT EXISTS idx_raw_source_listings_name
    ON __RAW_SCHEMA__.source_listings(source_slug, lower(name));

CREATE TABLE IF NOT EXISTS __RAW_SCHEMA__.source_listing_fields (
    source_slug        TEXT NOT NULL,
    source_listing_id  BIGINT NOT NULL,
    field_name         TEXT NOT NULL,
    field_value        TEXT,
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(source_slug, source_listing_id, field_name),
    FOREIGN KEY(source_slug, source_listing_id)
        REFERENCES __RAW_SCHEMA__.source_listings(source_slug, source_listing_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS __RAW_SCHEMA__.source_images (
    source_slug        TEXT NOT NULL,
    source_listing_id  BIGINT NOT NULL,
    image_url          TEXT NOT NULL,
    local_path         TEXT,
    alt                TEXT,
    source_page_url    TEXT,
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(source_slug, source_listing_id, image_url),
    FOREIGN KEY(source_slug, source_listing_id)
        REFERENCES __RAW_SCHEMA__.source_listings(source_slug, source_listing_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_raw_source_images_url
    ON __RAW_SCHEMA__.source_images(image_url);

CREATE TABLE IF NOT EXISTS __RAW_SCHEMA__.source_reviews (
    source_slug        TEXT NOT NULL,
    source_listing_id  BIGINT NOT NULL,
    review_ordinal     INTEGER NOT NULL,
    reviewer           TEXT,
    rating             TEXT,
    review_date        TEXT,
    body               TEXT,
    raw_json           TEXT,
    synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(source_slug, source_listing_id, review_ordinal),
    FOREIGN KEY(source_slug, source_listing_id)
        REFERENCES __RAW_SCHEMA__.source_listings(source_slug, source_listing_id)
        ON DELETE CASCADE
);
