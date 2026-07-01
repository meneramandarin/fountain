from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import requests

from .extract import (
    canonical_url,
    clean_text,
    extract_json_ld,
    flatten_json_ld,
    is_listing_schema,
    listing_from_page,
    page_title,
    schema_to_listing,
    soup_from_html,
    visible_text,
)
from .fetch import DEFAULT_HEADERS
from .storage import SourceDatabase


ROOT = Path(__file__).resolve().parents[2]
DB_DIR = ROOT / "data" / "databases"
DUCKDUCKGO_HTML = "https://html.duckduckgo.com/html/"
YAHOO_SEARCH = "https://search.yahoo.com/search"

DIRECTORY_DOMAIN_RE = re.compile(
    r"(^|\.)("
    r"yelp|google|bing|duckduckgo|mapquest|yellowpages|facebook|instagram|youtube|tiktok|linkedin|reddit|"
    r"healthgrades|zocdoc|webmd|sharecare|solvhealth|groupon|tripadvisor"
    r")\.",
    re.I,
)

EXTRA_SCHEMA = """
CREATE TABLE IF NOT EXISTS search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    query TEXT NOT NULL,
    service_slug TEXT NOT NULL,
    country_slug TEXT NOT NULL,
    term TEXT,
    city TEXT,
    region TEXT,
    requested_url TEXT NOT NULL,
    status_code INTEGER,
    result_count INTEGER DEFAULT 0,
    fetched_at TEXT NOT NULL,
    UNIQUE(provider, query)
);

CREATE TABLE IF NOT EXISTS search_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_id INTEGER,
    provider TEXT NOT NULL,
    rank INTEGER,
    title TEXT,
    url TEXT NOT NULL,
    display_url TEXT,
    snippet TEXT,
    fetched_at TEXT NOT NULL,
    fetched_page INTEGER DEFAULT 0,
    listing_id INTEGER,
    UNIQUE(query_id, url),
    FOREIGN KEY (query_id) REFERENCES search_queries(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS candidate_urls (
    url TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    query_count INTEGER DEFAULT 0,
    fetched INTEGER DEFAULT 0,
    listing_id INTEGER,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS run_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase TEXT NOT NULL,
    url TEXT,
    query TEXT,
    error TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_results_url ON search_results(url);
CREATE INDEX IF NOT EXISTS idx_search_results_listing ON search_results(listing_id);
CREATE INDEX IF NOT EXISTS idx_candidate_urls_fetched ON candidate_urls(fetched);
CREATE INDEX IF NOT EXISTS idx_listings_region ON listings(region);
CREATE INDEX IF NOT EXISTS idx_listing_fields_name ON listing_fields(field_name);
"""


@dataclass(frozen=True)
class ServiceConfig:
    slug: str
    label: str
    db_name: str
    search_terms: tuple[str, ...]
    aliases: tuple[str, ...]
    patterns: tuple[str, ...]

    @property
    def regex(self) -> re.Pattern[str]:
        return re.compile("|".join(f"(?:{pattern})" for pattern in self.patterns), re.I)


@dataclass(frozen=True)
class CountryConfig:
    slug: str
    label: str
    code: str
    search_label: str
    cities: tuple[tuple[str, str], ...]
    regions: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class SearchQuery:
    query: str
    term: str | None
    city: str | None
    region: str | None


@dataclass(frozen=True)
class SearchResult:
    rank: int
    title: str | None
    url: str
    display_url: str | None
    snippet: str | None


