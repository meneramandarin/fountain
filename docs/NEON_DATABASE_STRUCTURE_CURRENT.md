# Neon Database Structure Current

Generated: 2026-07-12T20:28:46.730Z
Snapshot source: live Neon database

This document is generated from the live Neon database. It records structural metadata and point-in-time row counts for the configured schemas.

## Schema Object Summary

| schema | object type | count |
| --- | --- | --- |
| fountain | function | 96 |
| fountain | sequence | 16 |
| fountain | table | 23 |
| fountain_ops | sequence | 3 |
| fountain_ops | table | 4 |
| fountain_raw | sequence | 7 |
| fountain_raw | table | 23 |
| neon_auth | table | 9 |

## Installed Extensions

| extension | version | schema |
| --- | --- | --- |
| pg_trgm | 1.6 | fountain |
| pgcrypto | 1.3 | fountain |
| plpgsql | 1.0 | pg_catalog |
| unaccent | 1.1 | fountain |

## Table Counts

| schema | table | rows |
| --- | --- | --- |
| fountain | accounts | 0 |
| fountain | affiliations | 96 |
| fountain | city_index | 2272 |
| fountain | clinic_claims | 0 |
| fountain | entity_change_events | 119300 |
| fountain | entity_tags | 5478 |
| fountain | external_place_matches | 7554 |
| fountain | images | 32834 |
| fountain | listing_submissions | 0 |
| fountain | locations | 13878 |
| fountain | offering_display_suppressions | 2879 |
| fountain | offering_term_translations | 53755 |
| fountain | offerings | 106792 |
| fountain | organizations | 8195 |
| fountain | outbound_clicks | 110 |
| fountain | practitioners | 1303 |
| fountain | reviews | 33606 |
| fountain | search_index | 8481 |
| fountain | source_records | 47317 |
| fountain | sources | 257 |
| fountain | tags | 36 |
| fountain | treatment_term_presentations | 3562 |
| fountain | treatments | 103 |
| fountain_ops | external_calls | 43520 |
| fountain_ops | field_status | 29550 |
| fountain_ops | runs | 153 |
| fountain_ops | task_queue | 40793 |
| fountain_raw | browser_swarm_image_ingest_20260708 | 1673 |
| fountain_raw | browser_swarm_menu_ingest_20260708 | 25198 |
| fountain_raw | dedup_candidates_20260711 | 1300 |
| fountain_raw | hyperbaric_cleanup_results_20260711 | 946 |
| fountain_raw | import_metadata | 3 |
| fountain_raw | import_runs | 288 |
| fountain_raw | location_geocode_backfill_20260709 | 1978 |
| fountain_raw | location_geocode_low_confidence_20260707 | 1265 |
| fountain_raw | location_jsonld_recovery_20260709 | 6 |
| fountain_raw | location_normalization_review_20260707 | 406 |
| fountain_raw | price_conflicts_20260711 | 21 |
| fountain_raw | price_review_20260711 | 186 |
| fountain_raw | source_databases | 257 |
| fountain_raw | source_images | 30000 |
| fountain_raw | source_listing_fields | 154050 |
| fountain_raw | source_listings | 27452 |
| fountain_raw | source_reviews | 24749 |
| fountain_raw | suppressed_source_listings | 10116 |
| fountain_raw | taxonomy_final_triage_20260711 | 43647 |
| fountain_raw | treatment_aliases | 3577 |
| fountain_raw | treatment_mapping_offering_backup | 606 |
| fountain_raw | treatment_mapping_reviews | 337 |
| fountain_raw | unmapped_terms | 74329 |
| neon_auth | account | 0 |
| neon_auth | invitation | 0 |
| neon_auth | jwks | 0 |
| neon_auth | member | 0 |
| neon_auth | organization | 0 |
| neon_auth | project_config | 1 |
| neon_auth | session | 0 |
| neon_auth | user | 0 |
| neon_auth | verification | 0 |

## Tables

### fountain.accounts

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | email | text | text | YES |  |
| 3 | display_name | text | text | YES |  |
| 4 | role | text | text | NO | 'clinic'::text |
| 5 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 6 | updated_at | timestamp with time zone | timestamptz | NO | now() |
| 7 | auth_user_id | uuid | uuid | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| accounts_auth_user_id_fkey | f | FOREIGN KEY (auth_user_id) REFERENCES neon_auth."user"(id) ON DELETE SET NULL |
| accounts_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| accounts_auth_user_id_key | CREATE UNIQUE INDEX accounts_auth_user_id_key ON fountain.accounts USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL) |
| accounts_pkey | CREATE UNIQUE INDEX accounts_pkey ON fountain.accounts USING btree (id) |
| idx_accounts_email_lower | CREATE UNIQUE INDEX idx_accounts_email_lower ON fountain.accounts USING btree (lower(email)) WHERE ((email IS NOT NULL) AND (email <> ''::text)) |

#### Triggers

| name | definition |
| --- | --- |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.affiliations

Rows: 96

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | practitioner_id | integer | int4 | NO |  |
| 3 | location_id | integer | int4 | YES |  |
| 4 | org_id | integer | int4 | YES |  |
| 5 | role | text | text | YES |  |
| 6 | status | text | text | NO | 'active'::text |
| 7 | data_origin | text | text | NO | 'imported'::text |
| 8 | verification_status | text | text | NO | 'unverified'::text |
| 9 | created_at | timestamp with time zone | timestamptz | YES | now() |
| 10 | updated_at | timestamp with time zone | timestamptz | YES | now() |
| 11 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 12 | owner_account_id | uuid | uuid | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| affiliations_data_origin_valid | c | CHECK (data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text])) |
| affiliations_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) |
| affiliations_org_id_fkey | f | FOREIGN KEY (org_id) REFERENCES organizations(id) |
| affiliations_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| affiliations_pkey | p | PRIMARY KEY (id) |
| affiliations_practitioner_id_fkey | f | FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) |
| affiliations_practitioner_id_location_id_org_id_key | u | UNIQUE (practitioner_id, location_id, org_id) |
| affiliations_status_valid | c | CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| affiliations_pkey | CREATE UNIQUE INDEX affiliations_pkey ON fountain.affiliations USING btree (id) |
| affiliations_practitioner_id_location_id_org_id_key | CREATE UNIQUE INDEX affiliations_practitioner_id_location_id_org_id_key ON fountain.affiliations USING btree (practitioner_id, location_id, org_id) |
| idx_affiliations_loc | CREATE INDEX idx_affiliations_loc ON fountain.affiliations USING btree (location_id) |
| idx_affiliations_prac | CREATE INDEX idx_affiliations_prac ON fountain.affiliations USING btree (practitioner_id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_audit_entity_change | CREATE TRIGGER trg_audit_entity_change AFTER INSERT OR DELETE OR UPDATE ON affiliations FOR EACH ROW EXECUTE FUNCTION audit_entity_change() |
| trg_refresh_affiliation_search_index | CREATE TRIGGER trg_refresh_affiliation_search_index AFTER INSERT OR DELETE OR UPDATE ON affiliations FOR EACH ROW EXECUTE FUNCTION refresh_affiliation_search_index_trigger() |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON affiliations FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.city_index

Rows: 2272

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | city | text | text | NO |  |
| 2 | city_key | text | text | NO |  |
| 3 | region | text | text | YES |  |
| 4 | country_code | text | text | NO |  |
| 5 | country_name | text | text | YES |  |
| 6 | latitude | double precision | float8 | NO |  |
| 7 | longitude | double precision | float8 | NO |  |
| 8 | listing_count | integer | int4 | NO | 0 |
| 9 | image_coverage | double precision | float8 | NO | 0 |
| 10 | refreshed_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| city_index_pkey | p | PRIMARY KEY (city_key, country_code) |

#### Indexes

| name | definition |
| --- | --- |
| city_index_pkey | CREATE UNIQUE INDEX city_index_pkey ON fountain.city_index USING btree (city_key, country_code) |
| idx_city_index_city_prefix | CREATE INDEX idx_city_index_city_prefix ON fountain.city_index USING btree (lower(city) text_pattern_ops) |
| idx_city_index_city_trgm | CREATE INDEX idx_city_index_city_trgm ON fountain.city_index USING gin (lower(city) gin_trgm_ops) |
| idx_city_index_country_city | CREATE INDEX idx_city_index_country_city ON fountain.city_index USING btree (country_code, lower(city)) |
| idx_city_index_listing_rank | CREATE INDEX idx_city_index_listing_rank ON fountain.city_index USING btree (listing_count DESC, image_coverage DESC) |

#### Triggers

_None._

### fountain.clinic_claims

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO |  |
| 2 | public_id | uuid | uuid | NO | gen_random_uuid() |
| 3 | account_id | uuid | uuid | NO |  |
| 4 | location_id | integer | int4 | YES |  |
| 5 | org_id | integer | int4 | YES |  |
| 6 | status | text | text | NO | 'pending'::text |
| 7 | claim_method | text | text | YES |  |
| 8 | evidence | jsonb | jsonb | NO | '{}'::jsonb |
| 9 | reviewed_by | uuid | uuid | YES |  |
| 10 | reviewed_at | timestamp with time zone | timestamptz | YES |  |
| 11 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 12 | updated_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| clinic_claims_account_id_fkey | f | FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE |
| clinic_claims_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| clinic_claims_org_id_fkey | f | FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE |
| clinic_claims_pkey | p | PRIMARY KEY (id) |
| clinic_claims_public_id_unique | u | UNIQUE (public_id) |
| clinic_claims_reviewed_by_fkey | f | FOREIGN KEY (reviewed_by) REFERENCES accounts(id) ON DELETE SET NULL |
| clinic_claims_status_valid | c | CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'revoked'::text])) |
| clinic_claims_target_required | c | CHECK (location_id IS NOT NULL OR org_id IS NOT NULL) |

#### Indexes

| name | definition |
| --- | --- |
| clinic_claims_pkey | CREATE UNIQUE INDEX clinic_claims_pkey ON fountain.clinic_claims USING btree (id) |
| clinic_claims_public_id_unique | CREATE UNIQUE INDEX clinic_claims_public_id_unique ON fountain.clinic_claims USING btree (public_id) |
| idx_clinic_claims_account_status | CREATE INDEX idx_clinic_claims_account_status ON fountain.clinic_claims USING btree (account_id, status) |
| idx_clinic_claims_location | CREATE INDEX idx_clinic_claims_location ON fountain.clinic_claims USING btree (location_id) WHERE (location_id IS NOT NULL) |

#### Triggers

| name | definition |
| --- | --- |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON clinic_claims FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.entity_change_events

Rows: 119300

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO |  |
| 2 | entity_type | text | text | NO |  |
| 3 | entity_id | integer | int4 | YES |  |
| 4 | action | text | text | NO |  |
| 5 | actor_type | text | text | NO | 'system'::text |
| 6 | actor_id | uuid | uuid | YES |  |
| 7 | reason | text | text | YES |  |
| 8 | metadata | jsonb | jsonb | NO | '{}'::jsonb |
| 9 | before_data | jsonb | jsonb | YES |  |
| 10 | after_data | jsonb | jsonb | YES |  |
| 11 | created_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| entity_change_events_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| entity_change_events_pkey | CREATE UNIQUE INDEX entity_change_events_pkey ON fountain.entity_change_events USING btree (id) |
| idx_entity_change_events_entity_created | CREATE INDEX idx_entity_change_events_entity_created ON fountain.entity_change_events USING btree (entity_type, entity_id, created_at DESC) |

