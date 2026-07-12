# Reviews Fetch Completion

Completed 2026-07-12. This report reconciles every enrichment-census
`reviews_fetch` task and its immutable Places-call, raw-source, serving-review,
event, and field-ledger evidence.

## Outcome

- Cohort: 5,455 active, non-suppressed locations that began below three active
  serving reviews (5,313 with zero, 69 with one, and 73 with two; 215 total).
- Completion: 5,455/5,455 task rows are done; there are no pending, claimed, or
  failed cohort tasks.
- Final active reviews in the cohort: 18,258, comprising the reconstructed 215
  baseline reviews plus 18,043 Google Places inserts. 3,600 locations now have
  at least three active reviews.
- All task/result identifiers reconcile to their queue rows. Four error-detail
  attempts were Google 404/not-found outcomes and correctly have no result call
  pointer; they made no write.

| Final outcome | Locations | Task-reported review inserts |
| --- | ---: | ---: |
| `reviews_stored` | 3,823 | 18,042 |
| `no_new_reviews` | 462 | 0 |
| `provider_identity_mismatch` | 681 | 0 |
| `provider_place_not_found` | 489 | 0 |
| **Total** | **5,455** | **18,042** |

The serving-review ledger contains 18,043 inserts: one additional serving row
committed during an interrupted queue transition and is retained with complete
raw, event, task, and external-call provenance. No task-listed review is
missing from serving, and no listed review id is duplicated.

## Run and cost ledger

The selected drains are 98, 100, 101, 104, 108, and 109. Runs 98 and 101 were
intentionally halted after deterministic persistence/concurrency faults; their
call ledgers remain included. Runs 100, 104, and 108 are bounded recovery
validations. Run 109 completed the remaining 5,285 tasks.

| Metric | Exact value |
| --- | ---: |
| Google Places calls | 10,698 |
| Successful paid Place Details calls | 5,469 |
| Details 404/error calls | 4 |
| Successful no-charge IDs-only searches | 5,225 |
| Conservative call-ledger spend | $136.725 |
| Reviews budget | $250.000 |
| Budget remaining | $113.275 |

All paid Details successes carry the configured $0.025 unit price; all
IDs-only searches and errored calls carry $0. The implementation uses the
current Places Details Enterprise + Atmosphere SKU (`EB23-5ECC-F753`) and the
IDs-only Text Search field mask. See the official [Google Maps Platform
pricing](https://developers.google.com/maps/billing-and-pricing/pricing) and
[Place Details field documentation](https://developers.google.com/maps/documentation/places/web-service/place-details).

## Persistence and safety reconciliation

| Check | Result |
| --- | ---: |
| Raw source listings | 4,074 |
| Raw source reviews | 17,158 |
| Google review source records | 4,285 |
| Review field-status rows | 4,285 |
| Serving review inserts | 18,043 |
| Serving/event/call shape mismatches | 0 |
| Malformed raw listings | 0 |
| Raw reviews without listing | 0 |
| Source-record/listing mismatches | 0 |
| Non-contiguous raw review ordinals | 0 |
| Result writes without field ledger | 0 |
| Calls or serving reviews on currently ineligible locations | 0 |

`fountain_raw.source_databases` exactly matches the raw listing and review
counts and is marked `complete`.

## Recovery notes

- Run 98 exposed a text/timestamptz parameter collision in the raw listing
  write. Separate typed bindings fixed it; the one-row live smoke (run 100)
  passed.
- Run 101 exposed `SERIALIZABLE` snapshot conflicts under the shared max-id
  allocator. The handler now uses `READ COMMITTED` with per-location locking,
  ledger guards, and a dedicated Google-review listing-id sequence.
- Migration 106 installed the sequence. The post-migration 64-row validation
  (run 108) completed without retry; run 109 then completed the remaining
  backlog with zero retries or task failures.

Detailed immutable run evidence: [run 98](run-98.md), [run 100](run-100.md),
[run 101](run-101.md), [run 104](run-104.md), [run 108](run-108.md), and
[run 109](run-109.md).
