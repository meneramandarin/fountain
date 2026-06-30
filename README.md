# Longevity Yellow Pages Scrapers

This project scrapes longevity clinic/directory sources into one SQLite database per website.

## Setup

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python -m scrapers.scrape
```

Run one source:

```bash
python -m scrapers.scrape --source bookimed_longevity
```

Download one local image per listing after scraping:

```bash
python -m scrapers.download_images --per-listing 1
```

Export SQLite tables to CSV and JSONL:

```bash
python -m scrapers.export_tables
```

Build the merged canonical search database:

```bash
python build_canonical.py
```

Browse the canonical database locally:

```bash
python app.py
```

Or rebuild and serve in one command:

```bash
python app.py --rebuild
```

The viewer prints a local URL, by default `http://127.0.0.1:8000`.

## Repository Notes

This repository tracks the app, scraper/build scripts, schema, taxonomy seed, docs, `canonical.db`, and `unmapped_terms.csv`.

The raw staging SQLite databases in `data/databases/`, downloaded media in `data/media/`, and per-source table exports in `data/exports/<source>/` are generated local artifacts and are intentionally ignored. Several staging databases are larger than GitHub's normal file limit.

## Output

- `data/databases/<source>.sqlite`: one database per website
- `data/exports/<source>/*.jsonl`: exported listing, image, review, and field rows
- `data/exports/<source>/*.csv`: spreadsheet-friendly exports
- `data/media/<source>/`: downloaded local image files when source image URLs are available
- `canonical.db`: merged canonical database for search/browsing
- `unmapped_terms.csv`: treatment/source terms that did not map to the seed taxonomy
- `data/exports/scrape_summary.json`: scrape counts and first errors for the most recent scraper run
- `data/exports/final_inventory.json`: current table counts for every source database
- `DATA_DICTIONARY.md`: source-by-source category fields, counts, and scrape notes

The database stores structured listing fields, images, reviews when exposed, arbitrary extracted fields, and raw page HTML in the `pages` table so fields can be recovered later.
