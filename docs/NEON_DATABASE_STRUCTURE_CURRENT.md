# Neon Database Structure Current

Generated: 2026-07-08T07:02:33.846Z
Updated after reviews dedupe closeout: 2026-07-08

This document is generated from the live Neon schema after the 2026-07-08 structural streamlining migration. `fountain` is the serving schema; `fountain_raw` owns raw source data, migration audit tables, and ETL working tables.

## Streamlining Summary

- Pipeline tables moved to raw: `fountain_raw.unmapped_terms`, `fountain_raw.treatment_aliases`, `fountain_raw.import_metadata`.
- Retired serving tables removed: `fountain.external_reviews`, `fountain.categories`, `fountain.documents`.
- Reviews merged into `fountain.reviews`: 12182 total rows, 9164 Google rows inserted, 0 deduped.
- Reviews closeout dedupe: 591 duplicate groups found, 627 rows backed up/deleted, 11555 final rows.
- Google review date parse nulls: 0.
- Price text backup rows: 610 in `fountain_raw.locations_price_text_backup`.
- Source metadata source-of-truth: `fountain_raw.source_databases`; slim `fountain.sources` remains as FK target. Source slug match: 254 matched, 0 raw-only, 0 serving-only.

## Table Counts

| schema | table | rows |
| --- | --- | --- |
| fountain | accounts | 0 |
| fountain | affiliations | 96 |
| fountain | clinic_claims | 0 |
| fountain | entity_change_events | 21002 |
| fountain | entity_tags | 5498 |
| fountain | external_place_matches | 2544 |
| fountain | images | 27415 |
| fountain | listing_submissions | 0 |
| fountain | locations | 13118 |
| fountain | offerings | 79566 |
| fountain | organizations | 7089 |
| fountain | practitioners | 1303 |
| fountain | reviews | 11555 |
| fountain | search_index | 14407 |
| fountain | source_records | 40239 |
| fountain | sources | 254 |
| fountain | tags | 36 |
| fountain | treatments | 43 |
| fountain_raw | closeout_approved_website_matches_20260707 | 4 |
| fountain_raw | closeout_documents_deleted_20260707 | 1 |
| fountain_raw | closeout_duplicate_domain_review_20260707 | 47 |
| fountain_raw | closeout_hidden_locations_20260707 | 3 |
| fountain_raw | closeout_org_merges_20260707 | 9 |
| fountain_raw | closeout_source_records_org_backup_20260707 | 114 |
| fountain_raw | import_metadata | 3 |
| fountain_raw | import_runs | 284 |
| fountain_raw | location_followup_audit_20260707 | 54 |
| fountain_raw | location_followup_backup_20260707 | 25 |
| fountain_raw | location_followup_deletion_review_20260707 | 9 |
| fountain_raw | location_followup_review_cleared_20260707 | 26 |
| fountain_raw | location_geocode_addendum_audit_20260707 | 845 |
| fountain_raw | location_geocode_addendum_backup_20260707 | 353 |
| fountain_raw | location_geocode_addendum_country_fix_20260707 | 40 |
| fountain_raw | location_geocode_addendum_recovered_20260707 | 313 |
| fountain_raw | location_geocode_backfill_audit_20260707 | 8853 |
| fountain_raw | location_geocode_coordinate_backup_20260707 | 10394 |
| fountain_raw | location_geocode_locality_audit_20260707 | 2183 |
| fountain_raw | location_geocode_low_confidence_20260707 | 1265 |
| fountain_raw | location_geocode_wrong_branch_address_20260707 | 13 |
| fountain_raw | location_normalization_audit_20260707 | 9398 |
| fountain_raw | location_normalization_review_20260707 | 406 |
| fountain_raw | location_wrong_branch_mini_fix_accepted_20260707 | 95 |
| fountain_raw | location_wrong_branch_mini_fix_audit_20260707 | 480 |
| fountain_raw | location_wrong_branch_mini_fix_backup_20260707 | 97 |
| fountain_raw | location_wrong_branch_mini_fix_deletion_review_20260707 | 2 |
| fountain_raw | location_wrong_branch_mini_fix_resolved_review_20260707 | 97 |
| fountain_raw | locations_price_text_backup | 610 |
| fountain_raw | org_dedup_phase2_deleted_orgs_20260707 | 1 |
| fountain_raw | org_dedup_phase2_guardrail_20260707 | 106 |
| fountain_raw | org_dedup_phase2_location_org_map_20260707 | 1088 |
| fountain_raw | org_dedup_phase2_new_orgs_20260707 | 410 |
| fountain_raw | places_website_backfill_guardrail_20260707 | 9 |
| fountain_raw | places_website_backfill_location_actions_20260707 | 331 |
| fountain_raw | places_website_backfill_new_orgs_20260707 | 214 |
| fountain_raw | places_website_backfill_org_map_20260707 | 308 |
| fountain_raw | reviews_dedupe_deleted_20260708 | 627 |
| fountain_raw | reviews_dedupe_report_20260708 | 1 |
| fountain_raw | schema_streamlining_categories_backup_20260708 | 7 |
| fountain_raw | schema_streamlining_documents_backup_20260708 | 0 |
| fountain_raw | schema_streamlining_external_place_matches_text_backup_20260708 | 2544 |
| fountain_raw | schema_streamlining_images_local_path_backup_20260708 | 0 |
| fountain_raw | schema_streamlining_pre_migration_counts_20260708 | 1 |
| fountain_raw | schema_streamlining_retired_raw_tables_20260708 | 15 |
| fountain_raw | schema_streamlining_review_format_audit_20260708 | 2 |
| fountain_raw | schema_streamlining_review_migration_audit_20260708 | 1 |
| fountain_raw | schema_streamlining_sources_backup_20260708 | 254 |
| fountain_raw | schema_streamlining_treatments_backup_20260708 | 43 |
| fountain_raw | source_databases | 254 |
| fountain_raw | source_images | 33235 |
| fountain_raw | source_listing_fields | 135622 |
| fountain_raw | source_listings | 22158 |
| fountain_raw | source_reviews | 3647 |
| fountain_raw | treatment_aliases | 95 |
| fountain_raw | unmapped_terms | 53607 |
| neon_auth | account | 0 |
| neon_auth | invitation | 0 |
| neon_auth | jwks | 0 |
| neon_auth | member | 0 |
| neon_auth | organization | 0 |
| neon_auth | project_config | 1 |
| neon_auth | session | 0 |
| neon_auth | user | 0 |
| neon_auth | verification | 0 |

## Review Migration Audit

| scrape_reviews_before | external_reviews_before | external_reviews_inserted | external_reviews_deduped | external_review_dates_null_after_parse | scrape_ratings_null_after_parse | scrape_review_dates_null_after_parse | reviews_after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3018 | 9164 | 9164 | 0 | 0 | 0 | 5 | 12182 |

