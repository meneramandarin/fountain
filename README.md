# Fountain

Fountain is a high-end yellow pages for longevity clinics, practitioners, diagnostics, treatments, and recovery services.

The repo is split into two clean parts:

- the Fountain web app in `src/`, built with Next.js
- the scraping and canonical database pipeline in `data_pipeline/`

## Run The App

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The app reads Neon Postgres when `DATABASE_URL`/`POSTGRES_URL` is configured, and falls back to the checked-in root database for local backup/dev use:

```text
canonical.db
```

## Rebuild The Canonical Database

The source-specific scrape databases live locally in `data/databases/` and are ignored by Git. The merged `canonical.db` is the database that ships with the app.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r data_pipeline/requirements.txt
npm run build:canonical
```

The build also writes the treatment curation backlog to:

```text
data/exports/unmapped_terms.csv
```

Normal builds keep canonical image rows Blob-backed. For a one-off image ingestion queue, use `npm run build:canonical -- --keep-unblobbed-images`, upload to Vercel Blob, export `data/databases/blob_images.sqlite`, then rebuild normally.

## Sync Postgres

```bash
npm run db:deploy -- --env-file .env.production.local
npm run db:refresh-postgres -- --env-file .env.production.local
```

Use `db:deploy` for normal schema-only production changes. Use `db:refresh-postgres` only when intentionally refreshing production data from `canonical.db`. See `docs/POSTGRES_MIGRATION.md` for the full workflow and Neon size-cap notes.

## Scrape Sources

Scraper code and source configuration are under `data_pipeline/scrapers/`.

```bash
npm run scrape -- --source SOURCE_SLUG
npm run scrape -- --source SOURCE_SLUG --download-images
npm run scrape:dexa-us -- --reset --preset smoke
npm run scrape:service-search -- --batch requested --reset --preset smoke
npm run scrape:service-search -- --service hbot --country all --reset --preset top30 --search-provider yahoo
npm run export:scrapes
python -m data_pipeline.scrapers.download_images --source SOURCE_SLUG
```

Per-source SQLite databases, exports, and transient downloaded media are generated under `data/` and are intentionally not committed, except for `data/exports/unmapped_terms.csv`. Generic scrapes keep remote image URLs only by default; `--download-images` is opt-in for transient processing. Served listing image files should be uploaded to Vercel Blob, not kept in Neon or under `data/media/`.

## Important Folders

- `src/app/`: Next.js pages and API route handlers.
- `src/components/`: React UI components.
- `src/lib/`: server-side SQLite access and query helpers.
- `public/`: landing page and static documentation assets.
- `public/docs/`: visual schema/database overviews.
- `data_pipeline/`: Python scraping and canonical build pipeline.
- `data/databases/`: ignored per-source scrape databases.
- `data/media/`: ignored transient image-processing output; do not use as durable image storage.
- `docs/`: project and data documentation.

## Data Docs

- `docs/PROJECT_STRUCTURE.md`
- `docs/DATA_DICTIONARY.md`
- `docs/DEXA_US_SCRAPER.md`
- `docs/SERVICE_SEARCH_SCRAPER.md`
- `/docs/canonical_db_overview.html` when the app is running
- `/docs/schema_diagram.html` when the app is running
