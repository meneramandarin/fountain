# Postgres Operations

Neon Postgres is the source of truth for production and local app runtime. The app no longer falls back to `canonical.db` in any environment.

The app requires `DATABASE_URL` or `POSTGRES_URL`. Local development uses Neon through `.env.local`; Vercel uses the same Postgres-backed runtime path. Missing Postgres configuration is a hard error.

## Production Checks

Use the live database check:

```bash
npm run db:check -- --env-file .env.production.local
```

`db:check` inspects the live Neon database. It does not rebuild `canonical.db`, does not import a full serving schema, and does not touch raw source staging.

The old full-refresh bridge has been removed on purpose:

- no local `canonical.db` runtime fallback
- no `build:canonical` npm script
- no `db:refresh-postgres` script
- no `db:import-postgres` script
- no `db:migrate` script
- no `db:deploy` script
- no `db:sync-raw-sources` npm script
- no `scripts/import-canonical-to-postgres.mjs`

If production data must change, use the installed Postgres mutation helpers or direct SQL against Neon.

## Direct Commands

Check production invariants:

```bash
npm run db:check -- --env-file .env.production.local
```

`db:check` verifies:

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
- `fountain_raw`: legacy/raw source-level staging tables retained for provenance and inspection. It is not an active serving path.

Historical migration files are no longer part of the active repo workflow. Neon is the source of truth, and `db:check` validates the live schema/data invariants the app depends on.

## Direct Write Helpers

The database has helper functions for common admin operations:

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

Search stays in Postgres. The serving table `fountain.search_index` uses a generated `tsvector` column plus a GIN index for full-text search. Database triggers refresh the relevant search row when locations, practitioners, offerings, affiliations, entity tags, or treatments change.

This is the least moving-parts option at the current scale: no external search cluster, no rebuild step, and no stale manual search table after direct edits. If search later outgrows Postgres, the trigger-maintained search table becomes the clean source for streaming to a dedicated search system.

## Image Contract

Production images are Blob-backed:

- `fountain.images.blob_url` must be non-empty.
- `fountain.images.blob_url` is required; the legacy `local_path` column has been removed.
- image bytes are stored in Vercel Blob, not Neon.
- Neon stores only URL strings/hashes required to associate a Blob object with a clinic/practitioner/source row.
- local files under `data/media/` are transient processing artifacts only.
- source image candidates can exist as remote URLs in `fountain_raw.source_images`.

This is enforced in Postgres by the `images_blob_backed` constraint and checked by `npm run db:check`.

## Runtime

The runtime query layer is Postgres-only. `canonical.db` can live under `archive/` as a local ignored artifact, but the app does not read it.

The Neon pooled connection path does not accept `search_path` as a startup option, so the Postgres adapter wraps reads in a short transaction with `SET LOCAL search_path TO fountain, public`. Set `POSTGRES_SCHEMA` only when intentionally targeting a different serving schema.
