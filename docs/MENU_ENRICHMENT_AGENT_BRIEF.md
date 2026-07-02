# Menu Enrichment Agent Brief

This is a spec for you to build a new scraper (or set of scripts) that enriches
existing `canonical.db` locations with complete, priced treatment menus. It assumes the
reader has no other context on this conversation — everything needed is below or in the
files it points to.

## Context: what's broken today

`canonical.db` is built by `data_pipeline/build_canonical.py`, which merges ~85 per-source
staging SQLite databases (`data/databases/*.sqlite`) into one canonical database. It is
fully disposable and rebuilt from scratch on every run (`npm run build:canonical`) — nothing
in `canonical.db` should ever be hand-edited; all fixes go into the scrapers or the merge
script.

Verified current state (query `canonical.db` yourself to confirm before you start, these
will have shifted):

- 9,527 locations. Of those: **843 have zero offerings, 7,559 have exactly one.** Only ~12%
  have anything resembling a real menu.
- Only 913 of ~14,900 offerings have a numeric `price_amount`. Most pricing that exists is
  stuck in `locations.price_text` (free text), not attached to a specific treatment.
- Some locations have the same generic treatment name repeated many times with no
  distinguishing detail (e.g. "NAD" listed 20+ times at one Bangkok clinic) — this was
  actually two compounding bugs, not a scraper-quality issue per se: (a) `add_offering()`
  had no dedup/upsert key, so re-scraping or multiple source pages for the same clinic just
  kept re-inserting identical rows, and (b) some sources scrape multiple distinct pages for
  one business without collapsing them. **(a) is already fixed** — see "Already fixed" below.
  What's still missing is real variant detail: brand, dose/quantity, and price per item.
- 9,338 of 9,527 locations (98%) already have a `website` URL on file, and 5,753 of 6,218
  organizations have a `website_domain`. So "visit the clinic's own site" is viable today
  without a separate website-discovery step for the large majority of targets.
- There is **no LLM-calling infrastructure anywhere in this codebase.** All ~85 existing
  scrapers (`data_pipeline/scrapers/`) use `requests` + BeautifulSoup + regex/JSON-LD
  heuristics only — no model calls. You will be introducing this pattern for the first time;
  there is nothing to copy for the LLM-call part, though `fetch.py`, `extract.py`, and
  `storage.py` (below) have plenty to reuse for the fetching/parsing/writing part.

## Already fixed (don't redo this)

`data_pipeline/build_canonical.py`'s `add_offering()` now upserts on
`(location_id, source_id, raw_name)` (unique index `idx_offerings_dedup` in `schema.sql`),
merging price/currency/url via `COALESCE` so a later, better-informed pass fills in gaps
without clobbering good data from a different source, and re-running never duplicates a row.
**This means your raw_name text is part of the uniqueness key** — see "Naming convention"
below for why that matters for your extraction design.

## Architecture: reuse the existing pipeline, don't build a parallel system

Do not write directly to `canonical.db`. It gets deleted and rebuilt from `schema.sql` on
every `build_canonical.py` run (see `reset_db()`), so anything written straight into it is
lost on the next build. Everything must flow through the same two-stage pattern every other
source uses:

1. **A new staging SQLite database** in `data/databases/`, written using the existing shared
   schema (`SourceDatabase` in `data_pipeline/scrapers/storage.py` — same `listings` /
   `listing_fields` / `images` / `reviews` tables every other scraper uses). Suggested name:
   `data/databases/menu_enrichment.sqlite` (single file is fine — SQLite handles the volume
   here easily; shard by batch only if you need parallel workers writing concurrently).
2. **A new routing branch in `build_canonical.py`** that maps your enrichment listings into
   `organizations` / `locations` / `offerings`, the same way `is_bookimed_clinic_source()`'s
   branch already does for structured per-treatment pricing (`data_pipeline/build_canonical.py`,
   `map_location()`, ~line 487 in the `elif is_bookimed_clinic_source(slug):` branch — read
   this one closely, it's your closest existing analog: it builds an `offers: [{raw_name,
   price_amount, price_currency, source_offer_url}, ...]` list per listing, which
   `process_location()` then feeds straight into `add_offering()` per item).

### Why this naturally re-attaches to existing orgs/locations instead of creating duplicates

`get_organization()` (`build_canonical.py`) dedups primarily by `website_domain`. If your
enrichment listing's `website` field is the same clinic site already in canonical.db, it
will automatically resolve to the **same** `org_id` — you don't need to look up or pass
canonical IDs directly, and you shouldn't try to (staging listings never reference canonical
IDs; that would break the disposable-rebuild model). Same idea for `get_location()`, keyed
on org + locality/address. Practical implication: **carry over the existing `locality` /
`region` / `country_code` from the canonical row you're enriching** (these are what the
dedup key is actually built from for most sources) so your listing lands on the exact same
location instead of spawning a near-duplicate. `address` / `phone` / `email` / `website`
are different — see "Also scrape real contact info" below, those should be the freshly
verified values, not blindly copied.

After a build, verify this worked before trusting the run:
```sql
SELECT COUNT(DISTINCT sr.entity_id) AS orgs_touched,
       SUM(CASE WHEN existing.first_seen < 'menu_enrichment' THEN 0 ELSE 1 END) AS brand_new