SERVICE_CONFIGS: dict[str, ServiceConfig] = {
    "dexa": ServiceConfig(
        slug="dexa",
        label="DEXA scan",
        db_name="dexa_scan_providers",
        search_terms=("DEXA scan", "DXA scan", "body composition scan", "bone density DEXA scan"),
        aliases=("DEXA scan", "DXA scan", "bone density scan", "body composition scan"),
        patterns=(
            r"\bDEXA\b",
            r"\bDXA\b",
            r"dual[-\s]?energy\s+x[-\s]?ray\s+absorptiometry",
            r"bone\s+density",
            r"body\s+composition",
            r"body\s+fat\s+scan",
            r"visceral\s+fat",
            r"\bBMD\b",
        ),
    ),
    "hbot": ServiceConfig(
        slug="hbot",
        label="Hyperbaric oxygen therapy",
        db_name="hbot_providers",
        search_terms=("HBOT clinic", "hyperbaric oxygen therapy", "hyperbaric chamber clinic", "medical hyperbaric oxygen therapy"),
        aliases=("HBOT", "hyperbaric oxygen therapy", "hyperbaric chamber", "medical oxygen therapy"),
        patterns=(
            r"\bHBOT\b",
            r"hyperbaric\s+oxygen",
            r"hyperbaric\s+chamber",
            r"medical\s+oxygen\s+therapy",
        ),
    ),
    "vo2": ServiceConfig(
        slug="vo2",
        label="VO2 Max Test",
        db_name="vo2_max_test_providers",
        search_terms=("VO2 max test", "VO2 max testing", "VO2max test", "cardiopulmonary exercise test"),
        aliases=("VO2 Max Test", "VO2 max testing", "VO2max", "CPET", "cardiopulmonary exercise test"),
        patterns=(
            r"\bVO2\s*max\b",
            r"\bVO₂\s*max\b",
            r"\bVO2max\b",
            r"cardiopulmonary\s+exercise",
            r"\bCPET\b",
            r"metabolic\s+test(?:ing)?",
        ),
    ),
}

COUNTRY_CONFIGS: dict[str, CountryConfig] = {
    "us": CountryConfig(
        slug="us",
        label="United States",
        code="US",
        search_label="United States",
        cities=(
            ("New York", "NY"),
            ("Los Angeles", "CA"),
            ("Chicago", "IL"),
            ("Houston", "TX"),
            ("Phoenix", "AZ"),
            ("Philadelphia", "PA"),
            ("San Antonio", "TX"),
            ("San Diego", "CA"),
            ("Dallas", "TX"),
            ("San Jose", "CA"),
            ("Austin", "TX"),
            ("Jacksonville", "FL"),
            ("San Francisco", "CA"),
            ("Seattle", "WA"),
            ("Denver", "CO"),
            ("Washington", "DC"),
            ("Boston", "MA"),
            ("Atlanta", "GA"),
            ("Miami", "FL"),
            ("Las Vegas", "NV"),
            ("Portland", "OR"),
            ("Nashville", "TN"),
            ("Minneapolis", "MN"),
            ("Orlando", "FL"),
            ("Raleigh", "NC"),
            ("Tampa", "FL"),
            ("Salt Lake City", "UT"),
            ("Scottsdale", "AZ"),
            ("Cleveland", "OH"),
            ("Pittsburgh", "PA"),
        ),
        regions=(
            ("California", "CA"),
            ("Texas", "TX"),
            ("Florida", "FL"),
            ("New York", "NY"),
            ("Illinois", "IL"),
            ("Pennsylvania", "PA"),
            ("Ohio", "OH"),
            ("Georgia", "GA"),
            ("North Carolina", "NC"),
            ("Washington", "WA"),
        ),
    ),
    "canada": CountryConfig(
        slug="canada",
        label="Canada",
        code="CA",
        search_label="Canada",
        cities=(
            ("Toronto", "ON"),
            ("Montreal", "QC"),
            ("Vancouver", "BC"),
            ("Calgary", "AB"),
            ("Edmonton", "AB"),
            ("Ottawa", "ON"),
            ("Winnipeg", "MB"),
            ("Quebec City", "QC"),
            ("Hamilton", "ON"),
            ("Kitchener", "ON"),
            ("London", "ON"),
            ("Victoria", "BC"),
            ("Halifax", "NS"),
            ("Oshawa", "ON"),
            ("Windsor", "ON"),
            ("Saskatoon", "SK"),
            ("Regina", "SK"),
            ("St. John's", "NL"),
            ("Kelowna", "BC"),
            ("Barrie", "ON"),
        ),
        regions=(("Ontario", "ON"), ("Quebec", "QC"), ("British Columbia", "BC"), ("Alberta", "AB"), ("Manitoba", "MB")),
    ),
    "uk": CountryConfig(
        slug="uk",
        label="United Kingdom",
        code="GB",
        search_label="UK",
        cities=(
            ("London", "England"),
            ("Birmingham", "England"),
            ("Manchester", "England"),
            ("Glasgow", "Scotland"),
            ("Leeds", "England"),
            ("Liverpool", "England"),
            ("Bristol", "England"),
            ("Sheffield", "England"),
            ("Edinburgh", "Scotland"),
            ("Cardiff", "Wales"),
            ("Belfast", "Northern Ireland"),
            ("Newcastle", "England"),
            ("Nottingham", "England"),
            ("Leicester", "England"),
            ("Coventry", "England"),
            ("Southampton", "England"),
            ("Brighton", "England"),
            ("Oxford", "England"),
            ("Cambridge", "England"),
            ("Aberdeen", "Scotland"),
        ),
        regions=(("England", "England"), ("Scotland", "Scotland"), ("Wales", "Wales"), ("Northern Ireland", "Northern Ireland")),
    ),
    "australia": CountryConfig(
        slug="australia",
        label="Australia",
        code="AU",
        search_label="Australia",
        cities=(
            ("Sydney", "NSW"),
            ("Melbourne", "VIC"),
            ("Brisbane", "QLD"),
            ("Perth", "WA"),
            ("Adelaide", "SA"),
            ("Gold Coast", "QLD"),
            ("Canberra", "ACT"),
            ("Newcastle", "NSW"),
            ("Wollongong", "NSW"),
            ("Hobart", "TAS"),
            ("Geelong", "VIC"),
            ("Townsville", "QLD"),
            ("Cairns", "QLD"),
            ("Darwin", "NT"),
            ("Toowoomba", "QLD"),
        ),
        regions=(("New South Wales", "NSW"), ("Victoria", "VIC"), ("Queensland", "QLD"), ("Western Australia", "WA"), ("South Australia", "SA")),
    ),
    "ireland": CountryConfig(
        slug="ireland",
        label="Ireland",
        code="IE",
        search_label="Ireland",
        cities=(
            ("Dublin", "Dublin"),
            ("Cork", "Cork"),
            ("Galway", "Galway"),
            ("Limerick", "Limerick"),
            ("Waterford", "Waterford"),
            ("Drogheda", "Louth"),
            ("Kilkenny", "Kilkenny"),
            ("Sligo", "Sligo"),
            ("Wexford", "Wexford"),
            ("Athlone", "Westmeath"),
            ("Bray", "Wicklow"),
            ("Ennis", "Clare"),
        ),
        regions=(("Leinster", "Leinster"), ("Munster", "Munster"), ("Connacht", "Connacht"), ("Ulster", "Ulster")),
    ),
}

