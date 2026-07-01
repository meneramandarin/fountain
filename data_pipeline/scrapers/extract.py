from __future__ import annotations

import copy
import json
import re
from html import unescape
from typing import Any
from urllib.parse import urljoin, urlparse

import pyap
from bs4 import BeautifulSoup
from rapidfuzz import fuzz


EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
PRICE_RE = re.compile(r"(?:[$€£]\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*(?:\.\d{2})?\s?(?:USD|EUR|GBP))", re.I)
WHITESPACE_RE = re.compile(r"\s+")


def soup_from_html(html: str) -> BeautifulSoup:
    return BeautifulSoup(html or "", "lxml")


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = unescape(str(value))
    text = WHITESPACE_RE.sub(" ", text).strip()
    return text or None


def page_title(soup: BeautifulSoup) -> str | None:
    if soup.title and soup.title.string:
        return clean_text(soup.title.string)
    heading = soup.find(["h1", "h2"])
    return clean_text(heading.get_text(" ")) if heading else None


def visible_text(soup: BeautifulSoup) -> str | None:
    clone = BeautifulSoup(str(soup), "lxml")
    for tag in clone(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return clean_text(clone.get_text(" "))


def meta_content(soup: BeautifulSoup, *names: str) -> str | None:
    lowered = {name.lower() for name in names}
    for tag in soup.find_all("meta"):
        key = (tag.get("name") or tag.get("property") or "").lower()
        if key in lowered:
            return clean_text(tag.get("content"))
    return None


def canonical_url(soup: BeautifulSoup, fallback_url: str) -> str:
    tag = soup.find("link", rel=lambda value: value and "canonical" in value)
    if tag and tag.get("href"):
        return urljoin(fallback_url, tag["href"])
    return fallback_url


def extract_json_ld(soup: BeautifulSoup) -> list[Any]:
    values: list[Any] = []
    for tag in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.I)}):
        raw = tag.string or tag.get_text()
        if not raw:
            continue
        try:
            values.append(json.loads(raw.strip()))
        except json.JSONDecodeError:
            cleaned = re.sub(r"^\s*<!--|-->\s*$", "", raw.strip())
            try:
                values.append(json.loads(cleaned))
            except json.JSONDecodeError:
                continue
    return values


def flatten_json_ld(values: list[Any]) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []

    def walk(value: Any) -> None:
        if isinstance(value, list):
            for item in value:
                walk(item)
            return
        if not isinstance(value, dict):
            return
        if "@graph" in value:
            walk(value["@graph"])
        flattened.append(value)
        for key in ("mainEntity", "itemListElement", "about", "provider", "department"):
            if key in value:
                walk(value[key])

    walk(values)
    return flattened


def is_listing_schema(item: dict[str, Any]) -> bool:
    if item.get("branchOf") and not item.get("url"):
        return False
    item_type = item.get("@type")
    types = item_type if isinstance(item_type, list) else [item_type]
    type_set = {str(t) for t in types if t}
    if type_set.issubset({"Organization", "Place"}) and not any(
        item.get(key) for key in ("address", "telephone", "geo", "priceRange", "aggregateRating")
    ):
        return False
    wanted = {
        "LocalBusiness",
        "MedicalBusiness",
        "MedicalClinic",
        "MedicalOrganization",
        "HealthAndBeautyBusiness",
        "Organization",
        "Place",
        "Hospital",
        "Physician",
        "ProfessionalService",
    }
    return bool(wanted.intersection(type_set))


_GENERIC_URL_LOCALITY_TOKENS = {
    "scan", "scan-me", "me", "dexa", "dxa", "hbot", "vo2", "vo2max", "max", "test", "tests",
    "clinic", "clinics", "location", "locations", "provider", "providers", "homepage",
    "index", "home", "page", "about", "contact", "services", "service", "find", "near",
}


