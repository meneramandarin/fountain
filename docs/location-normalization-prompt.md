# Task: Normalize location geography fields

## Context
Location address fields are polluted from mixed scrape sources. Known symptoms: locality = "USA" on 423 US rows (currently the second-largest "locality" in the db), region values like "TX , Fort Worth, TX" and "North America", full state names mixed with 2-letter codes, 142 locations with no country, six country codes whose display name is the code itself (BE, ID, JM, MA, ME, PT), cross-field contradictions like locality "Koh Samui" with country "Switzerland" (location 2562, Enriched Gut), and only 1,861 of ~13,100 locations having coordinates. Also, many websites carry bioedge UTM referral params.

Backup fountain.locations to fountain_raw before writes. Log every changed row to a (location_id, field, old_value, new_value, rule) audit table.

## Part A: Deterministic repair from the address string
The address column is usually the most trustworthy field (e.g. "111 Town Square Pl Suite 1203, Jersey City, NJ 07310, USA"). Build a parser for the common comma-separated shapes and repair the structured fields from it:
1. locality: replace junk values ("USA", country names, region names, empty-but-derivable) with the city parsed from address.
2. region: for US and CA rows, normalize to the 2-letter USPS/postal code. Strip compound junk like "TX , Fort Worth, TX" (keep the state code). Delete continent values like "North America". Full state names map to codes. Non-US/CA rows: keep existing region if plausible, else derive from address, else NULL.
3. postal_code: fill from address where parseable and currently empty.
4. country_code: fill the 142 empty ones from address suffix, or from region when it is an unambiguous US state code. country_name: backfill from a standard ISO 3166 lookup for ALL rows, fixing the six code-as-name countries.
5. Only overwrite a populated field when the existing value is on the junk list or contradicts the address; when in doubt, flag instead of writing.

## Part B: Contradiction flags
Produce a review list of rows where fields disagree and the address does not resolve it: locality belongs to a different country than country_code (the Koh Samui/Switzerland case), region not valid for the country, address city differs from locality. For unambiguous cases (locality is a well-known city in exactly one country), fix country_code/country_name directly and log it.

## Part C: Website hygiene
Strip utm_* and other tracking query params from all locations.website values. Log count.

## Part D: Coordinate backfill (cost-gated)
Geocode locations that have a street address but no coordinates, via Google Geocoding API (Essentials SKU, about $5 per 1,000 with a monthly free allowance; check the current quota).
- Count candidates and report estimated cost BEFORE calling. If above $25, stop and confirm with Malena.
- Geocode using the full address string; write lat/lng only when the geocoder returns a street-level or premise-level match (skip approximate/city-level results, log them as low_confidence).
- Sanity check: the returned coordinates must fall inside the location's country; otherwise flag, do not write.
- Checkpointed and resumable, polite rate limiting.

## Frontend check
The location page subtitle currently renders things like "New York, North America, United States". After normalization, verify the subtitle logic skips region when NULL and never renders region values equal to the country or continent. Verify on the Lionheart Longevity page.

## Acceptance and report
- Zero locations with locality = 'USA' or region containing a comma or continent name.
- US/CA regions are all valid 2-letter codes.
- Zero rows with country_code set and country_name empty or equal to the code.
- Remaining no-country count (should be near zero; list leftovers).
- Coordinate coverage before/after, geocoding cost, low_confidence list size.
- Contradiction review list included in the report.

Do not touch offerings, reviews, tags, orgs, or practitioners. Do not modify address strings themselves except trimming whitespace.
