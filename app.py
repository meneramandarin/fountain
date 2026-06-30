#!/usr/bin/env python3
"""
Read-only web viewer for the longevity canonical.db.

Standard library only, so it runs in your existing venv with no installs.

    python app.py

Then open the URL it prints (default http://127.0.0.1:8000).
It auto-finds canonical.db in the repo root; override with --db /path/to/canonical.db.
"""

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = None
PAGE_SIZE = 25


# ----------------------------------------------------------------------
# db helpers
# ----------------------------------------------------------------------
def resolve_db(cli):
    candidates = [cli] if cli else []
    candidates += [
        os.path.join(HERE, "canonical.db"),
        os.path.join(HERE, "..", "data", "canonical.db"),
        os.path.join(HERE, "data", "canonical.db"),
        os.path.join(os.getcwd(), "data", "canonical.db"),
        os.path.join(os.getcwd(), "canonical.db"),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return os.path.abspath(c)
    return None


def get_conn():
    c = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    c.row_factory = sqlite3.Row
    return c


def fetch(c, sql, params=()):
    return [dict(r) for r in c.execute(sql, params).fetchall()]


def fts_match(q):
    toks = re.findall(r"[a-z0-9]+", (q or "").lower())
    return " ".join(toks) if toks else None


# ----------------------------------------------------------------------
# queries
# ----------------------------------------------------------------------
def q_stats(c):
    out = {}
    for t in ("organizations", "locations", "practitioners", "offerings",
              "treatments", "source_records"):
        out[t] = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    out["offerings_priced"] = c.execute(
        "SELECT COUNT(*) FROM offerings WHERE price_amount IS NOT NULL").fetchone()[0]
    return out


def q_facets(c):
    countries = fetch(c, """
        SELECT country_code AS code, country_name AS name, COUNT(*) AS n
        FROM locations WHERE country_code IS NOT NULL AND country_code <> ''
        GROUP BY country_code ORDER BY n DESC, name
    """)
    treatments = fetch(c, """
        SELECT c.name AS domain, c.id AS domain_id, t.id AS id,
               t.canonical_name AS name, COUNT(o.id) AS n
        FROM categories c
        JOIN treatments t ON t.category_id = c.id
        LEFT JOIN offerings o ON o.treatment_id = t.id
        GROUP BY t.id ORDER BY c.id, t.canonical_name
    """)
    by_domain = []
    seen = {}
    for r in treatments:
        d = seen.get(r["domain"])
        if d is None:
            d = {"domain": r["domain"], "treatments": []}
            seen[r["domain"]] = d
            by_domain.append(d)
        d["treatments"].append({"id": r["id"], "name": r["name"], "n": r["n"]})

    def tag_facet(facet, entity_type):
        return fetch(c, """
            SELECT tg.value AS value, COUNT(DISTINCT et.entity_id) AS n
            FROM tags tg JOIN entity_tags et ON et.tag_id = tg.id
            WHERE tg.facet = ? AND et.entity_type = ?
            GROUP BY tg.value ORDER BY n DESC
        """, (facet, entity_type))

    location_entity_types = tag_facet("entity_type", "location")
    location_care_models = tag_facet("care_model", "location")
    practitioner_entity_types = tag_facet("entity_type", "practitioner")
    practitioner_care_models = tag_facet("care_model", "practitioner")

    return {
        "countries": countries,
        "treatment_domains": by_domain,
        "entity_types": location_entity_types,
        "care_models": location_care_models,
        "location_entity_types": location_entity_types,
        "location_care_models": location_care_models,
        "practitioner_entity_types": practitioner_entity_types,
        "practitioner_care_models": practitioner_care_models,
    }


def _loc_where(p):
    where, params = [], []
    m = fts_match(p.get("q"))
    if m:
        where.append("l.id IN (SELECT entity_id FROM search_index "
                     "WHERE search_index MATCH ? AND entity_type='location')")
        params.append(m)
    if p.get("country"):
        where.append("l.country_code = ?")
        params.append(p["country"])
    if p.get("treatment_id"):
        where.append("EXISTS (SELECT 1 FROM offerings o "
                     "WHERE o.location_id = l.id AND o.treatment_id = ?)")
        params.append(p["treatment_id"])
    for facet, key in (("entity_type", "entity_type"), ("care_model", "care_model")):
        if p.get(key):
            where.append("EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg "
                         "ON tg.id = et.tag_id WHERE et.entity_type='location' "
                         "AND et.entity_id = l.id AND tg.facet = ? AND tg.value = ?)")
            params += [facet, p[key]]
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    return clause, params


def search_locations(c, p, page):
    where, params = _loc_where(p)
    total = c.execute(f"SELECT COUNT(*) FROM locations l{where}", params).fetchone()[0]
    page_rows = fetch(c, f"""
        SELECT l.id, l.name, l.locality, l.region, l.country_code, l.country_name,
               l.website, l.rating, l.review_count, org.canonical_name AS org_name
        FROM locations l
        LEFT JOIN organizations org ON org.id = l.org_id
        {where}
        ORDER BY (l.review_count IS NULL), l.review_count DESC, l.name
        LIMIT ? OFFSET ?
    """, params + [PAGE_SIZE, page * PAGE_SIZE])

    ids = [r["id"] for r in page_rows]
    if ids:
        marks = ",".join("?" * len(ids))
        treat = fetch(c, f"""
            SELECT o.location_id AS lid, t.canonical_name AS name, cat.name AS domain
            FROM offerings o
            JOIN treatments t ON t.id = o.treatment_id
            JOIN categories cat ON cat.id = t.category_id
            WHERE o.location_id IN ({marks})
            GROUP BY o.location_id, t.id
        """, ids)
        tags = fetch(c, f"""
            SELECT et.entity_id AS lid, tg.facet AS facet, tg.value AS value
            FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id
            WHERE et.entity_type='location' AND et.entity_id IN ({marks})
              AND tg.facet IN ('entity_type','care_model')
        """, ids)
        tmap, gmap = {}, {}
        for r in treat:
            tmap.setdefault(r["lid"], []).append({"name": r["name"], "domain": r["domain"]})
        for r in tags:
            gmap.setdefault(r["lid"], []).append({"facet": r["facet"], "value": r["value"]})
        for r in page_rows:
            r["treatments"] = tmap.get(r["id"], [])[:6]
            r["tags"] = gmap.get(r["id"], [])
    return {"results": page_rows, "total": total, "page": page, "page_size": PAGE_SIZE}


def search_practitioners(c, p, page):
    where, params = [], []
    m = fts_match(p.get("q"))
    if m:
        where.append("p.id IN (SELECT entity_id FROM search_index "
                     "WHERE search_index MATCH ? AND entity_type='practitioner')")
        params.append(m)
    if p.get("country"):
        where.append("""
            (
              EXISTS (
                SELECT 1 FROM affiliations a JOIN locations l ON l.id = a.location_id
                WHERE a.practitioner_id = p.id AND l.country_code = ?
              )
              OR EXISTS (
                SELECT 1 FROM search_index si
                WHERE si.entity_type='practitioner' AND si.entity_id = p.id
                  AND (
                    si.country = ?
                    OR si.country IN (
                      SELECT DISTINCT country_name FROM locations
                      WHERE country_code = ? AND country_name IS NOT NULL AND country_name != ''
                    )
                    OR (? = 'US' AND si.country IN ('USA', 'United States'))
                  )
              )
            )
        """)
        params += [p["country"], p["country"], p["country"], p["country"]]
    for facet, key in (("entity_type", "entity_type"), ("care_model", "care_model")):
        if p.get(key):
            where.append("EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg "
                         "ON tg.id = et.tag_id WHERE et.entity_type='practitioner' "
                         "AND et.entity_id = p.id AND tg.facet = ? AND tg.value = ?)")
            params += [facet, p[key]]
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    total = c.execute(f"SELECT COUNT(*) FROM practitioners p{clause}", params).fetchone()[0]
    page_rows = fetch(c, f"""
        SELECT p.id, p.full_name, p.primary_specialty, p.years_experience, p.languages
        FROM practitioners p{clause}
        ORDER BY (p.years_experience IS NULL), p.years_experience DESC, p.full_name
        LIMIT ? OFFSET ?
    """, params + [PAGE_SIZE, page * PAGE_SIZE])

    ids = [r["id"] for r in page_rows]
    if ids:
        marks = ",".join("?" * len(ids))
        aff = fetch(c, f"""
            SELECT a.practitioner_id AS pid, l.name AS clinic, l.locality AS locality,
                   l.country_code AS country_code
            FROM affiliations a JOIN locations l ON l.id = a.location_id
            WHERE a.practitioner_id IN ({marks})
        """, ids)
        amap = {}
        for r in aff:
            amap.setdefault(r["pid"], []).append(r)
        for r in page_rows:
            r["affiliations"] = amap.get(r["id"], [])
    return {"results": page_rows, "total": total, "page": page, "page_size": PAGE_SIZE}


def detail_location(c, lid):
    base = fetch(c, """
        SELECT l.*, org.canonical_name AS org_name, org.website_domain AS org_domain
        FROM locations l LEFT JOIN organizations org ON org.id = l.org_id
        WHERE l.id = ?
    """, (lid,))
    if not base:
        return None
    loc = base[0]
    loc["offerings"] = fetch(c, """
        SELECT o.raw_name, o.price_amount, o.price_currency,
               t.canonical_name AS treatment, cat.name AS domain
        FROM offerings o
        LEFT JOIN treatments t ON t.id = o.treatment_id
        LEFT JOIN categories cat ON cat.id = t.category_id
        WHERE o.location_id = ? ORDER BY (cat.name IS NULL), cat.name, t.canonical_name
    """, (lid,))
    loc["tags"] = fetch(c, """
        SELECT tg.facet, tg.value FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id
        WHERE et.entity_type='location' AND et.entity_id = ? ORDER BY tg.facet, tg.value
    """, (lid,))
    loc["practitioners"] = fetch(c, """
        SELECT p.id, p.full_name, p.primary_specialty, a.role
        FROM affiliations a JOIN practitioners p ON p.id = a.practitioner_id
        WHERE a.location_id = ?
    """, (lid,))
    loc["reviews"] = fetch(c, """
        SELECT reviewer, rating, review_date, body FROM reviews
        WHERE location_id = ? LIMIT 10
    """, (lid,))
    loc["sources"] = fetch(c, """
        SELECT s.name AS source, sr.source_url FROM source_records sr
        JOIN sources s ON s.id = sr.source_id
        WHERE sr.entity_type='location' AND sr.entity_id = ?
    """, (lid,))
    return loc


def detail_practitioner(c, pid):
    base = fetch(c, "SELECT * FROM practitioners WHERE id = ?", (pid,))
    if not base:
        return None
    pr = base[0]
    pr["tags"] = fetch(c, """
        SELECT tg.facet, tg.value FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id
        WHERE et.entity_type='practitioner' AND et.entity_id = ? ORDER BY tg.facet, tg.value
    """, (pid,))
    pr["affiliations"] = fetch(c, """
        SELECT l.id, l.name AS clinic, l.locality, l.country_code, l.country_name, a.role
        FROM affiliations a JOIN locations l ON l.id = a.location_id
        WHERE a.practitioner_id = ?
    """, (pid,))
    pr["sources"] = fetch(c, """
        SELECT s.name AS source, sr.source_url FROM source_records sr
        JOIN sources s ON s.id = sr.source_id
        WHERE sr.entity_type='practitioner' AND sr.entity_id = ?
    """, (pid,))
    return pr


# ----------------------------------------------------------------------
# http
# ----------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, obj, status=200, ctype="application/json"):
        body = obj if isinstance(obj, bytes) else json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        path = u.path
        qs = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if path in ("/", "/index.html"):
                with open(os.path.join(HERE, "index.html"), "rb") as f:
                    return self._send(f.read(), ctype="text/html; charset=utf-8")
            with get_conn() as c:
                if path == "/api/stats":
                    return self._send(q_stats(c))
                if path == "/api/facets":
                    return self._send(q_facets(c))
                if path == "/api/search":
                    page = max(0, int(qs.get("page", 0)))
                    if qs.get("treatment_id"):
                        qs["treatment_id"] = int(qs["treatment_id"])
                    kind = qs.get("kind", "locations")
                    if kind == "practitioners":
                        return self._send(search_practitioners(c, qs, page))
                    return self._send(search_locations(c, qs, page))
                if path.startswith("/api/location/"):
                    d = detail_location(c, int(path.rsplit("/", 1)[1]))
                    return self._send(d or {"error": "not found"}, 200 if d else 404)
                if path.startswith("/api/practitioner/"):
                    d = detail_practitioner(c, int(path.rsplit("/", 1)[1]))
                    return self._send(d or {"error": "not found"}, 200 if d else 404)
            return self._send({"error": "not found"}, 404)
        except Exception as e:  # surfaced to the browser to make debugging easy
            return self._send({"error": str(e)}, 500)


def main():
    global DB_PATH
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", help="path to canonical.db")
    ap.add_argument("--rebuild", action="store_true", help="rebuild canonical.db before serving")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    if args.rebuild:
        script = os.path.join(HERE, "build_canonical.py")
        print("Rebuilding canonical.db...", flush=True)
        subprocess.run([sys.executable, script], cwd=HERE, check=True)

    DB_PATH = resolve_db(args.db)
    if not DB_PATH:
        print("Could not find canonical.db. Pass --db /path/to/canonical.db")
        raise SystemExit(1)

    with get_conn() as c:
        s = q_stats(c)
    print(f"Serving {DB_PATH}", flush=True)
    print(f"  {s['locations']:,} locations, {s['practitioners']:,} practitioners, "
          f"{s['offerings']:,} offerings", flush=True)
    print(f"Open http://{args.host}:{args.port}  (Ctrl+C to stop)", flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
