from __future__ import annotations

import argparse
import csv
import hashlib
import json
import multiprocessing as mp
import os
import re
import signal
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from .extract import (
    PRICE_RE,
    canonical_url,
    clean_text,
    collect_links,
    extract_contact_fields,
    extract_json_ld,
    flatten_json_ld,
    page_title,
    soup_from_html,
    visible_text,
)
from .fetch import DEFAULT_HEADERS, Fetcher
from .storage import SourceDatabase


ROOT = Path(__file__).resolve().parents[2]
DB_DIR = ROOT / "data" / "databases"
EXPORT_DIR = ROOT / "data" / "exports"
CANONICAL_DB = ROOT / "canonical.db"
SOURCE_SLUG = "menu_enrichment"
DEFAULT_DB = DB_DIR / "menu_enrichment.sqlite"
DEFAULT_REVIEW_QUEUE = EXPORT_DIR / "menu_enrichment_review_queue.csv"
OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "z-ai/glm-5.2"
MENU_LINK_RE = re.compile(r"\b(price|pricing|service|services|treatment|treatments|menu|rates|fees|shop)\b", re.I)
KNOWN_DIRECTORY_DOMAINS = {
    "bookimed.com",
    "us-uk.bookimed.com",
    "google.com",
    "yelp.com",
    "healthgrades.com",
    "zocdoc.com",
    "webmd.com",
    "sharecare.com",
    "groupon.com",
    "tripadvisor.com",
    "fresha.com",
    "vagaro.com",
    "whatclinic.com",
    "mymeditravel.com",
    "placidway.com",
}
COMMON_PATHS = (
    "/pricing",
    "/price-list",
    "/prices",
    "/services",
    "/treatments",
    "/menu",
    "/contact",
)

