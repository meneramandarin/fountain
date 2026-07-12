# Pipeline Restructure Phase 3 — Gate A Inventory

**Status:** APPROVED — conservative scope approved 2026-07-11
**Inventory date:** 2026-07-11
**Scope:** Read-only database inspection plus repository inventory. No table was dumped or dropped, no serving row was written, no external API was called, and no existing file was moved, restored, staged, or deleted.

The Phase 3 prompt points to docs/pipeline-restructure-plan.md; the plan present in this repository is docs/fountain-pipeline-restructure-plan.md, which was used.

## Approval boundary

The live fountain_raw schema has 155 tables. All 10 keep-list tables are present. The other 145 are nominal archive candidates.

| Set | Tables | Rows | Total bytes | Human size |
|---|---:|---:|---:|---:|
| Entire fountain_raw schema | 155 | 862,075 | 429,981,696 | 410 MB |
| Required keep-list | 10 | 290,501 | 247,357,440 | 236 MB |
| Nominal archive candidates | 145 | 571,574 | 182,624,256 | 174 MB / 0.183 GB |
| Conservative Phase B batch proposed below | 106 | 316,953 | 92,880,896 | 88.58 MiB / 0.093 GB |
| Held or flagged pending an explicit decision | 39 | 254,621 | 89,743,360 | 85.59 MiB |

The conservative Phase B proposal excludes:

- All 34 tables with exact code references. Phase B precedes the Phase C script moves, so even otherwise completed campaign tables remain flagged and are not in the first destructive batch.
- Five additional tables without fixed-string hits have unresolved/review evidence: browser_swarm_image_ingest_20260708, browser_swarm_menu_ingest_20260708, location_geocode_backfill_20260709, location_jsonld_recovery_20260709, and location_normalization_review_20260707. The first is also the dynamically constructed dependency of the retained image-review ingester.

This exclusion is dependency-closed for the identified active cohorts: the retained Hyperbaric legitimacy review keeps its referenced queue, call-ledger, and website-fetch support tables; the retained taxonomy final triage keeps its referenced corpus, LLM ledger, and remap cohort. After Phase C removes legacy references and absorbs keeper logic, the 26 otherwise completed A* tables plus the two current L tables can be re-inventoried as a separate, newly approved archive batch.

Disposition legend used below:

- **A** — archive-ready in the conservative Phase B batch after the required dump and verification.
- **A\*** — otherwise archive-ready, but exactly referenced by legacy scripts that still exist during Phase B; flagged and excluded from this batch.
- **H** — operational hold; do not archive in the conservative Phase B batch.
- **R** — unresolved/review evidence; hold until Malena explicitly closes or migrates it.
- **L** — referenced by a keeper/live pathway; do not archive until the dependency is removed.

## 1. Tables

### Keep-list confirmed

| Table | Rows | Total bytes |
|---|---:|---:|
| import_metadata | 3 | 32,768 |
| import_runs | 288 | 131,072 |
| source_databases | 256 | 409,600 |
| source_images | 30,000 | 27,115,520 |
| source_listing_fields | 154,050 | 38,117,376 |
| source_listings | 23,378 | 150,929,408 |
| source_reviews | 7,591 | 13,836,288 |
| suppressed_source_listings | 345 | 147,456 |
| treatment_aliases | 3,577 | 1,368,064 |
| unmapped_terms | 71,013 | 15,269,888 |

### FK cross-check

The information_schema query joined table_constraints to constraint_column_usage, selected foreign keys whose referenced table was a nominal archive candidate, and restricted the referencing side to fountain or the fountain_raw keep-list:

~~~sql
WITH keep(table_name) AS (
  VALUES
    ('source_databases'), ('source_listings'), ('source_listing_fields'),
    ('source_images'), ('source_reviews'), ('suppressed_source_listings'),
    ('treatment_aliases'), ('unmapped_terms'), ('import_runs'),
    ('import_metadata')
)
SELECT
  fk.table_schema AS referencing_schema,
  fk.table_name AS referencing_table,
  fk.constraint_name,
  ref.table_schema AS referenced_schema,
  ref.table_name AS referenced_table
FROM information_schema.table_constraints fk
JOIN information_schema.constraint_column_usage ref
  ON ref.constraint_catalog = fk.constraint_catalog
 AND ref.constraint_schema = fk.constraint_schema
 AND ref.constraint_name = fk.constraint_name
WHERE fk.constraint_type = 'FOREIGN KEY'
  AND ref.table_schema = 'fountain_raw'
  AND ref.table_name NOT IN (SELECT table_name FROM keep)
  AND (
    fk.table_schema = 'fountain'
    OR (
      fk.table_schema = 'fountain_raw'
      AND fk.table_name IN (SELECT table_name FROM keep)
    )
  )
ORDER BY 1, 2, 3;
~~~

~~~text
information_schema archive references from fountain or keep-list
(0 rows)
~~~

An independent pg_catalog / pg_constraint query returned the same result:

~~~text
pg_catalog archive references from fountain or keep-list
(0 rows)
~~~

Six foreign keys touch fountain_raw at all, and every fountain_raw endpoint is retained:

| Referencing table | Referenced table |
|---|---|
| fountain_raw.import_runs | fountain_raw.source_databases |
| fountain_raw.source_listings | fountain_raw.source_databases |
| fountain_raw.source_listing_fields | fountain_raw.source_listings |
| fountain_raw.source_images | fountain_raw.source_listings |
| fountain_raw.source_reviews | fountain_raw.source_listings |
| fountain_raw.treatment_aliases | fountain.treatments |

### Pending-work cross-check and recommended exclusions

| Disposition | Table | Evidence |
|---|---|---|
| H | dedup_candidates_20260711 | 216 rows are merged and 1,084 are review_branch_risk; 1,077 branch-risk endpoints remain active. This is Pass 7 input. |
| H | browser_swarm_image_ingest_20260708 | 168 rows were held for review; 154 later received decisions, leaving exactly 14 unresolved keys. |
| H | hyperbaric_cleanup_results_20260711 | 72 rows remain legitimacy=review at medium confidence, and all 72 serving locations are active. |
| H | price_conflicts_20260711 | 21 purpose-built human-review rows; all 21 linked locations are active and the table has no resolution field. |
| H | price_review_20260711 | 38 purpose-built human-review rows; 37 linked locations are active and the table has no resolution field. |
| R | browser_swarm_menu_ingest_20260708 | Contains 28 materially different price conflicts and 20 nonzero price-sanity flags. |
| R | location_geocode_backfill_20260709 | 1,975 writes are applied; three active locations remain needs_review with write_applied=false. |
| R | location_geocode_low_confidence_20260707 | 1,265 low-confidence rows; 1,244 linked locations remain active. |
| R | location_jsonld_recovery_20260709 | Five writes are applied and one row is needs_review; the remaining review location no longer exists, so this may be explicitly closed. |
| R | location_normalization_review_20260707 | 406 review rows; 395 linked locations remain active. |
| R | taxonomy_final_triage_20260711 | 36,790 rows have no applied_action, including 7,974 candidate_new classifications. This likely reflects intentional thresholding, but the costly classifications should be explicitly closed before deletion. |
| L | hyperbaric_app_image_audit_20260710 | Queried by the keeper structure-document generator. |
| L | hyperbaric_app_promotion_audit_20260710 | Queried by the keeper structure-document generator. |

