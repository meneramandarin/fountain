# Task: Org dedup Phase 2 (approved with amendments)

Phase 1 audit (org-dedup-audit-report-20260707) is approved with the amendments below. Execute Phase 2 now. Backup rules from the original prompt apply: snapshot fountain.organizations and write a (location_id, old_org_id, new_org_id, action) mapping table to fountain_raw before any writes.

## 1. RELINK (18 rows): execute all as proposed
Add the affected umbrella orgs (e.g. the ucsfhealth.org and wustl.edu parents) to a "rename candidates" list in the final report; do not rename them in this pass.

## 2. NEW_ORG (686 rows): execute with domain grouping
Do NOT create one org per location. Group all NEW_ORG rows by registrable domain first:
- One new org per domain. All locations in the group link to it.
- Org canonical_name: derive the brand name shared across the group's location names (strip city/neighborhood suffixes). Single-location groups use the location name minus city suffix.
- website_domain = the registrable domain, dedup_key derived from it, data_origin = 'system', verification_status = 'unverified'.
- Guardrail: if location names within one domain group do not share an obvious brand token, do not create the org; move those rows to AMBIGUOUS and list them. Known case: flt.life is claimed by "Fountain Life New York", "Next Health - New York City", and "Longevity Center Poland"; these are different brands, so at most one website value is correct. Flag, do not group.

## 3. AMBIGUOUS (970 rows): detach wrong parents
For each AMBIGUOUS location:
- If the location name matches its current org's canonical_name (case-insensitive, one contains the other after stripping punctuation and city suffixes), KEEP the linkage (e.g. location 8 "Elitra Health" under org "Elitra Health").
- Otherwise set locations.org_id = NULL. Record every detachment in the mapping table.
Ensure the frontend handles org_id NULL gracefully: no parent-org module, no broken links, no empty "Other locations from" sections. Verify on one detached page (e.g. Equinox SoHo).

## 4. Chain renames: approve 9 of 10
Rename per the proposal: Prenuvo Clinic, Greater Therapy Centers, Dexascans.com, Holsman Physical Therapy, Regenerative Pain & Sports Medicine, Empower U, Dr. Burkenstock's Skin Body Health Med Spa, Maze Laboratories, Regenerative Stemwave Therapy Center.
EXCEPTION: org 4470 "Blain's Farm & Fleet" is a farm supply retail chain and does not belong in the directory. Do not rename. Set its locations to status = 'hidden' and add the org and locations to the deletion review list in the report.

## 5. Cleanup and integrity
- Delete orgs left with zero locations and zero source_records (backup first, report the count).
- Refresh search_index for every location whose org changed, if org name feeds search.
- The importer code was not found in this checkout. Locate the import pipeline (separate repo or scripts directory; ask Malena if not found) and apply the fix from the original prompt: dedup_key must never derive from an empty, null, or marketplace domain (google.com, facebook.com, instagram.com, yelp.com, maps links). Fallback is name_normalized + locality, or org_id NULL. Add the regression test.

## 6. Acceptance and report
- Org "Elitra Health" parents only elitrahealth.com locations.
- Zero NEW_ORG-created orgs sharing a registrable domain with another org.
- Counts: relinked, orgs created (and locations per new org), detached to NULL, renamed, hidden (Blain's), empty orgs deleted, rows moved to AMBIGUOUS by the brand-token guardrail.
- Remaining AMBIGUOUS rows stay untouched; they will be resolved by the upcoming Google Places website backfill task.

Do not touch offerings, reviews, tags, or practitioners. Do not run fountain.merge_locations.
