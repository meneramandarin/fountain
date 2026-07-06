from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import signal
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests

from .extract import PRICE_RE, clean_text, soup_from_html
from .fetch import DEFAULT_HEADERS, Fetcher
from .scrape_menu_enrichment import (
    EXTRACTION_SCHEMA as MENU_ITEM_SCHEMA,
    KNOWN_DIRECTORY_DOMAINS,
    PageContext,
    compact_json_ld,
    domain_for,
    fetch_candidate_pages,
    joined_page_text,
    normalize_menu_items,
    normalize_url,
    parse_json_object,
    post_openrouter_with_hard_timeout,
    qa_check,
)
from .storage import SourceDatabase


ROOT = Path(__file__).resolve().parents[2]
DB_DIR = ROOT / "data" / "databases"
EXPORT_DIR = ROOT / "data" / "exports"
OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "z-ai/glm-5.2"
SOURCE_PREFIX = "service_discovery"
DUCKDUCKGO_HTML = "https://html.duckduckgo.com/html/"
YAHOO_SEARCH = "https://search.yahoo.com/search"

BOOKING_PLATFORMS = (
    "mindbody",
    "vagaro",
    "fresha",
    "boulevard",
    "janeapp",
    "zenoti",
    "acuity",
    "squarespace-scheduling",
    "glossgenius",
    "calendly",
    "other",
)

SKIP_DOMAIN_SUFFIXES = KNOWN_DIRECTORY_DOMAINS | {
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "tiktok.com",
    "reddit.com",
    "duckduckgo.com",
    "bing.com",
    "search.yahoo.com",
    "r.search.yahoo.com",
    "bbb.org",
    "mapquest.com",
    "yellowpages.com",
    "patch.com",
    "prnewswire.com",
}

CATEGORIES: dict[str, tuple[str, ...]] = {
    "iv_therapy": ("IV therapy", "IV drip", "vitamin infusion", "IV hydration", "IV bar", "drip bar"),
    "nad_plus": ("NAD+ IV", "NAD infusion", "NAD therapy", "NAD drip"),
    "dexa": ("DEXA scan", "DXA", "body composition scan", "bone density scan"),
    "vo2max": ("VO2 max test", "metabolic testing", "CPET", "cardiopulmonary exercise test", "exercise physiology lab", "RMR testing"),
    "hbot": ("hyperbaric oxygen therapy", "HBOT", "hyperbaric chamber", "mild hyperbaric", "oxygen therapy"),
    "full_body_mri": ("full body MRI", "whole body MRI", "preventive MRI scan"),
    "coronary_calcium_ct": ("coronary calcium score", "calcium score CT", "heart scan"),
    "cryotherapy": ("cryotherapy", "whole body cryo", "cryo chamber"),
    "cold_plunge": ("cold plunge", "ice bath studio", "contrast therapy"),
    "red_light": ("red light therapy", "photobiomodulation", "infrared light therapy"),
    "infrared_sauna": ("infrared sauna", "sauna studio"),
}

METROS: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "nyc": ("New York", "NY", ("New York City", "Manhattan", "Brooklyn", "Williamsburg", "Upper East Side", "SoHo", "Tribeca")),
    "la": ("Los Angeles", "CA", ("Los Angeles", "Santa Monica", "Venice", "West Hollywood", "Beverly Hills", "Newport Beach", "Pasadena")),
    "miami": ("Miami", "FL", ("Miami", "Miami Beach", "Brickell", "Coral Gables", "Fort Lauderdale", "Boca Raton")),
    "sf_bay": ("San Francisco", "CA", ("San Francisco", "Marina San Francisco", "Palo Alto", "San Jose", "Oakland", "Marin")),
    "austin": ("Austin", "TX", ("Austin",)),
    "dallas": ("Dallas", "TX", ("Dallas", "Plano", "Frisco", "Southlake")),
    "houston": ("Houston", "TX", ("Houston", "The Woodlands")),
    "phoenix_scottsdale": ("Scottsdale", "AZ", ("Phoenix", "Scottsdale", "Paradise Valley", "Tempe", "Gilbert")),
    "san_diego": ("San Diego", "CA", ("San Diego", "La Jolla", "Del Mar", "Encinitas")),
    "denver": ("Denver", "CO", ("Denver", "Boulder", "Cherry Creek")),
}