## Review Format Audit

| source_table | provider | total_rows | timestamp_review_dates | relative_review_dates | singular_relative_review_dates | unparseable_review_dates | null_ratings | unparseable_ratings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| external_reviews | google | 9164 | 9164 | 0 | 0 | 0 | 0 | 0 |
| reviews | scrape | 3018 | 2818 | 0 | 0 | 5 | 0 | 0 |

## Reviews Dedupe Closeout

| duplicate_groups_found | rows_deleted | reviews_before | reviews_after | backup_rows |
| --- | --- | --- | --- | --- |
| 591 | 627 | 12182 | 11555 | 627 |

## Retired Raw Backup Tables

| table_name | total_bytes |
| --- | --- |
| locations_backup_20260707_places_website_backfill | 5808128 |
| closeout_locations_backup_20260707 | 5808128 |
| locations_backup_20260707_org_dedup_phase2 | 5808128 |
| locations_backup_20260707_location_normalization | 5808128 |
| entity_tags_backup_20260707 | 4235264 |
| closeout_organizations_backup_20260707 | 4096000 |
| organizations_backup_20260707_places_website_backfill | 4079616 |
| organizations_backup_20260707_org_dedup_phase2 | 4079616 |
| closeout_document_search_index_backup_20260707 | 3383296 |
| closeout_documents_backup_20260707 | 1474560 |
| service_area_entity_tags_backup_20260707 | 155648 |
| tags_backup_20260707 | 139264 |
| closeout_document_source_records_backup_20260707 | 139264 |
| service_area_tags_backup_20260707 | 73728 |
| service_area_entities_backup_20260707 | 40960 |

## Example Content

### fountain.sources

| id | slug | trust_weight |
| --- | --- | --- |
| 1 | best_executive_physical_programs | 1 |
| 2 | bioedge_clinics | 1 |
| 3 | biohacking_map | 1 |
| 4 | bookimed_longevity | 1 |
| 5 | bookimed_longevity_doctors | 1 |

### fountain.treatments

| id | canonical_name | category |
| --- | --- | --- |
| 36 | Aesthetic medicine | Aesthetic |
| 34 | Botox | Aesthetic |
| 35 | Dermal fillers | Aesthetic |
| 38 | Med spa | Aesthetic |
| 37 | Microcurrent therapy | Aesthetic |
| 7 | Advanced biomarker panel | Diagnostics & testing |
| 6 | Advanced blood panel | Diagnostics & testing |
| 4 | Body composition analysis | Diagnostics & testing |
| 10 | Cancer screening | Diagnostics & testing |
| 11 | Cardiac screening | Diagnostics & testing |

### fountain.reviews

| id | location_id | provider | author | rating | review_date | text_sample | provider_place_id |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1726 | scrape | {"@type": "Person", "name": "Tamara Zarchenko"} | 1 | Thu Dec 07 2023 00:00:00 GMT-0800 (Pacific Standard Time) |  |  |
| 2 | 1726 | scrape | {"@type": "Person", "name": "MENASHE "} | 5 | Sun Nov 06 2022 00:00:00 GMT-0700 (Pacific Daylight Time) |  |  |
| 3 | 1727 | scrape | {"@type": "Person", "name": "Anonymous"} | 5 | Sun May 24 2026 00:00:00 GMT-0700 (Pacific Daylight Time) | My biggest worry was how the final result would look, and whether it would be wo |  |
| 4 | 1727 | scrape | {"@type": "Person", "name": "Anonymous"} | 5 | Thu May 21 2026 00:00:00 GMT-0700 (Pacific Daylight Time) | My biggest concern going into this was the recovery process and what the final r |  |
| 5 | 1727 | scrape | {"@type": "Person", "name": "Taylor "} | 5 | Wed Jun 17 2026 00:00:00 GMT-0700 (Pacific Daylight Time) | The clinic was so nice and beautiful. Staff was friendly and my doctor was very  |  |
| 6 | 1727 | scrape | {"@type": "Person", "name": "Anonymous"} | 5 | Sat Apr 18 2026 00:00:00 GMT-0700 (Pacific Daylight Time) | My biggest worry going into this was the recovery pain. Honestly, the most chall |  |
| 7 | 1727 | scrape | {"@type": "Person", "name": "Magdalena Kubiak"} | 5 | Fri Apr 17 2026 00:00:00 GMT-0700 (Pacific Daylight Time) | My biggest worry was the recovery pain, but it turned out to be manageable. At 1 |  |
| 8 | 1727 | scrape | {"@type": "Person", "name": "Anonymous"} | 5 | Mon Jul 14 2025 00:00:00 GMT-0700 (Pacific Daylight Time) | I am very grateful to the company Bukimed and my coordinators Kristina and Ali,  |  |

### fountain.external_place_matches

| location_id | provider | provider_place_id | rating | review_count | fetched_at | has_raw_json |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | google | ChIJyUfKkVNbwokRVecLkdjYGQU | 5 | 5 | Fri Jul 03 2026 17:58:55 GMT-0700 (Pacific Daylight Time) | false |
| 2 | google | ChIJWeE1WSBawokRZ5bRk-v1WVs | 4.7 | 993 | Fri Jul 03 2026 17:49:01 GMT-0700 (Pacific Daylight Time) | false |
| 3 | google | ChIJhfc5RxdawokRXqv4I-l1H34 | 4.8 | 740 | Fri Jul 03 2026 17:50:05 GMT-0700 (Pacific Daylight Time) | false |
| 4 | google | ChIJpZo0r6hbwokR6FrNq5I9SaM | 4.9 | 157 | Fri Jul 03 2026 17:58:55 GMT-0700 (Pacific Daylight Time) | false |
| 5 | google | ChIJcWceiTFbwokRMJyc0ab1DDk | 5 | 121 | Fri Jul 03 2026 17:58:55 GMT-0700 (Pacific Daylight Time) | false |
| 6 | google | ChIJ21LTzhdawokRMWblsCSLgxo | 5 | 54 | Fri Jul 03 2026 17:58:55 GMT-0700 (Pacific Daylight Time) | false |
| 7 | google | ChIJa1EQUplbwokRsGU08Ckzjn4 | 5 | 18 | Fri Jul 03 2026 17:58:55 GMT-0700 (Pacific Daylight Time) | false |
| 8 | google | ChIJ10_aSxlawokRZZm6EuNuwVw | 5 | 42 | Fri Jul 03 2026 17:58:55 GMT-0700 (Pacific Daylight Time) | false |

### fountain.locations

