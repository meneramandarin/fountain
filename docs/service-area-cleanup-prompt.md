# Task: Delete the service_area scrape leftovers

## Context
Follow-up to the tag purge. The service_area machinery came in with a scrape and is not product scaffolding. It exists in three places: the parked tag facets `service_area_city` (80 values) and `service_area_service` (388 values), roughly 80 entities tagged as service areas (see source_records where entity_type = 'service_area', all from one source), and their entity_tags. Same backup-first and trigger rules as the previous task.

## Step 0: Backup
Snapshot anything you will delete that is not already covered by the previous task's backups, e.g. the affected location/entity rows into `fountain_raw.service_area_entities_backup_20260707`.

## Step 1: Identify the service_area entities
Find them via `source_records WHERE entity_type = 'service_area'` and via entity_tags with the tag (entity_type, 'service area'). Confirm which table the entity_ids point into (expected: locations).

## Step 2: Split by data quality
- If a service_area entity row has no real address data (address, locality, and coordinates empty or obviously programmatic like "Diabetes Screening Boise , ID"), delete it outright: use the existing `fountain.delete_location_cascade()` so offerings, images, entity_tags, search_index rows, and source_records go with it. Pass a reason like 'service_area scrape cleanup'.
- If a row DOES have a filled address or locality plus coordinates, do not delete. Add it to the review report so Malena can decide per row.

## Step 3: Delete the parked tag facets
Delete `service_area_city` and `service_area_service` from fountain.tags along with all their entity_tags. Remember the per-row search index trigger on entity_tags: disable `trg_refresh_entity_tag_search_index` for the bulk delete, re-enable it, then bulk-refresh search_index for affected entities.

## Step 4: Serving surfaces
Remove service_area entities from the sitemap and any routes/pages that rendered them. Verify no internal links 404 as a result; if any city landing pages linked to these entities, list those pages in the report instead of leaving dead links.

## Step 5: Acceptance checks + report
- `SELECT count(*) FROM fountain.tags WHERE facet LIKE 'service_area%'` returns 0.
- No source_records rows with entity_type = 'service_area' pointing at live entities.
- Search for "Diabetes Screening" and "Hearing Test" in search_index returns zero results.
- Report: entities deleted, entities flagged for review (with their address data), tag rows deleted, any pages that referenced them.

Do not touch offerings, reviews, organizations, or regular location rows in this task.