REQUESTED_BATCH = [
    ("dexa", "canada"),
    ("dexa", "uk"),
    ("dexa", "australia"),
    ("dexa", "ireland"),
    ("hbot", "us"),
    ("hbot", "canada"),
    ("hbot", "uk"),
    ("hbot", "australia"),
    ("hbot", "ireland"),
    ("vo2", "us"),
    ("vo2", "canada"),
    ("vo2", "uk"),
    ("vo2", "australia"),
    ("vo2", "ireland"),
]


class RateLimitedSession:
    def __init__(self, delay_seconds: float, timeout: int) -> None:
        self.delay_seconds = delay_seconds
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.session.headers.update({"User-Agent": "Mozilla/5.0"})
        self._last_request_at = 0.0

    def get(self, url: str, **kwargs: Any) -> requests.Response:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.delay_seconds:
            time.sleep(self.delay_seconds - elapsed)
        response = self.session.get(url, timeout=self.timeout, **kwargs)
        self._last_request_at = time.monotonic()
        return response


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def source_slug(service: ServiceConfig, country: CountryConfig) -> str:
    if service.slug == "dexa":
        return f"dexa_{country.slug}_scan_providers"
    if service.slug == "vo2":
        return f"vo2_max_{country.slug}_test_providers"
    return f"{service.slug}_{country.slug}_providers"


def db_path_for(service: ServiceConfig, country: CountryConfig) -> Path:
    return DB_DIR / f"{source_slug(service, country)}.sqlite"


def init_database(path: Path, reset: bool, service: ServiceConfig, country: CountryConfig) -> SourceDatabase:
    if reset and path.exists():
        path.unlink()
        for suffix in ("-wal", "-shm"):
            sidecar = Path(f"{path}{suffix}")
            if sidecar.exists():
                sidecar.unlink()
    db = SourceDatabase(path)
    db.conn.executescript(EXTRA_SCHEMA)
    slug = source_slug(service, country)
    db.set_metadata(
        {
            "slug": slug,
            "name": f"{country.label} {service.label} provider search",
            "service_slug": service.slug,
            "service_label": service.label,
            "country_slug": country.slug,
            "country_label": country.label,
            "scope": "Isolated web-search database. Not merged into canonical.db.",
            "created_or_updated_at": now_iso(),
        }
    )
    return db