EXTRA_SCHEMA = """
CREATE TABLE IF NOT EXISTS search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL UNIQUE,
    category_id TEXT NOT NULL,
    metro_id TEXT NOT NULL,
    city_term TEXT,
    status_code INTEGER,
    result_count INTEGER DEFAULT 0,
    fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_id INTEGER NOT NULL,
    rank INTEGER,
    title TEXT,
    url TEXT NOT NULL,
    snippet TEXT,
    fetched_at TEXT NOT NULL,
    UNIQUE(query_id, url),
    FOREIGN KEY (query_id) REFERENCES search_queries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase TEXT NOT NULL,
    target_key TEXT,
    url TEXT,
    query TEXT,
    error TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


@dataclass(frozen=True)
class DiscoveryCell:
    category_id: str
    metro_id: str
    locality: str
    region: str
    city_terms: tuple[str, ...]

    @property
    def key(self) -> str:
        return f"{self.category_id}:{self.metro_id}"


@dataclass(frozen=True)
class CandidateBusiness:
    title: str | None
    url: str
    snippet: str | None
    cell: DiscoveryCell
    query: str

    @property
    def key(self) -> str:
        digest = hashlib.sha1(f"{self.cell.key}|{domain_for(self.url)}|{self.url}".encode("utf-8")).hexdigest()[:20]
        return f"service-discovery://{digest}"


@dataclass(frozen=True)
class ExistingCanonicalLocation:
    domain: str
    locality: str | None
    region: str | None
    offering_count: int
    priced_count: int


class DiscoveryExtractor:
    def __init__(self, *, model: str, max_context_chars: int, llm_timeout: int) -> None:
        self.model = model
        self.max_context_chars = max_context_chars
        self.llm_timeout = llm_timeout

    def extract(self, candidate: CandidateBusiness, pages: list[PageContext]) -> tuple[dict[str, Any], dict[str, int]]:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required for service discovery extraction")
        response_json = self.request_openrouter(api_key, candidate, pages, schema_mode=True)
        if not response_json.get("choices"):
            response_json = self.request_openrouter(api_key, candidate, pages, schema_mode=False)
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
        candidate: CandidateBusiness,
        pages: list[PageContext],
        *,
        schema_mode: bool,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": self.build_prompt(candidate, pages)},
            ],
            "temperature": 0,
            "max_tokens": 5000,
            "response_format": (
                {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "service_discovery",
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
                "X-Title": "Fountain Service Discovery",
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

    def build_prompt(self, candidate: CandidateBusiness, pages: list[PageContext]) -> str:
        payload = {
            "target": {
                "search_title": candidate.title,
                "search_url": candidate.url,
                "search_snippet": candidate.snippet,
                "query": candidate.query,
                "category_id": candidate.cell.category_id,
                "category_synonyms": CATEGORIES[candidate.cell.category_id],
                "metro_id": candidate.cell.metro_id,
                "default_locality": candidate.cell.locality,
                "default_region": candidate.cell.region,
            },
            "allowed_category_ids": sorted(CATEGORIES),
            "booking_platforms": BOOKING_PLATFORMS,
            "pages": [
                {
                    "url": page.final_url,
                    "title": page.title,
                    "visible_text": page.text[:14000],
                    "prices_found": page.prices_found[:40],
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


SYSTEM_PROMPT = """You extract service discovery listings from a provider's own website. Return only valid JSON.

