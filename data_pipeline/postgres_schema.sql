-- Legacy Postgres bootstrap schema for the Fountain canonical directory.
-- Production now evolves through data_pipeline/postgres_migrations.

CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
SET search_path TO __SCHEMA__;

CREATE TABLE sources (
    id            INTEGER PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT,
    base_url      TEXT,
    scraped_at    TEXT,
    trust_weight  DOUBLE PRECISION DEFAULT 1.0,
    record_count  INTEGER
);

CREATE TABLE organizations (
    id              INTEGER PRIMARY KEY,
    canonical_name  TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    website_domain  TEXT,
    description     TEXT,
    dedup_key       TEXT UNIQUE
);

CREATE TABLE locations (
    id              INTEGER PRIMARY KEY,
    org_id          INTEGER REFERENCES organizations(id),
    name            TEXT,
    address         TEXT,
    locality        TEXT,
    region          TEXT,
    postal_code     TEXT,
    country_code    TEXT,
    country_name    TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    phone           TEXT,
    email           TEXT,
    website         TEXT,
    price_text      TEXT,
    rating          DOUBLE PRECISION,
    review_count    INTEGER,
    dedup_key       TEXT
);

CREATE TABLE practitioners (
    id                INTEGER PRIMARY KEY,
    full_name         TEXT NOT NULL,
    name_normalized   TEXT NOT NULL,
    credentials       TEXT,
    primary_specialty TEXT,
    years_experience  INTEGER,
    languages         TEXT,
    dedup_key         TEXT
);

CREATE TABLE documents (
    id             INTEGER PRIMARY KEY,
    source_id      INTEGER NOT NULL REFERENCES sources(id),
    title          TEXT,
    source_url     TEXT,
    document_type  TEXT,
    page_number    INTEGER,
    local_path     TEXT,
    raw_text       TEXT
);

CREATE TABLE affiliations (
    id              INTEGER PRIMARY KEY,
    practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
    location_id     INTEGER REFERENCES locations(id),
    org_id          INTEGER REFERENCES organizations(id),
    role            TEXT,
    UNIQUE(practitioner_id, location_id, org_id)
);

CREATE TABLE categories (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    parent_id  INTEGER REFERENCES categories(id),
    facet      TEXT DEFAULT 'treatment_domain'
);

CREATE TABLE treatments (
    id             INTEGER PRIMARY KEY,
    canonical_name TEXT NOT NULL UNIQUE,
    category_id    INTEGER REFERENCES categories(id),
    description    TEXT
);

CREATE TABLE treatment_aliases (
    id               INTEGER PRIMARY KEY,
    treatment_id     INTEGER NOT NULL REFERENCES treatments(id),
    alias_text       TEXT NOT NULL,
    alias_normalized TEXT NOT NULL,
    source_slug      TEXT,
    UNIQUE(alias_normalized, source_slug)
);

CREATE TABLE offerings (
    id               INTEGER PRIMARY KEY,
    location_id      INTEGER NOT NULL REFERENCES locations(id),
    treatment_id     INTEGER REFERENCES treatments(id),
    raw_name         TEXT,
    price_amount     DOUBLE PRECISION,
    price_currency   TEXT,
    source_offer_url TEXT,
    source_id        INTEGER REFERENCES sources(id),
    UNIQUE(location_id, source_id, raw_name)
);

CREATE TABLE tags (
    id     INTEGER PRIMARY KEY,
    facet  TEXT NOT NULL,
    value  TEXT NOT NULL,
    UNIQUE(facet, value)
);

CREATE TABLE entity_tags (
    id          INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    tag_id      INTEGER NOT NULL REFERENCES tags(id),
    UNIQUE(entity_type, entity_id, tag_id)
);

CREATE TABLE source_records (
    id                INTEGER PRIMARY KEY,
    source_id         INTEGER NOT NULL REFERENCES sources(id),
    entity_type       TEXT NOT NULL,
    entity_id         INTEGER NOT NULL,
    source_listing_id INTEGER,
    source_url        TEXT,
    raw_ref           TEXT
);

