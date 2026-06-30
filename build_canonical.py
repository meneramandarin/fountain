from __future__ import annotations

import ast
import csv
import json
import math
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from rapidfuzz import fuzz


ROOT = Path(__file__).resolve().parent
DB_DIR = ROOT / "data" / "databases"
CANONICAL_DB = ROOT / "canonical.db"
SCHEMA_PATH = ROOT / "schema.sql"
TAXONOMY_PATH = ROOT / "taxonomy_seed.json"
UNMAPPED_CSV = ROOT / "unmapped_terms.csv"

LOCATION_SOURCES = {
    "biohacking_map",
    "bookimed_longevity",
    "world_longevity_clinics",
    "bioedge_clinics",
    "spannr",
    "immortality_clinic",
    "longevity_technology_clinics",
    "human_longevity",
    "stem_cell_authority",
    "mayo_executive_health_locations",
}
EDITORIAL_ORG_SOURCES = {
    "best_executive_physical_programs",
    "fountain_life_best_longevity_clinics_blog",
}
PRACTITIONER_SOURCES = {
    "bookimed_longevity_doctors",
    "bookimed_longevity_doctors_thailand",
    "bookimed_longevity_doctors_turkey",
    "concierge_doctors_near_me",
    "longevitydocs_directory",
}
SERVICE_AREA_SOURCES = {"exec_health"}
DOCUMENT_SOURCES = {
    "healing_harmony_thailand_pdf",
    "korea_medical_directory_pdf",
    "thailand_longevity_guidebook_pdf",
    "turkey_health_tourism_authorized_providers",
}
SINGLE_PAGE_LOCATION_SOURCES = {
    "istanbul_med_assist_stem_cell_longevity",
    "istanbul_stem_cell_aging",
    "longevity_suite_istanbul_biohacking",
    "longevita_clinics",
    "meditrip_seoul",
    "turkey_healthcare_group_regenerative",
}
MEDICAL_TRAVEL_SOURCE_PREFIXES = (
    "mymeditravel_",
    "placidway_",
    "korea_health_pages_",
)
HIGH_VOLUME_SOURCES = {"stem_cell_authority", "bioedge_clinics"}
SOURCE_OWNED_DOMAINS = {
    "bookimed.com",
    "us-uk.bookimed.com",
    "longevity.technology",
    "longevitydocs.org",
    "newsletter.longevitydocs.org",
    "bestexecutivephysicalprograms.com",
    "conciergedoctorsnearme.com",
}


def is_bookimed_doctor_source(source_slug: str) -> bool:
    return source_slug == "bookimed_longevity_doctors" or source_slug.startswith("bookimed_longevity_doctors_")


def is_bookimed_clinic_source(source_slug: str) -> bool:
    return (source_slug == "bookimed_longevity" or source_slug.startswith("bookimed_longevity_")) and not is_bookimed_doctor_source(source_slug)


EXTRA_COUNTRY_ALIASES = {
    "Australia": "AU",
    "AU": "AU",
    "Azerbaijan": "AZ",
    "AZ": "AZ",
    "Belarus": "BY",
    "BY": "BY",
    "Brazil": "BR",
    "BR": "BR",
    "Canada": "CA",
    "CA": "CA",
    "China": "CN",
    "CN": "CN",
    "Colombia": "CO",
    "CO": "CO",
    "Costa Rica": "CR",
    "CR": "CR",
    "Dominican Republic": "DO",
    "DO": "DO",
    "Egypt": "EG",
    "EG": "EG",
    "France": "FR",
    "FR": "FR",
    "Greece": "GR",
    "GR": "GR",
    "Hungary": "HU",
    "HU": "HU",
    "India": "IN",
    "IN": "IN",
    "Israel": "IL",
    "IL": "IL",
    "Laos": "LA",
    "LA": "LA",
    "Latvia": "LV",
    "LV": "LV",
    "Malaysia": "MY",
    "MY": "MY",
    "Panama": "PA",
    "PA": "PA",
    "South Korea": "KR",
    "Korea": "KR",
    "KR": "KR",
}


