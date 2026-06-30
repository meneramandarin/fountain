from __future__ import annotations

import argparse
import csv
import hashlib
import json
import mimetypes
import re
import sys
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .extract import (
    canonical_url,
    clean_text,
    collect_links,
    extract_json_ld,
    extract_images,
    flatten_json_ld,
    is_listing_schema,
    listing_from_page,
    schema_to_listing,
    soup_from_html,
    visible_text,
)
from .fetch import Fetcher
from .sources import SOURCES, SourceConfig
from .storage import SourceDatabase


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DB_DIR = DATA_DIR / "databases"
EXPORT_DIR = DATA_DIR / "exports"
MEDIA_DIR = DATA_DIR / "media"


def scrape_source(config: SourceConfig, force_generic: bool = False, download_images: bool = True) -> dict[str, Any]:
    db_path = DB_DIR / f"{config.slug}.sqlite"
    if db_path.exists():
        db_path.unlink()
    export_path = EXPORT_DIR / config.slug
    export_path.mkdir(parents=True, exist_ok=True)
    db = SourceDatabase(db_path)
    db.set_metadata(
        {
            "slug": config.slug,
            "name": config.name,
            "seeds": config.seeds,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "max_pages": config.max_pages,
            "max_depth": config.max_depth,
        }
    )
    fetcher = Fetcher(delay_seconds=config.delay_seconds)
    queue = deque((seed, 0) for seed in config.seeds)
    queued = {seed for seed in config.seeds}
    visited: set[str] = set()
    listings_seen: set[str] = set()
    pages_ok = 0
    errors: list[dict[str, Any]] = []
    consecutive_access_blocks = 0

    if config.slug == "biohacking_map":
        for listing in scrape_biohacking_api(fetcher, db, config):
            if download_images:
                attach_downloaded_images(fetcher, listing, config.slug)
            db.upsert_listing(listing)
    if config.slug == "longevity_technology_clinics":
        for listing in scrape_longevity_technology_api(fetcher, db, config):
            if download_images:
                attach_downloaded_images(fetcher, listing, config.slug)
            db.upsert_listing(listing)

    while queue and len(visited) < config.max_pages:
        url, depth = queue.popleft()
        if url in visited:
            continue
        visited.add(url)
        try:
            result = fetcher.get(url)
        except Exception as exc:
            errors.append({"url": url, "error": repr(exc)})
            continue
        db.upsert_page(result.to_page_row())
        if config.slug == "realself_providers" and is_access_block_response(result.status_code, result.content_type, result.text):
            consecutive_access_blocks += 1
            if consecutive_access_blocks >= 5:
                errors.append({"url": url, "error": "stopped_after_repeated_realself_access_denied"})
                break
        else:
            consecutive_access_blocks = 0
        if result.status_code >= 400 or "text/html" not in result.content_type:
            continue
        pages_ok += 1
        soup = soup_from_html(result.text)
        page_url = result.final_url or url

        for listing in extract_listings_from_page(soup, page_url, config, force_generic=force_generic):
            source_url = listing.get("source_url")
            name = listing.get("name")
            if not source_url or not name:
                continue
            listing["source_url"] = normalize_listing_url(source_url)
            listings_seen.add(source_url)
            if download_images:
                attach_downloaded_images(fetcher, listing, config.slug)
            db.upsert_listing(listing)

        if depth >= config.max_depth:
            continue
        if config.slug == "bookimed_longevity" and urlparse(page_url).path.startswith("/clinic/"):
            continue
        if config.slug == "bookimed_longevity_doctors" and urlparse(page_url).path.startswith("/doctor/"):
            continue
        if config.slug == "bioedge_clinics" and is_bioedge_detail_page(page_url):
            continue
        if config.slug == "concierge_doctors_near_me" and urlparse(page_url).path.startswith("/listing/"):
            continue
        if config.slug == "stem_cell_authority" and is_stem_cell_detail_page(page_url):
            continue
        if config.slug == "mayo_executive_health_locations" and is_mayo_location_detail_page(page_url):
            continue
        if config.slug == "realself_providers" and is_realself_profile_page(page_url):
            continue
        for link in collect_links(soup, page_url, config.domains()):
            if link in queued or link in visited:
                continue
            if should_follow(link, config):
                queued.add(link)
                queue.append((link, depth + 1))

    db.conn.commit()
    listing_count = db.conn.execute("SELECT COUNT(*) AS n FROM listings").fetchone()["n"]
    image_count = db.conn.execute("SELECT COUNT(*) AS n FROM images").fetchone()["n"]
    review_count = db.conn.execute("SELECT COUNT(*) AS n FROM reviews").fetchone()["n"]
    export_source(db, export_path)
    db.close()
    return {
        "slug": config.slug,
        "db_path": str(db_path),
        "export_path": str(export_path),
        "pages_visited": len(visited),
        "pages_ok": pages_ok,
        "listings": listing_count,
        "images": image_count,
        "reviews": review_count,
        "errors": errors[:20],
    }


def extract_listings_from_page(
    soup,
    page_url: str,
    config: SourceConfig,
    force_generic: bool = False,
) -> list[dict[str, Any]]:
    source_specific = [] if force_generic else source_specific_listings(soup, page_url, config)
    listings = source_specific[:]
    raw_text = visible_text(soup)
    for item in flatten_json_ld(extract_json_ld(soup)):
        if config.slug in {"bookimed_longevity_doctors", "realself_providers"}:
            continue
        if not is_listing_schema(item):
            continue
        if config.slug in {"bookimed_longevity", "bookimed_longevity_doctors"} and clean_text(item.get("name")) and clean_text(item.get("name")).lower().startswith("bookimed"):
            continue
        listing = schema_to_listing(item, page_url, config.slug, raw_text)
        if listing.get("name"):
            listings.append(listing)
    if not listings and config.slug not in {"biohacking_map", "stem_cell_authority"} and is_probable_listing_page(soup, page_url, config):
        if not (config.slug == "exec_health" and urlparse(page_url).path.rstrip("/") == "/directory"):
            listings.append(listing_from_page(soup, page_url, config.slug))
    if not listings and config.slug == "longevity_technology_clinics" and is_longevity_technology_profile(page_url):
        listings.append(extract_longevity_technology_profile(soup, page_url, config.slug))
    merged = merge_duplicate_listings(listings)
    for listing in merged:
        enrich_listing_from_page(listing, soup, page_url, config)
    return merged


def scrape_biohacking_api(fetcher: Fetcher, db: SourceDatabase, config: SourceConfig) -> list[dict[str, Any]]:
    api_url = "https://thebiohackingmap.com/api/clinics"
    try:
        result = fetcher.get(api_url)
    except Exception:
        return []
    db.upsert_page(result.to_page_row())
    try:
        payload = json.loads(result.text)
    except json.JSONDecodeError:
        return []
    clinics = payload.get("clinics") if isinstance(payload, dict) else payload
    if not isinstance(clinics, list):
        return []
    listings = []
    for clinic in clinics:
        if not isinstance(clinic, dict):
            continue
        slug = clinic.get("slug") or clinic.get("id") or slugify(clinic.get("name") or "")
        source_url = f"https://thebiohackingmap.com/clinic/{slug}/"
        treatments = clinic.get("treatments") or []
        procedures = {
            "protocols": clinic.get("protocols"),
            "techSpecs": clinic.get("techSpecs"),
            "foundationalTreatments": clinic.get("foundationalTreatments"),
            "advancedTreatments": clinic.get("advancedTreatments"),
            "anchorService": clinic.get("anchorService"),
            "primaryGoal": clinic.get("primaryGoal"),
        }
        listing = {
            "source_slug": config.slug,
            "source_url": source_url,
            "name": clean_text(clinic.get("name")),
            "description": clean_text(clinic.get("summary") or (clinic.get("source") or {}).get("description")),
            "address": clean_text(clinic.get("location")),
            "locality": clean_text(clinic.get("city")),
            "region": clean_text(clinic.get("region")),
            "postal_code": None,
            "country": clean_text(clinic.get("country")),
            "phone": None,
            "email": None,
            "website": clean_text(clinic.get("websiteUrl") or clinic.get("leadUrl")),
            "latitude": None,
            "longitude": None,
            "price_text": clean_text(clinic.get("priceTier")),
            "rating": clean_text(clinic.get("rating")),
            "review_count": None,
            "image_url": None,
            "images": [],
            "services_json": treatments,
            "procedures_json": procedures,
            "raw_text": clean_text(" ".join(str(v) for v in [clinic.get("name"), clinic.get("location"), clinic.get("summary")] if v)),
            "raw_json": clinic,
            "reviews": [],
            "fields": {
                "category": clinic.get("category"),
                "service_model": clinic.get("serviceModel"),
                "medical_oversight": clinic.get("medicalOversight"),
                "verification": clinic.get("verification"),
                "premium_tier": clinic.get("premiumTier"),
                "metadata_tags": clinic.get("metadataTags"),
                "booking_url": clinic.get("bookingUrl"),
                "lead_url": clinic.get("leadUrl"),
                "source_record": clinic.get("source"),
            },
            "extracted_at": datetime.now(timezone.utc).isoformat(),
        }
        if listing["name"]:
            listings.append(listing)
    return listings


