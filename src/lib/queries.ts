import { row, rows } from "@/lib/db";
import placeholderImagePaths from "@/lib/placeholder-image-paths.json";

export const PAGE_SIZE = 25;

// Some scraped sources reuse one generic banner image across every entity they cover
// (identical file bytes under different filenames). These aren't real per-listing
// photos, so we exclude them from `image` fields instead of showing the same stock
// graphic on hundreds of unrelated cards.
const placeholderImagePathSet = new Set<string>(placeholderImagePaths as string[]);

export type SearchKind = "locations" | "practitioners";

// No UX-facing cap on how many treatments a user can combine — this only guards
// against a pathological number of ids showing up in a crafted query string.
export const MAX_TREATMENT_FILTERS = 25;

export type DirectoryParams = {
  kind?: SearchKind;
  q?: string;
  country?: string;
  locality?: string;
  treatment_ids?: number[];
  entity_type?: string;
  care_model?: string;
};

export type Stats = {
  sources: number;
  organizations: number;
  locations: number;
  practitioners: number;
  offerings: number;
  treatments: number;
  source_records: number;
  documents: number;
  offerings_priced: number;
};

export type LandingCityTreatment = {
  id: number;
  name: string;
  location_count: number;
};

export type LandingCitySearch = {
  locality: string;
  country_code: string;
  country_name: string;
  region_code: string | null;
  location_count: number;
  treatment_count: number;
  treatments: LandingCityTreatment[];
};

type AnyRow = Record<string, unknown>;

function ftsMatch(query?: string | null) {
  const tokens = (query || "").toLowerCase().match(/[a-z0-9]+/g);
  return tokens?.join(" ") || null;
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(",");
}

export function getStats(): Stats {
  const count = (table: keyof Omit<Stats, "offerings_priced">) =>
    row<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count || 0;
  const priced = row<{ count: number }>("SELECT COUNT(*) AS count FROM offerings WHERE price_amount IS NOT NULL")?.count || 0;
  return {
    sources: count("sources"),
    organizations: count("organizations"),
    locations: count("locations"),
    practitioners: count("practitioners"),
    offerings: count("offerings"),
    treatments: count("treatments"),
    source_records: count("source_records"),
    documents: count("documents"),
    offerings_priced: priced,
  };
}

export function getLandingCityTreatmentSearches(cityLimit = 18, treatmentLimit = 6): LandingCitySearch[] {
  const cityTreatmentRows = rows<{
    locality: string;
    country_code: string;
    country_name: string;
    region_code: string | null;
    location_count: number;
    treatment_count: number;
    treatment_id: number;
    treatment_name: string;
    treatment_location_count: number;
  }>(
    `
    WITH city_counts AS (
      SELECT
        l.country_code,
        COALESCE(MAX(l.country_name), l.country_code) AS country_name,
        l.locality,
        MAX(
          CASE
            WHEN l.country_code = 'US'
              AND LENGTH(TRIM(l.region)) = 2
              AND TRIM(l.region) GLOB '[A-Z][A-Z]'
            THEN TRIM(l.region)
          END
        ) AS region_code,
        COUNT(DISTINCT l.id) AS location_count,
        COUNT(DISTINCT o.treatment_id) AS treatment_count,
        COUNT(DISTINCT o.treatment_id) * 10 + MIN(COUNT(DISTINCT l.id), 80) AS score
      FROM locations l
      JOIN offerings o ON o.location_id = l.id AND o.treatment_id IS NOT NULL
      WHERE l.country_code IS NOT NULL
        AND TRIM(l.country_code) <> ''
        AND l.locality IS NOT NULL
        AND TRIM(l.locality) <> ''
        AND LENGTH(TRIM(l.locality)) BETWEEN 3 AND 40
        AND l.locality NOT IN ('USA', 'Virtual', 'Various Virtual', 'Switzerland')
        AND l.locality NOT GLOB '*[0-9]*'
        AND l.locality NOT LIKE '%,%'
        AND l.locality NOT LIKE '%Road%'
        AND l.locality NOT LIKE '%Street%'
        AND l.locality NOT LIKE '%Avenue%'
        AND l.locality NOT LIKE '%Blvd%'
        AND l.locality NOT LIKE '%Caddesi%'
      GROUP BY l.country_code, l.locality
      HAVING treatment_count >= 5 AND location_count >= 4
      ORDER BY score DESC, treatment_count DESC, location_count DESC, l.locality
      LIMIT ?
    ),
    ranked_treatments AS (
      SELECT
        c.locality,
        c.country_code,
        c.country_name,
        c.region_code,
        c.location_count,
        c.treatment_count,
        c.score,
        t.id AS treatment_id,
        t.canonical_name AS treatment_name,
        COUNT(DISTINCT l.id) AS treatment_location_count,
        ROW_NUMBER() OVER (
          PARTITION BY c.country_code, c.locality
          ORDER BY COUNT(DISTINCT l.id) DESC, t.canonical_name
        ) AS treatment_rank
      FROM city_counts c
      JOIN locations l ON l.country_code = c.country_code AND l.locality = c.locality
      JOIN offerings o ON o.location_id = l.id AND o.treatment_id IS NOT NULL
      JOIN treatments t ON t.id = o.treatment_id
      GROUP BY c.country_code, c.locality, t.id
    )
    SELECT
      locality,
      country_code,
      country_name,
      region_code,
      location_count,
      treatment_count,
      treatment_id,
      treatment_name,
      treatment_location_count
    FROM ranked_treatments
    WHERE treatment_rank <= ?
    ORDER BY score DESC, treatment_count DESC, location_count DESC, locality, treatment_rank
  `,
    [cityLimit, treatmentLimit],
  );

  const byCity = new Map<string, LandingCitySearch>();
  for (const row of cityTreatmentRows) {
    const key = `${row.country_code}:${row.locality}`;
    let city = byCity.get(key);
    if (!city) {
      city = {
        locality: row.locality,
        country_code: row.country_code,
        country_name: row.country_name,
        region_code: row.region_code,
        location_count: row.location_count,
        treatment_count: row.treatment_count,
        treatments: [],
      };
      byCity.set(key, city);
    }
    city.treatments.push({
      id: row.treatment_id,
      name: row.treatment_name,
      location_count: row.treatment_location_count,
    });
  }

  return Array.from(byCity.values());
}

