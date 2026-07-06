from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from .extract import clean_text
from .fetch import Fetcher
from .scrape_menu_enrichment import (
    PageContext,
    compact_json_ld,
    fetch_candidate_pages,
    joined_page_text,
    normalize_menu_items,
    parse_json_object,
    post_openrouter_with_hard_timeout,
)
from .scrape_service_discovery import CATEGORIES, BOOKING_PLATFORMS, load_dotenv, normalize_categories
from .storage import SourceDatabase


ROOT = Path(__file__).resolve().parents[2]
DB_DIR = ROOT / "data" / "databases"
EXPORT_DIR = ROOT / "data" / "exports"
DEFAULT_MODEL = "z-ai/glm-5.2"


@dataclass(frozen=True)
class ChainConfig:
    slug: str
    name: str
    website: str
    seed_paths: tuple[str, ...]
    default_categories: tuple[str, ...]

    @property
    def source_slug(self) -> str:
        return f"chain_{self.slug}"


CHAIN_CONFIGS: dict[str, ChainConfig] = {
    "restore_hyper_wellness": ChainConfig("restore_hyper_wellness", "Restore Hyper Wellness", "https://www.restore.com", ("/locations", "/services", "/pricing"), ("cryotherapy", "iv_therapy", "hbot", "red_light", "infrared_sauna")),
    "icryo": ChainConfig("icryo", "iCRYO", "https://icryo.com", ("/locations", "/services"), ("cryotherapy", "iv_therapy", "red_light", "infrared_sauna")),
    "the_dripbar": ChainConfig("the_dripbar", "The DRIPBaR", "https://thedripbar.com", ("/locations", "/iv-lifestyle-drips", "/services"), ("iv_therapy", "nad_plus")),
    "prime_iv_hydration": ChainConfig("prime_iv_hydration", "Prime IV Hydration", "https://primeivhydration.com", ("/locations", "/iv-therapy", "/pricing"), ("iv_therapy", "nad_plus")),
    "next_health": ChainConfig("next_health", "Next Health", "https://www.next-health.com", ("/locations", "/services"), ("iv_therapy", "nad_plus", "cryotherapy", "infrared_sauna", "red_light")),
    "remedy_place": ChainConfig("remedy_place", "Remedy Place", "https://www.remedyplace.com", ("/locations", "/services"), ("cold_plunge", "infrared_sauna", "red_light")),
    "upgrade_labs": ChainConfig("upgrade_labs", "Upgrade Labs", "https://upgradelabs.com", ("/locations", "/services"), ("cryotherapy", "red_light", "infrared_sauna", "vo2max")),
    "bodyspec": ChainConfig("bodyspec", "BodySpec", "https://www.bodyspec.com", ("/locations", "/pricing"), ("dexa",)),
    "dexafit": ChainConfig("dexafit", "DexaFit", "https://www.dexafit.com", ("/locations", "/services"), ("dexa", "vo2max")),
    "prenuvo": ChainConfig("prenuvo", "Prenuvo", "https://www.prenuvo.com", ("/locations", "/pricing"), ("full_body_mri",)),
    "simonmed": ChainConfig("simonmed", "SimonMed", "https://www.simonmed.com", ("/locations", "/services"), ("full_body_mri", "coronary_calcium_ct")),
    "clean_market": ChainConfig("clean_market", "Clean Market", "https://cleanmarket.com", ("/locations", "/services"), ("iv_therapy", "cryotherapy", "infrared_sauna", "red_light")),
}

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


