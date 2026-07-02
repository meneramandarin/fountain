# Canonical Duplicate Locations: Diagnosis & Fix Brief

This is a spec for another agent to fix a real, verified duplicate-location problem in
`canonical.db`, surfaced by the "Craniosacral New Orleans" example (it currently appears
twice). It assumes no other context — everything needed is below. **This is diagnosis +
plan only; nothing has been changed in the app or the pipeline yet.**

## Important operational note before you start

Two other agents may be actively working in this same repo/working tree concurrently (one
on menu enrichment, one on search/filtering UX). Before touching anything: run `git log
--oneline -10 -- data_pipeline/build_canonical.py` and re-read the current state of the
functions referenced below — they may have already changed since this brief was written.
Also check `git status` for uncommitted working-tree changes before assuming a clean
baseline (there was, at time of writing, an unexplained uncommitted deletion of an unrelated
doc file sitting in the tree — a sign this environment is shared and can shift under you).

## tl;dr: there are two different bugs here, not one

1. **A key-generation bug in `build_canonical.py`** that causes the *same* real-world
   location, discovered by two different sources, to be written as two separate rows in
   `canonical.db`. This is a merge-logic bug — the underlying source data is fine. Fixing it
   in `build_canonical.py` and rebuilding will make the duplicates disappear automatically,
   with **no manual data deletion needed** (`canonical.db` is fully rebuilt from scratch every
   run — never hand-edit it, see `data_pipeline/build_canonical.py`'s `reset_db()`).
2. **A real origin-database duplication problem inside `data/databases/menu_enrichment.sqlite`
   itself** — the same clinic is being written as multiple separate `listings` rows (one per
   page fetched, it looks like, rather than one per clinic). This one genuinely does belong
   at the origin/staging layer, per your instinct — see part 2 below.

Don't conflate them — they need different fixes in different places.

## Part 1: the key-generation bug (this is what caused Craniosacral New Orleans)

### What I verified

`canonical.db` currently has org `craniosacralneworleans.com` (org_id may differ by the time
you read this — IDs shift on every rebuild) with **two** location rows, both at the identical
address `614 Poland Ave B, New Orleans, LA 70117`:

- One from `stem_cell_authority`, `dedup_key = craniosacralneworleans.com|new-orleans|la|614-poland-ave-b-new-orleans-la-70117`
- One from `menu_enrichment`, `dedup_key = craniosacralneworleans.com|new-orleans|la`

Same org (org-level dedup by `website_domain` worked correctly — this is not an org dedup
problem). Same physical address. Two different keys, because they were built by different
code paths — that's the entire bug.

### Root cause, exactly

In `get_location()` (`data_pipeline/build_canonical.py`):
```python
key_parts = [org_key, locality_key or address_key or "main"]
if mapped.get("region"):
    key_parts.append(slugify(mapped["region"]))
if (source_slug in HIGH_VOLUME_SOURCES or mapped.get("record_type") == "discovered_location") and address_key:
    key_parts.append(address_key[:80])
key = "|".join(key_parts)
```
`HIGH_VOLUME_SOURCES = {"stem_cell_authority", "bioedge_clinics"}` (near the top of the
file). Sources in that set — or any listing tagged `record_type == "discovered_location"` —
get an address-slug suffix appended to their dedup key. Every other source, including
`menu_enrichment`, does not. So the *same* location, touched by both a high-volume source and
`menu_enrichment`, computes two different key strings and never matches in
`self.locations_by_key`.

There's a partial fix already in place (added during the menu-enrichment work, check `git
log` for `find_menu_enrichment_location` / `update_location_from_menu_enrichment`) that does
a fuzzy backward-lookup — but it's **one-directional**: it only runs when a `menu_enrichment`
listing is being processed and looks for an already-existing non-suffixed match. It does
nothing when a `HIGH_VOLUME_SOURCES` listing is processed and its suffixed key isn't found —
there's no equivalent fallback on that side. And because `process_sources()` iterates
`sorted(DB_DIR.glob("*.sqlite"))` alphabetically, `menu_enrichment.sqlite` sorts before
`stem_cell_authority.sqlite` (`m` < `s`) — so in practice `menu_enrichment` usually creates
the short-keyed row *first*, and `stem_cell_authority`/`bioedge_clinics` come along later,
fail to find their long-keyed version, and mint a duplicate. The existing fallback was built
for the reverse order and mostly doesn't fire.

### Scale (verified, not a guess)

```sql
-- orgs with 2+ locations sharing the same locality+region: a strong duplicate signal
SELECT COUNT(*) FROM (
  SELECT org_id, locality, region, COUNT(*) AS n FROM locations
  WHERE org_id IS NOT NULL GROUP BY org_id, locality, region HAVING COUNT(*) >= 2
);
```
Returned **983** groups. Of those, **404** specifically involve a `menu_enrichment` row
paired with something else in the same locality — and when you look at what that "something
else" is, it's overwhelmingly `stem_cell_authority` and `bioedge_clinics` (the two
`HIGH_VOLUME_SOURCES`), exactly matching the mechanism above. The other **579** groups don't
involve `menu_enrichment` at all — meaning this key-inconsistency bug **predates** the
enrichment work and was already producing duplicates on its own (any two
`HIGH_VOLUME_SOURCES`-vs-non-suffixed-source pair, or any `discovered_location`-vs-normal
pair, would trigger it). The enrichment pass made an existing bug much more visible by
touching ~2,000+ locations, a lot of which happen to be `stem_cell_authority`/`bioedge_clinics`
entries — it didn't invent the bug.

### Why your proposed fix (delete the un-tagged origin row) isn't the right move here

I get the instinct, and the underlying principle — don't hand-patch `canonical.db`, don't
paper over things at build time forever — is the right one and is exactly why I'm *not*
recommending a build-time-only patch. But deleting the older source's row from *its* origin
staging db (e.g. `stem_cell_authority.sqlite`) would be wrong here, because:

- That row isn't dirty data. `stem_cell_authority.sqlite` has exactly one clean listing for
  this clinic — same for `menu_enrichment.sqlite`. Neither origin database is duplicated.
  The bug is entirely in how `build_canonical.py` decides two clean listings are "the same
  location."
- Deleting it would throw away real provenance (that source's confirmation this business
  exists, its own scrape of phone/rating/etc.) for no reason.
- It wouldn't fix anything structurally — the same mismatch would keep firing for the other
  579 pre-existing pairs, and for every future overlap between a `HIGH_VOLUME_SOURCES` entry
  and anything else touching the same clinic.

The correct fix is in the key-generation/matching logic itself, and once it's fixed, a
rebuild collapses the duplicates automatically — zero manual deletion required for this class
of bug.

### Recommended fix

1. **Make the fallback matching universal and bidirectional**, not menu-enrichment-specific.
   Generalize `find_menu_enrichment_location()` into something like `find_matching_location()`
   that runs for *any* source when its primary key lookup misses (not gated on
   `is_menu_enrichment_source`), searching `self.locations` for an existing row under the same
   `org_id` with matching locality/region and either a matching address or high name
   similarity (the existing fuzzy logic in that function — address match first, then
   `fuzz.token_set_ratio >= 92` on the name — is a reasonable starting point, reuse it).
2. Call this fallback from `get_location()` itself, right before the `INSERT`, for every
   source — not as a special case bolted onto one source's processing path. That removes the
   order-dependency entirely: whichever listing (short-keyed or long-keyed) gets processed
   first, the second one will find it via the fallback regardless of which "side" it's on.
3. Alternatively (simpler, if you'd rather not touch the fallback-matching path): make key
   generation itself consistent — either every source gets the address-suffix treatment when
   an address is available, or no source does, and rely entirely on the fuzzy fallback for
   disambiguating true multi-branch chains within one org+locality (which is what
   `HIGH_VOLUME_SOURCES`'s suffix was originally for — see the existing comment/logic there,
   this was built to stop multiple *distinct* branches in one city from over-collapsing, not
   to create duplicates). Removing the inconsistency is the actual fix; which side you
   standardize on is a judgment call — I'd lean toward "always try the fuzzy fallback before
   creating a new row," since that handles both directions without relying on every source
   agreeing on key shape.
4. **Rebuild** (`npm run build:canonical`) and rerun the scale query above. It should drop
   sharply — verify against the 983 baseline captured today.
5. Add a permanent diagnostic to `print_report()` (there's already a similar one for the
   opposite failure mode — over-collapse — called "suspicious location collapses"; add a
   companion one here) printing the same "org+locality groups with 2+ locations" count on
   every future build, so this doesn't silently regress again without anyone noticing.

## Part 2: genuine origin-db duplication inside `menu_enrichment.sqlite`

This part *does* belong at the origin/staging layer, matching your instinct — just in a
different database than the one you were looking at.

### What I verified

```sql
SELECT website, COUNT(DISTINCT source_url) AS n, GROUP_CONCAT(DISTINCT name) AS names
FROM listings WHERE website IS NOT NULL AND website != ''
GROUP BY website HAVING n >= 2;
```
Run against `data/databases/menu_enrichment.sqlite`: **238 distinct websites** have 2+ rows
under different `source_url` values. Examples: `functionalmedicinelosangeles.com` appears
**14 times**, `advancedptonline.com` **7 times**, `totalorthopt.com` **6 times** — same
business name each time. `listings.source_url` does have a `UNIQUE` constraint (confirmed in
the schema), so these aren't literal re-inserts of the same URL — they're **different pages
on the same clinic's site** (e.g. homepage, `/pricing`, `/services`) each becoming their own
separate `listings` row, rather than being combined into one row per clinic.

This looks like a deviation from the intended design
(`docs/MENU_ENRICHMENT_AGENT_BRIEF.md` specifies "one LLM call per clinic, given the
concatenated page text" from multiple candidate pages — i.e. one row per clinic, not one row
per page). If the scraper is instead writing one row per fetched page, that has two real
costs: (a) it's the origin-level duplication you were worried about, and (b) it likely means
**more LLM calls were spent than necessary** — up to 14x on some clinics — which matters given
efficiency was an explicit goal for this pass at ~20k-entry scale.

### Recommended fix

1. Find and read the actual scraper code (`data_pipeline/scrapers/scrape_menu_enrichment.py`
   or whatever it ended up being named — check `git log`/`ls data_pipeline/scrapers/` for the
   real filename, since it didn't exist when the original brief was written) and confirm
   whether it's writing one `listings` row per fetched page instead of one per clinic. If so,
   that's a scraper bug worth fixing before any further runs — consolidate all fetched pages
   for one clinic into a single LLM call and a single `listings` row, per the original design.
2. For the 238 existing cases already sitting in `menu_enrichment.sqlite`: since these did
   consume separate LLM calls already, don't just delete the extras blindly — check whether
   each row's `services_json` (menu items) differs meaningfully (e.g. the homepage row found
   nothing, the `/pricing` row found the real menu) before consolidating. If one row per
   business already has the good data and the others are empty/redundant, merge into the
   best single row per website and delete the rest **from
   `data/databases/menu_enrichment.sqlite` directly** (this is the actual, correct place for
   the deletion you originally asked about — just in this database, not the one you found the
   symptom in).
3. Once cleaned/consolidated at the origin, rebuild `canonical.db` and confirm each of these
   238 businesses now contributes as a single location, not a location with unnaturally
   duplicated (or now-deduplicated-via-`idx_offerings_dedup`) offerings from redundant rows.

## A separate, unrelated finding worth flagging (not this brief's scope to fix)

While scoping this out I found what looks like a **different** bug: organization `dedup_key
= "elitrahealth.com"` currently has multiple *genuinely different businesses* merged under
one organization — e.g. "Rapha Wellness Center" and "Arctic Cryotherapy Bayonne" (different
names, both in Bayonne NJ), both sourced from `bioedge_clinics`, both attributed to
`elitrahealth.com`. This smells like the same *class* of bug fixed earlier this session for
BodySpec (a shared/platform-level domain getting attributed to individual distinct
businesses — possibly a coworking wellness space whose site lists tenant businesses, with
`bioedge_clinics`'s extraction picking up the platform's domain instead of each tenant's own
site). I did not fully diagnose this — flagging it as a real, separate data-integrity issue
worth a follow-up investigation, not something to fix as part of this brief.

## Verification checklist

- [ ] Baseline captured today: 983 org+locality duplicate-location groups (404 involving
      `menu_enrichment`, 579 pre-existing).
- [ ] After Part 1's fix + rebuild: rerun the scale query, confirm a sharp drop.
- [ ] Craniosacral New Orleans specifically: confirm it's one location row, not two.
- [ ] After Part 2's fix: confirm `menu_enrichment.sqlite`'s per-website `source_url` count
      query returns far fewer than 238 groups, and that consolidated rows retain the best
      available menu data (don't lose real extracted offerings in the merge).
- [ ] New `print_report()` diagnostic (Part 1, step 5) is present and shows a low/zero count
      on a clean rebuild.