Rules:
- confirmed_own_site must be false if the pages are a directory, marketplace, search result, social profile, or unrelated business.
- This is provider discovery for longevity and wellness services. Extract only real provider locations.
- Preserve the provider's own service labels in raw_label. Also map each label to the best canonical category id from the allowed list.
- categories_offered may include multiple allowed category ids if the provider clearly offers them.
- booking_mechanism must be one of online_widget, contact_form, phone_only, or unknown.
- booking_platform must use the supplied platform list when visible in scripts, links, iframes, or page text; otherwise null.
- membership_model must be membership_required, membership_optional, a_la_carte, or unknown.
- price_scope is location when prices are clearly location-specific, otherwise chain_default when copied from a chain/global menu.
- Null is better than guessing for address, email, phone, price, currency, and booking fields.
"""

MENU_ITEM_PROPERTIES = dict(MENU_ITEM_SCHEMA["properties"]["menu_items"]["items"]["properties"])
MENU_ITEM_PROPERTIES["canonical_id"] = {"type": ["string", "null"], "enum": sorted(CATEGORIES) + [None]}
MENU_ITEM_PROPERTIES["raw_label"] = {"type": ["string", "null"]}

EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "confirmed_own_site": {"type": "boolean"},
        "business_name": {"type": ["string", "null"]},
        "website": {"type": ["string", "null"]},
        "address": {"type": ["string", "null"]},
        "locality": {"type": ["string", "null"]},
        "region": {"type": ["string", "null"]},
        "postal_code": {"type": ["string", "null"]},
        "email": {"type": ["string", "null"]},
        "phone": {"type": ["string", "null"]},
        "booking_mechanism": {"type": ["string", "null"], "enum": ["online_widget", "contact_form", "phone_only", "unknown", None]},
        "booking_platform": {"type": ["string", "null"], "enum": list(BOOKING_PLATFORMS) + [None]},
        "membership_model": {"type": ["string", "null"], "enum": ["membership_required", "membership_optional", "a_la_carte", "unknown", None]},
        "categories_offered": {"type": "array", "items": {"type": "string", "enum": sorted(CATEGORIES)}},
        "price_scope": {"type": ["string", "null"], "enum": ["location", "chain_default", None]},
        "menu_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": MENU_ITEM_PROPERTIES,
                "required": ["treatment_name", "price_amount", "price_currency", "source_url"],
            },
        },
    },
    "required": [
        "confirmed_own_site",
        "business_name",
        "website",
        "address",
        "locality",
        "region",
        "postal_code",
        "email",
        "phone",
        "booking_mechanism",
        "booking_platform",
        "membership_model",
        "categories_offered",
        "price_scope",
        "menu_items",
    ],
}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / ".env.local")
    args.model = args.model or os.environ.get("OPENROUTER_MODEL") or DEFAULT_MODEL
    if args.list_cells:
        for cell in assigned_cells(args):
            print(cell.key)
        return 0
    if not os.environ.get("OPENROUTER_API_KEY"):
        print("OPENROUTER_API_KEY is required for service discovery extraction.", file=sys.stderr)
        return 2
    if args.reset and args.db.exists():
        args.db.unlink()
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    db = SourceDatabase(args.db)
    db.conn.executescript(EXTRA_SCHEMA)
    source_slug = f"{SOURCE_PREFIX}_{args.worker_index}"
    db.set_metadata(
        {
            "name": f"Service discovery worker {args.worker_index}",
            "source_slug": source_slug,
            "scraped_at": now_iso(),
            "model": args.model,
            "worker_index": args.worker_index,
            "worker_count": args.worker_count,
        }
    )
    review_writer, review_handle = open_review_queue(args.review_queue, append=not args.reset)
    try:
        reviewed_keys = load_reviewed_keys(args.review_queue) if args.skip_review_queue else set()
        fetcher = Fetcher(delay_seconds=args.delay, timeout=args.timeout)
        extractor = DiscoveryExtractor(model=args.model, max_context_chars=args.max_context_chars, llm_timeout=args.llm_timeout)
        canonical_index = load_canonical_index(args)
        stats = {
            "cells": 0,
            "candidates": 0,
            "written": 0,
            "flagged": 0,
            "skipped_canonical": 0,
            "menu_items": 0,
            "priced_items": 0,
            "input_tokens": 0,
            "output_tokens": 0,
        }
        for cell in assigned_cells(args):
            stats["cells"] += 1
            candidates = discover_candidates(db, cell, args)
            for candidate in candidates:
                if candidate.key in reviewed_keys:
                    continue
                if args.skip_existing and listing_exists(db, candidate.key):
                    continue
                if should_skip_existing_canonical(candidate, canonical_index, args):
                    stats["skipped_canonical"] += 1
                    continue
                stats["candidates"] += 1
                try:
                    result = process_candidate(candidate, db, fetcher, extractor, args)
                except Exception as exc:
                    record_error(db, "candidate", candidate.key, candidate.url, candidate.query, repr(exc))
                    write_review_row(review_writer, candidate, ["exception"], None, [], repr(exc))
                    reviewed_keys.add(candidate.key)
                    stats["flagged"] += 1
                    db.conn.commit()
                    continue
                stats["input_tokens"] += int(result.get("input_tokens") or 0)
                stats["output_tokens"] += int(result.get("output_tokens") or 0)
                if result["qa_reasons"]:
                    write_review_row(review_writer, candidate, result["qa_reasons"], result.get("extraction"), result.get("pages", []), None)
                    reviewed_keys.add(candidate.key)
                    stats["flagged"] += 1
                else:
                    write_listing(db, source_slug, candidate, result)
                    stats["written"] += 1
                    stats["menu_items"] += len(result["menu_items"])
                    stats["priced_items"] += sum(1 for item in result["menu_items"] if item.get("price_amount") is not None)
                db.conn.commit()
                print_progress(stats, candidate)
        print_summary(stats, args)
    finally:
        review_handle.close()
        db.close()
    return 0


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Discover new provider locations by category/city search cells.")
    parser.add_argument("--worker-index", type=int, default=0)
    parser.add_argument("--worker-count", type=int, default=1)
    parser.add_argument("--db", type=Path)
    parser.add_argument("--review-queue", type=Path)
    parser.add_argument("--canonical-db", type=Path, default=ROOT / "canonical.db")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--category", action="append", choices=sorted(CATEGORIES), default=[])
    parser.add_argument("--metro", action="append", choices=sorted(METROS), default=[])
    parser.add_argument("--max-cells", type=int)
    parser.add_argument("--max-candidates-per-query", type=int, default=8)
    parser.add_argument("--max-pages", type=int, default=4)
    parser.add_argument("--max-context-chars", type=int, default=65000)
    parser.add_argument("--delay", type=float, default=0.75)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--llm-timeout", type=int, default=120)
    parser.add_argument("--model")
    parser.add_argument("--skip-existing", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--skip-review-queue", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--skip-canonical-existing", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--canonical-min-offerings", type=int, default=2)
    parser.add_argument("--canonical-min-priced", type=int, default=1)
    parser.add_argument("--list-cells", action="store_true")
    args = parser.parse_args(argv)
    if args.worker_count < 1 or args.worker_index < 0 or args.worker_index >= args.worker_count:
        raise ValueError("--worker-index must be between 0 and --worker-count - 1")
    args.db = args.db or DB_DIR / f"service_discovery_{args.worker_index}.sqlite"
    args.review_queue = args.review_queue or EXPORT_DIR / f"service_discovery_review_queue_{args.worker_index}.csv"
    return args


def assigned_cells(args: argparse.Namespace) -> list[DiscoveryCell]:
    categories = args.category or sorted(CATEGORIES)
    metros = args.metro or list(METROS)
    cells: list[DiscoveryCell] = []
    index = 0
    for category_id in categories:
        for metro_id in metros:
            locality, region, city_terms = METROS[metro_id]
            if index % args.worker_count == args.worker_index:
                cells.append(DiscoveryCell(category_id, metro_id, locality, region, city_terms))
            index += 1
    return cells[: args.max_cells] if args.max_cells else cells


def discover_candidates(db: SourceDatabase, cell: DiscoveryCell, args: argparse.Namespace) -> list[CandidateBusiness]:
    candidates: list[CandidateBusiness] = []
    seen_domains: set[str] = set()
    for synonym in CATEGORIES[cell.category_id]:
        for city_term in cell.city_terms:
            query = f"{synonym} {city_term} {cell.region}"
            results = search_duckduckgo(query, args.timeout, args.max_candidates_per_query)
            query_id = record_search_query(db, query, cell, city_term, 200 if results else None, len(results))
            for result in results:
                url = result["url"]
                domain = domain_for(url)
                if not domain or domain_is_blocked(domain) or domain in seen_domains:
                    continue
                seen_domains.add(domain)
                record_search_result(db, query_id, result)
                candidates.append(CandidateBusiness(result.get("title"), url, result.get("snippet"), cell, query))
    return candidates


def load_canonical_index(args: argparse.Namespace) -> dict[str, list[ExistingCanonicalLocation]]:
    if not args.skip_canonical_existing or not args.canonical_db.exists():
        return {}
    conn = sqlite3.connect(args.canonical_db)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT o.website_domain AS domain,
                   l.locality,
                   l.region,
                   COUNT(ofr.id) AS offering_count,
                   SUM(CASE WHEN ofr.price_amount IS NOT NULL THEN 1 ELSE 0 END) AS priced_count
            FROM organizations o
            JOIN locations l ON l.org_id = o.id
            LEFT JOIN offerings ofr ON ofr.location_id = l.id
            WHERE o.website_domain IS NOT NULL
              AND o.website_domain != ''
            GROUP BY o.website_domain, l.id
            """
        )
        index: dict[str, list[ExistingCanonicalLocation]] = {}
        for row in rows:
            domain = clean_text(row["domain"])
            if not domain:
                continue
            index.setdefault(domain, []).append(
                ExistingCanonicalLocation(
                    domain=domain,
                    locality=clean_text(row["locality"]),
                    region=clean_text(row["region"]),
                    offering_count=int(row["offering_count"] or 0),
                    priced_count=int(row["priced_count"] or 0),
                )
            )
        return index
    finally:
        conn.close()


