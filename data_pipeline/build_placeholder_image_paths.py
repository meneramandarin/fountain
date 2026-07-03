from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "canonical.db"
DEFAULT_OUTPUT = ROOT / "src" / "lib" / "placeholder-image-paths.json"


def image_paths(db_path: Path) -> list[str]:
    conn = sqlite3.connect(db_path)
    try:
        return [
            row[0]
            for row in conn.execute(
                """
                SELECT DISTINCT local_path
                FROM images
                WHERE local_path IS NOT NULL AND local_path <> ''
                ORDER BY local_path
                """
            )
        ]
    finally:
        conn.close()


def sha256(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def existing_paths(output_path: Path) -> set[str]:
    if not output_path.exists():
        return set()
    return set(json.loads(output_path.read_text()))


def build_blocklist(db_path: Path, output_path: Path, min_duplicates: int, preserve_existing: bool) -> list[str]:
    paths_by_hash: dict[str, list[str]] = {}
    missing = 0
    for relative_path in image_paths(db_path):
        digest = sha256(ROOT / relative_path)
        if digest is None:
            missing += 1
            continue
        paths_by_hash.setdefault(digest, []).append(relative_path)

    blocked = existing_paths(output_path) if preserve_existing else set()
    for paths in paths_by_hash.values():
        if len(paths) >= min_duplicates:
            blocked.update(paths)

    result = sorted(blocked)
    output_path.write_text(format_json_lines(result))
    print(
        json.dumps(
            {
                "db": str(db_path),
                "output": str(output_path),
                "paths": len(result),
                "duplicate_groups": sum(1 for paths in paths_by_hash.values() if len(paths) >= min_duplicates),
                "missing_files": missing,
                "min_duplicates": min_duplicates,
                "preserve_existing": preserve_existing,
            },
            indent=2,
        )
    )
    return result


def format_json_lines(paths: list[str]) -> str:
    if not paths:
        return "[]\n"
    lines = ["["]
    for index, path in enumerate(paths):
        suffix = "," if index < len(paths) - 1 else ""
        lines.append(f"{json.dumps(path)}{suffix}")
    lines.append("]")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build the listing image blocklist for generic repeated placeholder images."
    )
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--min-duplicates",
        type=int,
        default=10,
        help="Block exact image bytes when they are used by at least this many local paths.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace the existing blocklist instead of preserving manually blocked paths.",
    )
    args = parser.parse_args()
    build_blocklist(
        db_path=args.db.resolve(),
        output_path=args.output.resolve(),
        min_duplicates=args.min_duplicates,
        preserve_existing=not args.replace,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
