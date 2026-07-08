# Schema Streamlining Report - 2026-07-08

## Scope

Structural cleanup from `schema-streamlining-prompt.md`: keep product-serving tables in `fountain`, move pipeline machinery to `fountain_raw`, collapse duplicated concepts, and update app code plus verification scripts to match the new serving schema.

Migration file:

- `migrations/20260708_schema_streamlining.sql`

Runner:

- `scripts/run-sql-migration.mjs`

Execution note: the first live command accidentally expanded an empty `--database-url` argument and therefore used the default project database URL before the requested branch URL. The same migration file was then run against the requested Neon branch, and both the branch and default/main database now have the same post-migration shape and passed the same verification checks.

## Preflight Reference Scan

Before the DDL pass, the affected schema objects were checked across app code, scripts, and docs.

Runtime references that required updates:

- `src/lib/queries.ts`
  - Category join in treatment listing.
  - Location detail review aggregation.
  - External review group shape.
- `src/components/directory-detail-page.tsx`
  - Review display fields changed from `reviewer/body` to `author/text`.
  - Existing location formatting cleanup retained.
- `scripts/check-postgres-state.mjs`
  - Removed expectations for `documents`, `categories`, `external_reviews`, `unmapped_terms`, `treatment_aliases`, and `import_metadata` as serving tables.
  - Removed image `local_path` check.
  - Added raw-table placement checks.
- `docs/POSTGRES_MIGRATION.md`
  - Removed document-search trigger language.
  - Updated image storage contract.

No frontend category routes/pages were found. Category usage was query-side only, through the old `treatments.category_id -> categories.id` relationship.

## Tables Moved To `fountain_raw`

These tables were moved out of the serving schema:

| Table | Rows | New location |
| --- | ---: | --- |
| `unmapped_terms` | 53,607 | `fountain_raw.unmapped_terms` |
| `treatment_aliases` | 95 | `fountain_raw.treatment_aliases` |
| `import_metadata` | 3 | `fountain_raw.import_metadata` |

Verification now fails if those tables reappear in `fountain` or are missing from `fountain_raw`.

## Retired Historical Raw Backups

To keep the raw schema usable, 15 old one-off backup tables from prior cleanup runs were retired before the main structural pass. The migration records their names and sizes in:

- `fountain_raw.schema_streamlining_retired_raw_tables_20260708`

Source provenance tables such as `source_databases`, `source_images`, and `source_records` were not retired.

## Sources

`fountain.sources` was slimmed to the product-serving FK surface:

- `id`
- `slug`
- `trust_weight`

Source metadata remains in `fountain_raw.source_databases`.

Slug parity check:

| Check | Count |
| --- | ---: |
| Matching source slugs | 254 |
| Raw-only slugs | 0 |
| Serving-only slugs | 0 |

## Reviews Merge

`fountain.external_reviews` was merged into `fountain.reviews`, then dropped.

Final `fountain.reviews` shape now supports:

- `provider`
- `provider_place_id`
- `author`
- `text`
- `rating numeric`
- `review_date date`
- `fetched_at timestamptz`
- `raw_payload jsonb`
- existing lifecycle fields

Migration result:

| Metric | Count |
| --- | ---: |
| Existing scrape reviews before merge | 3,018 |
| Google external reviews before merge | 9,164 |
| Google external reviews inserted | 9,164 |
| Obvious cross-source duplicates skipped | 0 |
| Final reviews | 12,182 |

Null/parse results:

| Field | Count |
| --- | ---: |
| Google review dates null after parse | 0 |
| Scrape review dates null after parse | 5 |
| Scrape ratings null after parse | 0 |

External review date format breakdown:

| Source | Total | Timestamp strings | Relative strings | Singular relative strings | Unparseable |
| --- | ---: | ---: | ---: | ---: | ---: |
| Google external reviews | 9,164 | 9,164 | 0 | 0 | 0 |

The approved relative-date fallback was not needed because all Google external review dates were timestamp strings. No Google review dates were nulled.

Audit tables:

- `fountain_raw.schema_streamlining_review_format_audit_20260708`
- `fountain_raw.schema_streamlining_review_migration_audit_20260708`

## External Place Matches

`fountain.external_place_matches` stayed in the serving schema because it is the place-match cache, not a duplicate review table.

Typed conversions:

- `fetched_at text -> timestamptz`
- `expires_at text -> timestamptz`
- `raw_json text -> jsonb`

Backup:

- `fountain_raw.schema_streamlining_external_place_matches_text_backup_20260708`

Rows backed up: 2,544.

## Categories Folded Into Treatments

`fountain.categories` had 7 grouping rows and no direct frontend route/page usage.