def derive_locality_from_url(page_url: str) -> str | None:
    """Best-effort city guess from a URL slug, e.g. '/dexa-scan-philadelphia' -> 'philadelphia'.

    Chain-provider sites (BodySpec, DexaFit, etc.) reliably encode the branch city in the URL
    even when their page-level schema.org markup doesn't, so this gives a cheap cross-check
    signal without needing a full address/geocoding lookup.
    """
    path = urlparse(page_url).path.rstrip("/")
    segments = [s for s in path.split("/") if s]
    if not segments:
        return None
    tokens = [t for t in re.split(r"[-_]+", segments[-1].lower()) if t and not t.isdigit()]
    tokens = [t for t in tokens if t not in _GENERIC_URL_LOCALITY_TOKENS]
    if not tokens:
        return None
    candidate = " ".join(tokens[-3:])
    return candidate if len(candidate) >= 3 else None


def _locality_conflicts(schema_locality: str | None, url_locality: str | None) -> bool:
    if not schema_locality or not url_locality:
        return False
    return fuzz.partial_ratio(schema_locality.lower(), url_locality.lower()) < 55


def extract_address_from_main_content(soup: BeautifulSoup) -> dict[str, str] | None:
    """Parse a real street address out of page body text, excluding header/nav/footer.

    Used as a fallback when a page's schema.org address looks like site-wide org/HQ
    boilerplate rather than this specific page's location (see _locality_conflicts).
    AU/IE addresses aren't natively supported by pyap; the GB parser is tried as a
    best-effort approximation for those, which is a known lower-precision case.
    """
    try:
        working = copy.copy(soup)
    except Exception:
        working = soup
    for tag in working.find_all(["header", "footer", "nav"]):
        tag.decompose()
    text = visible_text(working) or ""
    if not text:
        return None
    for country in ("US", "CA", "GB"):
        try:
            matches = pyap.parse(text, country=country)
        except Exception:
            continue
        if matches:
            match = matches[0]
            return {
                "streetAddress": str(match).strip(),
                "addressLocality": match.city,
                "addressRegion": match.region1,
                "postalCode": match.postal_code,
                "addressCountry": match.country_id,
            }
    return None


def schema_to_listing(
    item: dict[str, Any],
    page_url: str,
    source_slug: str,
    raw_text: str | None,
    soup: BeautifulSoup | None = None,
) -> dict[str, Any]:
    raw_address = item.get("address")
    multi_branch_address = False
    if isinstance(raw_address, dict):
        address = raw_address
    elif isinstance(raw_address, list):
        dict_addresses = [a for a in raw_address if isinstance(a, dict)]
        if len(dict_addresses) == 1:
            address = dict_addresses[0]
        else:
            # Multiple (or zero usable) PostalAddress entries: this schema block describes an
            # organization with several branches, not one page-specific location. Using any
            # single entry (or stringifying the whole list) would mislabel the listing, so treat
            # the address as unknown rather than guess (see Fitnescity-style bug).
            address = {}
            multi_branch_address = True
    else:
        address = {}

    if multi_branch_address:
        address_text = None
        locality = region = postal_code = country_field = None
    else:
        address_text = format_address(address)
        if not address_text and isinstance(raw_address, str):
            address_text = raw_address
        locality = clean_text(address.get("addressLocality"))
        region = clean_text(address.get("addressRegion"))
        postal_code = clean_text(address.get("postalCode"))
        country_field = clean_text(address.get("addressCountry"))

        # Chain pages often only carry an org-wide "Organization" schema block with the HQ
        # address; cross-check against the URL slug and, on conflict, try to recover the real
        # per-page address from body text before falling back to dropping it (see BodySpec bug).
        url_locality = derive_locality_from_url(page_url)
        if locality and url_locality and _locality_conflicts(locality, url_locality):
            recovered = extract_address_from_main_content(soup) if soup is not None else None
            recovered_locality = recovered.get("addressLocality") if recovered else None
            if recovered and recovered_locality and not _locality_conflicts(recovered_locality, url_locality):
                address_text = recovered.get("streetAddress")
                locality = clean_text(recovered_locality)
                region = clean_text(recovered.get("addressRegion"))
                postal_code = clean_text(recovered.get("postalCode"))
                country_field = clean_text(recovered.get("addressCountry"))
            else:
                address_text = locality = region = postal_code = country_field = None

    geo = item.get("geo") if isinstance(item.get("geo"), dict) else {}
    aggregate = item.get("aggregateRating") if isinstance(item.get("aggregateRating"), dict) else {}
    reviews = item.get("review") or item.get("reviews") or []
    if isinstance(reviews, dict):
        reviews = [reviews]
    images = _image_values(item.get("image") or item.get("photo"), page_url)
    website = item.get("url") or item.get("sameAs")
    if isinstance(website, list):
        website = website[0] if website else None
    services = item.get("makesOffer") or item.get("hasOfferCatalog") or item.get("availableService")
    subject = item.get("subjectOf")
    if subject and not services:
        services = subject
    listing = {
        "source_slug": source_slug,
        "source_url": item.get("@id") if str(item.get("@id", "")).startswith("http") else page_url,
        "name": clean_text(item.get("name")),
        "description": clean_text(item.get("description")),
        "address": clean_text(address_text),
        "locality": locality,
        "region": region,
        "postal_code": postal_code,
        "country": country_field,
        "phone": clean_text(item.get("telephone")),
        "email": clean_text(item.get("email")),
        "website": clean_text(website),
        "latitude": _float_or_none(geo.get("latitude")),
        "longitude": _float_or_none(geo.get("longitude")),
        "price_text": clean_text(item.get("priceRange")),
        "rating": clean_text(aggregate.get("ratingValue")),
        "review_count": clean_text(aggregate.get("reviewCount") or aggregate.get("ratingCount")),
        "image_url": images[0]["url"] if images else None,
        "images": images,
        "services_json": services,
        "procedures_json": None,
        "raw_text": raw_text,
        "raw_json": item,
        "reviews": reviews,
        "fields": {},
    }
    return listing


