# US DEXA Scraper

The DEXA scraper writes into its own standalone SQLite database, but `build_canonical.py` auto-discovers every `*.sqlite` file in `data/databases/`, so rows from this database *are* merged into `canonical.db` on the next build. They're routed through a dedicated quality gate (`is_real_provider_row` in `build_canonical.py`) that drops directory/aggregator rows with no usable address before anything is written to the canonical `locations` table.

```text
data/databases/dexa_us_scan_providers.sqlite
```

That file is ignored by Git, like the other per-source scrape databases.

## Run A Smoke Scrape

```bash
npm run scrape:dexa-us -- --reset --preset smoke --max-provider-pages 50
```

The smoke preset searches the first few major US cities and crawls a limited set of Dexascans.com provider pages.

## Larger Runs

```bash
npm run scrape:dexa-us -- --reset --preset top30 --max-provider-pages 300
npm run scrape:dexa-us -- --reset --preset top100 --include-state-queries --max-provider-pages 1000
npm run scrape:dexa-us -- --reset --preset full --include-state-queries --max-provider-pages -1
```

The scraper uses DuckDuckGo HTML result pages plus a Dexascans.com crawl. It stores search queries, search results, fetched pages, extracted provider candidates, images, and run errors in the same SQLite file.

## Tables

- `source_metadata`: run/source metadata.
- `search_queries`: each generated search query.
- `search_results`: ranked result URLs, titles, and snippets.
- `candidate_urls`: deduped URLs discovered through search or crawling.
- `pages`: fetched raw HTML/search pages.
- `listings`: extracted DEXA provider candidates.
- `listing_fields`: provenance fields such as `source_kind`, `page_type`, `dexa_signals`, `confidence_score`, and discovery query metadata.
- `images`: extracted page or schema images.
- `reviews`: available for compatibility with the shared staging schema; usually empty for this scraper.
- `run_errors`: non-fatal fetch/extraction errors.

This database is deliberately broad. Some rows will be provider pages, and some will be directory or aggregator pages that mention DEXA. Use `listing_fields.page_type` and `listing_fields.confidence_score` when filtering later.