FROM source_records sr JOIN sources s ON s.id = sr.source_id
WHERE s.slug = 'menu_enrichment' AND sr.entity_type = 'organization';
```
(Adapt as needed — the point is: most orgs touched should be pre-existing, not newly
created. If your run is creating a large fraction of *new* orgs, your dedup fields
[website/locality] probably aren't matching the existing rows and something's off.)

### Opportunistic new-location discovery (in scope, per explicit decision)

If a clinic's site reveals branch locations not yet in canonical.db (e.g. a "Locations"
page listing 5 cities but canonical.db only has 1), emit those as additional listing rows
too — same organization (matches via `website_domain`), new location. This is a secondary
output of the same crawl, not a primary goal; don't build separate infrastructure for it.

## Also scrape real contact info: website, address, email, phone

This whole pass is only useful if it lands on the clinic/med spa/practitioner's **own**
site — not the directory, marketplace, or booking platform where it was originally found.
That distinction matters more than it might look: I checked, and `locations.website` is
*already* the real clinic domain for most rows (JSON-LD `url` fields usually point to the
business's own site even on directory-sourced listings), but it's demonstrably wrong for a
real chunk of the data — e.g. 260 organizations currently have `website` literally set to
`us-uk.bookimed.com` (the marketplace itself, not the clinic), and 189 locations have no
`website` at all. There will be more cases beyond that specific pattern (dead links, wrong
business entirely, a booking-widget subdomain instead of the real homepage) that only
surface once you actually try to fetch and read the page — a static pre-filter won't catch
all of it.

So treat this as part of the crawl itself, not a separate pre-processing pass:

1. **Before trusting `locations.website`,** sanity-check whatever you fetch: does the page's
   title/content plausibly match the clinic's name? Is it a single business (good) or a
   directory/marketplace listing many unrelated businesses (bad — you're still on the
   aggregator)? A page listing dozens of unrelated clinic names is a clear tell you haven't
   reached the real site yet.
2. **When `website` is missing, dead, or fails that check,** fall back to a targeted search
   (e.g. `"{clinic name}" {locality} official website`) to find the real one before giving up
   on that target.
3. **Once you're confident you're on the real site,** capture — alongside the menu —
   whatever of these it actually publishes: the canonical website URL you landed on, a
   street address, an email address, and a phone number. Don't fabricate any of these; leave
   a field null if the site doesn't provide it (email in particular is sparse everywhere —
   only 0.6% of locations have one today — don't force a guess).
4. **Write these into the same staging listing row** as the menu (the shared `listings`
   table already has `address` / `phone` / `email` / `website` columns — no schema change
   needed). `map_location()` already reads these directly off the row for every source, so
   your new routing branch gets this for free as long as you populate the columns.
   `phone` / `email` / `website` should simply be overwritten with your freshly-verified
   values when found (real per-source data, not something to merge/coalesce). `address`
   is more nuanced: prefer your freshly-scraped value when found (it's likely more precise
   than whatever the original discovery source had, especially for directory-sourced rows),
   but don't let a failed address extraction blank out a location that already had one from
   another source — if you found nothing, leave the field empty in your listing row rather
   than writing an empty string, so you don't overwrite good existing data with silence.

## Extraction design: LLM read as primary method

Given that only ~6% of offerings have a real price after 70+ heuristic/regex-based scrapers
already tried, and clinic menu pages have essentially unlimited layout variety, treat
**LLM-based page reading as the primary extraction method**, not a fallback. Recommended
flow per target location:

1. **Fetch candidate pages.** Start from the clinic's known `website`. Fetch the homepage,
   then look for likely menu/pricing pages: check common paths (`/pricing`, `/price-list`,
   `/services`, `/treatments`, `/menu`) and follow on-page nav links whose text matches
   `price|pricing|service|treatment|menu` (case-insensitive). Cap it — e.g. homepage + up to
   3 follow-on pages per clinic, to bound both fetch time and LLM context size. Reuse
   `fetch.py`'s `FetchResult`/session/header conventions and `extract.py`'s
   `soup_from_html()` / `extract_json_ld()` / `flatten_json_ld()` (check JSON-LD first —
   `Product`/`Offer`/`priceSpecification` blocks are the cheapest, highest-confidence signal
   when a site has them, before falling back to LLM reading of visible text).
2. **One LLM call per clinic**, given the concatenated page text (plus any JSON-LD found),
   with a strict structured-output schema, e.g.:
   ```json
   {
     "confirmed_own_site": true,
     "website": "https://clinic.com",
     "address": "456 Main St, Suite 2, Denver, CO 80202",
     "email": "info@clinic.com",
     "phone": "+1 303-555-0100",
     "menu_items": [
       {
         "treatment_name": "Botox",
         "brand_or_variant": "Nabota",
         "quantity_or_dose": "100 units",
         "price_amount": 350.0,
         "price_currency": "USD",
         "price_type": "fixed",
         "price_max": null,
         "source_url": "https://clinic.com/pricing",
         "confidence": "high"
       }
     ],
     "other_locations_mentioned": [
       {"address_text": "123 Other St, Denver, CO", "source_url": "..."}
     ]
   }
   ```
   `confirmed_own_site` is the sanity check from "Also scrape real contact info" above, made
   explicit in the schema so Tier 1 QA (below) can check it mechanically: if `false`, the
   whole result should be treated as a failed extraction and routed to Tier 2, not written
   as-is. `website` / `address` / `email` / `phone` should be null wherever the site simply
   doesn't publish that field — don't guess.
   Use `price_type: "starting_at"` with `price_amount` as the floor, or `"range"` with both
   `price_amount`/`price_max` set, when the site gives a range rather than one fixed number.
   Leave `price_amount` null (never fabricate a number) when the site genuinely doesn't list
   one — that's a legitimate, useful outcome, not a failure.
3. **JS-rendered sites**: a real and common failure mode for modern booking-platform sites
   (Fresha, Vagaro, etc. often render pricing client-side). Plain `requests` will return
   near-empty HTML for these. Detect this cheaply (very short visible-text length despite a
   200 response) and treat as an automatic Tier 2 escalation candidate rather than silently
   recording "no menu found."

### Naming convention: this matters for correctness, not just style

The taxonomy (`data_pipeline/taxonomy_seed.json`) has one generic `treatment_id` for
"Botox" — there's no separate brand/quantity column in `offerings`, and (per "Already
fixed" above) `raw_name` is now part of the dedup key. That means **`raw_name` is the only
place variant detail can live**, and it directly determines whether two real variants stay
as two rows or collapse into one. Standardize on something like:
`"{treatment_name} — {brand_or_variant}, {quantity_or_dose}"` when those fields are present
(e.g. `"Botox — Nabota, 100 units"`), falling back to plain `"{treatment_name}"` when the
site gives no variant detail. Do **not** carry over internal booking-system IDs into
`raw_name` (e.g. some existing data has junk like `"Botox Injections Bk 15119"` — that's a
booking-platform SKU leaking into a title, not real content; strip anything that looks like
a short alphanumeric code fragment at the end of an extracted name).

## Prioritization / worklist

Don't process all locations in one undifferentiated pass — order by expected ROI:

1. Locations with 0 offerings (843).
2. Locations with exactly 1 offering (7,559) — biggest bucket, biggest opportunity.
3. Locations where `price_text` is set but no offering has `price_amount` (151) — these
   already have *some* pricing signal, likely easy wins for structuring it properly.
4. Everything else, lowest priority.

Generate this worklist directly from canonical.db (don't hardcode it — canonical.db changes
shape every rebuild):
```sql
SELECT l.id, l.name, l.website, l.address, l.locality, l.region, l.country_code, l.org_id,
       COUNT(o.id) AS offering_count