def format_address(address: dict[str, Any]) -> str | None:
    if not isinstance(address, dict):
        return None
    parts = [
        address.get("streetAddress"),
        address.get("addressLocality"),
        address.get("addressRegion"),
        address.get("postalCode"),
        address.get("addressCountry"),
    ]
    return clean_text(", ".join(str(part) for part in parts if part))


def extract_contact_fields(soup: BeautifulSoup, page_url: str) -> dict[str, Any]:
    text = visible_text(soup) or ""
    fields: dict[str, Any] = {}
    email = None
    phone = None
    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        if href.startswith("mailto:") and not email:
            email = href.split(":", 1)[1].split("?", 1)[0]
        if href.startswith("tel:") and not phone:
            phone = href.split(":", 1)[1]
    if not email:
        match = EMAIL_RE.search(text)
        email = match.group(0) if match else None
    if not phone:
        match = PHONE_RE.search(text)
        phone = match.group(0) if match else None
    price_matches = sorted(set(clean_text(match.group(0)) for match in PRICE_RE.finditer(text)))
    if email:
        fields["email"] = clean_text(email)
    if phone:
        fields["phone"] = clean_text(phone)
    if price_matches:
        fields["prices_found"] = price_matches
    fields["canonical_url"] = canonical_url(soup, page_url)
    description = meta_content(soup, "description", "og:description")
    if description:
        fields["meta_description"] = description
    return fields


def extract_images(soup: BeautifulSoup, page_url: str, min_width_hint: int = 120) -> list[dict[str, Any]]:
    images: list[dict[str, Any]] = []
    for tag in soup.find_all(["img", "source"]):
        src = _best_image_src(tag)
        if not src and tag.get("srcset"):
            src = _first_srcset_url(tag.get("srcset"))
        if not src:
            continue
        if src.startswith("data:"):
            continue
        width = _int_or_none(tag.get("width") or tag.get("data-width"))
        if width is not None and width < min_width_hint:
            continue
        url = urljoin(page_url, src)
        if _looks_like_logo_or_icon(url, tag.get("alt")):
            continue
        images.append({"url": url, "alt": clean_text(tag.get("alt")), "source_page_url": page_url})
    og_image = meta_content(soup, "og:image", "twitter:image")
    if og_image:
        images.insert(0, {"url": urljoin(page_url, og_image), "alt": "social image", "source_page_url": page_url})
    return dedupe_images(images)


