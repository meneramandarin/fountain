from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable


SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS source_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS pages (
    url TEXT PRIMARY KEY,
    final_url TEXT,
    status_code INTEGER,
    content_type TEXT,
    title TEXT,
    fetched_at TEXT,
    sha256 TEXT,
    html TEXT
);

CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_slug TEXT NOT NULL,
    source_url TEXT NOT NULL UNIQUE,
    name TEXT,
    description TEXT,
    address TEXT,
    locality TEXT,
    region TEXT,
    postal_code TEXT,
    country TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    latitude REAL,
    longitude REAL,
    price_text TEXT,
    rating TEXT,
    review_count TEXT,
    image_url TEXT,
    services_json TEXT,
    procedures_json TEXT,
    raw_text TEXT,
    raw_json TEXT,
    extracted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_fields (
    listing_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    field_value TEXT,
    PRIMARY KEY (listing_id, field_name),
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    image_url TEXT NOT NULL,
    local_path TEXT,
    alt TEXT,
    source_page_url TEXT,
    UNIQUE(listing_id, image_url),
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    reviewer TEXT,
    rating TEXT,
    review_date TEXT,
    body TEXT,
    raw_json TEXT,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);
"""


LISTING_COLUMNS = [
    "source_slug",
    "source_url",
    "name",
    "description",
    "address",
    "locality",
    "region",
    "postal_code",
    "country",
    "phone",
    "email",
    "website",
    "latitude",
    "longitude",
    "price_text",
    "rating",
    "review_count",
    "image_url",
    "services_json",
    "procedures_json",
    "raw_text",
    "raw_json",
    "extracted_at",
]


class SourceDatabase:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def close(self) -> None:
        self.conn.commit()
        self.conn.close()

    def set_metadata(self, items: dict[str, Any]) -> None:
        self.conn.executemany(
            "INSERT OR REPLACE INTO source_metadata(key, value) VALUES (?, ?)",
            [(key, _json_dumps(value)) for key, value in items.items()],
        )
        self.conn.commit()

    def upsert_page(self, page: dict[str, Any]) -> None:
        self.conn.execute(
            """
            INSERT OR REPLACE INTO pages
            (url, final_url, status_code, content_type, title, fetched_at, sha256, html)
            VALUES (:url, :final_url, :status_code, :content_type, :title, :fetched_at, :sha256, :html)
            """,
            page,
        )

    def upsert_listing(self, listing: dict[str, Any]) -> int:
        normalized = {col: listing.get(col) for col in LISTING_COLUMNS}
        for key in ("services_json", "procedures_json", "raw_json"):
            normalized[key] = _json_dumps(normalized.get(key))
        columns = ", ".join(LISTING_COLUMNS)
        placeholders = ", ".join(f":{col}" for col in LISTING_COLUMNS)
        updates = ", ".join(_update_expr(col) for col in LISTING_COLUMNS if col != "source_url")
        self.conn.execute(
            f"""
            INSERT INTO listings ({columns})
            VALUES ({placeholders})
            ON CONFLICT(source_url) DO UPDATE SET {updates}
            """,
            normalized,
        )
        row = self.conn.execute(
            "SELECT id FROM listings WHERE source_url = ?", (listing["source_url"],)
        ).fetchone()
        listing_id = int(row["id"])
        self._replace_fields(listing_id, listing.get("fields", {}))
        images = list(listing.get("images", []) or [])
        if not images and listing.get("image_url"):
            images = [{"url": listing["image_url"], "alt": None, "source_page_url": listing.get("source_url")}]
        self._replace_images(listing_id, images, listing.get("source_url"))
        self._replace_reviews(listing_id, listing.get("reviews", []))
        return listing_id

    def _replace_fields(self, listing_id: int, fields: dict[str, Any]) -> None:
        self.conn.execute("DELETE FROM listing_fields WHERE listing_id = ?", (listing_id,))
        rows = [
            (listing_id, key, _json_dumps(value))
            for key, value in sorted(fields.items())
            if value not in (None, "", [], {})
        ]
        if rows:
            self.conn.executemany(
                "INSERT OR REPLACE INTO listing_fields(listing_id, field_name, field_value) VALUES (?, ?, ?)",
                rows,
            )

    def _replace_images(self, listing_id: int, images: Iterable[dict[str, Any]], source_page_url: str | None) -> None:
        self.conn.execute("DELETE FROM images WHERE listing_id = ?", (listing_id,))
        rows = []
        seen = set()
        for image in images:
            image_url = image.get("url") if isinstance(image, dict) else str(image)
            if not image_url or image_url in seen:
                continue
            seen.add(image_url)
            rows.append(
                (
                    listing_id,
                    image_url,
                    image.get("local_path") if isinstance(image, dict) else None,
                    image.get("alt") if isinstance(image, dict) else None,
                    image.get("source_page_url") if isinstance(image, dict) else source_page_url,
                )
            )
        if rows:
            self.conn.executemany(
                """
                INSERT OR IGNORE INTO images(listing_id, image_url, local_path, alt, source_page_url)
                VALUES (?, ?, ?, ?, ?)
                """,
                rows,
            )

    def _replace_reviews(self, listing_id: int, reviews: Iterable[dict[str, Any]]) -> None:
        self.conn.execute("DELETE FROM reviews WHERE listing_id = ?", (listing_id,))
        rows = []
        for review in reviews:
            if not isinstance(review, dict):
                continue
            rows.append(
                (
                    listing_id,
                    _coerce_text(review.get("reviewer") or review.get("author") or review.get("name")),
                    _coerce_text(review.get("rating") or review.get("reviewRating")),
                    _coerce_text(review.get("review_date") or review.get("datePublished")),
                    _coerce_text(review.get("body") or review.get("reviewBody") or review.get("description")),
                    _json_dumps(review),
                )
            )
        if rows:
            self.conn.executemany(
                """
                INSERT INTO reviews(listing_id, reviewer, rating, review_date, body, raw_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                rows,
            )


def _json_dumps(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def _coerce_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=True, sort_keys=True)
    return str(value)


def _update_expr(col: str) -> str:
    if col in {"raw_text", "description"}:
        return (
            f"{col}=CASE "
            f"WHEN excluded.{col} IS NULL OR excluded.{col} = '' THEN listings.{col} "
            f"WHEN listings.{col} IS NULL OR length(excluded.{col}) > length(listings.{col}) THEN excluded.{col} "
            f"ELSE listings.{col} END"
        )
    return (
        f"{col}=CASE "
        f"WHEN excluded.{col} IS NULL OR excluded.{col} = '' THEN listings.{col} "
        f"ELSE excluded.{col} END"
    )
