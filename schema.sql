-- canonical.db
-- Derived search backend for the longevity directory.
-- Rebuilt from the read-only per-source staging DBs on every run.
-- Nothing in here is hand-edited; treat it as fully disposable and reproducible.

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------
-- provenance: one row per source database
-- ----------------------------------------------------------------------
CREATE TABLE sources (
    id            INTEGER PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT,
    base_url      TEXT,
    scraped_at    TEXT,
    trust_weight  REAL DEFAULT 1.0,
    record_count  INTEGER
);

-- ----------------------------------------------------------------------
-- core entities
-- ----------------------------------------------------------------------
CREATE TABLE organizations (
    id              INTEGER PRIMARY KEY,
    canonical_name  TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    website_domain  TEXT,
    description     TEXT,
    dedup_key       TEXT UNIQUE          -- website_domain, else name_normalized + country
);

CREATE TABLE locations (
    id              INTEGER PRIMARY KEY,
    org_id          INTEGER REFERENCES organizations(id),
    name            TEXT,
    address         TEXT,
    locality        TEXT,
    region          TEXT,
    postal_code     TEXT,
    country_code    TEXT,                -- normalized ISO 3166-1 alpha-2
    country_name    TEXT,
    latitude        REAL,
    longitude       REAL,
    phone           TEXT,
    email           TEXT,
    website         TEXT,
    price_text      TEXT,
    rating          REAL,
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

-- a practitioner working at a location and/or organization
CREATE TABLE affiliations (
    id              INTEGER PRIMARY KEY,
    practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
    location_id     INTEGER REFERENCES locations(id),
    org_id          INTEGER REFERENCES organizations(id),
    role            TEXT,
    UNIQUE(practitioner_id, location_id, org_id)
);

-- ----------------------------------------------------------------------
-- treatment taxonomy (the "what" facet)
-- ----------------------------------------------------------------------
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

-- raw source term -> canonical treatment. This table is the thing you curate forever.
CREATE TABLE treatment_aliases (
    id               INTEGER PRIMARY KEY,
    treatment_id     INTEGER NOT NULL REFERENCES treatments(id),
    alias_text       TEXT NOT NULL,       -- original spelling, kept verbatim
    alias_normalized TEXT NOT NULL,       -- lowercased, punctuation-stripped
    source_slug      TEXT,
    UNIQUE(alias_normalized, source_slug)
);

-- ----------------------------------------------------------------------
-- offerings: a treatment offered at a location, optionally with a price
-- ----------------------------------------------------------------------
CREATE TABLE offerings (
    id               INTEGER PRIMARY KEY,
    location_id      INTEGER NOT NULL REFERENCES locations(id),
    treatment_id     INTEGER REFERENCES treatments(id),  -- NULL when the raw term is unmapped
    raw_name         TEXT,                                -- original source string, always kept
    price_amount     REAL,                                -- NULL / empty is fine
    price_currency   TEXT,
    source_offer_url TEXT,
    source_id        INTEGER REFERENCES sources(id)
);

-- ----------------------------------------------------------------------
-- facets: care model, entity type, price tier, trust, goal, etc.
-- stored as tags so a new source flag never needs a new column
-- ----------------------------------------------------------------------
CREATE TABLE tags (
    id     INTEGER PRIMARY KEY,
    facet  TEXT NOT NULL,    -- care_model | entity_type | price_tier | trust | goal
    value  TEXT NOT NULL,
    UNIQUE(facet, value)
);

CREATE TABLE entity_tags (
    id          INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,   -- organization | location | practitioner
    entity_id   INTEGER NOT NULL,
    tag_id      INTEGER NOT NULL REFERENCES tags(id),
    UNIQUE(entity_type, entity_id, tag_id)
);

-- ----------------------------------------------------------------------
-- provenance ledger (polymorphic). Also the dedup audit trail:
-- one row per contributing staging listing, pointing at the canonical entity.
-- No foreign key on entity_id by design (it is polymorphic).
-- ----------------------------------------------------------------------
CREATE TABLE source_records (
    id                INTEGER PRIMARY KEY,
    source_id         INTEGER NOT NULL REFERENCES sources(id),
    entity_type       TEXT NOT NULL,     -- organization | location | practitioner | service_area
    entity_id         INTEGER NOT NULL,
    source_listing_id INTEGER,           -- listings.id in the staging DB
    source_url        TEXT,
    raw_ref           TEXT               -- optional JSON pointer back to the staging row
);

-- ----------------------------------------------------------------------
-- media + reviews
-- ----------------------------------------------------------------------
CREATE TABLE images (
    id          INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    image_url   TEXT,
    local_path  TEXT,
    alt         TEXT,
    source_id   INTEGER REFERENCES sources(id)
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

-- ----------------------------------------------------------------------
-- review queue: raw terms that did not map to a canonical treatment.
-- Nothing gets silently dropped; it lands here for later curation.
-- ----------------------------------------------------------------------
CREATE TABLE unmapped_terms (
    id          INTEGER PRIMARY KEY,
    term        TEXT NOT NULL,
    source_slug TEXT,
    occurrences INTEGER DEFAULT 1,
    UNIQUE(term, source_slug)
);

-- ----------------------------------------------------------------------
-- indexes
-- ----------------------------------------------------------------------
CREATE INDEX idx_locations_country   ON locations(country_code);
CREATE INDEX idx_locations_geo       ON locations(latitude, longitude);
CREATE INDEX idx_locations_org       ON locations(org_id);
CREATE INDEX idx_offerings_treatment ON offerings(treatment_id);
CREATE INDEX idx_offerings_location  ON offerings(location_id);
CREATE INDEX idx_aliases_norm        ON treatment_aliases(alias_normalized);
CREATE INDEX idx_entity_tags_entity  ON entity_tags(entity_type, entity_id);
CREATE INDEX idx_source_records_ent  ON source_records(entity_type, entity_id);
CREATE INDEX idx_affiliations_loc    ON affiliations(location_id);
CREATE INDEX idx_affiliations_prac   ON affiliations(practitioner_id);

-- ----------------------------------------------------------------------
-- serving layer: one full-text row per searchable entity.
-- Free text hits this; structured filters (country, treatment, tags)
-- run as SQL on the relational tables and intersect by entity_id.
-- ----------------------------------------------------------------------
CREATE VIRTUAL TABLE search_index USING fts5(
    entity_type UNINDEXED,
    entity_id   UNINDEXED,
    name,
    locality,
    country,
    treatments,
    specialties,
    tags,
    tokenize = 'porter unicode61'
);
