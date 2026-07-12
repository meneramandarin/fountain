# Enrichment Image Classification Enqueue

Census version: 1. Population: active, non-deleted locations with no linked source listing in the suppression ledger.

This post-harvest stage selects locations with at least one active image whose image_kind is null.

| Snapshot | Eligible locations | Candidate locations | Unclassified images | Candidate digest |
| --- | ---: | ---: | ---: | --- |
| image_classify_enrichment | 7,178 | 6,632 | 12,984 | 27ff810fa9ed7f2a377397c73ac5ccc0e2df6ef142c020a972713a1a5d1dc64d |

Campaign: enrichment_image_classify_v1. Reconciliation: 6,632 inserted.

Apply is guarded by an exact live snapshot/candidate match, zero pending or claimed image_classify conflicts, and explicit handler readiness.
