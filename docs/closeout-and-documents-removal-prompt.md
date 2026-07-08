# Task: Backfill closeout + remove PDF documents from serving

Three small jobs in one pass. Backup rules as always: snapshot anything before deleting it.

## Part A: Approve the 4 held-back website matches
The verification layer flagged these as mismatches, but manual review confirms all four are the same business. Write the fetched website and phone, upsert external_place_matches, and re-run org matching for them exactly as in the backfill task:
- location 43 QC NY SPA -> qcny.com
- location 621 Sports, Pain & Regenerative Institute - Fairview -> sprinstitute.com
- location 1010 Endure Health and Wellness -> endure-health.com
- location 1061 Vitalist Healing Traditions -> vitalisthealingtraditions.com
Afterwards zero active locations should have a maps place_id URL as website.

## Part B: Guardrail follow-ups
1. Add square.site, zoca.com, glossgenius.com, clientsecure.me (and similar hosted booking-page platforms already seen in the data) to the profile-platform domain list: locations keep such websites, but org matching never creates or links orgs from these domains.
2. Relink locations 1020 and 1175 (ChillRx Cryotherapy) to the existing org that owns chillcryo.net.
3. The DRIPBaR: multiple existing orgs share thedripbar.com. Merge them into one org named "The DRIPBaR" (keep the lowest org_id, repoint locations and source_records, backup first). This is the approved pattern for the other duplicate-domain org cases too: produce the current list of domains shared by 2+ orgs, merge the unambiguous same-brand cases, and flag any where the org names differ materially.
4. Locations 769 and 777 (Newark city health department facilities) and location 546 (CryoHealLLC, whose Google-listed website is google.com itself): add to the deletion review list in the report, set status = 'hidden'. Do not delete.

## Part C: Remove PDF documents from serving
The fountain.documents table (491 rows) contains page text from a handful of scraped promotional PDFs (Thai medical tourism brochures, a Korea medical directory). They pollute search results with travel-guide fragments.
1. Verify the raw source data for these PDFs is retained in fountain_raw (source slugs like healing_harmony_thailand_pdf, thailand_longevity_guidebook_pdf, korea_medical_directory_pdf). It is; confirm and note counts.
2. Delete the 'document' rows from fountain.search_index and remove document indexing from the search refresh functions/triggers so they cannot come back.
3. Delete fountain.source_records rows pointing at document entities, then delete fountain.documents rows (backup table in fountain_raw first).
4. Remove any document routes/rendering from the frontend and the sitemap if present.
5. If any locations were originally discovered via these PDF sources, they are unaffected; only the document page-text entities go.

## Acceptance and report
- search_index contains only location and practitioner rows (count should drop by ~491 to ~14,421).
- Zero active locations with maps place_id websites.
- No search results match "Koh Samui" or similar travel-brochure text.
- Report: merged org list, flagged duplicate-domain cases needing review, hidden locations, documents deleted, search_index before/after counts.

Do not touch offerings, reviews, tags, practitioners, or regular location data beyond the rows named above.
