# External Review Enrichment

External reviews are cached separately from first-party Fountain reviews. They are source-labelled and rendered as external provider groups in the location drawer.

## Google Places

Set the key locally in `.env.local`:

```bash
GOOGLE_MAPS_API_KEY=...
```

The Google Cloud project must have **Places API (New)** enabled.

Run a small controlled batch:

```bash
npm run enrich:google-reviews -- --limit 25
```

Useful options:

```bash
npm run enrich:google-reviews -- --ids 635,843
npm run enrich:google-reviews -- --limit 10 --dry-run
npm run enrich:google-reviews -- --limit 100 --stale-days 30
npm run enrich:google-reviews -- --limit 100 --min-confidence 0.7
npm run enrich:google-reviews -- --limit 1000 --quiet
```

By default, the script targets listings that already have a rating/review count but no first-party review rows. Use `--include-unrated` to broaden it to unrated listings.

The script writes to:

- `external_place_matches`
- `external_reviews`

Google returns only a small review sample per place. Keep Google attribution/source links visible in the UI.