class ChainExtractor:
    def __init__(self, *, model: str, max_context_chars: int, llm_timeout: int) -> None:
        self.model = model
        self.max_context_chars = max_context_chars
        self.llm_timeout = llm_timeout

    def extract(self, config: ChainConfig, pages: list[PageContext]) -> tuple[dict[str, Any], dict[str, int]]:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required for chain extraction")
        response_json = self.request_openrouter(api_key, config, pages, schema_mode=True)
        if not response_json.get("choices"):
            response_json = self.request_openrouter(api_key, config, pages, schema_mode=False)
        content = response_json.get("choices", [{}])[0].get("message", {}).get("content")
        extraction = parse_json_object(content or "") or {}
        usage = response_json.get("usage") or {}
        return extraction, {
            "input_tokens": int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0),
            "output_tokens": int(usage.get("completion_tokens") or usage.get("output_tokens") or 0),
        }

    def request_openrouter(self, api_key: str, config: ChainConfig, pages: list[PageContext], *, schema_mode: bool) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": self.build_prompt(config, pages)},
            ],
            "temperature": 0,
            "max_tokens": 7000,
            "response_format": (
                {"type": "json_schema", "json_schema": {"name": "chain_locations", "strict": False, "schema": EXTRACTION_SCHEMA}}
                if schema_mode
                else {"type": "json_object"}
            ),
        }
        response = post_openrouter_with_hard_timeout(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://fountain.local",
                "X-Title": "Fountain Chain Locations",
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

    def build_prompt(self, config: ChainConfig, pages: list[PageContext]) -> str:
        payload = {
            "chain": {
                "name": config.name,
                "website": config.website,
                "default_categories": config.default_categories,
            },
            "allowed_category_ids": sorted(CATEGORIES),
            "booking_platforms": BOOKING_PLATFORMS,
            "pages": [
                {
                    "url": page.final_url,
                    "title": page.title,
                    "visible_text": page.text[:16000],
                    "prices_found": page.prices_found[:60],
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


SYSTEM_PROMPT = """Extract chain provider locations and published service menus from the chain's own pages. Return only valid JSON.

Rules:
- Extract only real chain locations with an address, locality, or region shown in the supplied content.
- If menu prices are global rather than location-specific, attach the chain-level menu to each location and set price_scope to chain_default.
- Preserve the provider's service label in raw_label and map it to the best allowed category id.
- Null is better than guessing for phone, email, address, and prices.
"""

EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "chain_menu_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "treatment_name": {"type": ["string", "null"]},
                    "raw_label": {"type": ["string", "null"]},
                    "canonical_id": {"type": ["string", "null"], "enum": sorted(CATEGORIES) + [None]},
                    "brand_or_variant": {"type": ["string", "null"]},
                    "quantity_or_dose": {"type": ["string", "null"]},
                    "price_amount": {"type": ["number", "null"]},
                    "price_max": {"type": ["number", "null"]},
                    "price_currency": {"type": ["string", "null"]},
                    "price_type": {"type": ["string", "null"], "enum": ["fixed", "starting_at", "range", "unknown", None]},
                    "source_url": {"type": ["string", "null"]},
                    "confidence": {"type": ["string", "null"], "enum": ["high", "medium", "low", None]},
                },
            },
        },
        "locations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": ["string", "null"]},
                    "address": {"type": ["string", "null"]},
                    "locality": {"type": ["string", "null"]},
                    "region": {"type": ["string", "null"]},
                    "postal_code": {"type": ["string", "null"]},
                    "country_code": {"type": ["string", "null"]},
                    "phone": {"type": ["string", "null"]},
                    "email": {"type": ["string", "null"]},
                    "website": {"type": ["string", "null"]},
                    "booking_mechanism": {"type": ["string", "null"], "enum": ["online_widget", "contact_form", "phone_only", "unknown", None]},
                    "booking_platform": {"type": ["string", "null"], "enum": list(BOOKING_PLATFORMS) + [None]},
                    "membership_model": {"type": ["string", "null"], "enum": ["membership_required", "membership_optional", "a_la_carte", "unknown", None]},
                    "categories_offered": {"type": "array", "items": {"type": "string", "enum": sorted(CATEGORIES)}},
                    "price_scope": {"type": ["string", "null"], "enum": ["location", "chain_default", None]},
                    "menu_items": {"type": "array"},
                    "source_url": {"type": ["string", "null"]},
                },
            },
        },
    },
    "required": ["chain_menu_items", "locations"],
}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / ".env.local")
    args.model = args.model or os.environ.get("OPENROUTER_MODEL") or DEFAULT_MODEL
    if args.list_chains:
        for slug in sorted(CHAIN_CONFIGS):
            print(slug)
        return 0
    if not os.environ.get("OPENROUTER_API_KEY"):
        print("OPENROUTER_API_KEY is required for chain extraction.", file=sys.stderr)
        return 2
    selected = sorted(CHAIN_CONFIGS) if not args.chain or "all" in args.chain else args.chain
    exit_code = 0
    for slug in selected:
        config = CHAIN_CONFIGS[slug]
        try:
            run_chain(config, args)
        except Exception as exc:
            print(f"{slug}: {exc!r}", file=sys.stderr)
            exit_code = 1
    return exit_code


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape configured chain locations and menus.")
    parser.add_argument("--chain", action="append", choices=sorted(CHAIN_CONFIGS) + ["all"], default=[])
    parser.add_argument("--db", type=Path, help="Only valid when scraping a single chain.")
    parser.add_argument("--review-queue", type=Path)
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--max-pages", type=int, default=6)
    parser.add_argument("--max-context-chars", type=int, default=90000)
    parser.add_argument("--delay", type=float, default=0.75)
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--llm-timeout", type=int, default=180)
    parser.add_argument("--model")
    parser.add_argument("--list-chains", action="store_true")
    return parser.parse_args(argv)