def _best_image_src(tag) -> str | None:
    candidates = [
        tag.get("src"),
        tag.get("data-src"),
        tag.get("data-lazy-src"),
        tag.get("data-original"),
    ]
    for src in candidates:
        if src and not str(src).startswith("data:"):
            return src
    srcset = tag.get("data-srcset") or tag.get("srcset")
    return _first_srcset_url(srcset)


def dedupe_images(images: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    deduped = []
    for image in images:
        url = image.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        deduped.append(image)
    return deduped


def collect_links(soup: BeautifulSoup, page_url: str, allowed_domains: set[str]) -> list[str]:
    links: list[str] = []
    for tag in soup.find_all("a", href=True):
        href = tag["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        url = strip_fragment(urljoin(page_url, href))
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            continue
        if parsed.netloc.lower().lstrip("www.") not in allowed_domains:
            continue
        links.append(url)
    for tag in soup.find_all("link", href=True):
        rel = tag.get("rel") or []
        rel_values = {str(value).lower() for value in (rel if isinstance(rel, list) else [rel])}
        if not {"next", "prev"}.intersection(rel_values):
            continue
        url = strip_fragment(urljoin(page_url, tag["href"].strip()))
        parsed = urlparse(url)
        if parsed.scheme in {"http", "https"} and parsed.netloc.lower().lstrip("www.") in allowed_domains:
            links.append(url)
    return sorted(set(links))


def strip_fragment(url: str) -> str:
    parsed = urlparse(url)
    return parsed._replace(fragment="").geturl()


def listing_from_page(
    soup: BeautifulSoup,
    page_url: str,
    source_slug: str,
    extra_fields: dict[str, Any] | None = None,
    name_selector: str | None = None,
) -> dict[str, Any]:
    raw_text = visible_text(soup)
    name = None
    if name_selector:
        tag = soup.select_one(name_selector)
        name = clean_text(tag.get_text(" ")) if tag else None
    if not name:
        h1 = soup.find("h1")
        name = clean_text(h1.get_text(" ")) if h1 else page_title(soup)
    fields = extract_contact_fields(soup, page_url)
    if extra_fields:
        fields.update({key: value for key, value in extra_fields.items() if value not in (None, "", [], {})})
    images = extract_images(soup, page_url)
    prices = fields.get("prices_found")
    return {
        "source_slug": source_slug,
        "source_url": canonical_url(soup, page_url),
        "name": name,
        "description": fields.get("meta_description"),
        "address": None,
        "locality": None,
        "region": None,
        "postal_code": None,
        "country": None,
        "phone": fields.get("phone"),
        "email": fields.get("email"),
        "website": None,
        "latitude": None,
        "longitude": None,
        "price_text": "; ".join(prices) if isinstance(prices, list) else None,
        "rating": None,
        "review_count": None,
        "image_url": images[0]["url"] if images else None,
        "images": images,
        "services_json": None,
        "procedures_json": None,
        "raw_text": raw_text,
        "raw_json": {},
        "reviews": [],
        "fields": fields,
    }


def json_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def _image_values(value: Any, page_url: str) -> list[dict[str, Any]]:
    if not value:
        return []
    if isinstance(value, str):
        return [{"url": urljoin(page_url, value), "alt": None, "source_page_url": page_url}]
    if isinstance(value, dict):
        url = value.get("url") or value.get("contentUrl")
        return [{"url": urljoin(page_url, url), "alt": clean_text(value.get("caption") or value.get("name")), "source_page_url": page_url}] if url else []
    if isinstance(value, list):
        images: list[dict[str, Any]] = []
        for item in value:
            images.extend(_image_values(item, page_url))
        return dedupe_images(images)
    return []


def _first_srcset_url(srcset: str | None) -> str | None:
    if not srcset:
        return None
    first = srcset.split(",", 1)[0].strip()
    return first.split(" ", 1)[0].strip() if first else None


def _looks_like_logo_or_icon(url: str, alt: str | None) -> bool:
    text = f"{url} {alt or ''}".lower()
    return any(token in text for token in ("logo", "favicon", "icon", "sprite", "placeholder"))


def _float_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int_or_none(value: Any) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None
