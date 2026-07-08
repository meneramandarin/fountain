# Task: Fix organization mis-linking (the "Elitra Health" contagion)

## Context
Organization matching during import collapsed unrelated clinics into shared orgs. Confirmed examples: org "Elitra Health" is the parent of Gameday Men's Health, Dr. Syra Aesthetics, Tree of Life Acupuncture, Advanced TRT Clinic, Clear Laser Skin Clinic, Clean Market, AIRE Ancient Baths, Equinox SoHo, InVita Wellness, and more. Other symptoms: "ABQ Regenerative Medicine" linked to org "Aberle Chiropractic Clinic", and chain orgs named per-city like "Prenuvo Clinic - Atlanta, GA" parenting all Prenuvo locations. Likely root cause: organizations.dedup_key collides when website_domain is missing or empty, so unrelated listings without domains fall into whichever org claimed the empty key first.

This task is TWO PHASES. Phase 1 is strictly read-only plus a report. Do not modify any rows until Malena approves the Phase 1 report.

## Phase 1: Audit (read-only)

1. Root cause: read the importer code that builds organizations.dedup_key and assigns locations.org_id. Document exactly how the collision happens (empty domain, name_normalized collision, or fallback bucket).
2. Contaminated orgs query: find every org whose child locations span 2+ distinct website registrable domains (strip www and UTM params, compare eTLD+1). Rank by location count and domain count. Include org id, canonical_name, website_domain, location count, distinct domains.
3. Mismatch query: locations where the location's website domain differs from its org's website_domain (both non-null).
4. Chain naming query: orgs whose canonical_name contains a city/state suffix pattern (e.g. "Prenuvo Clinic - Atlanta, GA") while parenting locations in other cities.
5. Output a report (JSON + human-readable summary) with per-location proposed action:
   - RELINK: location's domain matches a different existing org's domain exactly.
   - NEW_ORG: location's domain matches no existing org; propose creating an org from the location's name and domain.
   - AMBIGUOUS: location has no website, or domain is a marketplace/maps URL (google.com/maps, place_id links), or multiple candidate orgs share the domain. No auto action, list for review.
   - KEEP: linkage looks correct.
6. Include counts per action type and the top 20 worst orgs.

Stop here and present the report.

## Phase 2: Fix (only after approval, only auto-approved cases)

1. Backup: `CREATE TABLE fountain_raw.organizations_backup_<date> AS SELECT * FROM fountain.organizations;` and a mapping table of (location_id, old_org_id) for every row you change.
2. Execute RELINK and NEW_ORG actions from the approved report. New orgs get data_origin = 'system', verification_status = 'unverified', dedup_key derived from the registrable domain.
3. Chain rename: for approved chain orgs, set canonical_name to the brand name without city suffix (e.g. "Prenuvo"). Do not merge chain orgs in this pass unless the report showed they share a domain and Malena approved the merge.
4. Leave AMBIGUOUS rows untouched; they stay in the report for manual review.
5. Fix the importer: dedup_key must never be derived from an empty/null domain. When domain is missing, fall back to name_normalized + locality, or leave org_id null rather than binding to a shared bucket. Add a regression test that two domain-less listings with different names never land in the same org.
6. Clean up: delete orgs that end up with zero locations and zero source_records (backup first, report count).
7. Refresh search_index for affected locations if org name feeds into it.

## Acceptance
- Org "Elitra Health" parents only locations whose domain is elitrahealth.com.
- Zero orgs with 2+ distinct registrable domains across their locations, excluding explicitly approved multi-brand cases.
- Re-running the Phase 1 contaminated-orgs query returns only approved exceptions.
- Report: rows relinked, orgs created, orgs renamed, orgs deleted, ambiguous rows remaining.

Do not touch offerings, reviews, tags, or practitioner data. Do not run fountain.merge_locations in this task.