def run_chain(config: ChainConfig, args: argparse.Namespace) -> None:
    db_path = args.db or DB_DIR / f"{config.source_slug}.sqlite"
    review_path = args.review_queue or EXPORT_DIR / f"{config.source_slug}_review_queue.csv"
    if args.reset and db_path.exists():
        db_path.unlink()
    db = SourceDatabase(db_path)
    db.conn.executescript(EXTRA_SCHEMA)
    db.set_metadata({"name": config.name, "source_slug": config.source_slug, "scraped_at": now_iso(), "model": args.model})
    writer, handle = open_review_queue(review_path, append=not args.reset)
    try:
        fetcher = Fetcher(delay_seconds=args.delay, timeout=args.timeout)
        pages = fetch_seed_pages(config, db, fetcher, args.max_pages)
        if not pages:
            writer.writerow({"created_at": now_iso(), "chain": config.slug, "reasons": "all_candidate_urls_failed", "error": None, "extraction_json": "{}"})
            return
        extractor = ChainExtractor(model=args.model, max_context_chars=args.max_context_chars, llm_timeout=args.llm_timeout)
        extraction, usage = extractor.extract(config, pages)
        chain_menu = normalize_chain_menu_items(extraction.get("chain_menu_items"), config)
        locations = extraction.get("locations") if isinstance(extraction.get("locations"), list) else []
        written = 0
        for index, location in enumerate(locations):
            if not isinstance(location, dict):
                continue
            menu_items = normalize_chain_menu_items(location.get("menu_items"), config) or chain_menu
            if not clean_text(location.get("address")) and not clean_text(location.get("locality")):
                continue
            write_location(db, config, location, menu_items, pages, usage, args.model, index)
            written += 1
        if written == 0:
            writer.writerow({"created_at": now_iso(), "chain": config.slug, "reasons": "zero_locations", "error": None, "extraction_json": json.dumps(extraction, ensure_ascii=True, sort_keys=True)})
        db.conn.commit()
        print(f"{config.slug}: wrote {written} locations to {db_path}")
    finally:
        handle.close()
        db.close()