def should_skip_existing_canonical(
    candidate: CandidateBusiness,
    index: dict[str, list[ExistingCanonicalLocation]],
    args: argparse.Namespace,
) -> bool:
    if not index:
        return False
    domain = domain_for(candidate.url)
    if not domain:
        return False
    matches = index.get(domain, [])
    if not matches:
        matches = [
            location
            for canonical_domain, locations in index.items()
            if domain.endswith("." + canonical_domain)
            for location in locations
        ]
    if not matches:
        return False
    locality_terms = {normalize_place_token(candidate.cell.locality), *(normalize_place_token(term) for term in candidate.cell.city_terms)}
    locality_terms.discard("")
    for location in matches:
        if candidate.cell.region and location.region and location.region.upper() != candidate.cell.region.upper():
            continue
        location_locality = normalize_place_token(location.locality)
        if locality_terms and location_locality and location_locality not in locality_terms:
            continue
        if location.priced_count >= args.canonical_min_priced or location.offering_count >= args.canonical_min_offerings:
            return True
    return False


def normalize_place_token(value: str | None) -> str:
    text = clean_text(value) or ""
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def search_duckduckgo(query: str, timeout: int, limit: int) -> list[dict[str, Any]]:
    try:
        response = get_with_hard_timeout(DUCKDUCKGO_HTML, params={"q": query}, timeout=timeout)
    except requests.RequestException:
        return search_yahoo(query, timeout, limit)
    if response.status_code >= 400:
        return []
    soup = soup_from_html(response.text)
    rows: list[dict[str, Any]] = []
    for rank, node in enumerate(soup.select(".result, .web-result"), start=1):
        anchor = node.select_one("a.result__a") or node.find("a", href=True)
        if not anchor:
            continue
        url = unwrap_search_url(anchor.get("href") or "")
        if not url:
            continue
        snippet = clean_text((node.select_one(".result__snippet") or node).get_text(" "))
        rows.append({"rank": rank, "title": clean_text(anchor.get_text(" ")), "url": url, "snippet": snippet})
        if len(rows) >= limit:
            break
    return rows or search_yahoo(query, timeout, limit)