def scrape_longevity_technology_api(fetcher: Fetcher, db: SourceDatabase, config: SourceConfig) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    page = 1
    while True:
        api_url = f"https://longevity.technology/clinics/wp-json/wp/v2/clinic?per_page=100&page={page}&_embed=1"
        try:
            result = fetcher.get(api_url)
        except Exception:
            break
        db.upsert_page(result.to_page_row())
        try:
            payload = json.loads(result.text)
        except json.JSONDecodeError:
            break
        if not isinstance(payload, list):
            break
        for post in payload:
            if isinstance(post, dict):
                listings.append(longevity_technology_post_to_listing(post, config.slug))
        if len(payload) < 100:
            break
        page += 1
    return [listing for listing in listings if listing.get("name")]


def longevity_technology_post_to_listing(post: dict[str, Any], source_slug: str) -> dict[str, Any]:
    title = clean_text((post.get("title") or {}).get("rendered"))
    link = post.get("link")
    raw_html = " ".join(
        part
        for part in [
            (post.get("excerpt") or {}).get("rendered"),
            (post.get("content") or {}).get("rendered"),
            post.get("yoast_head"),
        ]
        if part
    )
    text = visible_text(soup_from_html(raw_html)) if raw_html else None
    class_list = post.get("class_list") or []
    offerings = taxonomy_values(class_list, "clinic_offering-")
    categories = taxonomy_values(class_list, "clinic_category-")
    locations = taxonomy_values(class_list, "branch-location-")
    images = wordpress_embedded_images(post, link or "")
    price = extract_price_text(text)
    return {
        "source_slug": source_slug,
        "source_url": normalize_listing_url(link) if link else f"https://longevity.technology/clinics/wp-json/wp/v2/clinic/{post.get('id')}",
        "name": title,
        "description": text[:1000] if text else None,
        "address": ", ".join(locations) if locations else None,
        "locality": locations[0] if locations else None,
        "region": None,
        "postal_code": None,
        "country": None,
        "phone": None,
        "email": None,
        "website": None,
        "latitude": None,
        "longitude": None,
        "price_text": price,
        "rating": None,
        "review_count": None,
        "image_url": images[0]["url"] if images else None,
        "images": images,
        "services_json": offerings,
        "procedures_json": {"categories": categories, "offerings": offerings, "locations": locations},
        "raw_text": text,
        "raw_json": post,
        "reviews": [],
        "fields": {
            "wp_id": post.get("id"),
            "slug": post.get("slug"),
            "status": post.get("status"),
            "protected": (post.get("excerpt") or {}).get("protected"),
            "clinic_categories": categories,
            "clinic_offerings": offerings,
            "branch_locations": locations,
            "featured_media": post.get("featured_media"),
        },
        "extracted_at": datetime.now(timezone.utc).isoformat(),
    }


def taxonomy_values(class_list: list[str], prefix: str) -> list[str]:
    values = []
    for class_name in class_list:
        if isinstance(class_name, str) and class_name.startswith(prefix):
            values.append(class_name[len(prefix):].replace("-", " "))
    return sorted(set(values))


def wordpress_embedded_images(post: dict[str, Any], page_url: str) -> list[dict[str, Any]]:
    embedded = post.get("_embedded") or {}
    media_items = embedded.get("wp:featuredmedia") or []
    images = []
    for media in media_items:
        if not isinstance(media, dict):
            continue
        sizes = ((media.get("media_details") or {}).get("sizes") or {})
        preferred = sizes.get("clinic-gallery") or sizes.get("medium_large") or sizes.get("large") or {}
        url = preferred.get("source_url") or media.get("source_url")
        if url:
            images.append({"url": url, "alt": clean_text(media.get("alt_text") or (media.get("title") or {}).get("rendered")), "source_page_url": page_url})
    return images


def is_access_block_response(status_code: int, content_type: str | None, text: str | None) -> bool:
    if status_code != 403:
        return False
    body = (text or "")[:2000].lower()
    ctype = (content_type or "").lower()
    return (
        "perimeterx" in body
        or "pxdz" in body
        or "access has been denied" in body
        or "please verify you are a human" in body
        or ("application/json" in ctype and "captcha" in body)
    )


def source_specific_listings(soup, page_url: str, config: SourceConfig) -> list[dict[str, Any]]:
    if config.slug == "bookimed_longevity":
        if urlparse(page_url).path.startswith("/clinic/"):
            return []
        return extract_bookimed_cards(soup, page_url, config.slug)
    if config.slug == "bookimed_longevity_doctors":
        if urlparse(page_url).path.startswith("/doctor/"):
            return [extract_bookimed_doctor_profile(soup, page_url, config.slug)]
        return extract_bookimed_doctor_cards(soup, page_url, config.slug)
    if config.slug == "longevitydocs_directory":
        return extract_longevitydocs_cards(soup, page_url, config.slug)
    if config.slug == "bioedge_clinics":
        if is_bioedge_detail_page(page_url):
            return [extract_bioedge_profile(soup, page_url, config.slug)]
        return extract_bioedge_cards(soup, page_url, config.slug)
    if config.slug == "concierge_doctors_near_me":
        if urlparse(page_url).path.startswith("/listing/"):
            return [extract_concierge_profile(soup, page_url, config.slug)]
        return extract_concierge_cards(soup, page_url, config.slug)
    if config.slug == "best_executive_physical_programs":
        return extract_best_executive_program_cards(soup, page_url, config.slug)
    if config.slug == "stem_cell_authority":
        return extract_stem_cell_authority_cards(soup, page_url, config.slug)
    if config.slug == "mayo_executive_health_locations":
        return extract_mayo_executive_health_locations(soup, page_url, config.slug)
    if config.slug == "fountain_life_best_longevity_clinics_blog":
        return extract_fountain_life_ranked_clinics(soup, page_url, config.slug)
    if config.slug == "longevity_technology_clinics":
        return extract_longevity_technology_cards(soup, page_url, config.slug)
    if config.slug == "realself_providers":
        if is_realself_profile_page(page_url):
            listing = extract_realself_profile(soup, page_url, config.slug)
            return [listing] if listing else []
        return extract_realself_directory_cards(soup, page_url, config.slug)
    if config.slug == "biohacking_map":
        return extract_directory_cards(soup, page_url, config.slug, selectors=[".directorist-listing-single", ".listing-card", "article"])
    if config.slug == "world_longevity_clinics":
        return extract_directory_cards(soup, page_url, config.slug, selectors=['a.clinic-card[href*="/clinics/"]'])
    if config.slug == "immortality_clinic":
        return extract_directory_cards(soup, page_url, config.slug, selectors=['a[href*="/clinic/"]'])
    if config.slug == "spannr":
        return extract_directory_cards(soup, page_url, config.slug, selectors=[".marketplace-related-card", 'a[href*="/marketplace/clinic/"]', 'a[href*="/marketplace/retreat/"]'])
    if config.slug == "exec_health":
        listing = extract_exec_health_city_page(soup, page_url, config.slug)
        return [listing] if listing else []
    return extract_directory_cards(soup, page_url, config.slug, selectors=[".listing", ".listing-card", ".clinic", "article"])


def extract_directory_cards(soup, page_url: str, source_slug: str, selectors: list[str]) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    seen_urls = set()
    for selector in selectors:
        for card in soup.select(selector):
            link = card if getattr(card, "name", None) == "a" and card.get("href") else card.find("a", href=True)
            heading = card.find(["h2", "h3", "h4"]) or link
            name = clean_text(heading.get_text(" ")) if heading else None
            href = link["href"] if link else page_url
            source_url = _join(page_url, href)
            if not name or source_url in seen_urls:
                continue
            seen_urls.add(source_url)
            text = clean_text(card.get_text(" "))
            image = None
            img = card.find("img")
            if img and (img.get("src") or img.get("data-src")):
                image = _join(page_url, img.get("src") or img.get("data-src"))
            price = extract_price_text(text)
            rating, review_count = extract_rating_review_count(text)
            listings.append(
                {
                    "source_slug": source_slug,
                    "source_url": source_url,
                    "name": name,
                    "description": text,
                    "address": None,
                    "locality": None,
                    "region": None,
                    "postal_code": None,
                    "country": None,
                    "phone": None,
                    "email": None,
                    "website": None,
                    "latitude": None,
                    "longitude": None,
                    "price_text": price,
                    "rating": rating,
                    "review_count": review_count,
                    "image_url": image,
                    "images": [{"url": image, "alt": None, "source_page_url": page_url}] if image else [],
                    "services_json": None,
                    "procedures_json": None,
                    "raw_text": text,
                    "raw_json": {},
                    "reviews": [],
                    "fields": {"card_text": text, "card_source_page": page_url},
                    "extracted_at": datetime.now(timezone.utc).isoformat(),
                }
            )
    return listings