CREATE TABLE images (
    id             INTEGER PRIMARY KEY,
    entity_type    TEXT NOT NULL,
    entity_id      INTEGER NOT NULL,
    image_url      TEXT,
    local_path     TEXT,
    blob_url       TEXT NOT NULL,
    content_sha256 TEXT,
    alt            TEXT,
    source_id      INTEGER REFERENCES sources(id),
    CONSTRAINT images_blob_backed CHECK (
        blob_url <> ''
        AND (local_path IS NULL OR local_path = '')
    )
);

CREATE TABLE reviews (
    id          INTEGER PRIMARY KEY,
    location_id INTEGER REFERENCES locations(id),
    reviewer    TEXT,
    rating      TEXT,
    review_date TEXT,
    body        TEXT,
    source_id   INTEGER REFERENCES sources(id)
);

CREATE TABLE external_place_matches (
    location_id        INTEGER NOT NULL REFERENCES locations(id),
    provider           TEXT NOT NULL,
    provider_place_id  TEXT NOT NULL,
    provider_url       TEXT,
    display_name       TEXT,
    rating             DOUBLE PRECISION,
    review_count       INTEGER,
    match_confidence   DOUBLE PRECISION,
    match_status       TEXT,
    fetched_at         TEXT NOT NULL,
    expires_at         TEXT,
    raw_json           TEXT,
    PRIMARY KEY(location_id, provider)
);

CREATE TABLE external_reviews (
    id                 INTEGER PRIMARY KEY,
    location_id        INTEGER NOT NULL REFERENCES locations(id),
    provider           TEXT NOT NULL,
    provider_review_id TEXT NOT NULL,
    reviewer           TEXT,
    rating             DOUBLE PRECISION,
    review_date        TEXT,
    body               TEXT,
    source_url         TEXT,
    fetched_at         TEXT NOT NULL,
    expires_at         TEXT,
    raw_json           TEXT,
    UNIQUE(provider, provider_review_id)
);

CREATE TABLE unmapped_terms (
    id          INTEGER PRIMARY KEY,
    term        TEXT NOT NULL,
    source_slug TEXT,
    occurrences INTEGER DEFAULT 1,
    UNIQUE(term, source_slug)
);

CREATE TABLE search_index (
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    name        TEXT,
    locality    TEXT,
    country     TEXT,
    treatments  TEXT,
    specialties TEXT,
    tags        TEXT,
    search_text TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(locality, '') || ' ' || coalesce(country, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(treatments, '') || ' ' || coalesce(specialties, '') || ' ' || coalesce(tags, '')), 'C')
    ) STORED
);

CREATE TABLE import_metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX idx_locations_country   ON locations(country_code);
CREATE INDEX idx_locations_geo       ON locations(latitude, longitude);
CREATE INDEX idx_locations_org       ON locations(org_id);
CREATE INDEX idx_locations_locality  ON locations(country_code, lower(locality));
CREATE INDEX idx_offerings_treatment ON offerings(treatment_id);
CREATE INDEX idx_offerings_location  ON offerings(location_id);
CREATE INDEX idx_aliases_norm        ON treatment_aliases(alias_normalized);
CREATE INDEX idx_entity_tags_entity  ON entity_tags(entity_type, entity_id);
CREATE INDEX idx_source_records_ent  ON source_records(entity_type, entity_id);
CREATE INDEX idx_affiliations_loc    ON affiliations(location_id);
CREATE INDEX idx_affiliations_prac   ON affiliations(practitioner_id);
CREATE INDEX idx_documents_source    ON documents(source_id);
CREATE INDEX idx_images_entity       ON images(entity_type, entity_id);
CREATE INDEX idx_images_blob_url     ON images(blob_url);
CREATE INDEX idx_external_place_matches_location ON external_place_matches(location_id);
CREATE INDEX idx_external_reviews_location_provider ON external_reviews(location_id, provider);
CREATE INDEX idx_search_index_entity ON search_index(entity_type, entity_id);
CREATE INDEX idx_search_index_text   ON search_index USING GIN(search_text);
