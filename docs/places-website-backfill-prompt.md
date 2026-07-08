# Task: Backfill real websites from Google Place IDs

## Context
Hundreds of locations have a Google Maps link stored as their website, in the format `https://www.google.com/maps/place/?q=place_id:ChIJ...`. The place_id is embedded in the URL, so no scraping or browsing is needed: extract it and call Google Places API (New) Place Details. Phase 2 of the org dedup detached most of these locations from orgs; this task gives them real websites so a final org-matching pass can relink them.

## Step 0: Inventory and cost estimate
1. Count candidate locations: website matches the maps place_id pattern (also handle variants like maps.google.com and google.com/maps URLs containing place_id).
2. Check fountain.external_place_matches first: if a location already has a stored provider_place_id with a fetched payload containing a website, use that and skip the API call.
3. Report candidate count and estimated cost before running: websiteUri bills at the Enterprise SKU, roughly $20 per 1,000 calls with about 1,000 free Enterprise calls per month. If the estimate exceeds ~$50, stop and confirm with Malena.

## Step 1: Fetch
For each candidate without a cached match:
- Extract place_id via regex.
- Call Place Details (New) with FieldMask exactly: `id,displayName,websiteUri,nationalPhoneNumber`. Do not request any other fields (field masks silently upgrade the SKU).
- Rate limit politely (a few requests per second is fine), retry with backoff on 429/5xx, and checkpoint progress so the job is resumable.

## Step 2: Verify before writing (mandatory)
Phase 2 revealed that scraped websites are sometimes cross-assigned between clinics, so verify identity before writing:
- Compare the API displayName against the location name: normalized token overlap after stripping punctuation, city names, and generic words (clinic, center, medical, wellness, therapy, spa, llc, md).
- MATCH: write websiteUri to locations.website (strip UTM params). If locations.phone is empty, write nationalPhoneNumber. Upsert the match into external_place_matches (provider = 'google_places', provider_place_id, fetched_at as a proper timestamp).
- MISMATCH: do not write. Record location_id, location name, API displayName, and returned website in the mismatch report. These are likely wrong place_ids from the source scrape.
- No websiteUri returned (business has no website): record as no_website, leave locations.website NULL rather than keeping the maps link.

## Step 3: Junk domain hygiene
While in here, extend the non-clinic/marketplace domain list used by org matching with domains surfaced in Phase 2: rymaps.xyz, europepmc.org, plus the existing google.com, facebook.com, instagram.com, yelp.com set. Null out locations.website where it currently points at rymaps.xyz.

## Step 4: Re-run org matching for backfilled locations
For every location that received a verified website in Step 2, run the same logic as org dedup Phase 2:
- Domain matches an existing org's website_domain exactly: relink.
- Domain matches no org: group by registrable domain and create one org per domain, with the same brand-token guardrail as Phase 2.
- Log all changes to a fountain_raw mapping table, refresh search_index for affected locations.

## Step 5: Acceptance and report
- Zero active locations whose website matches the maps place_id pattern (all resolved, flagged as mismatch, or set to no_website).
- Counts: cached hits, API calls made, matches written, mismatches flagged, no_website, relinked, new orgs created, total API cost.
- The Elitra Health location (id 8) has its real elitrahealth.com website and remains correctly linked to its org.
- Mismatch list included in full for manual review.

Do not modify offerings, reviews, tags, or practitioners. Do not attempt to resolve locations whose website is a facebook/instagram/yelp profile in this task; those have no place_id and are a separate pass.