EXTRA_SCHEMA = """
CREATE TABLE IF NOT EXISTS run_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase TEXT NOT NULL,
    target_key TEXT,
    url TEXT,
    error TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


@dataclass(frozen=True)
class TargetLocation:
    id: int
    name: str | None
    website: str | None
    address: str | None
    locality: str | None
    region: str | None
    country_code: str | None
    org_id: int | None
    offering_count: int
    priced_count: int
    price_text: str | None

    @property
    def key(self) -> str:
        text = "|".join(
            clean_text(part) or ""
            for part in (
                self.name,
                self.website,
                self.address,
                self.locality,
                self.region,
                self.country_code,
            )
        )
        digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:20]
        return f"menu-enrichment://{digest}"


@dataclass
class PageContext:
    requested_url: str
    final_url: str
    status_code: int
    title: str | None
    text: str
    json_ld: list[dict[str, Any]]
    prices_found: list[str]
    short_text: bool


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    load_dotenv(ROOT / ".env")
    args.model = args.model or os.environ.get("OPENROUTER_MODEL") or DEFAULT_MODEL
    if args.list_targets_only:
        targets = load_worklist(args)
        print_target_list(targets, args)
        return 0
    if not os.environ.get("OPENROUTER_API_KEY"):
        print("OPENROUTER_API_KEY is required for menu enrichment extraction.", file=sys.stderr)
        return 2
    if args.reset and args.db.exists():
        args.db.unlink()
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    db = SourceDatabase(args.db)
    db.conn.executescript(EXTRA_SCHEMA)
    db.set_metadata(
        {
            "name": "Menu enrichment",
            "source_slug": SOURCE_SLUG,
            "scraped_at": now_iso(),
            "seeds": ["canonical.db prioritized locations"],
            "model": args.model,
        }
    )
    review_writer, review_handle = open_review_queue(args.review_queue, append=not args.reset)
    try:
        targets = load_worklist(args)
        fetcher = Fetcher(delay_seconds=args.delay, timeout=args.timeout)
        extractor = MenuExtractor(
            model=args.model,
            max_context_chars=args.max_context_chars,
            llm_timeout=args.llm_timeout,
        )
        stats = {
            "targets": 0,
            "written": 0,
            "flagged": 0,
            "priced_items": 0,
            "menu_items": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "discovered_locations": 0,
        }
        for target in targets:
            stats["targets"] += 1
            if args.skip_existing and listing_exists(db, target.key):
                continue
            try:
                result = process_target(target, db, fetcher, extractor, args)
            except Exception as exc:
                record_error(db, "target", target.key, target.website, repr(exc))
                write_review_row(review_writer, target, ["exception"], None, [], repr(exc))
                stats["flagged"] += 1
                db.conn.commit()
                continue
            stats["input_tokens"] += int(result.get("input_tokens") or 0)
            stats["output_tokens"] += int(result.get("output_tokens") or 0)
            reasons = result["qa_reasons"]
            if reasons:
                write_review_row(review_writer, target, reasons, result.get("extraction"), result.get("pages", []), None)
                stats["flagged"] += 1
            else:
                listing_id = write_listing(db, target, result)
                stats["written"] += 1
                stats["menu_items"] += len(result["menu_items"])
                stats["priced_items"] += sum(1 for item in result["menu_items"] if item.get("price_amount") is not None)
                if args.emit_discovered_locations:
                    stats["discovered_locations"] += write_discovered_locations(db, target, result, listing_id)
            db.conn.commit()
            print_progress(stats, target)
        print_summary(stats, args)
    finally:
        review_handle.close()
        db.close()
    return 0


def print_target_list(targets: list[TargetLocation], args: argparse.Namespace) -> None:
    print(f"targets: {len(targets)}")
    if args.source_slug:
        print(f"source_slugs: {', '.join(args.source_slug)}")
    if args.shard_count is not None:
        print(f"shard: {args.shard_index}/{args.shard_count}")
    for target in targets[:20]:
        print(
            "\t".join(
                [
                    str(target.id),
                    target.name or "",
                    target.locality or "",
                    target.region or "",
                    target.website or "",
                ]
            )
        )


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich canonical locations with clinic-site treatment menus.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--canonical-db", type=Path, default=CANONICAL_DB)
    parser.add_argument("--review-queue", type=Path, default=DEFAULT_REVIEW_QUEUE)
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--pilot", action="store_true", help="Use a roughly even mix of 0-offering and 1-offering targets.")
    parser.add_argument("--skip-existing", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--skip-review-queue", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--skip-db", action="append", type=Path, default=[])
    parser.add_argument("--skip-review-queue-path", action="append", type=Path, default=[])
    parser.add_argument("--retry-review-queue-path", action="append", type=Path, default=[])
    parser.add_argument("--source-slug", action="append", default=[])
    parser.add_argument("--shard-index", type=int)
    parser.add_argument("--shard-count", type=int)
    parser.add_argument("--list-targets-only", action="store_true")
    parser.add_argument("--max-pages", type=int, default=4)
    parser.add_argument("--max-context-chars", type=int, default=65000)
    parser.add_argument("--delay", type=float, default=0.75)
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--llm-timeout", type=int, default=120)
    parser.add_argument("--model")
    parser.add_argument("--disable-search-fallback", action="store_true")
    parser.add_argument("--emit-discovered-locations", action=argparse.BooleanOptionalAction, default=True)
    return parser.parse_args(argv)


def load_worklist(args: argparse.Namespace) -> list[TargetLocation]:
    if not args.canonical_db.exists():
        raise FileNotFoundError(f"canonical database not found: {args.canonical_db}")
    if args.shard_index is not None or args.shard_count is not None:
        if args.shard_index is None or args.shard_count is None:
            raise ValueError("--shard-index and --shard-count must be provided together")
        if args.shard_count < 1 or args.shard_index < 0 or args.shard_index >= args.shard_count:
            raise ValueError("--shard-index must be between 0 and --shard-count - 1")
    reviewed_keys, reviewed_ids = load_reviewed_targets(args.review_queue) if args.skip_review_queue else (set(), set())
    for path in args.skip_review_queue_path:
        extra_keys, extra_ids = load_reviewed_targets(path)
        reviewed_keys.update(extra_keys)
        reviewed_ids.update(extra_ids)
    reviewed_keys.update(load_listing_keys_from_dbs(args.skip_db))
    conn = sqlite3.connect(args.canonical_db)
    conn.row_factory = sqlite3.Row
    try:
        if args.retry_review_queue_path:
            rows = load_retry_rows_from_review_queues(conn, args.retry_review_queue_path)
            return filter_target_rows(rows, reviewed_keys, reviewed_ids, args)
        query_limit = max(args.limit * 5, args.limit + len(reviewed_keys) + len(reviewed_ids))
        source_filter = source_where_clause(args.source_slug)
        if args.pilot:
            zero_limit = max(1, args.limit // 2)
            one_limit = max(0, args.limit - zero_limit)
            rows = list(
                query_worklist(
                    conn,
                    where=combine_where("offering_count = 0", source_filter),
                    source_slugs=args.source_slug,
                    limit=max(zero_limit * 5, zero_limit),
                    offset=args.offset,
                )
            )
            rows.extend(
                query_worklist(
                    conn,
                    where=combine_where("offering_count = 1", source_filter),
                    source_slugs=args.source_slug,
                    limit=max(one_limit * 5, one_limit),
                    offset=args.offset,
                )
            )
            if len(rows) < args.limit:
                seen = {int(row["id"]) for row in rows}
                for row in query_worklist(
                    conn,
                    where=combine_where("1 = 1", source_filter),
                    source_slugs=args.source_slug,
                    limit=query_limit,
                    offset=args.offset,
                ):
                    if int(row["id"]) not in seen:
                        rows.append(row)
                    if len(rows) >= args.limit:
                        break
        else:
            rows = list(
                query_worklist(
                    conn,
                    where=combine_where("1 = 1", source_filter),
                    source_slugs=args.source_slug,
                    limit=query_limit,
                    offset=args.offset,
                )
            )
        return filter_target_rows(rows, reviewed_keys, reviewed_ids, args)
    finally:
        conn.close()


def filter_target_rows(
    rows: list[sqlite3.Row],
    reviewed_keys: set[str],
    reviewed_ids: set[int],
    args: argparse.Namespace,
) -> list[TargetLocation]:
    targets: list[TargetLocation] = []
    seen_targets: set[str] = set()
    for row in rows:
        target = target_from_row(row)
        if target.key in reviewed_keys or target.id in reviewed_ids or target.key in seen_targets:
            continue
        if args.shard_count and stable_shard(target.key, args.shard_count) != args.shard_index:
            continue
        targets.append(target)
        seen_targets.add(target.key)
        if len(targets) >= args.limit:
            break
    return targets


def load_retry_rows_from_review_queues(conn: sqlite3.Connection, paths: list[Path]) -> list[sqlite3.Row]:
    target_ids: list[int] = []
    seen_ids: set[int] = set()
    for path in paths:
        if not path.exists():
            continue
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                target_id = number_or_none(row.get("target_location_id"))
                if target_id is None:
                    continue
                value = int(target_id)
                if value in seen_ids:
                    continue
                seen_ids.add(value)
                target_ids.append(value)
    if not target_ids:
        return []
    rows_by_id: dict[int, sqlite3.Row] = {}
    for index in range(0, len(target_ids), 900):
        batch = target_ids[index : index + 900]
        placeholders = ", ".join("?" for _ in batch)
        rows = conn.execute(
            f"""
            WITH counts AS (
                SELECT l.id, l.name, l.website, l.address, l.locality, l.region, l.country_code,
                       l.org_id, l.price_text,
                       COUNT(o.id) AS offering_count,
                       SUM(CASE WHEN o.price_amount IS NOT NULL THEN 1 ELSE 0 END) AS priced_count
                FROM locations l
                LEFT JOIN offerings o ON o.location_id = l.id
                WHERE l.id IN ({placeholders})
                GROUP BY l.id
            )
            SELECT *
            FROM counts
            """,
            batch,
        )
        rows_by_id.update({int(row["id"]): row for row in rows})
    return [rows_by_id[target_id] for target_id in target_ids if target_id in rows_by_id]


def source_where_clause(source_slugs: list[str]) -> str:
    if not source_slugs:
        return ""
    placeholders = ", ".join("?" for _ in source_slugs)
    return (
        "EXISTS ("
        "SELECT 1 FROM source_records sr "
        "JOIN sources src ON src.id = sr.source_id "
        "WHERE sr.entity_type = 'location' "
        "AND sr.entity_id = counts.id "
        f"AND src.slug IN ({placeholders})"
        ")"
    )


def combine_where(base: str, extra: str) -> str:
    return f"({base}) AND ({extra})" if extra else base


def stable_shard(value: str, shard_count: int) -> int:
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % shard_count


def load_listing_keys_from_dbs(paths: list[Path]) -> set[str]:
    keys: set[str] = set()
    for path in paths:
        if not path.exists():
            continue
        conn = sqlite3.connect(path)
        try:
            rows = conn.execute(
                """
                SELECT source_url
                FROM listings
                WHERE source_url LIKE 'menu-enrichment://%'
                """
            )
            keys.update(row[0] for row in rows if row[0])
        finally:
            conn.close()
    return keys


def query_worklist(
    conn: sqlite3.Connection,
    *,
    where: str,
    source_slugs: list[str],
    limit: int,
    offset: int,
) -> list[sqlite3.Row]:
    params: list[Any] = list(source_slugs)
    params.extend([limit, offset])
    return list(
        conn.execute(
            f"""
            WITH counts AS (
                SELECT l.id, l.name, l.website, l.address, l.locality, l.region, l.country_code,
                       l.org_id, l.price_text,
                       COUNT(o.id) AS offering_count,
                       SUM(CASE WHEN o.price_amount IS NOT NULL THEN 1 ELSE 0 END) AS priced_count
                FROM locations l
                LEFT JOIN offerings o ON o.location_id = l.id
                GROUP BY l.id
            )
            SELECT *
            FROM counts
            WHERE {where}
            ORDER BY
                CASE
                    WHEN offering_count = 0 THEN 1
                    WHEN offering_count = 1 THEN 2
                    WHEN price_text IS NOT NULL AND price_text != '' AND priced_count = 0 THEN 3
                    ELSE 4
                END,
                id
            LIMIT ? OFFSET ?
            """,
            params,
        )
    )


def target_from_row(row: sqlite3.Row) -> TargetLocation:
    return TargetLocation(
        id=int(row["id"]),
        name=row["name"],
        website=row["website"],
        address=row["address"],
        locality=row["locality"],
        region=row["region"],
        country_code=row["country_code"],
        org_id=int(row["org_id"]) if row["org_id"] is not None else None,
        offering_count=int(row["offering_count"] or 0),
        priced_count=int(row["priced_count"] or 0),
        price_text=row["price_text"],
    )


def process_target(
    target: TargetLocation,
    db: SourceDatabase,
    fetcher: Fetcher,
    extractor: "MenuExtractor",
    args: argparse.Namespace,
) -> dict[str, Any]:
    start_url = normalize_url(target.website)
    tried_fallback_search = False
    if start_url and not args.disable_search_fallback and is_known_directory_url(start_url):
        fallback = search_official_site(target)
        tried_fallback_search = True
        start_url = fallback
    if not start_url and not args.disable_search_fallback and not tried_fallback_search:
        start_url = search_official_site(target)
        tried_fallback_search = True
    pages = fetch_candidate_pages(fetcher, db, start_url, max_pages=args.max_pages) if start_url else []
    if (
        not pages
        and target.website
        and not args.disable_search_fallback
        and not tried_fallback_search
        and is_known_directory_url(target.website)
    ):
        fallback = search_official_site(target)
        if fallback and fallback != start_url:
            pages = fetch_candidate_pages(fetcher, db, fallback, max_pages=args.max_pages)
            start_url = fallback
    extraction: dict[str, Any] = {}
    input_tokens = output_tokens = 0
    if pages:
        extraction, usage = extractor.extract(target, pages)
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
    menu_items = normalize_menu_items(extraction.get("menu_items") if extraction else [])
    qa_reasons = qa_check(extraction, pages, menu_items)
    return {
        "start_url": start_url,
        "pages": pages,
        "extraction": extraction,
        "menu_items": menu_items,
        "qa_reasons": qa_reasons,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "model": extractor.model,
    }


def fetch_candidate_pages(fetcher: Fetcher, db: SourceDatabase, start_url: str, *, max_pages: int) -> list[PageContext]:
    pages: list[PageContext] = []
    seen: set[str] = set()
    homepage = normalize_url(start_url)
    if not homepage:
        return pages
    queue = [homepage]
    root = site_root(homepage)
    queue.extend(urljoin(root, path) for path in COMMON_PATHS)
    allowed_domains = {domain_for(homepage)}
    while queue and len(pages) < max_pages:
        url = queue.pop(0)
        if not url or url in seen:
            continue
        seen.add(url)
        try:
            result = fetcher.get(url)
        except requests.RequestException as exc:
            record_error(db, "fetch", None, url, repr(exc))
            if url == homepage:
                return pages
            continue
        db.upsert_page(result.to_page_row())
        if result.status_code >= 400:
            continue
        content_type = (result.content_type or "").lower()
        if "html" not in content_type and not result.text.lstrip().startswith("<"):
            continue
        soup = soup_from_html(result.text)
        text = visible_text(soup) or ""
        json_ld = flatten_json_ld(extract_json_ld(soup))
        contacts = extract_contact_fields(soup, result.final_url)
        pages.append(
            PageContext(
                requested_url=result.url,
                final_url=result.final_url,
                status_code=result.status_code,
                title=page_title(soup),
                text=text,
                json_ld=json_ld,
                prices_found=list(contacts.get("prices_found") or []),
                short_text=len(text) < 500,
            )
        )
        allowed_domains.add(domain_for(result.final_url))
        if len(pages) == 1:
            for link in likely_menu_links(soup, result.final_url, allowed_domains):
                if link not in seen and link not in queue:
                    queue.insert(1, link)
    return pages


def likely_menu_links(soup: Any, page_url: str, allowed_domains: set[str]) -> list[str]:
    links: list[str] = []
    for tag in soup.find_all("a", href=True):
        label = clean_text(tag.get_text(" ") or tag.get("aria-label") or "")
        href = tag["href"].strip()
        if not label or not MENU_LINK_RE.search(label + " " + href):
            continue
        url = strip_fragment(urljoin(page_url, href))
        parsed = urlparse(url)
        if parsed.scheme in {"http", "https"} and parsed.netloc.lower().lstrip("www.") in allowed_domains:
            links.append(url)
    for link in collect_links(soup, page_url, allowed_domains):
        if MENU_LINK_RE.search(link):
            links.append(link)
    return dedupe(links)


def openrouter_post_worker(api_key: str, body: dict[str, Any], timeout: int, queue: Any) -> None:
    try:
        response = requests.post(
            OPENROUTER_CHAT_COMPLETIONS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://fountain.local",
                "X-Title": "Fountain Menu Enrichment",
            },
            json=body,
            timeout=timeout,
        )
        queue.put(("ok", response.status_code, response.text))
    except Exception as exc:
        queue.put(("error", repr(exc), ""))


def post_openrouter_with_hard_timeout(
    url: str,
    *,
    headers: dict[str, str],
    body: dict[str, Any],
    timeout: int,
) -> requests.Response:
    def handle_timeout(signum: int, frame: Any) -> None:
        raise TimeoutError(f"OpenRouter request exceeded {timeout}s")

    previous = signal.signal(signal.SIGALRM, handle_timeout)
    signal.alarm(timeout)
    try:
        return requests.post(url, headers=headers, json=body, timeout=(15, timeout))
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)


class MenuExtractor:
    def __init__(self, *, model: str, max_context_chars: int, llm_timeout: int) -> None:
        self.model = model
        self.max_context_chars = max_context_chars
        self.llm_timeout = llm_timeout

    def extract(self, target: TargetLocation, pages: list[PageContext]) -> tuple[dict[str, Any], dict[str, int]]:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required for menu enrichment extraction")
        response_json = self.request_openrouter(api_key, target, pages, schema_mode=True)
        if not response_json.get("choices"):
            response_json = self.request_openrouter(api_key, target, pages, schema_mode=False)
        content = response_json.get("choices", [{}])[0].get("message", {}).get("content")
        extraction = parse_json_object(content or "") or {}
        usage = response_json.get("usage") or {}
        return extraction, {
            "input_tokens": int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0),
            "output_tokens": int(usage.get("completion_tokens") or usage.get("output_tokens") or 0),
        }

    def request_openrouter(
        self,
        api_key: str,
        target: TargetLocation,
        pages: list[PageContext],
        *,
        schema_mode: bool,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": self.build_prompt(target, pages)},
            ],
            "temperature": 0,
            "max_tokens": 4096,
            "response_format": (
                {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "menu_enrichment",
                        "strict": False,
                        "schema": EXTRACTION_SCHEMA,
                    },
                }
                if schema_mode
                else {"type": "json_object"}
            ),
        }
        response = post_openrouter_with_hard_timeout(
            OPENROUTER_CHAT_COMPLETIONS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://fountain.local",
                "X-Title": "Fountain Menu Enrichment",
            },
            body=body,
            timeout=self.llm_timeout,
        )
        status_code = response.status_code
        if schema_mode and status_code == 400:
            return {}
        if status_code >= 400:
            raise RuntimeError(f"OpenRouter HTTP {status_code}: {response.text[:500]}")
        value = response.json()
        return value if isinstance(value, dict) else {}

    def build_prompt(self, target: TargetLocation, pages: list[PageContext]) -> str:
        payload = {
            "target_location": {
                "name": target.name,
                "website": target.website,
                "address": target.address,
                "locality": target.locality,
                "region": target.region,
                "country_code": target.country_code,
                "current_offering_count": target.offering_count,
            },
            "pages": [
                {
                    "url": page.final_url,
                    "title": page.title,
                    "visible_text": page.text[:14000],
                    "prices_found": page.prices_found[:30],
                    "json_ld": compact_json_ld(page.json_ld),
                }
                for page in pages
            ],
        }
        text = (
            "Return only a JSON object matching this schema, with no markdown fences.\n\n"
            f"Schema:\n{json.dumps(EXTRACTION_SCHEMA, ensure_ascii=True, sort_keys=True)}\n\n"
            f"Input:\n{json.dumps(payload, ensure_ascii=True, sort_keys=True)}"
        )
        if len(text) > self.max_context_chars:
            text = text[: self.max_context_chars] + "\n...[truncated]"
        return text


SYSTEM_PROMPT = """You extract structured treatment menus from a clinic, med spa, wellness, or longevity provider's own website. Return only valid JSON.