| id | slug | name | locality | region | country_code | latitude | longitude | is_virtual | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | biograph-new-york | Biograph | New York | NY | US | 40.7114474 | -74.0075074 | false | active |
| 2 | hudson-medical-new-york | Hudson Medical | New York | NY | US | 40.7145417 | -74.0063191 | false | active |
| 3 | gotham-footcare-and-podiatry-downtown-new-york | Gotham Footcare and Podiatry - Downtown | New York | NY | US | 40.7126898 | -74.0083429 | false | active |
| 4 | tribeca-physical-therapy-new-york | Tribeca Physical Therapy | New York | NY | US | 40.7119709 | -74.0086193 | false | active |
| 5 | ilm-wellness-endospheres-therapy-laser-lipo-rf-new-york | ILM Wellness \| Endospheres Therapy + Laser Lipo + RF | New York | NY | US | 40.7104706 | -74.0077899 | false | active |
| 6 | reset-physical-therapy-new-york | RESET Physical Therapy | New York | NY | US | 40.7104617 | -74.0077673 | false | active |
| 7 | md-hyperbaric-new-york | MD Hyperbaric | New York | NY | US | 40.7160547 | -74.0101601 | false | active |
| 8 | elitra-health-new-york | Elitra Health | New York | NY | US | 40.714288 | -74.0110969 | false | active |

### fountain_raw.source_databases

| source_slug | listing_count | image_count | review_count | field_count | page_count | sync_status |
| --- | --- | --- | --- | --- | --- | --- |
| best_executive_physical_programs | 10 | 10 | 0 | 50 | 1 | complete |
| bioedge_clinics | 1472 | 0 | 0 | 5888 | 1571 | complete |
| biohacking_map | 343 | 0 | 0 | 2418 | 2 | complete |
| bookimed_longevity | 257 | 1696 | 641 | 0 | 283 | complete |
| bookimed_longevity_doctors | 98 | 0 | 0 | 581 | 104 | complete |
| bookimed_longevity_doctors_thailand | 26 | 0 | 0 | 156 | 31 | complete |
| bookimed_longevity_doctors_turkey | 30 | 0 | 0 | 176 | 35 | complete |
| bookimed_longevity_korea | 14 | 136 | 187 | 0 | 22 | complete |

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

| name | timing | event |
| --- | --- | --- |
| trg_touch_updated_at | BEFORE | UPDATE |

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
| affiliations_data_origin_valid | c | CHECK ((data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text]))) |
| affiliations_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) |
| affiliations_org_id_fkey | f | FOREIGN KEY (org_id) REFERENCES organizations(id) |
| affiliations_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| affiliations_pkey | p | PRIMARY KEY (id) |
| affiliations_practitioner_id_fkey | f | FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) |
| affiliations_practitioner_id_location_id_org_id_key | u | UNIQUE (practitioner_id, location_id, org_id) |
| affiliations_status_valid | c | CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text]))) |

#### Indexes

| name | definition |
| --- | --- |
| affiliations_pkey | CREATE UNIQUE INDEX affiliations_pkey ON fountain.affiliations USING btree (id) |
| affiliations_practitioner_id_location_id_org_id_key | CREATE UNIQUE INDEX affiliations_practitioner_id_location_id_org_id_key ON fountain.affiliations USING btree (practitioner_id, location_id, org_id) |
| idx_affiliations_loc | CREATE INDEX idx_affiliations_loc ON fountain.affiliations USING btree (location_id) |
| idx_affiliations_prac | CREATE INDEX idx_affiliations_prac ON fountain.affiliations USING btree (practitioner_id) |

#### Triggers

| name | timing | event |
| --- | --- | --- |
| trg_audit_entity_change | AFTER | DELETE |
| trg_audit_entity_change | AFTER | INSERT |
| trg_audit_entity_change | AFTER | UPDATE |
| trg_refresh_affiliation_search_index | AFTER | DELETE |
| trg_refresh_affiliation_search_index | AFTER | INSERT |
| trg_refresh_affiliation_search_index | AFTER | UPDATE |
| trg_touch_updated_at | BEFORE | UPDATE |

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
| clinic_claims_status_valid | c | CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'revoked'::text]))) |
| clinic_claims_target_required | c | CHECK (((location_id IS NOT NULL) OR (org_id IS NOT NULL))) |

#### Indexes

| name | definition |
| --- | --- |
| clinic_claims_pkey | CREATE UNIQUE INDEX clinic_claims_pkey ON fountain.clinic_claims USING btree (id) |
| clinic_claims_public_id_unique | CREATE UNIQUE INDEX clinic_claims_public_id_unique ON fountain.clinic_claims USING btree (public_id) |
| idx_clinic_claims_account_status | CREATE INDEX idx_clinic_claims_account_status ON fountain.clinic_claims USING btree (account_id, status) |
| idx_clinic_claims_location | CREATE INDEX idx_clinic_claims_location ON fountain.clinic_claims USING btree (location_id) WHERE (location_id IS NOT NULL) |

#### Triggers

| name | timing | event |
| --- | --- | --- |
| trg_touch_updated_at | BEFORE | UPDATE |

### fountain.entity_change_events

Rows: 20375

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

Rows: 5498

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

| name | timing | event |
| --- | --- | --- |
| trg_refresh_entity_tag_search_index | AFTER | DELETE |
| trg_refresh_entity_tag_search_index | AFTER | INSERT |
| trg_refresh_entity_tag_search_index | AFTER | UPDATE |

### fountain.external_place_matches

Rows: 2544

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

Rows: 27415

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

#### Constraints

| name | type | definition |
| --- | --- | --- |
| images_blob_backed | c | CHECK (((blob_url IS NOT NULL) AND (blob_url <> ''::text))) |
| images_data_origin_valid | c | CHECK ((data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text]))) |
| images_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| images_pkey | p | PRIMARY KEY (id) |
| images_source_id_fkey | f | FOREIGN KEY (source_id) REFERENCES sources(id) |
| images_status_valid | c | CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text]))) |

#### Indexes

| name | definition |
| --- | --- |
| idx_images_blob_url | CREATE INDEX idx_images_blob_url ON fountain.images USING btree (blob_url) |
| idx_images_entity | CREATE INDEX idx_images_entity ON fountain.images USING btree (entity_type, entity_id) |
| images_pkey | CREATE UNIQUE INDEX images_pkey ON fountain.images USING btree (id) |

#### Triggers

| name | timing | event |
| --- | --- | --- |
| trg_audit_entity_change | AFTER | DELETE |
| trg_audit_entity_change | AFTER | INSERT |
| trg_audit_entity_change | AFTER | UPDATE |
| trg_touch_updated_at | BEFORE | UPDATE |

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
| listing_submissions_status_valid | c | CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text, 'applied'::text]))) |
| listing_submissions_type_valid | c | CHECK ((submission_type = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'claim'::text, 'merge'::text]))) |