False-positive pending states were also checked: 3,857 browser-swarm seed rows remain marked pending across the AE, GB, US batch 1, and US batch 2 seed tables, but every site_origin occurs in a completed done run table. Those seed tables are archive-safe.

### Complete nominal candidate inventory

Rows and relation sizes were read with exact count(*) and pg_total_relation_size values inside read-only transactions.

| Disposition | Table | Rows | Total bytes | Provenance guess |
|---|---|---:|---:|---|
| A | assure_wellness_purge_20260709_affiliations | 0 | 8,192 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_clinic_claims | 0 | 8,192 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_entity_tags | 0 | 8,192 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_external_place_matches | 0 | 8,192 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_images | 1 | 16,384 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_locations | 2 | 16,384 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_offerings | 17 | 16,384 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_organizations | 1 | 16,384 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_outbound_clicks | 1 | 16,384 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_reviews | 0 | 8,192 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_search_index | 2 | 16,384 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_source_records | 6 | 16,384 | Assure Wellness purge snapshot, 2026-07-09 |
| A | assure_wellness_purge_20260709_summary | 1 | 16,384 | Assure Wellness purge snapshot, 2026-07-09 |
| A | blob_orphan_sweep_20260708 | 2 | 32,768 | Vercel Blob orphan sweep, 2026-07-08 |
| A | bookimed_cleanup_addendum_location_actions_20260708 | 1 | 16,384 | Bookimed cleanup addendum, 2026-07-08 |
| A | bookimed_cleanup_addendum_new_orgs_20260708 | 4 | 16,384 | Bookimed cleanup addendum, 2026-07-08 |
| A | bookimed_cleanup_addendum_org_map_20260708 | 9 | 16,384 | Bookimed cleanup addendum, 2026-07-08 |
| A | bookimed_mismatch_approval_guardrail_20260708 | 0 | 8,192 | Bookimed mismatch approvals, 2026-07-08 |
| A | bookimed_mismatch_approval_location_actions_20260708 | 5 | 16,384 | Bookimed mismatch approvals, 2026-07-08 |
| A | bookimed_mismatch_approval_new_orgs_20260708 | 5 | 16,384 | Bookimed mismatch approvals, 2026-07-08 |
| A | bookimed_mismatch_approval_org_map_20260708 | 5 | 16,384 | Bookimed mismatch approvals, 2026-07-08 |
| A | bookimed_website_backfill_guardrail_20260708 | 13 | 16,384 | Bookimed website backfill, 2026-07-08 |
| A* | bookimed_website_backfill_location_actions_20260708 | 266 | 278,528 | Bookimed website backfill, 2026-07-08 |
| A | bookimed_website_backfill_new_orgs_20260708 | 192 | 98,304 | Bookimed website backfill, 2026-07-08 |
| A | bookimed_website_backfill_org_map_20260708 | 222 | 98,304 | Bookimed website backfill, 2026-07-08 |
| H | browser_swarm_image_ingest_20260708 | 1,673 | 753,664 | Browser-swarm image ingestion/review, 2026-07-08 |
| A | browser_swarm_jobs_20260708 | 1,473 | 2,064,384 | Browser-swarm Tier 1/2 job seed, 2026-07-08 |
| A | browser_swarm_jobs_20260708_tier3_ae | 4 | 65,536 | Browser-swarm Tier 3 AE seed, 2026-07-08 |
| A | browser_swarm_jobs_20260708_tier3_batch4_nonus_run1 | 405 | 524,288 | Browser-swarm Tier 3 non-US run, 2026-07-08 |
| A | browser_swarm_jobs_20260708_tier3_gb | 52 | 106,496 | Browser-swarm Tier 3 GB seed, 2026-07-08 |
| A | browser_swarm_jobs_20260708_tier3_us_batch1 | 2,001 | 2,154,496 | Browser-swarm Tier 3 US batch 1 seed, 2026-07-08 |
| A | browser_swarm_jobs_20260708_tier3_us_batch1_run1 | 2,014 | 2,400,256 | Browser-swarm Tier 3 US batch 1 run, 2026-07-08 |
| A | browser_swarm_jobs_20260708_tier3_us_batch2 | 1,800 | 1,024,000 | Browser-swarm Tier 3 US batch 2 seed, 2026-07-08 |
| A | browser_swarm_jobs_20260708_tier3_us_batch2_run1 | 1,800 | 2,236,416 | Browser-swarm Tier 3 US batch 2 run, 2026-07-08 |
| A | browser_swarm_jobs_20260708_tier3_us_batch3_run1 | 1,355 | 1,695,744 | Browser-swarm Tier 3 US batch 3 run, 2026-07-08 |
| R | browser_swarm_menu_ingest_20260708 | 25,198 | 5,791,744 | Browser-swarm menu/price ingestion, 2026-07-08 |
| A | browser_swarm_menu_tier1_nav_deleted_20260708 | 65 | 49,152 | Browser-swarm Tier 1 navigation cleanup, 2026-07-08 |
| A* | clinic_website_offering_extractions_20260711 | 636 | 819,200 | Clinic website menu extraction, 2026-07-11 |
| A | closeout_approved_website_matches_20260707 | 4 | 16,384 | July 7 closeout website approvals |
| A | closeout_documents_deleted_20260707 | 1 | 8,192 | July 7 document closeout |
| A | closeout_duplicate_domain_review_20260707 | 47 | 57,344 | July 7 duplicate-domain closeout |
| A | closeout_hidden_locations_20260707 | 3 | 16,384 | July 7 location closeout |
| A | closeout_org_merges_20260707 | 9 | 16,384 | July 7 organization closeout |
| A | closeout_source_records_org_backup_20260707 | 114 | 40,960 | July 7 source-record closeout backup |
| H* | dedup_candidates_20260711 | 1,300 | 966,656 | Hyperbaric dedup candidate set / Pass 7 input |
| A | external_place_matches_backup_20260708_bookimed_cleanup_addendu | 14 | 16,384 | Bookimed cleanup external-place-match backup |
| A* | field_corrections_backup_20260711 | 43 | 139,264 | Hyperbaric Task C field correction backup |
| A* | final_closeout_offerings_backup_20260711 | 100,535 | 16,695,296 | Final closeout serving backup, 2026-07-11 |
| A* | final_closeout_search_function_backup_20260711 | 1 | 16,384 | Final closeout search-function backup, 2026-07-11 |
| A* | final_closeout_search_index_backup_20260711 | 14,824 | 9,183,232 | Final closeout search-index backup, 2026-07-11 |
| A* | final_closeout_treatment_aliases_backup_20260711 | 3,399 | 491,520 | Final closeout taxonomy backup, 2026-07-11 |
| A* | final_closeout_treatments_backup_20260711 | 62 | 16,384 | Final closeout taxonomy backup, 2026-07-11 |
| L | hyperbaric_app_image_audit_20260710 | 983 | 909,312 | Hyperbaric.app image promotion audit, 2026-07-10 |
| L | hyperbaric_app_promotion_audit_20260710 | 1,220 | 376,832 | Hyperbaric.app location promotion audit, 2026-07-10 |
| A* | hyperbaric_cleanup_call_ledger_20260711 | 3,926 | 2,310,144 | Hyperbaric cleanup API/LLM call ledger, 2026-07-11 |
| A* | hyperbaric_cleanup_queue_20260710 | 983 | 385,024 | Hyperbaric cleanup queue, 2026-07-10 |
| A* | hyperbaric_cleanup_queue_20260711 | 946 | 524,288 | Hyperbaric cleanup queue, 2026-07-11 |
| A* | hyperbaric_cleanup_results_20260710 | 983 | 1,105,920 | Hyperbaric cleanup results, 2026-07-10 |
| H* | hyperbaric_cleanup_results_20260711 | 946 | 679,936 | Hyperbaric legitimacy results/review, 2026-07-11 |
| A* | hyperbaric_cleanup_website_fetches_20260711 | 1,806 | 827,392 | Hyperbaric cleanup website cache ledger, 2026-07-11 |
| A* | hyperbaric_dedup_candidates_20260710 | 4 | 32,768 | Hyperbaric cleanup dedup audit, 2026-07-10 |
| A* | hyperbaric_field_corrections_backup_20260710 | 66 | 65,536 | Hyperbaric cleanup field backup, 2026-07-10 |
| A* | hyperbaric_price_review_20260710 | 0 | 16,384 | Hyperbaric cleanup price review, 2026-07-10 |
| A* | hyperbaric_task_d_contact_fills_20260711 | 3 | 32,768 | Hyperbaric Task D contact-fill audit, 2026-07-11 |
| A* | hyperbaric_task_d_review_backfill_20260711 | 119 | 81,920 | Hyperbaric Task D review backfill, 2026-07-11 |
| A | image_promotion_audit_20260708 | 23,290 | 10,567,680 | General image promotion audit, 2026-07-08 |
| A | image_promotion_results_20260708 | 6,085 | 2,187,264 | General image promotion results, 2026-07-08 |
| A | location_followup_audit_20260707 | 54 | 16,384 | Location follow-up cleanup, 2026-07-07 |
| A | location_followup_backup_20260707 | 25 | 16,384 | Location follow-up backup, 2026-07-07 |
| A | location_followup_deletion_review_20260707 | 9 | 32,768 | Location follow-up deletion review; all nine now hidden |
| A | location_followup_review_cleared_20260707 | 26 | 16,384 | Location follow-up cleared review, 2026-07-07 |
| A | location_geocode_addendum_audit_20260707 | 845 | 155,648 | Geocode addendum audit, 2026-07-07 |
| A | location_geocode_addendum_backup_20260707 | 353 | 180,224 | Geocode addendum backup, 2026-07-07 |
| A | location_geocode_addendum_country_fix_20260707 | 40 | 65,536 | Geocode addendum country fixes, 2026-07-07 |
| A | location_geocode_addendum_recovered_20260707 | 313 | 131,072 | Geocode addendum recovered rows, 2026-07-07 |
| R | location_geocode_backfill_20260709 | 1,978 | 6,840,320 | Geocode guardrail backfill, 2026-07-09 |
| A | location_geocode_backfill_audit_20260707 | 8,853 | 2,351,104 | Geocode backfill audit, 2026-07-07 |
| A | location_geocode_coordinate_backup_20260707 | 10,394 | 1,597,440 | Geocode coordinate backup, 2026-07-07 |
| A | location_geocode_coordinate_backup_20260709 | 1,978 | 475,136 | Geocode coordinate backup, 2026-07-09 |
| A | location_geocode_locality_audit_20260707 | 2,183 | 581,632 | Geocode locality audit, 2026-07-07 |
| R* | location_geocode_low_confidence_20260707 | 1,265 | 606,208 | Geocode low-confidence review corpus, 2026-07-07 |
| A* | location_geocode_wrong_branch_address_20260707 | 13 | 106,496 | Wrong-branch geocode review, 2026-07-07 |
| A | location_jsonld_contamination_20260709 | 6 | 16,384 | JSON-LD address contamination audit, 2026-07-09 |
| R | location_jsonld_recovery_20260709 | 6 | 73,728 | JSON-LD address recovery, 2026-07-09 |
| A | location_manual_address_geocode_fix_20260709 | 3 | 32,768 | Manual address/geocode fixes, 2026-07-09 |
| A | location_normalization_audit_20260707 | 9,398 | 1,261,568 | Location normalization audit, 2026-07-07 |
| R | location_normalization_review_20260707 | 406 | 483,328 | Location normalization review corpus, 2026-07-07 |
| A | location_website_serp_wrapper_audit_20260709 | 15 | 16,384 | Website SERP-wrapper hygiene, 2026-07-09 |
| A | location_wrong_branch_mini_fix_accepted_20260707 | 95 | 81,920 | Wrong-branch mini-fix accepted rows, 2026-07-07 |
| A | location_wrong_branch_mini_fix_audit_20260707 | 480 | 98,304 | Wrong-branch mini-fix audit, 2026-07-07 |
| A | location_wrong_branch_mini_fix_backup_20260707 | 97 | 73,728 | Wrong-branch mini-fix backup, 2026-07-07 |
| A | location_wrong_branch_mini_fix_deletion_review_20260707 | 2 | 32,768 | Wrong-branch deletion review, 2026-07-07 |
| A | location_wrong_branch_mini_fix_resolved_review_20260707 | 97 | 73,728 | Wrong-branch resolved review, 2026-07-07 |
| A | locations_backup_20260708_bookimed_cleanup_addendum | 9 | 16,384 | Bookimed cleanup location backup |
| A | locations_backup_20260708_bookimed_mismatch_approvals | 5 | 16,384 | Bookimed mismatch location backup |
| A | locations_backup_20260708_bookimed_website_backfill | 13,118 | 5,578,752 | Bookimed website-backfill full location snapshot |
| A | locations_backup_20260708_utm_tracking_hygiene | 13,118 | 5,578,752 | UTM hygiene full location snapshot |
| A | locations_backup_20260709_google_serp_wrapper_hygiene | 13,118 | 5,578,752 | Google SERP-wrapper hygiene full location snapshot |
| A | locations_price_text_backup | 610 | 139,264 | Legacy price-text cleanup backup |
| A | org_dedup_phase2_deleted_orgs_20260707 | 1 | 16,384 | Organization dedup phase 2, 2026-07-07 |
| A | org_dedup_phase2_guardrail_20260707 | 106 | 81,920 | Organization dedup phase 2 guardrail |
| A | org_dedup_phase2_location_org_map_20260707 | 1,088 | 401,408 | Organization dedup phase 2 location map |
| A | org_dedup_phase2_new_orgs_20260707 | 410 | 172,032 | Organization dedup phase 2 organization snapshot |
| A | organizations_backup_20260708_bookimed_cleanup_addendum | 7,286 | 4,251,648 | Bookimed cleanup organization snapshot |
| A | organizations_backup_20260708_bookimed_mismatch_approvals | 7,281 | 4,251,648 | Bookimed mismatch organization snapshot |
| A | organizations_backup_20260708_bookimed_website_backfill | 7,089 | 4,251,648 | Bookimed website-backfill organization snapshot |
| A | places_website_backfill_guardrail_20260707 | 9 | 16,384 | Places website backfill guardrail, 2026-07-07 |
| A | places_website_backfill_location_actions_20260707 | 331 | 278,528 | Places website backfill location actions |
| A | places_website_backfill_new_orgs_20260707 | 214 | 106,496 | Places website backfill organization snapshot |
| A | places_website_backfill_org_map_20260707 | 308 | 122,880 | Places website backfill organization map |
| H* | price_conflicts_20260711 | 21 | 32,768 | Hyperbaric Task C price-conflict review |
| H* | price_review_20260711 | 38 | 65,536 | Hyperbaric Task C price review |
| A | reviews_dedupe_deleted_20260708 | 627 | 1,196,032 | Review dedupe deleted-row backup, 2026-07-08 |
| A | reviews_dedupe_report_20260708 | 1 | 8,192 | Review dedupe summary, 2026-07-08 |
| A | schema_streamlining_categories_backup_20260708 | 7 | 16,384 | Schema-streamlining category backup |
| A | schema_streamlining_documents_backup_20260708 | 0 | 8,192 | Schema-streamlining document backup |
| A | schema_streamlining_external_place_matches_text_backup_20260708 | 2,544 | 352,256 | Schema-streamlining place-match text backup |
| A | schema_streamlining_images_local_path_backup_20260708 | 0 | 8,192 | Schema-streamlining image-path backup |
| A | schema_streamlining_pre_migration_counts_20260708 | 1 | 8,192 | Schema-streamlining pre-migration counts |
| A | schema_streamlining_retired_raw_tables_20260708 | 15 | 8,192 | Schema-streamlining retired-table inventory |
| A | schema_streamlining_review_format_audit_20260708 | 2 | 16,384 | Schema-streamlining review-format audit |
| A | schema_streamlining_review_migration_audit_20260708 | 1 | 8,192 | Schema-streamlining review-migration audit |
| A | schema_streamlining_sources_backup_20260708 | 254 | 73,728 | Schema-streamlining source backup |
| A | schema_streamlining_treatments_backup_20260708 | 43 | 16,384 | Schema-streamlining treatment backup |
| A | source_images_purged_20260708 | 6,368 | 2,138,112 | Source-image purge quarantine, 2026-07-08 |
| A* | taxonomy_dedup_merge_audit_20260712 | 9 | 16,384 | Taxonomy dedup audit, 2026-07-12 |
| A* | taxonomy_dedup_offerings_backup_20260712 | 1,260 | 253,952 | Taxonomy dedup offering backup, 2026-07-12 |
| A* | taxonomy_dedup_treatment_aliases_backup_20260712 | 32 | 16,384 | Taxonomy dedup alias backup, 2026-07-12 |
| A* | taxonomy_dedup_treatments_backup_20260712 | 15 | 16,384 | Taxonomy dedup treatment backup, 2026-07-12 |
| A* | taxonomy_final_corpus_20260711 | 43,647 | 14,368,768 | Final taxonomy closeout corpus |
| A* | taxonomy_final_llm_ledger_20260711 | 546 | 5,251,072 | Final taxonomy closeout LLM ledger |
| A* | taxonomy_final_remap_audit_20260711 | 1,816 | 335,872 | Final taxonomy closeout remap audit |
| R* | taxonomy_final_triage_20260711 | 43,647 | 18,776,064 | Final taxonomy closeout classification corpus |
| A | taxonomy_mapping_audit_20260710 | 5,798 | 1,220,608 | Taxonomy expansion mapping audit |
| A | taxonomy_new_treatment_proposals_20260710 | 20 | 49,152 | Taxonomy expansion proposals; candidate rows now reflected in aliases/treatments |
| A | taxonomy_phase4_alias_remap_audit_20260711 | 8 | 16,384 | Taxonomy phase 4 alias remap audit |
| A | taxonomy_phase4_offering_remap_audit_20260711 | 7,738 | 1,441,792 | Taxonomy phase 4 offering remap audit |
| A | taxonomy_phase4_offering_treatment_backup_20260711 | 100,535 | 3,686,400 | Taxonomy phase 4 offering backup |
| A | taxonomy_phase4_rejected_terms_20260711 | 4 | 32,768 | Taxonomy phase 4 rejected terms |
| A | taxonomy_phase4_treatment_aliases_backup_20260711 | 3,080 | 450,560 | Taxonomy phase 4 alias backup |
| A | taxonomy_phase4_treatments_backup_20260711 | 43 | 16,384 | Taxonomy phase 4 treatment backup |
| A | taxonomy_term_corpus_20260710 | 42,922 | 14,344,192 | Taxonomy expansion term corpus |
| A | url_tracking_hygiene_audit_20260708 | 4 | 16,384 | URL/UTM tracking hygiene audit |
| A | website_image_harvest_candidates_20260708 | 4,263 | 2,818,048 | Website image-harvest candidate corpus |
| A | website_image_harvest_results_20260708 | 2,283 | 991,232 | Website image-harvest results |