def page_row(url: str, response: requests.Response) -> dict[str, Any]:
    content = response.content or b""
    content_type = response.headers.get("content-type", "")
    text = response.text if _is_text_response(content_type) else ""
    soup = soup_from_html(text) if text else None
    return {
        "url": url,
        "final_url": response.url,
        "status_code": response.status_code,
        "content_type": content_type,
        "title": page_title(soup) if soup else None,
        "fetched_at": now_iso(),
        "sha256": hashlib.sha256(content).hexdigest(),
        "html": text if text else None,
    }


def _is_text_response(content_type: str) -> bool:
    lowered = (content_type or "").lower()
    return any(token in lowered for token in ("text/html", "application/xhtml", "text/plain", "application/json"))


def build_queries(
    service: ServiceConfig,
    country: CountryConfig,
    preset: str,
    city_limit: int | None,
    query_limit: int | None,
    include_region_queries: bool,
) -> list[SearchQuery]:
    if preset == "smoke":
        cities = country.cities[:3]
        terms = service.search_terms[:2]
    elif preset == "top30":
        cities = country.cities[:30]
        terms = service.search_terms[:3]
    elif preset == "top100":
        cities = country.cities[:100]
        terms = service.search_terms
    else:
        cities = country.cities
        terms = service.search_terms
    if city_limit is not None:
        cities = cities[:city_limit]
    queries: list[SearchQuery] = []
    for city, region in cities:
        for term in terms:
            queries.append(SearchQuery(query=f"{term} {city} {region} {country.search_label}", term=term, city=city, region=region))
    if include_region_queries:
        for region_name, region_code in country.regions:
            queries.append(
                SearchQuery(
                    query=f"{service.search_terms[0]} {region_name} {country.search_label}",
                    term=service.search_terms[0],
                    city=None,
                    region=region_code,
                )
            )
    return queries[:query_limit] if query_limit is not None else queries


def search_duckduckgo(
    db: SourceDatabase,
    session: RateLimitedSession,
    service: ServiceConfig,
    country: CountryConfig,
    search_query: SearchQuery,
    max_results: int,
) -> list[SearchResult]:
    requested_url = f"{DUCKDUCKGO_HTML}?{urlencode({'q': search_query.query})}"
    fetched_at = now_iso()
    try:
        response = session.get(DUCKDUCKGO_HTML, params={"q": search_query.query})
    except Exception as exc:
        record_error(db, "search", requested_url, search_query.query, repr(exc))
        return []
    db.upsert_page(page_row(requested_url, response))
    results = parse_duckduckgo_results(response.text, max_results=max_results) if response.status_code < 400 else []
    query_id = upsert_search_query(
        db,
        "duckduckgo_html",
        service,
        country,
        search_query,
        requested_url,
        response.status_code,
        len(results),
        fetched_at,
    )
    for result in results:
        upsert_search_result(db, query_id, "duckduckgo_html", result, fetched_at)
        upsert_candidate_url(db, result.url, "duckduckgo_html")
    db.conn.commit()
    return results


def search_yahoo(
    db: SourceDatabase,
    session: RateLimitedSession,
    service: ServiceConfig,
    country: CountryConfig,
    search_query: SearchQuery,
    max_results: int,
) -> list[SearchResult]:
    requested_url = f"{YAHOO_SEARCH}?{urlencode({'p': search_query.query})}"
    fetched_at = now_iso()
    try:
        response = session.get(YAHOO_SEARCH, params={"p": search_query.query})
    except Exception as exc:
        record_error(db, "search", requested_url, search_query.query, repr(exc))
        return []
    db.upsert_page(page_row(requested_url, response))
    results = parse_yahoo_results(response.text, max_results=max_results) if response.status_code < 400 else []
    query_id = upsert_search_query(db, "yahoo_search", service, country, search_query, requested_url, response.status_code, len(results), fetched_at)
    for result in results:
        upsert_search_result(db, query_id, "yahoo_search", result, fetched_at)
        upsert_candidate_url(db, result.url, "yahoo_search")
    db.conn.commit()
    return results