FROM locations l LEFT JOIN offerings o ON o.location_id = l.id
GROUP BY l.id
ORDER BY offering_count ASC, l.id
LIMIT ...;
```

## Two-tier QA (this is the "does this make sense" step you asked for)

Given cost matters and asking an agent to re-review all ~9.5k results line-by-line is likely
wasteful, use automated triage first and only escalate what actually needs a second look:

**Tier 1 — automated sanity checks, applied to every extraction result, no LLM cost:**
- `confirmed_own_site: false` — you never actually reached the clinic's real site.
- Zero menu items despite a successful page fetch.
- Every extracted item has `price_amount: null`, but the raw page text plausibly contains
  currency symbols (cheap regex check on the fetched text) — suggests the LLM under-read
  the page.
- Two or more items share the exact same `treatment_name` with no `brand_or_variant`,
  `quantity_or_dose`, or price to distinguish them — this is precisely the "listed 10 times,
  no detail" pattern; don't write near-duplicates, flag them.
- All candidate URLs failed to fetch (403/404/timeout) or returned suspiciously short text
  (JS-rendered site, see above).

Rows that fail land in a review queue (e.g. `data/exports/menu_enrichment_review_queue.csv`
or a `needs_review` flag in `listing_fields`) instead of being treated as final. Rows that
pass go straight into the staging DB as normal.

**Tier 2 — escalation, only for flagged rows (expect this to be a minority, likely well
under 20% of the total based on typical extraction failure rates — measure this in the
pilot before assuming a number):** a more expensive, more capable pass — more candidate
pages, a larger context budget, or an actual browsing-capable agent (e.g. spawned via the
Agent tool with WebFetch) for cases like JS-rendered sites where a plain fetch can't recover
the content at all. This tier is explicitly allowed to cost more per row since it only runs
on a small fraction of the total.

## Efficiency controls

- **Pilot before scaling.** Run ~100 locations first (mix of priority-1 and priority-2
  targets), measure: % yielding at least one priced item, average items per successful
  clinic, Tier 2 escalation rate, and actual $ cost. Extrapolate to the full ~8,400
  (priority 1+2) before committing to a full run. Don't guess the cost up front — measure it.
- **Batch + resume.** Process in chunks (e.g. 200-500 locations) and rely on
  `SourceDatabase`'s existing `source_url`-unique upsert (`storage.py`) for idempotency — a
  restarted run should skip/update already-processed URLs, not duplicate work.
- **Respect the fetch layer's existing conventions** (headers, rate limiting) in `fetch.py`
  rather than writing a second one.

## Deliverables

1. `data_pipeline/scrapers/scrape_menu_enrichment.py` — the new scraper. Follow the shape of
   `scrape_service_search.py` for staging-DB/CLI conventions (`--reset`, batching flags,
   etc.), but this one needs new LLM-calling code (no existing utility to reuse — you'll need
   to add the `anthropic` Python SDK and an API key via environment variable, following
   whatever convention the rest of this repo uses for secrets — check `.env`/`.env.example`
   patterns before inventing a new one).
2. `build_canonical.py` changes: new routing branch (slug `menu_enrichment`, or a prefix if
   you shard) + a new `map_location()` branch modeled on the bookimed-clinic `offers[]`
   pattern described above. The `idx_offerings_dedup` upsert is already in place — you don't
   need to add dedup logic in `build_canonical.py` itself, just correct `raw_name`s in your
   extraction.
3. Extend `print_report()` (`build_canonical.py`) with an offerings-per-location histogram
   (0 / 1 / 2-4 / 5+) so this metric — the one motivating this whole effort — is visible on
   every future build, not just this one. This is a small, high-value addition; do it early
   so you have a before/after number for your own pilot.
4. `data_pipeline/requirements.txt` — add whatever LLM SDK dependency you use.
5. `package.json` — add an `npm run scrape:menu-enrichment` entry, matching the existing
   `scrape:dexa-us` / `scrape:service-search` convention.
6. A short doc at `docs/MENU_ENRICHMENT_SCRAPER.md` once built, matching the existing
   `docs/DEXA_US_SCRAPER.md` / `docs/SERVICE_SEARCH_SCRAPER.md` format (tables produced,
   how to run smoke/full passes, current coverage stats).

## Verification

- Before touching anything, capture a baseline: run `npm run build:canonical`, note the
  offerings-per-location histogram (query above, or your new report line once added).
- After the pilot (~100 locations) rebuild and diff against baseline: offering count should
  rise for exactly the targeted locations, `source_records` should show the `menu_enrichment`
  source attaching mostly to *existing* org IDs (see the "why this re-attaches" query above),
  and `price_amount` coverage should increase.
- Spot-check a handful of specific locations by name before/after to confirm menus look
  sane (real treatment names, plausible prices, no repeated near-identical rows).
- Re-check the existing "suspicious location collapses" diagnostic in `print_report()`
  after your first full run — it already flags any location absorbing 3+ distinct URLs from
  one source, which would catch it if your dedup logic is over-collapsing distinct branches.
