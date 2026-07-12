# Archive

This directory holds completed campaign material that is no longer part of the
active Fountain runtime.

- scripts-legacy/ contains one-off campaign scripts. Git history preserves their
  pre-move locations and evolution. They are retained as source snapshots, not as
  supported commands; relative imports were intentionally not rewritten.
- reports/ contains the root-level JSON reports and checkpoints produced by those
  campaigns.
- db-dumps/fountain_raw_archive_20260711/ contains the committed manifest for the
  Phase 3 raw-table archive. The custom-format .dump payloads and operational
  metadata stay local and are ignored by Git.

The live application continues to use Neon Postgres only. Legacy SQLite databases
and sidecars remain ignored here.

## Database dump custody

MANIFEST.md records the source row counts, dump sizes, SHA-256 hashes, owned
sequences, TOC verification, and scratch-restore results. Keep the entire local dump
directory together when making a backup.

The repository copy is not an off-machine backup because dump payloads are ignored.
Copy archive/db-dumps/fountain_raw_archive_20260711/ to an encrypted external drive
or private cloud storage after this phase. No upload is performed by the pipeline or
by this cleanup.

To restore a table later, use the matching PostgreSQL major-version pg_restore
client and the per-table file named in the manifest. Restore into a scratch database
or remapped scratch schema first, verify the manifest row count, and only then plan
any production recovery.

## Intentionally retained outside the archive

The conservative Gate A approval left these active because review work remains:

- scripts/ingest-image-review-decisions.mjs
- image-review-decisions-20260708.json
- swarm-browser-output/

Their eventual archive move requires a fresh closure/migration decision.
