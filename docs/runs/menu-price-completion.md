# Menu and Price Enrichment Completion

Completed at `2026-07-12T09:04:07Z`.

## Outcome

- Canonical cohort: **5,525 / 5,525 distinct locations completed**.
  - **2,172** website-backed locations with no active offerings.
  - **3,353** website-backed locations with active offerings but no priced offering.
- Main drain run 91: 5,521 done, 4 token-cap failures, $3.07928085.
- Residual drain run 96: all 4 recovered, zero terminal failures, $0.01469940.
- Total menu-stage OpenRouter spend: **$3.09398025**.
- Successful menu model calls: **4,739**; zero successful calls with missing token usage.
- Task-to-external-call pointer mismatches: **0**.

## Atomic cohort evidence

Supplemental census run 90 preserved the committed run-69/run-73 evidence while atomically adopting the 2,172 existing `menu_missing` tasks and inserting 3,353 disjoint `prices_missing` tasks.

| Check | Result |
| --- | ---: |
| Existing tasks adopted | 2,172 / 2,172 |
| Incremental tasks inserted | 3,353 / 3,353 |
| Live menu cohort drift | 0 |
| Live price cohort drift | 0 |
| Cohort overlap | 0 |
| Active queue conflicts | 0 |
| Payload conflicts | 0 |
| Historical price-attempt conflicts | 0 |

Candidate digests:

- `menu_missing`: `8f6e98de6ddd9b1ed58c52acd8a00444dda49ee1479dd0fcc1cee3b34bed701f`
- `prices_missing`: `46949e591f94f74bb998c09b0a3c3a8dc8d42594196ee8e96e37c189c096221c`
- Combined: `b595a402fc764a44c8965f5b09aea1a4d8221824b0954924bbdf583cf294bf5f`

## Serving changes

| Change | Run 91 | Run 96 | Total |
| --- | ---: | ---: | ---: |
| Offering inserts | 5,998 | 82 | **6,080** |
| Full price-pair backfills | 34 | 0 | **34** |
| Amount-only backfills, matching currency preserved | 2 | 0 | **2** |
| Treatment mappings backfilled | 1 | 0 | **1** |
| Existing prices overwritten | 0 | 0 | **0** |
| Price conflict rows | 0 | 0 | **0** |
| Price ambiguity review items | 411 | 25 | **436** |

All 6,117 serving mutations have exact run-stamped change events. Price field reconciliation is exact: 36 `price_amount` field-ledger rows equal all price writes; 34 `price_currency` rows equal the full-pair writes; two amount-only writes preserved the pre-existing matching currency. The single treatment write has one matching treatment event and field row.

## Coverage change

| Metric | Before supplemental census | After drains | Delta |
| --- | ---: | ---: | ---: |
| Locations with an active offering | 4,967 | 6,050 | +1,083 |
| Locations with a priced offering | 1,502 | 1,967 | +465 |
| Active offerings | 58,782 | 64,862 | +6,080 |
| Priced active offerings | 11,789 | 13,335 | +1,546 |
| Locations with no active offering | 2,211 | 1,128 | -1,083 |
| Locations with offerings but no price | 3,465 | 4,083 | +618 |

The raw zero-price location count rises because 1,083 previously empty menus now contain evidence-backed offerings, many on websites that publish no literal price. These locations are retained as attempted-but-unresolved evidence and are not perpetually re-enqueued under the same campaign/prompt version.

## Residual remediation

Four run-91 responses stopped exactly at the old 2,400-token output cap. Runs 93 and 94 are zero-write failed guard records from two conservative retry-enqueue preflights; both rolled back before inserting any task. Run 95 then locked and verified the four source tasks against their external-call ledgers (three successful 2,400-token calls per row) and inserted exactly four provenance-linked retry tasks.

The handler now escalates output allowance by queue attempt: 2,400, 4,800, then a 9,600-token cap. Run 96 completed three rows at attempt 2; one response hit 4,800 exactly and completed at attempt 3. Strict JSON parsing and verbatim-evidence validation were unchanged.

Historical failed task rows remain immutable audit evidence; the retry tasks point back to the original task and run IDs.
