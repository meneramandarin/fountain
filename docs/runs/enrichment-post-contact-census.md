# Enrichment Post-Contact Refresh

Census version: 1. Population: active, non-deleted locations with no linked source listing in the suppression ledger.

This stage adds only downstream work newly unlocked by contact_fill. A task already represented anywhere in the same census campaign is excluded, regardless of queue status.

| Task | Newly unlocked locations | Candidate digest |
| --- | ---: | --- |
| geocode | 0 | 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945 |
| image_harvest | 38 | 0cb86a7a7ac23bdb11a60d396b8b31966d66a0b29cbd2973eed21dd9b9afa61b |
| menu_extract | 7 | 4907378af6a43c66f414b083b874aa600ce804852c469d7af11365c20bef23c2 |

Campaign: enrichment_census_v1. Exact planned insertions: 45. Reconciliation: 45 inserted.

Apply is guarded by an exact live candidate match, zero pending or claimed conflicts from other campaigns, and explicit downstream handler readiness.