Rules:
- confirmed_own_site must be false if the pages look like a directory, marketplace, booking platform, or unrelated business.
- Extract only treatments/services and prices actually present in the supplied page text or JSON-LD.
- Do not invent phone, email, address, currency, quantity, or price.
- Use price_type fixed, starting_at, range, or unknown.
- For a range, set price_amount to the low end and price_max to the high end.
- Keep treatment_name human readable and strip booking/SKU/code fragments that are not real service names.
- Put brand, formulation, package, dose, duration, units, or quantity into brand_or_variant and quantity_or_dose when present.
- source_url must be the page URL where the item or contact detail appeared.
"""


EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "confirmed_own_site": {"type": "boolean"},
        "website": {"type": ["string", "null"]},
        "address": {"type": ["string", "null"]},
        "email": {"type": ["string", "null"]},
        "phone": {"type": ["string", "null"]},
        "menu_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "treatment_name": {"type": ["string", "null"]},
                    "brand_or_variant": {"type": ["string", "null"]},
                    "quantity_or_dose": {"type": ["string", "null"]},
                    "price_amount": {"type": ["number", "null"]},
                    "price_max": {"type": ["number", "null"]},
                    "price_currency": {"type": ["string", "null"]},
                    "price_type": {"type": ["string", "null"], "enum": ["fixed", "starting_at", "range", "unknown", None]},
                    "source_url": {"type": ["string", "null"]},
                    "confidence": {"type": ["string", "null"], "enum": ["high", "medium", "low", None]},
                },
                "required": ["treatment_name", "price_amount", "price_currency", "source_url"],
            },
        },
        "other_locations_mentioned": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "address_text": {"type": ["string", "null"]},
                    "locality": {"type": ["string", "null"]},
                    "region": {"type": ["string", "null"]},
                    "country_code": {"type": ["string", "null"]},
                    "source_url": {"type": ["string", "null"]},
                },
            },
        },
    },
    "required": ["confirmed_own_site", "website", "address", "email", "phone", "menu_items", "other_locations_mentioned"],
}


def normalize_menu_items(items: Any) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        treatment = strip_booking_code(clean_text(item.get("treatment_name")) or "")
        if not treatment:
            continue
        normalized = {
            "treatment_name": treatment,
            "brand_or_variant": strip_booking_code(clean_text(item.get("brand_or_variant")) or "") or None,
            "quantity_or_dose": strip_booking_code(clean_text(item.get("quantity_or_dose")) or "") or None,
            "price_amount": number_or_none(item.get("price_amount")),
            "price_max": number_or_none(item.get("price_max")),
            "price_currency": normalize_currency(item.get("price_currency")),
            "price_type": clean_text(item.get("price_type")) or "unknown",
            "source_url": clean_text(item.get("source_url")),
            "confidence": clean_text(item.get("confidence")) or "medium",
        }
        normalized["raw_name"] = compose_raw_name(normalized)
        key = json.dumps(
            [
                normalized["raw_name"].lower(),
                normalized.get("price_amount"),
                normalized.get("price_max"),
                normalized.get("price_currency"),
            ],
            sort_keys=True,
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(normalized)
    return out


def qa_check(extraction: dict[str, Any], pages: list[PageContext], menu_items: list[dict[str, Any]]) -> list[str]:
    reasons: list[str] = []
    if not pages:
        return ["all_candidate_urls_failed"]
    successful_pages = [page for page in pages if page.status_code < 400]
    if not successful_pages:
        reasons.append("all_candidate_urls_failed")
    if successful_pages and all(page.short_text for page in successful_pages):
        reasons.append("suspiciously_short_visible_text")
    if extraction and extraction.get("confirmed_own_site") is False:
        reasons.append("not_confirmed_own_site")
    if not extraction:
        reasons.append("llm_extraction_empty")
    if extraction and not menu_items:
        reasons.append("zero_menu_items")
    page_text = "\n".join(page.text for page in pages)
    if menu_items and all(item.get("price_amount") is None for item in menu_items) and PRICE_RE.search(page_text):
        reasons.append("currency_seen_but_all_prices_null")
    indistinct: dict[str, int] = {}
    for item in menu_items:
        if item.get("brand_or_variant") or item.get("quantity_or_dose") or item.get("price_amount") is not None:
            continue
        key = (item.get("treatment_name") or "").lower()
        indistinct[key] = indistinct.get(key, 0) + 1
    if any(count >= 2 for count in indistinct.values()):
        reasons.append("duplicate_indistinct_treatment_names")
    if extraction and extraction.get("website"):
        domain = domain_for(str(extraction["website"]))
        if domain in KNOWN_DIRECTORY_DOMAINS:
            reasons.append("website_is_known_directory")
    return dedupe(reasons)


def write_listing(db: SourceDatabase, target: TargetLocation, result: dict[str, Any]) -> int:
    extraction = result["extraction"]
    menu_items = result["menu_items"]
    pages = result["pages"]
    website = clean_text(extraction.get("website")) or result.get("start_url") or target.website
    listing = {
        "source_slug": SOURCE_SLUG,
        "source_url": target.key,
        "name": target.name,
        "description": None,
        "address": clean_text(extraction.get("address")),
        "locality": target.locality,
        "region": target.region,
        "postal_code": None,
        "country": target.country_code,
        "phone": clean_text(extraction.get("phone")),
        "email": clean_text(extraction.get("email")),
        "website": website,
        "latitude": None,
        "longitude": None,
        "price_text": "; ".join(sorted({str(price) for page in pages for price in page.prices_found})) or None,
        "rating": None,
        "review_count": None,
        "image_url": None,
        "services_json": {"menu_items": menu_items},
        "procedures_json": None,
        "raw_text": joined_page_text(pages),
        "raw_json": {
            "extraction": extraction,
            "fetched_urls": [page.final_url for page in pages],
            "input_tokens": result.get("input_tokens"),
            "output_tokens": result.get("output_tokens"),
        },
        "extracted_at": now_iso(),
        "fields": {
            "record_type": "menu_enrichment",
            "target_offering_count": target.offering_count,
            "confirmed_own_site": extraction.get("confirmed_own_site"),
            "menu_item_count": len(menu_items),
            "priced_item_count": sum(1 for item in menu_items if item.get("price_amount") is not None),
            "fetched_urls": [page.final_url for page in pages],
            "llm_model": result.get("model"),
            "input_tokens": result.get("input_tokens"),
            "output_tokens": result.get("output_tokens"),
            "other_locations_mentioned": extraction.get("other_locations_mentioned") or [],
        },
    }
    return db.upsert_listing(listing)


def write_discovered_locations(db: SourceDatabase, target: TargetLocation, result: dict[str, Any], parent_listing_id: int) -> int:
    extraction = result["extraction"]
    locations = extraction.get("other_locations_mentioned") or []
    if not isinstance(locations, list):
        return 0
    written = 0
    for index, location in enumerate(locations):
        if not isinstance(location, dict):
            continue
        address = clean_text(location.get("address_text"))
        locality = clean_text(location.get("locality"))
        region = clean_text(location.get("region"))
        country_code = clean_text(location.get("country_code")) or target.country_code
        if not address or not locality:
            continue
        website = clean_text(extraction.get("website")) or target.website
        key_text = "|".join([domain_for(website or ""), address, locality, region or "", country_code or ""])
        digest = hashlib.sha1(key_text.encode("utf-8")).hexdigest()[:20]
        db.upsert_listing(
            {
                "source_slug": SOURCE_SLUG,
                "source_url": f"menu-enrichment://discovered/{digest}",
                "name": target.name,
                "description": None,
                "address": address,
                "locality": locality,
                "region": region,
                "postal_code": None,
                "country": country_code,
                "phone": clean_text(extraction.get("phone")),
                "email": clean_text(extraction.get("email")),
                "website": website,
                "latitude": None,
                "longitude": None,
                "price_text": None,
                "rating": None,
                "review_count": None,
                "image_url": None,
                "services_json": {"menu_items": []},
                "procedures_json": None,
                "raw_text": None,
                "raw_json": {"parent_listing_id": parent_listing_id, "source_location": location},
                "extracted_at": now_iso(),
                "fields": {
                    "record_type": "discovered_location",
                    "parent_listing_id": parent_listing_id,
                    "source_url": location.get("source_url"),
                },
            }
        )
        written += 1
    return written


def http_get_text_worker(url: str, params: dict[str, str], headers: dict[str, str], timeout: int, queue: Any) -> None:
    try:
        response = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=timeout,
        )
        queue.put(("ok", response.status_code, response.text))
    except Exception as exc:
        queue.put(("error", repr(exc), ""))


def fetch_text_with_hard_timeout(
    url: str,
    *,
    params: dict[str, str],
    headers: dict[str, str],
    timeout: int,
) -> tuple[int, str] | None:
    ctx = mp.get_context("fork")
    queue = ctx.Queue(maxsize=1)
    process = ctx.Process(target=http_get_text_worker, args=(url, params, headers, timeout, queue))
    process.start()
    process.join(timeout)
    if process.is_alive():
        process.terminate()
        process.join(5)
        return None
    if queue.empty():
        return None
    status, first, text = queue.get()
    if status == "error":
        return None
    return int(first), text


def search_official_site(target: TargetLocation) -> str | None:
    query = " ".join(part for part in [target.name, target.locality, target.region, "official website"] if part)
    if not query:
        return None
    response = fetch_text_with_hard_timeout(
        "https://html.duckduckgo.com/html/",
        params={"q": query},
        headers=DEFAULT_HEADERS,
        timeout=8,
    )
    if response is None:
        return None
    status_code, text = response
    if status_code >= 400:
        return None
    soup = soup_from_html(text)
    for tag in soup.select("a.result__a, a[href]"):
        href = tag.get("href")
        if not href:
            continue
        url = normalize_url(href)
        if not url:
            continue
        domain = domain_for(url)
        if domain and domain not in KNOWN_DIRECTORY_DOMAINS:
            return url
    return None


def open_review_queue(path: Path, *, append: bool) -> tuple[csv.DictWriter, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "created_at",
        "target_key",
        "target_location_id",
        "name",
        "website",
        "locality",
        "region",
        "country_code",
        "reasons",
        "fetched_urls",
        "menu_item_count",
        "error",
        "extraction_json",
    ]
    exists = path.exists() and append
    if exists:
        ensure_review_queue_header(path, fieldnames)
    handle = path.open("a" if exists else "w", encoding="utf-8", newline="")
    writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
    if not exists:
        writer.writeheader()
    return writer, handle


def ensure_review_queue_header(path: Path, fieldnames: list[str]) -> None:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames == fieldnames:
            return
        rows = list(reader)
        old_fieldnames = reader.fieldnames or []
    normalized_rows = []
    for row in rows:
        normalized_rows.append({field: row.get(field) for field in fieldnames})
        extras = [row.get(None)] if None in row else []
        if extras and old_fieldnames:
            # If a previous append wrote the new target_key column before the header was
            # migrated, recover the shifted values by position.
            raw_values = [row.get(field) for field in old_fieldnames] + list(extras[0] or [])
            normalized_rows[-1] = {
                field: raw_values[index] if index < len(raw_values) else None
                for index, field in enumerate(fieldnames)
            }
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(normalized_rows)


def write_review_row(
    writer: csv.DictWriter,
    target: TargetLocation,
    reasons: list[str],
    extraction: dict[str, Any] | None,
    pages: list[PageContext],
    error: str | None,
) -> None:
    writer.writerow(
        {
            "created_at": now_iso(),
            "target_key": target.key,
            "target_location_id": target.id,
            "name": target.name,
            "website": target.website,
            "locality": target.locality,
            "region": target.region,
            "country_code": target.country_code,
            "reasons": ";".join(reasons),
            "fetched_urls": json.dumps([page.final_url for page in pages], ensure_ascii=True),
            "menu_item_count": len(extraction.get("menu_items", [])) if isinstance(extraction, dict) else 0,
            "error": error,
            "extraction_json": json.dumps(extraction or {}, ensure_ascii=True, sort_keys=True),
        }
    )


def load_reviewed_targets(path: Path) -> tuple[set[str], set[int]]:
    if not path.exists():
        return set(), set()
    keys: set[str] = set()
    ids: set[int] = set()
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            target_key = clean_text(row.get("target_key"))
            if target_key:
                keys.add(target_key)
            target_id = number_or_none(row.get("target_location_id"))
            if target_id is not None:
                ids.add(int(target_id))
    return keys, ids


def record_error(db: SourceDatabase, phase: str, target_key: str | None, url: str | None, error: str) -> None:
    db.conn.execute(
        """
        INSERT INTO run_errors(phase, target_key, url, error, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (phase, target_key, url, error, now_iso()),
    )


