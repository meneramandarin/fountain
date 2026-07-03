from __future__ import annotations

import argparse
import csv
import json
import multiprocessing as mp
import os
import sqlite3
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests

from .extract import clean_text, page_title, soup_from_html, visible_text
from .fetch import DEFAULT_HEADERS
from .scrape_menu_enrichment import (
    CANONICAL_DB,
    COMMON_PATHS,
    DB_DIR,
    DEFAULT_MODEL,
    EXPORT_DIR,
    EXTRACTION_SCHEMA,
    KNOWN_DIRECTORY_DOMAINS,
    MENU_LINK_RE,
    OPENROUTER_CHAT_COMPLETIONS_URL,
    PageContext,
    TargetLocation,
    combine_where,
    compact_json_ld,
    domain_for,
    fetch_text_with_hard_timeout,
    load_listing_keys_from_dbs,
    normalize_menu_items,
    normalize_url,
    now_iso,
    parse_json_object,
    qa_check,
    query_worklist,
    record_error,
    site_root,
    source_where_clause,
    target_from_row,
    write_discovered_locations,
    write_listing,
)
from .storage import SourceDatabase


SOURCE_SLUG_PREFIX = "menu_enrichment_agent"

WEAK_SOURCE_SLUGS = [
    "bioedge_clinics",
    "bookimed_longevity",
    "spannr",
    "bookimed_longevity_turkey",
    "bookimed_longevity_thailand",
    "immortality_clinic",
    "bookimed_longevity_korea",
    "gangnam_medical_tourism",
    "biohacking_map",
    "mymeditravel_regenerative_turkey",
    "stem_cell_authority",
    "hbot_canada_providers",
    "hbot_uk_providers",
    "hbot_us_providers",
    "hbot_ireland_providers",
    "hbot_australia_providers",
    "dexa_us_scan_providers",
    "vo2_max_us_test_providers",
    "dexa_australia_scan_providers",
    "vo2_max_australia_test_providers",
    "dexa_canada_scan_providers",
    "vo2_max_uk_test_providers",
    "vo2_max_canada_test_providers",
    "dexa_uk_scan_providers",
    "dexa_ireland_scan_providers",
    "vo2_max_ireland_test_providers",
    "korea_health_pages_medical_tourism_services",
    "mayo_executive_health_locations",
    "medical_travel_market_longevity_programs",
    "longevity_technology_clinics",
    "world_longevity_clinics",
    "mymeditravel_regenerative_thailand",
    "placidway_antiaging_thailand",
    "placidway_antiaging_turkey",
    "placidway_antiaging_south_korea",
    "korea_health_pages_anti_aging_gangnam",
    "korea_health_pages_iv_drip",
    "korea_health_pages_prp_skin",
    "korea_health_pages_rejuran",
    "korea_health_pages_stem_cell",
    "korea_health_pages_regenerative_medicine",
    "placidway_stem_cell_thailand",
    "placidway_stem_cell_turkey",
    "placidway_stem_cell_south_korea",
    "mymeditravel_regenerative_southkorea",
    "longevita_clinics",
    "istanbul_med_assist_stem_cell_longevity",
    "istanbul_stem_cell_aging",
    "longevity_suite_istanbul_biohacking",
    "meditrip_seoul",
    "mymeditravel_antiaging_stemcell_bangkok",
    "mymeditravel_antiaging_stemcell_thailand",
    "mymeditravel_antiaging_stemcell_turkey",
    "mymeditravel_chaum_medical_center",
    "turkey_healthcare_group_regenerative",
    "uniclinics_turkey_clinics",
]

PLANNER_SYSTEM = """You are a web research agent for healthcare menu enrichment.
Given one clinic/provider target, decide exactly what to search and which URLs to inspect.
Return only JSON with:
{"search_queries": [string], "urls_to_fetch": [string], "reason": string}

Rules:
- Always include queries likely to find the provider's own official site and pricing/service/menu pages.
- Prefer the provider's own domain over directories and marketplaces.
- Include the supplied website if it might be the provider's site, even if imperfect.
- Do not extract the final menu in this step.
"""