### Exact code-reference cross-check

Each candidate name was searched as a fixed string under src/, pipeline/, and scripts/.

~~~text
src/ exact references:      0 tables
pipeline/ exact references: 0 tables
scripts/ exact references:  34 tables
~~~

Thirty-two referenced tables occur only in scripts listed for legacy archival below: 26 A*, four H*, and two R*. All 32 are excluded from the conservative Phase B batch because those scripts do not move until Phase C; the H*/R* rows also have independent workflow-state reasons. Two additional tables occur in the keeper structure generator and have disposition L, bringing the exact-reference total to 34.

| Table | Referencing file(s) |
|---|---|
| bookimed_website_backfill_location_actions_20260708 | scripts/execute-bookimed-mismatch-approvals.mjs |
| clinic_website_offering_extractions_20260711 | scripts/resume-hyperbaric-task-d3-shortdb-20260711.mjs; scripts/execute-final-closeout-20260711.mjs; scripts/execute-hyperbaric-task-d-20260711.mjs |
| dedup_candidates_20260711 | scripts/execute-hyperbaric-dedup-v2.mjs |
| field_corrections_backup_20260711 | scripts/apply-hyperbaric-task-c-20260711.mjs |
| final_closeout_offerings_backup_20260711 | scripts/execute-final-closeout-20260711.mjs |
| final_closeout_search_function_backup_20260711 | scripts/execute-final-closeout-20260711.mjs |
| final_closeout_search_index_backup_20260711 | scripts/execute-final-closeout-20260711.mjs |
| final_closeout_treatment_aliases_backup_20260711 | scripts/execute-final-closeout-20260711.mjs |
| final_closeout_treatments_backup_20260711 | scripts/execute-final-closeout-20260711.mjs |
| hyperbaric_app_image_audit_20260710 | scripts/execute-hyperbaric-image-promotion.mjs; scripts/regenerate-neon-database-structure.mjs |
| hyperbaric_app_promotion_audit_20260710 | scripts/execute-hyperbaric-image-promotion.mjs; scripts/apply-hyperbaric-task-c-20260711.mjs; scripts/regenerate-neon-database-structure.mjs; scripts/execute-hyperbaric-dedup-v2.mjs |
| hyperbaric_cleanup_call_ledger_20260711 | scripts/resume-hyperbaric-task-d3-shortdb-20260711.mjs; scripts/execute-hyperbaric-task-d-20260711.mjs; scripts/execute-hyperbaric-task-b-20260711.mjs; scripts/execute-hyperbaric-b3-llm-20260711.mjs; scripts/execute-brand-scope-closeout-20260711.mjs |
| hyperbaric_cleanup_queue_20260710 | scripts/execute-hyperbaric-cleanup-sweep.mjs |
| hyperbaric_cleanup_queue_20260711 | scripts/execute-hyperbaric-task-d-20260711.mjs; scripts/apply-hyperbaric-task-c-20260711.mjs; scripts/execute-hyperbaric-b3-llm-20260711.mjs; scripts/execute-hyperbaric-task-b-20260711.mjs; scripts/execute-brand-scope-sweep-20260711.mjs; scripts/resume-hyperbaric-task-d3-shortdb-20260711.mjs |
| hyperbaric_cleanup_results_20260710 | scripts/execute-hyperbaric-cleanup-sweep.mjs |
| hyperbaric_cleanup_results_20260711 | scripts/apply-hyperbaric-task-c-20260711.mjs; scripts/execute-brand-scope-sweep-20260711.mjs; scripts/execute-hyperbaric-b3-llm-20260711.mjs |
| hyperbaric_cleanup_website_fetches_20260711 | scripts/resume-hyperbaric-task-d3-shortdb-20260711.mjs; scripts/execute-hyperbaric-task-d-20260711.mjs; scripts/execute-hyperbaric-b3-llm-20260711.mjs; scripts/execute-hyperbaric-task-b-20260711.mjs |
| hyperbaric_dedup_candidates_20260710 | scripts/execute-hyperbaric-cleanup-sweep.mjs |
| hyperbaric_field_corrections_backup_20260710 | scripts/execute-hyperbaric-cleanup-sweep.mjs |
| hyperbaric_price_review_20260710 | scripts/execute-hyperbaric-cleanup-sweep.mjs |
| hyperbaric_task_d_contact_fills_20260711 | scripts/execute-hyperbaric-task-d-20260711.mjs |
| hyperbaric_task_d_review_backfill_20260711 | scripts/execute-hyperbaric-task-d-20260711.mjs |
| location_geocode_low_confidence_20260707 | scripts/execute-location-geocode-addendum.mjs |
| location_geocode_wrong_branch_address_20260707 | scripts/execute-location-wrong-branch-mini-fix.mjs |
| price_conflicts_20260711 | scripts/apply-hyperbaric-task-c-20260711.mjs |
| price_review_20260711 | scripts/apply-hyperbaric-task-c-20260711.mjs |
| taxonomy_dedup_merge_audit_20260712 | scripts/execute-taxonomy-dedup-20260712.mjs |
| taxonomy_dedup_offerings_backup_20260712 | scripts/execute-taxonomy-dedup-20260712.mjs |
| taxonomy_dedup_treatment_aliases_backup_20260712 | scripts/execute-taxonomy-dedup-20260712.mjs |
| taxonomy_dedup_treatments_backup_20260712 | scripts/execute-taxonomy-dedup-20260712.mjs |
| taxonomy_final_corpus_20260711 | scripts/execute-final-closeout-20260711.mjs |
| taxonomy_final_llm_ledger_20260711 | scripts/execute-final-closeout-20260711.mjs |
| taxonomy_final_remap_audit_20260711 | scripts/execute-final-closeout-20260711.mjs |
| taxonomy_final_triage_20260711 | scripts/execute-final-closeout-20260711.mjs |

