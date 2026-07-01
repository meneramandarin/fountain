from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from pathlib import Path

from .scrape import ROOT


DB_DIR = ROOT / "data" / "databases"
EXPORT_DIR = ROOT / "data" / "exports"
TABLES = ("listings", "images", "reviews", "listing_fields")


def export_database(db_path: Path) -> dict[str, int | str]:
    source_slug = db_path.stem
    export_dir = EXPORT_DIR / source_slug
    export_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    counts: dict[str, int | str] = {"database": str(db_path)}
    for table in TABLES:
        rows = [dict(row) for row in conn.execute(f"SELECT * FROM {table} ORDER BY 1")]
        counts[table] = len(rows)
        write_jsonl(export_dir / f"{table}.jsonl", rows)
        write_csv(export_dir / f"{table}.csv", rows)
    conn.close()
    return counts


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Export scraper SQLite tables to CSV and JSONL.")
    parser.add_argument("--source", action="append", help="Database/source slug. Repeatable. Defaults to all DBs.")
    args = parser.parse_args()
    db_paths = [DB_DIR / f"{source}.sqlite" for source in args.source] if args.source else sorted(DB_DIR.glob("*.sqlite"))
    summaries = []
    for db_path in db_paths:
        if db_path.exists():
            summary = export_database(db_path)
            summaries.append(summary)
            print(summary, flush=True)
    (EXPORT_DIR / "table_export_summary.json").write_text(json.dumps(summaries, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
