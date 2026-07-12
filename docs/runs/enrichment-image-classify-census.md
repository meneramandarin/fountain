# Enrichment Image Classification Enqueue

Census version: 1. Population: active, non-deleted locations with no linked source listing in the suppression ledger.

This post-harvest stage selects locations with at least one active image whose image_kind is null.

| Snapshot | Eligible locations | Candidate locations | Unclassified images | Candidate digest |
| --- | ---: | ---: | ---: | --- |
| image_classify_enrichment | 7,178 | 66 | 379 | 70adfe05e9bc129015c73ad7dddc3a84d9ec8b4c5e46570c16fff8bb3631a567 |

Campaign: enrichment_image_classify_v1. Reconciliation: 66 inserted.

Apply is guarded by an exact live snapshot/candidate match, zero pending or claimed image_classify conflicts, and explicit handler readiness.
