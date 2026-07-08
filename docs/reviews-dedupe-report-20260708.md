# Reviews Dedupe Report - 2026-07-08

## Scope

Deduplicated `fountain.reviews` by:

- `location_id`
- `author`
- normalized `text`
  - lowercase
  - trimmed
  - whitespace-collapsed

Within each duplicate group, the kept row was chosen by:

1. Most populated fields across `rating`, `review_date`, and `raw_payload`.
2. Non-null `rating`.
3. Non-null `review_date`.
4. Non-null `raw_payload`.
5. Lowest `id`.

## Migration

Applied migration:

- `migrations/20260708_reviews_dedupe.sql`

Backup table:

- `fountain_raw.reviews_dedupe_deleted_20260708`

Report table:

- `fountain_raw.reviews_dedupe_report_20260708`

## Result

| Metric | Count |
| --- | ---: |
| Duplicate groups found | 591 |
| Rows backed up before delete | 627 |
| Rows deleted | 627 |
| Reviews before | 12,182 |
| Reviews after | 11,555 |
| Duplicate groups remaining | 0 |
| Duplicate rows remaining | 0 |

## Aggregates

The app's visible Google rating and review-count aggregates are read from `fountain.external_place_matches`, not calculated from `fountain.reviews`.

Post-delete maintenance performed:

- `ANALYZE fountain.reviews`
- `ANALYZE fountain.external_place_matches`

No materialized review aggregate table or refresh function was present.

## Verification

- Empty `--database-url` guard tested for `scripts/run-sql-migration.mjs`; it hard-fails before falling back to env.
- Dedupe migration applied with the patched runner.
- `fountain_raw.reviews_dedupe_deleted_20260708` contains 627 backed-up deleted rows.
- Duplicate-key scan returned 0 remaining groups.
- `npm run db:check` passed.
- `npm run lint` passed.
