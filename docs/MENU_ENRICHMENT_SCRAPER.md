# Menu Enrichment Scraper

`data_pipeline/scrapers/scrape_menu_enrichment.py` enriches existing `canonical.db` locations with treatment menus, prices, and verified clinic-site contact fields. It writes one shared staging database:

```text
data/databases/menu_enrichment.sqlite
```

`build_canonical.py` auto-discovers this database on the next build and routes it through the `menu_enrichment` branch. QA-passing rows attach back to existing organizations and locations by website/domain plus locality/region, then add structured `offerings` rows. Flagged rows are not written as canonical listings; they go to:

```text
data/exports/menu_enrichment_review_queue.csv
```

## Requirements

Install Python dependencies and provide an OpenRouter API key:

```bash
pip install -r data_pipeline/requirements.txt
export OPENROUTER_API_KEY=...
```

Optional:

```bash
export OPENROUTER_MODEL=z-ai/glm-5.2
```

## Pilot Run

Run a 100-location pilot with a mix of locations that currently have zero and one offering:

```bash
npm run scrape:menu-enrichment -- --reset --pilot --limit 100
npm run build:canonical
```

For a smaller smoke pass:

```bash
npm run scrape:menu-enrichment -- --reset --pilot --limit 5
```

## Full / Resume Runs

The scraper uses stable `source_url` keys in the staging DB, so it can resume without duplicating rows:

```bash
npm run scrape:menu-enrichment -- --limit 500 --offset 0
npm run scrape:menu-enrichment -- --limit 500 --offset 500
```

Use `--no-skip-existing` when you want to refresh already-written staging listings.

## Tables

The database uses the shared staging tables:

- `source_metadata`: run/source metadata.
- `pages`: fetched homepage, pricing, service, treatment, menu, and contact pages.
- `listings`: QA-passing enrichment rows.
- `listing_fields`: provenance fields including fetched URLs, LLM model, token counts, copied worklist priority metadata, and menu counts.
- `images` and `reviews`: available for shared-schema compatibility; usually empty.
- `run_errors`: non-fatal fetch or extraction errors.

## QA Behavior

Tier 1 checks flag rows for review when:

- the LLM did not confirm the pages are the clinic's own site,
- all candidate URLs failed,
- successful pages have suspiciously short visible text,
- extraction returned zero menu items,
- page text has currency symbols but all extracted prices are null,
- repeated treatment names have no variant, dose, or price detail,
- the extracted website is a known directory/marketplace domain.

The build report now prints the offerings-per-location histogram (`0 / 1 / 2-4 / 5+`) so before/after coverage is visible after every canonical rebuild.
