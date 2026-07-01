# Service Search Scraper

`data_pipeline/scrapers/scrape_service_search.py` builds one SQLite database per service/country from web search results. `build_canonical.py` auto-discovers every `*.sqlite` file under `data/databases/`, so these databases are merged into `canonical.db` on the next build — routed through a dedicated quality gate (`is_real_provider_row`) that drops directory/aggregator rows with no usable address, since these are deliberately broad discovery jobs that mix real provider pages with roundup/listicle pages.

Supported services:

- `dexa`: DEXA / DXA scans
- `hbot`: hyperbaric oxygen therapy / HBOT
- `vo2`: VO2 max testing / CPET

Supported countries:

- `us`
- `canada`
- `uk`
- `australia`
- `ireland`

Each service/country pair writes a separate ignored SQLite database in `data/databases/`, for example:

```text
data/databases/hbot_us_providers.sqlite
data/databases/vo2_max_uk_test_providers.sqlite
data/databases/dexa_canada_scan_providers.sqlite
```

## Requested Batch

This runs:

- DEXA for Canada, UK, Australia, Ireland
- HBOT for US, Canada, UK, Australia, Ireland
- VO2 Max Test for US, Canada, UK, Australia, Ireland

```bash
npm run scrape:service-search -- --batch requested --reset --preset smoke --max-provider-pages 30
```

DuckDuckGo HTML may return `403` pages during larger runs. Use Yahoo Search for those passes:

```bash
npm run scrape:service-search -- --batch requested --reset --preset top30 --max-provider-pages 150 --search-provider yahoo
```

## Larger Runs

```bash
npm run scrape:service-search -- --service dexa --country australia,ireland --reset --preset top30 --max-provider-pages 150 --search-provider yahoo
npm run scrape:service-search -- --service hbot --country all --reset --preset top30 --max-provider-pages 150 --search-provider yahoo
npm run scrape:service-search -- --service vo2 --country all --reset --preset top30 --max-provider-pages 150 --search-provider yahoo
```

Use `--max-provider-pages -1` only when you want to fetch every deduped candidate URL for each database.

## Current Top-City Run

The latest run used `--preset top30`, `--max-provider-pages 150`, and Yahoo Search for DEXA, HBOT, and VO2 expansion.

| Database | Queries | Results | Candidates | Pages | Listings | Images | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `dexa_us_scan_providers.sqlite` | 90 | 378 | 220 | 236 | 132 | 436 | 4 |
| `dexa_canada_scan_providers.sqlite` | 60 | 210 | 111 | 170 | 80 | 478 | 1 |
| `dexa_uk_scan_providers.sqlite` | 60 | 140 | 79 | 139 | 67 | 586 | 0 |
| `dexa_australia_scan_providers.sqlite` | 45 | 262 | 170 | 195 | 115 | 1054 | 0 |
| `dexa_ireland_scan_providers.sqlite` | 36 | 210 | 98 | 132 | 52 | 251 | 2 |
| `hbot_us_providers.sqlite` | 90 | 497 | 325 | 238 | 133 | 281 | 2 |
| `hbot_canada_providers.sqlite` | 60 | 274 | 126 | 184 | 102 | 366 | 2 |
| `hbot_uk_providers.sqlite` | 60 | 189 | 81 | 139 | 72 | 596 | 2 |
| `hbot_australia_providers.sqlite` | 45 | 154 | 79 | 124 | 56 | 226 | 0 |
| `hbot_ireland_providers.sqlite` | 36 | 140 | 47 | 83 | 34 | 167 | 0 |
| `vo2_max_us_test_providers.sqlite` | 90 | 280 | 131 | 221 | 115 | 600 | 0 |
| `vo2_max_canada_test_providers.sqlite` | 60 | 196 | 74 | 134 | 63 | 298 | 0 |
| `vo2_max_uk_test_providers.sqlite` | 60 | 196 | 60 | 120 | 52 | 351 | 0 |
| `vo2_max_australia_test_providers.sqlite` | 45 | 126 | 57 | 102 | 39 | 203 | 0 |
| `vo2_max_ireland_test_providers.sqlite` | 36 | 140 | 20 | 56 | 16 | 102 | 0 |

## Tables

The generated databases use the shared staging tables plus search provenance tables:

- `search_queries`: generated search terms by service/country/city.
- `search_results`: ranked web search results.
- `candidate_urls`: deduped URLs from search results.
- `pages`: fetched search pages and candidate pages.
- `listings`: extracted provider candidates.
- `listing_fields`: provenance and classification fields such as `service_slug`, `country_scope`, `service_signals`, `source_kind`, `page_type`, `confidence_score`, and discovery query data.
- `images`: extracted page/schema images.
- `run_errors`: non-fatal fetch/extraction errors.

The data is deliberately broad. `listing_fields.page_type`/`confidence_score` don't cleanly separate real listings from junk on their own (verified empirically); `build_canonical.py`'s gate instead requires a usable `address` or lat/long before a row is written to `canonical.db`, and keeps `confidence_score` as a `trust` tag for manual review rather than as a filter.
