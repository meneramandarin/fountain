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
npm run db:check -- --env-file .env.production.local
```

Direct write workflows should use the Postgres helper functions installed in the `fountain` schema, such as `create_location`, `merge_locations`, `delete_location_cascade`, `replace_location_offerings`, and `attach_location_image`.

The old full refresh/import path from `canonical.db` has been removed on purpose. There is no `db:refresh-postgres` command.

## Active Scripts

Only the live Postgres invariant check remains in `scripts/`:

- `check-postgres-state.mjs`: validates runtime invariants, Blob-only image rows, slugs, IDs, search triggers, helper functions, and stale legacy tooling.

## Local SQLite Archive

Old SQLite artifacts can live under ignored `archive/local-sqlite/` for reference. `canonical.db` is no longer kept at the repo root and is not an app fallback.

## Important Folders

- `src/app/`: Next.js pages and API route handlers.
- `src/components/`: React UI components.
- `src/lib/`: server-side Postgres access and query helpers.
- `scripts/`: Postgres invariant checks.
- `archive/`: ignored local archive for old database artifacts.
- `docs/`: project and data documentation.