class CanonicalBuilder:
    def __init__(self) -> None:
        self.taxonomy = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
        self.country_aliases = {
            normalize_country_key(k): v for k, v in self.taxonomy.get("country_aliases", {}).items()
        }
        self.country_aliases.update({normalize_country_key(k): v for k, v in EXTRA_COUNTRY_ALIASES.items()})
        self.country_names = country_name_map()
        self.conn = sqlite3.connect(CANONICAL_DB)
        self.conn.row_factory = sqlite3.Row
        self.source_ids: dict[str, int] = {}
        self.treatment_ids: dict[str, int] = {}
        self.treatment_names_by_id: dict[int, str] = {}
        self.alias_to_treatment: dict[str, int] = {}
        self.alias_candidates: list[tuple[str, str, int]] = []
        self.tag_ids: dict[tuple[str, str], int] = {}
        self.org_by_key: dict[str, int] = {}
        self.orgs: dict[int, dict[str, Any]] = {}
        self.locations_by_key: dict[str, int] = {}
        self.locations: dict[int, dict[str, Any]] = {}
        self.practitioners_by_key: dict[str, int] = {}
        self.practitioner_search_meta: dict[int, dict[str, Any]] = {}
        self.bookimed_clinics: dict[str, dict[str, int | None]] = {}
        self.source_record_counts: Counter[str] = Counter()
        self.service_area_count = 0
        self.skipped_practitioner_reviews = 0
        self.deviation_notes: list[str] = []

    def build(self) -> None:
        self.reset_db()
        self.load_taxonomy()
        self.register_sources()
        self.process_sources()
        self.populate_search_index()
        self.export_unmapped_terms()
        self.print_report()
        self.conn.close()

    def reset_db(self) -> None:
        if CANONICAL_DB.exists():
            CANONICAL_DB.unlink()
        self.conn = sqlite3.connect(CANONICAL_DB)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.conn.commit()

    def load_taxonomy(self) -> None:
        for domain in self.taxonomy["domains"]:
            category_id = self.insert_category(domain["name"])
            for treatment_name in domain.get("treatments", []):
                treatment_id = self.insert_treatment(treatment_name, category_id)
                self.insert_alias(treatment_id, treatment_name, "")
        for treatment_name, aliases in self.taxonomy.get("alias_seed", {}).items():
            treatment_id = self.treatment_ids.get(treatment_name)
            if not treatment_id:
                continue
            for alias in aliases:
                self.insert_alias(treatment_id, alias, "")
        for value in self.taxonomy.get("care_model_tags", []):
            self.insert_tag("care_model", value)
        for value in self.taxonomy.get("entity_type_tags", []):
            self.insert_tag("entity_type", value)
        self.refresh_alias_index()

    def insert_category(self, name: str) -> int:
        self.conn.execute("INSERT OR IGNORE INTO categories(name) VALUES (?)", (name,))
        return int(self.conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()["id"])

    def insert_treatment(self, name: str, category_id: int) -> int:
        self.conn.execute(
            "INSERT OR IGNORE INTO treatments(canonical_name, category_id) VALUES (?, ?)",
            (name, category_id),
        )
        row = self.conn.execute("SELECT id FROM treatments WHERE canonical_name = ?", (name,)).fetchone()
        treatment_id = int(row["id"])
        self.treatment_ids[name] = treatment_id
        self.treatment_names_by_id[treatment_id] = name
        return treatment_id

    def insert_alias(self, treatment_id: int, alias_text: str, source_slug: str | None) -> None:
        alias_text = clean(alias_text)
        if not alias_text:
            return
        self.conn.execute(
            """
            INSERT OR IGNORE INTO treatment_aliases(treatment_id, alias_text, alias_normalized, source_slug)
            VALUES (?, ?, ?, ?)
            """,
            (treatment_id, alias_text, normalize_term(alias_text), source_slug or ""),
        )

    def refresh_alias_index(self) -> None:
        self.alias_to_treatment.clear()
        self.alias_candidates.clear()
        for row in self.conn.execute(
            "SELECT treatment_id, alias_text, alias_normalized FROM treatment_aliases ORDER BY length(alias_normalized) DESC"
        ):
            alias_norm = row["alias_normalized"]
            if not alias_norm:
                continue
            self.alias_to_treatment.setdefault(alias_norm, int(row["treatment_id"]))
            self.alias_candidates.append((alias_norm, row["alias_text"], int(row["treatment_id"])))

    def insert_tag(self, facet: str, value: str) -> int:
        facet = clean(facet) or "source_tag"
        value = clean(value)
        if not value:
            raise ValueError("empty tag value")
        key = (facet, value)
        if key in self.tag_ids:
            return self.tag_ids[key]
        self.conn.execute("INSERT OR IGNORE INTO tags(facet, value) VALUES (?, ?)", key)
        tag_id = int(self.conn.execute("SELECT id FROM tags WHERE facet = ? AND value = ?", key).fetchone()["id"])
        self.tag_ids[key] = tag_id
        return tag_id

    def add_entity_tag(self, entity_type: str, entity_id: int, facet: str, value: str | None) -> None:
        value = clean(value)
        if not value:
            return
        tag_id = self.insert_tag(facet, value)
        self.conn.execute(
            """
            INSERT OR IGNORE INTO entity_tags(entity_type, entity_id, tag_id)
            VALUES (?, ?, ?)
            """,
            (entity_type, entity_id, tag_id),
        )

    def register_sources(self) -> None:
        for db_path in sorted(DB_DIR.glob("*.sqlite")):
            slug = db_path.stem
            staging = open_staging(db_path)
            metadata = source_metadata(staging)
            name = metadata.get("name") or slug
            seeds = parse_jsonish(metadata.get("seeds")) or []
            first_seed = seeds[0] if isinstance(seeds, list) and seeds else None
            base_url = base_url_from(first_seed)
            record_count = int(staging.execute("SELECT COUNT(*) FROM listings").fetchone()[0])
            self.conn.execute(
                """
                INSERT INTO sources(slug, name, base_url, scraped_at, record_count)
                VALUES (?, ?, ?, ?, ?)
                """,
                (slug, name, base_url, metadata.get("scraped_at"), record_count),
            )
            self.source_ids[slug] = int(self.conn.execute("SELECT id FROM sources WHERE slug = ?", (slug,)).fetchone()["id"])
            staging.close()
        self.conn.commit()

    def process_sources(self) -> None:
        for db_path in sorted(DB_DIR.glob("*.sqlite")):
            slug = db_path.stem
            staging = open_staging(db_path)
            rows = list(staging.execute("SELECT * FROM listings ORDER BY id"))
            if slug in DOCUMENT_SOURCES:
                for row in rows:
                    fields = listing_fields(staging, int(row["id"]))
                    self.process_document(slug, row, fields)
                staging.close()
                continue
            for row in rows:
                fields = listing_fields(staging, int(row["id"]))
                if slug in SERVICE_AREA_SOURCES:
                    self.process_service_area(slug, row, fields)
                elif slug in PRACTITIONER_SOURCES:
                    self.process_practitioner(slug, row, fields, staging)
                elif slug in EDITORIAL_ORG_SOURCES:
                    self.process_editorial_org(slug, row, fields, staging)
                else:
                    self.process_location(slug, row, fields, staging)
            staging.close()
            self.conn.commit()

    def process_service_area(self, slug: str, row: sqlite3.Row, fields: dict[str, Any]) -> None:
        source_id = self.source_ids[slug]
        entity_id = int(row["id"])
        self.service_area_count += 1
        self.add_source_record(source_id, "service_area", entity_id, row)
        self.add_entity_tag("service_area", entity_id, "entity_type", "service area")
        self.add_entity_tag("service_area", entity_id, "service_area_city", fields.get("city") or row["locality"])
        for raw in extract_terms(row["services_json"]):
            treatment_id = self.match_treatment(raw)
            if treatment_id:
                self.add_entity_tag("service_area", entity_id, "service_area_service", self.treatment_names_by_id[treatment_id])
            else:
                self.add_entity_tag("service_area", entity_id, "service_area_service", raw)

    def process_document(self, slug: str, row: sqlite3.Row, fields: dict[str, Any]) -> None:
        source_id = self.source_ids[slug]
        page_number = parse_int(fields.get("page_number"))
        self.conn.execute(
            """
            INSERT INTO documents(source_id, title, source_url, document_type, page_number, local_path, raw_text)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source_id,
                clean(row["name"]),
                clean(row["source_url"]),
                clean(fields.get("record_type")) or "document",
                page_number,
                clean(fields.get("local_pdf_path")),
                clean(row["raw_text"]),
            ),
        )
        document_id = int(self.conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        self.add_source_record(source_id, "document", document_id, row)
        self.add_entity_tag("document", document_id, "entity_type", "document")
        self.add_entity_tag("document", document_id, "source_record_type", clean(fields.get("record_type")) or "document")
        for raw in scan_known_treatments(row["raw_text"]):
            treatment_id = self.match_treatment(raw)
            if treatment_id:
                self.add_entity_tag("document", document_id, "mentioned_treatment", self.treatment_names_by_id[treatment_id])
            else:
                self.add_entity_tag("document", document_id, "mentioned_treatment", raw)

    def process_editorial_org(self, slug: str, row: sqlite3.Row, fields: dict[str, Any], staging: sqlite3.Connection) -> None:
        source_id = self.source_ids[slug]
        country_name, country_code = self.country_for(row, fields)
        org_id = self.get_organization(
            source_slug=slug,
            name=row["name"],
            website=row["website"],
            country_code=country_code,
            locality=row["locality"],
            latitude=None,
            longitude=None,
            description=row["description"],
        )
        self.add_source_record(source_id, "organization", org_id, row)
        self.add_entity_tag("organization", org_id, "trust", "editorially ranked")
        if fields.get("rank"):
            self.add_entity_tag("organization", org_id, "trust", f"editorial rank {fields['rank']}")
        self.add_entity_tag("organization", org_id, "care_model", "executive health program" if slug == "best_executive_physical_programs" else None)
        self.copy_images(staging, int(row["id"]), "organization", org_id, source_id)

    def process_location(self, slug: str, row: sqlite3.Row, fields: dict[str, Any], staging: sqlite3.Connection) -> None:
        source_id = self.source_ids[slug]
        mapped = self.map_location(slug, row, fields)
        org_id = self.get_organization(
            source_slug=slug,
            name=mapped["org_name"],
            website=mapped.get("org_website") or mapped.get("website"),
            country_code=mapped.get("country_code"),
            locality=mapped.get("locality"),
            latitude=mapped.get("latitude"),
            longitude=mapped.get("longitude"),
            description=mapped.get("description"),
        )
        location_id = self.get_location(org_id, slug, mapped)
        self.add_source_record(source_id, "organization", org_id, row)
        self.add_source_record(source_id, "location", location_id, row)
        for facet, value in mapped.get("tags", []):
            self.add_entity_tag("location", location_id, facet, value)
            if facet in {"care_model", "entity_type", "trust"}:
                self.add_entity_tag("organization", org_id, facet, value)
        for raw in mapped.get("offer_terms", []):
            self.add_offering(location_id, raw, source_id)
        for raw in mapped.get("mixed_terms", []):
            self.route_mixed_term(location_id, raw, source_id)
        for offer in mapped.get("offers", []):
            self.add_offering(
                location_id,
                offer.get("raw_name"),
                source_id,
                price_amount=offer.get("price_amount"),
                price_currency=offer.get("price_currency"),
                source_offer_url=offer.get("source_offer_url"),
            )
        if is_bookimed_clinic_source(slug):
            self.index_bookimed_clinic(row, org_id, location_id)
        self.copy_images(staging, int(row["id"]), "location", location_id, source_id)
        self.copy_reviews(staging, int(row["id"]), location_id, source_id)

    def process_practitioner(self, slug: str, row: sqlite3.Row, fields: dict[str, Any], staging: sqlite3.Connection) -> None:
        source_id = self.source_ids[slug]
        mapped = self.map_practitioner(slug, row, fields)
        practitioner_id = self.get_practitioner(mapped)
        self.remember_practitioner_search_meta(practitioner_id, mapped)
        self.add_source_record(source_id, "practitioner", practitioner_id, row)
        for facet, value in mapped.get("tags", []):
            self.add_entity_tag("practitioner", practitioner_id, facet, value)
        if mapped.get("linked_clinic"):
            linked = self.resolve_bookimed_clinic(mapped["linked_clinic"])
            if linked:
                self.add_affiliation(practitioner_id, linked.get("location_id"), linked.get("org_id"), mapped.get("primary_specialty"))
        if mapped.get("practice"):
            org_id = self.get_organization(
                source_slug=slug,
                name=mapped["practice"],
                website=None,
                country_code=mapped.get("country_code"),
                locality=mapped.get("locality"),
                latitude=None,
                longitude=None,
                description=None,
            )
            self.add_source_record(source_id, "organization", org_id, row)
            self.add_affiliation(practitioner_id, None, org_id, mapped.get("primary_specialty"))
        self.copy_images(staging, int(row["id"]), "practitioner", practitioner_id, source_id)
        review_count = int(staging.execute("SELECT COUNT(*) FROM reviews WHERE listing_id = ?", (int(row["id"]),)).fetchone()[0])
        if review_count:
            self.skipped_practitioner_reviews += review_count

    def map_location(self, slug: str, row: sqlite3.Row, fields: dict[str, Any]) -> dict[str, Any]:
        country_name, country_code = self.country_for(row, fields)
        locality = clean(row["locality"])
        region = clean(row["region"])
        address = clean(row["address"])
        tags: list[tuple[str, str]] = [("entity_type", "clinic")]
        offer_terms: list[str] = []
        mixed_terms: list[str] = []
        offers: list[dict[str, Any]] = []
        org_name = clean(row["name"])
        org_website = clean(row["website"])

        if slug == "biohacking_map":
            procedures = parse_jsonish(row["procedures_json"]) or {}
            offer_terms.extend(extract_terms(row["services_json"]))
            for key in ("advancedTreatments", "foundationalTreatments", "techSpecs"):
                offer_terms.extend(extract_terms(procedures.get(key)))
            tags.extend(self.biohacking_tags(fields, procedures))
        elif is_bookimed_clinic_source(slug):
            services = parse_jsonish(row["services_json"]) or {}
            for offer in services.get("offers", []) if isinstance(services, dict) else []:
                if not isinstance(offer, dict):
                    continue
                offers.append(
                    {
                        "raw_name": offer.get("name"),
                        "price_amount": parse_float(offer.get("price")),
                        "price_currency": clean(offer.get("priceCurrency")),
                        "source_offer_url": clean(offer.get("url")),
                    }
                )
            raw_json = parse_jsonish(row["raw_json"]) or {}
            for dept in raw_json.get("department", []) if isinstance(raw_json, dict) else []:
                if isinstance(dept, dict):
                    tags.extend(tags_for_source_value(dept.get("name")))
            tags.extend(price_tags(row["price_text"]))
        elif slug == "world_longevity_clinics":
            offer_terms.extend(extract_terms(row["services_json"]))
            tags.extend(price_tags(row["price_text"]))
        elif slug == "bioedge_clinics":
            mixed_terms.extend(extract_terms(row["services_json"]))
            mixed_terms.extend(extract_terms((parse_jsonish(row["procedures_json"]) or {}).get("tags")))
            mixed_terms.extend(extract_terms(fields.get("tags")))
        elif slug == "stem_cell_authority":
            offer_terms.append("Stem Cell Therapy")
            tags.append(("entity_type", "stem cell clinic"))
            tags.extend(tags_for_source_value("stem cell clinic"))
            tags.extend(tags_for_source_value(fields.get("listing_tags")))
            category = clean(fields.get("listing_category"))
            cat_city, cat_region = parse_city_region(category)
            if cat_city and cat_region:
                locality, region = cat_city, cat_region
                country_name, country_code = "USA", "US"
        elif slug == "spannr":
            raw = " ".join(clean(part) or "" for part in [row["raw_text"], fields.get("card_text")])
            offer_terms.extend(scan_known_treatments(raw))
            tags.extend(spannr_tags(raw))
            parsed = parse_us_city_state(address or raw)
            if parsed:
                locality, region = parsed
                country_name, country_code = "USA", "US"
        elif slug == "immortality_clinic":
            raw = " ".join(clean(part) or "" for part in [row["raw_text"], fields.get("card_text")])
            offer_terms.extend(scan_known_treatments(raw))
            tags.extend(price_tags(row["price_text"]))
            tags.extend(tags_for_source_value(raw))
        elif slug == "longevity_technology_clinics":
            offer_terms.extend(extract_terms(row["services_json"]))
            procedures = parse_jsonish(row["procedures_json"]) or {}
            offer_terms.extend(extract_terms(procedures.get("offerings")))
            for category in extract_terms(procedures.get("categories")) + extract_terms(fields.get("clinic_categories")):
                tags.extend(tags_for_source_value(category))
            branch_locations = extract_terms(procedures.get("locations")) + extract_terms(fields.get("branch_locations"))
            if branch_locations and not locality:
                locality = branch_locations[0]
        elif slug == "human_longevity":
            raw_json = parse_jsonish(row["raw_json"]) or {}
            offer_terms.extend(scan_known_treatments(row["raw_text"] or json.dumps(raw_json)))
            tags.append(("care_model", "executive health program"))
            address_obj = first_mapping(raw_json.get("address")) if isinstance(raw_json, dict) else {}
            if address_obj and not locality:
                locality = clean(address_obj.get("addressLocality"))
                region = clean(address_obj.get("addressRegion"))
                country_name = clean(address_obj.get("addressCountry")) or country_name
                country_code = self.normalize_country(country_name)
                address = format_address(address_obj) or address
        elif slug == "mayo_executive_health_locations":
            org_name = "Mayo Clinic"
            org_website = "https://www.mayoclinic.org"
            offer_terms.append("Executive Health Program")
            tags.append(("care_model", "executive health program"))
            tags.append(("entity_type", "clinic"))
        elif slug.startswith("mymeditravel_"):
            offer_terms.extend(extract_terms(row["services_json"]))
            offer_terms.extend(extract_terms((parse_jsonish(row["procedures_json"]) or {}).get("procedures")))
            offer_terms.extend(scan_known_treatments(row["raw_text"]))
            tags.append(("care_model", "destination or medical tourism"))
            tags.extend(tags_for_source_value(fields.get("procedure_type")))
        elif slug.startswith("placidway_"):
            offer_terms.extend(extract_terms(row["services_json"]))
            procedures = parse_jsonish(row["procedures_json"]) or {}
            offer_terms.extend(extract_terms(procedures.get("prices")))
            offer_terms.extend(extract_terms(procedures.get("packages")))
            offer_terms.extend(scan_known_treatments(row["raw_text"]))
            tags.append(("care_model", "destination or medical tourism"))
            if parse_int(row["review_count"]):
                tags.append(("trust", "has reviews"))
        elif slug == "medical_travel_market_longevity_programs":
            offer_terms.extend(extract_terms(row["services_json"]))
            offer_terms.extend(scan_known_treatments(row["raw_text"]))
            tags.append(("care_model", "wellness retreat"))
            tags.append(("care_model", "destination or medical tourism"))
        elif slug == "gangnam_medical_tourism":
            table_fields = parse_jsonish(fields.get("table_fields")) or {}
            medical_field = table_fields.get("Medical field") if isinstance(table_fields, dict) else None
            offer_terms.extend(extract_terms(row["services_json"]))
            offer_terms.extend(scan_known_treatments(row["raw_text"]))
            mixed_terms.extend(extract_terms(medical_field))
            if isinstance(table_fields, dict) and table_fields.get("Certificate of healthcare provider for international patients"):
                tags.append(("trust", "international health tourism certificate"))
            tags.append(("care_model", "destination or medical tourism"))
        elif slug.startswith("korea_health_pages_"):
            mixed_terms.extend(extract_terms(row["services_json"]))
            mixed_terms.extend(extract_terms((parse_jsonish(row["procedures_json"]) or {}).get("categories")))
            offer_terms.extend(scan_known_treatments(row["raw_text"]))
            tags.append(("care_model", "destination or medical tourism"))
        elif slug == "uniclinics_turkey_clinics":
            offer_terms.extend(extract_terms(row["services_json"]))
            offer_terms.extend(scan_known_treatments(row["raw_text"]))
            tags.append(("care_model", "destination or medical tourism"))
            tags.append(("entity_type", "hospital"))
        elif slug in SINGLE_PAGE_LOCATION_SOURCES:
            offer_terms.extend(extract_terms(row["services_json"]))
            offer_terms.extend(scan_known_treatments(row["raw_text"]))
            tags.extend(tags_for_source_value(extract_terms(row["services_json"])))
            if slug in {"longevita_clinics", "meditrip_seoul"}:
                tags.append(("care_model", "destination or medical tourism"))
        else:
            offer_terms.extend(extract_terms(row["services_json"]))
            offer_terms.extend(extract_terms(row["procedures_json"]))

        if fields.get("record_type"):
            tags.append(("source_record_type", clean(fields.get("record_type")) or "unknown"))
        if row["price_text"] and re.fullmatch(r"\${1,5}", clean(row["price_text"]) or ""):
            tags.append(("price_tier", clean(row["price_text"])))
        return {
            "org_name": org_name,
            "org_website": org_website,
            "name": clean(row["name"]),
            "description": clean(row["description"]),
            "address": address,
            "locality": locality,
            "region": region,
            "postal_code": clean(row["postal_code"]),
            "country_name": country_name,
            "country_code": country_code,
            "latitude": parse_float(row["latitude"]),
            "longitude": parse_float(row["longitude"]),
            "phone": clean(row["phone"]),
            "email": clean(row["email"]),
            "website": clean(row["website"]),
            "price_text": clean(row["price_text"]),
            "rating": parse_float(row["rating"]),
            "review_count": parse_int(row["review_count"]),
            "tags": dedupe_pairs(tags),
            "offer_terms": dedupe_list(offer_terms),
            "mixed_terms": dedupe_list(mixed_terms),
            "offers": offers,
        }

    def biohacking_tags(self, fields: dict[str, Any], procedures: dict[str, Any]) -> list[tuple[str, str]]:
        tags: list[tuple[str, str]] = []
        service_model = clean(fields.get("service_model"))
        if service_model:
            tags.extend(tags_for_source_value(service_model))
        category = clean(fields.get("category"))
        if category:
            if category == "Programs & Telehealth":
                tags.append(("care_model", "telehealth"))
            tags.extend(tags_for_source_value(category))
        if str(fields.get("medical_oversight")).lower() == "true":
            tags.append(("trust", "medical oversight"))
        for key in ("verification", "premium_tier"):
            value = clean(fields.get(key))
            if value:
                tags.append(("trust", value.lower()))
        goal = clean(procedures.get("primaryGoal"))
        if goal:
            tags.append(("goal", goal))
        return tags

    def map_practitioner(self, slug: str, row: sqlite3.Row, fields: dict[str, Any]) -> dict[str, Any]:
        procedures = parse_jsonish(row["procedures_json"]) or {}
        country_name, country_code = self.country_for(row, fields)
        locality = clean(row["locality"])
        region = clean(row["region"])
        tags: list[tuple[str, str]] = [("entity_type", "practitioner"), ("entity_type", "doctor")]
        primary_specialty = None
        years_experience = None
        languages = None
        practice = None
        linked_clinic = None
        specialties: list[str] = []

        if is_bookimed_doctor_source(slug):
            spec = clean(fields.get("specialization") or procedures.get("specialization"))
            primary_specialty, years_experience = parse_specialization(spec)
            languages = clean(fields.get("languages") or procedures.get("languages"))
            linked_clinic = clean(fields.get("linked_clinic") or procedures.get("linked_clinic"))
            if procedures.get("online_consultation") == "available":
                tags.append(("care_model", "telehealth"))
            for service in extract_terms(row["services_json"]):
                if not re.search(r"\d+\s+years?\s+of\s+experience", service, re.I):
                    specialties.append(service)
            workplace = clean(procedures.get("workplace") or fields.get("workplace") or row["address"])
            if linked_clinic:
                linked = self.resolve_bookimed_clinic(linked_clinic)
                if linked:
                    country_code = linked.get("country_code") or country_code
                    country_name = self.country_names.get(country_code or "", country_name)
                    locality = linked.get("locality") or locality
            if not country_code and workplace:
                country_name, locality_from_workplace = parse_workplace_country_city(workplace)
                country_code = self.normalize_country(country_name)
                locality = locality or locality_from_workplace
        elif slug == "concierge_doctors_near_me":
            categories = extract_terms(procedures.get("categories")) + extract_terms(fields.get("category"))
            primary_specialty = categories[0] if categories else None
            specialties.extend(categories)
            tags.append(("care_model", "concierge or membership"))
            tags.extend(tags_for_source_value(primary_specialty))
            region_label = clean((procedures.get("regions") or [None])[0] if isinstance(procedures.get("regions"), list) else fields.get("region_label"))
            parsed = parse_city_state_from_label(region_label)
            if parsed:
                locality, region = parsed
            country_name, country_code = "USA", "US"
            if parse_float(row["rating"]):
                tags.append(("trust", "has rating"))
            if parse_int(row["review_count"]):
                tags.append(("trust", "has reviews"))
        elif slug == "longevitydocs_directory":
            specialties.extend(extract_terms(fields.get("specialties")))
            specialties.extend(extract_terms(procedures.get("specialties")))
            specialties.extend(extract_terms(fields.get("treatments")))
            primary_specialty = specialties[0] if specialties else None
            languages = None
            practice = clean(fields.get("practice") or procedures.get("practice"))
            if not country_code:
                country_name, country_code = "USA", "US"
            tags.extend(tags_for_source_value(primary_specialty))

        if not primary_specialty and specialties:
            primary_specialty = specialties[0]
        return {
            "full_name": clean(row["name"]),
            "credentials": clean(fields.get("degree_or_title")),
            "primary_specialty": clean(primary_specialty),
            "years_experience": years_experience,
            "languages": languages,
            "specialties": dedupe_list(specialties),
            "locality": locality,
            "region": region,
            "country_name": country_name,
            "country_code": country_code,
            "linked_clinic": linked_clinic,
            "practice": practice,
            "tags": dedupe_pairs(tags),
        }

    def country_for(self, row: sqlite3.Row, fields: dict[str, Any]) -> tuple[str | None, str | None]:
        country_name = clean(row["country"])
        country_code = self.normalize_country(country_name)
        if not country_code:
            raw_json = parse_jsonish(row["raw_json"])
            inferred = country_from_json(raw_json)
            if inferred:
                country_name = inferred
                country_code = self.normalize_country(inferred)
        if not country_code:
            inferred = country_from_text(" ".join(clean(v) or "" for v in [row["address"], row["raw_text"], fields.get("listing_category")]))
            if inferred:
                country_name = inferred
                country_code = self.normalize_country(inferred)
        return country_name, country_code

    def normalize_country(self, value: str | None) -> str | None:
        value = clean(value)
        if not value:
            return None
        if re.fullmatch(r"[A-Z]{2}", value):
            return value
        return self.country_aliases.get(normalize_country_key(value))

    def get_organization(
        self,
        *,
        source_slug: str,
        name: str | None,
        website: str | None,
        country_code: str | None,
        locality: str | None,
        latitude: float | None,
        longitude: float | None,
        description: str | None,
    ) -> int:
        name = clean(name) or "Unknown organization"
        name_norm = normalize_name(name)
        domain = provider_domain(website, source_slug)
        key = domain or f"{slugify(name)}|{country_code or ''}"
        if source_slug in HIGH_VOLUME_SOURCES and not domain and locality:
            key = f"{key}|{slugify(locality)}"
        if key in self.org_by_key:
            return self.org_by_key[key]
        for org_id, meta in self.orgs.items():
            if name_norm == meta["name_normalized"] and countries_compatible(country_code, meta.get("country_code")):
                self.org_by_key[key] = org_id
                return org_id
        for org_id, meta in self.orgs.items():
            if not countries_compatible(country_code, meta.get("country_code")):
                continue
            if fuzz.token_set_ratio(name_norm, meta["name_normalized"]) >= 92:
                self.org_by_key[key] = org_id
                return org_id
        self.conn.execute(
            """
            INSERT INTO organizations(canonical_name, name_normalized, website_domain, description, dedup_key)
            VALUES (?, ?, ?, ?, ?)
            """,
            (name, name_norm, domain, clean(description), key),
        )
        org_id = int(self.conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        self.org_by_key[key] = org_id
        self.orgs[org_id] = {
            "canonical_name": name,
            "name_normalized": name_norm,
            "website_domain": domain,
            "country_code": country_code,
            "locality": locality,
            "latitude": latitude,
            "longitude": longitude,
        }
        return org_id

    def get_location(self, org_id: int, source_slug: str, mapped: dict[str, Any]) -> int:
        locality_key = slugify(mapped.get("locality") or "")
        address_key = slugify(mapped.get("address") or "")
        org_key = next((key for key, value in self.org_by_key.items() if value == org_id), f"org:{org_id}")
        key_parts = [org_key, locality_key or address_key or "main"]
        if mapped.get("region"):
            key_parts.append(slugify(mapped["region"]))
        if source_slug in HIGH_VOLUME_SOURCES and address_key:
            key_parts.append(address_key[:80])
        key = "|".join(key_parts)
        if key in self.locations_by_key:
            return self.locations_by_key[key]
        self.conn.execute(
            """
            INSERT INTO locations(
                org_id, name, address, locality, region, postal_code, country_code, country_name,
                latitude, longitude, phone, email, website, price_text, rating, review_count, dedup_key
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                org_id,
                mapped.get("name"),
                mapped.get("address"),
                mapped.get("locality"),
                mapped.get("region"),
                mapped.get("postal_code"),
                mapped.get("country_code"),
                mapped.get("country_name"),
                mapped.get("latitude"),
                mapped.get("longitude"),
                mapped.get("phone"),
                mapped.get("email"),
                mapped.get("website"),
                mapped.get("price_text"),
                mapped.get("rating"),
                mapped.get("review_count"),
                key,
            ),
        )
        location_id = int(self.conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        self.locations_by_key[key] = location_id
        self.locations[location_id] = mapped | {"org_id": org_id}
        return location_id

    def get_practitioner(self, mapped: dict[str, Any]) -> int:
        full_name = clean(mapped.get("full_name")) or "Unknown practitioner"
        name_norm = normalize_name(full_name)
        key = f"{name_norm}|{slugify(mapped.get('locality') or '')}|{slugify(mapped.get('practice') or mapped.get('linked_clinic') or '')}"
        if key in self.practitioners_by_key:
            return self.practitioners_by_key[key]
        self.conn.execute(
            """
            INSERT INTO practitioners(full_name, name_normalized, credentials, primary_specialty, years_experience, languages, dedup_key)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                full_name,
                name_norm,
                mapped.get("credentials"),
                mapped.get("primary_specialty"),
                mapped.get("years_experience"),
                mapped.get("languages"),
                key,
            ),
        )
        practitioner_id = int(self.conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        self.practitioners_by_key[key] = practitioner_id
        return practitioner_id

    def remember_practitioner_search_meta(self, practitioner_id: int, mapped: dict[str, Any]) -> None:
        meta = self.practitioner_search_meta.setdefault(
            practitioner_id,
            {
                "locality": mapped.get("locality"),
                "country": mapped.get("country_name") or mapped.get("country_code"),
                "specialties": [],
            },
        )
        if not meta.get("locality") and mapped.get("locality"):
            meta["locality"] = mapped["locality"]
        if not meta.get("country") and (mapped.get("country_name") or mapped.get("country_code")):
            meta["country"] = mapped.get("country_name") or mapped.get("country_code")
        for value in [mapped.get("primary_specialty"), mapped.get("credentials"), mapped.get("languages")]:
            if value:
                meta["specialties"].append(value)
        meta["specialties"].extend(mapped.get("specialties") or [])
        meta["specialties"] = dedupe_list(meta["specialties"])

    def add_affiliation(self, practitioner_id: int, location_id: int | None, org_id: int | None, role: str | None) -> None:
        self.conn.execute(
            """
            INSERT OR IGNORE INTO affiliations(practitioner_id, location_id, org_id, role)
            VALUES (?, ?, ?, ?)
            """,
            (practitioner_id, location_id, org_id, clean(role)),
        )

    def add_source_record(self, source_id: int, entity_type: str, entity_id: int, row: sqlite3.Row) -> None:
        self.conn.execute(
            """
            INSERT INTO source_records(source_id, entity_type, entity_id, source_listing_id, source_url, raw_ref)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                source_id,
                entity_type,
                entity_id,
                int(row["id"]),
                row["source_url"],
                json.dumps({"source_slug": row["source_slug"], "listing_id": int(row["id"])}, sort_keys=True),
            ),
        )
        slug = self.conn.execute("SELECT slug FROM sources WHERE id = ?", (source_id,)).fetchone()["slug"]
        self.source_record_counts[slug] += 1

    def add_offering(
        self,
        location_id: int,
        raw_name: str | None,
        source_id: int,
        *,
        price_amount: float | None = None,
        price_currency: str | None = None,
        source_offer_url: str | None = None,
    ) -> None:
        raw_name = clean(raw_name)
        if not raw_name:
            return
        treatment_id = self.match_treatment(raw_name)
        if not treatment_id:
            source_slug = self.conn.execute("SELECT slug FROM sources WHERE id = ?", (source_id,)).fetchone()["slug"]
            self.upsert_unmapped(raw_name, source_slug)
        self.conn.execute(
            """
            INSERT INTO offerings(location_id, treatment_id, raw_name, price_amount, price_currency, source_offer_url, source_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (location_id, treatment_id, raw_name, price_amount, clean(price_currency), clean(source_offer_url), source_id),
        )

    def route_mixed_term(self, location_id: int, raw: str | None, source_id: int) -> None:
        raw = clean(raw)
        if not raw:
            return
        if self.match_treatment(raw):
            self.add_offering(location_id, raw, source_id)
            return
        facet, value = guess_tag(raw)
        if facet and value:
            self.add_entity_tag("location", location_id, facet, value)

    def match_treatment(self, raw: str | None) -> int | None:
        raw_norm = normalize_term(raw)
        if not raw_norm:
            return None
        if raw_norm in self.alias_to_treatment:
            return self.alias_to_treatment[raw_norm]
        for alias_norm, _alias_text, treatment_id in self.alias_candidates:
            if len(alias_norm) >= 3 and re.search(rf"\b{re.escape(alias_norm)}\b", raw_norm):
                return treatment_id
        best_id = None
        best_score = 0
        for alias_norm, _alias_text, treatment_id in self.alias_candidates:
            score = fuzz.token_set_ratio(raw_norm, alias_norm)
            if score > best_score:
                best_score = score
                best_id = treatment_id
        return best_id if best_score >= 93 else None

    def upsert_unmapped(self, raw_name: str, source_slug: str) -> None:
        self.conn.execute(
            """
            INSERT INTO unmapped_terms(term, source_slug, occurrences)
            VALUES (?, ?, 1)
            ON CONFLICT(term, source_slug) DO UPDATE SET occurrences = occurrences + 1
            """,
            (raw_name, source_slug),
        )

    def copy_images(self, staging: sqlite3.Connection, listing_id: int, entity_type: str, entity_id: int, source_id: int) -> None:
        for image in staging.execute("SELECT image_url, local_path, alt FROM images WHERE listing_id = ? ORDER BY id", (listing_id,)):
            self.conn.execute(
                """
                INSERT INTO images(entity_type, entity_id, image_url, local_path, alt, source_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (entity_type, entity_id, image["image_url"], image["local_path"], image["alt"], source_id),
            )

    def copy_reviews(self, staging: sqlite3.Connection, listing_id: int, location_id: int, source_id: int) -> None:
        for review in staging.execute(
            "SELECT reviewer, rating, review_date, body FROM reviews WHERE listing_id = ? ORDER BY id", (listing_id,)
        ):
            self.conn.execute(
                """
                INSERT INTO reviews(location_id, reviewer, rating, review_date, body, source_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (location_id, review["reviewer"], review["rating"], review["review_date"], review["body"], source_id),
            )

    def index_bookimed_clinic(self, row: sqlite3.Row, org_id: int, location_id: int) -> None:
        path = urlparse(row["source_url"] or "").path
        match = re.search(r"/clinic/([^/]+)/?", path)
        if not match:
            return
        slug = match.group(1)
        loc = self.conn.execute("SELECT country_code, country_name, locality FROM locations WHERE id = ?", (location_id,)).fetchone()
        self.bookimed_clinics[slug] = {
            "org_id": org_id,
            "location_id": location_id,
            "country_code": loc["country_code"],
            "locality": loc["locality"],
        }

    def resolve_bookimed_clinic(self, linked_clinic: str) -> dict[str, Any] | None:
        match = re.search(r"/clinic/([^/]+)/?", linked_clinic or "")
        if not match:
            return None
        return self.bookimed_clinics.get(match.group(1))

    def populate_search_index(self) -> None:
        self.conn.execute("DELETE FROM search_index")
        for row in self.conn.execute(
            """
            SELECT l.*, o.canonical_name AS org_name
            FROM locations l
            LEFT JOIN organizations o ON o.id = l.org_id
            ORDER BY l.id
            """
        ):
            treatments = self.location_treatment_text(int(row["id"]))
            tags = self.entity_tag_text("location", int(row["id"]))
            self.conn.execute(
                """
                INSERT INTO search_index(entity_type, entity_id, name, locality, country, treatments, specialties, tags)
                VALUES ('location', ?, ?, ?, ?, ?, '', ?)
                """,
                (
                    int(row["id"]),
                    row["name"] or row["org_name"],
                    row["locality"],
                    row["country_name"] or row["country_code"],
                    treatments,
                    tags,
                ),
            )
        for row in self.conn.execute("SELECT * FROM practitioners ORDER BY id"):
            meta = self.practitioner_search_meta.get(int(row["id"]), {})
            tags = self.entity_tag_text("practitioner", int(row["id"]))
            specialties = " ".join(meta.get("specialties") or [value for value in [row["primary_specialty"], row["credentials"], row["languages"]] if value])
            self.conn.execute(
                """
                INSERT INTO search_index(entity_type, entity_id, name, locality, country, treatments, specialties, tags)
                VALUES ('practitioner', ?, ?, ?, ?, '', ?, ?)
                """,
                (int(row["id"]), row["full_name"], meta.get("locality"), meta.get("country"), specialties, tags),
            )
        for row in self.conn.execute("SELECT * FROM documents ORDER BY id"):
            tags = self.entity_tag_text("document", int(row["id"]))
            self.conn.execute(
                """
                INSERT INTO search_index(entity_type, entity_id, name, locality, country, treatments, specialties, tags)
                VALUES ('document', ?, ?, '', '', ?, ?, ?)
                """,
                (
                    int(row["id"]),
                    row["title"],
                    clean(row["raw_text"]) or "",
                    clean(row["document_type"]) or "",
                    tags,
                ),
            )
        self.conn.commit()

    def location_treatment_text(self, location_id: int) -> str:
        values = []
        for row in self.conn.execute(
            """
            SELECT o.raw_name, t.canonical_name
            FROM offerings o
            LEFT JOIN treatments t ON t.id = o.treatment_id
            WHERE o.location_id = ?
            ORDER BY o.id
            """,
            (location_id,),
        ):
            values.extend([row["canonical_name"], row["raw_name"]])
        return " ".join(clean(value) or "" for value in values if value)

    def entity_tag_text(self, entity_type: str, entity_id: int) -> str:
        return " ".join(
            row["value"]
            for row in self.conn.execute(
                """
                SELECT t.value
                FROM entity_tags et
                JOIN tags t ON t.id = et.tag_id
                WHERE et.entity_type = ? AND et.entity_id = ?
                ORDER BY t.facet, t.value
                """,
                (entity_type, entity_id),
            )
        )

    def export_unmapped_terms(self) -> None:
        rows = list(
            self.conn.execute(
                "SELECT term, source_slug, occurrences FROM unmapped_terms ORDER BY occurrences DESC, lower(term), source_slug"
            )
        )
        with UNMAPPED_CSV.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(["term", "source_slug", "occurrences"])
            writer.writerows((row["term"], row["source_slug"], row["occurrences"]) for row in rows)

    def print_report(self) -> None:
        def count(table: str) -> int:
            return int(self.conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])

        priced = int(self.conn.execute("SELECT COUNT(*) FROM offerings WHERE price_amount IS NOT NULL").fetchone()[0])
        unpriced = int(self.conn.execute("SELECT COUNT(*) FROM offerings WHERE price_amount IS NULL").fetchone()[0])
        fountain = self.conn.execute(
            "SELECT id FROM organizations WHERE name_normalized = ? ORDER BY id", (normalize_name("Fountain Life"),)
        ).fetchall()
        fountain_count = len(fountain)
        fountain_sr = 0
        if fountain:
            fountain_sr = int(
                self.conn.execute(
                    "SELECT COUNT(*) FROM source_records WHERE entity_type = 'organization' AND entity_id = ?",
                    (int(fountain[0]["id"]),),
                ).fetchone()[0]
            )
        missing_sources = [
            row["slug"]
            for row in self.conn.execute(
                """
                SELECT s.slug
                FROM sources s
                LEFT JOIN source_records sr ON sr.source_id = s.id
                GROUP BY s.id
                HAVING COUNT(sr.id) = 0
                ORDER BY s.slug
                """
            )
        ]
        null_country_rows = list(
            self.conn.execute(
                """
                SELECT l.id, l.name, l.country_name
                FROM locations l
                WHERE l.country_name IS NOT NULL AND l.country_name != '' AND l.country_code IS NULL
                ORDER BY l.id
                """
            )
        )
        print("\nCanonical build report")
        print("======================")
        print(f"canonical_db: {CANONICAL_DB}")
        print(f"unmapped_terms_csv: {UNMAPPED_CSV}")
        print(f"organizations: {count('organizations')}")
        print(f"locations: {count('locations')}")
        print(f"practitioners: {count('practitioners')}")
        print(f"documents: {count('documents')}")
        print(f"service_area source rows: {self.service_area_count}")
        print(f"offerings: {count('offerings')} ({priced} with price, {unpriced} without price)")
        print(f"treatments: {count('treatments')}")
        print(f"aliases: {count('treatment_aliases')}")
        print(f"tags: {count('tags')}")
        print(f"images: {count('images')}")
        print(f"reviews: {count('reviews')}")
        print(f"source_records: {count('source_records')}")
        print(f"Fountain Life organization rows: {fountain_count}; first org source_records: {fountain_sr}")
        print(f"sources with zero source_records: {missing_sources or 'none'}")
        print(f"locations with source country but NULL country_code: {len(null_country_rows)}")
        if null_country_rows:
            for row in null_country_rows[:20]:
                print(f"  - location {row['id']}: {row['name']} ({row['country_name']})")
        unmapped_count = count("unmapped_terms")
        print(f"unmapped_terms: {unmapped_count}")
        print("top unmapped_terms:")
        for row in self.conn.execute(
            "SELECT term, source_slug, occurrences FROM unmapped_terms ORDER BY occurrences DESC, lower(term), source_slug LIMIT 30"
        ):
            print(f"  {row['occurrences']:>5}  {row['source_slug']:<40} {row['term']}")
        if self.skipped_practitioner_reviews:
            print(f"notes: skipped {self.skipped_practitioner_reviews} practitioner-source reviews because schema reviews table is location-scoped")
        if self.deviation_notes:
            print("deviation notes:")
            for note in self.deviation_notes:
                print(f"  - {note}")
        print("\nAcceptance checks")
        print(f"- Fountain Life collapsed to one exact-name organization with >=3 source_records: {fountain_count == 1 and fountain_sr >= 3}")
        print(f"- Every source has at least one source_records row: {not missing_sources}")
        print(f"- Source-country locations with NULL country_code is zero: {len(null_country_rows) == 0}")
        print("\nExample queries")
        print(EXAMPLE_QUERIES.strip())


def open_staging(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def source_metadata(conn: sqlite3.Connection) -> dict[str, Any]:
    return {row["key"]: parse_jsonish(row["value"]) for row in conn.execute("SELECT key, value FROM source_metadata")}


def listing_fields(conn: sqlite3.Connection, listing_id: int) -> dict[str, Any]:
    return {
        row["field_name"]: parse_jsonish(row["field_value"])
        for row in conn.execute(
            "SELECT field_name, field_value FROM listing_fields WHERE listing_id = ? ORDER BY field_name",
            (listing_id,),
        )
    }


def parse_jsonish(value: Any) -> Any:
    if value in (None, ""):
        return None
    if isinstance(value, (dict, list, int, float, bool)):
        return value
    text = str(value)
    try:
        return json.loads(text)
    except Exception:
        pass
    try:
        return ast.literal_eval(text)
    except Exception:
        return text


def clean(value: Any) -> str | None:
    if value in (None, "", [], {}):
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def normalize_term(value: Any) -> str:
    text = clean(value) or ""
    text = text.lower()
    text = text.replace("+", " plus ").replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_name(value: Any) -> str:
    return normalize_term(value)


def normalize_country_key(value: Any) -> str:
    return normalize_term(value).upper()


def slugify(value: Any) -> str:
    norm = normalize_term(value)
    return re.sub(r"[^a-z0-9]+", "-", norm).strip("-") or "unknown"


def base_url_from(url: str | None) -> str | None:
    if not url:
        return None
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else None


def provider_domain(url: str | None, source_slug: str | None = None) -> str | None:
    value = clean(url)
    if not value:
        return None
    parsed = urlparse(value if re.match(r"^https?://", value, re.I) else f"https://{value}")
    domain = (parsed.netloc or "").lower().split("@")[-1].split(":")[0]
    if domain.startswith("www."):
        domain = domain[4:]
    if not domain:
        return None
    if domain in SOURCE_OWNED_DOMAINS or any(domain.endswith("." + blocked) for blocked in SOURCE_OWNED_DOMAINS):
        return None
    return domain


def parse_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(match.group(0)) if match else None


def parse_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    if isinstance(value, int):
        return value
    match = re.search(r"\d+", str(value).replace(",", ""))
    return int(match.group(0)) if match else None


def extract_terms(value: Any) -> list[str]:
    value = parse_jsonish(value)
    terms: list[str] = []
    if value in (None, ""):
        return terms
    if isinstance(value, str):
        text = clean(value)
        if not text:
            return terms
        if text.startswith("[") or text.startswith("{"):
            return extract_terms(parse_jsonish(text))
        return [text]
    if isinstance(value, list):
        for item in value:
            terms.extend(extract_terms(item))
        return dedupe_list(terms)
    if isinstance(value, dict):
        if value.get("name"):
            terms.append(clean(value.get("name")) or "")
        elif value.get("serviceType"):
            terms.append(clean(value.get("serviceType")) or "")
        else:
            for key in ("tags", "offerings", "advancedTreatments", "foundationalTreatments", "techSpecs", "specialties", "treatments"):
                if key in value:
                    terms.extend(extract_terms(value[key]))
        return dedupe_list([term for term in terms if term])
    return [clean(value)] if clean(value) else []


def dedupe_list(values: list[Any]) -> list[str]:
    seen = set()
    out = []
    for value in values:
        text = clean(value)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
    return out


def dedupe_pairs(values: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen = set()
    out = []
    for facet, value in values:
        value = clean(value)
        if not value:
            continue
        key = (facet, value.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append((facet, value))
    return out


def tags_for_source_value(value: Any) -> list[tuple[str, str]]:
    tags: list[tuple[str, str]] = []
    for raw in extract_terms(value):
        facet, tag_value = guess_tag(raw)
        if facet and tag_value:
            tags.append((facet, tag_value))
    return tags


def guess_tag(raw: str | None) -> tuple[str | None, str | None]:
    text = normalize_term(raw)
    display = clean(raw)
    if not text:
        return None, None
    if "telehealth" in text or "virtual clinic" in text or "remote" in text:
        return "care_model", "telehealth"
    if "multi location" in text or "multiple locations" in text:
        return "care_model", "multi-location"
    if "concierge" in text or "membership" in text or "direct primary care" in text:
        return "care_model", "concierge or membership"
    if "executive health" in text or "executive physical" in text:
        return "care_model", "executive health program"
    if "retreat" in text:
        return "care_model", "wellness retreat"
    if "destination" in text or "medical tourism" in text or "spa resort" in text:
        return "care_model", "destination or medical tourism"
    if "med spa" in text or "wellness spa" in text:
        return "care_model", "med spa"
    if "lab" in text or "diagnostic" in text:
        return "entity_type", "lab"
    if "recovery hub" in text or "recovery" == text:
        return "entity_type", "recovery hub"
    if "hospital" in text:
        return "entity_type", "hospital"
    if "doctor" in text or "physician" in text:
        return "entity_type", "doctor"
    if "clinic" in text:
        return "entity_type", "clinic"
    if "verified" in text or "vetted" in text:
        return "trust", display.lower() if display else "verified"
    if re.fullmatch(r"\${1,5}", display or ""):
        return "price_tier", display
    return "source_tag", display


def price_tags(price_text: Any) -> list[tuple[str, str]]:
    text = clean(price_text)
    if not text:
        return []
    if re.fullmatch(r"\${1,5}", text):
        return [("price_tier", text)]
    currency = re.match(r"([A-Z]{3}|[$€£])", text)
    return [("price_tier", currency.group(1))] if currency else []


def scan_known_treatments(text: str | None) -> list[str]:
    if not text:
        return []
    candidates = [
        "Anti-Aging",
        "Cryotherapy",
        "IV Therapy",
        "Cold Plunge",
        "Sauna",
        "Stem Cell Therapy",
        "Exosome Therapy",
        "PRP Therapy",
        "Peptide Therapy",
        "Hormone Therapy",
        "Functional Medicine",
        "Genetic Testing",
        "Biological age",
        "Full Body MRI",
        "NAD+ Therapy",
        "Red Light Therapy",
        "Hyperbaric Oxygen",
        "Microcurrent Therapy",
        "Shockwave Therapy",
        "PEMF Therapy",
    ]
    lower = text.lower()
    return [candidate for candidate in candidates if candidate.lower() in lower]


def spannr_tags(text: str | None) -> list[tuple[str, str]]:
    tags = [("entity_type", "clinic")]
    lowered = (text or "").lower()
    if "telehealth" in lowered:
        tags.append(("care_model", "telehealth"))
    if "multiple locations" in lowered:
        tags.append(("care_model", "multi-location"))
    if "retreat" in lowered:
        tags.append(("entity_type", "retreat"))
    return tags


def parse_specialization(value: str | None) -> tuple[str | None, int | None]:
    text = clean(value)
    if not text:
        return None, None
    match = re.search(r"(.+?)\s+(\d+)\s+years?\s+of\s+experience", text, re.I)
    if match:
        return clean(match.group(1)), int(match.group(2))
    return text, None


def parse_city_region(value: str | None) -> tuple[str | None, str | None]:
    text = clean(value)
    if not text or "," not in text:
        return None, None
    city, region = [clean(part) for part in text.split(",", 1)]
    return city, region


def parse_us_city_state(value: str | None) -> tuple[str, str] | None:
    text = clean(value)
    if not text:
        return None
    match = re.search(r"\b([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})\s+\d{5}\b", text)
    return (clean(match.group(1)) or "", match.group(2)) if match else None


def parse_city_state_from_label(value: str | None) -> tuple[str, str] | None:
    text = clean(value)
    if not text:
        return None
    match = re.search(r"\bin\s+([^,]+),\s*([A-Z]{2})\b", text)
    return (clean(match.group(1)) or "", match.group(2)) if match else parse_us_city_state(text)


def parse_workplace_country_city(value: str | None) -> tuple[str | None, str | None]:
    text = clean(value)
    if not text:
        return None, None
    parts = [clean(part) for part in text.split(",", 2)]
    if len(parts) >= 2:
        return parts[0], parts[1]
    return None, None


def first_mapping(value: Any) -> dict[str, Any]:
    value = parse_jsonish(value)
    if isinstance(value, dict):
        return value
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                return item
    return {}


def format_address(address: dict[str, Any]) -> str | None:
    parts = [
        address.get("streetAddress"),
        address.get("addressLocality"),
        address.get("addressRegion"),
        address.get("postalCode"),
        address.get("addressCountry"),
    ]
    return clean(", ".join(str(part) for part in parts if clean(part)))


def country_from_json(value: Any) -> str | None:
    value = parse_jsonish(value)
    if isinstance(value, dict):
        address = value.get("address")
        if isinstance(address, dict) and address.get("addressCountry"):
            return clean(address.get("addressCountry"))
        if isinstance(address, list):
            for item in address:
                if isinstance(item, dict) and item.get("addressCountry"):
                    return clean(item.get("addressCountry"))
        for child in value.values():
            found = country_from_json(child)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = country_from_json(item)
            if found:
                return found
    return None


def country_from_text(text: str | None) -> str | None:
    text = clean(text)
    if not text:
        return None
    for country in sorted(country_name_map().values(), key=len, reverse=True):
        if country and re.search(rf"\b{re.escape(country)}\b", text, re.I):
            return country
    if re.search(r"\bUSA\b|\bUnited States\b", text, re.I):
        return "United States"
    return None


def country_name_map() -> dict[str, str]:
    return {
        "US": "United States",
        "GB": "United Kingdom",
        "TH": "Thailand",
        "TR": "Turkey",
        "MX": "Mexico",
        "DE": "Germany",
        "CZ": "Czech Republic",
        "PL": "Poland",
        "UA": "Ukraine",
        "CH": "Switzerland",
        "AT": "Austria",
        "ES": "Spain",
        "IT": "Italy",
        "JP": "Japan",
        "AE": "United Arab Emirates",
        "SG": "Singapore",
        "AU": "Australia",
        "AZ": "Azerbaijan",
        "BY": "Belarus",
        "BR": "Brazil",
        "CA": "Canada",
        "CN": "China",
        "CO": "Colombia",
        "CR": "Costa Rica",
        "DO": "Dominican Republic",
        "EG": "Egypt",
        "FR": "France",
        "GR": "Greece",
        "HU": "Hungary",
        "IN": "India",
        "IL": "Israel",
        "LA": "Laos",
        "LV": "Latvia",
        "MY": "Malaysia",
        "PA": "Panama",
        "KR": "South Korea",
    }


def countries_compatible(left: str | None, right: str | None) -> bool:
    return not left or not right or left == right


EXAMPLE_QUERIES = """
-- treatment + country
-- SELECT l.*
-- FROM offerings o
-- JOIN treatments t ON t.id = o.treatment_id
-- JOIN locations l ON l.id = o.location_id
-- WHERE t.canonical_name = 'Stem cell therapy' AND l.country_code = 'MX';

-- entity-type directory
-- SELECT l.*
-- FROM locations l
-- JOIN entity_tags et ON et.entity_type = 'location' AND et.entity_id = l.id
-- JOIN tags t ON t.id = et.tag_id
-- WHERE t.facet = 'entity_type' AND t.value = 'clinic';

-- doctor by specialty + city
-- SELECT p.*
-- FROM practitioners p
-- JOIN search_index si ON si.entity_type = 'practitioner' AND si.entity_id = p.id
-- WHERE p.primary_specialty LIKE '%Functional Medicine%' AND si.locality = 'San Diego';

-- free text via FTS, narrowed by facet
-- SELECT si.entity_type, si.entity_id, si.name
-- FROM search_index si
-- JOIN entity_tags et ON et.entity_type = si.entity_type AND et.entity_id = si.entity_id
-- JOIN tags t ON t.id = et.tag_id
-- WHERE search_index MATCH 'stem cell mexico' AND t.facet = 'entity_type' AND t.value = 'clinic';
"""


def main() -> int:
    builder = CanonicalBuilder()
    builder.build()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