EXTRACTOR_SYSTEM = """You are an autonomous menu enrichment agent. You receive search results and fetched page observations for one clinic/provider.
Return only valid JSON matching the supplied schema.

Rules:
- Do not invent services, prices, contacts, addresses, or currencies.
- confirmed_own_site must be true only when observations plausibly describe the target provider's own official site.
- If observations are directories, marketplaces, unrelated pages, or too weak to confirm the provider, set confirmed_own_site=false.
- Extract granular menu/service items, including variants, dose, duration, quantity, package, and prices when present.
- Use null for missing price_amount. A no-price menu item is still useful if the site truly offers it.
- source_url must be the observation URL where the item/detail appeared.
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OpenRouter-first menu enrichment agents.")
    parser.add_argument("--canonical-db", type=Path, default=CANONICAL_DB)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--review-queue", type=Path, required=True)
    parser.add_argument("--source-slug", action="append", default=[])
    parser.add_argument("--skip-db", action="append", type=Path, default=[])
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--shard-index", type=int, required=True)
    parser.add_argument("--shard-count", type=int, required=True)
    parser.add_argument("--model", default=os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL))
    parser.add_argument("--llm-timeout", type=int, default=120)
    parser.add_argument("--fetch-timeout", type=int, default=10)
    parser.add_argument("--max-observation-chars", type=int, default=90000)
    parser.add_argument("--reset", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required")
    if args.reset and args.db.exists():
        args.db.unlink()
    db = SourceDatabase(args.db)
    db.conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS run_errors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phase TEXT NOT NULL,
            target_key TEXT,
            url TEXT,
            error TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    source_slug = args.db.stem
    db.set_metadata(
        {
            "source_slug": source_slug,
            "source_name": "Menu Enrichment Agent",
            "model": args.model,
            "started_at": now_iso(),
        }
    )
    review_writer, review_handle = open_review_queue(args.review_queue, reset=args.reset)
    targets = load_targets(args)
    totals = {"written": 0, "flagged": 0, "items": 0, "priced": 0, "input": 0, "output": 0}
    try:
        for index, target in enumerate(targets, start=1):
            try:
                result = run_agent(target, api_key, args)
                totals["input"] += result["usage"]["input_tokens"]
                totals["output"] += result["usage"]["output_tokens"]
                menu_items = normalize_menu_items(result["extraction"].get("menu_items"))
                pages = result["pages"]
                qa_reasons = qa_check(result["extraction"], pages, menu_items)
                result_for_write = {
                    "start_url": result["start_url"],
                    "pages": pages,
                    "extraction": result["extraction"],
                    "menu_items": menu_items,
                    "input_tokens": result["usage"]["input_tokens"],
                    "output_tokens": result["usage"]["output_tokens"],
                    "model": args.model,
                }
                if qa_reasons:
                    write_review_row(review_writer, target, qa_reasons, result["extraction"], pages, None)
                    totals["flagged"] += 1
                else:
                    listing_id = write_listing(db, target, result_for_write)
                    write_discovered_locations(db, target, result_for_write, listing_id)
                    db.conn.execute(
                        "UPDATE listings SET source_slug = ? WHERE id = ?",
                        (source_slug, listing_id),
                    )
                    totals["written"] += 1
                    totals["items"] += len(menu_items)
                    totals["priced"] += sum(1 for item in menu_items if item.get("price_amount") is not None)
            except Exception as exc:
                record_error(db, "agent", target.key, target.website, repr(exc))
                write_review_row(review_writer, target, ["exception"], None, [], repr(exc))
                totals["flagged"] += 1
            db.conn.commit()
            review_handle.flush()
            print(
                f"[{index}/{len(targets)}] {target.name} written={totals['written']} "
                f"flagged={totals['flagged']} items={totals['items']} priced={totals['priced']} "
                f"tokens={totals['input']}/{totals['output']}",
                flush=True,
            )
    finally:
        db.set_metadata({"completed_at": now_iso(), "totals": totals})
        db.close()
        review_handle.close()
    print("Agent menu enrichment summary")
    print("=============================")
    print(f"database: {args.db}")
    print(f"review_queue: {args.review_queue}")
    print(f"targets processed: {len(targets)}")
    print(f"QA-passing listings written: {totals['written']}")
    print(f"flagged for review: {totals['flagged']}")
    print(f"menu items written: {totals['items']} ({totals['priced']} priced)")
    print(f"LLM tokens: input={totals['input']}, output={totals['output']}")


def load_targets(args: argparse.Namespace) -> list[TargetLocation]:
    reviewed_keys = load_listing_keys_from_dbs(args.skip_db)
    source_slugs = args.source_slug or WEAK_SOURCE_SLUGS
    rows: list[sqlite3.Row] = []
    conn = sqlite3.connect(args.canonical_db)
    conn.row_factory = sqlite3.Row
    try:
        source_filter = source_where_clause(source_slugs)
        weak_filter = "(offering_count = 0 OR offering_count = 1 OR priced_count = 0 OR (price_text IS NOT NULL AND price_text != ''))"
        rows = query_worklist(
            conn,
            where=combine_where(weak_filter, source_filter),
            source_slugs=source_slugs,
            limit=max(args.limit * args.shard_count * 4, args.limit + args.offset + 200),
            offset=args.offset,
        )
    finally:
        conn.close()
    targets: list[TargetLocation] = []
    seen: set[str] = set()
    for row in rows:
        target = target_from_row(row)
        if stable_shard(target.key, args.shard_count) != args.shard_index:
            continue
        if target.key in reviewed_keys or target.key in seen:
            continue
        seen.add(target.key)
        targets.append(target)
        if len(targets) >= args.limit:
            break
    return targets


def run_agent(target: TargetLocation, api_key: str, args: argparse.Namespace) -> dict[str, Any]:
    plan_prompt = json.dumps(
        {
            "target": target_payload(target),
            "known_directory_domains": sorted(KNOWN_DIRECTORY_DOMAINS),
        },
        ensure_ascii=True,
        sort_keys=True,
    )
    plan_json, plan_usage = openrouter_json(
        api_key,
        args.model,
        PLANNER_SYSTEM,
        plan_prompt,
        args.llm_timeout,
    )
    observations = collect_observations(target, plan_json, args)
    extraction_prompt = build_extraction_prompt(target, observations, args.max_observation_chars)
    extraction, extraction_usage = openrouter_json(
        api_key,
        args.model,
        EXTRACTOR_SYSTEM,
        extraction_prompt,
        args.llm_timeout,
        schema=EXTRACTION_SCHEMA,
    )
    pages = observations_to_pages(observations)
    return {
        "start_url": observations[0]["url"] if observations else target.website,
        "pages": pages,
        "extraction": extraction,
        "usage": {
            "input_tokens": plan_usage["input_tokens"] + extraction_usage["input_tokens"],
            "output_tokens": plan_usage["output_tokens"] + extraction_usage["output_tokens"],
        },
    }


def collect_observations(target: TargetLocation, plan: dict[str, Any], args: argparse.Namespace) -> list[dict[str, Any]]:
    urls: list[str] = []
    if target.website:
        urls.append(target.website)
        normalized = normalize_url(target.website)
        if normalized:
            root = site_root(normalized)
            urls.extend(urljoin(root, path) for path in COMMON_PATHS)
    for url in plan.get("urls_to_fetch") or []:
        if isinstance(url, str):
            urls.append(url)
    for query in plan.get("search_queries") or []:
        if isinstance(query, str):
            urls.extend(search_urls(query, args.fetch_timeout))
    observations: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url in urls:
        normalized = normalize_url(url)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        observation = fetch_observation(normalized, args.fetch_timeout)
        if observation:
            observations.append(observation)
        if len(observations) >= 10:
            break
    return observations


def search_urls(query: str, timeout: int) -> list[str]:
    response = fetch_text_with_hard_timeout(
        "https://html.duckduckgo.com/html/",
        params={"q": query},
        headers=DEFAULT_HEADERS,
        timeout=timeout,
    )
    if response is None:
        return []
    status_code, text = response
    if status_code >= 400:
        return []
    soup = soup_from_html(text)
    urls: list[str] = []
    for tag in soup.select("a.result__a, a[href]"):
        href = tag.get("href")
        url = normalize_url(href)
        if not url:
            continue
        domain = domain_for(url)
        if not domain or domain in KNOWN_DIRECTORY_DOMAINS:
            continue
        urls.append(url)
        if len(urls) >= 5:
            break
    return urls


def fetch_observation(url: str, timeout: int) -> dict[str, Any] | None:
    try:
        response = requests.get(url, headers=DEFAULT_HEADERS, timeout=timeout)
    except requests.RequestException:
        return None
    content_type = response.headers.get("content-type", "")
    text = response.text or ""
    if response.status_code >= 400 or ("html" not in content_type.lower() and not text.lstrip().startswith("<")):
        return {
            "url": url,
            "final_url": response.url,
            "status_code": response.status_code,
            "title": None,
            "text": "",
            "links": [],
        }
    soup = soup_from_html(text)
    body_text = visible_text(soup) or ""
    links = []
    for tag in soup.find_all("a", href=True):
        label = clean_text(tag.get_text(" ") or tag.get("aria-label") or "")
        href = tag.get("href")
        if label and href and MENU_LINK_RE.search(label + " " + href):
            links.append(urljoin(response.url, href))
    return {
        "url": url,
        "final_url": response.url,
        "status_code": response.status_code,
        "title": page_title(soup),
        "text": body_text[:18000],
        "links": links[:20],
    }


def observations_to_pages(observations: list[dict[str, Any]]) -> list[PageContext]:
    pages: list[PageContext] = []
    for observation in observations:
        text = observation.get("text") or ""
        pages.append(
            PageContext(
                requested_url=observation.get("url") or "",
                final_url=observation.get("final_url") or observation.get("url") or "",
                status_code=int(observation.get("status_code") or 0),
                title=observation.get("title"),
                text=text,
                json_ld=[],
                prices_found=[],
                short_text=len(text) < 500,
            )
        )
    return pages


def build_extraction_prompt(target: TargetLocation, observations: list[dict[str, Any]], max_chars: int) -> str:
    payload = {
        "schema": EXTRACTION_SCHEMA,
        "target": target_payload(target),
        "observations": [
            {
                "url": item.get("final_url") or item.get("url"),
                "status_code": item.get("status_code"),
                "title": item.get("title"),
                "text": item.get("text"),
                "menu_like_links": item.get("links"),
            }
            for item in observations
        ],
    }
    text = json.dumps(payload, ensure_ascii=True, sort_keys=True)
    if len(text) > max_chars:
        text = text[:max_chars] + "\n...[truncated]"
    return text


def target_payload(target: TargetLocation) -> dict[str, Any]:
    return {
        "id": target.id,
        "name": target.name,
        "website": target.website,
        "address": target.address,
        "locality": target.locality,
        "region": target.region,
        "country_code": target.country_code,
        "current_offering_count": target.offering_count,
        "current_priced_count": target.priced_count,
        "current_price_text": target.price_text,
    }


def openrouter_json(
    api_key: str,
    model: str,
    system: str,
    prompt: str,
    timeout: int,
    *,
    schema: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, int]]:
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
    }
    if schema:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "menu_enrichment_agent", "strict": False, "schema": schema},
        }
    response = requests.post(
        OPENROUTER_CHAT_COMPLETIONS_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://fountain.local",
            "X-Title": "Fountain Menu Enrichment Agent",
        },
        json=body,
        timeout=timeout,
    )
    if response.status_code == 400 and schema:
        body["response_format"] = {"type": "json_object"}
        response = requests.post(
            OPENROUTER_CHAT_COMPLETIONS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://fountain.local",
                "X-Title": "Fountain Menu Enrichment Agent",
            },
            json=body,
            timeout=timeout,
        )
    if response.status_code >= 400:
        raise RuntimeError(f"OpenRouter HTTP {response.status_code}: {response.text[:500]}")
    value = response.json()
    content = value.get("choices", [{}])[0].get("message", {}).get("content") or "{}"
    parsed = parse_json_object(content) or {}
    usage = value.get("usage") or {}
    return parsed, {
        "input_tokens": int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0),
        "output_tokens": int(usage.get("completion_tokens") or usage.get("output_tokens") or 0),
    }


def open_review_queue(path: Path, *, reset: bool) -> tuple[csv.DictWriter, Any]:
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
    handle = path.open("w" if reset else "a", encoding="utf-8", newline="")
    writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
    if reset or path.stat().st_size == 0:
        writer.writeheader()
    return writer, handle


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


def stable_shard(value: str, shard_count: int) -> int:
    import hashlib

    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()
    return int(digest[:12], 16) % shard_count


if __name__ == "__main__":
    main()