#### Indexes

| name | definition |
| --- | --- |
| idx_listing_submissions_status_created | CREATE INDEX idx_listing_submissions_status_created ON fountain.listing_submissions USING btree (status, created_at DESC) |
| idx_listing_submissions_target | CREATE INDEX idx_listing_submissions_target ON fountain.listing_submissions USING btree (target_entity_type, target_entity_id) WHERE ((target_entity_type IS NOT NULL) AND (target_entity_id IS NOT NULL)) |
| listing_submissions_pkey | CREATE UNIQUE INDEX listing_submissions_pkey ON fountain.listing_submissions USING btree (id) |
| listing_submissions_public_id_unique | CREATE UNIQUE INDEX listing_submissions_public_id_unique ON fountain.listing_submissions USING btree (public_id) |

#### Triggers

| name | timing | event |
| --- | --- | --- |
| trg_touch_updated_at | BEFORE | UPDATE |

### fountain.locations

Rows: 13118

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
| locations_data_origin_valid | c | CHECK ((data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text]))) |
| locations_org_id_fkey | f | FOREIGN KEY (org_id) REFERENCES organizations(id) |
| locations_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| locations_pkey | p | PRIMARY KEY (id) |
| locations_status_valid | c | CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text]))) |

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

| name | timing | event |
| --- | --- | --- |
| trg_assign_location_slug | BEFORE | INSERT |
| trg_assign_location_slug | BEFORE | UPDATE |
| trg_audit_entity_change | AFTER | DELETE |
| trg_audit_entity_change | AFTER | INSERT |
| trg_audit_entity_change | AFTER | UPDATE |
| trg_refresh_location_search_index | AFTER | DELETE |
| trg_refresh_location_search_index | AFTER | INSERT |
| trg_refresh_location_search_index | AFTER | UPDATE |
| trg_touch_updated_at | BEFORE | UPDATE |

### fountain.offerings

Rows: 79566

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
| offerings_data_origin_valid | c | CHECK ((data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text]))) |
| offerings_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) |
| offerings_location_id_source_id_raw_name_key | u | UNIQUE (location_id, source_id, raw_name) |
| offerings_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| offerings_pkey | p | PRIMARY KEY (id) |
| offerings_source_id_fkey | f | FOREIGN KEY (source_id) REFERENCES sources(id) |
| offerings_status_valid | c | CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text]))) |
| offerings_treatment_id_fkey | f | FOREIGN KEY (treatment_id) REFERENCES treatments(id) |

#### Indexes

| name | definition |
| --- | --- |
| idx_offerings_location | CREATE INDEX idx_offerings_location ON fountain.offerings USING btree (location_id) |
| idx_offerings_treatment | CREATE INDEX idx_offerings_treatment ON fountain.offerings USING btree (treatment_id) |
| offerings_location_id_source_id_raw_name_key | CREATE UNIQUE INDEX offerings_location_id_source_id_raw_name_key ON fountain.offerings USING btree (location_id, source_id, raw_name) |
| offerings_pkey | CREATE UNIQUE INDEX offerings_pkey ON fountain.offerings USING btree (id) |

#### Triggers

| name | timing | event |
| --- | --- | --- |
| trg_audit_entity_change | AFTER | DELETE |
| trg_audit_entity_change | AFTER | INSERT |
| trg_audit_entity_change | AFTER | UPDATE |
| trg_refresh_offering_search_index | AFTER | DELETE |
| trg_refresh_offering_search_index | AFTER | INSERT |
| trg_refresh_offering_search_index | AFTER | UPDATE |
| trg_touch_updated_at | BEFORE | UPDATE |

### fountain.organizations

Rows: 7089

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
| organizations_data_origin_valid | c | CHECK ((data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text]))) |
| organizations_dedup_key_key | u | UNIQUE (dedup_key) |
| organizations_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| organizations_pkey | p | PRIMARY KEY (id) |
| organizations_status_valid | c | CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text]))) |

#### Indexes

| name | definition |
| --- | --- |
| idx_organizations_public_id | CREATE UNIQUE INDEX idx_organizations_public_id ON fountain.organizations USING btree (public_id) |
| organizations_dedup_key_key | CREATE UNIQUE INDEX organizations_dedup_key_key ON fountain.organizations USING btree (dedup_key) |
| organizations_pkey | CREATE UNIQUE INDEX organizations_pkey ON fountain.organizations USING btree (id) |

#### Triggers

| name | timing | event |
| --- | --- | --- |
| trg_audit_entity_change | AFTER | DELETE |
| trg_audit_entity_change | AFTER | INSERT |
| trg_audit_entity_change | AFTER | UPDATE |
| trg_touch_updated_at | BEFORE | UPDATE |

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
| practitioners_data_origin_valid | c | CHECK ((data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text]))) |
| practitioners_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| practitioners_pkey | p | PRIMARY KEY (id) |
| practitioners_status_valid | c | CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text]))) |

#### Indexes

| name | definition |
| --- | --- |
| idx_practitioners_public_id | CREATE UNIQUE INDEX idx_practitioners_public_id ON fountain.practitioners USING btree (public_id) |
| idx_practitioners_slug | CREATE UNIQUE INDEX idx_practitioners_slug ON fountain.practitioners USING btree (slug) |
| practitioners_pkey | CREATE UNIQUE INDEX practitioners_pkey ON fountain.practitioners USING btree (id) |

#### Triggers

| name | timing | event |
| --- | --- | --- |
| trg_assign_practitioner_slug | BEFORE | INSERT |
| trg_assign_practitioner_slug | BEFORE | UPDATE |
| trg_audit_entity_change | AFTER | DELETE |
| trg_audit_entity_change | AFTER | INSERT |
| trg_audit_entity_change | AFTER | UPDATE |
| trg_refresh_practitioner_search_index | AFTER | DELETE |
| trg_refresh_practitioner_search_index | AFTER | INSERT |
| trg_refresh_practitioner_search_index | AFTER | UPDATE |
| trg_touch_updated_at | BEFORE | UPDATE |

### fountain.reviews

Rows: 11555

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
| reviews_data_origin_valid | c | CHECK ((data_origin = ANY (ARRAY['imported'::text, 'scraped'::text, 'manual'::text, 'owner'::text, 'system'::text]))) |
| reviews_location_id_fkey | f | FOREIGN KEY (location_id) REFERENCES locations(id) |
| reviews_owner_account_fk | f | FOREIGN KEY (owner_account_id) REFERENCES accounts(id) ON DELETE SET NULL |
| reviews_pkey | p | PRIMARY KEY (id) |
| reviews_source_id_fkey | f | FOREIGN KEY (source_id) REFERENCES sources(id) |
| reviews_status_valid | c | CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text, 'draft'::text, 'hidden'::text, 'deleted'::text]))) |