def base_listing(
    source_slug: str,
    source_url: str,
    name: str | None,
    *,
    description: str | None = None,
    address: str | None = None,
    locality: str | None = None,
    region: str | None = None,
    postal_code: str | None = None,
    country: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    website: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    price_text: str | None = None,
    rating: str | None = None,
    review_count: str | None = None,
    images: list[dict[str, Any]] | None = None,
    services_json: Any = None,
    procedures_json: Any = None,
    raw_text: str | None = None,
    raw_json: Any = None,
    reviews: list[dict[str, Any]] | None = None,
    fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    images = images or []
    return {
        "source_slug": source_slug,
        "source_url": source_url,
        "name": clean_text(name),
        "description": clean_text(description),
        "address": clean_text(address),
        "locality": clean_text(locality),
        "region": clean_text(region),
        "postal_code": clean_text(postal_code),
        "country": clean_text(country),
        "phone": clean_text(phone),
        "email": clean_text(email),
        "website": clean_text(website),
        "latitude": latitude,
        "longitude": longitude,
        "price_text": clean_text(price_text),
        "rating": clean_text(rating),
        "review_count": clean_text(review_count),
        "image_url": images[0]["url"] if images else None,
        "images": images,
        "services_json": services_json,
        "procedures_json": procedures_json,
        "raw_text": clean_text(raw_text),
        "raw_json": raw_json or {},
        "reviews": reviews or [],
        "fields": fields or {},
        "extracted_at": datetime.now(timezone.utc).isoformat(),
    }


def extract_longevitydocs_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    for card in soup.select(".doctor-card"):
        link = card.select_one(".doctor-card__link[href]") or card.find("a", href=True)
        name = _text_one(card, ".doctor-card__name")
        source_url = _join(page_url, link["href"]) if link else f"{page_url}#{slugify(name or 'doctor')}"
        title = _text_one(card, ".doctor-card__title")
        practice = _text_one(card, ".doctor-card__practice")
        location = _text_one(card, ".doctor-card__location")
        specialties = _texts(card, ".doctor-card__specialty-tag")
        treatments = _texts(card, ".doctor-card__treatment")
        image = _first_image(card, page_url, source_page_url=page_url)
        raw_text = clean_text(card.get_text(" "))
        listing = base_listing(
            source_slug,
            source_url,
            name,
            description=raw_text,
            address=location,
            locality=location,
            images=[image] if image else [],
            services_json=treatments,
            procedures_json={"specialties": specialties, "practice": practice},
            raw_text=raw_text,
            fields={
                "record_type": "physician_directory_card",
                "degree_or_title": title,
                "practice": practice,
                "specialties": specialties,
                "treatments": treatments,
                "card_source_page": page_url,
            },
        )
        if listing["name"]:
            listings.append(listing)
    return listings


def extract_bioedge_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    seen = set()
    for card in soup.select('a[href^="/clinics/"]'):
        href = card.get("href")
        if not href or href.rstrip("/") == "/clinics":
            continue
        source_url = _join(page_url, href)
        if source_url in seen:
            continue
        seen.add(source_url)
        raw_text = clean_text(card.get_text(" "))
        name = _text_one(card, ".font-semibold") or (raw_text.split("|", 1)[0] if raw_text else None)
        description = _text_one(card, "p") or raw_text
        tags = [
            text
            for text in _texts(card, ".inline-flex")
            if text and text.lower() not in {"next", "previous"}
        ]
        phone = extract_phone(raw_text)
        location = None
        distance = None
        location_match = re.search(r"\|\s*([^|]+?)\s*·\s*([\d.]+)\s*mi\b", raw_text or "", re.I)
        if location_match:
            location = clean_text(location_match.group(1))
            distance = clean_text(location_match.group(2))
        city, region = parse_city_region(location)
        listing = base_listing(
            source_slug,
            source_url,
            name,
            description=description,
            address=location,
            locality=city,
            region=region,
            phone=phone,
            services_json=tags,
            procedures_json={"tags": tags},
            raw_text=raw_text,
            fields={
                "record_type": "clinic_card",
                "tags": tags,
                "distance_miles_from_search_origin": distance,
                "card_source_page": page_url,
            },
        )
        if listing["name"]:
            listings.append(listing)
    return listings


def extract_bioedge_profile(soup, page_url: str, source_slug: str) -> dict[str, Any]:
    text = visible_text(soup) or ""
    name = _text_one(soup, "h1") or page_title_from_url(page_url)
    tags = [clean_text(a.get_text(" ")) for a in soup.select('a[href^="/clinics?tag="]')]
    tags = [tag for tag in dict.fromkeys(tags) if tag]
    phone = extract_labeled_value(text, "Phone") or extract_phone(text)
    address = extract_labeled_value(text, "Address")
    city, region, postal = parse_address_parts(address)
    website = extract_bioedge_clinic_website(soup, page_url)
    images = extract_bioedge_profile_images(soup, page_url, name)
    return base_listing(
        source_slug,
        page_url,
        name,
        description=extract_bioedge_about(text),
        address=address,
        locality=city,
        region=region,
        postal_code=postal,
        phone=phone,
        website=website,
        images=images,
        services_json=tags,
        procedures_json={"tags": tags},
        raw_text=text,
        fields={
            "record_type": "clinic_profile",
            "tags": tags,
            "google_maps_url": _first_link_href(soup, lambda href, label: "maps.google." in href or "View on Google Maps" in label),
            "canonical_url": canonical_url(soup, page_url),
        },
    )


def extract_concierge_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    for card in soup.select(".listing-card-container-nl, .listing-card-nl"):
        link = card.find("a", href=lambda href: href and "/listing/" in href)
        name = _text_one(card, ".listing-title-nl")
        if not link or not name:
            continue
        raw_text = clean_text(card.get_text(" "))
        address = _text_one(card, ".listing-location-nl")
        category = _text_one(card, ".listing-category-tag-nl")
        rating_text = _text_one(card, ".listing-rating-nl")
        rating, review_count = parse_rating_count(rating_text)
        city, region, postal = parse_address_parts(address)
        listings.append(
            base_listing(
                source_slug,
                _join(page_url, link["href"]),
                name,
                description=_text_one(card, ".listing-excerpt-nl") or raw_text,
                address=address,
                locality=city,
                region=region,
                postal_code=postal,
                rating=rating,
                review_count=review_count,
                services_json=[category] if category else None,
                procedures_json={"categories": [category] if category else []},
                raw_text=raw_text,
                fields={
                    "record_type": "listing_card",
                    "category": category,
                    "card_source_page": page_url,
                    "rating_text": rating_text,
                },
            )
        )
    return merge_duplicate_listings(listings)


def extract_concierge_profile(soup, page_url: str, source_slug: str) -> dict[str, Any]:
    text = visible_text(soup) or ""
    name = _text_one(soup, "h1") or page_title_from_url(page_url)
    category = _first_link_text(soup, lambda href, label: "/listing-category/" in href)
    region_link = _first_link_text(soup, lambda href, label: "/region/" in href)
    phone = _first_link_text(soup, lambda href, label: href.startswith("tel:")) or extract_phone(text)
    website = _first_link_href(soup, lambda href, label: is_external_site(href, page_url) and "google." not in href and "facebook." not in href)
    address = extract_concierge_address(text, name)
    city, region, postal = parse_address_parts(address)
    rating_summary = _text_one(soup, ".google-reviews-summary-avg") or _text_one(soup, ".google-reviews-summary")
    rating, review_count = parse_rating_count(rating_summary)
    if not rating and not review_count:
        rating, review_count = extract_rating_review_count(text)
    images = [
        image
        for image in extract_images(soup, page_url, min_width_hint=100)
        if "CDNM" not in image.get("url", "") and "logo" not in (image.get("alt") or "").lower()
    ]
    reviews = extract_concierge_reviews(soup)
    return base_listing(
        source_slug,
        canonical_url(soup, page_url),
        name,
        description=extract_concierge_overview(text, name),
        address=address,
        locality=city,
        region=region,
        postal_code=postal,
        phone=phone,
        website=website,
        rating=rating,
        review_count=review_count,
        images=images,
        services_json=[category] if category else None,
        procedures_json={"categories": [category] if category else [], "regions": [region_link] if region_link else []},
        raw_text=text,
        reviews=reviews,
        fields={
            "record_type": "listing_profile",
            "category": category,
            "region_label": region_link,
            "canonical_url": canonical_url(soup, page_url),
        },
    )


def extract_best_executive_program_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    for card in soup.select(".company-info"):
        raw_text = clean_text(card.get_text(" "))
        rank = _text_one(card, ".rank-index")
        name = _text_one(card, "h5")
        location = _text_one(card, ".company-location")
        website = _first_link_href(card, lambda href, label: is_external_site(href, page_url))
        contact_link = _first_link_href(card, lambda href, label: "/contact/" in href)
        if contact_link:
            contact_link = _join(page_url, contact_link)
        description = None
        for paragraph in card.select(".company-info-data > div p"):
            if "rank-index" in (paragraph.get("class") or []) or "company-location" in (paragraph.get("class") or []):
                continue
            description = clean_text(paragraph.get_text(" "))
            if description:
                break
        images = extract_images(card, page_url, min_width_hint=80)
        city, region, postal = parse_address_parts(location)
        listings.append(
            base_listing(
                source_slug,
                contact_link or f"{page_url}#rank-{int(rank or len(listings) + 1)}",
                name,
                description=description,
                address=location,
                locality=city,
                region=region,
                postal_code=postal,
                website=website,
                images=images,
                services_json=["Executive Physical Program"],
                procedures_json={"rank": int(rank) if rank and rank.isdigit() else None},
                raw_text=raw_text,
                fields={
                    "record_type": "independent_ranking_card",
                    "rank": int(rank) if rank and rank.isdigit() else rank,
                    "external_website": website,
                    "contact_page": contact_link,
                    "ranking_source_page": page_url,
                },
            )
        )
    return [listing for listing in listings if listing.get("name")]


def extract_bookimed_doctor_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings = extract_directory_cards(
        soup,
        page_url,
        source_slug,
        selectors=["article", 'a[href*="/doctor/"]'],
    )
    cleaned = []
    for listing in listings:
        source_url = listing.get("source_url") or ""
        if "/doctor/" not in source_url:
            continue
        text = listing.get("raw_text") or ""
        name = clean_text((listing.get("name") or "").replace("Info", ""))
        if not name or len(name) < 3:
            name = doctor_name_from_url(source_url)
        rating, review_count = extract_rating_review_count(text)
        listing.update(
            {
                "name": name,
                "rating": listing.get("rating") or rating,
                "review_count": listing.get("review_count") or review_count,
                "price_text": listing.get("price_text") or extract_price_text(text),
                "services_json": extract_bookimed_specialty_terms(text),
                "procedures_json": {"directory_page": page_url},
            }
        )
        listing.setdefault("fields", {})
        listing["fields"].update({"record_type": "doctor_card", "card_source_page": page_url})
        cleaned.append(listing)
    return merge_duplicate_listings(cleaned)


def extract_bookimed_doctor_profile(soup, page_url: str, source_slug: str) -> dict[str, Any]:
    text = visible_text(soup) or ""
    name = _text_one(soup, "h1") or doctor_name_from_url(page_url)
    rating, review_count = extract_rating_review_count(text)
    specialty = extract_labeled_value(text, "Specialization")
    workplace = extract_labeled_value(text, "Workplace")
    languages = extract_labeled_value(text, "Speaks")
    experience_match = re.search(r"\b(\d+\s+years?\s+of\s+experience)\b", text, re.I)
    consultation_match = re.search(r"Online consultations?:\s*([^$]+?)(?:Workplace:|Get a free quote|Explore package|$)", text, re.I)
    price_text = extract_price_text(text)
    clinic_link = _first_link_href(soup, lambda href, label: "/clinic/" in href)
    return base_listing(
        source_slug,
        canonical_url(soup, page_url),
        name,
        description=extract_bookimed_doctor_summary(text, name),
        address=workplace,
        price_text=price_text,
        rating=rating,
        review_count=review_count,
        images=extract_images(soup, page_url, min_width_hint=80),
        services_json=extract_bookimed_specialty_terms(text),
        procedures_json={
            "specialization": specialty,
            "workplace": workplace,
            "languages": languages,
            "online_consultation": clean_text(consultation_match.group(1)) if consultation_match else None,
            "linked_clinic": clinic_link,
        },
        raw_text=text,
        fields={
            "record_type": "doctor_profile",
            "specialization": specialty,
            "workplace": workplace,
            "languages": languages,
            "experience": clean_text(experience_match.group(1)) if experience_match else None,
            "linked_clinic": clinic_link,
        },
    )


def extract_stem_cell_authority_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    cards = soup.select(".wpbdp-listing")
    if not cards and is_stem_cell_detail_page(page_url):
        cards = [soup]
    for card in cards:
        fields = parse_wpbdp_fields(card)
        link = card.find("a", href=lambda href: href and "/business-directory/" in href and re.search(r"/business-directory/\d+/", href))
        source_url = _join(page_url, link["href"]) if link else page_url
        name = fields.get("listing_title") or _text_one(card, "h1") or (clean_text(link.get_text(" ")) if link else None)
        category = fields.get("listing_category")
        tags = split_tags(fields.get("listing_tags"))
        website = fields.get("website") or _first_link_href(card, lambda href, label: is_external_site(href, page_url))
        phone = fields.get("phone") or _first_link_text(card, lambda href, label: href.startswith("tel:"))
        address = fields.get("address") or fields.get("address_info")
        if fields.get("zip_code") and address and not address.endswith(str(fields["zip_code"])):
            address = f"{address} {fields['zip_code']}"
        address = dedupe_trailing_zip(address)
        city, region, postal = parse_address_parts(address)
        if not city and category:
            city, region = parse_city_region(category)
        image = _first_image(card, page_url, source_page_url=page_url)
        raw_text = clean_text(card.get_text(" "))
        listings.append(
            base_listing(
                source_slug,
                source_url,
                name,
                description=raw_text,
                address=address,
                locality=city,
                region=region,
                postal_code=postal or fields.get("zip_code"),
                phone=phone,
                website=website,
                images=[image] if image else [],
                services_json=tags,
                procedures_json={"tags": tags, "category": category},
                raw_text=raw_text,
                fields={
                    "record_type": "wp_business_directory_listing",
                    "listing_category": category,
                    "listing_tags": tags,
                    "wpbdp_fields": fields,
                    "card_source_page": page_url,
                },
            )
        )
    return [listing for listing in listings if listing.get("name")]


def extract_mayo_executive_health_locations(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    parsed = urlparse(page_url)
    if is_mayo_location_detail_page(page_url):
        text = visible_text(soup) or ""
        name = _text_one(soup, "h1") or page_title_from_url(page_url)
        phone = extract_phone(text)
        images = [
            image
            for image in extract_images(soup, page_url, min_width_hint=150)
            if "executive-health/images/locations" in image.get("url", "")
        ]
        city, region = parse_city_region(name)
        country = "United Kingdom" if "United Kingdom" in (name or "") else "United States"
        return [
            base_listing(
                source_slug,
                canonical_url(soup, page_url),
                f"Mayo Clinic Executive Health - {name}",
                description=extract_mayo_intro(text, name),
                address=name,
                locality=city,
                region=region,
                country=country,
                phone=phone,
                website=canonical_url(soup, page_url),
                images=images,
                services_json=["Executive Health Program"],
                procedures_json={"location_page_type": "detail"},
                raw_text=text,
                fields={
                    "record_type": "executive_health_location_detail",
                    "location_name": name,
                    "sections": extract_detail_sections(soup),
                },
            )
        ]
    if parsed.path.rstrip("/") != "/executive-health/locations":
        return []
    listings = []
    for link in soup.find_all("a", href=True):
        href = link["href"]
        label = clean_text(link.get_text(" "))
        if label != "View Location Details" or "/executive-health/locations/" not in href:
            continue
        source_url = _join(page_url, href)
        slug = source_url.rstrip("/").rsplit("/", 1)[-1]
        location_name = {
            "rochester": "Rochester, Minnesota",
            "scottsdale": "Scottsdale, Arizona",
            "jacksonville": "Jacksonville, Florida",
            "london": "London, United Kingdom",
        }.get(slug, slug.replace("-", " ").title())
        city, region = parse_city_region(location_name)
        country = "United Kingdom" if "United Kingdom" in location_name else "United States"
        listings.append(
            base_listing(
                source_slug,
                source_url,
                f"Mayo Clinic Executive Health - {location_name}",
                description=location_name,
                address=location_name,
                locality=city,
                region=region,
                country=country,
                website=source_url,
                services_json=["Executive Health Program"],
                procedures_json={"location_page_type": "overview_card"},
                raw_text=location_name,
                fields={"record_type": "executive_health_location_card", "location_slug": slug},
            )
        )
    return listings


def extract_fountain_life_ranked_clinics(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    article_title = _text_one(soup, "h1") or page_title_from_url(page_url)
    for heading in soup.find_all("h2"):
        heading_text = clean_text(heading.get_text(" "))
        match = re.match(r"(\d{1,2})\.\s+(.+?)(?:\s+[–-]\s+(.+))?$", heading_text or "")
        if not match:
            continue
        rank = int(match.group(1))
        if rank > 50:
            continue
        name = match.group(2)
        location = match.group(3)
        chunks = []
        current = heading
        while True:
            current = current.find_next_sibling()
            if current is None or current.name == "h2":
                break
            chunk = clean_text(current.get_text(" "))
            if chunk:
                chunks.append(chunk)
        section_text = clean_text(" ".join(chunks))
        services = parse_fountain_services(section_text)
        price = extract_price_text(section_text)
        city, region, postal = parse_address_parts(location)
        listings.append(
            base_listing(
                source_slug,
                f"{page_url.rstrip('/')}?rank={rank}",
                name,
                description=section_text[:1200] if section_text else None,
                address=location,
                locality=city,
                region=region,
                postal_code=postal,
                price_text=price,
                images=extract_images(soup, page_url, min_width_hint=250)[:1],
                services_json=services,
                procedures_json={"rank": rank, "article_title": article_title, "editorial_category": "best_longevity_clinics"},
                raw_text=section_text,
                fields={
                    "record_type": "editorial_ranked_blog_entry",
                    "rank": rank,
                    "article_title": article_title,
                    "article_url": page_url,
                    "location_text": location,
                },
            )
        )
    return listings


def is_realself_profile_page(page_url: str) -> bool:
    parsed = urlparse(page_url)
    return parsed.netloc.lower().endswith("realself.com") and parsed.path.startswith("/dr/")


def extract_realself_directory_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    seen_urls = set()
    context = realself_directory_context(soup, page_url)
    cards = soup.select('[class*="doctor-card_drCardContainer"]')
    if not cards:
        cards = realself_fallback_doctor_cards(soup)
    for card in cards:
        profile_link = realself_profile_link(card, page_url)
        if not profile_link:
            continue
        source_url = normalize_listing_url(profile_link)
        if source_url in seen_urls:
            continue
        seen_urls.add(source_url)
        raw_text = clean_text(card.get_text(" "))
        name = realself_card_name(card, source_url)
        rating, review_count = realself_rating_review_count(raw_text)
        location, distance = realself_card_location_distance(raw_text)
        city, region = parse_city_region(location)
        specialty = realself_card_specialty(raw_text, name)
        image = _first_image(card, page_url, source_page_url=page_url)
        review_snippet = realself_card_review_snippet(raw_text)
        listings.append(
            base_listing(
                source_slug,
                source_url,
                name,
                description=raw_text,
                address=location,
                locality=city,
                region=region,
                rating=rating,
                review_count=review_count,
                images=[image] if image else [],
                services_json=[context["provider_type_label"]] if context.get("provider_type_label") else None,
                procedures_json={
                    "directory_category": context.get("provider_type_label"),
                    "directory_city": context.get("directory_city"),
                    "directory_state": context.get("directory_state"),
                },
                raw_text=raw_text,
                fields={
                    "record_type": "realself_directory_card",
                    "specialty": specialty,
                    "directory_category": context.get("provider_type_label"),
                    "directory_city": context.get("directory_city"),
                    "directory_state": context.get("directory_state"),
                    "distance_miles": distance,
                    "review_snippet": review_snippet,
                    "card_source_page": page_url,
                },
            )
        )
    return [listing for listing in listings if listing.get("name")]


def extract_realself_profile(soup, page_url: str, source_slug: str) -> dict[str, Any] | None:
    text = visible_text(soup) or ""
    schema = realself_profile_schema(soup, page_url) or {}
    source_url = normalize_listing_url(clean_text(schema.get("url")) or canonical_url(soup, page_url))
    name = clean_text(schema.get("name")) or _text_one(soup, "h1") or doctor_name_from_url(page_url)
    addresses = realself_addresses(schema.get("address"))
    first_address = addresses[0] if addresses else {}
    address = realself_format_address(first_address)
    locality = clean_text(first_address.get("addressLocality"))
    region = clean_text(first_address.get("addressRegion"))
    postal_code = clean_text(first_address.get("postalCode"))
    country = realself_country(first_address.get("addressCountry"))
    if address and not (locality or region or postal_code):
        locality, region, postal_code = parse_address_parts(address)
    aggregate = schema.get("aggregateRating") if isinstance(schema.get("aggregateRating"), dict) else {}
    geo = realself_first_mapping(schema.get("geo"))
    same_as = realself_list(schema.get("sameAs"))
    website = next((clean_text(value) for value in same_as if clean_text(value) and "realself.com" not in clean_text(value).lower()), None)
    services = realself_service_names(schema.get("availableService"))
    specialties = realself_string_values(schema.get("medicalSpecialty"))
    credentials = realself_string_values(schema.get("hasCredential"))
    education = realself_string_values(schema.get("educationalProgram"))
    reviews = realself_schema_reviews(schema.get("reviews") or schema.get("review"))
    images = realself_profile_images(schema, soup, page_url)
    if not schema and not name:
        return None
    return base_listing(
        source_slug,
        source_url,
        name,
        description=clean_text(schema.get("description")) or realself_profile_description(text, name),
        address=address,
        locality=locality,
        region=region,
        postal_code=postal_code,
        country=country,
        phone=clean_text(schema.get("telephone")) or extract_phone(text),
        website=website,
        latitude=realself_float(geo.get("latitude")) if geo else None,
        longitude=realself_float(geo.get("longitude")) if geo else None,
        rating=clean_text(aggregate.get("ratingValue")),
        review_count=clean_text(aggregate.get("ratingCount") or aggregate.get("reviewCount")),
        images=images,
        services_json=services,
        procedures_json={
            "available_services": services,
            "medical_specialty": specialties,
            "credentials": credentials,
            "educational_programs": education,
            "addresses": addresses,
        },
        raw_text=text,
        raw_json=schema,
        reviews=reviews,
        fields={
            "record_type": "realself_provider_profile",
            "schema_types": sorted(realself_type_set(schema)),
            "medical_specialty": specialties,
            "credentials": credentials,
            "educational_programs": education,
            "addresses": addresses,
            "same_as": same_as,
            "canonical_url": canonical_url(soup, page_url),
            "profile_slug": urlparse(page_url).path.rstrip("/").rsplit("/", 1)[-1],
        },
    )


def realself_fallback_doctor_cards(soup) -> list[Any]:
    cards = []
    seen = set()
    for link in soup.find_all("a", href=lambda href: href and "/dr/" in href):
        parent = link.find_parent(
            lambda tag: bool(
                getattr(tag, "name", None)
                and tag.get("class")
                and any("doctor-card" in str(class_name) for class_name in tag.get("class", []))
            )
        )
        parent = parent or link.parent
        marker = id(parent)
        if marker in seen:
            continue
        seen.add(marker)
        cards.append(parent)
    return cards


def realself_profile_link(card, page_url: str) -> str | None:
    candidates = []
    for link in card.find_all("a", href=True):
        href = link["href"].strip()
        if "/dr/" not in href:
            continue
        url = _join(page_url, href)
        text = clean_text(link.get_text(" ")) or ""
        candidates.append((url, text))
    if not candidates:
        return None
    for url, text in candidates:
        if "#" not in url and len(text) > 3 and not re.fullmatch(r"[A-Z]{1,4}", text):
            return url
    return candidates[0][0].split("#", 1)[0]


def realself_card_name(card, source_url: str) -> str | None:
    for link in card.find_all("a", href=True):
        href = link["href"].strip()
        if "/dr/" not in href or "#" in href:
            continue
        text = clean_text(link.get_text(" "))
        if text and len(text) > 3 and not re.fullmatch(r"[A-Z]{1,4}", text):
            return text
    return doctor_name_from_url(source_url)


def realself_rating_review_count(text: str | None) -> tuple[str | None, str | None]:
    if not text:
        return None, None
    match = re.search(r"\b([1-5](?:\.\d)?)\s*\|\s*([\d,]+)\s+Reviews?\b", text, re.I)
    if match:
        return clean_text(match.group(1)), clean_text(match.group(2))
    return extract_rating_review_count(text)


def realself_card_location_distance(text: str | None) -> tuple[str | None, str | None]:
    if not text:
        return None, None
    match = re.search(r"\b([A-Z][A-Za-z .'-]+,\s+[A-Z][A-Za-z .'-]+)\s+([\d.]+)\s+miles\b", text)
    if match:
        return clean_text(match.group(1)), clean_text(match.group(2))
    location_match = re.search(r"\b([A-Z][A-Za-z .'-]+,\s+[A-Z]{2})\b", text)
    return clean_text(location_match.group(1)) if location_match else None, None


def realself_card_specialty(text: str | None, name: str | None) -> str | None:
    if not text or not name:
        return None
    pattern = rf"{re.escape(name)}\s+(.+?)(?:\s+[1-5](?:\.\d)?\s*\||\s+\d+\s+YEARS?\s+OF\s+EXPERIENCE|$)"
    match = re.search(pattern, text, re.I)
    if not match:
        return None
    specialty = clean_text(match.group(1))
    return specialty if specialty and len(specialty) < 140 else None


def realself_card_review_snippet(text: str | None) -> str | None:
    if not text:
        return None
    match = re.search(r"\bmiles\s+(.+?)(?:\s+OFFER:|\s+PROFILE|\s+PRICING|\s+CONSULTATION|$)", text, re.I)
    if not match:
        return None
    snippet = clean_text(re.sub(r"\s+D\s+\.\.\.\s+read more$", "", match.group(1), flags=re.I))
    return snippet[:1000] if snippet else None


def realself_directory_context(soup, page_url: str) -> dict[str, str | None]:
    parsed = urlparse(page_url)
    parts = [part for part in parsed.path.split("/") if part]
    state = parts[1].replace("-", " ") if len(parts) > 1 else None
    city = parts[2].replace("-", " ") if len(parts) > 2 else None
    provider_type = parts[3].replace("-", " ") if len(parts) > 3 else None
    h1 = _text_one(soup, "h1")
    if h1:
        near_match = re.search(r"\bnear\s+(.+)$", h1, re.I)
        if near_match:
            city = clean_text(near_match.group(1))
    return {
        "directory_state": clean_text(state),
        "directory_city": clean_text(city),
        "provider_type_label": clean_text(provider_type),
    }


def realself_profile_schema(soup, page_url: str) -> dict[str, Any] | None:
    profile_path = urlparse(page_url).path.rstrip("/")
    for item in flatten_json_ld(extract_json_ld(soup)):
        types = realself_type_set(item)
        if not {"Physician", "LocalBusiness"}.intersection(types):
            continue
        item_url = clean_text(item.get("url") or item.get("@id")) or ""
        if profile_path and profile_path in urlparse(item_url).path:
            return item
        if "/dr/" in item_url:
            return item
    return None


def realself_type_set(item: dict[str, Any]) -> set[str]:
    item_type = item.get("@type") if isinstance(item, dict) else None
    values = item_type if isinstance(item_type, list) else [item_type]
    return {str(value) for value in values if value}


def realself_addresses(value: Any) -> list[dict[str, Any]]:
    return [item for item in realself_list(value) if isinstance(item, dict)]


def realself_list(value: Any) -> list[Any]:
    if value in (None, ""):
        return []
    return value if isinstance(value, list) else [value]


def realself_first_mapping(value: Any) -> dict[str, Any]:
    for item in realself_list(value):
        if isinstance(item, dict):
            return item
    return {}


def realself_format_address(address: dict[str, Any]) -> str | None:
    if not address:
        return None
    parts = [
        address.get("streetAddress"),
        address.get("addressLocality"),
        address.get("addressRegion"),
        address.get("postalCode"),
        realself_country(address.get("addressCountry")),
    ]
    return clean_text(", ".join(str(part) for part in parts if clean_text(part)))


def realself_country(value: Any) -> str | None:
    if isinstance(value, dict):
        return clean_text(value.get("name") or value.get("addressCountry"))
    return clean_text(value)


def realself_service_names(value: Any) -> list[str]:
    names = []
    for item in realself_list(value):
        if isinstance(item, dict):
            names.extend(realself_string_values(item.get("name") or item.get("serviceType")))
        else:
            names.extend(realself_string_values(item))
    return list(dict.fromkeys(name for name in names if name))


def realself_string_values(value: Any) -> list[str]:
    values = []
    for item in realself_list(value):
        if isinstance(item, dict):
            text = clean_text(item.get("name") or item.get("@id") or item.get("url"))
        else:
            text = clean_text(item)
        if text:
            values.append(text)
    return list(dict.fromkeys(values))


def realself_schema_reviews(value: Any) -> list[dict[str, Any]]:
    reviews = []
    for item in realself_list(value):
        if not isinstance(item, dict):
            continue
        author = item.get("author")
        if isinstance(author, dict):
            reviewer = clean_text(author.get("name"))
        else:
            reviewer = clean_text(author)
        rating_value = item.get("rating")
        review_rating = item.get("reviewRating")
        if isinstance(review_rating, dict):
            rating_value = review_rating.get("ratingValue") or rating_value
        elif review_rating:
            rating_value = review_rating
        reviews.append(
            {
                "reviewer": reviewer,
                "rating": clean_text(rating_value),
                "review_date": clean_text(item.get("datePublished") or item.get("dateCreated")),
                "body": clean_text(item.get("reviewBody") or item.get("body") or item.get("description")),
                "url": clean_text(item.get("url")),
                "raw_json": item,
            }
        )
    return [review for review in reviews if review.get("reviewer") or review.get("body")]


def realself_profile_images(schema: dict[str, Any], soup, page_url: str) -> list[dict[str, Any]]:
    images = realself_image_values(schema.get("image") or schema.get("photo"), page_url)
    html_images = [
        image
        for image in extract_images(soup, page_url, min_width_hint=80)
        if "realself" in image.get("url", "").lower()
    ]
    images.extend(html_images)
    seen = set()
    deduped = []
    for image in images:
        url = image.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        deduped.append(image)
    return deduped[:25]


def realself_image_values(value: Any, page_url: str) -> list[dict[str, Any]]:
    if not value:
        return []
    if isinstance(value, str):
        return [{"url": _join(page_url, value), "alt": None, "source_page_url": page_url}]
    if isinstance(value, dict):
        url = value.get("url") or value.get("contentUrl")
        if not url:
            return []
        return [{"url": _join(page_url, url), "alt": clean_text(value.get("caption") or value.get("name")), "source_page_url": page_url}]
    if isinstance(value, list):
        images: list[dict[str, Any]] = []
        for item in value:
            images.extend(realself_image_values(item, page_url))
        return images
    return []


def realself_profile_description(text: str | None, name: str | None) -> str | None:
    if not text:
        return None
    if name:
        match = re.search(rf"{re.escape(name)}\s+(.+?)(?:\s+Practice locations|\s+Reviews|\s+Photos|$)", text, re.I)
        if match:
            return clean_text(match.group(1))[:1200]
    return None


def realself_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _text_one(node, selector: str) -> str | None:
    tag = node.select_one(selector)
    return clean_text(tag.get_text(" ")) if tag else None


def _texts(node, selector: str) -> list[str]:
    return [text for text in (clean_text(tag.get_text(" ")) for tag in node.select(selector)) if text]


def _first_image(node, page_url: str, source_page_url: str | None = None) -> dict[str, Any] | None:
    for img in node.find_all("img"):
        src = img.get("src")
        if src and src.startswith("data:"):
            src = None
        src = src or img.get("data-src") or img.get("data-lazy-src")
        if not src and img.get("srcset"):
            src = img.get("srcset").split(",", 1)[0].strip().split(" ", 1)[0]
        if not src or src.startswith("data:"):
            continue
        return {"url": _join(page_url, src), "alt": clean_text(img.get("alt")), "source_page_url": source_page_url or page_url}
    return None


def _first_link_href(node, predicate) -> str | None:
    for link in node.find_all("a", href=True):
        href = link["href"].strip()
        label = clean_text(link.get_text(" ")) or ""
        if predicate(href, label):
            return href
    return None


def _first_link_text(node, predicate) -> str | None:
    for link in node.find_all("a", href=True):
        href = link["href"].strip()
        label = clean_text(link.get_text(" ")) or ""
        if predicate(href, label):
            if href.startswith("tel:"):
                return clean_text(href.split(":", 1)[1])
            if href.startswith("mailto:"):
                return clean_text(href.split(":", 1)[1].split("?", 1)[0])
            return label
    return None


def extract_phone(text: str | None) -> str | None:
    if not text:
        return None
    match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", text)
    return clean_text(match.group(0)) if match else None


def extract_labeled_value(text: str | None, label: str) -> str | None:
    if not text:
        return None
    labels = [
        "Address",
        "Phone",
        "Website",
        "Specialization",
        "Workplace",
        "Speaks",
        "Online consultations",
        "Locations",
        "Team Size and Expertise",
        "Why They Are the Best",
        "Services Provided",
        "Charges",
    ]
    other_labels = [re.escape(item) for item in labels if item.lower() != label.lower()]
    stop = "|".join(other_labels)
    pattern = rf"{re.escape(label)}\s*:?\s+(.+?)(?=\s+(?:{stop})\s*:?\s+|$)"
    match = re.search(pattern, text, re.I)
    if not match:
        return None
    value = clean_text(match.group(1))
    return value[:800] if value else None


def page_title_from_url(url: str) -> str:
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    return slug.replace("-", " ").title() if slug else urlparse(url).netloc


def is_external_site(href: str, page_url: str) -> bool:
    parsed = urlparse(href)
    if parsed.scheme not in {"http", "https"}:
        return False
    source_domain = urlparse(page_url).netloc.lower().lstrip("www.")
    target_domain = parsed.netloc.lower().lstrip("www.")
    return bool(target_domain and target_domain != source_domain)


def parse_city_region(value: str | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    parts = [clean_text(part) for part in value.split(",") if clean_text(part)]
    if len(parts) >= 2:
        return parts[0], parts[1]
    return clean_text(value), None


def parse_address_parts(value: str | None) -> tuple[str | None, str | None, str | None]:
    if not value:
        return None, None, None
    text = dedupe_trailing_zip(value) or value
    postal = None
    postal_match = re.search(r"\b([A-Z]\d[A-Z]\s?\d[A-Z]\d|\d{5}(?:-\d{4})?)\b", text, re.I)
    if postal_match:
        postal = clean_text(postal_match.group(1))
    parts = [clean_text(part) for part in text.split(",") if clean_text(part)]
    city = None
    region = None
    if len(parts) >= 3:
        city = parts[-3]
        region_part = parts[-2]
        region = clean_text(re.sub(r"\b\d{5}(?:-\d{4})?\b", "", region_part))
    elif len(parts) == 2:
        city = parts[0]
        region = clean_text(re.sub(r"\b\d{5}(?:-\d{4})?\b", "", parts[1]))
    return city, region, postal


def dedupe_trailing_zip(value: str | None) -> str | None:
    if not value:
        return None
    text = clean_text(value)
    if not text:
        return None
    return re.sub(r"\b(\d{5})(?:-\d{4})?\s+\1\b$", r"\1", text)


def parse_rating_count(value: str | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    match = re.search(r"([1-5](?:\.\d)?)\s*\(([\d,]+)", value)
    if match:
        return match.group(1), match.group(2)
    return extract_rating_review_count(value)


def split_tags(value: str | None) -> list[str]:
    if not value:
        return []
    value = re.sub(r"^Listing Tags\s+", "", value, flags=re.I)
    return [tag for tag in (clean_text(part) for part in re.split(r"[,;/|]", value)) if tag]


def extract_bioedge_clinic_website(soup, page_url: str) -> str | None:
    blocked = ("amazon.", "a.co/", "maps.google.", "bioedgelongevity.com")
    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        label = clean_text(link.get_text(" ")) or ""
        if not is_external_site(href, page_url):
            continue
        if any(token in href.lower() for token in blocked):
            continue
        if label.lower() in {"buy now", "view on google maps"}:
            continue
        return href
    return None


def extract_bioedge_profile_images(soup, page_url: str, name: str | None) -> list[dict[str, Any]]:
    images: list[dict[str, Any]] = []
    lowered_name = (name or "").lower()
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if not src or src.startswith("data:"):
            continue
        alt = clean_text(img.get("alt"))
        src_lower = src.lower()
        if "bioedge-book" in src_lower or "book-cover" in src_lower:
            continue
        if src.startswith("places/") or (alt and alt.lower() in lowered_name + " " + lowered_name.replace(" ", "")):
            images.append({"url": _join(page_url, src), "alt": alt, "source_page_url": page_url})
    return images or [
        image
        for image in extract_images(soup, page_url, min_width_hint=80)
        if "bioedge-book" not in image.get("url", "").lower() and "book-cover" not in image.get("url", "").lower()
    ]


def extract_bioedge_about(text: str | None) -> str | None:
    if not text:
        return None
    match = re.search(r"\bAbout\s+(.+?)(?:\s+Nearby Clinics|\s+Explore\s+BIO EDGE|$)", text, re.I)
    return clean_text(match.group(1)) if match else None


def extract_concierge_address(text: str | None, name: str | None) -> str | None:
    if not text:
        return None
    if name:
        match = re.search(rf"{re.escape(name)}\s+(.+?\b(?:USA|United States)\b)", text, re.I)
        if match:
            return clean_text(match.group(1))
    match = re.search(r"([0-9][^|]{10,120},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?,\s*(?:USA|United States))", text)
    return clean_text(match.group(1)) if match else None


def extract_concierge_overview(text: str | None, name: str | None) -> str | None:
    if not text:
        return None
    if name:
        marker = re.search(rf"(?:Overview\s+Gallery\s+Location\s+)?(.{{0,120}}{re.escape(name)}.+?)(?:\s+Location\s+Google Reviews|\s+Google Reviews|$)", text, re.I)
        if marker:
            return clean_text(marker.group(1))
    return None


def extract_concierge_reviews(soup) -> list[dict[str, Any]]:
    reviews = []
    for item in soup.select("section.listing-reviews ul.comment-list > li"):
        reviewer = _text_one(item, ".comment-by h5")
        review_date = _text_one(item, ".comment-by .date")
        rating_tag = item.select_one(".star-rating")
        rating = clean_text(rating_tag.get("data-rating")) if rating_tag else None
        body_tag = item.select_one(".comment-content p")
        body = clean_text(body_tag.get_text(" ")) if body_tag else None
        if reviewer or body:
            reviews.append({"reviewer": reviewer, "rating": rating, "review_date": review_date, "body": body})
    return reviews


def doctor_name_from_url(url: str) -> str:
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    return clean_text(slug.replace("-", " ").title()) or "Doctor"


def extract_bookimed_specialty_terms(text: str | None) -> list[str]:
    if not text:
        return []
    terms = []
    for label in ("Longevity health", "Aesthetic Medicine", "Cosmetology", "Ophtalmologist", "Ophthalmologist", "Stem Cells", "Wellness", "Check-up", "Regenerative", "Plastic Surgery", "Therapy"):
        if re.search(re.escape(label), text, re.I):
            terms.append(label)
    specialization = extract_labeled_value(text, "Specialization")
    if specialization:
        terms.append(specialization)
    return sorted(set(terms))


def extract_bookimed_doctor_summary(text: str | None, name: str | None) -> str | None:
    if not text:
        return None
    if name:
        match = re.search(rf"{re.escape(name)}\s+Specialization:.+?(?:Get a free quote|Explore package|Online consultation|$)", text, re.I)
        if match:
            return clean_text(match.group(0))
    return None


def parse_wpbdp_fields(card) -> dict[str, str]:
    fields: dict[str, str] = {}
    for field in card.select(".wpbdp-field-display, .wpbdp-field-value, .address-info"):
        classes = field.get("class") or []
        key = None
        for class_name in classes:
            if not class_name.startswith("wpbdp-field-"):
                continue
            candidate = class_name[len("wpbdp-field-"):]
            if candidate in {"display", "value", "title", "meta", "type-textfield", "association-title", "association-meta", "category", "tags"}:
                continue
            key = candidate
            break
        if not key and "address-info" in classes:
            key = "address_info"
        if not key:
            continue
        text = clean_text(field.get_text(" "))
        if not text:
            continue
        label = key.replace("_", " ")
        text = re.sub(rf"^{re.escape(label)}\s+", "", text, flags=re.I)
        known_labels = {
            "listing_title": "Listing Title",
            "listing_category": "Listing Category",
            "listing_tags": "Listing Tags",
            "zip_code": "ZIP Code",
            "address": "Address",
            "website": "Website",
            "phone": "Phone",
            "address_info": "Address",
        }
        if key in known_labels:
            text = re.sub(rf"^{re.escape(known_labels[key])}\s+", "", text, flags=re.I)
        if key == "website":
            link = field.find("a", href=True)
            if link:
                text = link["href"]
        if key == "phone":
            link = field.find("a", href=True)
            if link and link["href"].startswith("tel:"):
                text = link["href"].split(":", 1)[1]
        fields[key] = text
    return fields


def extract_mayo_intro(text: str | None, name: str | None) -> str | None:
    if not text or not name:
        return None
    match = re.search(rf"{re.escape(name)}\s+(.+?)(?:\s+World Class Facilities|\s+Explore {re.escape(name.split(',', 1)[0])}|$)", text, re.I)
    return clean_text(match.group(1)) if match else None


def parse_fountain_services(text: str | None) -> list[str]:
    if not text:
        return []
    services_text = extract_labeled_value(text, "Services Provided")
    if not services_text:
        return []
    services_text = re.split(r"\bCharges:\b", services_text, 1, flags=re.I)[0]
    candidates = re.split(r"(?<=[.;])\s+|,\s+", services_text)
    services = []
    for candidate in candidates:
        candidate = clean_text(re.sub(r":.*$", "", candidate))
        if candidate and 2 <= len(candidate.split()) <= 8:
            services.append(candidate)
    return list(dict.fromkeys(services))


def is_bioedge_detail_page(page_url: str) -> bool:
    parsed = urlparse(page_url)
    return parsed.netloc.lower().endswith("bioedgelongevity.com") and parsed.path.startswith("/clinics/") and parsed.path.rstrip("/") != "/clinics"


def is_stem_cell_detail_page(page_url: str) -> bool:
    parsed = urlparse(page_url)
    return bool(re.search(r"^/business-directory/\d+/", parsed.path))


def is_mayo_location_detail_page(page_url: str) -> bool:
    parsed = urlparse(page_url)
    return bool(re.search(r"^/executive-health/locations/[^/]+/?$", parsed.path))


def enrich_listing_from_page(listing: dict[str, Any], soup, page_url: str, config: SourceConfig) -> None:
    if config.slug == "bookimed_longevity" and "/clinics/direction=longevity-health/best" in page_url:
        return
    text = listing.get("raw_text") or visible_text(soup) or ""
    if not listing.get("price_text"):
        listing["price_text"] = extract_price_text(text)
    if not listing.get("website"):
        listing["website"] = extract_external_website(soup, page_url)
    if not listing.get("address"):
        listing["address"] = extract_address_from_text(text, config.slug)
    if listing.get("rating") in (None, "") or listing.get("review_count") in (None, ""):
        rating, review_count = extract_rating_review_count(text)
        listing["rating"] = listing.get("rating") or rating
        listing["review_count"] = listing.get("review_count") or review_count
    fields = listing.setdefault("fields", {})
    if config.slug != "bookimed_longevity":
        for label, value in extract_detail_sections(soup).items():
            fields.setdefault(f"section_{label}", value)


def extract_external_website(soup, page_url: str) -> str | None:
    source_domain = urlparse(page_url).netloc.lower().lstrip("www.")
    blocked = {
        "google.com",
        "facebook.com",
        "twitter.com",
        "x.com",
        "linkedin.com",
        "instagram.com",
        "youtube.com",
        "longevityshow.com",
        "longevity-roundtable.com",
        "longevity-academy.com",
        "pubmed.ncbi.nlm.nih.gov",
        "nature.com",
        "qualtrics.com",
    }
    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        parsed = urlparse(href)
        if parsed.scheme not in {"http", "https"}:
            continue
        domain = parsed.netloc.lower().lstrip("www.")
        if not domain or domain == source_domain:
            continue
        if any(domain == blocked_domain or domain.endswith("." + blocked_domain) for blocked_domain in blocked):
            continue
        if "maps" in domain:
            continue
        return href
    return None


def extract_address_from_text(text: str, source_slug: str) -> str | None:
    if not text:
        return None
    if source_slug == "spannr":
        match = re.search(r"\bLocation\s+(.+?)\s+Directions\b", text, re.I)
        if match:
            return clean_text(match.group(1))
    if source_slug == "immortality_clinic":
        match = re.search(r"← All clinics\s+(.+?)\s+[·-]\s+", text, re.I)
        if match:
            return clean_text(match.group(1))
    return None


def extract_detail_sections(soup) -> dict[str, str]:
    sections: dict[str, str] = {}
    labels = {"details", "core services", "practitioners", "programs", "available treatments & features", "treatment details"}
    for heading in soup.find_all(["h2", "h3", "strong", "b"]):
        label = clean_text(heading.get_text(" "))
        if not label or label.lower() not in labels:
            continue
        parent_text = clean_text(heading.parent.get_text(" ")) if heading.parent else None
        if parent_text and len(parent_text) > len(label):
            sections[slugify(label)] = parent_text
    return sections


def extract_bookimed_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings = extract_directory_cards(
        soup,
        page_url,
        source_slug,
        selectors=["[data-clinic-id]", ".clinic-card", ".clinic", "article", 'a[href*="/clinic/"]'],
    )
    for listing in listings:
        text = listing.get("raw_text") or ""
        rating_match = re.search(r"(\d(?:\.\d)?)\s*(?:rating|reviews?)", text, re.I)
        if rating_match:
            listing["rating"] = rating_match.group(1)
        price_match = re.search(r"(?:from|price)\s*([$€£]\s?\d[\d,]*)", text, re.I)
        if price_match:
            listing["price_text"] = price_match.group(0)
    return listings


def extract_longevity_technology_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings = extract_directory_cards(
        soup,
        page_url,
        source_slug,
        selectors=[".clinic-card"],
    )
    listings.extend(extract_longevity_technology_archive_cards(soup, page_url, source_slug))
    for listing in listings:
        text = listing.get("raw_text") or ""
        country_match = re.search(r"\b(Location|Country):\s*([^|]+)", text, re.I)
        if country_match:
            listing["country"] = clean_text(country_match.group(2))
    return listings


def extract_longevity_technology_archive_cards(soup, page_url: str, source_slug: str) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    seen = set()
    for link in soup.find_all("a", href=True):
        if clean_text(link.get_text(" ")) != "Explore this clinic":
            continue
        href = link["href"]
        if "/clinics/longevity-clinics/" not in href:
            continue
        card = link.find_parent(class_="swiper-slide") or link.parent
        text = clean_text(card.get_text(" ")) if card else clean_text(link.parent.get_text(" "))
        source_url = _join(page_url, href)
        if source_url in seen:
            continue
        seen.add(source_url)
        name = source_url.rstrip("/").rsplit("/", 1)[-1].replace("-", " ").title()
        image = None
        img = card.find("img") if card else None
        if img and (img.get("src") or img.get("data-src")):
            image = _join(page_url, img.get("src") or img.get("data-src"))
        listings.append(
            {
                "source_slug": source_slug,
                "source_url": source_url,
                "name": clean_text(name),
                "description": text,
                "address": None,
                "locality": None,
                "region": None,
                "postal_code": None,
                "country": None,
                "phone": None,
                "email": None,
                "website": None,
                "latitude": None,
                "longitude": None,
                "price_text": extract_price_text(text),
                "rating": None,
                "review_count": None,
                "image_url": image,
                "images": [{"url": image, "alt": None, "source_page_url": page_url}] if image else [],
                "services_json": None,
                "procedures_json": None,
                "raw_text": text,
                "raw_json": {},
                "reviews": [],
                "fields": {"archive_card_text": text, "archive_source_page": page_url},
                "extracted_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    return listings


def is_longevity_technology_profile(page_url: str) -> bool:
    parsed = urlparse(page_url)
    return parsed.path.startswith("/clinics/longevity-clinics/") or (
        parsed.path.rstrip("/") == "/clinics/contact" and "clinic_name=" in parsed.query
    )


def extract_longevity_technology_profile(soup, page_url: str, source_slug: str) -> dict[str, Any]:
    parsed = urlparse(page_url)
    query = parse_qs(parsed.query)
    clinic_name = query.get("clinic_name", [None])[0]
    listing = listing_from_page(soup, page_url, source_slug)
    if clinic_name:
        listing["name"] = clean_text(clinic_name)
        listing["fields"]["clinic_name_param"] = listing["name"]
    if parsed.path.rstrip("/") == "/clinics/contact":
        listing["fields"]["contact_detail_page"] = True
    return listing


def extract_exec_health_city_page(soup, page_url: str, source_slug: str) -> dict[str, Any] | None:
    path = urlparse(page_url).path.rstrip("/")
    if not path.startswith("/directory/"):
        return None
    headings = [clean_text(tag.get_text(" ")) for tag in soup.find_all("h1")]
    heading = next((text for text in headings if text and " in " in text), None) or (headings[-1] if headings else None)
    if not heading:
        return None
    text = visible_text(soup) or ""
    city = None
    city_match = re.search(r"\bin\s+(.+?)\s+Book Now\b", text, re.I)
    if city_match:
        city = clean_text(city_match.group(1))
    services = []
    available_match = re.search(r"Available Services in .+?\s+(.*?)\s+©", text, re.I)
    if available_match:
        services = [
            clean_text(item)
            for item in re.split(r"\s{2,}|(?<=NY|CA|IL|TX|AZ|PA|FL|OH|MA|GA|WA|CO|DC|OR|TN|NV|KY|MD|WI|NM|UT|HI|ID|VA|IA|ND|SC|LA|RI|WY|NJ|DE|VT|CT|ME|KS|MT|NH)\s+", available_match.group(1))
        ]
        services = [service for service in services if service]
    return {
        "source_slug": source_slug,
        "source_url": page_url,
        "name": heading,
        "description": None,
        "address": city,
        "locality": city.rsplit(",", 1)[0].strip() if city and "," in city else city,
        "region": city.rsplit(",", 1)[1].strip() if city and "," in city else None,
        "postal_code": None,
        "country": "United States",
        "phone": None,
        "email": None,
        "website": None,
        "latitude": None,
        "longitude": None,
        "price_text": None,
        "rating": None,
        "review_count": None,
        "image_url": None,
        "images": [],
        "services_json": services,
        "procedures_json": None,
        "raw_text": text,
        "raw_json": {},
        "reviews": [],
        "fields": {"city": city, "services": services},
        "extracted_at": datetime.now(timezone.utc).isoformat(),
    }


def is_probable_listing_page(soup, page_url: str, config: SourceConfig) -> bool:
    parsed = urlparse(page_url)
    path = parsed.path.lower()
    if not any(hint.lower() in path for hint in config.listing_hints):
        return False
    text = visible_text(soup) or ""
    h1 = soup.find("h1")
    if not h1 or len(text) < 200:
        return False
    directory_words = ("clinic", "longevity", "health", "medical", "treatment", "program", "price", "address")
    return any(word in text.lower() for word in directory_words)


def extract_price_text(text: str | None) -> str | None:
    if not text:
        return None
    patterns = [
        r"(?:Price on request)",
        r"(?:From|from|starts at|Published pricing for)[^.;\n]{0,120}(?:[$€£]|USD|EUR|GBP)[^.;\n]{0,120}",
        r"(?:[$€£]\s?\d[\d,]*(?:\.\d{2})?(?:\s?-\s?[$€£]?\d[\d,]*(?:\.\d{2})?)?)",
        r"(?:USD|EUR|GBP)\s?\d[\d,]*(?:\s?to\s?(?:USD|EUR|GBP)?\s?\d[\d,]*)?",
        r"(?:\${2,4})",
    ]
    matches = []
    for pattern in patterns:
        matches.extend(clean_text(match.group(0)) for match in re.finditer(pattern, text, re.I))
    matches = [match for match in dict.fromkeys(matches) if match]
    return "; ".join(matches[:8]) if matches else None


def extract_rating_review_count(text: str | None) -> tuple[str | None, str | None]:
    if not text:
        return None, None
    rating = None
    review_count = None
    rating_match = re.search(r"\b([1-5](?:\.\d)?)\s*(?:/\s*5|Google|reviews?|rating)?\b", text, re.I)
    if rating_match:
        rating = rating_match.group(1)
    review_match = re.search(r"\b(\d[\d,]*)\s+reviews?\b", text, re.I)
    if review_match:
        review_count = review_match.group(1)
    return rating, review_count


def should_follow(url: str, config: SourceConfig) -> bool:
    lower = url.lower()
    if any(hint.lower() in lower for hint in config.exclude_hints):
        return False
    if config.slug == "stem_cell_authority":
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        return path == "/business-directory" or bool(re.match(r"^/business-directory/page/\d+$", path))
    if config.slug == "bookimed_longevity" and "/direction=longevity-health" in lower and "/clinic/" in lower:
        return False
    if any(hint.lower() in lower for hint in config.follow_hints):
        return True
    return url.rstrip("/") in {seed.rstrip("/") for seed in config.seeds}


def normalize_listing_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path
    path = path.replace("/direction=longevity-health", "")
    if path != "/":
        path = path.rstrip("/")
    query = parsed.query
    if query in {"", "currency="}:
        query = ""
    return parsed._replace(path=path, fragment="", query=query).geturl()


def attach_downloaded_images(fetcher: Fetcher, listing: dict[str, Any], source_slug: str, max_images: int = 1) -> None:
    images = listing.get("images") or []
    if not images:
        return
    for image in images[:max_images]:
        if not isinstance(image, dict) or image.get("local_path") or not image.get("url"):
            continue
        local_path = download_image(fetcher, image["url"], source_slug, listing.get("name") or "listing")
        if local_path:
            image["local_path"] = str(local_path.relative_to(ROOT))


def download_image(fetcher: Fetcher, image_url: str, source_slug: str, listing_name: str) -> Path | None:
    if image_url.lower().startswith("data:"):
        return None
    try:
        response = fetcher.session.get(image_url, timeout=20, headers={"Accept": "image/*,*/*;q=0.8"})
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


def merge_duplicate_listings(listings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for listing in listings:
        if listing.get("source_url"):
            listing["source_url"] = normalize_listing_url(listing["source_url"])
        key = listing.get("source_url") or listing.get("name")
        if not key:
            continue
        listing.setdefault("extracted_at", datetime.now(timezone.utc).isoformat())
        if key not in merged:
            merged[key] = listing
            continue
        current = merged[key]
        for field, value in listing.items():
            if value in (None, "", [], {}):
                continue
            if current.get(field) in (None, "", [], {}):
                current[field] = value
        current_fields = current.setdefault("fields", {})
        current_fields.update(listing.get("fields") or {})
        current_images = current.setdefault("images", [])
        current_images.extend(img for img in listing.get("images", []) if img not in current_images)
        current_reviews = current.setdefault("reviews", [])
        current_reviews.extend(review for review in listing.get("reviews", []) if review not in current_reviews)
    return list(merged.values())


def slugify(value: str) -> str:
    value = clean_text(value) or "item"
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "item"


def export_source(db: SourceDatabase, export_path: Path) -> None:
    rows = [dict(row) for row in db.conn.execute("SELECT * FROM listings ORDER BY id")]
    jsonl_path = export_path / "listings.jsonl"
    with jsonl_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    csv_path = export_path / "listings.csv"
    if rows:
        with csv_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)


def _join(page_url: str, href: str) -> str:
    from urllib.parse import urljoin

    return urljoin(page_url, href)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape longevity directory sources into separate SQLite databases.")
    parser.add_argument(
        "--source",
        choices=sorted(SOURCES),
        action="append",
        help="Source slug to scrape. Repeatable. Defaults to all sources.",
    )
    parser.add_argument("--force-generic", action="store_true", help="Disable source-specific card extractors.")
    parser.add_argument("--skip-images", action="store_true", help="Do not download listing images locally.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    slugs = args.source or list(SOURCES)
    summaries = []
    for slug in slugs:
        config = SOURCES[slug]
        print(f"==> scraping {config.name} ({slug})", flush=True)
        summary = scrape_source(config, force_generic=args.force_generic, download_images=not args.skip_images)
        summaries.append(summary)
        print(json.dumps(summary, indent=2), flush=True)
    summary_path = EXPORT_DIR / "scrape_summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(summaries, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
