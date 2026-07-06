# Postgres Migration

The app reads from Neon Postgres when `DATABASE_URL` or `POSTGRES_URL` is present, and falls back to `canonical.db` for local environments without those variables. This migration keeps growing production data out of Git while preserving the SQLite fallback for development and emergency rollback.

## Provision Neon

Preferred path:

```bash
vercel integration add neon
vercel env pull .env.local --yes
```

If the CLI opens the Vercel dashboard, accept the Neon Marketplace terms and link the resource to this project. Neon provisioning can take 1-3 minutes before connection strings work.

## Import Canonical Data

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
- keeps the previous live schema as `fountain_previous`
- sets the current role/database default `search_path` to `fountain, public` as a best-effort convenience

To test without promotion:

```bash
npm run db:import-postgres -- --no-promote
```

## Runtime Cutover

The runtime query layer is async and supports both backends:

- Postgres: used when `DATABASE_URL` or `POSTGRES_URL` exists.
- SQLite: used when no Postgres URL exists.

The Neon pooled connection path does not accept `search_path` as a startup option, so the Postgres adapter wraps each read in a short transaction with `SET LOCAL search_path TO fountain, public`. Set `POSTGRES_SCHEMA` only when you intentionally need a different serving schema.

Once runtime reads from Postgres, Git should keep code, schema, import scripts, and small fixtures only. Production data should live in Neon, and images should stay in Vercel Blob.
