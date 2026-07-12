# File Structure

Snapshot: 2026-07-11 (post Phase 3 + Pass 1 Gate A)

This is the active repository structure after the conservative Phase 3 cleanup.
Git records the legacy moves. The retained review assets remain active until a
separate closure or migration decision.

Omitted from the listings below:

- Dependency, build, tool, and secret state: .git/, node_modules/, .next/,
  .venv/, .vercel/, .cache/, .env files, and tsconfig.tsbuildinfo.
- The 106 local custom-format files under
  archive/db-dumps/fountain_raw_archive_20260711/ and the 28 Pass 1 Step 0
  payloads under fountain_raw_archive_20260711_pass1_step0/. Their committed
  MANIFEST.md files record every payload.
- The 84 worker JSONL files under swarm-browser-output/results/. The entire swarm
  directory remains at the repository root as a Gate A hold.
- Individual files in the unchanged public/ and most historical docs/ trees.

## Top-level layout

~~~text
fountain/
|-- archive/                 committed legacy scripts/reports + local DB dumps
|-- docs/                    project, run, and live database documentation
|-- migrations/              immutable SQL migrations
|-- pipeline/                standing operational CLI and shared services
|-- public/                  application assets
|-- scripts/                 retained image-review tool + env helper only
|-- src/                     active Next.js application
|-- swarm-browser-output/    retained review evidence (not archived yet)
|-- tests/                   Vitest regression and pipeline tests
|-- image-review-decisions-20260708.json  retained review input
|-- package.json
|-- README.md
|-- next.config.ts
|-- tsconfig.json
|-- vercel.json
`-- vitest.config.ts
~~~

## Archive

The database dump directory contains 106 ignored .dump payloads plus the committed
manifest. archive/reports/ and archive/scripts-legacy/ each contain 41 files.

- archive/.gitignore
- archive/README.md
- archive/db-dumps/fountain_raw_archive_20260711/MANIFEST.md
- archive/db-dumps/fountain_raw_archive_20260711_pass1_step0/MANIFEST.md

### Archived reports

- archive/reports/analytics-tagging-fixes-report-20260709.json
- archive/reports/closeout-documents-removal-report-20260707.dry-run.json
- archive/reports/closeout-documents-removal-report-20260707.json
- archive/reports/db-cleanup-report.service-area-20260707.json
- archive/reports/db-cleanup-report.tags-20260707.json
- archive/reports/hyperbaric-app-image-promotion-report-20260710.json
- archive/reports/image-hygiene-report-20260708.json
- archive/reports/image-promotion-final-summary-20260708.json
- archive/reports/image-review-decisions-ingest-report-20260708.json
- archive/reports/location-followup-cleanup-report-20260707.dry-run.json
- archive/reports/location-followup-cleanup-report-20260707.json
- archive/reports/location-geocode-addendum-report-20260707.dry-run.json
- archive/reports/location-geocode-addendum-report-20260707.json
- archive/reports/location-geocode-backfill-checkpoint-20260707.json
- archive/reports/location-geocode-backfill-report-20260707.dry-run.json
- archive/reports/location-geocode-backfill-report-20260707.json
- archive/reports/location-geocode-backfill-report-20260707.post-followup.inventory.json
- archive/reports/location-geocode-guardrail-backfill-checkpoint-20260709.json
- archive/reports/location-geocode-guardrail-backfill-report-20260709.json
- archive/reports/location-jsonld-recovery-report-20260709.json
- archive/reports/location-normalization-report-20260707.dry-run.json
- archive/reports/location-normalization-report-20260707.json
- archive/reports/location-wrong-branch-mini-fix-report-20260707.dry-run.json
- archive/reports/location-wrong-branch-mini-fix-report-20260707.json
- archive/reports/menu-cleanup-tiers23-report-20260708.json
- archive/reports/org-dedup-audit-report-20260707.json
- archive/reports/org-dedup-phase2-report-20260707.dry-run.json
- archive/reports/org-dedup-phase2-report-20260707.json
- archive/reports/places-website-backfill-checkpoint-20260707.json
- archive/reports/places-website-backfill-report-20260707.blocked.json
- archive/reports/places-website-backfill-report-20260707.dry-run.json
- archive/reports/places-website-backfill-report-20260707.inventory.json
- archive/reports/places-website-backfill-report-20260707.json
- archive/reports/schema-streamlining-preflight-20260708.json
- archive/reports/taxonomy-expansion-report-20260710.dry-run.json
- archive/reports/taxonomy-expansion-report-20260710.json
- archive/reports/taxonomy-phase4-report-20260711.dry-run.json
- archive/reports/taxonomy-phase4-report-20260711.json
- archive/reports/tier3-continuation-usd3-source-check-20260708.json
- archive/reports/website-image-harvest-checkpoint-20260708.json
- archive/reports/website-image-harvest-report-20260708.json

### Archived legacy scripts

- archive/scripts-legacy/apply-hyperbaric-task-c-20260711.mjs
- archive/scripts-legacy/audit-org-dedup.mjs
- archive/scripts-legacy/check-geocode-coverage.mjs
- archive/scripts-legacy/check-postgres-state.mjs
- archive/scripts-legacy/cleanup-vercel-blob-images.mjs
- archive/scripts-legacy/execute-analytics-tagging-fixes.mjs
- archive/scripts-legacy/execute-bookimed-cleanup-addendum.mjs
- archive/scripts-legacy/execute-bookimed-mismatch-approvals.mjs
- archive/scripts-legacy/execute-bookimed-website-backfill.mjs
- archive/scripts-legacy/execute-brand-scope-closeout-20260711.mjs
- archive/scripts-legacy/execute-brand-scope-sweep-20260711.mjs
- archive/scripts-legacy/execute-closeout-documents-removal.mjs
- archive/scripts-legacy/execute-final-closeout-20260711.mjs
- archive/scripts-legacy/execute-hyperbaric-b3-llm-20260711.mjs
- archive/scripts-legacy/execute-hyperbaric-cleanup-sweep.mjs
- archive/scripts-legacy/execute-hyperbaric-dedup-v2.mjs
- archive/scripts-legacy/execute-hyperbaric-image-promotion.mjs
- archive/scripts-legacy/execute-hyperbaric-task-b-20260711.mjs
- archive/scripts-legacy/execute-hyperbaric-task-d-20260711.mjs
- archive/scripts-legacy/execute-image-hygiene.mjs
- archive/scripts-legacy/execute-image-promotion.mjs
- archive/scripts-legacy/execute-location-followup-cleanup.mjs
- archive/scripts-legacy/execute-location-geocode-addendum.mjs
- archive/scripts-legacy/execute-location-geocode-backfill.mjs
- archive/scripts-legacy/execute-location-geocode-guardrail-backfill.mjs
- archive/scripts-legacy/execute-location-normalization.mjs
- archive/scripts-legacy/execute-location-wrong-branch-mini-fix.mjs
- archive/scripts-legacy/execute-menu-cleanup-tiers23.mjs
- archive/scripts-legacy/execute-org-dedup-phase2.mjs
- archive/scripts-legacy/execute-places-website-backfill.mjs
- archive/scripts-legacy/execute-taxonomy-dedup-20260712.mjs
- archive/scripts-legacy/execute-taxonomy-expansion.mjs
- archive/scripts-legacy/execute-taxonomy-phase4.mjs
- archive/scripts-legacy/execute-tier3-continuation-maintenance.mjs
- archive/scripts-legacy/execute-utm-tracking-hygiene.mjs
- archive/scripts-legacy/execute-website-image-harvest.mjs
- archive/scripts-legacy/ingest-browser-swarm-images-menus.mjs
- archive/scripts-legacy/ingest-hyperbaric-app.mjs
- archive/scripts-legacy/resume-hyperbaric-task-d3-shortdb-20260711.mjs
- archive/scripts-legacy/run-browser-swarm-images-menus.mjs
- archive/scripts-legacy/run-pipeline-step.mjs

## Pipeline

- pipeline/cli.mjs
- pipeline/config/models.mjs
- pipeline/config/providers.mjs
- pipeline/config/tasks.mjs
- pipeline/lib/city-index.mjs
- pipeline/lib/db.mjs
- pipeline/lib/ledger.mjs
- pipeline/lib/legitimacy-sample.mjs
- pipeline/lib/llm.mjs
- pipeline/lib/matcher.mjs
- pipeline/lib/migrations.mjs
- pipeline/lib/places.mjs
- pipeline/lib/queue.mjs
- pipeline/lib/report.mjs
- pipeline/lib/runs.mjs
- pipeline/lib/structure-doc.mjs
- pipeline/lib/web.mjs
- pipeline/tasks/legitimacy.mjs
- pipeline/tasks/llm_smoke.mjs
- pipeline/tasks/noop.mjs

## Active scripts

- scripts/ingest-image-review-decisions.mjs
- scripts/lib/pipeline-env.mjs

## Tests

- tests/city-suggestions.test.ts
- tests/country-search.test.ts
- tests/matcher.test.ts
- tests/pipeline-cli.test.ts
- tests/pipeline-db.test.ts
- tests/pipeline-ledger.test.ts
- tests/pipeline-legitimacy-sample.test.ts
- tests/pipeline-legitimacy.test.ts
- tests/pipeline-llm.test.ts
- tests/pipeline-maintenance.test.ts
- tests/pipeline-migrations.test.ts
- tests/pipeline-places.test.ts
- tests/pipeline-queue.test.ts
- tests/pipeline-report.test.ts
- tests/pipeline-runs.test.ts
- tests/pipeline-tasks.test.ts
- tests/pipeline-web.test.ts
- tests/url-sanitize.test.ts

## Run documents

- docs/runs/phase3-inventory.md
- docs/runs/pass1-sample-review.md
- docs/runs/run-4.md
- docs/runs/run-7.md
- docs/runs/run-21.md

## Migrations

- migrations/20260708_outbound_clicks.sql
- migrations/20260708_reviews_dedupe.sql
- migrations/20260708_schema_streamlining.sql
- migrations/20260709_city_index_radius_search.sql
- migrations/20260709_outbound_param_skipped.sql
- migrations/20260711_fountain_ops.sql

## Active application directories

- src
- src/app
- src/app/[articleSlug]
- src/app/api
- src/app/directory
- src/app/go
- src/app/media
- src/app/privacy-policy
- src/app/taxonomy-curator
- src/app/terms-of-service
- src/components
- src/content
- src/content/editorial
- src/content/legal
- src/lib

## Retained review assets

- image-review-decisions-20260708.json
- scripts/ingest-image-review-decisions.mjs
- scripts/lib/pipeline-env.mjs
- swarm-browser-output/
- swarm-browser-output/results/ (84 worker JSONL files across campaign run directories)

## Database shape after Pass 1 Gate A

The generated docs/NEON_DATABASE_STRUCTURE_CURRENT.md is the authoritative live
schema snapshot. fountain_raw now contains 21 tables: the 10 permanent raw
keep-list tables plus 11 unresolved workflow/review holds. It contains five owned
sequences and zero orphan sequences. fountain_ops contains the 300-row Gate A task
cohort plus its run and external-call ledger evidence; no Gate A serving writes were
performed.