def parse_duckduckgo_results(html: str, max_results: int) -> list[SearchResult]:
    soup = soup_from_html(html)
    results: list[SearchResult] = []
    for block in soup.select(".result"):
        link = block.select_one(".result__a")
        if not link or not link.get("href"):
            continue
        url = unwrap_duckduckgo_url(link["href"])
        if not url or should_skip_url(url):
            continue
        title = clean_text(link.get_text(" "))
        snippet_tag = block.select_one(".result__snippet")
        display_tag = block.select_one(".result__url")
        results.append(
            SearchResult(
                rank=len(results) + 1,
                title=title,
                url=url,
                display_url=clean_text(display_tag.get_text(" ")) if display_tag else domain_for(url),
                snippet=clean_text(snippet_tag.get_text(" ")) if snippet_tag else None,
            )
        )
        if len(results) >= max_results:
            break
    return results


def parse_yahoo_results(html: str, max_results: int) -> list[SearchResult]:
    soup = soup_from_html(html)
    results: list[SearchResult] = []
    for block in soup.select("div.algo"):
        link = block.select_one("a")
        if not link or not link.get("href"):
            continue
        url = unwrap_yahoo_url(link["href"])
        if not url or should_skip_url(url):
            continue
        title = clean_text(link.get_text(" "))
        snippet_tag = block.select_one(".compText, .fc-falcon, p")
        display_tag = block.select_one(".compUrl, cite")
        results.append(
            SearchResult(
                rank=len(results) + 1,
                title=title,
                url=url,
                display_url=clean_text(display_tag.get_text(" ")) if display_tag else domain_for(url),
                snippet=clean_text(snippet_tag.get_text(" ")) if snippet_tag else None,
            )
        )
        if len(results) >= max_results:
            break
    return dedupe_results(results)


def dedupe_results(results: list[SearchResult]) -> list[SearchResult]:
    seen: set[str] = set()
    deduped: list[SearchResult] = []
    for result in results:
        if result.url in seen:
            continue
        seen.add(result.url)
        deduped.append(
            SearchResult(
                rank=len(deduped) + 1,
                title=result.title,
                url=result.url,
                display_url=result.display_url,
                snippet=result.snippet,
            )
        )
    return deduped


def unwrap_duckduckgo_url(href: str) -> str | None:
    href = href.strip()
    if href.startswith("//"):
        href = "https:" + href
    parsed = urlparse(href)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        values = parse_qs(parsed.query).get("uddg")
        return values[0] if values else None
    if parsed.scheme in {"http", "https"}:
        return href
    return None


def unwrap_yahoo_url(href: str) -> str | None:
    href = href.strip()
    if href.startswith("//"):
        href = "https:" + href
    parsed = urlparse(href)
    if parsed.netloc.endswith("search.yahoo.com") or parsed.netloc.endswith("r.search.yahoo.com"):
        match = re.search(r"/RU=([^/]+)", href)
        if match:
            return parse_qs(f"u={match.group(1)}")["u"][0]
    if parsed.scheme in {"http", "https"}:
        return href
    return None


