from __future__ import annotations

import argparse
import hashlib
import mimetypes
import sqlite3
from pathlib import Path
from urllib.parse import urlparse

import requests

from .scrape import ROOT, slugify


DB_DIR = ROOT / "data" / "databases"
MEDIA_DIR = ROOT / "data" / "media"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
    ),
    "Accept": "image/*,*/*;q=0.8",
}


def download_for_database(db_path: Path, per_listing: int = 1) -> dict[str, int | str]:
    source_slug = db_path.stem
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    backfill_image_rows(conn)
    rows = conn.execute(
        """
        SELECT i.id, i.listing_id, i.image_url, l.name
        FROM images i
        JOIN listings l ON l.id = i.listing_id
        WHERE i.local_path IS NULL OR i.local_path = ''
        ORDER BY i.listing_id, i.id
        """
    ).fetchall()
    downloaded = 0
    attempted = 0
    seen_per_listing: dict[int, int] = {}
    session = requests.Session()
    session.headers.update(HEADERS)
    for row in rows:
        listing_id = int(row["listing_id"])
        if seen_per_listing.get(listing_id, 0) >= per_listing:
            continue
        seen_per_listing[listing_id] = seen_per_listing.get(listing_id, 0) + 1
        attempted += 1
        local_path = download_image(session, source_slug, row["name"] or f"listing-{listing_id}", row["image_url"])
        if not local_path:
            continue
        conn.execute(
            "UPDATE images SET local_path = ? WHERE id = ?",
            (str(local_path.relative_to(ROOT)), row["id"]),
        )
        downloaded += 1
    conn.commit()
    conn.close()
    return {"database": str(db_path), "attempted": attempted, "downloaded": downloaded}


def backfill_image_rows(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        """
        SELECT id, source_url, image_url
        FROM listings
        WHERE image_url IS NOT NULL AND image_url != ''
          AND id NOT IN (SELECT listing_id FROM images WHERE listing_id IS NOT NULL)
        """
    ).fetchall()
    conn.executemany(
        """
        INSERT OR IGNORE INTO images(listing_id, image_url, local_path, alt, source_page_url)
        VALUES (?, ?, NULL, NULL, ?)
        """,
        [(row["id"], row["image_url"], row["source_url"]) for row in rows],
    )
    conn.commit()


def download_image(session: requests.Session, source_slug: str, listing_name: str, image_url: str) -> Path | None:
    if not image_url or image_url.startswith("data:"):
        return None
    try:
        response = session.get(image_url, timeout=20)
    except Exception:
        return None
    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if response.status_code >= 400 or not content_type.startswith("image/"):
        return None
    ext = mimetypes.guess_extension(content_type) or Path(urlparse(image_url).path).suffix or ".img"
    if ext == ".jpe":
        ext = ".jpg"
    digest = hashlib.sha256(image_url.encode("utf-8")).hexdigest()[:12]
    filename = f"{slugify(listing_name)[:80]}-{digest}{ext}"
    path = MEDIA_DIR / source_slug / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(response.content)
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Download one or more images per listing from existing scraper DBs.")
    parser.add_argument("--source", action="append", help="Database/source slug. Repeatable. Defaults to all DBs.")
    parser.add_argument("--per-listing", type=int, default=1)
    args = parser.parse_args()
    db_paths = [DB_DIR / f"{source}.sqlite" for source in args.source] if args.source else sorted(DB_DIR.glob("*.sqlite"))
    for db_path in db_paths:
        if not db_path.exists():
            print({"database": str(db_path), "error": "missing"})
            continue
        print(download_for_database(db_path, per_listing=args.per_listing), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
