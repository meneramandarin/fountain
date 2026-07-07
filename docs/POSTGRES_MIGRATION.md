# Postgres Operations

Neon Postgres is the production source of truth. `canonical.db` remains in Git as an archival/local fallback only; production is no longer rebuilt or refreshed from it.

The app reads from Neon when `DATABASE_URL` or `POSTGRES_URL` is present. Vercel deployments fail fast if Postgres is missing, so production cannot silently serve stale SQLite data.

## Production Deploy

Use the migration-only path:

```bash
npm run db:deploy -- --env-file .env.production.local
```

`db:deploy` applies pending SQL migrations from `data_pipeline/postgres_migrations/` and then runs `db:check`. It does not rebuild `canonical.db`, does not import a full serving schema, and does not touch raw source staging.

The old full-refresh bridge has been removed on purpose:

- no `db:refresh-postgres` script
- no `db:import-postgres` script
- no `scripts/import-canonical-to-postgres.mjs`

If production data must change, write a targeted migration or use the installed Postgres mutation helpers.

## Direct Commands

Run only pending migrations:

```bash
npm run db:migrate -- --env-file .env.production.local
```

Check production invariants:

```bash
npm run db:check -- --env-file .env.production.local
```

`db:check` verifies:

- all migration files are applied with matching checksums.
- the legacy canonical import/refresh tooling is not exposed.
- `fountain.images` satisfies the Blob-only image contract.
- the removed `fountain_assets` registry is absent.
- `fountain_raw` exists.
- no transient `fountain_import_*` or `fountain_previous` schemas remain.
- core integer IDs have Postgres identity/default generation for direct inserts.
- public IDs exist for organizations, locations, and practitioners.
- public listing slugs exist for locations and practitioners.
- lifecycle/audit/self-listing support tables exist.
- search maintenance functions/triggers exist and search rows are not stale.
- known polymorphic references are not orphaned.

## Durable Schemas

- `fountain`: production serving schema and direct write target.
- `fountain_raw`: durable source-level staging tables synced from `data/databases/*.sqlite`.

Migrations are tracked in `public.fountain_schema_migrations`. Migration files are immutable after application; changing an applied file causes a checksum failure.

## Direct Write Helpers

The hardening migration installs database-side helpers for common admin operations:

```sql
SELECT fountain.create_location($json_payload);
SELECT fountain.merge_locations($keep_location_id, $delete_location_id, $actor_id, $reason);
SELECT fountain.delete_location_cascade($location_id, $actor_id, $reason);
SELECT fountain.replace_location_offerings($location_id, $offerings_json, $actor_id);
SELECT fountain.attach_location_image($location_id, $blob_url, $image_url, $alt, $source_id, $actor_id);
```

Use these instead of ad hoc multi-table deletes/updates. They keep related rows, audit events, and search rows consistent.

Core tables now have database-generated IDs for new rows. Organizations, locations, and practitioners also have stable `public_id` UUIDs for future public/admin APIs.

Locations and practitioners also have durable `slug` fields for public detail URLs. Slugs are generated in Postgres, uniqueness is enforced in Postgres, and route handlers still accept numeric IDs only as a fallback/redirect path.

## Search

Search stays in Postgres. The serving table `fountain.search_index` uses a generated `tsvector` column plus a GIN index for full-text search. Database triggers refresh the relevant search row when locations, practitioners, documents, offerings, affiliations, entity tags, or treatments change.

This is the least moving-parts option at the current scale: no external search cluster, no rebuild step, and no stale manual search table after direct edits. If search later outgrows Postgres, the trigger-maintained search table becomes the clean source for streaming to a dedicated search system.

## Sync Raw Source Data

Sync raw source SQLite databases incrementally:

```bash
npm run db:sync-raw-sources -- --env-file .env.production.local --all --chunk-size 1000
```

The raw sync checks source DB file size and mtime, so unchanged sources are skipped on later runs. Pass `--force` only when intentionally reloading every source.

Raw staging is not the serving source of truth. Ingestion into `fountain` should be incremental upserts/merge reviews, not a wholesale production rebuild.

## Image Contract

Production images are Blob-backed:

- `fountain.images.blob_url` must be non-empty.
- `fountain.images.local_path` must be empty.
- image bytes are stored in Vercel Blob, not Neon.
- Neon stores only URL strings/hashes required to associate a Blob object with a clinic/practitioner/source row.
- local files under `data/media/` are transient processing artifacts only.
- source image candidates can exist as remote URLs in source SQLite databases and `fountain_raw.source_images`.

This is enforced in Postgres by the `images_blob_backed` constraint and checked by `npm run db:check`.

## Runtime

The runtime query layer supports both backends:

- Postgres: used when `DATABASE_URL` or `POSTGRES_URL` exists.
- SQLite: used only outside Vercel when no Postgres URL exists.

The Neon pooled connection path does not accept `search_path` as a startup option, so the Postgres adapter wraps reads in a short transaction with `SET LOCAL search_path TO fountain, public`. Set `POSTGRES_SCHEMA` only when intentionally targeting a different serving schema.
