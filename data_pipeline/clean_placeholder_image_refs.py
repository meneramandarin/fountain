from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BLOCKLIST = ROOT / "src" / "lib" / "placeholder-image-paths.json"
DEFAULT_CANONICAL_DB = ROOT / "canonical.db"
DEFAULT_DB_DIR = ROOT / "data" / "databases"


def load_blocklist(path: Path) -> list[str]:
    return sorted(set(json.loads(path.read_text())))


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)).fetchone()
    return row is not None


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row[1] == column for row in conn.execute(f"PRAGMA table_info({table})"))


def delete_paths(db_path: Path, paths: list[str], apply: bool) -> int:
    if not db_path.exists():
        return 0
    conn = sqlite3.connect(db_path)
    try:
        if not table_exists(conn, "images") or not column_exists(conn, "images", "local_path"):
            return 0
        total = 0
        for chunk in chunks(paths, 500):
            marks = ",".join("?" for _ in chunk)
            if apply:
                cursor = conn.execute(f"DELETE FROM images WHERE local_path IN ({marks})", chunk)
                total += cursor.rowcount if cursor.rowcount is not None else 0
            else:
                row = conn.execute(f"SELECT COUNT(*) FROM images WHERE local_path IN ({marks})", chunk).fetchone()
                total += int(row[0])
        if apply:
            conn.commit()
        return total
    finally:
        conn.close()


def chunks(items: list[str], size: int):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove known placeholder image references from SQLite image tables.")
    parser.add_argument("--blocklist", type=Path, default=DEFAULT_BLOCKLIST)
    parser.add_argument("--canonical-db", type=Path, default=DEFAULT_CANONICAL_DB)
    parser.add_argument("--db-dir", type=Path, default=DEFAULT_DB_DIR)
    parser.add_argument("--apply", action="store_true", help="Actually delete rows. Without this, only counts matches.")
    args = parser.parse_args()

    paths = load_blocklist(args.blocklist.resolve())
    results: dict[str, int] = {}
    canonical_deleted = delete_paths(args.canonical_db.resolve(), paths, args.apply)
    if canonical_deleted:
        results[str(args.canonical_db)] = canonical_deleted

    for db_path in sorted(args.db_dir.resolve().glob("*.sqlite")):
        deleted = delete_paths(db_path, paths, args.apply)
        if deleted:
            results[str(db_path.relative_to(ROOT))] = deleted

    print(
        json.dumps(
            {
                "mode": "apply" if args.apply else "dry-run",
                "blocklisted_paths": len(paths),
                "matched_rows": sum(results.values()),
                "databases": results,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
