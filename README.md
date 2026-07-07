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

The app reads Neon Postgres when `DATABASE_URL`/`POSTGRES_URL` is configured. On Vercel, Postgres is required. Local development can fall back to the checked-in archival SQLite backup:

```text
canonical.db
```

## Database Operations

Production data lives in Neon Postgres. `canonical.db` is kept in Git as an archival/local fallback only; it is not imported into production and should not be used as the normal data-editing path.

```bash
npm run db:deploy -- --env-file .env.production.local
npm run db:check -- --env-file .env.production.local
```

Schema and data fixes are made with SQL migrations in `data_pipeline/postgres_migrations/`. Direct write workflows should use the Postgres helper functions installed in the `fountain` schema, such as `create_location`, `merge_locations`, `delete_location_cascade`, `replace_location_offerings`, and `attach_location_image`.

The old full refresh/import path from `canonical.db` has been removed on purpose. There is no `db:refresh-postgres` command.

## Archival Canonical Backup

The source-specific scrape databases live locally in `data/databases/` and are ignored by Git. `npm run build:canonical` can still rebuild the archival SQLite database for local inspection/fallback, but production should not be refreshed from it.

The build also writes the treatment curation backlog to `data/exports/unmapped_terms.csv`.

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
