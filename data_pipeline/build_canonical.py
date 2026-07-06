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


PIPELINE_ROOT = Path(__file__).resolve().parent
ROOT = PIPELINE_ROOT.parent
DB_DIR = ROOT / "data" / "databases"
CANONICAL_DB = ROOT / "canonical.db"
SCHEMA_PATH = PIPELINE_ROOT / "schema.sql"
TAXONOMY_PATH = PIPELINE_ROOT / "taxonomy_seed.json"
UNMAPPED_CSV = ROOT / "data" / "exports" / "unmapped_terms.csv"
GOOGLE_REVIEW_CACHE_DB = DB_DIR / "google_reviews.sqlite"
BLOB_IMAGE_CACHE_DB = DB_DIR / "blob_images.sqlite"

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
SERVICE_SEARCH_SOURCE_PREFIXES = ("dexa_", "hbot_", "vo2_max_")
KNOWN_JUNK_PRICE_TEXT = {"$15; $99", "Not available"}


def is_menu_enrichment_source(source_slug: str) -> bool:
    return source_slug == "menu_enrichment" or source_slug.startswith("menu_enrichment_")


def is_service_discovery_source(source_slug: str) -> bool:
    return source_slug == "service_discovery" or source_slug.startswith("service_discovery_")


def is_chain_source(source_slug: str) -> bool:
    return source_slug.startswith("chain_")


def is_service_search_source(source_slug: str) -> bool:
    return source_slug.startswith(SERVICE_SEARCH_SOURCE_PREFIXES)


def is_bookimed_doctor_source(source_slug: str) -> bool:
    return source_slug == "bookimed_longevity_doctors" or source_slug.startswith("bookimed_longevity_doctors_")


def is_bookimed_clinic_source(source_slug: str) -> bool:
    return (source_slug == "bookimed_longevity" or source_slug.startswith("bookimed_longevity_")) and not is_bookimed_doctor_source(source_slug)


