# Service Discovery Scraper

`data_pipeline/scrapers/scrape_service_discovery.py` discovers new US provider locations by
running a static category x metro search matrix, fetching candidate provider websites, and
using the same clinic-site LLM extraction/QA pattern as menu enrichment. It writes sharded
staging databases:

```text
data/databases/service_discovery_{i}.sqlite
data/exports/service_discovery_review_queue_{i}.csv
```

Chain scrapes use:

```text
data/databases/chain_{slug}.sqlite
data/exports/chain_{slug}_review_queue.csv
```

`build_canonical.py` routes both `service_discovery_*` and `chain_*` source slugs through
the menu-item branch. Dedup is still handled by website domain plus locality/region; do not
write directly to `canonical.db`.

## Requirements

```bash
pip install -r data_pipeline/requirements.txt
export OPENROUTER_API_KEY=...
```

Optional:

```bash
export OPENROUTER_MODEL=z-ai/glm-5.2
```

## Pilot

The brief's pilot cell is `hbot x Austin`:

```bash
npm run scrape:service-discovery -- --reset --category hbot --metro austin --max-cells 1 --max-candidates-per-query 5
```

Inspect:

```bash
sqlite3 data/databases/service_discovery_0.sqlite 'select name, locality, region, website from listings limit 20;'
```

## Full Swarm

Static worker assignment uses `(category x metro) index % worker_count`.

```bash
npm run scrape:service-discovery:swarm -- --workers 30 --reset
```

For a smaller overnight run:

```bash
npm run scrape:service-discovery:swarm -- --workers 8 --max-candidates-per-query 6
```

## Chain Scrapes

Run all configured chains:

```bash
npm run scrape:chain-locations -- --reset
```

Run one chain:

```bash
npm run scrape:chain-locations -- --reset --chain bodyspec
```

## QA Behavior

Rows are sent to the per-worker review queue when:

- no candidate pages could be fetched,
- the extracted page is not confirmed as the provider's own site,
- all fetched pages have suspiciously short visible text,
- extraction returned zero menu items,
- page text contains currency but all extracted prices are null,
- duplicate treatment labels have no variant/dose/price detail,
- the extracted website is a known directory or marketplace.

The review queue is intentionally a Tier-2 backlog; the discovery worker does not retry
failed rows during the overnight run.

## Output Fields

The staging listing row contains normal provider fields plus:

- `services_json.menu_items`: raw treatment labels, canonical category IDs, prices, and source URLs.
- `services_json.categories_offered`: canonical IDs detected for the provider.
- `listing_fields.booking_mechanism`: `online_widget`, `contact_form`, `phone_only`, or `unknown`.
- `listing_fields.booking_platform`: detected booking platform when visible.
- `listing_fields.membership_model`: `membership_required`, `membership_optional`, `a_la_carte`, or `unknown`.
- `listing_fields.price_scope`: `location` or `chain_default`.

## Reporting

After a run, get a quick cell matrix from staging:

```sql
SELECT lf_cat.field_value AS category_json,
       lf_metro.field_value AS metro_json,
       COUNT(*) AS listings
FROM listings l
JOIN listing_fields lf_cat ON lf_cat.listing_id = l.id AND lf_cat.field_name = 'cell_category_id'
JOIN listing_fields lf_metro ON lf_metro.listing_id = l.id AND lf_metro.field_name = 'cell_metro_id'
GROUP BY lf_cat.field_value, lf_metro.field_value
ORDER BY lf_cat.field_value, lf_metro.field_value;
```