def listing_exists(db: SourceDatabase, source_url: str) -> bool:
    row = db.conn.execute("SELECT 1 FROM listings WHERE source_url = ?", (source_url,)).fetchone()
    return row is not None


def compact_json_ld(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    wanted: list[dict[str, Any]] = []
    for item in items:
        item_type = item.get("@type")
        types = {str(value).lower() for value in (item_type if isinstance(item_type, list) else [item_type]) if value}
        keys = {key.lower() for key in item}
        if types.intersection({"product", "offer", "service", "localbusiness", "medicalbusiness", "medicalclinic"}) or keys.intersection(
            {"offers", "price", "pricespecification", "makesoffer", "hasoffercatalog"}
        ):
            wanted.append(item)
    return wanted[:20]


def compose_raw_name(item: dict[str, Any]) -> str:
    name = strip_booking_code(clean_text(item.get("treatment_name")) or "")
    details = [clean_text(item.get("brand_or_variant")), clean_text(item.get("quantity_or_dose"))]
    details = [strip_booking_code(value) for value in details if value]
    return f"{name} - {', '.join(details)}" if details else name


def strip_booking_code(value: str) -> str:
    text = clean_text(value) or ""
    text = re.sub(r"\s+\b(?:bk|sku|id|code)[\s_-]*[a-z0-9]{3,}\b$", "", text, flags=re.I)
    text = re.sub(r"\s+\b[a-z]{1,4}[\s_-]?\d{4,}\b$", "", text, flags=re.I)
    return clean_text(text) or value


def normalize_url(value: str | None) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    if text.startswith("//"):
        text = "https:" + text
    if not re.match(r"^https?://", text, re.I):
        text = "https://" + text
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return strip_fragment(text)


def site_root(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def domain_for(url: str) -> str:
    parsed = urlparse(normalize_url(url) or "")
    domain = parsed.netloc.lower().split("@")[-1].split(":")[0]
    return domain[4:] if domain.startswith("www.") else domain


def is_known_directory_url(url: str) -> bool:
    domain = domain_for(url)
    return bool(domain and any(domain == blocked or domain.endswith("." + blocked) for blocked in KNOWN_DIRECTORY_DOMAINS))


def strip_fragment(url: str) -> str:
    parsed = urlparse(url)
    return parsed._replace(fragment="").geturl()


def normalize_currency(value: Any) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    text = text.upper()
    symbols = {"$": "USD", "US$": "USD", "€": "EUR", "£": "GBP"}
    return symbols.get(text, text if re.fullmatch(r"[A-Z]{3}", text) else None)


def number_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(match.group(0)) if match else None


def parse_json_object(text: str) -> dict[str, Any] | None:
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        return None
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def joined_page_text(pages: list[PageContext]) -> str | None:
    text = "\n\n".join(f"URL: {page.final_url}\n{page.text}" for page in pages)
    return text[:120000] if text else None


def dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def print_progress(stats: dict[str, int], target: TargetLocation) -> None:
    print(
        f"[{stats['targets']}] {target.name or 'Unknown'} "
        f"written={stats['written']} flagged={stats['flagged']} "
        f"items={stats['menu_items']} priced={stats['priced_items']}",
        flush=True,
    )


def print_summary(stats: dict[str, int], args: argparse.Namespace) -> None:
    print("\nMenu enrichment summary")
    print("=======================")
    print(f"database: {args.db}")
    print(f"review_queue: {args.review_queue}")
    print(f"targets processed: {stats['targets']}")
    print(f"QA-passing listings written: {stats['written']}")
    print(f"flagged for review: {stats['flagged']}")
    print(f"menu items written: {stats['menu_items']} ({stats['priced_items']} priced)")
    print(f"discovered locations written: {stats['discovered_locations']}")
    print(f"LLM tokens: input={stats['input_tokens']}, output={stats['output_tokens']}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