Change:

- Added `fountain.treatments.category text NOT NULL`.
- Populated it from the old `category_id` relationship.
- Updated treatment queries to read `treatments.category`.
- Dropped `treatments.category_id`.
- Dropped `fountain.categories`.

No category URLs needed preservation because no category pages were found.

## Small Removals

### Images

Dropped:

- `fountain.images.local_path`

Backup:

- `fountain_raw.schema_streamlining_images_local_path_backup_20260708`

Rows backed up: 0.

The `images_blob_backed` constraint now checks `blob_url IS NOT NULL AND blob_url <> ''`.

### Location Price Text

Dropped:

- `fountain.locations.price_text`

Approved backup:

- `fountain_raw.locations_price_text_backup`

Rows backed up: 610.

Prices are now modeled on offerings.

### Documents

Dropped:

- `fountain.documents`

Reason: the acceptance list excludes documents, the table had 0 rows, and document search triggers were removed from the serving check.

Backup:

- `fountain_raw.schema_streamlining_documents_backup_20260708`

Rows backed up: 0.

## Identity

Kept:

- `fountain.accounts`
- `fountain.clinic_claims`
- `fountain.listing_submissions`

Added:

- `fountain.accounts.auth_user_id uuid`
- Unique partial index on `auth_user_id`
- FK to `neon_auth."user"(id) ON DELETE SET NULL`

Note: the prompt requested `text`, but Neon auth user IDs are `uuid`; the column was created as `uuid` so the FK can be enforced by Postgres.

Ownership decision documented in database comments:

- `neon_auth` owns authentication identity.
- `fountain.accounts` owns directory profile and ownership metadata.

## Stored Functions Updated

Replaced before dropping referenced columns/tables:

- `fountain.attach_location_image`
  - Removed `local_path` insert.
- `fountain.create_location`
  - Removed `price_text` insert.
- `fountain.delete_location_cascade`
  - Removed `external_reviews` delete.
- `fountain.merge_locations`
  - Removed `price_text` and `external_reviews` logic.

## Code Files Touched

- `src/lib/queries.ts`
  - Reads reviews from unified `fountain.reviews`.
  - Uses `reviews.provider = 'google_places'` for external review groups.
  - Reads treatment categories from `treatments.category`.
- `src/components/directory-detail-page.tsx`
  - Displays unified review fields.
- `scripts/check-postgres-state.mjs`
  - Verifies the streamlined serving/raw split.
- `scripts/run-sql-migration.mjs`
  - Executes a SQL migration file against an explicit `--database-url` or environment URL.
- `docs/POSTGRES_MIGRATION.md`
  - Updated serving-schema/search/image notes.
- `docs/NEON_DATABASE_STRUCTURE_CURRENT.md`
  - Regenerated from the live post-migration schema.

## Final Serving Schema Acceptance

Expected serving tables remain in `fountain`:

- `accounts`
- `affiliations`
- `clinic_claims`
- `entity_change_events`
- `entity_tags`
- `external_place_matches`
- `images`
- `listing_submissions`
- `locations`
- `offerings`
- `organizations`
- `practitioners`
- `reviews`
- `search_index`
- `source_records`
- `sources`
- `tags`
- `treatments`

Removed from `fountain`:

- `external_reviews`
- `categories`
- `documents`
- `unmapped_terms`
- `treatment_aliases`
- `import_metadata`

## Verification

Branch database:

- `node scripts/check-postgres-state.mjs` passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run build` passed with branch `DATABASE_URL`/`POSTGRES_URL`.
- Dedicated organization detail page smoke test was not applicable: the current app route tree has location and practitioner detail pages, but no organization detail route. Organization joins were exercised through location/search responses.
- Smoke tests against a branch-backed dev server passed:
  - Location page: `/directory/locations/md-hyperbaric-new-york`
  - Directory search page: `/directory?kind=locations&q=Fountain`
  - Treatment/city directory page: `/directory?kind=locations&country=US&locality=New%20York&treatment_id=1`
  - Search API: `/api/search?kind=locations&q=Fountain`

Default/main database:

- Same migration file applied.
- `node scripts/check-postgres-state.mjs` passed.
- `npm run build` passed with default environment.

Shared post-migration check values:

| Check | Value |
| --- | ---: |
| `fountain.reviews` total | 12,182 |
| Google reviews in unified table | 9,164 |
| Scrape reviews in unified table | 3,018 |
| Google review dates null | 0 |
| `locations_price_text_backup` rows | 610 |
| Retired old raw backup tables | 15 |

## Deferred

Nothing deferred from the requested structural scope.