def search_yahoo(query: str, timeout: int, limit: int) -> list[dict[str, Any]]:
    try:
        response = get_with_hard_timeout(YAHOO_SEARCH, params={"p": query}, timeout=timeout)
    except requests.RequestException:
        return []
    if response.status_code >= 400:
        return []
    soup = soup_from_html(response.text)
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for block in soup.select("div.algo"):
        anchor = block.select_one("a")
        if not anchor:
            continue
        url = unwrap_search_url(anchor.get("href") or "")
        if not url or url in seen:
            continue
        seen.add(url)
        snippet_tag = block.select_one(".compText, .fc-falcon, p")
        rows.append(
            {
                "rank": len(rows) + 1,
                "title": clean_text(anchor.get_text(" ")),
                "url": url,
                "snippet": clean_text(snippet_tag.get_text(" ")) if snippet_tag else None,
            }
        )
        if len(rows) >= limit:
            break
    return rows


def get_with_hard_timeout(url: str, *, params: dict[str, str], timeout: int) -> requests.Response:
    def handle_timeout(signum: int, frame: Any) -> None:
        raise requests.Timeout(f"GET exceeded {timeout}s: {url}")

    previous = signal.signal(signal.SIGALRM, handle_timeout)
    signal.alarm(timeout)
    try:
        return requests.get(url, params=params, headers=DEFAULT_HEADERS, timeout=(8, timeout))
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)


