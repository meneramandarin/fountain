# Enrichment Menu + Price Census

Census version: 1. Population: active, non-deleted locations with no linked source listing in the suppression ledger.

The conservative price cohort contains locations with one or more active offerings and zero active offerings with a non-null price amount. Partially priced locations are intentionally excluded.

Actionable means a website is present. Attempted-unresolved rows remain visible but are not enqueued again in the same campaign.

| Gap kind | Raw | Actionable | Attempted unresolved | Blocked | Queue action | Candidate digest |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| menu_missing | 2,211 | 2,172 | 2,172 | 39 | adopt 2,172 pending tasks | 8f6e98de6ddd9b1ed58c52acd8a00444dda49ee1479dd0fcc1cee3b34bed701f |
| prices_missing | 3,465 | 3,353 | 0 | 112 | insert 3,353 tasks | 46949e591f94f74bb998c09b0a3c3a8dc8d42594196ee8e96e37c189c096221c |

Campaign: enrichment_census_v1. Prompt: menu-extract-v1. Snapshot: 2767f2c5b62e1ba8401dc7e4fb76b24fd991484480c8eb25fd0e9469f64c550a.

Combined exact task population: 5,525 (b595a402fc764a44c8965f5b09aea1a4d8221824b0954924bbdf583cf294bf5f). Reconciliation: 2,172 adopted; 3,353 inserted.

Apply uses one advisory-lock-guarded statement and fails closed on live cohort drift, overlap, queue or payload conflicts, historical price attempts, or adoption/insertion count mismatches. Adopted tasks retain their original run IDs and original census evidence while receiving menu-price scope metadata.