#### Indexes

| name | definition |
| --- | --- |
| reviews_pkey | CREATE UNIQUE INDEX reviews_pkey ON fountain.reviews USING btree (id) |

#### Triggers

| name | timing | event |
| --- | --- | --- |
| trg_audit_entity_change | AFTER | DELETE |
| trg_audit_entity_change | AFTER | INSERT |
| trg_audit_entity_change | AFTER | UPDATE |
| trg_touch_updated_at | BEFORE | UPDATE |

### fountain.search_index

Rows: 14407

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

Rows: 40239

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

Rows: 254

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | slug | text | text | NO |  |
| 6 | trust_weight | double precision | float8 | YES | 1.0 |

#### Constraints

| name | type | definition |
| --- | --- | --- |
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

### fountain.treatments

Rows: 43

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

| name | timing | event |
| --- | --- | --- |
| trg_refresh_treatment_search_index | AFTER | DELETE |
| trg_refresh_treatment_search_index | AFTER | UPDATE |

### fountain_raw.closeout_approved_website_matches_20260707

Rows: 4

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | YES |  |
| 2 | location_name | text | text | YES |  |
| 3 | old_website | text | text | YES |  |
| 4 | new_website | text | text | YES |  |
| 5 | old_phone | text | text | YES |  |
| 6 | new_phone | text | text | YES |  |
| 7 | domain | text | text | YES |  |
| 8 | raw_payload | jsonb | jsonb | YES |  |
| 9 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.closeout_documents_deleted_20260707

Rows: 1

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | documents_deleted | integer | int4 | YES |  |
| 2 | document_source_records_deleted | integer | int4 | YES |  |
| 3 | document_search_rows_deleted | integer | int4 | YES |  |
| 4 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.closeout_duplicate_domain_review_20260707

Rows: 47

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | domain | text | text | YES |  |
| 2 | org_count | integer | int4 | YES |  |
| 3 | reason | text | text | YES |  |
| 4 | orgs | jsonb | jsonb | YES |  |
| 5 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.closeout_hidden_locations_20260707

Rows: 3

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | YES |  |
| 2 | location_name | text | text | YES |  |
| 3 | old_status | text | text | YES |  |
| 4 | new_status | text | text | YES |  |
| 5 | reason | text | text | YES |  |
| 6 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.closeout_org_merges_20260707

Rows: 9

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | domain | text | text | YES |  |
| 2 | keeper_org_id | integer | int4 | YES |  |
| 3 | loser_org_ids | ARRAY | _int4 | YES |  |
| 4 | canonical_name | text | text | YES |  |
| 5 | reason | text | text | YES |  |
| 6 | orgs | jsonb | jsonb | YES |  |
| 7 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.closeout_source_records_org_backup_20260707

Rows: 114

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
| 2 | source_id | integer | int4 | YES |  |
| 3 | entity_type | text | text | YES |  |
| 4 | entity_id | integer | int4 | YES |  |
| 5 | source_listing_id | integer | int4 | YES |  |
| 6 | source_url | text | text | YES |  |
| 7 | raw_ref | text | text | YES |  |

#### Constraints

_None._

#### Indexes

_None._

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

Rows: 284

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

### fountain_raw.location_followup_audit_20260707

Rows: 54

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | field | text | text | NO |  |
| 3 | old_value | text | text | YES |  |
| 4 | new_value | text | text | YES |  |
| 5 | rule | text | text | NO |  |
| 6 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.location_followup_backup_20260707

Rows: 25

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
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
| 15 | price_text | text | text | YES |  |
| 16 | dedup_key | text | text | YES |  |
| 17 | public_id | uuid | uuid | YES |  |
| 18 | status | text | text | YES |  |
| 19 | data_origin | text | text | YES |  |
| 20 | verification_status | text | text | YES |  |
| 21 | created_at | timestamp with time zone | timestamptz | YES |  |
| 22 | updated_at | timestamp with time zone | timestamptz | YES |  |
| 23 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 24 | owner_account_id | uuid | uuid | YES |  |
| 25 | slug | text | text | YES |  |
| 26 | is_virtual | boolean | bool | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.location_followup_deletion_review_20260707

Rows: 9

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | slug | text | text | YES |  |
| 4 | old_status | text | text | YES |  |
| 5 | new_status | text | text | YES |  |
| 6 | reason | text | text | NO |  |
| 7 | detail | jsonb | jsonb | YES |  |
| 8 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_followup_deletion_review_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_followup_deletion_review_20260707_pkey | CREATE UNIQUE INDEX location_followup_deletion_review_20260707_pkey ON fountain_raw.location_followup_deletion_review_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_followup_review_cleared_20260707

Rows: 26

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | reason | text | text | NO |  |
| 4 | detail | jsonb | jsonb | YES |  |
| 5 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.location_geocode_addendum_audit_20260707

Rows: 845

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | field | text | text | NO |  |
| 3 | old_value | text | text | YES |  |
| 4 | new_value | text | text | YES |  |
| 5 | rule | text | text | NO |  |
| 6 | formatted_address | text | text | YES |  |
| 7 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.location_geocode_addendum_backup_20260707

Rows: 353

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
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
| 15 | price_text | text | text | YES |  |
| 16 | dedup_key | text | text | YES |  |
| 17 | public_id | uuid | uuid | YES |  |
| 18 | status | text | text | YES |  |
| 19 | data_origin | text | text | YES |  |
| 20 | verification_status | text | text | YES |  |
| 21 | created_at | timestamp with time zone | timestamptz | YES |  |
| 22 | updated_at | timestamp with time zone | timestamptz | YES |  |
| 23 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 24 | owner_account_id | uuid | uuid | YES |  |
| 25 | slug | text | text | YES |  |
| 26 | is_virtual | boolean | bool | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.location_geocode_addendum_country_fix_20260707

Rows: 40

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | old_country_code | text | text | YES |  |
| 4 | new_country_code | text | text | YES |  |
| 5 | old_country_name | text | text | YES |  |
| 6 | new_country_name | text | text | YES |  |
| 7 | old_region | text | text | YES |  |
| 8 | new_region | text | text | YES |  |
| 9 | old_locality | text | text | YES |  |
| 10 | new_locality | text | text | YES |  |
| 11 | new_latitude | double precision | float8 | YES |  |
| 12 | new_longitude | double precision | float8 | YES |  |
| 13 | formatted_address | text | text | YES |  |
| 14 | location_type | text | text | YES |  |
| 15 | result_types | ARRAY | _text | YES |  |
| 16 | rule | text | text | NO |  |
| 17 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_geocode_addendum_country_fix_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_geocode_addendum_country_fix_20260707_pkey | CREATE UNIQUE INDEX location_geocode_addendum_country_fix_20260707_pkey ON fountain_raw.location_geocode_addendum_country_fix_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_geocode_addendum_recovered_20260707