export function getFacets() {
  const countries = rows<{ code: string; name: string; n: number }>(`
    SELECT country_code AS code, MAX(country_name) AS name, COUNT(*) AS n
    FROM locations
    WHERE country_code IS NOT NULL AND country_code <> ''
    GROUP BY country_code
    ORDER BY
      CASE WHEN country_code = 'US' THEN 0 ELSE 1 END,
      name COLLATE NOCASE,
      country_code
  `);

  const localities = rows<{ country_code: string; value: string; n: number }>(`
    SELECT country_code, locality AS value, COUNT(*) AS n
    FROM locations
    WHERE country_code IS NOT NULL
      AND country_code <> ''
      AND locality IS NOT NULL
      AND TRIM(locality) <> ''
    GROUP BY country_code, locality
    ORDER BY country_code, locality COLLATE NOCASE
  `);

  const treatments = rows<{ domain: string; domain_id: number; id: number; name: string; n: number }>(`
    SELECT c.name AS domain, c.id AS domain_id, t.id AS id,
           t.canonical_name AS name, COUNT(o.id) AS n
    FROM categories c
    JOIN treatments t ON t.category_id = c.id
    LEFT JOIN offerings o ON o.treatment_id = t.id
    GROUP BY t.id
    ORDER BY c.id, t.canonical_name
  `);

  const byDomain: { domain: string; treatments: { id: number; name: string; n: number }[] }[] = [];
  const seen = new Map<string, { domain: string; treatments: { id: number; name: string; n: number }[] }>();
  for (const treatment of treatments) {
    let domain = seen.get(treatment.domain);
    if (!domain) {
      domain = { domain: treatment.domain, treatments: [] };
      seen.set(treatment.domain, domain);
      byDomain.push(domain);
    }
    domain.treatments.push({ id: treatment.id, name: treatment.name, n: treatment.n });
  }

  const tagFacet = (facet: string, entityType: string) =>
    rows<{ value: string; n: number }>(
      `
      SELECT tg.value AS value, COUNT(DISTINCT et.entity_id) AS n
      FROM tags tg
      JOIN entity_tags et ON et.tag_id = tg.id
      WHERE tg.facet = ? AND et.entity_type = ?
      GROUP BY tg.value
      ORDER BY n DESC
    `,
      [facet, entityType],
    );

  const locationEntityTypes = tagFacet("entity_type", "location");
  const locationCareModels = tagFacet("care_model", "location");
  const practitionerEntityTypes = tagFacet("entity_type", "practitioner");
  const practitionerCareModels = tagFacet("care_model", "practitioner");

  return {
    countries,
    localities,
    treatment_domains: byDomain,
    entity_types: locationEntityTypes,
    care_models: locationCareModels,
    location_entity_types: locationEntityTypes,
    location_care_models: locationCareModels,
    practitioner_entity_types: practitionerEntityTypes,
    practitioner_care_models: practitionerCareModels,
  };
}

