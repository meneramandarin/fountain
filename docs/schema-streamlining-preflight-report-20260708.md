# Schema Streamlining Preflight Report (20260708)

Mode: preflight only. No destructive DDL was applied.

## Branch Gate

The attached prompt requires all DDL to run on a Neon branch first, then app verification against that branch, then apply to main. `neonctl` is available through `npx`, but this environment is not authenticated and `NEON_PROJECT_ID` is empty, so a Neon branch could not be created safely from here.

Required unblocker: authenticate `neonctl` in this workspace or provide a Neon branch connection string/API credentials. Until then, the migration must not be applied to the main database.

## Mandatory Reference Grep

Affected table references found before any DDL:

| Object | Code References |
| --- | --- |
| `fountain.unmapped_terms` | `scripts/check-postgres-state.mjs` |
| `fountain.treatment_aliases` | `scripts/check-postgres-state.mjs` |
| `fountain.import_metadata` | no app/script runtime reference found; docs only |
| `fountain.sources` | `src/lib/queries.ts`, `scripts/check-postgres-state.mjs`, `scripts/execute-closeout-documents-removal.mjs` |
| `fountain_raw.source_databases` | `scripts/check-postgres-state.mjs`, `scripts/execute-closeout-documents-removal.mjs` |
| `fountain.external_reviews` | `src/lib/queries.ts`, `src/components/directory-detail-page.tsx`, `scripts/check-postgres-state.mjs` |
| `fountain.reviews` | `src/lib/queries.ts`, `src/components/directory-detail-page.tsx`, `scripts/check-postgres-state.mjs` |
| `fountain.external_place_matches` | `src/lib/queries.ts`, `scripts/execute-places-website-backfill.mjs`, `scripts/execute-closeout-documents-removal.mjs` |
| `fountain.categories` | `src/lib/queries.ts`, `scripts/check-postgres-state.mjs` |
| `fountain.treatments` | `src/lib/queries.ts`, `scripts/check-postgres-state.mjs`, `src/lib/popular-treatments.ts` |
| `fountain.images.local_path` | `scripts/check-postgres-state.mjs`, docs only for direct column mentions |
| `fountain.locations.price_text` | no app/script runtime reference found by targeted grep; 610 rows are populated |
| `fountain.accounts` | `scripts/check-postgres-state.mjs`; referenced by ownership FKs |
| `fountain.clinic_claims` | `scripts/check-postgres-state.mjs` |
| `fountain.listing_submissions` | `scripts/check-postgres-state.mjs` |

## Exact Current Counts

| Object | Rows / Condition |
| --- | ---: |
| `fountain.unmapped_terms` | 53,607 |
| `fountain.treatment_aliases` | 95 |
| `fountain.import_metadata` | 3 |
| `fountain.sources` | 254 |
| `fountain_raw.source_databases` | 254 |
| `fountain.external_reviews` | 9,164 |
| `fountain.reviews` | 3,018 |
| `fountain.external_place_matches` | 2,544 |
| `fountain.categories` | 7 |
| `fountain.treatments` | 43 |
| `images.local_path` non-empty | 0 |
| `locations.price_text` non-empty | 610 |
| `fountain.accounts` | 0 |
| `neon_auth.user` | 0 |

## Step Findings

### Step 1: Move Pipeline Tables

`unmapped_terms`, `treatment_aliases`, and `import_metadata` can be moved to `fountain_raw` with `ALTER TABLE ... SET SCHEMA fountain_raw`. Code references that need updating are in `scripts/check-postgres-state.mjs`. No frontend runtime references were found.

### Step 2: Source Duplication

`fountain.sources` and `fountain_raw.source_databases` match exactly by slug:

| Compare | Count |
| --- | ---: |
| matched slugs | 254 |
| raw without source | 0 |
| source without raw | 0 |

Recommended implementation remains the prompt preference: keep `fountain.sources` as FK target with `id`, `slug`, `trust_weight`; drop duplicated metadata columns `name`, `base_url`, `scraped_at`, `record_count`. Source metadata remains in `fountain_raw.source_databases`.

### Step 3: Review Merge

Current `reviews` columns use text `rating` and `review_date`; target should convert to numeric/date and add provider fields.

Preflight review merge numbers:

| Metric | Count |
| --- | ---: |
| existing `reviews` rows | 3,018 |
| `external_reviews` rows | 9,164 |
| obvious duplicate rows by same location/author/body | 627 |
| duplicate groups | 591 |
| external review date values not ISO `YYYY-MM-DD` | 9,164 |
| external reviews with blank fetched timestamp | 0 |
| external reviews with nonblank raw JSON | 0 |

`external_place_matches` should stay. It has 2,544 rows; 331 have nonblank `raw_json`, and 331 have nonblank `expires_at`. Convert `fetched_at`/`expires_at` from text to `timestamptz`, and `raw_json` from text to `jsonb`.

### Step 4: Categories Into Treatments

No category route/page was found. Category usage is query-only in `src/lib/queries.ts`.

Current category rows:

| id | category | treatments |
| ---: | --- | ---: |
| 1 | Diagnostics & testing | 16 |
| 2 | Regenerative & cellular | 4 |
| 3 | IV & infusion | 3 |
| 4 | Hormone & metabolic | 3 |
| 5 | Recovery & performance | 7 |
| 6 | Aesthetic | 5 |
| 7 | Lifestyle & foundational | 5 |

Implementation path: add `treatments.category text`, populate from `categories.name`, update `src/lib/queries.ts` joins to read `t.category`, then drop `treatments.category_id`, `categories` FK, and `categories`.

### Step 5: Small Removals

`images.local_path` is dead by data: 0 non-empty rows. Drop `images_blob_backed`, drop `local_path`, then recreate the blob-backed check without `local_path`.

`locations.price_text` has 610 populated rows. Although no app/runtime reference was found, this is not empty. Dropping it is still consistent with the prompt if it is a pre-offerings leftover, but it should be explicitly backed up in `fountain_raw` before dropping.

### Step 6: Identity Decision

`accounts` and `neon_auth.user` both have 0 rows. Add `accounts.auth_user_id uuid UNIQUE REFERENCES neon_auth."user"(id)` plus comments documenting that Neon Auth owns auth identity and `fountain.accounts` owns product profile/ownership.

## Blocked Before DDL

The branch-first safety rail is currently unsatisfied. Next concrete step is Neon authentication/branch creation, then run this migration on the branch and perform:

- `npm run db:check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Manual smoke test: location page, organization/location detail page, search, city/treatment directory page

Only after that should the migration run against main.