def unwrap_search_url(url: str) -> str | None:
    parsed = urlparse(url)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        target = parse_qs(parsed.query).get("uddg", [None])[0]
        return normalize_url(target)
    if parsed.netloc.endswith("search.yahoo.com") or parsed.netloc.endswith("r.search.yahoo.com"):
        match = re.search(r"/RU=([^/]+)", url)
        if match:
            return normalize_url(parse_qs(f"u={match.group(1)}")["u"][0])
    return normalize_url(url)


def process_candidate(
    candidate: CandidateBusiness,
    db: SourceDatabase,
    fetcher: Fetcher,
    extractor: DiscoveryExtractor,
    args: argparse.Namespace,
) -> dict[str, Any]:
    pages = fetch_candidate_pages(fetcher, db, candidate.url, max_pages=args.max_pages)
    extraction: dict[str, Any] = {}
    input_tokens = output_tokens = 0
    if pages:
        extraction, usage = extractor.extract(candidate, pages)
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
    menu_items = normalize_discovery_menu_items(extraction.get("menu_items") if extraction else [], candidate.cell)
    qa_reasons = qa_check(extraction, pages, menu_items)
    if extraction and not clean_text(extraction.get("business_name")):
        qa_reasons.append("missing_business_name")
    if extraction and not (clean_text(extraction.get("website")) or pages):
        qa_reasons.append("missing_website")
    return {
        "pages": pages,
        "extraction": extraction,
        "menu_items": menu_items,
        "qa_reasons": dedupe(qa_reasons),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "model": extractor.model,
    }


