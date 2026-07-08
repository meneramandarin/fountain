# Task: Purge scrape noise from the tags system

## Context
`fountain.tags` (965 rows, facet + value) and `fountain.entity_tags` (74k rows) are polluted with scraped provenance and junk that flows into `search_index` and renders as pills on listing pages (see the pill "menu enriched from clinic site" on /directory/locations/lionheart-longevity-new-york). We are moving to a facet whitelist. Do NOT touch `fountain.offerings` in this task.

## Step 0: Backup
Snapshot both tables before any deletes:
- `CREATE TABLE fountain_raw.tags_backup_20260707 AS SELECT * FROM fountain.tags;`
- `CREATE TABLE fountain_raw.entity_tags_backup_20260707 AS SELECT * FROM fountain.entity_tags;`

## Step 1: Facet disposition

KEEP (consumer-facing whitelist):
- `care_model` (all 8 values)
- `goal` (keep as is for now)
- `price_tier`, but ONLY values in ($, $$, $$$, $$$$). Delete the currency-code values (AED, CHF, EUR, GBP, JPY, SGD, USD, £, €) and their entity_tags; currency already lives on offerings.price_currency.
- `trust`, but split it (Step 2).

DELETE (facet, all values, all entity_tags):
- `source_tag` (365 raw scraped strings incl. "Claim it here!", "Is this your listing?", Korean nav text, review-card blobs)
- `source_record_type` (pipeline metadata)
- `entity_type` (redundant; entity_tags.entity_type column already exists)
- `mentioned_treatment` (duplicates the treatments mapping)

MIGRATE THEN DELETE:
- `service_category` (11 values: cold_plunge, coronary_calcium_ct, cryotherapy, dexa, full_body_mri, hbot, infrared_sauna, iv_therapy, nad_plus, red_light, vo2max). Each maps 1:1 to an existing treatment (resolve via treatments.canonical_name / treatment_aliases). For every entity_tag on a location: if no offering row exists for (location_id, that treatment_id), insert one with raw_name = treatment canonical_name, data_origin = 'system', verification_status = 'unverified'. Then delete the facet. Report how many offerings were created.

PARK (decision pending, do not delete):
- `service_area_city` and `service_area_service`. Exclude them from search indexing and from any UI rendering, leave the rows in place.

## Step 2: Split the trust facet
Keep genuine credentials/accreditations as trust tags (e.g. "jci accredited" style values: a4m certified, clia certified, cqc registered, joint commission accredited, thai medical council licensed, iso certified, dea registered, board certification values, "medical oversight", "physician-led..." etc.).

Delete pipeline/provenance values and their entity_tags: every "discovery confidence N", every "editorial rank N", "editorially ranked", "chain location scrape", "discovered from provider site", "menu enriched from clinic site", "has rating", "has reviews", "premium tier". This provenance is recoverable from source_records and fountain_raw if ever needed.

If a value is ambiguous, keep it and list it in the report for review.

## Step 3: Performance gotcha
`entity_tags` has trigger `trg_refresh_entity_tag_search_index` which refreshes the search index PER ROW. Bulk-deleting tens of thousands of entity_tags with it enabled will be extremely slow. Disable that trigger for the bulk operations, then re-enable it and do one bulk refresh of `search_index` for all affected entities afterward (use the existing refresh functions).

## Step 4: Acceptance checks + report
- `SELECT facet, count(*) FROM fountain.tags GROUP BY 1` before vs after.
- Full-text search for "Is this your listing" and "Claim it here" returns zero results.
- The Lionheart Longevity page shows only clean pills.
- Report: rows deleted per facet, offerings created in Step 1, ambiguous trust values kept for review.

Do not modify offerings.raw_name values, do not deduplicate offerings, and do not touch reviews, locations, or organizations in this task.