EXTRA_COUNTRY_ALIASES = {
    "Australia": "AU",
    "AU": "AU",
    "United States of America": "US",
    "U.S.": "US",
    "U.S.A.": "US",
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
    "Ireland": "IE",
    "IE": "IE",
    "Laos": "LA",
    "LA": "LA",
    "Latvia": "LV",
    "LV": "LV",
    "Malaysia": "MY",
    "MY": "MY",
    "Panama": "PA",
    "PA": "PA",
    "Republic of Korea": "KR",
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
        self.target_db = CANONICAL_DB
        self.db_path = CANONICAL_DB.with_name(f".{CANONICAL_DB.name}.build")
        self.conn: sqlite3.Connection | None = None
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
        self.skipped_service_search_rows = 0
        self.deviation_notes: list[str] = []

    def build(self) -> None:
        self.reset_db()
        self.load_taxonomy()
        self.register_sources()
        self.process_sources()
        self.consolidate_duplicate_locations()
        self.import_blob_image_cache()
        self.import_external_review_cache()
        self.populate_search_index()
        self.export_unmapped_terms()
        self.print_report()
        integrity = self.conn.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"canonical build failed integrity_check: {integrity}")
        self.conn.close()
        self.db_path.replace(self.target_db)

    def reset_db(self) -> None:
        if self.conn:
            self.conn.close()
        if self.db_path.exists():
            self.db_path.unlink()
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.conn.commit()

    def import_external_review_cache(self) -> None:
        if not GOOGLE_REVIEW_CACHE_DB.exists():
            return

        self.conn.execute("ATTACH DATABASE ? AS review_cache", (str(GOOGLE_REVIEW_CACHE_DB),))
        try:
            required_tables = {
                row["name"]
                for row in self.conn.execute(
                    """
                    SELECT name
                    FROM review_cache.sqlite_master
                    WHERE type = 'table'
                      AND name IN ('external_place_matches', 'external_reviews', 'external_review_location_keys')
                    """
                )
            }
            if not {"external_place_matches", "external_reviews"}.issubset(required_tables):
                self.deviation_notes.append(f"skipped external review cache with missing tables: {GOOGLE_REVIEW_CACHE_DB}")
                return

            location_map = self.external_review_location_map("external_review_location_keys" in required_tables)
            self.conn.execute("DROP TABLE IF EXISTS temp.review_cache_location_map")
            self.conn.execute(
                """
                CREATE TEMP TABLE review_cache_location_map (
                    cache_location_id INTEGER NOT NULL,
                    current_location_id INTEGER NOT NULL,
                    PRIMARY KEY(cache_location_id)
                )
                """
            )
            self.conn.executemany(
                """
                INSERT INTO temp.review_cache_location_map(cache_location_id, current_location_id)
                VALUES (?, ?)
                """,
                sorted(location_map.items()),
            )
            self.conn.execute(
                """
                INSERT OR REPLACE INTO external_place_matches (
                    location_id, provider, provider_place_id, provider_url, display_name, rating,
                    review_count, match_confidence, match_status, fetched_at, expires_at, raw_json
                )
                SELECT
                    map.current_location_id, cache.provider, cache.provider_place_id, cache.provider_url,
                    cache.display_name, cache.rating, cache.review_count, cache.match_confidence,
                    cache.match_status, cache.fetched_at, cache.expires_at, NULL
                FROM review_cache.external_place_matches cache
                JOIN temp.review_cache_location_map map ON map.cache_location_id = cache.location_id
                """
            )
            self.conn.execute(
                """
                INSERT OR REPLACE INTO external_reviews (
                    location_id, provider, provider_review_id, reviewer, rating, review_date,
                    body, source_url, fetched_at, expires_at, raw_json
                )
                SELECT
                    map.current_location_id, cache.provider, cache.provider_review_id, cache.reviewer,
                    cache.rating, cache.review_date, cache.body, cache.source_url,
                    cache.fetched_at, cache.expires_at, NULL
                FROM review_cache.external_reviews cache
                JOIN temp.review_cache_location_map map ON map.cache_location_id = cache.location_id
                """
            )
            imported_matches = int(
                self.conn.execute("SELECT COUNT(*) FROM external_place_matches").fetchone()[0]
            )
            imported_reviews = int(
                self.conn.execute("SELECT COUNT(*) FROM external_reviews").fetchone()[0]
            )
            self.deviation_notes.append(
                f"imported external review cache: {imported_matches} place matches, {imported_reviews} review rows, {len(location_map)} location mappings"
            )
            self.conn.commit()
        finally:
            self.conn.execute("DETACH DATABASE review_cache")

    def import_blob_image_cache(self) -> None:
        if not BLOB_IMAGE_CACHE_DB.exists():
            return

        self.conn.execute("ATTACH DATABASE ? AS blob_cache", (str(BLOB_IMAGE_CACHE_DB),))
        try:
            has_table = self.conn.execute(
                """
                SELECT 1
                FROM blob_cache.sqlite_master
                WHERE type = 'table'
                  AND name = 'blob_image_mappings'
                """
            ).fetchone()
            if not has_table:
                self.deviation_notes.append(f"skipped blob image cache with missing table: {BLOB_IMAGE_CACHE_DB}")
                return

            self.conn.execute("DROP TABLE IF EXISTS temp.blob_cache_local")
            self.conn.execute(
                """
                CREATE TEMP TABLE blob_cache_local AS
                SELECT
                    source_slug,
                    local_path,
                    MAX(actual_content_sha256) AS content_sha256,
                    MAX(blob_url) AS blob_url
                FROM blob_cache.blob_image_mappings
                WHERE source_slug IS NOT NULL
                  AND source_slug != ''
                  AND local_path IS NOT NULL
                  AND local_path != ''
                  AND actual_content_sha256 IS NOT NULL
                  AND actual_content_sha256 != ''
                  AND blob_url IS NOT NULL
                  AND blob_url != ''
                  AND status = 'verified_local_blob'
                GROUP BY source_slug, local_path
                HAVING COUNT(DISTINCT blob_url) = 1
                   AND COUNT(DISTINCT actual_content_sha256) = 1
                """
            )
            self.conn.execute("CREATE INDEX temp.idx_blob_cache_local ON blob_cache_local(source_slug, local_path)")

            local_before = self.conn.total_changes
            self.conn.execute(
                """
                UPDATE images
                SET
                    content_sha256 = (
                        SELECT cache.content_sha256
                        FROM temp.blob_cache_local cache
                        JOIN sources source ON source.slug = cache.source_slug
                        WHERE source.id = images.source_id
                          AND cache.local_path = images.local_path
                    ),
                    blob_url = (
                        SELECT cache.blob_url
                        FROM temp.blob_cache_local cache
                        JOIN sources source ON source.slug = cache.source_slug
                        WHERE source.id = images.source_id
                          AND cache.local_path = images.local_path
                    )
                WHERE local_path IS NOT NULL
                  AND local_path != ''
                  AND EXISTS (
                      SELECT 1
                      FROM temp.blob_cache_local cache
                      JOIN sources source ON source.slug = cache.source_slug
                      WHERE source.id = images.source_id
                        AND cache.local_path = images.local_path
                  )
                """
            )
            local_imported = self.conn.total_changes - local_before

            self.conn.execute("DROP TABLE IF EXISTS temp.blob_cache_remote")
            self.conn.execute(
                """
                CREATE TEMP TABLE blob_cache_remote AS
                SELECT
                    source_slug,
                    image_url,
                    MAX(db_content_sha256) AS content_sha256,
                    MAX(blob_url) AS blob_url
                FROM blob_cache.blob_image_mappings
                WHERE source_slug IS NOT NULL
                  AND source_slug != ''
                  AND image_url IS NOT NULL
                  AND image_url != ''
                  AND (local_path IS NULL OR local_path = '')
                  AND db_content_sha256 IS NOT NULL
                  AND db_content_sha256 != ''
                  AND blob_url IS NOT NULL
                  AND blob_url != ''
                  AND status = 'remote_blob_unverified'
                GROUP BY source_slug, image_url
                HAVING COUNT(DISTINCT blob_url) = 1
                   AND COUNT(DISTINCT db_content_sha256) = 1
                """
            )
            self.conn.execute("CREATE INDEX temp.idx_blob_cache_remote ON blob_cache_remote(source_slug, image_url)")

            remote_before = self.conn.total_changes
            self.conn.execute(
                """
                UPDATE images
                SET
                    content_sha256 = (
                        SELECT cache.content_sha256
                        FROM temp.blob_cache_remote cache
                        JOIN sources source ON source.slug = cache.source_slug
                        WHERE source.id = images.source_id
                          AND cache.image_url = images.image_url
                    ),
                    blob_url = (
                        SELECT cache.blob_url
                        FROM temp.blob_cache_remote cache
                        JOIN sources source ON source.slug = cache.source_slug
                        WHERE source.id = images.source_id
                          AND cache.image_url = images.image_url
                    )
                WHERE (local_path IS NULL OR local_path = '')
                  AND image_url IS NOT NULL
                  AND image_url != ''
                  AND EXISTS (
                      SELECT 1
                      FROM temp.blob_cache_remote cache
                      JOIN sources source ON source.slug = cache.source_slug
                      WHERE source.id = images.source_id
                        AND cache.image_url = images.image_url
                  )
                """
            )
            remote_imported = self.conn.total_changes - remote_before
            self.deviation_notes.append(
                f"imported blob image cache: {local_imported} local rows, {remote_imported} remote rows"
            )
            self.conn.commit()
        finally:
            self.conn.execute("DETACH DATABASE blob_cache")

    def external_review_location_map(self, has_location_keys: bool) -> dict[int, int]:
        current_locations = [
            dict(row)
            for row in self.conn.execute(
                """
                SELECT l.id, l.name, org.canonical_name AS org_name, l.address, l.locality,
                       l.region, l.country_code, l.website
                FROM locations l
                LEFT JOIN organizations org ON org.id = l.org_id
                """
            )
        ]
        current_by_id = {int(row["id"]): row for row in current_locations}
        if not has_location_keys:
            return {
                int(row["location_id"]): int(row["location_id"])
                for row in self.conn.execute("SELECT DISTINCT location_id FROM review_cache.external_place_matches")
                if int(row["location_id"]) in current_by_id
            }

        by_domain: dict[str, list[dict[str, Any]]] = defaultdict(list)
        by_address: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
        by_name_place: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in current_locations:
            domain = external_review_match_domain(row.get("website"))
            if domain:
                by_domain[domain].append(row)
            address_key = normalize_term(row.get("address"))
            locality_key = normalize_term(row.get("locality"))
            country_key = clean(row.get("country_code")) or ""
            if address_key:
                by_address[(address_key, locality_key, country_key)].append(row)
            name_key = normalize_term(row.get("name") or row.get("org_name"))
            if name_key:
                by_name_place[(name_key, locality_key, country_key)].append(row)

        mapping: dict[int, int] = {}
        used_current_ids: set[int] = set()
        cache_rows = [dict(row) for row in self.conn.execute("SELECT * FROM review_cache.external_review_location_keys")]
        for cache in cache_rows:
            candidates: dict[int, dict[str, Any]] = {}
            old_id = int(cache["location_id"])
            if old_id in current_by_id:
                candidates[old_id] = current_by_id[old_id]
            domain = external_review_match_domain(cache.get("website"))
            if domain:
                for row in by_domain.get(domain, []):
                    candidates[int(row["id"])] = row
            address_key = normalize_term(cache.get("address"))
            locality_key = normalize_term(cache.get("locality"))
            country_key = clean(cache.get("country_code")) or ""
            if address_key:
                for row in by_address.get((address_key, locality_key, country_key), []):
                    candidates[int(row["id"])] = row
            name_key = normalize_term(cache.get("name") or cache.get("org_name"))
            if name_key:
                for row in by_name_place.get((name_key, locality_key, country_key), []):
                    candidates[int(row["id"])] = row

            best: tuple[float, int] | None = None
            for current_id, candidate in candidates.items():
                score = external_review_location_score(cache, candidate)
                if score < 5:
                    continue
                ranked = (score, -abs(old_id - current_id))
                if best is None or ranked > (best[0], -abs(old_id - best[1])):
                    best = (score, current_id)
            if best and best[1] not in used_current_ids:
                mapping[old_id] = best[1]
                used_current_ids.add(best[1])
        return mapping

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
        for db_path in source_database_paths():
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
        for db_path in source_database_paths():
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
                elif is_service_search_source(slug):
                    self.process_service_search_location(slug, row, fields, staging)
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
        if is_menu_enrichment_source(slug) or is_service_discovery_source(slug) or is_chain_source(slug):
            self.update_location_from_menu_enrichment(location_id, mapped)
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

    def process_service_search_location(self, slug: str, row: sqlite3.Row, fields: dict[str, Any], staging: sqlite3.Connection) -> None:
        if not self.is_real_provider_row(row, fields):
            self.skipped_service_search_rows += 1
            return
        self.process_location(slug, row, fields, staging)

    def is_real_provider_row(self, row: sqlite3.Row, fields: dict[str, Any]) -> bool:
        # The scraper's own page_type/confidence_score labels don't cleanly separate real
        # provider pages from directory/roundup pages (verified empirically), but a usable
        # address or geocode reliably does, since directory pages rarely resolve to one.
        if clean(row["address"]) or (parse_float(row["latitude"]) is not None and parse_float(row["longitude"]) is not None):
            return True
        if fields.get("is_directory_or_aggregator"):
            return False
        return False

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
        elif slug == "world_longevity_clinics":
            offer_terms.extend(extract_terms(row["services_json"]))
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
                country_name, country_code = "United States", "US"
        elif slug == "spannr":
            raw = " ".join(clean(part) or "" for part in [row["raw_text"], fields.get("card_text")])
            offer_terms.extend(scan_known_treatments(raw))
            tags.extend(spannr_tags(raw))
            parsed = parse_us_city_state(address or raw)
            if parsed:
                locality, region = parsed
                country_name, country_code = "United States", "US"
        elif slug == "immortality_clinic":
            raw = " ".join(clean(part) or "" for part in [row["raw_text"], fields.get("card_text")])
            offer_terms.extend(scan_known_treatments(raw))
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
                country_name = self.canonical_country_name(country_code, country_name)
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
        elif is_service_search_source(slug):
            procedures = parse_jsonish(row["procedures_json"]) or {}
            service_label = clean(procedures.get("primary")) or clean(fields.get("service_label"))
            if service_label:
                offer_terms.append(service_label)
            confidence = fields.get("confidence_score")
            if confidence is not None:
                tags.append(("trust", f"discovery confidence {confidence}"))
        elif is_menu_enrichment_source(slug) or is_service_discovery_source(slug) or is_chain_source(slug):
            services = parse_jsonish(row["services_json"]) or {}
            items = services.get("menu_items", []) if isinstance(services, dict) else []
            for item in items if isinstance(items, list) else []:
                if not isinstance(item, dict):
                    continue
                offers.append(
                    {
                        "raw_name": item.get("raw_name") or compose_menu_raw_name(item),
                        "price_amount": parse_float(item.get("price_amount")),
                        "price_currency": clean(item.get("price_currency")),
                        "source_offer_url": clean(item.get("source_url")),
                    }
                )
            categories = services.get("categories_offered", []) if isinstance(services, dict) else []
            for category in categories if isinstance(categories, list) else []:
                if clean(category):
                    tags.append(("service_category", clean(category)))
            trust_label = "menu enriched from clinic site"
            if is_service_discovery_source(slug):
                trust_label = "discovered from provider site"
            elif is_chain_source(slug):
                trust_label = "chain location scrape"
            tags.append(("trust", trust_label))
        else:
            offer_terms.extend(extract_terms(row["services_json"]))
            offer_terms.extend(extract_terms(row["procedures_json"]))

        if fields.get("record_type"):
            tags.append(("source_record_type", clean(fields.get("record_type")) or "unknown"))
        tags.extend(price_tags(row["price_text"]))
        return {
            "org_name": org_name,
            "org_website": org_website,
            "name": clean(row["name"]),
            "description": clean(row["description"]),
            "address": address,
            "locality": canonical_place_name(locality),
            "region": region,
            "postal_code": clean(row["postal_code"]),
            "country_name": self.canonical_country_name(country_code, country_name),
            "country_code": country_code,
            "latitude": parse_float(row["latitude"]),
            "longitude": parse_float(row["longitude"]),
            "phone": clean(row["phone"]),
            "email": clean(row["email"]),
            "website": clean(row["website"]),
            "price_text": valid_price_text(row["price_text"]),
            "rating": parse_float(row["rating"]),
            "review_count": parse_int(row["review_count"]),
            "tags": dedupe_pairs(tags),
            "offer_terms": dedupe_list(offer_terms),
            "mixed_terms": dedupe_list(mixed_terms),
            "offers": offers,
            "record_type": clean(fields.get("record_type")),
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
                    country_name = self.canonical_country_name(country_code, country_name)
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
            country_name, country_code = "United States", "US"
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
                country_name, country_code = "United States", "US"
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
            "locality": canonical_place_name(locality),
            "region": region,
            "country_name": self.canonical_country_name(country_code, country_name),
            "country_code": country_code,
            "linked_clinic": linked_clinic,
            "practice": practice,
            "tags": dedupe_pairs(tags),
        }

    def country_for(self, row: sqlite3.Row, fields: dict[str, Any]) -> tuple[str | None, str | None]:
        country_name = clean(row["country"])
        country_code = self.normalize_country(country_name)
        if not country_code:
            for candidate in (fields.get("country_code_scope"), fields.get("country_scope")):
                inferred_code = self.normalize_country(candidate)
                if inferred_code:
                    country_name = clean(candidate)
                    country_code = inferred_code
                    break
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
        return self.canonical_country_name(country_code, country_name), country_code

    def normalize_country(self, value: str | None) -> str | None:
        value = clean(value)
        if not value:
            return None
        alias = self.country_aliases.get(normalize_country_key(value))
        if alias:
            return alias
        if re.fullmatch(r"[A-Za-z]{2}", value):
            return value.upper()
        return None

    def canonical_country_name(self, country_code: str | None, fallback: str | None = None) -> str | None:
        if country_code and country_code in self.country_names:
            return self.country_names[country_code]
        fallback = clean(fallback)
        if not fallback:
            return None
        fallback_code = self.normalize_country(fallback)
        if fallback_code and fallback_code in self.country_names:
            return self.country_names[fallback_code]
        return canonical_place_name(fallback)

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
        if address_key and address_key != key_parts[1]:
            key_parts.append(address_key[:80])
        key = "|".join(key_parts)
        if key in self.locations_by_key:
            return self.locations_by_key[key]
        existing_id = self.find_matching_location(org_id, mapped)
        if existing_id:
            self.locations_by_key[key] = existing_id
            return existing_id
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

    def find_matching_location(self, org_id: int, mapped: dict[str, Any]) -> int | None:
        locality_key = slugify(mapped.get("locality") or "")
        region_key = slugify(mapped.get("region") or "")
        address_key = slugify(mapped.get("address") or "")
        name_norm = normalize_name(mapped.get("name") or "")
        candidates: list[tuple[int, dict[str, Any]]] = []
        for location_id, meta in self.locations.items():
            if meta.get("org_id") != org_id:
                continue
            if locality_key and slugify(meta.get("locality") or "") != locality_key:
                continue
            meta_region = slugify(meta.get("region") or "")
            if region_key and meta_region and meta_region != region_key:
                continue
            candidates.append((location_id, meta))
        if not candidates:
            return None
        if address_key:
            for location_id, meta in candidates:
                if addresses_match(mapped.get("address"), meta.get("address")):
                    return location_id
        if name_norm:
            for location_id, meta in candidates:
                meta_address = meta.get("address")
                addresses_conflict = bool(address_key and meta_address and not addresses_match(mapped.get("address"), meta_address))
                if addresses_conflict:
                    continue
                if fuzz.token_set_ratio(name_norm, normalize_name(meta.get("name") or "")) >= 92:
                    return location_id
        return None

    def find_menu_enrichment_location(self, org_id: int, mapped: dict[str, Any]) -> int | None:
        return self.find_matching_location(org_id, mapped)

    def update_location_from_menu_enrichment(self, location_id: int, mapped: dict[str, Any]) -> None:
        self.conn.execute(
            """
            UPDATE locations
            SET address = COALESCE(address, ?),
                phone = COALESCE(phone, ?),
                email = COALESCE(email, ?),
                website = COALESCE(website, ?)
            WHERE id = ?
            """,
            (
                clean(mapped.get("address")),
                clean(mapped.get("phone")),
                clean(mapped.get("email")),
                clean(mapped.get("website")),
                location_id,
            ),
        )

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
                "country": self.canonical_country_name(mapped.get("country_code"), mapped.get("country_name")),
                "specialties": [],
            },
        )
        if not meta.get("locality") and mapped.get("locality"):
            meta["locality"] = mapped["locality"]
        if not meta.get("country") and (mapped.get("country_name") or mapped.get("country_code")):
            meta["country"] = self.canonical_country_name(mapped.get("country_code"), mapped.get("country_name"))
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
            ON CONFLICT(location_id, source_id, raw_name) DO UPDATE SET
                treatment_id = excluded.treatment_id,
                price_amount = COALESCE(excluded.price_amount, offerings.price_amount),
                price_currency = COALESCE(excluded.price_currency, offerings.price_currency),
                source_offer_url = COALESCE(excluded.source_offer_url, offerings.source_offer_url)
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
                INSERT INTO images(entity_type, entity_id, image_url, local_path, blob_url, content_sha256, alt, source_id)
                VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)
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

    def consolidate_duplicate_locations(self) -> None:
        self.consolidate_curated_duplicate_locations()
        self.consolidate_exact_address_duplicates()
        self.consolidate_city_country_duplicates()
        self.conn.commit()

    def consolidate_curated_duplicate_locations(self) -> None:
        chi_ids = self.location_ids_for_source_urls(
            [
                "https://longevity.technology/clinics/longevity-clinics/chi-longevity-four-seasons-hotel",
                "https://longevity.technology/clinics/longevity-clinics/chi-longevity-camden-clinic",
                "https://worldlongevityclinics.com/clinics/chi-longevity",
            ]
        )
        chi_winner = self.location_id_for_source_url(
            "https://longevity.technology/clinics/longevity-clinics/chi-longevity-camden-clinic"
        )
        if chi_winner and len(chi_ids) > 1:
            self.merge_location_rows(chi_winner, [location_id for location_id in chi_ids if location_id != chi_winner])
            org_id = self.organization_id_by_name("Chi Longevity")
            if org_id:
                self.conn.execute(
                    "UPDATE organizations SET website_domain = COALESCE(website_domain, ?) WHERE id = ?",
                    ("chilongevity.com", org_id),
                )
            self.conn.execute(
                """
                UPDATE locations
                SET org_id = COALESCE(?, org_id),
                    name = ?,
                    address = ?,
                    locality = ?,
                    region = NULL,
                    postal_code = NULL,
                    country_code = ?,
                    country_name = ?,
                    website = ?,
                    dedup_key = ?
                WHERE id = ?
                """,
                (
                    org_id,
                    "Chi Longevity",
                    "camden clinic, four seasons hotel, sparkd by chi longevity",
                    "Singapore",
                    "SG",
                    "Singapore",
                    "https://www.chilongevity.com",
                    "chi-longevity|SG|singapore|camden-clinic-four-seasons-hotel-sparkd-by-chi-longevity",
                    chi_winner,
                ),
            )

        clinique_ids = self.location_ids_for_source_urls(
            [
                "https://immortalityclinic.com/clinic/clinique-la-prairie",
                "https://worldlongevityclinics.com/clinics/clinique-la-prairie",
            ]
        )
        clinique_winner = self.location_id_for_source_url("https://immortalityclinic.com/clinic/clinique-la-prairie")
        if clinique_winner and len(clinique_ids) > 1:
            self.merge_location_rows(
                clinique_winner, [location_id for location_id in clinique_ids if location_id != clinique_winner]
            )
            self.conn.execute(
                """
                UPDATE locations
                SET name = ?,
                    address = ?,
                    locality = COALESCE(locality, ?),
                    country_code = ?,
                    country_name = ?,
                    website = ?
                WHERE id = ?
                """,
                (
                    "Clinique La Prairie",
                    "Rue du Lac 142, 1815 Clarens, Switzerland",
                    "Montreux",
                    "CH",
                    "Switzerland",
                    "https://www.cliniquelaprairie.com/",
                    clinique_winner,
                ),
            )

    def consolidate_exact_address_duplicates(self) -> None:
        rows = self.location_rows()
        groups: dict[tuple[str, str], list[sqlite3.Row]] = defaultdict(list)
        for row in rows:
            address_key = normalize_term(row["address"])
            if not address_key or len(address_key) < 8:
                continue
            groups[(address_key, row["country_code"] or "")].append(row)
        for group_rows in groups.values():
            if len(group_rows) < 2:
                continue
            for cluster in self.duplicate_location_clusters(group_rows):
                self.merge_location_cluster(cluster)

    def consolidate_city_country_duplicates(self) -> None:
        rows = self.location_rows()
        groups: dict[tuple[str, str], list[sqlite3.Row]] = defaultdict(list)
        for row in rows:
            name_key = normalize_name(row["name"] or row["org_name"] or "")
            country_key = row["country_code"] or ""
            if not name_key or not country_key:
                continue
            groups[(name_key, country_key)].append(row)

        for group_rows in groups.values():
            if len(group_rows) != 2:
                continue
            first, second = group_rows
            first_generic = is_generic_place_address(first["address"], first["locality"], first["country_name"])
            second_generic = is_generic_place_address(second["address"], second["locality"], second["country_name"])
            if first_generic == second_generic:
                continue
            generic = first if first_generic else second
            precise = second if first_generic else first
            if not has_precise_address(precise["address"]):
                continue
            if not self.locations_identity_match(generic, precise):
                continue
            self.merge_location_rows(int(precise["id"]), [int(generic["id"])])

    def duplicate_location_clusters(self, rows: list[sqlite3.Row]) -> list[list[sqlite3.Row]]:
        parent = {int(row["id"]): int(row["id"]) for row in rows}
        by_id = {int(row["id"]): row for row in rows}

        def find(value: int) -> int:
            while parent[value] != value:
                parent[value] = parent[parent[value]]
                value = parent[value]
            return value

        def union(left: int, right: int) -> None:
            left_root = find(left)
            right_root = find(right)
            if left_root != right_root:
                parent[right_root] = left_root

        for index, left in enumerate(rows):
            for right in rows[index + 1 :]:
                if self.locations_identity_match(left, right):
                    union(int(left["id"]), int(right["id"]))

        clusters: dict[int, list[sqlite3.Row]] = defaultdict(list)
        for location_id, row in by_id.items():
            clusters[find(location_id)].append(row)
        return [cluster for cluster in clusters.values() if len(cluster) > 1]

    def locations_identity_match(self, left: sqlite3.Row, right: sqlite3.Row) -> bool:
        left_domain = left["website_domain"] or provider_domain(left["website"])
        right_domain = right["website_domain"] or provider_domain(right["website"])
        if left_domain and right_domain and left_domain == right_domain:
            return True
        left_org = normalize_name(left["org_name"] or "")
        right_org = normalize_name(right["org_name"] or "")
        if left_org and right_org and fuzz.token_set_ratio(left_org, right_org) >= 94:
            return True
        left_name = normalize_name(left["name"] or "")
        right_name = normalize_name(right["name"] or "")
        return bool(left_name and right_name and fuzz.token_set_ratio(left_name, right_name) >= 94)

    def merge_location_cluster(self, rows: list[sqlite3.Row]) -> None:
        winner = max(rows, key=self.location_merge_score)
        loser_ids = [int(row["id"]) for row in rows if int(row["id"]) != int(winner["id"])]
        self.merge_location_rows(int(winner["id"]), loser_ids)

    def merge_location_rows(self, winner_id: int, loser_ids: list[int]) -> None:
        loser_ids = [location_id for location_id in dedupe_ints(loser_ids) if location_id != winner_id]
        if not loser_ids:
            return
        for loser_id in loser_ids:
            winner = self.location_row(winner_id)
            loser = self.location_row(loser_id)
            if not winner or not loser:
                continue
            merged = self.merged_location_fields(winner, loser)
            self.conn.execute(
                """
                UPDATE locations
                SET name = ?, address = ?, locality = ?, region = ?, postal_code = ?,
                    country_code = ?, country_name = ?, latitude = ?, longitude = ?,
                    phone = ?, email = ?, website = ?, price_text = ?, rating = ?,
                    review_count = ?
                WHERE id = ?
                """,
                (
                    merged["name"],
                    merged["address"],
                    merged["locality"],
                    merged["region"],
                    merged["postal_code"],
                    merged["country_code"],
                    merged["country_name"],
                    merged["latitude"],
                    merged["longitude"],
                    merged["phone"],
                    merged["email"],
                    merged["website"],
                    merged["price_text"],
                    merged["rating"],
                    merged["review_count"],
                    winner_id,
                ),
            )
            self.move_location_children(winner_id, loser_id)
            self.conn.execute("DELETE FROM locations WHERE id = ?", (loser_id,))

    def move_location_children(self, winner_id: int, loser_id: int) -> None:
        self.conn.execute(
            """
            INSERT OR IGNORE INTO entity_tags(entity_type, entity_id, tag_id)
            SELECT entity_type, ?, tag_id
            FROM entity_tags
            WHERE entity_type = 'location' AND entity_id = ?
            """,
            (winner_id, loser_id),
        )
        self.conn.execute("DELETE FROM entity_tags WHERE entity_type = 'location' AND entity_id = ?", (loser_id,))

        self.conn.execute(
            """
            INSERT INTO offerings(location_id, treatment_id, raw_name, price_amount, price_currency, source_offer_url, source_id)
            SELECT ?, treatment_id, raw_name, price_amount, price_currency, source_offer_url, source_id
            FROM offerings
            WHERE location_id = ?
            ON CONFLICT(location_id, source_id, raw_name) DO UPDATE SET
                treatment_id = COALESCE(excluded.treatment_id, offerings.treatment_id),
                price_amount = COALESCE(excluded.price_amount, offerings.price_amount),
                price_currency = COALESCE(excluded.price_currency, offerings.price_currency),
                source_offer_url = COALESCE(excluded.source_offer_url, offerings.source_offer_url)
            """,
            (winner_id, loser_id),
        )
        self.conn.execute("DELETE FROM offerings WHERE location_id = ?", (loser_id,))

        self.conn.execute(
            """
            INSERT OR IGNORE INTO affiliations(practitioner_id, location_id, org_id, role)
            SELECT practitioner_id, ?, org_id, role
            FROM affiliations
            WHERE location_id = ?
            """,
            (winner_id, loser_id),
        )
        self.conn.execute("DELETE FROM affiliations WHERE location_id = ?", (loser_id,))

        self.conn.execute("UPDATE images SET entity_id = ? WHERE entity_type = 'location' AND entity_id = ?", (winner_id, loser_id))
        self.conn.execute("UPDATE reviews SET location_id = ? WHERE location_id = ?", (winner_id, loser_id))
        self.conn.execute(
            "UPDATE source_records SET entity_id = ? WHERE entity_type = 'location' AND entity_id = ?",
            (winner_id, loser_id),
        )
        self.delete_duplicate_location_images(winner_id)

    def delete_duplicate_location_images(self, location_id: int) -> None:
        self.conn.execute(
            """
            DELETE FROM images
            WHERE entity_type = 'location'
              AND entity_id = ?
              AND id NOT IN (
                  SELECT MIN(id)
                  FROM images
                  WHERE entity_type = 'location'
                    AND entity_id = ?
                  GROUP BY
                    COALESCE(content_sha256, ''),
                    COALESCE(blob_url, ''),
                    COALESCE(local_path, ''),
                    COALESCE(image_url, '')
              )
            """,
            (location_id, location_id),
        )

    def merged_location_fields(self, winner: sqlite3.Row, loser: sqlite3.Row) -> dict[str, Any]:
        merged = dict(winner)
        for field in ("name", "address", "locality", "region", "postal_code", "country_code", "country_name", "phone", "email", "price_text"):
            merged[field] = choose_text(merged.get(field), loser[field])
        if is_generic_place_address(merged.get("address"), merged.get("locality"), merged.get("country_name")) and has_precise_address(
            loser["address"]
        ):
            merged["address"] = loser["address"]
        merged["website"] = choose_website(merged.get("website"), loser["website"])
        merged["latitude"] = merged.get("latitude") if merged.get("latitude") is not None else loser["latitude"]
        merged["longitude"] = merged.get("longitude") if merged.get("longitude") is not None else loser["longitude"]
        merged["rating"], merged["review_count"] = choose_rating(
            merged.get("rating"), merged.get("review_count"), loser["rating"], loser["review_count"]
        )
        return merged

    def location_merge_score(self, row: sqlite3.Row) -> tuple[int, int, int]:
        image_count = int(row["image_count"] or 0)
        source_count = int(row["source_record_count"] or 0)
        review_count = int(row["review_count"] or 0)
        score = 0
        if has_precise_address(row["address"]):
            score += 100
        if row["country_code"]:
            score += 20
        if row["locality"]:
            score += 10
        if provider_domain(row["website"]):
            score += 10
        if image_count:
            score += 8
        if row["phone"]:
            score += 5
        if row["email"]:
            score += 5
        score += min(review_count, 100) // 10
        score += min(source_count, 5)
        return score, image_count, int(row["id"])

    def location_rows(self) -> list[sqlite3.Row]:
        return list(
            self.conn.execute(
                """
                SELECT l.*, o.canonical_name AS org_name, o.website_domain,
                       (SELECT COUNT(*) FROM images img WHERE img.entity_type = 'location' AND img.entity_id = l.id) AS image_count,
                       (SELECT COUNT(*) FROM source_records sr WHERE sr.entity_type = 'location' AND sr.entity_id = l.id) AS source_record_count
                FROM locations l
                LEFT JOIN organizations o ON o.id = l.org_id
                ORDER BY l.id
                """
            )
        )

    def location_row(self, location_id: int) -> sqlite3.Row | None:
        return self.conn.execute(
            """
            SELECT l.*, o.canonical_name AS org_name, o.website_domain,
                   (SELECT COUNT(*) FROM images img WHERE img.entity_type = 'location' AND img.entity_id = l.id) AS image_count,
                   (SELECT COUNT(*) FROM source_records sr WHERE sr.entity_type = 'location' AND sr.entity_id = l.id) AS source_record_count
            FROM locations l
            LEFT JOIN organizations o ON o.id = l.org_id
            WHERE l.id = ?
            """,
            (location_id,),
        ).fetchone()

    def location_ids_for_source_urls(self, urls: list[str]) -> list[int]:
        ids = []
        for url in urls:
            location_id = self.location_id_for_source_url(url)
            if location_id:
                ids.append(location_id)
        return dedupe_ints(ids)

    def location_id_for_source_url(self, url: str) -> int | None:
        row = self.conn.execute(
            """
            SELECT entity_id
            FROM source_records
            WHERE entity_type = 'location' AND source_url = ?
            ORDER BY id
            LIMIT 1
            """,
            (url,),
        ).fetchone()
        return int(row["entity_id"]) if row else None

    def organization_id_by_name(self, name: str) -> int | None:
        row = self.conn.execute(
            "SELECT id FROM organizations WHERE name_normalized = ? ORDER BY id LIMIT 1",
            (normalize_name(name),),
        ).fetchone()
        return int(row["id"]) if row else None

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
        offering_histogram = {
            row["bucket"]: int(row["location_count"])
            for row in self.conn.execute(
                """
                SELECT bucket, COUNT(*) AS location_count
                FROM (
                    SELECT l.id,
                           CASE
                               WHEN COUNT(o.id) = 0 THEN '0'
                               WHEN COUNT(o.id) = 1 THEN '1'
                               WHEN COUNT(o.id) BETWEEN 2 AND 4 THEN '2-4'
                               ELSE '5+'
                           END AS bucket
                    FROM locations l
                    LEFT JOIN offerings o ON o.location_id = l.id
                    GROUP BY l.id
                )
                GROUP BY bucket
                """
            )
        }
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
        suspicious_collapses = list(
            self.conn.execute(
                """
                SELECT sr.entity_id AS location_id, s.slug AS source_slug, l.name, l.locality,
                       COUNT(DISTINCT sr.source_url) AS distinct_urls
                FROM source_records sr
                JOIN sources s ON s.id = sr.source_id
                JOIN locations l ON l.id = sr.entity_id
                WHERE sr.entity_type = 'location'
                GROUP BY sr.entity_id, sr.source_id
                HAVING COUNT(DISTINCT sr.source_url) >= 3
                ORDER BY distinct_urls DESC
                """
            )
        )
        duplicate_location_group_count = int(
            self.conn.execute(
                """
                SELECT COUNT(*)
                FROM (
                    SELECT org_id, locality, region, COUNT(*) AS location_count
                    FROM locations
                    WHERE org_id IS NOT NULL
                    GROUP BY org_id, locality, region
                    HAVING COUNT(*) >= 2
                )
                """
            ).fetchone()[0]
        )
        duplicate_exact_address_group_count = int(
            self.conn.execute(
                """
                SELECT COUNT(*)
                FROM (
                    SELECT org_id, locality, region, address, COUNT(*) AS location_count
                    FROM locations
                    WHERE org_id IS NOT NULL AND address IS NOT NULL AND address != ''
                    GROUP BY org_id, locality, region, address
                    HAVING COUNT(*) >= 2
                )
                """
            ).fetchone()[0]
        )
        duplicate_location_group_samples = list(
            self.conn.execute(
                """
                SELECT o.dedup_key AS org_key, o.canonical_name AS org_name,
                       l.locality, l.region, COUNT(*) AS location_count,
                       GROUP_CONCAT(l.id || ':' || COALESCE(l.name, ''), ' | ') AS locations
                FROM locations l
                JOIN organizations o ON o.id = l.org_id
                WHERE l.org_id IS NOT NULL
                GROUP BY l.org_id, l.locality, l.region
                HAVING COUNT(*) >= 2
                ORDER BY location_count DESC, lower(o.canonical_name), lower(l.locality)
                LIMIT 20
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
        print(
            "offerings/location histogram: "
            f"0={offering_histogram.get('0', 0)}, "
            f"1={offering_histogram.get('1', 0)}, "
            f"2-4={offering_histogram.get('2-4', 0)}, "
            f"5+={offering_histogram.get('5+', 0)}"
        )
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
        if self.skipped_service_search_rows:
            print(f"notes: skipped {self.skipped_service_search_rows} service-search listings with no usable address (directory/aggregator pages)")
        print(f"\nduplicate org/locality location groups: {duplicate_location_group_count}")
        print(f"duplicate exact-address location groups: {duplicate_exact_address_group_count}")
        if duplicate_location_group_samples:
            print("  (possible sign of under-collapsed duplicate locations - spot check these)")
            for row in duplicate_location_group_samples:
                print(
                    f"  - {row['org_name']} [{row['org_key']}] "
                    f"({row['locality'] or 'unknown'}, {row['region'] or 'unknown'}): "
                    f"{row['location_count']} locations: {row['locations']}"
                )
        print(f"\nsuspicious location collapses (one location absorbing 3+ distinct URLs from the same source): {len(suspicious_collapses)}")
        if suspicious_collapses:
            print("  (possible sign of a mis-extracted shared/HQ address collapsing distinct branches - spot check these)")
            for row in suspicious_collapses[:20]:
                print(f"  - location {row['location_id']} '{row['name']}' ({row['locality']}) <- {row['source_slug']}: {row['distinct_urls']} distinct URLs")
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
    conn = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro&immutable=1", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def source_database_paths() -> list[Path]:
    auxiliary_dbs = {GOOGLE_REVIEW_CACHE_DB.resolve(), BLOB_IMAGE_CACHE_DB.resolve()}
    return [path for path in sorted(DB_DIR.glob("*.sqlite")) if path.resolve() not in auxiliary_dbs]


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


LOWERCASE_PLACE_WORDS = {
    "al",
    "and",
    "da",
    "das",
    "de",
    "del",
    "do",
    "dos",
    "du",
    "el",
    "la",
    "le",
    "of",
    "the",
    "van",
    "von",
}


def canonical_place_name(value: Any) -> str | None:
    text = clean(value)
    if not text:
        return None
    word_index = 0

    def replace_word(match: re.Match[str]) -> str:
        nonlocal word_index
        word = match.group(0)
        word_index += 1
        lowered = word.lower()
        if word_index > 1 and lowered in LOWERCASE_PLACE_WORDS:
            return lowered
        if word.isupper() and len(word) <= 3:
            return word
        if word[:1].isupper() and word[1:].islower():
            return word
        if any(char.isupper() for char in word[1:]) and not word.isupper():
            return word
        return lowered[:1].upper() + lowered[1:]

    return re.sub(r"[^\W\d_]+", replace_word, text)


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


def addresses_match(left: Any, right: Any) -> bool:
    left_norm = normalize_term(left)
    right_norm = normalize_term(right)
    if not left_norm or not right_norm:
        return False
    if left_norm == right_norm:
        return True
    if min(len(left_norm), len(right_norm)) < 8:
        return False
    return fuzz.token_set_ratio(left_norm, right_norm) >= 92


def external_review_location_score(cache: dict[str, Any], candidate: dict[str, Any]) -> float:
    score = 0.0
    cache_domain = external_review_match_domain(cache.get("website"))
    candidate_domain = external_review_match_domain(candidate.get("website"))
    if cache_domain and candidate_domain and cache_domain == candidate_domain:
        score += 4.0
    if cache.get("address") and candidate.get("address") and addresses_match(cache.get("address"), candidate.get("address")):
        score += 4.0
    cache_locality = normalize_term(cache.get("locality"))
    candidate_locality = normalize_term(candidate.get("locality"))
    if cache_locality and candidate_locality and cache_locality == candidate_locality:
        score += 1.0
    cache_country = clean(cache.get("country_code"))
    candidate_country = clean(candidate.get("country_code"))
    if cache_country and candidate_country and cache_country == candidate_country:
        score += 1.0

    name_score = 0.0
    for cache_name in (cache.get("name"), cache.get("org_name")):
        for candidate_name in (candidate.get("name"), candidate.get("org_name")):
            if clean(cache_name) and clean(candidate_name):
                name_score = max(name_score, fuzz.token_set_ratio(str(cache_name), str(candidate_name)) / 100)
    if name_score >= 0.92:
        score += 3.0
    elif name_score >= 0.8:
        score += 2.0
    elif name_score >= 0.65:
        score += 1.0
    return score


def external_review_match_domain(value: Any) -> str | None:
    text = clean(value)
    if not text:
        return None
    parsed = urlparse(text if re.match(r"^https?://", text, re.I) else f"https://{text}")
    domain = (parsed.netloc or "").lower()
    if domain.startswith("www."):
        domain = domain[4:]
    if domain in {"google.com", "maps.google.com"} and parsed.path.startswith("/maps/"):
        return None
    return provider_domain(text)


def has_precise_address(value: Any) -> bool:
    text = clean(value)
    if not text:
        return False
    norm = normalize_term(text)
    if len(norm) < 8:
        return False
    if re.search(r"\d", text):
        return True
    return "," in text and len(norm.split()) >= 5 and not is_generic_place_address(text, None, None)


def is_generic_place_address(address: Any, locality: Any, country_name: Any) -> bool:
    address_norm = normalize_term(address)
    if not address_norm:
        return False
    locality_norm = normalize_term(locality)
    country_norm = normalize_term(country_name)
    place_parts = [part for part in (locality_norm, country_norm) if part]
    if place_parts and address_norm == normalize_term(" ".join(place_parts)):
        return True
    if locality_norm and address_norm == locality_norm:
        return True
    if country_norm and address_norm == country_norm:
        return True
    if "," in (clean(address) or "") and len(address_norm.split()) <= 4 and not re.search(r"\d", clean(address) or ""):
        return True
    return False


def choose_text(current: Any, candidate: Any) -> str | None:
    current_text = clean(current)
    candidate_text = clean(candidate)
    if not current_text:
        return candidate_text
    if not candidate_text:
        return current_text
    return current_text


def choose_website(current: Any, candidate: Any) -> str | None:
    current_text = clean(current)
    candidate_text = clean(candidate)
    if not current_text:
        return candidate_text
    if not candidate_text:
        return current_text
    current_domain = provider_domain(current_text)
    candidate_domain = provider_domain(candidate_text)
    if candidate_domain and not current_domain:
        return candidate_text
    if candidate_text.startswith("https://") and current_text.startswith("http://"):
        return candidate_text
    return current_text


def choose_rating(
    current_rating: Any,
    current_review_count: Any,
    candidate_rating: Any,
    candidate_review_count: Any,
) -> tuple[float | None, int | None]:
    current_count = parse_int(current_review_count) or 0
    candidate_count = parse_int(candidate_review_count) or 0
    if candidate_count > current_count:
        return parse_float(candidate_rating), parse_int(candidate_review_count)
    if current_rating is None and candidate_rating is not None:
        return parse_float(candidate_rating), parse_int(candidate_review_count)
    return parse_float(current_rating), parse_int(current_review_count)


def dedupe_ints(values: list[int]) -> list[int]:
    seen = set()
    out = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


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


def compose_menu_raw_name(item: dict[str, Any]) -> str | None:
    name = clean(item.get("treatment_name") or item.get("name"))
    if not name:
        return None
    details = []
    for key in ("brand_or_variant", "quantity_or_dose"):
        value = clean(item.get(key))
        if value:
            details.append(value)
    if not details:
        return strip_booking_code(name)
    return f"{strip_booking_code(name)} - {', '.join(strip_booking_code(value) for value in details)}"


def strip_booking_code(value: str) -> str:
    text = clean(value) or ""
    text = re.sub(r"\s+\b(?:bk|sku|id|code)[\s_-]*[a-z0-9]{3,}\b$", "", text, flags=re.I)
    text = re.sub(r"\s+\b[a-z]{1,4}[\s_-]?\d{4,}\b$", "", text, flags=re.I)
    return clean(text) or value


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


NO_PRICE_PHRASES = {"n/a", "na", "unknown", "price on request", "call for pricing", "not available"}


def valid_price_text(price_text: Any) -> str | None:
    text = clean(price_text)
    if not text:
        return None
    if text in KNOWN_JUNK_PRICE_TEXT or text.lower() in NO_PRICE_PHRASES:
        return None
    if re.fullmatch(r"\${1,5}", text):
        return text
    if len(text) > 50:
        # Real price displays are compact ("$119-$499", "from $3,500/day"); anything longer
        # observed in the data is scraper bio/description text accidentally landing in this
        # field (e.g. bioedge_clinics rows ending in a boilerplate "; $15; $99" suffix).
        return None
    amounts = [
        float(m.replace(",", ""))
        for m in re.findall(r"[\d,]+(?:\.\d{1,2})?", text)
        if re.search(r"\d", m) and m.replace(",", "")
    ]
    if not amounts:
        return None
    if len(amounts) > 4:
        return None
    lo, hi = min(amounts), max(amounts)
    if lo > 0 and hi / lo > 100:
        return None
    return text


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
        "IE": "Ireland",
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