## 2. Scripts to move

There are 47 current files under scripts/: 42 nominal move targets and five keepers. All 47 currently have user worktree state: the nominal move targets comprise 17 tracked-modified files and 25 untracked files; the keepers comprise three tracked-modified files and two untracked files. Phase C must preserve their current contents.

### Nominal plan move list

The Phase 3 prompt names all 42 paths below for movement from scripts/ to the same basename under archive/scripts-legacy/. One is conservatively retained as a still-runnable human-review ingester; the other 41 form the default proposed Phase C move set.

1. scripts/apply-hyperbaric-task-c-20260711.mjs
2. scripts/audit-org-dedup.mjs
3. scripts/check-geocode-coverage.mjs
4. scripts/check-postgres-state.mjs
5. scripts/cleanup-vercel-blob-images.mjs
6. scripts/execute-analytics-tagging-fixes.mjs
7. scripts/execute-bookimed-cleanup-addendum.mjs
8. scripts/execute-bookimed-mismatch-approvals.mjs
9. scripts/execute-bookimed-website-backfill.mjs
10. scripts/execute-brand-scope-closeout-20260711.mjs
11. scripts/execute-brand-scope-sweep-20260711.mjs
12. scripts/execute-closeout-documents-removal.mjs
13. scripts/execute-final-closeout-20260711.mjs
14. scripts/execute-hyperbaric-b3-llm-20260711.mjs
15. scripts/execute-hyperbaric-cleanup-sweep.mjs
16. scripts/execute-hyperbaric-dedup-v2.mjs
17. scripts/execute-hyperbaric-image-promotion.mjs
18. scripts/execute-hyperbaric-task-b-20260711.mjs
19. scripts/execute-hyperbaric-task-d-20260711.mjs
20. scripts/execute-image-hygiene.mjs
21. scripts/execute-image-promotion.mjs
22. scripts/execute-location-followup-cleanup.mjs
23. scripts/execute-location-geocode-addendum.mjs
24. scripts/execute-location-geocode-backfill.mjs
25. scripts/execute-location-geocode-guardrail-backfill.mjs
26. scripts/execute-location-normalization.mjs
27. scripts/execute-location-wrong-branch-mini-fix.mjs
28. scripts/execute-menu-cleanup-tiers23.mjs
29. scripts/execute-org-dedup-phase2.mjs
30. scripts/execute-places-website-backfill.mjs
31. scripts/execute-taxonomy-dedup-20260712.mjs
32. scripts/execute-taxonomy-expansion.mjs
33. scripts/execute-taxonomy-phase4.mjs
34. scripts/execute-tier3-continuation-maintenance.mjs
35. scripts/execute-utm-tracking-hygiene.mjs
36. scripts/execute-website-image-harvest.mjs
37. scripts/ingest-browser-swarm-images-menus.mjs
38. scripts/ingest-hyperbaric-app.mjs
39. scripts/ingest-image-review-decisions.mjs — HOLD as the one still-runnable human-review ingester
40. scripts/resume-hyperbaric-task-d3-shortdb-20260711.mjs
41. scripts/run-browser-swarm-images-menus.mjs
42. scripts/run-pipeline-step.mjs

