# Postgres Migration

The app reads from Neon Postgres when `DATABASE_URL` or `POSTGRES_URL` is present, and falls back to `canonical.db` only for local environments without those variables. Vercel deployments fail fast if Postgres is not configured, so production cannot silently serve stale SQLite data. This migration keeps growing production data out of Git while preserving the SQLite fallback for development and emergency rollback.

## Provision Neon

Preferred path:

```bash
vercel integration add neon
vercel env pull .env.local --yes
```

If the CLI opens the Vercel dashboard, accept the Neon Marketplace terms and link the resource to this project. Neon provisioning can take 1-3 minutes before connection strings work.

## Phase 5 Deployment

The default production path is now migration-first:

```bash
npm run db:deploy -- --env-file .env.production.local
```

`db:deploy` applies pending Postgres migrations and runs `db:check`. It does not rebuild `canonical.db`, does not import the full serving schema, and does not touch raw source staging. Use this for small DB structure changes.

For a full data refresh from the SQLite backup bridge:

```bash
npm run db:refresh-postgres -- --env-file .env.production.local
```

That command applies migrations, imports `canonical.db`, reapplies idempotent migrations after schema promotion, refills raw source staging, and runs `db:check`.

Migrations are tracked in `public.fountain_schema_migrations`. Serving-schema migrations should be written idempotently because a full canonical import swaps the `fountain` schema; `db:refresh-postgres` reruns applied migrations with `--reapply-applied` after promotion so direct schema changes are restored.

The current durable schemas are:

- `fountain`: production serving schema. Schema changes are made through migrations; full imports are explicit data refreshes.
- `fountain_raw`: durable source-level staging tables synced from `data/databases/*.sqlite`.

## Direct Migration Commands

Run only pending migrations:

```bash
npm run db:migrate -- --env-file .env.production.local
```

Reapply already-recorded idempotent migrations after a manual schema swap:

```bash
npm run db:migrate -- --env-file .env.production.local --reapply-applied
```

Check production DB invariants:

```bash
npm run db:check -- --env-file .env.production.local
```

`db:check` verifies:

- all migration files are applied with matching checksums.
- `fountain.images` exists and satisfies the Blob-only image contract.
- the removed `fountain_assets` registry is absent.
- `fountain_raw` exists.
- no transient `fountain_import_*` or `fountain_previous` schemas remain.

## Canonical Import Bridge

After `.env.local` contains `DATABASE_URL` or `POSTGRES_URL`:

```bash
npm run db:import-postgres
```

If `vercel env pull` writes `DATABASE_URL=""`, open the Neon resource from Vercel Marketplace and use the pooled Neon connection string in a local-only env file:

```bash
npm run db:import-postgres -- --env-file .env.production.local
```

The env file must contain a non-empty `DATABASE_URL` or `POSTGRES_URL`. Do not commit it.

The importer:

- reads `canonical.db`
- creates a staging schema named `fountain_import_<timestamp>`
- imports all canonical tables
- validates Postgres row counts against SQLite
- promotes the staging schema to `fountain`
- keeps the previous live schema as `fountain_previous` unless `--drop-previous-after-promote` is passed
- sets the current role/database default `search_path` to `fountain, public` as a best-effort convenience

On the 512 MB Neon plan, avoid carrying two serving schemas plus raw staging at the same time. Prefer the wrapper:

```bash
npm run db:refresh-postgres -- --env-file .env.production.local
```

Under the hood, this uses `--truncate-raw-before-import` and `--drop-previous-after-promote`, then refills raw staging. `--truncate-raw-before-import` preserves the `fountain_raw` schema but empties its tables before the bridge import.

To test without promotion:

```bash
npm run db:import-postgres -- --no-promote
```

## Sync Raw Source Data

Sync raw source SQLite databases incrementally:

```bash
npm run db:sync-raw-sources -- --env-file .env.production.local --all --chunk-size 1000
```

The raw sync checks source DB file size and mtime, so unchanged sources are skipped on later runs. Pass `--force` when you intentionally want to reload every source.

## Image Contract

Production canonical images must be Blob-backed:

- `fountain.images.blob_url` must be non-empty.
- `fountain.images.local_path` must be empty.
- image bytes are stored in Vercel Blob, not Neon.
- Neon stores only URL strings/hashes required to associate a Blob object with a clinic/practitioner/source row.
- local files under `data/media/` are transient processing artifacts only and should not be retained.
- source image candidates live as remote URLs in source SQLite databases and `fountain_raw.source_images`.

This is enforced in Postgres by the `images_blob_backed` constraint and checked by `npm run db:check`.

Normal canonical builds enforce that contract. If you need to stage new image candidates for upload through the existing canonical-based upload scripts, use an ingestion build, upload, export the Blob cache, then rebuild normally:

```bash
npm run build:canonical -- --keep-unblobbed-images
npm run upload:blob-images -- --env-file .env.production.local
npm run upload:remote-blob-images -- --env-file .env.production.local --limit 100000
npm run export:blob-images
npm run build:canonical
```

BioEdge source profile images are intentionally no longer copied into canonical or collected by the scraper. Provider-site images that already have Blob URLs can remain.

Generic scrapes do not download local images by default. Use `npm run scrape -- --source SOURCE_SLUG --download-images` only for deliberate transient local processing.

## Runtime Cutover

The runtime query layer is async and supports both backends:

- Postgres: used when `DATABASE_URL` or `POSTGRES_URL` exists.
- SQLite: used only outside Vercel when no Postgres URL exists.

The Neon pooled connection path does not accept `search_path` as a startup option, so the Postgres adapter wraps each read in a short transaction with `SET LOCAL search_path TO fountain, public`. Set `POSTGRES_SCHEMA` only when you intentionally need a different serving schema.

Git still keeps `canonical.db` as a local backup/fallback. Production rows live in Neon, and served image files live in Vercel Blob.