function locationWhere(params: DirectoryParams, options: { includeText?: boolean } = {}) {
  const where: string[] = [];
  const values: unknown[] = [];
  const match = ftsMatch(params.q);
  if (options.includeText !== false && match) {
    where.push("l.id IN (SELECT entity_id FROM search_index WHERE search_index MATCH ? AND entity_type = 'location')");
    values.push(match);
  }
  if (params.country) {
    where.push("l.country_code = ?");
    values.push(params.country);
  }
  if (params.locality) {
    where.push("l.locality = ? COLLATE NOCASE");
    values.push(params.locality);
  }
  for (const treatmentId of params.treatment_ids || []) {
    where.push("EXISTS (SELECT 1 FROM offerings o WHERE o.location_id = l.id AND o.treatment_id = ?)");
    values.push(treatmentId);
  }
  for (const [facet, key] of [
    ["entity_type", "entity_type"],
    ["care_model", "care_model"],
  ] as const) {
    const value = params[key];
    if (value) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM entity_tags et
          JOIN tags tg ON tg.id = et.tag_id
          WHERE et.entity_type = 'location'
            AND et.entity_id = l.id
            AND tg.facet = ?
            AND tg.value = ?
        )
      `);
      values.push(facet, value);
    }
  }
  return {
    clause: where.length ? ` WHERE ${where.join(" AND ")}` : "",
    values,
  };
}

export function searchLocations(params: DirectoryParams, page = 0) {
  const match = ftsMatch(params.q);
  const matchJoin = match
    ? `
      JOIN (
        SELECT entity_id, bm25(search_index) AS fts_rank
        FROM search_index
        WHERE search_index MATCH ? AND entity_type = 'location'
      ) search_match ON search_match.entity_id = l.id
    `
    : "";
  const { clause, values } = locationWhere(params, { includeText: !match });
  const queryValues = match ? [match, ...values] : values;
  const orderBy = match
    ? "search_match.fts_rank ASC, (l.rating IS NULL), l.rating DESC, (l.review_count IS NULL), l.review_count DESC, l.name"
    : "(l.review_count IS NULL), l.review_count DESC, l.name";
  const total = row<{ count: number }>(
    `SELECT COUNT(*) AS count FROM locations l${matchJoin}${clause}`,
    queryValues,
  )?.count || 0;
  const results = rows<AnyRow>(
    `
    SELECT l.id, l.name, l.locality, l.region, l.country_code, l.country_name,
           l.website, l.rating, l.review_count, org.canonical_name AS org_name,
           (
             SELECT MIN(o.price_amount)
             FROM offerings o
             WHERE o.location_id = l.id AND o.price_amount IS NOT NULL
           ) AS min_price_amount,
           (
             SELECT o.price_currency
             FROM offerings o
             WHERE o.location_id = l.id AND o.price_amount IS NOT NULL
             ORDER BY o.price_amount ASC
             LIMIT 1
           ) AS min_price_currency
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${matchJoin}
    ${clause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `,
    [...queryValues, PAGE_SIZE, page * PAGE_SIZE],
  );

  const ids = results.map((result) => result.id as number);
  if (ids.length) {
    const marks = placeholders(ids.length);
    const treatments = rows<{ lid: number; name: string; domain: string }>(
      `
      SELECT o.location_id AS lid, t.canonical_name AS name, cat.name AS domain
      FROM offerings o
      JOIN treatments t ON t.id = o.treatment_id
      JOIN categories cat ON cat.id = t.category_id
      WHERE o.location_id IN (${marks})
      GROUP BY o.location_id, t.id
    `,
      ids,
    );
    const tags = rows<{ lid: number; facet: string; value: string }>(
      `
      SELECT et.entity_id AS lid, tg.facet AS facet, tg.value AS value
      FROM entity_tags et
      JOIN tags tg ON tg.id = et.tag_id
      WHERE et.entity_type = 'location'
        AND et.entity_id IN (${marks})
        AND tg.facet IN ('entity_type', 'care_model')
    `,
      ids,
    );
    const treatmentMap = new Map<number, { name: string; domain: string }[]>();
    const tagMap = new Map<number, { facet: string; value: string }[]>();
    for (const treatment of treatments) {
      const list = treatmentMap.get(treatment.lid) || [];
      list.push({ name: treatment.name, domain: treatment.domain });
      treatmentMap.set(treatment.lid, list);
    }
    for (const tag of tags) {
      const list = tagMap.get(tag.lid) || [];
      list.push({ facet: tag.facet, value: tag.value });
      tagMap.set(tag.lid, list);
    }
    const images = rows<{ lid: number; local_path: string }>(
      `
      SELECT entity_id AS lid, local_path
      FROM images
      WHERE entity_type = 'location' AND entity_id IN (${marks})
        AND local_path IS NOT NULL AND local_path != ''
    `,
      ids,
    );
    const imageMap = new Map<number, string>();
    for (const image of images) {
      if (!imageMap.has(image.lid) && !placeholderImagePathSet.has(image.local_path)) {
        imageMap.set(image.lid, image.local_path);
      }
    }
    for (const result of results) {
      const id = result.id as number;
      result.treatments = (treatmentMap.get(id) || []).slice(0, 6);
      result.tags = tagMap.get(id) || [];
      result.image = imageMap.get(id) || null;
    }
  }

  return { results, total, page, page_size: PAGE_SIZE };
}

export function searchPractitioners(params: DirectoryParams, page = 0) {
  const where: string[] = [];
  const values: unknown[] = [];
  const match = ftsMatch(params.q);
  const matchJoin = match
    ? `
      JOIN (
        SELECT entity_id, bm25(search_index) AS fts_rank
        FROM search_index
        WHERE search_index MATCH ? AND entity_type = 'practitioner'
      ) search_match ON search_match.entity_id = p.id
    `
    : "";
  if (params.country) {
    where.push(`
      (
        EXISTS (
          SELECT 1
          FROM affiliations a
          JOIN locations l ON l.id = a.location_id
          WHERE a.practitioner_id = p.id AND l.country_code = ?
        )
        OR EXISTS (
          SELECT 1
          FROM search_index si
          WHERE si.entity_type = 'practitioner'
            AND si.entity_id = p.id
            AND si.country IN (
              SELECT DISTINCT country_name
              FROM locations
              WHERE country_code = ? AND country_name IS NOT NULL AND country_name != ''
            )
        )
      )
    `);
    values.push(params.country, params.country);
  }
  if (params.locality) {
    where.push(`
      EXISTS (
        SELECT 1
        FROM affiliations a
        JOIN locations l ON l.id = a.location_id
        WHERE a.practitioner_id = p.id
          AND l.locality = ? COLLATE NOCASE
      )
    `);
    values.push(params.locality);
  }
  for (const treatmentId of params.treatment_ids || []) {
    where.push(`
      EXISTS (
        SELECT 1
        FROM affiliations a
        JOIN offerings o ON o.location_id = a.location_id
        WHERE a.practitioner_id = p.id AND o.treatment_id = ?
      )
    `);
    values.push(treatmentId);
  }
  for (const [facet, key] of [
    ["entity_type", "entity_type"],
    ["care_model", "care_model"],
  ] as const) {
    const value = params[key];
    if (value) {
      where.push(`
        EXISTS (
          SELECT 1
          FROM entity_tags et
          JOIN tags tg ON tg.id = et.tag_id
          WHERE et.entity_type = 'practitioner'
            AND et.entity_id = p.id
            AND tg.facet = ?
            AND tg.value = ?
        )
      `);
      values.push(facet, value);
    }
  }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const queryValues = match ? [match, ...values] : values;
  const orderBy = match
    ? "search_match.fts_rank ASC, (p.years_experience IS NULL), p.years_experience DESC, p.full_name"
    : "(p.years_experience IS NULL), p.years_experience DESC, p.full_name";
  const total = row<{ count: number }>(
    `SELECT COUNT(*) AS count FROM practitioners p${matchJoin}${clause}`,
    queryValues,
  )?.count || 0;
  const results = rows<AnyRow>(
    `
    SELECT p.id, p.full_name, p.primary_specialty, p.years_experience, p.languages
    FROM practitioners p
    ${matchJoin}
    ${clause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `,
    [...queryValues, PAGE_SIZE, page * PAGE_SIZE],
  );

  const ids = results.map((result) => result.id as number);
  if (ids.length) {
    const marks = placeholders(ids.length);
    const affiliations = rows<{ pid: number; clinic: string | null; locality: string | null; country_code: string | null; country_name: string | null }>(
      `
      SELECT a.practitioner_id AS pid, l.name AS clinic, l.locality AS locality,
             l.country_code AS country_code, l.country_name AS country_name
      FROM affiliations a
      JOIN locations l ON l.id = a.location_id
      WHERE a.practitioner_id IN (${marks})
    `,
      ids,
    );
    const affiliationMap = new Map<number, typeof affiliations>();
    for (const affiliation of affiliations) {
      const list = affiliationMap.get(affiliation.pid) || [];
      list.push(affiliation);
      affiliationMap.set(affiliation.pid, list);
    }
    const images = rows<{ pid: number; local_path: string }>(
      `
      SELECT entity_id AS pid, local_path
      FROM images
      WHERE entity_type = 'practitioner' AND entity_id IN (${marks})
        AND local_path IS NOT NULL AND local_path != ''
    `,
      ids,
    );
    const imageMap = new Map<number, string>();
    for (const image of images) {
      if (!imageMap.has(image.pid) && !placeholderImagePathSet.has(image.local_path)) {
        imageMap.set(image.pid, image.local_path);
      }
    }
    for (const result of results) {
      const id = result.id as number;
      result.affiliations = affiliationMap.get(id) || [];
      result.image = imageMap.get(id) || null;
    }
  }

  return { results, total, page, page_size: PAGE_SIZE };
}

export function getLocationDetail(id: number) {
  const location = row<AnyRow>(
    `
    SELECT l.*, org.canonical_name AS org_name, org.website_domain AS org_domain
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    WHERE l.id = ?
  `,
    [id],
  );
  if (!location) {
    return null;
  }
  location.offerings = rows(
    `
    SELECT o.raw_name, o.price_amount, o.price_currency,
           t.canonical_name AS treatment, cat.name AS domain
    FROM offerings o
    LEFT JOIN treatments t ON t.id = o.treatment_id
    LEFT JOIN categories cat ON cat.id = t.category_id
    WHERE o.location_id = ?
    ORDER BY (cat.name IS NULL), cat.name, t.canonical_name, o.raw_name
  `,
    [id],
  );
  location.tags = rows(
    `
    SELECT tg.facet, tg.value
    FROM entity_tags et
    JOIN tags tg ON tg.id = et.tag_id
    WHERE et.entity_type = 'location' AND et.entity_id = ?
    ORDER BY tg.facet, tg.value
  `,
    [id],
  );
  location.practitioners = rows(
    `
    SELECT p.id, p.full_name, p.primary_specialty, a.role
    FROM affiliations a
    JOIN practitioners p ON p.id = a.practitioner_id
    WHERE a.location_id = ?
  `,
    [id],
  );
  location.reviews = rows(
    `
    SELECT reviewer, rating, review_date, body
    FROM reviews
    WHERE location_id = ?
    LIMIT 10
  `,
    [id],
  );
  location.images = rows(
    `
    SELECT image_url, local_path, alt
    FROM images
    WHERE entity_type = 'location' AND entity_id = ?
    LIMIT 8
  `,
    [id],
  );
  return location;
}

export function getPractitionerDetail(id: number) {
  const practitioner = row<AnyRow>("SELECT * FROM practitioners WHERE id = ?", [id]);
  if (!practitioner) {
    return null;
  }
  practitioner.tags = rows(
    `
    SELECT tg.facet, tg.value
    FROM entity_tags et
    JOIN tags tg ON tg.id = et.tag_id
    WHERE et.entity_type = 'practitioner' AND et.entity_id = ?
    ORDER BY tg.facet, tg.value
  `,
    [id],
  );
  practitioner.affiliations = rows(
    `
    SELECT l.id, l.name AS clinic, l.locality, l.country_code, l.country_name, a.role
    FROM affiliations a
    JOIN locations l ON l.id = a.location_id
    WHERE a.practitioner_id = ?
  `,
    [id],
  );
  practitioner.images = rows(
    `
    SELECT image_url, local_path, alt
    FROM images
    WHERE entity_type = 'practitioner' AND entity_id = ?
    LIMIT 8
  `,
    [id],
  );
  return practitioner;
}

export function parseDirectoryParams(searchParams: URLSearchParams): DirectoryParams {
  const treatmentIds = Array.from(
    new Set(
      (searchParams.get("treatment_id") || "")
        .split(",")
        .map((raw) => Number.parseInt(raw.trim(), 10))
        .filter((id) => Number.isFinite(id)),
    ),
  ).slice(0, MAX_TREATMENT_FILTERS);
  return {
    kind: searchParams.get("kind") === "practitioners" ? "practitioners" : "locations",
    q: searchParams.get("q") || undefined,
    country: searchParams.get("country") || undefined,
    locality: searchParams.get("locality") || undefined,
    treatment_ids: treatmentIds.length ? treatmentIds : undefined,
    entity_type: searchParams.get("entity_type") || undefined,
    care_model: searchParams.get("care_model") || undefined,
  };
}
