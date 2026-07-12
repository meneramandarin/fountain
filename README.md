# Fountain

Fountain is a directory for longevity clinics, practitioners, diagnostics,
treatments, and recovery services.

The active app is:

- the Fountain web app in src/, built with Next.js
- Neon Postgres as the local and production source of truth
- Vercel Blob for durable listing image bytes

## Run the app

~~~bash
npm install
npm run dev
~~~

Open http://localhost:3000.

The app requires DATABASE_URL or POSTGRES_URL in .env.local. It no longer falls
back to canonical.db.

## Database and pipeline operations

Production and local app data live in Neon Postgres. The standing operational
entrypoint is pipeline/cli.mjs; persistent side effects require --apply.

~~~bash
# Validate a migration without applying it.
node pipeline/cli.mjs migrate --file migrations/20260711_fountain_ops.sql

# Preview the current city index.
npm run city-index:refresh

# Apply a city-index refresh explicitly.
npm run city-index:refresh -- --apply

# Regenerate the live structure document explicitly.
node pipeline/cli.mjs maintain regen-structure-doc --apply
~~~

Direct write workflows should use the Postgres helper functions installed in the
fountain schema, such as create_location, merge_locations,
delete_location_cascade, replace_location_offerings, and attach_location_image.

The old full refresh/import path from canonical.db has been removed on purpose.
There is no db:refresh-postgres command.

## Active scripts

scripts/ contains only the temporarily retained image-review ingester and its
shared environment helper:

- scripts/ingest-image-review-decisions.mjs
- scripts/lib/pipeline-env.mjs

The completed one-off campaign scripts live under archive/scripts-legacy/ as
historical source snapshots. They are not supported runtime commands.

## Local archive

Old SQLite artifacts can live under ignored archive/local-sqlite/ for reference.
Custom Phase 3 Postgres dump payloads are also local-only; their committed manifest
lives under archive/db-dumps/.

## Important folders

- src/app/: Next.js pages and API route handlers.
- src/components/: React UI components.
- src/lib/: server-side Postgres access and query helpers.
- pipeline/: standing queue, ledger, maintenance, migration, and reporting CLI.
- scripts/: temporarily retained review tooling and the shared environment helper.
- archive/: committed campaign scripts/reports plus local-only database dump data.
- docs/: project, run, and data documentation.