def normalize_discovery_menu_items(items: Any, cell: DiscoveryCell) -> list[dict[str, Any]]:
    normalized = normalize_menu_items(items)
    original = items if isinstance(items, list) else []
    for index, item in enumerate(normalized):
        source = original[index] if index < len(original) and isinstance(original[index], dict) else {}
        item["canonical_id"] = clean_text(source.get("canonical_id")) if source.get("canonical_id") in CATEGORIES else cell.category_id
        item["raw_label"] = clean_text(source.get("raw_label")) or item.get("treatment_name")
    return normalized


def write_listing(db: SourceDatabase, source_slug: str, candidate: CandidateBusiness, result: dict[str, Any]) -> int:
    extraction = result["extraction"]
    pages = result["pages"]
    menu_items = result["menu_items"]
    categories = normalize_categories(extraction.get("categories_offered"), candidate.cell.category_id)
    website = clean_text(extraction.get("website")) or (pages[0].final_url if pages else candidate.url)
    listing = {
        "source_slug": source_slug,
        "source_url": candidate.key,
        "name": clean_text(extraction.get("business_name")) or candidate.title or domain_for(candidate.url),
        "description": None,
        "address": clean_text(extraction.get("address")),
        "locality": clean_text(extraction.get("locality")) or candidate.cell.locality,
        "region": clean_text(extraction.get("region")) or candidate.cell.region,
        "postal_code": clean_text(extraction.get("postal_code")),
        "country": "US",
        "phone": clean_text(extraction.get("phone")),
        "email": clean_text(extraction.get("email")),
        "website": website,
        "latitude": None,
        "longitude": None,
        "price_text": "; ".join(sorted({str(price) for page in pages for price in page.prices_found})) or None,
        "rating": None,
        "review_count": None,
        "image_url": None,
        "services_json": {"menu_items": menu_items, "categories_offered": categories},
        "procedures_json": None,
        "raw_text": joined_page_text(pages),
        "raw_json": {
            "candidate": {
                "title": candidate.title,
                "url": candidate.url,
                "snippet": candidate.snippet,
                "query": candidate.query,
            },
            "extraction": extraction,
            "fetched_urls": [page.final_url for page in pages],
            "input_tokens": result.get("input_tokens"),
            "output_tokens": result.get("output_tokens"),
        },
        "extracted_at": now_iso(),
        "fields": {
            "record_type": "service_discovery",
            "cell_category_id": candidate.cell.category_id,
            "cell_metro_id": candidate.cell.metro_id,
            "categories_offered": categories,
            "raw_labels": [item.get("raw_label") for item in menu_items if item.get("raw_label")],
            "booking_mechanism": clean_text(extraction.get("booking_mechanism")) or "unknown",
            "booking_platform": clean_text(extraction.get("booking_platform")),
            "membership_model": clean_text(extraction.get("membership_model")) or "unknown",
            "price_scope": clean_text(extraction.get("price_scope")) or "location",
            "confirmed_own_site": extraction.get("confirmed_own_site"),
            "menu_item_count": len(menu_items),
            "priced_item_count": sum(1 for item in menu_items if item.get("price_amount") is not None),
            "fetched_urls": [page.final_url for page in pages],
            "llm_model": result.get("model"),
            "input_tokens": result.get("input_tokens"),
            "output_tokens": result.get("output_tokens"),
        },
    }
    return db.upsert_listing(listing)


def open_review_queue(path: Path, *, append: bool) -> tuple[csv.DictWriter, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "created_at",
        "target_key",
        "category_id",
        "metro_id",
        "query",
        "title",
        "url",
        "reasons",
        "fetched_urls",
        "menu_item_count",
        "error",
        "extraction_json",
    ]
    exists = path.exists() and append
    handle = path.open("a" if exists else "w", encoding="utf-8", newline="")
    writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
    if not exists:
        writer.writeheader()
    return writer, handle


def load_reviewed_keys(path: Path) -> set[str]:
    if not path.exists():
        return set()
    keys: set[str] = set()
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            key = clean_text(row.get("target_key"))
            if key:
                keys.add(key)
    return keys