#### Triggers

_None._

### fountain.entity_tags

Rows: 5478

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | entity_type | text | text | NO |  |
| 3 | entity_id | integer | int4 | NO |  |
| 4 | tag_id | integer | int4 | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| entity_tags_entity_type_entity_id_tag_id_key | u | UNIQUE (entity_type, entity_id, tag_id) |
| entity_tags_pkey | p | PRIMARY KEY (id) |
| entity_tags_tag_id_fkey | f | FOREIGN KEY (tag_id) REFERENCES tags(id) |

#### Indexes

| name | definition |
| --- | --- |
| entity_tags_entity_type_entity_id_tag_id_key | CREATE UNIQUE INDEX entity_tags_entity_type_entity_id_tag_id_key ON fountain.entity_tags USING btree (entity_type, entity_id, tag_id) |
| entity_tags_pkey | CREATE UNIQUE INDEX entity_tags_pkey ON fountain.entity_tags USING btree (id) |
| idx_entity_tags_entity | CREATE INDEX idx_entity_tags_entity ON fountain.entity_tags USING btree (entity_type, entity_id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_refresh_entity_tag_search_index | CREATE TRIGGER trg_refresh_entity_tag_search_index AFTER INSERT OR DELETE OR UPDATE ON entity_tags FOR EACH ROW EXECUTE FUNCTION refresh_entity_tag_search_index_trigger() |

### fountain.external_place_matches

Rows: 7554

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | provider | text | text | NO |  |
| 3 | provider_place_id | text | text | NO |  |
| 4 | provider_url | text | text | YES |  |
| 5 | display_name | text | text | YES |  |
| 6 | rating | double precision | float8 | YES |  |
| 7 | review_count | integer | int4 | YES |  |
| 8 | match_confidence | double precision | float8 | YES |  |
| 9 | match_status | text | text | YES |  |
| 10 | fetched_at | timestamp with time zone | timestamptz | NO |  |
| 11 | expires_at | timestamp with time zone | timestamptz | YES |  |
| 12 | raw_json | jsonb | jsonb | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| external_place_matches_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) |
| external_place_matches_pkey | p | PRIMARY KEY (location_id, provider) |

#### Indexes

| name | definition |
| --- | --- |
| external_place_matches_pkey | CREATE UNIQUE INDEX external_place_matches_pkey ON fountain.external_place_matches USING btree (location_id, provider) |
| idx_external_place_matches_location | CREATE INDEX idx_external_place_matches_location ON fountain.external_place_matches USING btree (location_id) |

#### Triggers

_None._

### fountain.images

Rows: 32834

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | entity_type | text | text | NO |  |
| 3 | entity_id | integer | int4 | NO |  |
| 4 | image_url | text | text | YES |  |
| 6 | blob_url | text | text | YES |  |
| 7 | content_sha256 | text | text | YES |  |
| 8 | alt | text | text | YES |  |
| 9 | source_id | integer | int4 | YES |  |
| 10 | status | text | text | NO | 'active'::text |
| 11 | data_origin | text | text | NO | 'imported'::text |
| 12 | verification_status | text | text | NO | 'unverified'::text |
| 13 | created_at | timestamp with time zone | timestamptz | YES | now() |
| 14 | updated_at | timestamp with time zone | timestamptz | YES | now() |
| 15 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 16 | owner_account_id | uuid | uuid | YES |  |
| 17 | image_kind | text | text | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| images_blob_backed | c | CHECK (blob_url IS NOT NULL AND blob_url <> ''::text) |
| images_data_origin_valid | c | CHECK (data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text])) |
| images_image_kind_valid | c | CHECK (image_kind IS NULL OR (image_kind = ANY (ARRAY['photo'::text, 'logo'::text, 'text_graphic'::text, 'junk'::text]))) |
| images_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| images_pkey | p | PRIMARY KEY (id) |
| images_source_id_fkey | f | FOREIGN KEY (source_id) REFERENCES sources(id) |
| images_status_valid | c | CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| idx_images_blob_url | CREATE INDEX idx_images_blob_url ON fountain.images USING btree (blob_url) |
| idx_images_entity | CREATE INDEX idx_images_entity ON fountain.images USING btree (entity_type, entity_id) |
| idx_images_unclassified_active_location | CREATE INDEX idx_images_unclassified_active_location ON fountain.images USING btree (id) WHERE ((entity_type = 'location'::text) AND (status = 'active'::text) AND (deleted_at IS NULL) AND (image_kind IS NULL)) |
| images_pkey | CREATE UNIQUE INDEX images_pkey ON fountain.images USING btree (id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_audit_entity_change | CREATE TRIGGER trg_audit_entity_change AFTER INSERT OR DELETE OR UPDATE ON images FOR EACH ROW EXECUTE FUNCTION audit_entity_change() |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON images FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.listing_submissions

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO |  |
| 2 | public_id | uuid | uuid | NO | gen_random_uuid() |
| 3 | account_id | uuid | uuid | YES |  |
| 4 | target_entity_type | text | text | YES |  |
| 5 | target_entity_id | integer | int4 | YES |  |
| 6 | submission_type | text | text | NO |  |
| 7 | status | text | text | NO | 'pending'::text |
| 8 | payload | jsonb | jsonb | NO | '{}'::jsonb |
| 9 | review_notes | text | text | YES |  |
| 10 | reviewed_by | uuid | uuid | YES |  |
| 11 | reviewed_at | timestamp with time zone | timestamptz | YES |  |
| 12 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 13 | updated_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| listing_submissions_account_id_fkey | f | FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| listing_submissions_pkey | p | PRIMARY KEY (id) |
| listing_submissions_public_id_unique | u | UNIQUE (public_id) |
| listing_submissions_reviewed_by_fkey | f | FOREIGN KEY (reviewed_by) REFERENCES accounts(id) ON DELETE SET NULL |
| listing_submissions_status_valid | c | CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text, 'applied'::text])) |
| listing_submissions_type_valid | c | CHECK (submission_type = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'claim'::text, 'merge'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| idx_listing_submissions_status_created | CREATE INDEX idx_listing_submissions_status_created ON fountain.listing_submissions USING btree (status, created_at DESC) |
| idx_listing_submissions_target | CREATE INDEX idx_listing_submissions_target ON fountain.listing_submissions USING btree (target_entity_type, target_entity_id) WHERE ((target_entity_type IS NOT NULL) AND (target_entity_id IS NOT NULL)) |
| listing_submissions_pkey | CREATE UNIQUE INDEX listing_submissions_pkey ON fountain.listing_submissions USING btree (id) |
| listing_submissions_public_id_unique | CREATE UNIQUE INDEX listing_submissions_public_id_unique ON fountain.listing_submissions USING btree (public_id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON listing_submissions FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.locations

Rows: 13878

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | org_id | integer | int4 | YES |  |
| 3 | name | text | text | YES |  |
| 4 | address | text | text | YES |  |
| 5 | locality | text | text | YES |  |
| 6 | region | text | text | YES |  |
| 7 | postal_code | text | text | YES |  |
| 8 | country_code | text | text | YES |  |
| 9 | country_name | text | text | YES |  |
| 10 | latitude | double precision | float8 | YES |  |
| 11 | longitude | double precision | float8 | YES |  |
| 12 | phone | text | text | YES |  |
| 13 | email | text | text | YES |  |
| 14 | website | text | text | YES |  |
| 18 | dedup_key | text | text | YES |  |
| 19 | public_id | uuid | uuid | NO | gen_random_uuid() |
| 20 | status | text | text | NO | 'active'::text |
| 21 | data_origin | text | text | NO | 'imported'::text |
| 22 | verification_status | text | text | NO | 'unverified'::text |
| 23 | created_at | timestamp with time zone | timestamptz | YES | now() |
| 24 | updated_at | timestamp with time zone | timestamptz | YES | now() |
| 25 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 26 | owner_account_id | uuid | uuid | YES |  |
| 27 | slug | text | text | NO |  |
| 28 | is_virtual | boolean | bool | NO | false |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| locations_data_origin_valid | c | CHECK (data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text])) |
| locations_org_id_fkey | f | FOREIGN KEY (org_id) REFERENCES organizations(id) |
| locations_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| locations_pkey | p | PRIMARY KEY (id) |
| locations_status_valid | c | CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| idx_locations_country | CREATE INDEX idx_locations_country ON fountain.locations USING btree (country_code) |
| idx_locations_geo | CREATE INDEX idx_locations_geo ON fountain.locations USING btree (latitude, longitude) |
| idx_locations_locality | CREATE INDEX idx_locations_locality ON fountain.locations USING btree (country_code, lower(locality)) |
| idx_locations_org | CREATE INDEX idx_locations_org ON fountain.locations USING btree (org_id) |
| idx_locations_public_id | CREATE UNIQUE INDEX idx_locations_public_id ON fountain.locations USING btree (public_id) |
| idx_locations_slug | CREATE UNIQUE INDEX idx_locations_slug ON fountain.locations USING btree (slug) |
| locations_pkey | CREATE UNIQUE INDEX locations_pkey ON fountain.locations USING btree (id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_assign_location_slug | CREATE TRIGGER trg_assign_location_slug BEFORE INSERT OR UPDATE OF slug, name, org_id, locality ON locations FOR EACH ROW EXECUTE FUNCTION assign_location_slug() |
| trg_audit_entity_change | CREATE TRIGGER trg_audit_entity_change AFTER INSERT OR DELETE OR UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION audit_entity_change() |
| trg_refresh_location_search_index | CREATE TRIGGER trg_refresh_location_search_index AFTER INSERT OR DELETE OR UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION refresh_location_search_index_trigger() |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.offering_display_suppressions

Rows: 2879

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | offering_id | integer | int4 | NO |  |
| 2 | location_id | integer | int4 | NO |  |
| 3 | reason | text | text | NO |  |
| 4 | winner_offering_id | integer | int4 | NO |  |
| 5 | rule_version | text | text | NO |  |
| 6 | evidence | jsonb | jsonb | NO | '{}'::jsonb |
| 7 | active | boolean | bool | NO | true |
| 8 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 9 | updated_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| offering_display_suppressions_evidence_object | c | CHECK (jsonb_typeof(evidence) = 'object'::text) |
| offering_display_suppressions_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| offering_display_suppressions_not_self | c | CHECK (offering_id <> winner_offering_id) |
| offering_display_suppressions_offering_id_fkey | f | FOREIGN KEY (offering_id) REFERENCES offerings(id) ON DELETE CASCADE |
| offering_display_suppressions_pkey | p | PRIMARY KEY (offering_id) |
| offering_display_suppressions_reason_valid | c | CHECK (reason = ANY (ARRAY['duplicate_same_term'::text, 'duplicate_unpriced_shadow'::text, 'legacy_summary_shadow'::text])) |
| offering_display_suppressions_winner_offering_id_fkey | f | FOREIGN KEY (winner_offering_id) REFERENCES offerings(id) ON DELETE CASCADE |

#### Indexes

| name | definition |
| --- | --- |
| offering_display_suppressions_location_active_idx | CREATE INDEX offering_display_suppressions_location_active_idx ON fountain.offering_display_suppressions USING btree (location_id, active) |
| offering_display_suppressions_pkey | CREATE UNIQUE INDEX offering_display_suppressions_pkey ON fountain.offering_display_suppressions USING btree (offering_id) |
| offering_display_suppressions_winner_idx | CREATE INDEX offering_display_suppressions_winner_idx ON fountain.offering_display_suppressions USING btree (winner_offering_id) |

#### Triggers

_None._

### fountain.offering_term_translations

Rows: 53755

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | source_text | text | text | NO |  |
| 2 | source_language | text | text | NO |  |
| 3 | english_text | text | text | NO |  |
| 4 | is_english | boolean | bool | NO |  |
| 5 | confidence | double precision | float8 | NO |  |
| 6 | model | text | text | NO |  |
| 7 | prompt_version | text | text | NO |  |
| 8 | review_status | text | text | NO |  |
| 9 | last_run_id | bigint | int8 | YES |  |
| 10 | rationale | text | text | YES |  |
| 11 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 12 | updated_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| offering_term_translations_confidence_valid | c | CHECK (confidence >= 0::double precision AND confidence <= 1::double precision) |
| offering_term_translations_english_nonempty | c | CHECK (btrim(english_text) <> ''::text) |
| offering_term_translations_language_nonempty | c | CHECK (btrim(source_language) <> ''::text) |
| offering_term_translations_last_run_id_fkey | f | FOREIGN KEY (last_run_id) REFERENCES fountain_ops.runs(id) |
| offering_term_translations_pkey | p | PRIMARY KEY (source_text) |
| offering_term_translations_review_status_valid | c | CHECK (review_status = ANY (ARRAY['auto_approved'::text, 'needs_review'::text, 'human_approved'::text, 'human_rejected'::text])) |
| offering_term_translations_source_nonempty | c | CHECK (btrim(source_text) <> ''::text) |

#### Indexes

| name | definition |
| --- | --- |
| offering_term_translations_pkey | CREATE UNIQUE INDEX offering_term_translations_pkey ON fountain.offering_term_translations USING btree (source_text) |
| offering_term_translations_review_idx | CREATE INDEX offering_term_translations_review_idx ON fountain.offering_term_translations USING btree (review_status, is_english, updated_at DESC) |
| offering_term_translations_run_idx | CREATE INDEX offering_term_translations_run_idx ON fountain.offering_term_translations USING btree (last_run_id) |

#### Triggers

_None._

### fountain.offerings

Rows: 106792

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | location_id | integer | int4 | NO |  |
| 3 | treatment_id | integer | int4 | YES |  |
| 4 | raw_name | text | text | YES |  |
| 5 | price_amount | double precision | float8 | YES |  |
| 6 | price_currency | text | text | YES |  |
| 7 | source_offer_url | text | text | YES |  |
| 8 | source_id | integer | int4 | YES |  |
| 9 | status | text | text | NO | 'active'::text |
| 10 | data_origin | text | text | NO | 'imported'::text |
| 11 | verification_status | text | text | NO | 'unverified'::text |
| 12 | created_at | timestamp with time zone | timestamptz | YES | now() |
| 13 | updated_at | timestamp with time zone | timestamptz | YES | now() |
| 14 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 15 | owner_account_id | uuid | uuid | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| offerings_data_origin_valid | c | CHECK (data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text])) |
| offerings_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) |
| offerings_location_id_source_id_raw_name_key | u | UNIQUE (location_id, source_id, raw_name) |
| offerings_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| offerings_pkey | p | PRIMARY KEY (id) |
| offerings_source_id_fkey | f | FOREIGN KEY (source_id) REFERENCES sources(id) |
| offerings_status_valid | c | CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text])) |
| offerings_treatment_id_fkey | f | FOREIGN KEY (treatment_id) REFERENCES treatments(id) |

