# Fountain Project Structure

Fountain now has a split between the web application and the data/scraping pipeline.

## Web App

- `src/app/`: Next.js App Router pages and route handlers.
- `src/components/`: React UI components.
- `src/lib/`: server-side database access and query helpers.
- `public/`: static web assets for landing pages and treatment/domain imagery.
- `public/docs/canonical_db_overview.html`: static visual explanation of `canonical.db`.
- `public/docs/schema_diagram.html`: older schema diagram reference.

Run locally:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Canonical Data

- `canonical.db`: merged SQLite database used by the Fountain app.
- `data_pipeline/schema.sql`: canonical SQLite schema.
- `data_pipeline/taxonomy_seed.json`: treatment taxonomy and alias seed.
- `data/exports/unmapped_terms.csv`: review queue for scraped service terms that did not map to canonical treatments.
- `data_pipeline/build_canonical.py`: rebuilds `canonical.db` from source-specific SQLite databases.

Rebuild:

```bash
python data_pipeline/build_canonical.py
```

The same command is available through npm:

```bash
npm run build:canonical
```

## Scraping Pipeline

- `data_pipeline/requirements.txt`: Python dependencies for scraping and canonical rebuilds.
- `data_pipeline/scrapers/`: source configs, fetch/extract/storage helpers, scraping entrypoints, exports, and image download helpers.
- `python -m data_pipeline.scrapers.scrape`: scrape one or more configured sources into separate local databases.
- `python -m data_pipeline.scrapers.export_tables`: export per-source SQLite tables to CSV/JSONL.
- `data/databases/`: local per-source scrape databases. Ignored by Git.
- `data/media/`: local downloaded scrape images. Ignored by Git; the Next app can serve this folder locally through `/media/...`.
- `data/exports/`: generated scrape exports. Everything is ignored by Git except `data/exports/unmapped_terms.csv`.

## Project Name

The package is now named `fountain`. The GitHub repository is already `meneramandarin/fountain`.