The 41 files moved under the conservative default will be historical source snapshots. Their existing relative imports are rooted in scripts/ and will not remain runnable after a plain move unless separately rewritten; no rewrite is proposed for legacy artifacts. Approval therefore declares those 41 scripts retired before Phase B; they are not live execution paths even though the physical git moves occur in Phase C. The one review ingester remains in scripts/ with its current pipeline-env helper and its default input file until image review is explicitly closed or migrated; retaining it does not authorize running it during Phase 3.

### Held data versus legacy resolver scripts

The H/R designations preserve unresolved campaign data; they do not preserve every one-off campaign runner. This matches the restructure plan, which resumes those workflows through standing pipeline tasks:

| Held data | Intended continuation | Legacy-script treatment |
|---|---|---|
| dedup_candidates_20260711 | Pass 7 pipeline dedup_scan input/review migration | scripts/execute-hyperbaric-dedup-v2.mjs retires and moves |
| hyperbaric_cleanup_results_20260711 | Pass 1 legitimacy_check task/review migration | Hyperbaric brand/LLM campaign scripts retire and move; referenced DB support cohort remains held |
| price_conflicts_20260711 and price_review_20260711 | Pass 5 standing price-review workflow | scripts/apply-hyperbaric-task-c-20260711.mjs retires and moves |
| held geocode review tables | Standing geocode task plus explicit human review | Location-geocode campaign scripts retire and move |
| taxonomy_final_triage_20260711 | Explicit close-or-migrate decision before deletion | scripts/execute-final-closeout-20260711.mjs retires and moves; referenced taxonomy cohort remains held |
| browser-swarm image review | Finish with the retained image-review ingester or migrate to Pass 4 image_classify | scripts/ingest-image-review-decisions.mjs, its default input, the H table, and swarm-browser-output/ remain in place |