Rows: 313

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | new_latitude | double precision | float8 | YES |  |
| 4 | new_longitude | double precision | float8 | YES |  |
| 5 | formatted_address | text | text | YES |  |
| 6 | location_type | text | text | YES |  |
| 7 | result_types | ARRAY | _text | YES |  |
| 8 | result_country_code | text | text | YES |  |
| 9 | rule | text | text | NO |  |
| 10 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_geocode_addendum_recovered_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_geocode_addendum_recovered_20260707_pkey | CREATE UNIQUE INDEX location_geocode_addendum_recovered_20260707_pkey ON fountain_raw.location_geocode_addendum_recovered_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_geocode_backfill_audit_20260707

Rows: 8853

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | old_latitude | double precision | float8 | YES |  |
| 3 | old_longitude | double precision | float8 | YES |  |
| 4 | new_latitude | double precision | float8 | NO |  |
| 5 | new_longitude | double precision | float8 | NO |  |
| 6 | formatted_address | text | text | YES |  |
| 7 | location_type | text | text | YES |  |
| 8 | result_types | ARRAY | _text | YES |  |
| 9 | result_country_code | text | text | YES |  |
| 10 | rule | text | text | NO |  |
| 11 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_geocode_backfill_audit_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_geocode_backfill_audit_20260707_pkey | CREATE UNIQUE INDEX location_geocode_backfill_audit_20260707_pkey ON fountain_raw.location_geocode_backfill_audit_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_geocode_coordinate_backup_20260707

Rows: 10394

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | name | text | text | YES |  |
| 3 | address | text | text | YES |  |
| 4 | country_code | text | text | YES |  |
| 5 | old_latitude | double precision | float8 | YES |  |
| 6 | old_longitude | double precision | float8 | YES |  |
| 7 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_geocode_coordinate_backup_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_geocode_coordinate_backup_20260707_pkey | CREATE UNIQUE INDEX location_geocode_coordinate_backup_20260707_pkey ON fountain_raw.location_geocode_coordinate_backup_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_geocode_locality_audit_20260707

Rows: 2183

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | old_locality | text | text | YES |  |
| 4 | parsed_city | text | text | YES |  |
| 5 | geocoded_locality | text | text | NO |  |
| 6 | new_locality | text | text | NO |  |
| 7 | formatted_address | text | text | YES |  |
| 8 | location_type | text | text | YES |  |
| 9 | result_country_code | text | text | YES |  |
| 10 | rule | text | text | NO |  |
| 11 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_geocode_locality_audit_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_geocode_locality_audit_20260707_pkey | CREATE UNIQUE INDEX location_geocode_locality_audit_20260707_pkey ON fountain_raw.location_geocode_locality_audit_20260707 USING btree (location_id) |

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

### fountain_raw.location_geocode_wrong_branch_address_20260707

Rows: 13

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | current_locality | text | text | YES |  |
| 4 | current_region | text | text | YES |  |
| 5 | current_country_code | text | text | YES |  |
| 6 | formatted_address | text | text | YES |  |
| 7 | result_country_code | text | text | YES |  |
| 8 | location_type | text | text | YES |  |
| 9 | result_types | ARRAY | _text | YES |  |
| 10 | reason | text | text | NO |  |
| 11 | claimed_place | text | text | YES |  |
| 12 | detail | jsonb | jsonb | YES |  |
| 13 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_geocode_wrong_branch_address_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_geocode_wrong_branch_address_20260707_pkey | CREATE UNIQUE INDEX location_geocode_wrong_branch_address_20260707_pkey ON fountain_raw.location_geocode_wrong_branch_address_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_normalization_audit_20260707

Rows: 9398

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | field | text | text | NO |  |
| 3 | old_value | text | text | YES |  |
| 4 | new_value | text | text | YES |  |
| 5 | rule | text | text | NO |  |
| 6 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

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

### fountain_raw.location_wrong_branch_mini_fix_accepted_20260707

Rows: 95

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | old_country_code | text | text | YES |  |
| 4 | new_country_code | text | text | YES |  |
| 5 | old_country_name | text | text | YES |  |
| 6 | new_country_name | text | text | YES |  |
| 7 | old_region | text | text | YES |  |
| 8 | new_region | text | text | YES |  |
| 9 | old_locality | text | text | YES |  |
| 10 | new_locality | text | text | YES |  |
| 11 | new_latitude | double precision | float8 | YES |  |
| 12 | new_longitude | double precision | float8 | YES |  |
| 13 | formatted_address | text | text | YES |  |
| 14 | location_type | text | text | YES |  |
| 15 | result_types | ARRAY | _text | YES |  |
| 16 | rule | text | text | NO |  |
| 17 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_wrong_branch_mini_fix_accepted_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_wrong_branch_mini_fix_accepted_20260707_pkey | CREATE UNIQUE INDEX location_wrong_branch_mini_fix_accepted_20260707_pkey ON fountain_raw.location_wrong_branch_mini_fix_accepted_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_wrong_branch_mini_fix_audit_20260707

Rows: 480

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | field | text | text | NO |  |
| 3 | old_value | text | text | YES |  |
| 4 | new_value | text | text | YES |  |
| 5 | rule | text | text | NO |  |
| 6 | formatted_address | text | text | YES |  |
| 7 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.location_wrong_branch_mini_fix_backup_20260707

Rows: 97

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
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
| 15 | price_text | text | text | YES |  |
| 16 | dedup_key | text | text | YES |  |
| 17 | public_id | uuid | uuid | YES |  |
| 18 | status | text | text | YES |  |
| 19 | data_origin | text | text | YES |  |
| 20 | verification_status | text | text | YES |  |
| 21 | created_at | timestamp with time zone | timestamptz | YES |  |
| 22 | updated_at | timestamp with time zone | timestamptz | YES |  |
| 23 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 24 | owner_account_id | uuid | uuid | YES |  |
| 25 | slug | text | text | YES |  |
| 26 | is_virtual | boolean | bool | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.location_wrong_branch_mini_fix_deletion_review_20260707

Rows: 2

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | slug | text | text | YES |  |
| 4 | old_status | text | text | YES |  |
| 5 | new_status | text | text | YES |  |
| 6 | reason | text | text | NO |  |
| 7 | detail | jsonb | jsonb | YES |  |
| 8 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_wrong_branch_mini_fix_deletion_review_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_wrong_branch_mini_fix_deletion_review_20260707_pkey | CREATE UNIQUE INDEX location_wrong_branch_mini_fix_deletion_review_20260707_pkey ON fountain_raw.location_wrong_branch_mini_fix_deletion_review_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.location_wrong_branch_mini_fix_resolved_review_20260707

