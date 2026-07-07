# Fountain

Fountain is a directory for longevity clinics, practitioners, diagnostics, treatments, and recovery services.

The active app is:

- the Fountain web app in `src/`, built with Next.js
- Neon Postgres as the local and production source of truth
- Vercel Blob for durable listing image bytes

## Run The App

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The app requires `DATABASE_URL` or `POSTGRES_URL` in `.env.local`. It no longer falls back to `canonical.db`.

## Database Operations

Production and local app data live in Neon Postgres.

```bash
npm run db:deploy -- --env-file .env.production.local
npm run db:check -- --env-file .env.production.local
```

Schema and data fixes are made with SQL migrations in `data_pipeline/postgres_migrations/`. Direct write workflows should use the Postgres helper functions installed in the `fountain` schema, such as `create_location`, `merge_locations`, `delete_location_cascade`, `replace_location_offerings`, and `attach_location_image`.

The old full refresh/import path from `canonical.db` has been removed on purpose. There is no `db:refresh-postgres` command.

## Active Scripts

Only the Postgres operations remain in `scripts/`:

- `check-postgres-state.mjs`: validates migrations, runtime invariants, Blob-only image rows, slugs, IDs, search triggers, and stale legacy tooling.
- `run-postgres-migrations.mjs`: applies pending SQL migrations from `data_pipeline/postgres_migrations/`.
- `deploy-postgres.mjs`: runs migrations and then checks the database.

## Local SQLite Archive

Old SQLite artifacts can live under ignored `archive/local-sqlite/` for reference. `canonical.db` is no longer kept at the repo root and is not an app fallback.

## Historical Scrape Tooling

Historical scraper code and source configuration remain under `data_pipeline/`, but they are not part of the active runtime or deploy path.

Generated source databases, exports, and transient downloaded media should stay out of Git. Served listing image files should be uploaded to Vercel Blob; Neon stores Blob URLs and metadata only.

## Important Folders

- `src/app/`: Next.js pages and API route handlers.
- `src/components/`: React UI components.
- `src/lib/`: server-side Postgres access and query helpers.
- `scripts/`: Postgres migration, deployment, and invariant checks.
- `data_pipeline/postgres_migrations/`: immutable SQL migrations.
- `data_pipeline/`: historical scraping and canonical build tooling.
- `archive/`: ignored local archive for old database artifacts.
- `docs/`: project and data documentation.