def fetch_seed_pages(config: ChainConfig, db: SourceDatabase, fetcher: Fetcher, max_pages: int) -> list[PageContext]:
    pages: list[PageContext] = []
    for path in ("",) + config.seed_paths:
        url = config.website.rstrip("/") + path
        for page in fetch_candidate_pages(fetcher, db, url, max_pages=max(1, max_pages - len(pages))):
            if page.final_url not in {existing.final_url for existing in pages}:
                pages.append(page)
            if len(pages) >= max_pages:
                return pages
    return pages


def normalize_chain_menu_items(items: Any, config: ChainConfig) -> list[dict[str, Any]]:
    normalized = normalize_menu_items(items)
    original = items if isinstance(items, list) else []
    fallback = config.default_categories[0] if config.default_categories else None
    for index, item in enumerate(normalized):
        source = original[index] if index < len(original) and isinstance(original[index], dict) else {}
        canonical_id = clean_text(source.get("canonical_id"))
        item["canonical_id"] = canonical_id if canonical_id in CATEGORIES else fallback
        item["raw_label"] = clean_text(source.get("raw_label")) or item.get("treatment_name")
    return normalized


def write_location(
    db: SourceDatabase,
    config: ChainConfig,
    location: dict[str, Any],
    menu_items: list[dict[str, Any]],
    pages: list[PageContext],
    usage: dict[str, int],
    model: str,
    index: int,
) -> int:
    location_key = "|".join(
        clean_text(location.get(key)) or ""
        for key in ("name", "address", "locality", "region", "postal_code", "website")
    )
    digest = hashlib.sha1(f"{config.slug}|{location_key}|{index}".encode("utf-8")).hexdigest()[:20]
    categories = normalize_categories(location.get("categories_offered"), config.default_categories[0] if config.default_categories else "")
    price_scope = clean_text(location.get("price_scope")) or "chain_default"
    listing = {
        "source_slug": config.source_slug,
        "source_url": f"chain://{config.slug}/{digest}",
        "name": clean_text(location.get("name")) or config.name,
        "description": None,
        "address": clean_text(location.get("address")),
        "locality": clean_text(location.get("locality")),
        "region": clean_text(location.get("region")),
        "postal_code": clean_text(location.get("postal_code")),
        "country": clean_text(location.get("country_code")) or "US",
        "phone": clean_text(location.get("phone")),
        "email": clean_text(location.get("email")),
        "website": clean_text(location.get("website")) or config.website,
        "latitude": None,
        "longitude": None,
        "price_text": "; ".join(sorted({str(price) for page in pages for price in page.prices_found})) or None,
        "rating": None,
        "review_count": None,
        "image_url": None,
        "services_json": {"menu_items": menu_items, "categories_offered": categories},
        "procedures_json": None,
        "raw_text": joined_page_text(pages),
        "raw_json": {"location": location, "fetched_urls": [page.final_url for page in pages], "input_tokens": usage.get("input_tokens"), "output_tokens": usage.get("output_tokens")},
        "extracted_at": now_iso(),
        "fields": {
            "record_type": "chain_location",
            "chain_slug": config.slug,
            "categories_offered": categories,
            "raw_labels": [item.get("raw_label") for item in menu_items if item.get("raw_label")],
            "booking_mechanism": clean_text(location.get("booking_mechanism")) or "unknown",
            "booking_platform": clean_text(location.get("booking_platform")),
            "membership_model": clean_text(location.get("membership_model")) or "unknown",
            "price_scope": price_scope,
            "menu_item_count": len(menu_items),
            "priced_item_count": sum(1 for item in menu_items if item.get("price_amount") is not None),
            "llm_model": model,
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
        },
    }
    return db.upsert_listing(listing)


def open_review_queue(path: Path, *, append: bool) -> tuple[csv.DictWriter, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["created_at", "chain", "reasons", "error", "extraction_json"]
    exists = path.exists() and append
    handle = path.open("a" if exists else "w", encoding="utf-8", newline="")
    writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
    if not exists:
        writer.writeheader()
    return writer, handle


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