Dynamic dated-name construction was considered separately from the fixed-string table grep. For example, scripts/run-browser-swarm-images-menus.mjs defaults to browser_swarm_jobs_20260708 and dynamically reads website_image_harvest_results_20260708 plus website_image_harvest_candidates_20260708. That script is one of the 41 explicitly retired paths, so those dynamic dependencies are not classified as live. The sole runnable hold, scripts/ingest-image-review-decisions.mjs, dynamically defaults to the already-held browser_swarm_image_ingest_20260708 table and the root input image-review-decisions-20260708.json, which is also held below.

### Keeper outcomes

| Current keeper | Phase C outcome |
|---|---|
| scripts/regenerate-neon-database-structure.mjs | Absorb into pipeline maintain regen-structure-doc. Remove its hard-coded dependency on the two Hyperbaric audit tables before those tables become archiveable. No dual copy remains. |
| scripts/run-sql-migration.mjs | Absorb into pipeline migrate. The Phase 1 CLI currently delegates to this script, so the duplicate pathway is removed only after equivalent behavior is verified. |
| scripts/refresh-city-index.mjs | Absorb into pipeline maintain refresh-city-index. No dual copy remains. |
| scripts/test-url-sanitize.mjs | Convert into tests/url-sanitize.test.ts under Vitest, then empty the old script location. |
| scripts/lib/pipeline-env.mjs | Retain as the shared compatibility helper during this phase; current pipeline code imports it. No move is approved by this inventory. |

One other tracked file, scripts/test-country-search.mjs, is already deleted in the user worktree and is not one of the 47 current files. It is outside these moves and must remain untouched.

### package.json references that Phase C must repair

| Command | Current target |
|---|---|
| db:check | scripts/check-postgres-state.mjs |
| geocode:check | scripts/check-geocode-coverage.mjs |
| geocode:backfill | scripts/execute-location-geocode-guardrail-backfill.mjs |
| blob:cleanup | scripts/cleanup-vercel-blob-images.mjs |
| images:promote | scripts/execute-image-promotion.mjs |
| images:hygiene | scripts/execute-image-hygiene.mjs |
| images:harvest-websites | scripts/execute-website-image-harvest.mjs |
| swarm:extract | scripts/run-browser-swarm-images-menus.mjs |
| swarm:ingest | scripts/ingest-browser-swarm-images-menus.mjs |

## 3. Root and output artifacts to move

### Root JSON artifacts

Forty-two campaign JSON artifacts are in the nominal archive/reports/ scope, totaling approximately 31.1 MiB when the tracked-deleted versions are read from HEAD. The conservative Phase C set moves 41 and retains image-review-decisions-20260708.json beside its still-runnable ingester.

#### Tracked and present — 10