def should_skip_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return True
    if parsed.path.lower().endswith((".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".zip")):
        return True
    return False


def fetch_candidate_pages(
    db: SourceDatabase,
    session: RateLimitedSession,
    service: ServiceConfig,
    country: CountryConfig,
    max_pages: int | None,
) -> int:
    rows = db.conn.execute(
        """
        SELECT url, source_kind
        FROM candidate_urls
        WHERE fetched = 0
        ORDER BY query_count DESC, first_seen_at
        """
    ).fetchall()
    if max_pages is not None:
        rows = rows[:max_pages]
    stored = 0
    for row in rows:
        url = row["url"]
        source_kind = row["source_kind"] or "web_search"
        try:
            response = session.get(url)
        except Exception as exc:
            record_error(db, "candidate_fetch", url, None, repr(exc))
            mark_candidate_fetched(db, url, None)
            continue
        db.upsert_page(page_row(url, response))
        listing_id = None
        content_type = response.headers.get("content-type", "").lower()
        if response.status_code < 400 and "html" in content_type:
            listing_id = extract_and_store_listing(
                db,
                response.url,
                response.text,
                source_kind=source_kind,
                service=service,
                country=country,
                search_context=best_search_context(db, url),
            )
            if listing_id:
                stored += 1
                db.conn.execute("UPDATE search_results SET fetched_page = 1, listing_id = ? WHERE url = ?", (listing_id, url))
        mark_candidate_fetched(db, url, listing_id)
        db.conn.commit()
    return stored


def extract_and_store_listing(
    db: SourceDatabase,
    page_url: str,
    html: str,
    source_kind: str,
    service: ServiceConfig,
    country: CountryConfig,
    search_context: dict[str, Any] | None,
) -> int | None:
    soup = soup_from_html(html)
    raw_text = visible_text(soup) or ""
    signals = service_signals(service, " ".join(value for value in [page_title(soup), raw_text] if value))
    if not signals:
        return None
    schema_items = [item for item in flatten_json_ld(extract_json_ld(soup)) if is_listing_schema(item)]
    listings: list[dict[str, Any]] = []
    for item in schema_items:
        listing = schema_to_listing(item, page_url, source_slug(service, country), raw_text, soup=soup)
        if listing.get("name"):
            listing["fields"]["extraction_method"] = "json_ld"
            listing["fields"]["schema_type"] = item.get("@type")
            listings.append(listing)
    if not listings:
        listings.append(
            listing_from_page(
                soup,
                page_url,
                source_slug(service, country),
                extra_fields={"extraction_method": "page_heuristic"},
            )
        )
    best = choose_best_listing(listings)
    if not best or not best.get("name"):
        return None
    fields = best.setdefault("fields", {})
    page_type = classify_page(page_url, best, raw_text)
    fields.update(
        {
            "record_type": f"{source_slug(service, country)}_candidate",
            "service_slug": service.slug,
            "service_label": service.label,
            "country_scope": country.label,
            "country_code_scope": country.code,
            "source_kind": source_kind,
            "page_type": page_type,
            "domain": domain_for(page_url),
            "service_signals": signals,
            f"{service.slug}_signals": signals,
            "confidence_score": confidence_score(best, signals, page_type),
            "is_directory_or_aggregator": page_type == "directory_or_aggregator",
        }
    )
    if search_context:
        fields.update(search_context)
    best["source_slug"] = source_slug(service, country)
    best["country"] = best.get("country") or country.code
    best["procedures_json"] = {
        "primary": service.label,
        "aliases": list(service.aliases),
        "matched_terms": signals,
    }
    best["services_json"] = {
        "detected_service": service.label,
        "detected_terms": signals,
        "source_services": best.get("services_json"),
    }
    best["raw_text"] = raw_text
    best["source_url"] = canonical_url(soup, page_url)
    best["extracted_at"] = now_iso()
    if not best.get("website"):
        best["website"] = page_url
    return db.upsert_listing(best)


def choose_best_listing(listings: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not listings:
        return None

    def score(item: dict[str, Any]) -> int:
        return sum(
            [
                4 if item.get("address") else 0,
                3 if item.get("phone") else 0,
                2 if item.get("latitude") and item.get("longitude") else 0,
                1 if item.get("image_url") else 0,
                1 if item.get("description") else 0,
            ]
        )

    return sorted(listings, key=score, reverse=True)[0]


def service_signals(service: ServiceConfig, text: str) -> list[str]:
    return sorted({clean_text(match.group(0)) for match in service.regex.finditer(text or "") if clean_text(match.group(0))})


def classify_page(page_url: str, listing: dict[str, Any], raw_text: str) -> str:
    domain = domain_for(page_url)
    path = urlparse(page_url).path
    title = (listing.get("name") or "").lower()
    if DIRECTORY_DOMAIN_RE.search(domain) or "/search" in path or "where to" in title or "near me" in title:
        return "directory_or_aggregator"
    if listing.get("address") or listing.get("phone") or listing.get("latitude"):
        return "provider_page"
    if len(raw_text) > 2000:
        return "content_page"
    return "provider_candidate"


def confidence_score(listing: dict[str, Any], signals: list[str], page_type: str) -> int:
    score = min(len(signals), 6)
    if page_type == "provider_page":
        score += 5
    if listing.get("address"):
        score += 3
    if listing.get("phone"):
        score += 2
    if listing.get("latitude") and listing.get("longitude"):
        score += 2
    if listing.get("image_url"):
        score += 1
    return score


def best_search_context(db: SourceDatabase, url: str) -> dict[str, Any] | None:
    row = db.conn.execute(
        """
        SELECT sq.query, sq.term, sq.city, sq.region, sr.rank, sr.title, sr.snippet
        FROM search_results sr
        LEFT JOIN search_queries sq ON sq.id = sr.query_id
        WHERE sr.url = ?
        ORDER BY sr.rank
        LIMIT 1
        """,
        (url,),
    ).fetchone()
    if not row:
        return None
    return {
        "discovery_query": row["query"],
        "discovery_term": row["term"],
        "discovery_city": row["city"],
        "discovery_region": row["region"],
        "search_rank": row["rank"],
        "search_result_title": row["title"],
        "search_result_snippet": row["snippet"],
    }


def upsert_search_query(
    db: SourceDatabase,
    provider: str,
    service: ServiceConfig,
    country: CountryConfig,
    query: SearchQuery,
    requested_url: str,
    status_code: int,
    result_count: int,
    fetched_at: str,
) -> int:
    db.conn.execute(
        """
        INSERT INTO search_queries(provider, query, service_slug, country_slug, term, city, region, requested_url, status_code, result_count, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, query) DO UPDATE SET
            requested_url = excluded.requested_url,
            status_code = excluded.status_code,
            result_count = excluded.result_count,
            fetched_at = excluded.fetched_at
        """,
        (
            provider,
            query.query,
            service.slug,
            country.slug,
            query.term,
            query.city,
            query.region,
            requested_url,
            status_code,
            result_count,
            fetched_at,
        ),
    )
    row = db.conn.execute("SELECT id FROM search_queries WHERE provider = ? AND query = ?", (provider, query.query)).fetchone()
    return int(row["id"])


def upsert_search_result(db: SourceDatabase, query_id: int, provider: str, result: SearchResult, fetched_at: str) -> None:
    db.conn.execute(
        """
        INSERT INTO search_results(query_id, provider, rank, title, url, display_url, snippet, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(query_id, url) DO UPDATE SET
            rank = excluded.rank,
            title = excluded.title,
            display_url = excluded.display_url,
            snippet = excluded.snippet,
            fetched_at = excluded.fetched_at
        """,
        (query_id, provider, result.rank, result.title, result.url, result.display_url, result.snippet, fetched_at),
    )


def upsert_candidate_url(db: SourceDatabase, url: str, source_kind: str, fetched: bool = False, listing_id: int | None = None) -> None:
    timestamp = now_iso()
    db.conn.execute(
        """
        INSERT INTO candidate_urls(url, source_kind, first_seen_at, last_seen_at, query_count, fetched, listing_id)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
            last_seen_at = excluded.last_seen_at,
            query_count = candidate_urls.query_count + 1,
            fetched = CASE WHEN excluded.fetched = 1 THEN 1 ELSE candidate_urls.fetched END,
            listing_id = COALESCE(excluded.listing_id, candidate_urls.listing_id)
        """,
        (url, source_kind, timestamp, timestamp, 1 if fetched else 0, listing_id),
    )


def mark_candidate_fetched(db: SourceDatabase, url: str, listing_id: int | None) -> None:
    db.conn.execute("UPDATE candidate_urls SET fetched = 1, listing_id = COALESCE(?, listing_id) WHERE url = ?", (listing_id, url))


def record_error(db: SourceDatabase, phase: str, url: str | None, query: str | None, error: str) -> None:
    db.conn.execute(
        "INSERT INTO run_errors(phase, url, query, error, created_at) VALUES (?, ?, ?, ?, ?)",
        (phase, url, query, error, now_iso()),
    )
    db.conn.commit()


def domain_for(url: str) -> str:
    return urlparse(url).netloc.lower().removeprefix("www.")


def run_one(
    service: ServiceConfig,
    country: CountryConfig,
    args: argparse.Namespace,
) -> Path:
    path = db_path_for(service, country)
    db = init_database(path, reset=args.reset, service=service, country=country)
    try:
        queries = build_queries(service, country, args.preset, args.city_limit, args.query_limit, args.include_region_queries)
        provider_label = {
            "duckduckgo": "DuckDuckGo HTML",
            "yahoo": "Yahoo Search",
        }[args.search_provider]
        print(f"\n==> {service.label} / {country.label}: {len(queries)} {provider_label} queries", flush=True)
        search_session = RateLimitedSession(delay_seconds=args.search_delay, timeout=args.timeout)
        for index, query in enumerate(queries, start=1):
            print(f"    [{index}/{len(queries)}] {query.query}", flush=True)
            if args.search_provider == "yahoo":
                search_yahoo(db, search_session, service, country, query, max_results=args.max_results_per_query)
            else:
                search_duckduckgo(db, search_session, service, country, query, max_results=args.max_results_per_query)
        if not args.skip_result_page_fetch:
            max_pages = None if args.max_provider_pages == -1 else args.max_provider_pages
            print(f"==> fetching candidate result pages, max_pages={max_pages if max_pages is not None else 'unlimited'}", flush=True)
            page_session = RateLimitedSession(delay_seconds=args.page_delay, timeout=args.timeout)
            fetch_candidate_pages(db, page_session, service, country, max_pages=max_pages)
        print_report(path, service, country)
    finally:
        db.close()
    return path


def print_report(path: Path, service: ServiceConfig, country: CountryConfig) -> None:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row

    def count(table: str) -> int:
        return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])

    print(f"\n{service.label} / {country.label} scrape report")
    print("=" * 48)
    print(f"database: {path}")
    for table in ("search_queries", "search_results", "candidate_urls", "pages", "listings", "listing_fields", "images", "run_errors"):
        print(f"{table}: {count(table)}")
    print("top domains:")
    for row in conn.execute(
        """
        SELECT field_value AS domain, COUNT(*) AS n
        FROM listing_fields
        WHERE field_name = 'domain'
        GROUP BY field_value
        ORDER BY n DESC, domain
        LIMIT 10
        """
    ):
        print(f"  {row['n']:>4}  {row['domain']}")
    print("page types:")
    for row in conn.execute(
        """
        SELECT field_value AS page_type, COUNT(*) AS n
        FROM listing_fields
        WHERE field_name = 'page_type'
        GROUP BY field_value
        ORDER BY n DESC
        """
    ):
        print(f"  {row['n']:>4}  {row['page_type']}")
    conn.close()


def parse_items(raw: str, choices: dict[str, Any], label: str) -> list[str]:
    if raw == "all":
        return list(choices)
    values = [item.strip().lower() for item in raw.split(",") if item.strip()]
    unknown = [item for item in values if item not in choices]
    if unknown:
        raise SystemExit(f"Unknown {label}: {', '.join(unknown)}")
    return values


def selected_pairs(args: argparse.Namespace) -> list[tuple[ServiceConfig, CountryConfig]]:
    if args.batch == "requested":
        return [(SERVICE_CONFIGS[service], COUNTRY_CONFIGS[country]) for service, country in REQUESTED_BATCH]
    services = parse_items(args.service, SERVICE_CONFIGS, "service")
    countries = parse_items(args.country, COUNTRY_CONFIGS, "country")
    return [(SERVICE_CONFIGS[service], COUNTRY_CONFIGS[country]) for service in services for country in countries]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build isolated service-provider databases from web search results.")
    parser.add_argument("--service", default="dexa", help="Service slug, comma list, or all. Choices: dexa,hbot,vo2.")
    parser.add_argument("--country", default="us", help="Country slug, comma list, or all. Choices: us,canada,uk,australia,ireland.")
    parser.add_argument("--batch", choices=("requested",), help="Run DEXA Canada/UK/Australia/Ireland plus HBOT/VO2 in all requested countries.")
    parser.add_argument("--reset", action="store_true", help="Delete each output database before scraping.")
    parser.add_argument("--preset", choices=("smoke", "top30", "top100", "full"), default="smoke")
    parser.add_argument("--city-limit", type=int, help="Limit city queries after applying the preset.")
    parser.add_argument("--query-limit", type=int, help="Hard cap on generated web-search queries per database.")
    parser.add_argument("--include-region-queries", action="store_true", help="Add state/province/region-wide queries.")
    parser.add_argument("--max-results-per-query", type=int, default=10)
    parser.add_argument("--search-provider", choices=("duckduckgo", "yahoo"), default="duckduckgo")
    parser.add_argument("--max-provider-pages", type=int, default=50, help="Max web-search result pages to fetch per database. Use -1 for no cap.")
    parser.add_argument("--skip-result-page-fetch", action="store_true")
    parser.add_argument("--search-delay", type=float, default=1.0)
    parser.add_argument("--page-delay", type=float, default=0.6)
    parser.add_argument("--timeout", type=int, default=30)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    for service, country in selected_pairs(args):
        run_one(service, country, args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