def write_review_row(
    writer: csv.DictWriter,
    candidate: CandidateBusiness,
    reasons: list[str],
    extraction: dict[str, Any] | None,
    pages: list[PageContext],
    error: str | None,
) -> None:
    writer.writerow(
        {
            "created_at": now_iso(),
            "target_key": candidate.key,
            "category_id": candidate.cell.category_id,
            "metro_id": candidate.cell.metro_id,
            "query": candidate.query,
            "title": candidate.title,
            "url": candidate.url,
            "reasons": ";".join(reasons),
            "fetched_urls": json.dumps([page.final_url for page in pages], ensure_ascii=True),
            "menu_item_count": len(extraction.get("menu_items", [])) if isinstance(extraction, dict) else 0,
            "error": error,
            "extraction_json": json.dumps(extraction or {}, ensure_ascii=True, sort_keys=True),
        }
    )


def record_search_query(db: SourceDatabase, query: str, cell: DiscoveryCell, city_term: str, status_code: int | None, result_count: int) -> int:
    db.conn.execute(
        """
        INSERT INTO search_queries(query, category_id, metro_id, city_term, status_code, result_count, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(query) DO UPDATE SET
            status_code = excluded.status_code,
            result_count = excluded.result_count,
            fetched_at = excluded.fetched_at
        """,
        (query, cell.category_id, cell.metro_id, city_term, status_code, result_count, now_iso()),
    )
    row = db.conn.execute("SELECT id FROM search_queries WHERE query = ?", (query,)).fetchone()
    return int(row["id"])


def record_search_result(db: SourceDatabase, query_id: int, result: dict[str, Any]) -> None:
    db.conn.execute(
        """
        INSERT OR IGNORE INTO search_results(query_id, rank, title, url, snippet, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (query_id, result.get("rank"), result.get("title"), result.get("url"), result.get("snippet"), now_iso()),
    )


def record_error(db: SourceDatabase, phase: str, target_key: str | None, url: str | None, query: str | None, error: str) -> None:
    db.conn.execute(
        """
        INSERT INTO run_errors(phase, target_key, url, query, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (phase, target_key, url, query, error, now_iso()),
    )


def listing_exists(db: SourceDatabase, source_url: str) -> bool:
    row = db.conn.execute("SELECT 1 FROM listings WHERE source_url = ?", (source_url,)).fetchone()
    return row is not None


def normalize_categories(values: Any, fallback: str) -> list[str]:
    out = []
    for value in values if isinstance(values, list) else []:
        text = clean_text(value)
        if text in CATEGORIES and text not in out:
            out.append(text)
    if fallback not in out:
        out.append(fallback)
    return out


def domain_is_blocked(domain: str) -> bool:
    return any(domain == suffix or domain.endswith("." + suffix) for suffix in SKIP_DOMAIN_SUFFIXES)


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


def print_progress(stats: dict[str, int], candidate: CandidateBusiness) -> None:
    print(
        f"[cells={stats['cells']} candidates={stats['candidates']}] {candidate.cell.key} "
        f"{candidate.title or domain_for(candidate.url)} written={stats['written']} flagged={stats['flagged']} "
        f"items={stats['menu_items']} priced={stats['priced_items']}",
        flush=True,
    )


def print_summary(stats: dict[str, int], args: argparse.Namespace) -> None:
    print("\nService discovery summary")
    print("=========================")
    print(f"database: {args.db}")
    print(f"review_queue: {args.review_queue}")
    print(f"cells processed: {stats['cells']}")
    print(f"candidates processed: {stats['candidates']}")
    print(f"skipped because canonical already has useful coverage: {stats['skipped_canonical']}")
    print(f"QA-passing listings written: {stats['written']}")
    print(f"flagged for review: {stats['flagged']}")
    print(f"menu items written: {stats['menu_items']} ({stats['priced_items']} priced)")
    print(f"LLM tokens: input={stats['input_tokens']}, output={stats['output_tokens']}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