Rows: 97

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | resolution | text | text | NO |  |
| 4 | detail | jsonb | jsonb | YES |  |
| 5 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| location_wrong_branch_mini_fix_resolved_review_20260707_pkey | p | PRIMARY KEY (location_id) |

#### Indexes

| name | definition |
| --- | --- |
| location_wrong_branch_mini_fix_resolved_review_20260707_pkey | CREATE UNIQUE INDEX location_wrong_branch_mini_fix_resolved_review_20260707_pkey ON fountain_raw.location_wrong_branch_mini_fix_resolved_review_20260707 USING btree (location_id) |

#### Triggers

_None._

### fountain_raw.locations_price_text_backup

Rows: 610

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
| 2 | name | text | text | YES |  |
| 3 | slug | text | text | YES |  |
| 4 | price_text | text | text | YES |  |
| 5 | backed_up_at | timestamp with time zone | timestamptz | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.org_dedup_phase2_deleted_orgs_20260707

Rows: 1

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
| 2 | canonical_name | text | text | YES |  |
| 3 | name_normalized | text | text | YES |  |
| 4 | website_domain | text | text | YES |  |
| 5 | description | text | text | YES |  |
| 6 | dedup_key | text | text | YES |  |
| 7 | public_id | uuid | uuid | YES |  |
| 8 | status | text | text | YES |  |
| 9 | data_origin | text | text | YES |  |
| 10 | verification_status | text | text | YES |  |
| 11 | created_at | timestamp with time zone | timestamptz | YES |  |
| 12 | updated_at | timestamp with time zone | timestamptz | YES |  |
| 13 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 14 | owner_account_id | uuid | uuid | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.org_dedup_phase2_guardrail_20260707

Rows: 106

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | location_domain | text | text | YES |  |
| 4 | old_org_id | integer | int4 | YES |  |
| 5 | old_org_name | text | text | YES |  |
| 6 | reason | text | text | NO |  |
| 7 | evidence | jsonb | jsonb | YES |  |
| 8 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.org_dedup_phase2_location_org_map_20260707

Rows: 1088

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | old_org_id | integer | int4 | YES |  |
| 3 | new_org_id | integer | int4 | YES |  |
| 4 | action | text | text | NO |  |
| 5 | detail | jsonb | jsonb | YES |  |
| 6 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.org_dedup_phase2_new_orgs_20260707

Rows: 410

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | org_id | integer | int4 | NO |  |
| 2 | canonical_name | text | text | NO |  |
| 3 | website_domain | text | text | NO |  |
| 4 | dedup_key | text | text | NO |  |
| 5 | location_count | integer | int4 | NO |  |
| 6 | location_ids | ARRAY | _int4 | NO |  |
| 7 | brand_evidence | jsonb | jsonb | YES |  |
| 8 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.places_website_backfill_guardrail_20260707

Rows: 9

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | location_name | text | text | YES |  |
| 3 | location_domain | text | text | YES |  |
| 4 | old_org_id | integer | int4 | YES |  |
| 5 | reason | text | text | NO |  |
| 6 | evidence | jsonb | jsonb | YES |  |
| 7 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.places_website_backfill_location_actions_20260707

Rows: 331

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | place_id | text | text | YES |  |
| 3 | action | text | text | NO |  |
| 4 | old_website | text | text | YES |  |
| 5 | new_website | text | text | YES |  |
| 6 | old_phone | text | text | YES |  |
| 7 | new_phone | text | text | YES |  |
| 8 | api_display_name | text | text | YES |  |
| 9 | verification | jsonb | jsonb | YES |  |
| 10 | raw_payload | jsonb | jsonb | YES |  |
| 11 | error | jsonb | jsonb | YES |  |
| 12 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.places_website_backfill_new_orgs_20260707

Rows: 214

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | org_id | integer | int4 | NO |  |
| 2 | canonical_name | text | text | NO |  |
| 3 | website_domain | text | text | NO |  |
| 4 | dedup_key | text | text | NO |  |
| 5 | location_count | integer | int4 | NO |  |
| 6 | location_ids | ARRAY | _int4 | NO |  |
| 7 | brand_evidence | jsonb | jsonb | YES |  |
| 8 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.places_website_backfill_org_map_20260707

Rows: 308

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | NO |  |
| 2 | old_org_id | integer | int4 | YES |  |
| 3 | new_org_id | integer | int4 | YES |  |
| 4 | action | text | text | NO |  |
| 5 | domain | text | text | YES |  |
| 6 | detail | jsonb | jsonb | YES |  |
| 7 | created_at | timestamp with time zone | timestamptz | YES | now() |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_categories_backup_20260708

Rows: 7

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
| 2 | name | text | text | YES |  |
| 3 | parent_id | integer | int4 | YES |  |
| 4 | facet | text | text | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_documents_backup_20260708

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
| 2 | source_id | integer | int4 | YES |  |
| 3 | title | text | text | YES |  |
| 4 | source_url | text | text | YES |  |
| 5 | document_type | text | text | YES |  |
| 6 | page_number | integer | int4 | YES |  |
| 7 | local_path | text | text | YES |  |
| 8 | raw_text | text | text | YES |  |
| 9 | status | text | text | YES |  |
| 10 | data_origin | text | text | YES |  |
| 11 | verification_status | text | text | YES |  |
| 12 | created_at | timestamp with time zone | timestamptz | YES |  |
| 13 | updated_at | timestamp with time zone | timestamptz | YES |  |
| 14 | deleted_at | timestamp with time zone | timestamptz | YES |  |
| 15 | owner_account_id | uuid | uuid | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_external_place_matches_text_backup_20260708

Rows: 2544

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | location_id | integer | int4 | YES |  |
| 2 | provider | text | text | YES |  |
| 3 | fetched_at | text | text | YES |  |
| 4 | expires_at | text | text | YES |  |
| 5 | raw_json | text | text | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_images_local_path_backup_20260708

Rows: 0

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
| 2 | local_path | text | text | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_pre_migration_counts_20260708

Rows: 1

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | captured_at | timestamp with time zone | timestamptz | YES |  |
| 2 | reviews_before | integer | int4 | YES |  |
| 3 | external_reviews_before | integer | int4 | YES |  |
| 4 | external_place_matches_before | integer | int4 | YES |  |
| 5 | images_local_path_nonempty_before | integer | int4 | YES |  |
| 6 | locations_price_text_nonempty_before | integer | int4 | YES |  |
| 7 | documents_before | integer | int4 | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_retired_raw_tables_20260708