#### Indexes

| name | definition |
| --- | --- |
| idx_offerings_location | CREATE INDEX idx_offerings_location ON fountain.offerings USING btree (location_id) |
| idx_offerings_treatment | CREATE INDEX idx_offerings_treatment ON fountain.offerings USING btree (treatment_id) |
| offerings_location_id_source_id_raw_name_key | CREATE UNIQUE INDEX offerings_location_id_source_id_raw_name_key ON fountain.offerings USING btree (location_id, source_id, raw_name) |
| offerings_pkey | CREATE UNIQUE INDEX offerings_pkey ON fountain.offerings USING btree (id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_audit_entity_change | CREATE TRIGGER trg_audit_entity_change AFTER INSERT OR DELETE OR UPDATE ON offerings FOR EACH ROW EXECUTE FUNCTION audit_entity_change() |
| trg_refresh_offering_search_index | CREATE TRIGGER trg_refresh_offering_search_index AFTER INSERT OR DELETE OR UPDATE ON offerings FOR EACH ROW EXECUTE FUNCTION refresh_offering_search_index_trigger() |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON offerings FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.organizations

Rows: 8195

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | canonical_name | text | text | NO |  |
| 3 | name_normalized | text | text | NO |  |
| 4 | website_domain | text | text | YES |  |
| 5 | description | text | text | YES |  |
| 6 | dedup_key | text | text | YES |  |
| 7 | public_id | uuid | uuid | NO | gen_random_uuid() |
| 8 | status | text | text | NO | 'active'::text |
| 9 | data_origin | text | text | NO | 'imported'::text |
| 10 | verification_status | text | text | NO | 'unverified'::text |
| 11 | created_at | timestamp with time zone | timestamptz | YES | now() |
| 12 | updated_at | timestamp with time zone | timestamptz | YES | now() |
| 13 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 14 | owner_account_id | uuid | uuid | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| organizations_data_origin_valid | c | CHECK (data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text])) |
| organizations_dedup_key_key | u | UNIQUE (dedup_key) |
| organizations_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| organizations_pkey | p | PRIMARY KEY (id) |
| organizations_status_valid | c | CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| idx_organizations_public_id | CREATE UNIQUE INDEX idx_organizations_public_id ON fountain.organizations USING btree (public_id) |
| organizations_dedup_key_key | CREATE UNIQUE INDEX organizations_dedup_key_key ON fountain.organizations USING btree (dedup_key) |
| organizations_pkey | CREATE UNIQUE INDEX organizations_pkey ON fountain.organizations USING btree (id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_audit_entity_change | CREATE TRIGGER trg_audit_entity_change AFTER INSERT OR DELETE OR UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION audit_entity_change() |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.outbound_clicks

Rows: 110

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO | nextval('outbound_clicks_id_seq'::regclass) |
| 2 | location_id | integer | int4 | NO |  |
| 3 | clicked_at | timestamp with time zone | timestamptz | NO | now() |
| 4 | source_page | text | text | YES |  |
| 5 | internal_from | text | text | YES |  |
| 6 | referrer | text | text | YES |  |
| 7 | user_agent_hash | text | text | YES |  |
| 8 | is_bot | boolean | bool | NO | false |
| 9 | param_skipped | boolean | bool | NO | false |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| outbound_clicks_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE |
| outbound_clicks_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| idx_outbound_clicks_clicked_at | CREATE INDEX idx_outbound_clicks_clicked_at ON fountain.outbound_clicks USING btree (clicked_at DESC) |
| idx_outbound_clicks_location_clicked | CREATE INDEX idx_outbound_clicks_location_clicked ON fountain.outbound_clicks USING btree (location_id, clicked_at DESC) |
| idx_outbound_clicks_param_skipped_clicked | CREATE INDEX idx_outbound_clicks_param_skipped_clicked ON fountain.outbound_clicks USING btree (param_skipped, clicked_at DESC) |
| outbound_clicks_pkey | CREATE UNIQUE INDEX outbound_clicks_pkey ON fountain.outbound_clicks USING btree (id) |

#### Triggers

_None._

### fountain.practitioners

Rows: 1303

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | full_name | text | text | NO |  |
| 3 | name_normalized | text | text | NO |  |
| 4 | credentials | text | text | YES |  |
| 5 | primary_specialty | text | text | YES |  |
| 6 | years_experience | integer | int4 | YES |  |
| 7 | languages | text | text | YES |  |
| 8 | dedup_key | text | text | YES |  |
| 9 | public_id | uuid | uuid | NO | gen_random_uuid() |
| 10 | status | text | text | NO | 'active'::text |
| 11 | data_origin | text | text | NO | 'imported'::text |
| 12 | verification_status | text | text | NO | 'unverified'::text |
| 13 | created_at | timestamp with time zone | timestamptz | YES | now() |
| 14 | updated_at | timestamp with time zone | timestamptz | YES | now() |
| 15 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 16 | owner_account_id | uuid | uuid | YES |  |
| 17 | slug | text | text | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| practitioners_data_origin_valid | c | CHECK (data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text])) |
| practitioners_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| practitioners_pkey | p | PRIMARY KEY (id) |
| practitioners_status_valid | c | CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| idx_practitioners_public_id | CREATE UNIQUE INDEX idx_practitioners_public_id ON fountain.practitioners USING btree (public_id) |
| idx_practitioners_slug | CREATE UNIQUE INDEX idx_practitioners_slug ON fountain.practitioners USING btree (slug) |
| practitioners_pkey | CREATE UNIQUE INDEX practitioners_pkey ON fountain.practitioners USING btree (id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_assign_practitioner_slug | CREATE TRIGGER trg_assign_practitioner_slug BEFORE INSERT OR UPDATE OF slug, full_name ON practitioners FOR EACH ROW EXECUTE FUNCTION assign_practitioner_slug() |
| trg_audit_entity_change | CREATE TRIGGER trg_audit_entity_change AFTER INSERT OR DELETE OR UPDATE ON practitioners FOR EACH ROW EXECUTE FUNCTION audit_entity_change() |
| trg_refresh_practitioner_search_index | CREATE TRIGGER trg_refresh_practitioner_search_index AFTER INSERT OR DELETE OR UPDATE ON practitioners FOR EACH ROW EXECUTE FUNCTION refresh_practitioner_search_index_trigger() |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON practitioners FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.reviews

Rows: 33606

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | location_id | integer | int4 | YES |  |
| 3 | author | text | text | YES |  |
| 4 | rating | numeric | numeric | YES |  |
| 5 | review_date | date | date | YES |  |
| 6 | text | text | text | YES |  |
| 7 | source_id | integer | int4 | YES |  |
| 8 | status | text | text | NO | 'active'::text |
| 9 | data_origin | text | text | NO | 'imported'::text |
| 10 | verification_status | text | text | NO | 'unverified'::text |
| 11 | created_at | timestamp with time zone | timestamptz | YES | now() |
| 12 | updated_at | timestamp with time zone | timestamptz | YES | now() |
| 13 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 14 | owner_account_id | uuid | uuid | YES |  |
| 15 | provider | text | text | NO | 'scrape'::text |
| 16 | provider_place_id | text | text | YES |  |
| 17 | fetched_at | timestamp with time zone | timestamptz | YES |  |
| 18 | raw_payload | jsonb | jsonb | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| reviews_data_origin_valid | c | CHECK (data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text])) |
| reviews_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) |
| reviews_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| reviews_pkey | p | PRIMARY KEY (id) |
| reviews_source_id_fkey | f | FOREIGN KEY (source_id) REFERENCES sources(id) |
| reviews_status_valid | c | CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| reviews_pkey | CREATE UNIQUE INDEX reviews_pkey ON fountain.reviews USING btree (id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_audit_entity_change | CREATE TRIGGER trg_audit_entity_change AFTER INSERT OR DELETE OR UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION audit_entity_change() |
| trg_touch_updated_at | CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION touch_updated_at() |

### fountain.search_index

Rows: 8481

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | entity_type | text | text | NO |  |
| 2 | entity_id | integer | int4 | NO |  |
| 3 | name | text | text | YES |  |
| 4 | locality | text | text | YES |  |
| 5 | country | text | text | YES |  |
| 6 | treatments | text | text | YES |  |
| 7 | specialties | text | text | YES |  |
| 8 | tags | text | text | YES |  |
| 9 | search_text | tsvector | tsvector | YES |  |

#### Constraints

_None._

#### Indexes

| name | definition |
| --- | --- |
| idx_search_index_entity | CREATE INDEX idx_search_index_entity ON fountain.search_index USING btree (entity_type, entity_id) |
| idx_search_index_entity_unique | CREATE UNIQUE INDEX idx_search_index_entity_unique ON fountain.search_index USING btree (entity_type, entity_id) |
| idx_search_index_text | CREATE INDEX idx_search_index_text ON fountain.search_index USING gin (search_text) |

#### Triggers

_None._

### fountain.source_records

Rows: 47317

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | source_id | integer | int4 | NO |  |
| 3 | entity_type | text | text | NO |  |
| 4 | entity_id | integer | int4 | NO |  |
| 5 | source_listing_id | integer | int4 | YES |  |
| 6 | source_url | text | text | YES |  |
| 7 | raw_ref | text | text | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| source_records_pkey | p | PRIMARY KEY (id) |
| source_records_source_id_fkey | f | FOREIGN KEY (source_id) REFERENCES sources(id) |

#### Indexes

| name | definition |
| --- | --- |
| idx_source_records_ent | CREATE INDEX idx_source_records_ent ON fountain.source_records USING btree (entity_type, entity_id) |
| source_records_pkey | CREATE UNIQUE INDEX source_records_pkey ON fountain.source_records USING btree (id) |

#### Triggers

_None._

### fountain.sources

Rows: 257

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | slug | text | text | NO |  |
| 6 | trust_weight | double precision | float8 | YES | 1.0 |
| 8 | offering_granularity | text | text | NO | 'unknown'::text |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| sources_offering_granularity_valid | c | CHECK (offering_granularity = ANY (ARRAY['unknown'::text, 'summary'::text, 'menu_item'::text, 'direct_service'::text])) |
| sources_pkey | p | PRIMARY KEY (id) |
| sources_slug_key | u | UNIQUE (slug) |

#### Indexes

| name | definition |
| --- | --- |
| sources_pkey | CREATE UNIQUE INDEX sources_pkey ON fountain.sources USING btree (id) |
| sources_slug_key | CREATE UNIQUE INDEX sources_slug_key ON fountain.sources USING btree (slug) |

#### Triggers

_None._

### fountain.tags

Rows: 36

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | facet | text | text | NO |  |
| 3 | value | text | text | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| tags_facet_value_key | u | UNIQUE (facet, value) |
| tags_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| tags_facet_value_key | CREATE UNIQUE INDEX tags_facet_value_key ON fountain.tags USING btree (facet, value) |
| tags_pkey | CREATE UNIQUE INDEX tags_pkey ON fountain.tags USING btree (id) |

#### Triggers

_None._

### fountain.treatment_term_presentations

Rows: 3562

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | treatment_id | integer | int4 | NO |  |
| 2 | term_normalized | text | text | NO |  |
| 3 | relationship_type | text | text | NO |  |
| 4 | display_mode | text | text | NO |  |
| 5 | mapping_valid | boolean | bool | NO |  |
| 6 | confidence | double precision | float8 | NO |  |
| 7 | rationale | text | text | YES |  |
| 8 | model | text | text | YES |  |
| 9 | prompt_version | text | text | NO |  |
| 10 | review_status | text | text | NO |  |
| 11 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 12 | updated_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| treatment_term_presentations_confidence_valid | c | CHECK (confidence >= 0::double precision AND confidence <= 1::double precision) |
| treatment_term_presentations_display_mode_valid | c | CHECK (display_mode = ANY (ARRAY['raw_only'::text, 'raw_and_canonical'::text, 'canonical_only'::text])) |
| treatment_term_presentations_pkey | p | PRIMARY KEY (treatment_id, term_normalized) |
| treatment_term_presentations_relationship_valid | c | CHECK (relationship_type = ANY (ARRAY['format_variant'::text, 'equivalent'::text, 'brand'::text, 'subtype'::text, 'broader_match'::text, 'compound'::text, 'suspect'::text])) |
| treatment_term_presentations_review_status_valid | c | CHECK (review_status = ANY (ARRAY['auto_approved'::text, 'needs_review'::text, 'human_approved'::text, 'human_rejected'::text])) |
| treatment_term_presentations_term_nonempty | c | CHECK (btrim(term_normalized) <> ''::text) |
| treatment_term_presentations_treatment_id_fkey | f | FOREIGN KEY (treatment_id) REFERENCES treatments(id) |

#### Indexes

| name | definition |
| --- | --- |
| treatment_term_presentations_pkey | CREATE UNIQUE INDEX treatment_term_presentations_pkey ON fountain.treatment_term_presentations USING btree (treatment_id, term_normalized) |
| treatment_term_presentations_review_idx | CREATE INDEX treatment_term_presentations_review_idx ON fountain.treatment_term_presentations USING btree (review_status, relationship_type) |

#### Triggers

_None._

### fountain.treatments

Rows: 103

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | canonical_name | text | text | NO |  |
| 4 | description | text | text | YES |  |
| 5 | category | text | text | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| treatments_canonical_name_key | u | UNIQUE (canonical_name) |
| treatments_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| treatments_canonical_name_key | CREATE UNIQUE INDEX treatments_canonical_name_key ON fountain.treatments USING btree (canonical_name) |
| treatments_pkey | CREATE UNIQUE INDEX treatments_pkey ON fountain.treatments USING btree (id) |

#### Triggers

| name | definition |
| --- | --- |
| trg_refresh_treatment_search_index | CREATE TRIGGER trg_refresh_treatment_search_index AFTER DELETE OR UPDATE ON treatments FOR EACH ROW EXECUTE FUNCTION refresh_treatment_search_index_trigger() |

### fountain_ops.external_calls

Rows: 43520

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO | nextval('fountain_ops.external_calls_id_seq'::regclass) |
| 2 | run_id | bigint | int8 | NO |  |
| 3 | provider | text | text | NO |  |
| 4 | call_type | text | text | NO |  |
| 5 | entity_id | integer | int4 | YES |  |
| 6 | model | text | text | YES |  |
| 7 | request_fingerprint | text | text | NO |  |
| 8 | status | text | text | NO |  |
| 9 | http_status | integer | int4 | YES |  |
| 10 | tokens | jsonb | jsonb | NO | '{}'::jsonb |
| 11 | cost_estimate_usd | numeric | numeric | NO | 0 |
| 12 | created_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| external_calls_call_type_nonempty_check | c | CHECK (btrim(call_type) <> ''::text) |
| external_calls_cost_nonnegative_check | c | CHECK (cost_estimate_usd >= 0::numeric) |
| external_calls_http_status_check | c | CHECK (http_status IS NULL OR http_status >= 100 AND http_status <= 599) |
| external_calls_pkey | p | PRIMARY KEY (id) |
| external_calls_provider_nonempty_check | c | CHECK (btrim(provider) <> ''::text) |
| external_calls_request_fingerprint_nonempty_check | c | CHECK (btrim(request_fingerprint) <> ''::text) |
| external_calls_run_id_fkey | f | FOREIGN KEY (run_id) REFERENCES fountain_ops.runs(id) ON DELETE RESTRICT |
| external_calls_status_nonempty_check | c | CHECK (btrim(status) <> ''::text) |
| external_calls_tokens_object_check | c | CHECK (jsonb_typeof(tokens) = 'object'::text) |

#### Indexes

| name | definition |
| --- | --- |
| external_calls_pkey | CREATE UNIQUE INDEX external_calls_pkey ON fountain_ops.external_calls USING btree (id) |
| external_calls_provider_created_idx | CREATE INDEX external_calls_provider_created_idx ON fountain_ops.external_calls USING btree (provider, created_at) |
| external_calls_request_fingerprint_idx | CREATE INDEX external_calls_request_fingerprint_idx ON fountain_ops.external_calls USING btree (request_fingerprint, created_at DESC) |
| external_calls_run_idx | CREATE INDEX external_calls_run_idx ON fountain_ops.external_calls USING btree (run_id) |

#### Triggers

_None._

### fountain_ops.field_status

Rows: 29550

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | entity_type | text | text | NO |  |
| 2 | entity_id | integer | int4 | NO |  |
| 3 | field | text | text | NO |  |
| 4 | verification | text | text | NO | 'unverified'::text |
| 5 | locked | boolean | bool | NO | false |
| 6 | verified_by | text | text | YES |  |
| 7 | verified_at | timestamp with time zone | timestamptz | YES |  |
| 8 | source_note | text | text | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| field_status_entity_type_nonempty_check | c | CHECK (btrim(entity_type) <> ''::text) |
| field_status_field_nonempty_check | c | CHECK (btrim(field) <> ''::text) |
| field_status_pkey | p | PRIMARY KEY (entity_type, entity_id, field) |
| field_status_verification_check | c | CHECK (verification = ANY (ARRAY['unverified'::text, 'agent_verified'::text, 'human_verified'::text, 'owner_verified'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| field_status_pkey | CREATE UNIQUE INDEX field_status_pkey ON fountain_ops.field_status USING btree (entity_type, entity_id, field) |

#### Triggers

_None._

### fountain_ops.runs

Rows: 153

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO | nextval('fountain_ops.runs_id_seq'::regclass) |
| 2 | command | text | text | NO |  |
| 3 | args | jsonb | jsonb | NO | '{}'::jsonb |
| 4 | started_at | timestamp with time zone | timestamptz | NO | now() |
| 5 | finished_at | timestamp with time zone | timestamptz | YES |  |
| 6 | status | text | text | NO | 'running'::text |
| 7 | counts | jsonb | jsonb | NO | '{}'::jsonb |
| 8 | budget_usd | numeric | numeric | YES |  |
| 9 | spent_usd_estimate | numeric | numeric | NO | 0 |
| 10 | notes | text | text | YES |  |
| 11 | dry_run | boolean | bool | NO | true |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| runs_args_object_check | c | CHECK (jsonb_typeof(args) = 'object'::text) |
| runs_budget_nonnegative_check | c | CHECK (budget_usd IS NULL OR budget_usd >= 0::numeric) |
| runs_command_nonempty_check | c | CHECK (btrim(command) <> ''::text) |
| runs_counts_object_check | c | CHECK (jsonb_typeof(counts) = 'object'::text) |
| runs_finished_after_started_check | c | CHECK (finished_at IS NULL OR finished_at >= started_at) |
| runs_lifecycle_check | c | CHECK (status = 'running'::text AND finished_at IS NULL OR status <> 'running'::text AND finished_at IS NOT NULL) |
| runs_pkey | p | PRIMARY KEY (id) |
| runs_spent_nonnegative_check | c | CHECK (spent_usd_estimate >= 0::numeric) |
| runs_status_check | c | CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'budget_exhausted'::text, 'cancelled'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| runs_pkey | CREATE UNIQUE INDEX runs_pkey ON fountain_ops.runs USING btree (id) |

#### Triggers

_None._

### fountain_ops.task_queue

Rows: 40793

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO | nextval('fountain_ops.task_queue_id_seq'::regclass) |
| 2 | task_type | text | text | NO |  |
| 3 | entity_type | text | text | NO |  |
| 4 | entity_id | integer | int4 | NO |  |
| 5 | priority | integer | int4 | NO | 100 |
| 6 | payload | jsonb | jsonb | NO | '{}'::jsonb |
| 7 | status | text | text | NO | 'pending'::text |
| 8 | attempts | integer | int4 | NO | 0 |
| 9 | max_attempts | integer | int4 | NO | 3 |
| 10 | claimed_by | text | text | YES |  |
| 11 | claimed_at | timestamp with time zone | timestamptz | YES |  |
| 12 | result | jsonb | jsonb | YES |  |
| 13 | error | text | text | YES |  |
| 14 | run_id | bigint | int8 | YES |  |
| 15 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 16 | updated_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| task_queue_attempts_check | c | CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts) |
| task_queue_claim_check | c | CHECK (status <> 'claimed'::text OR claimed_by IS NOT NULL AND claimed_at IS NOT NULL) |
| task_queue_entity_type_nonempty_check | c | CHECK (btrim(entity_type) <> ''::text) |
| task_queue_payload_object_check | c | CHECK (jsonb_typeof(payload) = 'object'::text) |
| task_queue_pkey | p | PRIMARY KEY (id) |
| task_queue_run_id_fkey | f | FOREIGN KEY (run_id) REFERENCES fountain_ops.runs(id) ON DELETE RESTRICT |
| task_queue_status_check | c | CHECK (status = ANY (ARRAY['pending'::text, 'claimed'::text, 'done'::text, 'failed'::text, 'skipped'::text])) |
| task_queue_task_type_check | c | CHECK (task_type = ANY (ARRAY['legitimacy_check'::text, 'contact_fill'::text, 'geocode'::text, 'image_harvest'::text, 'image_classify'::text, 'menu_extract'::text, 'reviews_fetch'::text, 'dedup_scan'::text, 'freshness_check'::text, 'noop'::text, 'llm_smoke'::text])) |
| task_queue_updated_after_created_check | c | CHECK (updated_at >= created_at) |

#### Indexes

| name | definition |
| --- | --- |
| task_queue_active_unique_idx | CREATE UNIQUE INDEX task_queue_active_unique_idx ON fountain_ops.task_queue USING btree (task_type, entity_type, entity_id) WHERE (status = ANY (ARRAY['pending'::text, 'claimed'::text])) |
| task_queue_claim_idx | CREATE INDEX task_queue_claim_idx ON fountain_ops.task_queue USING btree (task_type, status, priority, id) |
| task_queue_entity_idx | CREATE INDEX task_queue_entity_idx ON fountain_ops.task_queue USING btree (entity_type, entity_id) |
| task_queue_pkey | CREATE UNIQUE INDEX task_queue_pkey ON fountain_ops.task_queue USING btree (id) |
| task_queue_run_idx | CREATE INDEX task_queue_run_idx ON fountain_ops.task_queue USING btree (run_id) |

#### Triggers

_None._

### fountain_raw.browser_swarm_image_ingest_20260708

Rows: 1673

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO | nextval('fountain_raw.browser_swarm_image_ingest_20260708_id_seq'::regclass) |
| 2 | tier | integer | int4 | NO |  |
| 3 | site_origin | text | text | NO |  |
| 4 | location_id | integer | int4 | NO |  |
| 5 | image_url | text | text | NO |  |
| 6 | source_page_url | text | text | YES |  |
| 7 | llm_confidence | numeric | numeric | YES |  |
| 8 | outcome | text | text | NO |  |
| 9 | reason | text | text | YES |  |
| 10 | blob_url | text | text | YES |  |
| 11 | content_sha256 | text | text | YES |  |
| 12 | width | integer | int4 | YES |  |
| 13 | height | integer | int4 | YES |  |
| 14 | bytes | integer | int4 | YES |  |
| 15 | logged_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| browser_swarm_image_ingest_20260708_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| browser_swarm_image_ingest_20260708_pkey | CREATE UNIQUE INDEX browser_swarm_image_ingest_20260708_pkey ON fountain_raw.browser_swarm_image_ingest_20260708 USING btree (id) |

#### Triggers

_None._

### fountain_raw.browser_swarm_menu_ingest_20260708

Rows: 25198

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO | nextval('fountain_raw.browser_swarm_menu_ingest_20260708_id_seq'::regclass) |
| 2 | tier | integer | int4 | NO |  |
| 3 | site_origin | text | text | NO |  |
| 4 | location_id | integer | int4 | NO |  |
| 5 | raw_name | text | text | NO |  |
| 6 | price_amount | double precision | float8 | YES |  |
| 7 | price_currency | text | text | YES |  |
| 8 | price_context | text | text | YES |  |
| 9 | source_page_url | text | text | YES |  |
| 10 | outcome | text | text | NO |  |
| 11 | reason | text | text | YES |  |
| 12 | offering_id | integer | int4 | YES |  |
| 13 | matched_offering_id | integer | int4 | YES |  |
| 14 | existing_price_amount | double precision | float8 | YES |  |
| 15 | existing_price_currency | text | text | YES |  |
| 16 | logged_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| browser_swarm_menu_ingest_20260708_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| browser_swarm_menu_ingest_20260708_pkey | CREATE UNIQUE INDEX browser_swarm_menu_ingest_20260708_pkey ON fountain_raw.browser_swarm_menu_ingest_20260708 USING btree (id) |

#### Triggers

_None._

### fountain_raw.dedup_candidates_20260711

Rows: 1300

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | keep_id | integer | int4 | NO |  |
| 2 | merge_id | integer | int4 | NO |  |
| 3 | method | text | text | NO |  |
| 4 | confidence | numeric | numeric | YES |  |
| 5 | evidence | jsonb | jsonb | YES |  |
| 6 | decision | text | text | YES | 'pending'::text |
| 7 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| dedup_candidates_20260711_pkey | p | PRIMARY KEY (keep_id, merge_id, method) |

#### Indexes

| name | definition |
| --- | --- |
| dedup_candidates_20260711_pkey | CREATE UNIQUE INDEX dedup_candidates_20260711_pkey ON fountain_raw.dedup_candidates_20260711 USING btree (keep_id, merge_id, method) |

#### Triggers

_None._

### fountain_raw.hyperbaric_cleanup_results_20260711

Rows: 946

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | legitimacy | text | text | YES |  |
| 3 | confidence | text | text | YES |  |
| 4 | result_json | jsonb | jsonb | NO |  |
| 5 | created_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| hyperbaric_cleanup_results_20260711_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| hyperbaric_cleanup_results_20260711_pkey | CREATE UNIQUE INDEX hyperbaric_cleanup_results_20260711_pkey ON fountain_raw.hyperbaric_cleanup_results_20260711 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.import_metadata

Rows: 3

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | key | text | text | NO |  |
| 2 | value | text | text | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| import_metadata_pkey | p | PRIMARY KEY (key) |

#### Indexes

| name | definition |
| --- | --- |
| import_metadata_pkey | CREATE UNIQUE INDEX import_metadata_pkey ON fountain_raw.import_metadata USING btree (key) |

#### Triggers

_None._

### fountain_raw.import_runs

Rows: 288

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO | nextval('fountain_raw.import_runs_id_seq'::regclass) |
| 2 | source_slug | text | text | NO |  |
| 3 | started_at | timestamp with time zone | timestamptz | NO | now() |
| 4 | finished_at | timestamp with time zone | timestamptz | YES |  |
| 5 | status | text | text | NO | 'running'::text |
| 6 | listing_count | integer | int4 | NO | 0 |
| 7 | image_count | integer | int4 | NO | 0 |
| 8 | review_count | integer | int4 | NO | 0 |
| 9 | field_count | integer | int4 | NO | 0 |
| 10 | error | text | text | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| import_runs_pkey | p | PRIMARY KEY (id) |
| import_runs_source_slug_fkey | f | FOREIGN KEY (source_slug) REFERENCES fountain_raw.source_databases(source_slug) ON DELETE CASCADE |

#### Indexes

| name | definition |
| --- | --- |
| idx_raw_import_runs_source_started | CREATE INDEX idx_raw_import_runs_source_started ON fountain_raw.import_runs USING btree (source_slug, started_at DESC) |
| import_runs_pkey | CREATE UNIQUE INDEX import_runs_pkey ON fountain_raw.import_runs USING btree (id) |

#### Triggers

_None._

### fountain_raw.location_geocode_backfill_20260709

Rows: 1978

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | country_code | text | text | YES |  |
| 4 | country_name | text | text | YES |  |
| 5 | data_origin | text | text | YES |  |
| 6 | old_latitude | double precision | float8 | YES |  |
| 7 | old_longitude | double precision | float8 | YES |  |
| 8 | coordinate_issues | ARRAY | _text | YES |  |
| 9 | query_string | text | text | YES |  |
| 10 | provider_status | text | text | YES |  |
| 11 | returned_latitude | double precision | float8 | YES |  |
| 12 | returned_longitude | double precision | float8 | YES |  |
| 13 | location_type | text | text | YES |  |
| 14 | formatted_address | text | text | YES |  |
| 15 | returned_country_code | text | text | YES |  |
| 16 | returned_country_name | text | text | YES |  |
| 17 | result_types | ARRAY | _text | YES |  |
| 18 | place_id | text | text | YES |  |
| 19 | low_confidence | boolean | bool | NO | false |
| 20 | needs_review | boolean | bool | NO | false |
| 21 | write_applied | boolean | bool | NO | false |
| 22 | decision | text | text | NO |  |
| 23 | reason | text | text | YES |  |
| 24 | raw_result | jsonb | jsonb | YES |  |
| 25 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_geocode_backfill_20260709_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_geocode_backfill_20260709_pkey | CREATE UNIQUE INDEX location_geocode_backfill_20260709_pkey ON fountain_raw.location_geocode_backfill_20260709 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_geocode_low_confidence_20260707

Rows: 1265

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | address | text | text | YES |  |
| 4 | country_code | text | text | YES |  |
| 5 | status | text | text | NO |  |
| 6 | formatted_address | text | text | YES |  |
| 7 | location_type | text | text | YES |  |
| 8 | result_types | ARRAY | _text | YES |  |
| 9 | result_country_code | text | text | YES |  |
| 10 | detail | jsonb | jsonb | YES |  |
| 11 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_geocode_low_confidence_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_geocode_low_confidence_20260707_pkey | CREATE UNIQUE INDEX location_geocode_low_confidence_20260707_pkey ON fountain_raw.location_geocode_low_confidence_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_jsonld_recovery_20260709

Rows: 6

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | old_address | text | text | YES |  |
| 4 | old_locality | text | text | YES |  |
| 5 | old_region | text | text | YES |  |
| 6 | old_postal_code | text | text | YES |  |
| 7 | old_country_code | text | text | YES |  |
| 8 | old_country_name | text | text | YES |  |
| 9 | old_latitude | double precision | float8 | YES |  |
| 10 | old_longitude | double precision | float8 | YES |  |
| 11 | new_address | text | text | YES |  |
| 12 | new_locality | text | text | YES |  |
| 13 | new_region | text | text | YES |  |
| 14 | new_postal_code | text | text | YES |  |
| 15 | new_country_code | text | text | YES |  |
| 16 | new_country_name | text | text | YES |  |
| 17 | query_string | text | text | YES |  |
| 18 | recovery_notes | ARRAY | _text | YES |  |
| 19 | provider_status | text | text | YES |  |
| 20 | returned_latitude | double precision | float8 | YES |  |
| 21 | returned_longitude | double precision | float8 | YES |  |
| 22 | location_type | text | text | YES |  |
| 23 | formatted_address | text | text | YES |  |
| 24 | returned_country_code | text | text | YES |  |
| 25 | returned_country_name | text | text | YES |  |
| 26 | result_types | ARRAY | _text | YES |  |
| 27 | place_id | text | text | YES |  |
| 28 | low_confidence | boolean | bool | NO | false |
| 29 | needs_review | boolean | bool | NO | false |
| 30 | write_applied | boolean | bool | NO | false |
| 31 | decision | text | text | NO |  |
| 32 | reason | text | text | YES |  |
| 33 | raw_result | jsonb | jsonb | YES |  |
| 34 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_jsonld_recovery_20260709_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_jsonld_recovery_20260709_pkey | CREATE UNIQUE INDEX location_jsonld_recovery_20260709_pkey ON fountain_raw.location_jsonld_recovery_20260709 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_normalization_review_20260707

Rows: 406

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | name | text | text | YES |  |
| 3 | reason | text | text | NO |  |
| 4 | detail | jsonb | jsonb | YES |  |
| 5 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.price_conflicts_20260711

Rows: 21

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | offering_id | integer | int4 | NO |  |
| 3 | source_listing_id | bigint | int8 | YES |  |
| 4 | current_amount | double precision | float8 | YES |  |
| 5 | current_currency | text | text | YES |  |
| 6 | new_amount | double precision | float8 | YES |  |
| 7 | new_currency | text | text | YES |  |
| 8 | price_payload | jsonb | jsonb | NO |  |
| 9 | reason | text | text | NO |  |
| 10 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 11 | actor_label | text | text | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| price_conflicts_20260711_pkey | p | PRIMARY KEY (location_id, offering_id) |

#### Indexes

| name | definition |
| --- | --- |
| price_conflicts_20260711_pkey | CREATE UNIQUE INDEX price_conflicts_20260711_pkey ON fountain_raw.price_conflicts_20260711 USING btree (location_id, offering_id) |

#### Triggers

_None._

### fountain_raw.price_review_20260711

Rows: 186

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | source_listing_id | bigint | int8 | YES |  |
| 3 | price_payload | jsonb | jsonb | NO |  |
| 4 | reason | text | text | NO |  |
| 5 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 6 | actor_label | text | text | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| price_review_20260711_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| price_review_20260711_pkey | CREATE UNIQUE INDEX price_review_20260711_pkey ON fountain_raw.price_review_20260711 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.source_databases

Rows: 257

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | source_slug | text | text | NO |  |
| 2 | source_db_path | text | text | NO |  |
| 3 | file_size_bytes | bigint | int8 | NO |  |
| 4 | file_mtime_ms | bigint | int8 | NO |  |
| 5 | file_sha256 | text | text | YES |  |
| 6 | listing_count | integer | int4 | NO | 0 |
| 7 | image_count | integer | int4 | NO | 0 |
| 8 | review_count | integer | int4 | NO | 0 |
| 9 | field_count | integer | int4 | NO | 0 |
| 10 | page_count | integer | int4 | NO | 0 |
| 11 | metadata | jsonb | jsonb | NO | '{}'::jsonb |
| 12 | last_synced_at | timestamp with time zone | timestamptz | YES |  |
| 13 | sync_status | text | text | NO | 'pending'::text |
| 14 | updated_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| source_databases_pkey | p | PRIMARY KEY (source_slug) |

#### Indexes

| name | definition |
| --- | --- |
| source_databases_pkey | CREATE UNIQUE INDEX source_databases_pkey ON fountain_raw.source_databases USING btree (source_slug) |

#### Triggers

_None._

### fountain_raw.source_images

Rows: 30000

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | source_slug | text | text | NO |  |
| 2 | source_listing_id | bigint | int8 | NO |  |
| 3 | image_url | text | text | NO |  |
| 4 | local_path | text | text | YES |  |
| 5 | alt | text | text | YES |  |
| 6 | source_page_url | text | text | YES |  |
| 7 | synced_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| source_images_pkey | p | PRIMARY KEY (source_slug, source_listing_id, image_url) |
| source_images_source_slug_source_listing_id_fkey | f | FOREIGN KEY (source_slug, source_listing_id) REFERENCES fountain_raw.source_listings(source_slug, source_listing_id) ON DELETE CASCADE |

#### Indexes

| name | definition |
| --- | --- |
| idx_raw_source_images_url | CREATE INDEX idx_raw_source_images_url ON fountain_raw.source_images USING btree (image_url) |
| source_images_pkey | CREATE UNIQUE INDEX source_images_pkey ON fountain_raw.source_images USING btree (source_slug, source_listing_id, image_url) |

#### Triggers

_None._

### fountain_raw.source_listing_fields

Rows: 154050

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | source_slug | text | text | NO |  |
| 2 | source_listing_id | bigint | int8 | NO |  |
| 3 | field_name | text | text | NO |  |
| 4 | field_value | text | text | YES |  |
| 5 | synced_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| source_listing_fields_pkey | p | PRIMARY KEY (source_slug, source_listing_id, field_name) |
| source_listing_fields_source_slug_source_listing_id_fkey | f | FOREIGN KEY (source_slug, source_listing_id) REFERENCES fountain_raw.source_listings(source_slug, source_listing_id) ON DELETE CASCADE |

#### Indexes

| name | definition |
| --- | --- |
| source_listing_fields_pkey | CREATE UNIQUE INDEX source_listing_fields_pkey ON fountain_raw.source_listing_fields USING btree (source_slug, source_listing_id, field_name) |

#### Triggers

_None._

### fountain_raw.source_listings

Rows: 27452

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | source_slug | text | text | NO |  |
| 2 | source_listing_id | bigint | int8 | NO |  |
| 3 | source_url | text | text | NO |  |
| 4 | name | text | text | YES |  |
| 5 | extracted_at | text | text | YES |  |
| 6 | payload | jsonb | jsonb | NO |  |
| 7 | synced_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| source_listings_pkey | p | PRIMARY KEY (source_slug, source_listing_id) |
| source_listings_source_slug_fkey | f | FOREIGN KEY (source_slug) REFERENCES fountain_raw.source_databases(source_slug) ON DELETE CASCADE |
| source_listings_source_slug_source_url_key | u | UNIQUE (source_slug, source_url) |

#### Indexes

| name | definition |
| --- | --- |
| idx_raw_source_listings_name | CREATE INDEX idx_raw_source_listings_name ON fountain_raw.source_listings USING btree (source_slug, lower(name)) |
| source_listings_pkey | CREATE UNIQUE INDEX source_listings_pkey ON fountain_raw.source_listings USING btree (source_slug, source_listing_id) |
| source_listings_source_slug_source_url_key | CREATE UNIQUE INDEX source_listings_source_slug_source_url_key ON fountain_raw.source_listings USING btree (source_slug, source_url) |

#### Triggers

_None._

### fountain_raw.source_reviews

Rows: 24749

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | source_slug | text | text | NO |  |
| 2 | source_listing_id | bigint | int8 | NO |  |
| 3 | review_ordinal | integer | int4 | NO |  |
| 4 | reviewer | text | text | YES |  |
| 5 | rating | text | text | YES |  |
| 6 | review_date | text | text | YES |  |
| 7 | body | text | text | YES |  |
| 8 | raw_json | text | text | YES |  |
| 9 | synced_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| source_reviews_pkey | p | PRIMARY KEY (source_slug, source_listing_id, review_ordinal) |
| source_reviews_source_slug_source_listing_id_fkey | f | FOREIGN KEY (source_slug, source_listing_id) REFERENCES fountain_raw.source_listings(source_slug, source_listing_id) ON DELETE CASCADE |

#### Indexes

| name | definition |
| --- | --- |
| source_reviews_pkey | CREATE UNIQUE INDEX source_reviews_pkey ON fountain_raw.source_reviews USING btree (source_slug, source_listing_id, review_ordinal) |

#### Triggers

_None._

### fountain_raw.suppressed_source_listings

Rows: 10116

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | source_slug | text | text | NO |  |
| 2 | source_listing_id | bigint | int8 | NO |  |
| 3 | reason | text | text | NO |  |
| 4 | suppressed_at | timestamp with time zone | timestamptz | NO | now() |
| 5 | suppressed_by | text | text | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| suppressed_source_listings_pkey | p | PRIMARY KEY (source_slug, source_listing_id) |

#### Indexes

| name | definition |
| --- | --- |
| suppressed_source_listings_pkey | CREATE UNIQUE INDEX suppressed_source_listings_pkey ON fountain_raw.suppressed_source_listings USING btree (source_slug, source_listing_id) |

#### Triggers

_None._

### fountain_raw.taxonomy_final_triage_20260711

Rows: 43647

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | normalized | text | text | NO |  |
| 2 | display_term | text | text | NO |  |
| 3 | decision_class | text | text | NO |  |
| 4 | confidence | text | text | NO |  |
| 5 | confidence_score | double precision | float8 | NO |  |
| 6 | existing_treatment_id | integer | int4 | YES |  |
| 7 | existing_treatment_name | text | text | YES |  |
| 8 | proposed_canonical_name | text | text | YES |  |
| 9 | proposed_category | text | text | YES |  |
| 10 | brand_fit | boolean | bool | NO | false |
| 11 | reject_reason | text | text | YES |  |
| 12 | combined_occurrences | integer | int4 | NO |  |
| 13 | rationale | text | text | YES |  |
| 14 | llm_batch_key | text | text | YES |  |
| 15 | applied_action | text | text | YES |  |
| 16 | applied_at | timestamp with time zone | timestamptz | YES |  |
| 17 | created_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| taxonomy_final_triage_20260711_pkey | p | PRIMARY KEY (normalized) |

#### Indexes

| name | definition |
| --- | --- |
| taxonomy_final_triage_20260711_pkey | CREATE UNIQUE INDEX taxonomy_final_triage_20260711_pkey ON fountain_raw.taxonomy_final_triage_20260711 USING btree (normalized) |

#### Triggers

_None._

### fountain_raw.treatment_aliases

Rows: 3577

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | treatment_id | integer | int4 | NO |  |
| 3 | alias_text | text | text | NO |  |
| 4 | alias_normalized | text | text | NO |  |
| 5 | source_slug | text | text | YES |  |
| 6 | mapping_status | text | text | NO | 'needs_review'::text |
| 7 | mapping_confidence | double precision | float8 | YES |  |
| 8 | mapping_review_model | text | text | YES |  |
| 9 | mapping_reviewed_at | timestamp with time zone | timestamptz | YES |  |
| 10 | mapping_review_rationale | text | text | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| treatment_aliases_alias_normalized_source_slug_key | u | UNIQUE (alias_normalized, source_slug) |
| treatment_aliases_mapping_confidence_valid | c | CHECK (mapping_confidence IS NULL OR mapping_confidence >= 0::double precision AND mapping_confidence <= 1::double precision) |
| treatment_aliases_mapping_status_valid | c | CHECK (mapping_status = ANY (ARRAY['active'::text, 'rejected'::text, 'needs_review'::text])) |
| treatment_aliases_pkey | p | PRIMARY KEY (id) |
| treatment_aliases_treatment_id_fkey | f | FOREIGN KEY (treatment_id) REFERENCES treatments(id) |

#### Indexes

| name | definition |
| --- | --- |
| idx_aliases_norm | CREATE INDEX idx_aliases_norm ON fountain_raw.treatment_aliases USING btree (alias_normalized) |
| idx_treatment_aliases_treatment_term | CREATE INDEX idx_treatment_aliases_treatment_term ON fountain_raw.treatment_aliases USING btree (treatment_id, alias_normalized) |
| treatment_aliases_active_normalized_idx | CREATE INDEX treatment_aliases_active_normalized_idx ON fountain_raw.treatment_aliases USING btree (alias_normalized, treatment_id) WHERE (mapping_status = 'active'::text) |
| treatment_aliases_alias_normalized_source_slug_key | CREATE UNIQUE INDEX treatment_aliases_alias_normalized_source_slug_key ON fountain_raw.treatment_aliases USING btree (alias_normalized, source_slug) |
| treatment_aliases_pkey | CREATE UNIQUE INDEX treatment_aliases_pkey ON fountain_raw.treatment_aliases USING btree (id) |

#### Triggers

_None._

### fountain_raw.treatment_mapping_offering_backup

Rows: 606

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | review_id | bigint | int8 | NO |  |
| 2 | offering_id | bigint | int8 | NO |  |
| 3 | previous_treatment_id | integer | int4 | YES |  |
| 4 | restored_at | timestamp with time zone | timestamptz | YES |  |
| 5 | created_at | timestamp with time zone | timestamptz | NO | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| treatment_mapping_offering_backup_offering_id_fkey | f | FOREIGN KEY (offering_id) REFERENCES offerings(id) |
| treatment_mapping_offering_backup_pkey | p | PRIMARY KEY (review_id, offering_id) |
| treatment_mapping_offering_backup_previous_treatment_id_fkey | f | FOREIGN KEY (previous_treatment_id) REFERENCES treatments(id) |
| treatment_mapping_offering_backup_review_id_fkey | f | FOREIGN KEY (review_id) REFERENCES fountain_raw.treatment_mapping_reviews(id) |

#### Indexes

| name | definition |
| --- | --- |
| treatment_mapping_offering_backup_pkey | CREATE UNIQUE INDEX treatment_mapping_offering_backup_pkey ON fountain_raw.treatment_mapping_offering_backup USING btree (review_id, offering_id) |

#### Triggers

_None._

### fountain_raw.treatment_mapping_reviews

Rows: 337

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | bigint | int8 | NO | nextval('fountain_raw.treatment_mapping_reviews_id_seq'::regclass) |
| 2 | run_id | bigint | int8 | NO |  |
| 3 | term_normalized | text | text | NO |  |
| 4 | display_term | text | text | NO |  |
| 5 | old_treatment_id | integer | int4 | NO |  |
| 6 | proposed_treatment_id | integer | int4 | YES |  |
| 7 | first_pass | jsonb | jsonb | NO |  |
| 8 | second_pass | jsonb | jsonb | YES |  |
| 9 | final_decision | text | text | NO |  |
| 10 | consensus_confidence | double precision | float8 | YES |  |
| 11 | model | text | text | NO |  |
| 12 | prompt_version | text | text | NO |  |
| 13 | review_status | text | text | NO |  |
| 14 | applied | boolean | bool | NO | false |
| 15 | affected_alias_ids | ARRAY | _int4 | NO | '{}'::integer[] |
| 16 | affected_offering_ids | ARRAY | _int8 | NO | '{}'::bigint[] |
| 17 | created_at | timestamp with time zone | timestamptz | NO | now() |
| 18 | applied_at | timestamp with time zone | timestamptz | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| treatment_mapping_reviews_confidence_valid | c | CHECK (consensus_confidence IS NULL OR consensus_confidence >= 0::double precision AND consensus_confidence <= 1::double precision) |
| treatment_mapping_reviews_decision_valid | c | CHECK (final_decision = ANY (ARRAY['keep_mapping'::text, 'remap_existing'::text, 'unmap_valid_service'::text, 'reject_non_service'::text, 'unresolved'::text])) |
| treatment_mapping_reviews_old_treatment_id_fkey | f | FOREIGN KEY (old_treatment_id) REFERENCES treatments(id) |
| treatment_mapping_reviews_pkey | p | PRIMARY KEY (id) |
| treatment_mapping_reviews_proposed_treatment_id_fkey | f | FOREIGN KEY (proposed_treatment_id) REFERENCES treatments(id) |
| treatment_mapping_reviews_run_id_fkey | f | FOREIGN KEY (run_id) REFERENCES fountain_ops.runs(id) |
| treatment_mapping_reviews_run_id_term_normalized_old_treatm_key | u | UNIQUE (run_id, term_normalized, old_treatment_id) |
| treatment_mapping_reviews_status_valid | c | CHECK (review_status = ANY (ARRAY['consensus'::text, 'needs_review'::text, 'applied'::text, 'not_applicable'::text])) |

#### Indexes

| name | definition |
| --- | --- |
| treatment_mapping_reviews_pkey | CREATE UNIQUE INDEX treatment_mapping_reviews_pkey ON fountain_raw.treatment_mapping_reviews USING btree (id) |
| treatment_mapping_reviews_queue_idx | CREATE INDEX treatment_mapping_reviews_queue_idx ON fountain_raw.treatment_mapping_reviews USING btree (review_status, final_decision, created_at DESC) |
| treatment_mapping_reviews_run_id_term_normalized_old_treatm_key | CREATE UNIQUE INDEX treatment_mapping_reviews_run_id_term_normalized_old_treatm_key ON fountain_raw.treatment_mapping_reviews USING btree (run_id, term_normalized, old_treatment_id) |

#### Triggers

_None._

### fountain_raw.unmapped_terms

Rows: 74329

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | term | text | text | NO |  |
| 3 | source_slug | text | text | YES |  |
| 4 | occurrences | integer | int4 | YES | 1 |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| unmapped_terms_pkey | p | PRIMARY KEY (id) |
| unmapped_terms_term_source_slug_key | u | UNIQUE (term, source_slug) |

#### Indexes

| name | definition |
| --- | --- |
| unmapped_terms_pkey | CREATE UNIQUE INDEX unmapped_terms_pkey ON fountain_raw.unmapped_terms USING btree (id) |
| unmapped_terms_term_source_slug_key | CREATE UNIQUE INDEX unmapped_terms_term_source_slug_key ON fountain_raw.unmapped_terms USING btree (term, source_slug) |

#### Triggers

_None._

### neon_auth.account

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | accountId | text | text | NO |  |
| 3 | providerId | text | text | NO |  |
| 4 | userId | uuid | uuid | NO |  |
| 5 | accessToken | text | text | YES |  |
| 6 | refreshToken | text | text | YES |  |
| 7 | idToken | text | text | YES |  |
| 8 | accessTokenExpiresAt | timestamp with time zone | timestamptz | YES |  |
| 9 | refreshTokenExpiresAt | timestamp with time zone | timestamptz | YES |  |
| 10 | scope | text | text | YES |  |
| 11 | password | text | text | YES |  |
| 12 | createdAt | timestamp with time zone | timestamptz | NO | CURRENT_TIMESTAMP |
| 13 | updatedAt | timestamp with time zone | timestamptz | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| account_pkey | p | PRIMARY KEY (id) |
| account_userId_fkey | f | FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE |

#### Indexes

| name | definition |
| --- | --- |
| account_pkey | CREATE UNIQUE INDEX account_pkey ON neon_auth.account USING btree (id) |
| account_userId_idx | CREATE INDEX "account_userId_idx" ON neon_auth.account USING btree ("userId") |

#### Triggers

_None._

### neon_auth.invitation

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | organizationId | uuid | uuid | NO |  |
| 3 | email | text | text | NO |  |
| 4 | role | text | text | YES |  |
| 5 | status | text | text | NO |  |
| 6 | expiresAt | timestamp with time zone | timestamptz | NO |  |
| 7 | createdAt | timestamp with time zone | timestamptz | NO | CURRENT_TIMESTAMP |
| 8 | inviterId | uuid | uuid | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| invitation_inviterId_fkey | f | FOREIGN KEY ("inviterId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE |
| invitation_organizationId_fkey | f | FOREIGN KEY ("organizationId") REFERENCES neon_auth.organization(id) ON DELETE CASCADE |
| invitation_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| invitation_email_idx | CREATE INDEX invitation_email_idx ON neon_auth.invitation USING btree (email) |
| invitation_organizationId_idx | CREATE INDEX "invitation_organizationId_idx" ON neon_auth.invitation USING btree ("organizationId") |
| invitation_pkey | CREATE UNIQUE INDEX invitation_pkey ON neon_auth.invitation USING btree (id) |

#### Triggers

_None._

### neon_auth.jwks

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | publicKey | text | text | NO |  |
| 3 | privateKey | text | text | NO |  |
| 4 | createdAt | timestamp with time zone | timestamptz | NO |  |
| 5 | expiresAt | timestamp with time zone | timestamptz | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| jwks_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| jwks_pkey | CREATE UNIQUE INDEX jwks_pkey ON neon_auth.jwks USING btree (id) |

#### Triggers

_None._

### neon_auth.member

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | organizationId | uuid | uuid | NO |  |
| 3 | userId | uuid | uuid | NO |  |
| 4 | role | text | text | NO |  |
| 5 | createdAt | timestamp with time zone | timestamptz | NO |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| member_organizationId_fkey | f | FOREIGN KEY ("organizationId") REFERENCES neon_auth.organization(id) ON DELETE CASCADE |
| member_pkey | p | PRIMARY KEY (id) |
| member_userId_fkey | f | FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE |

#### Indexes

| name | definition |
| --- | --- |
| member_organizationId_idx | CREATE INDEX "member_organizationId_idx" ON neon_auth.member USING btree ("organizationId") |
| member_pkey | CREATE UNIQUE INDEX member_pkey ON neon_auth.member USING btree (id) |
| member_userId_idx | CREATE INDEX "member_userId_idx" ON neon_auth.member USING btree ("userId") |

#### Triggers

_None._

### neon_auth.organization

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | name | text | text | NO |  |
| 3 | slug | text | text | NO |  |
| 4 | logo | text | text | YES |  |
| 5 | createdAt | timestamp with time zone | timestamptz | NO |  |
| 6 | metadata | text | text | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| organization_pkey | p | PRIMARY KEY (id) |
| organization_slug_key | u | UNIQUE (slug) |

#### Indexes

| name | definition |
| --- | --- |
| organization_pkey | CREATE UNIQUE INDEX organization_pkey ON neon_auth.organization USING btree (id) |
| organization_slug_key | CREATE UNIQUE INDEX organization_slug_key ON neon_auth.organization USING btree (slug) |
| organization_slug_uidx | CREATE UNIQUE INDEX organization_slug_uidx ON neon_auth.organization USING btree (slug) |

#### Triggers

_None._

### neon_auth.project_config

Rows: 1

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | name | text | text | NO |  |
| 3 | endpoint_id | text | text | NO |  |
| 4 | created_at | timestamp with time zone | timestamptz | NO | CURRENT_TIMESTAMP |
| 5 | updated_at | timestamp with time zone | timestamptz | NO | CURRENT_TIMESTAMP |
| 6 | trusted_origins | jsonb | jsonb | NO |  |
| 7 | social_providers | jsonb | jsonb | NO |  |
| 8 | email_provider | jsonb | jsonb | YES |  |
| 9 | email_and_password | jsonb | jsonb | YES |  |
| 10 | allow_localhost | boolean | bool | NO |  |
| 11 | plugin_configs | jsonb | jsonb | YES |  |
| 12 | webhook_config | jsonb | jsonb | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| project_config_endpoint_id_key | u | UNIQUE (endpoint_id) |
| project_config_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| project_config_endpoint_id_key | CREATE UNIQUE INDEX project_config_endpoint_id_key ON neon_auth.project_config USING btree (endpoint_id) |
| project_config_pkey | CREATE UNIQUE INDEX project_config_pkey ON neon_auth.project_config USING btree (id) |

#### Triggers

_None._

### neon_auth.session

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | expiresAt | timestamp with time zone | timestamptz | NO |  |
| 3 | token | text | text | NO |  |
| 4 | createdAt | timestamp with time zone | timestamptz | NO | CURRENT_TIMESTAMP |
| 5 | updatedAt | timestamp with time zone | timestamptz | NO |  |
| 6 | ipAddress | text | text | YES |  |
| 7 | userAgent | text | text | YES |  |
| 8 | userId | uuid | uuid | NO |  |
| 9 | impersonatedBy | text | text | YES |  |
| 10 | activeOrganizationId | text | text | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| session_pkey | p | PRIMARY KEY (id) |
| session_token_key | u | UNIQUE (token) |
| session_userId_fkey | f | FOREIGN KEY ("userId") REFERENCES neon_auth."user"(id) ON DELETE CASCADE |

#### Indexes

| name | definition |
| --- | --- |
| session_pkey | CREATE UNIQUE INDEX session_pkey ON neon_auth.session USING btree (id) |
| session_token_key | CREATE UNIQUE INDEX session_token_key ON neon_auth.session USING btree (token) |
| session_userId_idx | CREATE INDEX "session_userId_idx" ON neon_auth.session USING btree ("userId") |

#### Triggers

_None._

### neon_auth.user

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | name | text | text | NO |  |
| 3 | email | text | text | NO |  |
| 4 | emailVerified | boolean | bool | NO |  |
| 5 | image | text | text | YES |  |
| 6 | createdAt | timestamp with time zone | timestamptz | NO | CURRENT_TIMESTAMP |
| 7 | updatedAt | timestamp with time zone | timestamptz | NO | CURRENT_TIMESTAMP |
| 8 | role | text | text | YES |  |
| 9 | banned | boolean | bool | YES |  |
| 10 | banReason | text | text | YES |  |
| 11 | banExpires | timestamp with time zone | timestamptz | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| user_email_key | u | UNIQUE (email) |
| user_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| user_email_key | CREATE UNIQUE INDEX user_email_key ON neon_auth."user" USING btree (email) |
| user_pkey | CREATE UNIQUE INDEX user_pkey ON neon_auth."user" USING btree (id) |

#### Triggers

_None._

### neon_auth.verification

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | uuid | uuid | NO | gen_random_uuid() |
| 2 | identifier | text | text | NO |  |
| 3 | value | text | text | NO |  |
| 4 | expiresAt | timestamp with time zone | timestamptz | NO |  |
| 5 | createdAt | timestamp with time zone | timestamptz | NO | CURRENT_TIMESTAMP |
| 6 | updatedAt | timestamp with time zone | timestamptz | NO | CURRENT_TIMESTAMP |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| verification_pkey | p | PRIMARY KEY (id) |

#### Indexes

| name | definition |
| --- | --- |
| verification_identifier_idx | CREATE INDEX verification_identifier_idx ON neon_auth.verification USING btree (identifier) |
| verification_pkey | CREATE UNIQUE INDEX verification_pkey ON neon_auth.verification USING btree (id) |

#### Triggers

_None._

## Views

_None._

## Routines

| schema | kind | signature | returns | language |
| --- | --- | --- | --- | --- |
| fountain | function | armor(bytea) | text | c |
| fountain | function | armor(bytea, text[], text[]) | text | c |
| fountain | function | assign_location_slug() | trigger | plpgsql |
| fountain | function | assign_practitioner_slug() | trigger | plpgsql |
| fountain | function | attach_location_image(p_location_id integer, p_blob_url text, p_image_url text, p_alt text, p_source_id integer, p_actor_id uuid) | integer | plpgsql |
| fountain | function | audit_entity_change() | trigger | plpgsql |
| fountain | function | create_location(p_location jsonb, p_actor_id uuid) | integer | plpgsql |
| fountain | function | crypt(text, text) | text | c |
| fountain | function | dearmor(text) | bytea | c |
| fountain | function | decrypt(bytea, bytea, text) | bytea | c |
| fountain | function | decrypt_iv(bytea, bytea, bytea, text) | bytea | c |
| fountain | function | delete_location_cascade(p_location_id integer, p_actor_id uuid, p_reason text) | void | plpgsql |
| fountain | function | digest(bytea, text) | bytea | c |
| fountain | function | digest(text, text) | bytea | c |
| fountain | function | encrypt(bytea, bytea, text) | bytea | c |
| fountain | function | encrypt_iv(bytea, bytea, bytea, text) | bytea | c |
| fountain | function | gen_random_bytes(integer) | bytea | c |
| fountain | function | gen_random_uuid() | uuid | c |
| fountain | function | gen_salt(text) | text | c |
| fountain | function | gen_salt(text, integer) | text | c |
| fountain | function | gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) | internal | c |
| fountain | function | gin_extract_value_trgm(text, internal) | internal | c |
| fountain | function | gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) | boolean | c |
| fountain | function | gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) | "char" | c |
| fountain | function | gtrgm_compress(internal) | internal | c |
| fountain | function | gtrgm_consistent(internal, text, smallint, oid, internal) | boolean | c |
| fountain | function | gtrgm_decompress(internal) | internal | c |
| fountain | function | gtrgm_distance(internal, text, smallint, oid, internal) | double precision | c |
| fountain | function | gtrgm_in(cstring) | gtrgm | c |
| fountain | function | gtrgm_options(internal) | void | c |
| fountain | function | gtrgm_out(gtrgm) | cstring | c |
| fountain | function | gtrgm_penalty(internal, internal, internal) | internal | c |
| fountain | function | gtrgm_picksplit(internal, internal) | internal | c |
| fountain | function | gtrgm_same(gtrgm, gtrgm, internal) | internal | c |
| fountain | function | gtrgm_union(internal, internal) | gtrgm | c |
| fountain | function | hmac(bytea, bytea, text) | bytea | c |
| fountain | function | hmac(text, text, text) | bytea | c |
| fountain | function | location_slug_base(p_name text, p_org_name text, p_locality text) | text | plpgsql |
| fountain | function | merge_locations(p_keep_location_id integer, p_delete_location_id integer, p_actor_id uuid, p_reason text) | void | plpgsql |
| fountain | function | pgp_armor_headers(text, OUT key text, OUT value text) | SETOF record | c |
| fountain | function | pgp_key_id(bytea) | text | c |
| fountain | function | pgp_pub_decrypt(bytea, bytea) | text | c |
| fountain | function | pgp_pub_decrypt(bytea, bytea, text) | text | c |
| fountain | function | pgp_pub_decrypt(bytea, bytea, text, text) | text | c |
| fountain | function | pgp_pub_decrypt_bytea(bytea, bytea) | bytea | c |
| fountain | function | pgp_pub_decrypt_bytea(bytea, bytea, text) | bytea | c |
| fountain | function | pgp_pub_decrypt_bytea(bytea, bytea, text, text) | bytea | c |
| fountain | function | pgp_pub_encrypt(text, bytea) | bytea | c |
| fountain | function | pgp_pub_encrypt(text, bytea, text) | bytea | c |
| fountain | function | pgp_pub_encrypt_bytea(bytea, bytea) | bytea | c |
| fountain | function | pgp_pub_encrypt_bytea(bytea, bytea, text) | bytea | c |
| fountain | function | pgp_sym_decrypt(bytea, text) | text | c |
| fountain | function | pgp_sym_decrypt(bytea, text, text) | text | c |
| fountain | function | pgp_sym_decrypt_bytea(bytea, text) | bytea | c |
| fountain | function | pgp_sym_decrypt_bytea(bytea, text, text) | bytea | c |
| fountain | function | pgp_sym_encrypt(text, text) | bytea | c |
| fountain | function | pgp_sym_encrypt(text, text, text) | bytea | c |
| fountain | function | pgp_sym_encrypt_bytea(bytea, text) | bytea | c |
| fountain | function | pgp_sym_encrypt_bytea(bytea, text, text) | bytea | c |
| fountain | function | practitioner_slug_base(p_full_name text) | text | sql |
| fountain | function | refresh_affiliation_search_index_trigger() | trigger | plpgsql |
| fountain | function | refresh_city_index() | void | plpgsql |
| fountain | function | refresh_entity_tag_search_index_trigger() | trigger | plpgsql |
| fountain | function | refresh_location_search_index_trigger() | trigger | plpgsql |
| fountain | function | refresh_offering_search_index_trigger() | trigger | plpgsql |
| fountain | function | refresh_practitioner_search_index_trigger() | trigger | plpgsql |
| fountain | function | refresh_search_index() | void | plpgsql |
| fountain | function | refresh_search_index_for_location(p_location_id integer) | void | plpgsql |
| fountain | function | refresh_search_index_for_practitioner(p_practitioner_id integer) | void | plpgsql |
| fountain | function | refresh_treatment_search_index_trigger() | trigger | plpgsql |
| fountain | function | replace_location_offerings(p_location_id integer, p_offerings jsonb, p_actor_id uuid) | integer | plpgsql |
| fountain | function | set_limit(real) | real | c |
| fountain | function | set_mutation_actor(p_actor_id uuid, p_actor_type text) | void | plpgsql |
| fountain | function | show_limit() | real | c |
| fountain | function | show_trgm(text) | text[] | c |
| fountain | function | similarity(text, text) | real | c |
| fountain | function | similarity_dist(text, text) | real | c |
| fountain | function | similarity_op(text, text) | boolean | c |
| fountain | function | slugify_listing_text(p_value text) | text | sql |
| fountain | function | strict_word_similarity(text, text) | real | c |
| fountain | function | strict_word_similarity_commutator_op(text, text) | boolean | c |
| fountain | function | strict_word_similarity_dist_commutator_op(text, text) | real | c |
| fountain | function | strict_word_similarity_dist_op(text, text) | real | c |
| fountain | function | strict_word_similarity_op(text, text) | boolean | c |
| fountain | function | touch_updated_at() | trigger | plpgsql |
| fountain | function | unaccent(regdictionary, text) | text | c |
| fountain | function | unaccent(text) | text | c |
| fountain | function | unaccent_init(internal) | internal | c |
| fountain | function | unaccent_lexize(internal, internal, internal, internal) | internal | c |
| fountain | function | unique_location_slug(p_location_id integer, p_name text, p_org_name text, p_locality text) | text | plpgsql |
| fountain | function | unique_practitioner_slug(p_practitioner_id integer, p_full_name text) | text | plpgsql |
| fountain | function | word_similarity(text, text) | real | c |
| fountain | function | word_similarity_commutator_op(text, text) | boolean | c |
| fountain | function | word_similarity_dist_commutator_op(text, text) | real | c |
| fountain | function | word_similarity_dist_op(text, text) | real | c |
| fountain | function | word_similarity_op(text, text) | boolean | c |
