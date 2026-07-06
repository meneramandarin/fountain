# Fountain Project Structure

Fountain now has a split between the web application and the data/scraping pipeline.

## Web App

- `src/app/`: Next.js App Router pages and route handlers.
- `src/components/`: React UI components.
- `src/lib/`: server-side database access and query helpers.
- `public/`: static web assets for landing pages and treatment/domain imagery.
- `public/docs/canonical_db_overview.html`: static visual explanation of `canonical.db`.
- `public/docs/schema_diagram.html`: older schema diagram reference.

Run locally:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Canonical Data

- `canonical.db`: merged SQLite database kept as a local app fallback and emergency backup.
- `data_pipeline/schema.sql`: canonical SQLite schema.
- `data_pipeline/taxonomy_seed.json`: treatment taxonomy and alias seed.
- `data/exports/unmapped_terms.csv`: review queue for scraped service terms that did not map to canonical treatments.
- `data_pipeline/build_canonical.py`: rebuilds `canonical.db` from source-specific SQLite databases.

Rebuild:

```bash
python data_pipeline/build_canonical.py
```

The same command is available through npm:

```bash
npm run build:canonical
```

Normal builds prune final image rows to Blob-backed records and clear local image paths. Use `npm run build:canonical -- --keep-unblobbed-images` only when deliberately staging image candidates for the upload scripts.

## Postgres And Blob Storage

- `data_pipeline/postgres_migrations/`: durable Neon/Postgres migrations.
- `scripts/run-postgres-migrations.mjs`: applies tracked SQL migrations.
- `scripts/deploy-postgres.mjs`: Phase 5 wrapper for migration-only deploys and explicit canonical data refreshes.
- `scripts/check-postgres-state.mjs`: verifies migration state, Blob-only image invariants, and transient schema cleanup.
- `scripts/import-canonical-to-postgres.mjs`: bridge importer from `canonical.db` to the swappable `fountain` schema.
- `scripts/sync-source-sqlite-to-postgres.mjs`: syncs source SQLite DBs into durable `fountain_raw` staging tables.

See `docs/POSTGRES_MIGRATION.md` for the current production workflow.

## Scraping Pipeline

- `data_pipeline/requirements.txt`: Python dependencies for scraping and canonical rebuilds.
- `data_pipeline/scrapers/`: source configs, fetch/extract/storage helpers, scraping entrypoints, exports, and image download helpers.
- `python -m data_pipeline.scrapers.scrape`: scrape one or more configured sources into separate local databases. Does not download local images unless `--download-images` is passed.
- `python -m data_pipeline.scrapers.scrape_dexa_us`: build the isolated US DEXA scan provider database.
- `python -m data_pipeline.scrapers.scrape_service_search`: build isolated service/country databases for DEXA, HBOT, and VO2 Max searches. Supports DuckDuckGo HTML and Yahoo Search via `--search-provider`.
- `python -m data_pipeline.scrapers.export_tables`: export per-source SQLite tables to CSV/JSONL.
- `data/databases/`: local per-source scrape databases. Ignored by Git.
- `data/media/`: transient local image-processing output. Ignored by Git; served listing images should live in Vercel Blob.
- `data/exports/`: generated scrape exports. Everything is ignored by Git except `data/exports/unmapped_terms.csv`.

## Project Name

The package is now named `fountain`. The GitHub repository is already `meneramandarin/fountain`.