Rows: 15

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | schema_name | name | name | YES |  |
| 2 | table_name | name | name | YES |  |
| 3 | total_bytes | bigint | int8 | YES |  |
| 4 | retired_at | timestamp with time zone | timestamptz | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_review_format_audit_20260708

Rows: 2

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | source_table | text | text | YES |  |
| 2 | provider | text | text | YES |  |
| 3 | total_rows | integer | int4 | YES |  |
| 4 | timestamp_review_dates | integer | int4 | YES |  |
| 5 | relative_review_dates | integer | int4 | YES |  |
| 6 | singular_relative_review_dates | integer | int4 | YES |  |
| 7 | unparseable_review_dates | integer | int4 | YES |  |
| 8 | null_ratings | integer | int4 | YES |  |
| 9 | unparseable_ratings | integer | int4 | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_review_migration_audit_20260708

Rows: 1

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | scrape_reviews_before | integer | int4 | YES |  |
| 2 | external_reviews_before | integer | int4 | YES |  |
| 3 | external_reviews_inserted | integer | int4 | YES |  |
| 4 | external_reviews_deduped | integer | int4 | YES |  |
| 5 | external_review_dates_null_after_parse | integer | int4 | YES |  |
| 6 | scrape_ratings_null_after_parse | integer | int4 | YES |  |
| 7 | scrape_review_dates_null_after_parse | integer | int4 | YES |  |
| 8 | reviews_after | integer | int4 | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_sources_backup_20260708

Rows: 254

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
| 2 | slug | text | text | YES |  |
| 3 | name | text | text | YES |  |
| 4 | base_url | text | text | YES |  |
| 5 | scraped_at | text | text | YES |  |
| 6 | trust_weight | double precision | float8 | YES |  |
| 7 | record_count | integer | int4 | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.schema_streamlining_treatments_backup_20260708

Rows: 43

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | YES |  |
| 2 | canonical_name | text | text | YES |  |
| 3 | category_id | integer | int4 | YES |  |
| 4 | description | text | text | YES |  |

#### Constraints

_None._

#### Indexes

_None._

#### Triggers

_None._

### fountain_raw.source_databases

Rows: 254

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

Rows: 33235

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

Rows: 135622

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

Rows: 22158

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

Rows: 3647

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

### fountain_raw.treatment_aliases

Rows: 95

#### Columns

| pos | column | type | udt | nullable | default |
| --- | --- | --- | --- | --- | --- |
| 1 | id | integer | int4 | NO |  |
| 2 | treatment_id | integer | int4 | NO |  |
| 3 | alias_text | text | text | NO |  |
| 4 | alias_normalized | text | text | NO |  |
| 5 | source_slug | text | text | YES |  |

#### Constraints

| name | type | definition |
| --- | --- | --- |
| treatment_aliases_alias_normalized_source_slug_key | u | UNIQUE (alias_normalized, source_slug) |
| treatment_aliases_pkey | p | PRIMARY KEY (id) |
| treatment_aliases_treatment_id_fkey | f | FOREIGN KEY (treatment_id) REFERENCES treatments(id) |

#### Indexes

| name | definition |
| --- | --- |
| idx_aliases_norm | CREATE INDEX idx_aliases_norm ON fountain_raw.treatment_aliases USING btree (alias_normalized) |
| treatment_aliases_alias_normalized_source_slug_key | CREATE UNIQUE INDEX treatment_aliases_alias_normalized_source_slug_key ON fountain_raw.treatment_aliases USING btree (alias_normalized, source_slug) |
| treatment_aliases_pkey | CREATE UNIQUE INDEX treatment_aliases_pkey ON fountain_raw.treatment_aliases USING btree (id) |

#### Triggers

_None._

### fountain_raw.unmapped_terms

Rows: 53607

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

## Fountain Functions

| signature |
| --- |
| armor(bytea) |
| armor(bytea,text[],text[]) |
| assign_location_slug() |
| assign_practitioner_slug() |
| attach_location_image(integer,text,text,text,integer,uuid) |
| audit_entity_change() |
| create_location(jsonb,uuid) |
| crypt(text,text) |
| dearmor(text) |
| decrypt(bytea,bytea,text) |
| decrypt_iv(bytea,bytea,bytea,text) |
| delete_location_cascade(integer,uuid,text) |
| digest(bytea,text) |
| digest(text,text) |
| encrypt(bytea,bytea,text) |
| encrypt_iv(bytea,bytea,bytea,text) |
| fountain.gen_random_uuid() |
| gen_random_bytes(integer) |
| gen_salt(text) |
| gen_salt(text,integer) |
| hmac(bytea,bytea,text) |
| hmac(text,text,text) |
| location_slug_base(text,text,text) |
| merge_locations(integer,integer,uuid,text) |
| pgp_armor_headers(text) |
| pgp_key_id(bytea) |
| pgp_pub_decrypt(bytea,bytea) |
| pgp_pub_decrypt(bytea,bytea,text) |
| pgp_pub_decrypt(bytea,bytea,text,text) |
| pgp_pub_decrypt_bytea(bytea,bytea) |
| pgp_pub_decrypt_bytea(bytea,bytea,text) |
| pgp_pub_decrypt_bytea(bytea,bytea,text,text) |
| pgp_pub_encrypt(text,bytea) |
| pgp_pub_encrypt(text,bytea,text) |
| pgp_pub_encrypt_bytea(bytea,bytea) |
| pgp_pub_encrypt_bytea(bytea,bytea,text) |
| pgp_sym_decrypt(bytea,text) |
| pgp_sym_decrypt(bytea,text,text) |
| pgp_sym_decrypt_bytea(bytea,text) |
| pgp_sym_decrypt_bytea(bytea,text,text) |
| pgp_sym_encrypt(text,text) |
| pgp_sym_encrypt(text,text,text) |
| pgp_sym_encrypt_bytea(bytea,text) |
| pgp_sym_encrypt_bytea(bytea,text,text) |
| practitioner_slug_base(text) |
| refresh_affiliation_search_index_trigger() |
| refresh_entity_tag_search_index_trigger() |
| refresh_location_search_index_trigger() |
| refresh_offering_search_index_trigger() |
| refresh_practitioner_search_index_trigger() |
| refresh_search_index() |
| refresh_search_index_for_location(integer) |
| refresh_search_index_for_practitioner(integer) |
| refresh_treatment_search_index_trigger() |
| replace_location_offerings(integer,jsonb,uuid) |
| set_mutation_actor(uuid,text) |
| slugify_listing_text(text) |
| touch_updated_at() |
| unique_location_slug(integer,text,text,text) |
| unique_practitioner_slug(integer,text) |