1. closeout-documents-removal-report-20260707.json
2. db-cleanup-report.service-area-20260707.json
3. db-cleanup-report.tags-20260707.json
4. places-website-backfill-checkpoint-20260707.json
5. places-website-backfill-report-20260707.blocked.json
6. places-website-backfill-report-20260707.inventory.json
7. places-website-backfill-report-20260707.json
8. schema-streamlining-preflight-20260708.json
9. taxonomy-expansion-report-20260710.json
10. taxonomy-phase4-report-20260711.json

#### Untracked and present — 14

Visible to Git:

1. image-promotion-final-summary-20260708.json
2. image-review-decisions-20260708.json — HOLD as the retained ingester's default input
3. tier3-continuation-usd3-source-check-20260708.json

Ignored by the current report/checkpoint/dry-run rules:

4. hyperbaric-app-image-promotion-report-20260710.json
5. image-hygiene-report-20260708.json
6. image-review-decisions-ingest-report-20260708.json
7. location-geocode-guardrail-backfill-checkpoint-20260709.json
8. location-geocode-guardrail-backfill-report-20260709.json
9. location-jsonld-recovery-report-20260709.json
10. menu-cleanup-tiers23-report-20260708.json
11. taxonomy-expansion-report-20260710.dry-run.json
12. taxonomy-phase4-report-20260711.dry-run.json
13. website-image-harvest-checkpoint-20260708.json
14. website-image-harvest-report-20260708.json

#### Tracked but currently deleted in the user worktree — 18

These would have to be restored from HEAD and then moved, rather than silently preserving the current deletions:

1. analytics-tagging-fixes-report-20260709.json
2. closeout-documents-removal-report-20260707.dry-run.json
3. location-followup-cleanup-report-20260707.dry-run.json
4. location-followup-cleanup-report-20260707.json
5. location-geocode-addendum-report-20260707.dry-run.json
6. location-geocode-addendum-report-20260707.json
7. location-geocode-backfill-checkpoint-20260707.json
8. location-geocode-backfill-report-20260707.dry-run.json
9. location-geocode-backfill-report-20260707.json
10. location-geocode-backfill-report-20260707.post-followup.inventory.json
11. location-normalization-report-20260707.dry-run.json
12. location-normalization-report-20260707.json
13. location-wrong-branch-mini-fix-report-20260707.dry-run.json
14. location-wrong-branch-mini-fix-report-20260707.json
15. org-dedup-audit-report-20260707.json
16. org-dedup-phase2-report-20260707.dry-run.json
17. org-dedup-phase2-report-20260707.json
18. places-website-backfill-report-20260707.dry-run.json

### swarm-browser-output/ — HOLD

The entire untracked, non-ignored directory is in the nominal move plan, but the conservative default keeps it at swarm-browser-output/ until its remaining review work is explicitly closed or migrated. It contains 105 parseable files in 14 directories and occupies approximately 65 MiB. A later approved move would place it at archive/swarm-browser-output/.

Top-level files — 21:

1. swarm-browser-output/swarm-images-menus-tier1-20260708.checkpoint.json
2. swarm-browser-output/swarm-images-menus-tier1-20260708.ingest.json
3. swarm-browser-output/swarm-images-menus-tier1-20260708.json
4. swarm-browser-output/swarm-images-menus-tier1-20260708.review.json
5. swarm-browser-output/swarm-images-menus-tier1-smoke-20260708.checkpoint.json
6. swarm-browser-output/swarm-images-menus-tier1-smoke-20260708.json
7. swarm-browser-output/swarm-images-menus-tier2-20260708.ingest.json
8. swarm-browser-output/swarm-images-menus-tier2-20260708.review.json
9. swarm-browser-output/swarm-images-menus-tier3-US-batch1-run1-20260708.ingest.json
10. swarm-browser-output/swarm-images-menus-tier3-US-batch1-run1-20260708.review.json
11. swarm-browser-output/swarm-images-menus-tier3-US-batch2-run1-20260709.ingest.json
12. swarm-browser-output/swarm-images-menus-tier3-US-batch2-run1-20260709.review.json
13. swarm-browser-output/swarm-images-menus-tier3-US-batch3-run1-20260709.ingest.json
14. swarm-browser-output/swarm-images-menus-tier3-US-batch3-run1-20260709.resume-ingest.json
15. swarm-browser-output/swarm-images-menus-tier3-US-batch3-run1-20260709.resume-input.json
16. swarm-browser-output/swarm-images-menus-tier3-US-batch3-run1-20260709.resume-review.json
17. swarm-browser-output/swarm-images-menus-tier3-US-batch3-run1-20260709.review.json
18. swarm-browser-output/swarm-images-menus-tier3-batch4-nonus-run1-20260709.ingest.json
19. swarm-browser-output/swarm-images-menus-tier3-batch4-nonus-run1-20260709.review.json
20. swarm-browser-output/swarm-images-menus-tier3-continuation-review-export-20260708.json
21. swarm-browser-output/swarm-images-menus-tier3-continuation-review-export-20260709.json

Worker result files — 84:

1. swarm-browser-output/results/tier1-20260708/worker-1.jsonl
2. swarm-browser-output/results/tier1-20260708/worker-10.jsonl
3. swarm-browser-output/results/tier1-20260708/worker-11.jsonl
4. swarm-browser-output/results/tier1-20260708/worker-12.jsonl
5. swarm-browser-output/results/tier1-20260708/worker-13.jsonl
6. swarm-browser-output/results/tier1-20260708/worker-14.jsonl
7. swarm-browser-output/results/tier1-20260708/worker-15.jsonl
8. swarm-browser-output/results/tier1-20260708/worker-2.jsonl
9. swarm-browser-output/results/tier1-20260708/worker-3.jsonl
10. swarm-browser-output/results/tier1-20260708/worker-4.jsonl
11. swarm-browser-output/results/tier1-20260708/worker-5.jsonl
12. swarm-browser-output/results/tier1-20260708/worker-6.jsonl
13. swarm-browser-output/results/tier1-20260708/worker-7.jsonl
14. swarm-browser-output/results/tier1-20260708/worker-8.jsonl
15. swarm-browser-output/results/tier1-20260708/worker-9.jsonl
16. swarm-browser-output/results/tier2-20260708/worker-1.jsonl
17. swarm-browser-output/results/tier2-20260708/worker-10.jsonl
18. swarm-browser-output/results/tier2-20260708/worker-11.jsonl
19. swarm-browser-output/results/tier2-20260708/worker-12.jsonl
20. swarm-browser-output/results/tier2-20260708/worker-2.jsonl
21. swarm-browser-output/results/tier2-20260708/worker-3.jsonl
22. swarm-browser-output/results/tier2-20260708/worker-4.jsonl
23. swarm-browser-output/results/tier2-20260708/worker-5.jsonl
24. swarm-browser-output/results/tier2-20260708/worker-6.jsonl
25. swarm-browser-output/results/tier2-20260708/worker-7.jsonl
26. swarm-browser-output/results/tier2-20260708/worker-8.jsonl
27. swarm-browser-output/results/tier2-20260708/worker-9.jsonl
28. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-1.jsonl
29. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-10.jsonl
30. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-11.jsonl
31. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-12.jsonl
32. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-2.jsonl
33. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-3.jsonl
34. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-4.jsonl
35. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-5.jsonl
36. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-6.jsonl
37. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-7.jsonl
38. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-8.jsonl
39. swarm-browser-output/results/tier3-US-batch1-run1-20260708/worker-9.jsonl
40. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-1.jsonl
41. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-10.jsonl
42. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-11.jsonl
43. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-12.jsonl
44. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-13.jsonl
45. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-14.jsonl
46. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-15.jsonl
47. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-2.jsonl
48. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-3.jsonl
49. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-4.jsonl
50. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-5.jsonl
51. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-6.jsonl
52. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-7.jsonl
53. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-8.jsonl
54. swarm-browser-output/results/tier3-US-batch2-run1-20260709/worker-9.jsonl
55. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-1.jsonl
56. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-10.jsonl
57. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-11.jsonl
58. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-12.jsonl
59. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-13.jsonl
60. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-14.jsonl
61. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-15.jsonl
62. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-2.jsonl
63. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-3.jsonl
64. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-4.jsonl
65. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-5.jsonl
66. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-6.jsonl
67. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-7.jsonl
68. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-8.jsonl
69. swarm-browser-output/results/tier3-US-batch3-run1-20260709/worker-9.jsonl
70. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-1.jsonl
71. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-10.jsonl
72. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-11.jsonl
73. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-12.jsonl
74. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-13.jsonl
75. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-14.jsonl
76. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-15.jsonl
77. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-2.jsonl
78. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-3.jsonl
79. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-4.jsonl
80. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-5.jsonl
81. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-6.jsonl
82. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-7.jsonl
83. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-8.jsonl
84. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/worker-9.jsonl

Directory inventory — 14 including the root:

1. swarm-browser-output/
2. swarm-browser-output/results/
3. swarm-browser-output/results/tier1-20260708/
4. swarm-browser-output/results/tier2-20260708/
5. swarm-browser-output/results/tier3-US-batch1-run1-20260708/
6. swarm-browser-output/results/tier3-US-batch2-run1-20260709/
7. swarm-browser-output/results/tier3-US-batch3-run1-20260709/
8. swarm-browser-output/results/tier3-batch4-nonus-run1-20260709/
9. swarm-browser-output/results/tier3-AE-20260708/ (empty)
10. swarm-browser-output/results/tier3-GB-20260708/ (empty)
11. swarm-browser-output/results/tier3-US-20260708/ (empty)
12. swarm-browser-output/results/tier3-US-batch1-20260708/ (empty)
13. swarm-browser-output/results/tier3-US-batch2-20260709/ (empty)
14. swarm-browser-output/results/tier3-scope-20260708/ (empty)

All 21 JSON and 84 JSONL files parse. Ingest counts reconcile to their reports, including the known duplicate origin in Tier 3 US batch 1 and the 29-row batch 3 resume. Tier 1 has no undecided image decisions, but this directory still carries 14 Tier 2 low-confidence image decisions and 19 Tier 3 price-sanity flags. Its three direct swarm-run consumers retire with the other legacy scripts; src/ and pipeline/ have no references. The output remains in place as evidence and image-review input, the retained image-decision ingester remains available but unexecuted, and the menu/price flags are preserved for migration to the standing pipeline rather than continued through the retired swarm scripts.

Additional .cache/ campaign output and historical Markdown reports under docs/ are outside the Phase 3 prompt and remain untouched.

## Phase B/C execution constraints approved for handling

- The broad Markdown/archive ignore rules required narrowing so the inventory, manifest, legacy scripts, and reports could be committed while dump payloads remained local. This was approved with the requirement to preserve unrelated user edits.
- archive/README.md required replacement with committed-archive and dump-custody guidance.
- git mv could not operate directly on the 24 approved untracked script moves or the 13 approved untracked root artifacts. The approved sequence was force-stage where necessary, then git mv. The held ingester/input and wholly untracked swarm output face the same requirement if a later move is approved.
- Empty swarm directories cannot be represented in Git without placeholders. No placeholder is proposed unless explicitly requested.
- Restoring the 18 tracked-deleted JSON artifacts from HEAD changes existing user worktree state. Approval must explicitly cover restore-then-move, or those 18 should be excluded.
- Nine package.json commands point to nominal move targets. Phase C must repair or remove commands whose scripts actually move and retain valid commands for any temporary support holds.
- The legacy scripts will be source snapshots, not runnable tools, because their relative imports are not rewritten.

## Gate A report

**PHASE A: APPROVED**

**What was done:** Inventoried all 155 fountain_raw tables, classified all 145 nominal archive candidates, checked foreign keys, exact code references, and pending workflow state, and enumerated every proposed script, root artifact, and swarm-output move.

**Evidence:** Exact row and pg_total_relation_size values are above; both FK queries returned zero disallowed references; fixed-string code search found zero src/ references, zero pipeline/ references, and 34 scripts/ references; all swarm JSON/JSONL files parse and campaign counts reconcile.

**Deviations from plan:** No destructive work began. The inventory uses the actual plan path docs/fountain-pipeline-restructure-plan.md. It proposes a conservative 106-table Phase B batch rather than all 145 nominal candidates because Phase B precedes the Phase C script moves: all 34 exact code references remain excluded, along with five additional review tables without fixed-string hits. It also temporarily holds the still-runnable image-review ingester, its default input, and swarm-browser-output/; other one-off resolvers are explicitly retired in favor of the future standing pipeline.

**Approved execution scope:**

1. Approved: dump, verify, and drop only the 106 A tables; retain all 39 A*/H/R/L tables.
2. Approved: retire and move 41 legacy scripts and 41 root JSON artifacts, perform the five keeper outcomes, and retain the image-review ingester, its default input JSON, and swarm-browser-output/.
3. Approved: restore then git-move the 18 tracked JSON artifacts that were deleted in the worktree.
4. Approved: stage then git-move the approved untracked/ignored scripts and root artifacts, including force-add where necessary.
5. Approved: adjust .gitignore and archive/README.md while preserving unrelated user changes.
6. Approved: re-inventory the 26 otherwise complete A* tables and two current L tables in a separate future archive batch after Phase C removes their code dependencies.

Malena approved this conservative scope explicitly on 2026-07-11, including the documented restore, staging, and ignore-rule handling.
