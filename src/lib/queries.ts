import { hasTable, isPostgres, row, rows } from "@/lib/db";

export const PAGE_SIZE = 25;

const invalidRelatedSearchLocalities = new Set([
  "USA",
  "Virtual",
  "Various Virtual",
  "Switzerland",
  "Connecticut",
  "D.C. Metro Area (DMV)",
  "Miami-Ft. Lauderdale",
  "New Jersey",
  "Orange County",
  "St Miami",
  "St N Saint Petersburg",
]);

type ImageCandidate = {
  blob_url: string | null;
};

export type ExternalReviewGroup = {
  provider: string;
  provider_name: string;
  provider_url: string | null;
  rating: number | null;
  review_count: number | null;
  fetched_at: string | null;
  expires_at: string | null;
  reviews: {
    author: string | null;
    rating: number | null;
    review_date: string | null;
    text: string | null;
  }[];
};

function usableImageSource(image: ImageCandidate) {
  return image.blob_url || null;
}

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
  visitor?: VisitorLocationParams;
};

export type VisitorLocationParams = {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
};

export type Stats = {
  sources: number;
  organizations: number;
  locations: number;
  practitioners: number;
  offerings: number;
  treatments: number;
  source_records: number;
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

export type LandingCountrySearch = {
  country_code: string;
  country_name: string;
  location_count: number;
  treatment_count: number;
  treatments: LandingCityTreatment[];
  cities: LandingCitySearch[];
};

export type RelatedTreatmentSearches = {
  scope: "city" | "country";
  locality: string | null;
  region_code: string | null;
  country_code: string;
  country_name: string;
  location_count: number;
  treatments: LandingCityTreatment[];
};

export type LandingFeaturedDirectoryCard = {
  id: number;
  slug: string | null;
  name: string | null;
  org_name: string | null;
  locality: string | null;
  region: string | null;
  country_name: string | null;
  rating: number | null;
  review_count: number | null;
  image: string | null;
  tags: { facet: string; value: string }[];
  treatments: { name: string; domain: string }[];
};

type AnyRow = Record<string, unknown>;

type LandingTreatmentCardOptions = {
  countryCode?: string;
  localities?: string[];
  requireImage?: boolean;
};

function ftsMatch(query?: string | null) {
  const tokens = (query || "").toLowerCase().match(/[a-z0-9]+/g);
  return tokens?.join(" ") || null;
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(",");
}

function noDigitsCondition(expression: string) {
  return isPostgres() ? `${expression} !~ '[0-9]'` : `${expression} NOT GLOB '*[0-9]*'`;
}

function twoUpperLettersCondition(expression: string) {
  return isPostgres() ? `${expression} ~ '^[A-Z][A-Z]$'` : `${expression} GLOB '[A-Z][A-Z]'`;
}

function orderNoCase(expression: string) {
  return isPostgres() ? `lower(${expression})` : `${expression} COLLATE NOCASE`;
}

function equalsNoCase(expression: string) {
  return isPostgres() ? `lower(${expression}) = lower(?)` : `${expression} = ? COLLATE NOCASE`;
}

function capAt(expression: string, cap: number) {
  return isPostgres() ? `LEAST(${expression}, ${cap})` : `MIN(${expression}, ${cap})`;
}

function containsNoCase(expression: string, termExpression: string) {
  return isPostgres()
    ? `${expression} ILIKE '%' || ${termExpression} || '%'`
    : `${expression} LIKE '%' || ${termExpression} || '%'`;
}

function trimLower(expression: string) {
  return `lower(trim(${expression}))`;
}

function activeEntityCondition(alias: string) {
  return isPostgres() ? `${alias}.status = 'active' AND ${alias}.deleted_at IS NULL` : "1=1";
}

function activeOfferingCondition(alias: string) {
  return isPostgres() ? `${alias}.status = 'active' AND ${alias}.deleted_at IS NULL` : "1=1";
}

function activeImageCondition(alias: string) {
  return isPostgres() ? `${alias}.status = 'active' AND ${alias}.deleted_at IS NULL` : "1=1";
}

function activeReviewCondition(alias: string) {
  return isPostgres() ? `${alias}.status = 'active' AND ${alias}.deleted_at IS NULL` : "1=1";
}

function consumerTagFacetCondition(alias: string) {
  return `${alias}.facet IN ('care_model', 'goal', 'price_tier', 'trust')`;
}

function activeTableClause(table: string) {
  return isPostgres() && ["locations", "practitioners", "offerings"].includes(table)
    ? ` WHERE ${table}.status = 'active' AND ${table}.deleted_at IS NULL`
    : "";
}

function googleReviewMatchJoin(alias = "google_reviews") {
  return `
    LEFT JOIN external_place_matches ${alias}
      ON ${alias}.location_id = l.id
     AND ${alias}.provider = 'google'
     AND ${alias}.match_status = 'matched'
  `;
}

function locationSlugSelect(alias: string) {
  return isPostgres() ? `${alias}.slug` : `CAST(${alias}.id AS TEXT)`;
}

function practitionerSlugSelect(alias: string) {
  return isPostgres() ? `${alias}.slug` : `CAST(${alias}.id AS TEXT)`;
}

function entityLookup(alias: string, ref: number | string) {
  const text = String(ref).trim();
  if (isPostgres() && text && !/^\d+$/.test(text)) {
    return { clause: `${alias}.slug = ?`, values: [text] as unknown[] };
  }

  const id = Number.parseInt(text, 10);
  if (Number.isFinite(id)) {
    return { clause: `${alias}.id = ?`, values: [id] as unknown[] };
  }

  return { clause: "1=0", values: [] as unknown[] };
}

function searchIndexMatchCondition(entityType: "location" | "practitioner") {
  return isPostgres()
    ? `search_text @@ websearch_to_tsquery('simple', ?) AND entity_type = '${entityType}'`
    : `search_index MATCH ? AND entity_type = '${entityType}'`;
}

function searchMatchJoin(tableAlias: string, entityType: "location" | "practitioner") {
  if (!isPostgres()) {
    return `
      JOIN (
        SELECT entity_id, bm25(search_index) AS fts_rank
        FROM search_index
        WHERE ${searchIndexMatchCondition(entityType)}
      ) search_match ON search_match.entity_id = ${tableAlias}.id
    `;
  }

  return `
    JOIN (
      SELECT entity_id, -ts_rank_cd(search_text, websearch_to_tsquery('simple', ?)) AS fts_rank
      FROM search_index
      WHERE ${searchIndexMatchCondition(entityType)}
    ) search_match ON search_match.entity_id = ${tableAlias}.id
  `;
}

function searchMatchValues(match: string, values: unknown[]) {
  return isPostgres() ? [match, match, ...values] : [match, ...values];
}

let hasExternalReviewTablesCache: boolean | null = null;

async function hasExternalReviewTables() {
  if (hasExternalReviewTablesCache == null) {
    hasExternalReviewTablesCache = await hasTable("external_place_matches");
  }
  return hasExternalReviewTablesCache;
}

function providerName(provider: string) {
  switch (provider) {
    case "google":
      return "Google";
    case "yelp":
      return "Yelp";
    case "tripadvisor":
      return "Tripadvisor";
    case "trustpilot":
      return "Trustpilot";
    default:
      return provider;
  }
}

async function getExternalReviewGroups(locationId: number): Promise<ExternalReviewGroup[]> {
  if (!(await hasExternalReviewTables())) {
    return [];
  }

  const matches = await rows<{
    provider: string;
    provider_url: string | null;
    rating: number | null;
    review_count: number | null;
    fetched_at: string | null;
    expires_at: string | null;
  }>(
    `
    SELECT provider, provider_url, rating, review_count, fetched_at, expires_at
    FROM external_place_matches
    WHERE location_id = ?
      AND match_status = 'matched'
    ORDER BY
      CASE provider
        WHEN 'google' THEN 1
        WHEN 'yelp' THEN 2
        WHEN 'tripadvisor' THEN 3
        WHEN 'trustpilot' THEN 4
        ELSE 5
      END,
      provider
  `,
    [locationId],
  );
  if (!matches.length) {
    return [];
  }

  const reviewRows = await rows<{
    provider: string;
    author: string | null;
    rating: number | null;
    review_date: string | null;
    text: string | null;
  }>(
    `
    SELECT provider, author, rating, review_date, text
    FROM reviews r
    WHERE location_id = ?
      AND provider <> 'scrape'
      AND ${activeReviewCondition("r")}
    ORDER BY provider, review_date DESC, id DESC
  `,
    [locationId],
  );

  const reviewsByProvider = new Map<string, ExternalReviewGroup["reviews"]>();
  for (const review of reviewRows) {
    const list = reviewsByProvider.get(review.provider) || [];
    list.push({
      author: review.author,
      rating: review.rating,
      review_date: review.review_date,
      text: review.text,
    });
    reviewsByProvider.set(review.provider, list);
  }

  return matches.map((match) => ({
    provider: match.provider,
    provider_name: providerName(match.provider),
    provider_url: match.provider_url,
    rating: match.rating,
    review_count: match.review_count,
    fetched_at: match.fetched_at,
    expires_at: match.expires_at,
    reviews: (reviewsByProvider.get(match.provider) || []).slice(0, 5),
  }));
}

export async function getStats(): Promise<Stats> {
  const count = async (table: keyof Omit<Stats, "offerings_priced">) =>
    (await row<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}${activeTableClause(table)}`))?.count || 0;
  const [
    sources,
    organizations,
    locations,
    practitioners,
    offerings,
    treatments,
    sourceRecords,
    priced,
  ] = await Promise.all([
    count("sources"),
    count("organizations"),
    count("locations"),
    count("practitioners"),
    count("offerings"),
    count("treatments"),
    count("source_records"),
    (async () =>
      (await row<{ count: number }>(
        `SELECT COUNT(*) AS count FROM offerings WHERE price_amount IS NOT NULL AND ${activeOfferingCondition("offerings")}`,
      ))?.count || 0)(),
  ]);
  return {
    sources,
    organizations,
    locations,
    practitioners,
    offerings,
    treatments,
    source_records: sourceRecords,
    offerings_priced: priced,
  };
}

export async function getLandingCityTreatmentSearches(
  cityLimitPerCountry = 10,
  treatmentLimit = 8,
): Promise<LandingCountrySearch[]> {
  const cityTreatmentRows = await rows<{
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
    WITH valid_locations AS (
      SELECT
        l.id,
        l.country_code,
        l.country_name,
        l.locality,
        l.region
      FROM locations l
      WHERE ${activeEntityCondition("l")}
        AND COALESCE(l.is_virtual, false) = false
        AND l.country_code IS NOT NULL
        AND TRIM(l.country_code) <> ''
        AND l.locality IS NOT NULL
        AND TRIM(l.locality) <> ''
        AND LENGTH(TRIM(l.locality)) BETWEEN 3 AND 40
        AND l.locality NOT IN (
          'USA',
          'Virtual',
          'Various Virtual',
          'Switzerland',
          'Connecticut',
          'D.C. Metro Area (DMV)',
          'Miami-Ft. Lauderdale',
          'New Jersey',
          'Orange County',
          'St Miami',
          'St N Saint Petersburg'
        )
        AND ${noDigitsCondition("l.locality")}
        AND l.locality NOT LIKE '%,%'
        AND l.locality NOT LIKE '% Ave%'
        AND l.locality NOT LIKE '%Road%'
        AND l.locality NOT LIKE '%Street%'
        AND l.locality NOT LIKE '%Avenue%'
        AND l.locality NOT LIKE '%Blvd%'
        AND l.locality NOT LIKE '%Bulvarı%'
        AND l.locality NOT LIKE '%Caddesi%'
        AND l.locality NOT LIKE '%Suite%'
        AND l.locality NOT LIKE '%-Ro%'
    ),
    city_counts AS (
      SELECT
        l.country_code,
        COALESCE(MAX(l.country_name), l.country_code) AS country_name,
        l.locality,
        MAX(
          CASE
            WHEN l.country_code = 'US'
              AND LENGTH(TRIM(l.region)) = 2
              AND ${twoUpperLettersCondition("TRIM(l.region)")}
            THEN TRIM(l.region)
          END
        ) AS region_code,
        COUNT(DISTINCT l.id) AS location_count,
        COUNT(DISTINCT o.treatment_id) AS treatment_count,
        COUNT(DISTINCT o.treatment_id) * 10 + ${capAt("COUNT(DISTINCT l.id)", 80)} AS score
      FROM valid_locations l
      JOIN offerings o ON o.location_id = l.id AND o.treatment_id IS NOT NULL AND ${activeOfferingCondition("o")}
      GROUP BY l.country_code, l.locality
    ),
    ranked_cities AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY country_code
          ORDER BY score DESC, treatment_count DESC, location_count DESC, locality
        ) AS city_rank
      FROM city_counts
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
      FROM ranked_cities c
      JOIN valid_locations l ON l.country_code = c.country_code AND l.locality = c.locality
      JOIN offerings o ON o.location_id = l.id AND o.treatment_id IS NOT NULL AND ${activeOfferingCondition("o")}
      JOIN treatments t ON t.id = o.treatment_id
      WHERE c.city_rank <= ?
      GROUP BY
        c.country_code,
        c.locality,
        c.country_name,
        c.region_code,
        c.location_count,
        c.treatment_count,
        c.score,
        t.id,
        t.canonical_name
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
    ORDER BY ${orderNoCase("country_name")}, country_code, score DESC, treatment_count DESC, location_count DESC, locality, treatment_rank
  `,
    [cityLimitPerCountry, treatmentLimit],
  );

  const countryTreatmentRows = await rows<{
    country_code: string;
    country_name: string;
    location_count: number;
    treatment_count: number;
    treatment_id: number;
    treatment_name: string;
    treatment_location_count: number;
  }>(
    `
    WITH valid_locations AS (
      SELECT
        l.id,
        l.country_code,
        l.country_name,
        l.locality
      FROM locations l
      WHERE ${activeEntityCondition("l")}
        AND COALESCE(l.is_virtual, false) = false
        AND l.country_code IS NOT NULL
        AND TRIM(l.country_code) <> ''
        AND l.locality IS NOT NULL
        AND TRIM(l.locality) <> ''
        AND LENGTH(TRIM(l.locality)) BETWEEN 3 AND 40
        AND l.locality NOT IN (
          'USA',
          'Virtual',
          'Various Virtual',
          'Switzerland',
          'Connecticut',
          'D.C. Metro Area (DMV)',
          'Miami-Ft. Lauderdale',
          'New Jersey',
          'Orange County',
          'St Miami',
          'St N Saint Petersburg'
        )
        AND ${noDigitsCondition("l.locality")}
        AND l.locality NOT LIKE '%,%'
        AND l.locality NOT LIKE '% Ave%'
        AND l.locality NOT LIKE '%Road%'
        AND l.locality NOT LIKE '%Street%'
        AND l.locality NOT LIKE '%Avenue%'
        AND l.locality NOT LIKE '%Blvd%'
        AND l.locality NOT LIKE '%Bulvarı%'
        AND l.locality NOT LIKE '%Caddesi%'
        AND l.locality NOT LIKE '%Suite%'
        AND l.locality NOT LIKE '%-Ro%'
    ),
    country_counts AS (
      SELECT
        l.country_code,
        COALESCE(MAX(l.country_name), l.country_code) AS country_name,
        COUNT(DISTINCT l.id) AS location_count,
        COUNT(DISTINCT o.treatment_id) AS treatment_count
      FROM valid_locations l
      JOIN offerings o ON o.location_id = l.id AND o.treatment_id IS NOT NULL AND ${activeOfferingCondition("o")}
      GROUP BY l.country_code
    ),
    ranked_treatments AS (
      SELECT
        c.country_code,
        c.country_name,
        c.location_count,
        c.treatment_count,
        t.id AS treatment_id,
        t.canonical_name AS treatment_name,
        COUNT(DISTINCT l.id) AS treatment_location_count,
        ROW_NUMBER() OVER (
          PARTITION BY c.country_code
          ORDER BY COUNT(DISTINCT l.id) DESC, t.canonical_name
        ) AS treatment_rank
      FROM country_counts c
      JOIN valid_locations l ON l.country_code = c.country_code
      JOIN offerings o ON o.location_id = l.id AND o.treatment_id IS NOT NULL AND ${activeOfferingCondition("o")}
      JOIN treatments t ON t.id = o.treatment_id
      GROUP BY
        c.country_code,
        c.country_name,
        c.location_count,
        c.treatment_count,
        t.id,
        t.canonical_name
    )
    SELECT
      country_code,
      country_name,
      location_count,
      treatment_count,
      treatment_id,
      treatment_name,
      treatment_location_count
    FROM ranked_treatments
    WHERE treatment_rank <= ?
    ORDER BY ${orderNoCase("country_name")}, country_code, treatment_rank
  `,
    [treatmentLimit],
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

  const byCountry = new Map<string, LandingCountrySearch>();
  for (const row of countryTreatmentRows) {
    let country = byCountry.get(row.country_code);
    if (!country) {
      country = {
        country_code: row.country_code,
        country_name: row.country_name,
        location_count: row.location_count,
        treatment_count: row.treatment_count,
        treatments: [],
        cities: [],
      };
      byCountry.set(row.country_code, country);
    }
    country.treatments.push({
      id: row.treatment_id,
      name: row.treatment_name,
      location_count: row.treatment_location_count,
    });
  }

  for (const city of byCity.values()) {
    const country = byCountry.get(city.country_code);
    if (country) {
      country.cities.push(city);
    }
  }

  return Array.from(byCountry.values()).sort(
    (a, b) =>
      b.cities.length - a.cities.length ||
      b.location_count - a.location_count ||
      a.country_name.localeCompare(b.country_name),
  );
}

export async function getRelatedTreatmentSearches(
  params: {
    countryCode?: string | null;
    countryName?: string | null;
    locality?: string | null;
    region?: string | null;
  },
  treatmentLimit = 8,
  minCityLocations = 8,
): Promise<RelatedTreatmentSearches | null> {
  const countryCode = params.countryCode?.trim();
  if (!countryCode) {
    return null;
  }

  const countryName = params.countryName?.trim() || countryCode;
  const locality = usableRelatedSearchLocality(params.locality);

  if (locality) {
    const cityValues = [countryCode, locality];
    const cityLocationCount =
      (await row<{ count: number }>(
        `
        SELECT COUNT(DISTINCT l.id) AS count
        FROM locations l
        JOIN offerings o ON o.location_id = l.id AND o.treatment_id IS NOT NULL AND ${activeOfferingCondition("o")}
        WHERE ${activeEntityCondition("l")}
          AND COALESCE(l.is_virtual, false) = false
          AND l.country_code = ?
          AND ${equalsNoCase("l.locality")}
      `,
        cityValues,
      ))?.count || 0;

    if (cityLocationCount >= minCityLocations) {
      const treatments = await relatedTreatmentRows(
        `
        l.country_code = ?
          AND COALESCE(l.is_virtual, false) = false
          AND ${equalsNoCase("l.locality")}
      `,
        cityValues,
        treatmentLimit,
      );

      if (treatments.length) {
        return {
          scope: "city",
          locality,
          region_code: regionCode(countryCode, params.region),
          country_code: countryCode,
          country_name: countryName,
          location_count: cityLocationCount,
          treatments,
        };
      }
    }
  }

  const countryLocationCount =
    (await row<{ count: number }>(
      `
      SELECT COUNT(DISTINCT l.id) AS count
      FROM locations l
      JOIN offerings o ON o.location_id = l.id AND o.treatment_id IS NOT NULL AND ${activeOfferingCondition("o")}
      WHERE ${activeEntityCondition("l")}
        AND COALESCE(l.is_virtual, false) = false
        AND l.country_code = ?
    `,
      [countryCode],
    ))?.count || 0;
  const treatments = await relatedTreatmentRows(
    "l.country_code = ? AND COALESCE(l.is_virtual, false) = false",
    [countryCode],
    treatmentLimit,
  );

  if (!treatments.length) {
    return null;
  }

  return {
    scope: "country",
    locality: null,
    region_code: null,
    country_code: countryCode,
    country_name: countryName,
    location_count: countryLocationCount,
    treatments,
  };
}

async function relatedTreatmentRows(whereClause: string, values: unknown[], limit: number): Promise<LandingCityTreatment[]> {
  return await rows<LandingCityTreatment>(
    `
    SELECT
      t.id AS id,
      t.canonical_name AS name,
      COUNT(DISTINCT l.id) AS location_count
    FROM locations l
    JOIN offerings o ON o.location_id = l.id AND o.treatment_id IS NOT NULL AND ${activeOfferingCondition("o")}
    JOIN treatments t ON t.id = o.treatment_id
    WHERE ${activeEntityCondition("l")}
      AND ${whereClause}
    GROUP BY t.id, t.canonical_name
    ORDER BY COUNT(DISTINCT l.id) DESC, t.canonical_name
    LIMIT ?
  `,
    [...values, limit],
  );
}

function regionCode(countryCode: string, region?: string | null) {
  const trimmed = region?.trim();
  return countryCode === "US" && trimmed && /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

function usableRelatedSearchLocality(locality?: string | null) {
  const trimmed = locality?.trim();
  if (
    !trimmed ||
    trimmed.length < 3 ||
    trimmed.length > 40 ||
    invalidRelatedSearchLocalities.has(trimmed) ||
    /\d/.test(trimmed) ||
    trimmed.includes(",") ||
    /\b(Ave|Road|Street|Avenue|Blvd|Suite)\b/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export async function getLandingFeaturedDirectoryCards(
  limit = 5,
): Promise<LandingFeaturedDirectoryCard[]> {
  const preferredCandidates = await rows<AnyRow>(
    `
    WITH preferred(term, rank) AS (
      VALUES
        ('Clinique La Prairie', 1),
        ('SHA Wellness', 2),
        ('Chi Longevity', 3),
        ('Fountain Life', 4),
        ('The Hundred', 5)
    ),
    matches AS (
      SELECT p.rank, l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_name,
             google_reviews.rating, google_reviews.review_count,
             org.canonical_name AS org_name,
             ROW_NUMBER() OVER (
               PARTITION BY p.rank
               ORDER BY
                 (google_reviews.review_count IS NULL),
                 google_reviews.review_count DESC,
                 (google_reviews.rating IS NULL),
                 google_reviews.rating DESC,
                 ${orderNoCase("l.name")}
             ) AS match_rank
      FROM preferred p
      JOIN locations l
        ON ${containsNoCase("l.name", "p.term")}
      LEFT JOIN organizations org ON org.id = l.org_id
      ${googleReviewMatchJoin()}
      WHERE ${activeEntityCondition("l")}
        AND EXISTS (
        SELECT 1
        FROM images img
        WHERE img.entity_type = 'location'
          AND img.entity_id = l.id
          AND ${activeImageCondition("img")}
          AND img.blob_url IS NOT NULL
          AND img.blob_url <> ''
      )
    )
    SELECT id, slug, name, locality, region, country_name, rating, review_count, org_name
    FROM matches
    WHERE match_rank = 1
    ORDER BY rank
  `,
  );
  const fallbackCandidates = await rows<AnyRow>(
    `
    SELECT l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_name,
           google_reviews.rating, google_reviews.review_count,
           org.canonical_name AS org_name
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    WHERE ${activeEntityCondition("l")}
      AND EXISTS (
      SELECT 1
      FROM images img
      WHERE img.entity_type = 'location'
        AND img.entity_id = l.id
        AND ${activeImageCondition("img")}
        AND img.blob_url IS NOT NULL
        AND img.blob_url <> ''
    )
      AND COALESCE(NULLIF(TRIM(l.name), ''), NULLIF(TRIM(org.canonical_name), '')) IS NOT NULL
    ORDER BY
      (google_reviews.rating IS NULL),
      google_reviews.rating DESC,
      (google_reviews.review_count IS NULL),
      google_reviews.review_count DESC,
      ${orderNoCase("l.name")}
    LIMIT 600
  `,
  );
  const candidateMap = new Map<number, AnyRow>();
  for (const candidate of [...preferredCandidates, ...fallbackCandidates]) {
    candidateMap.set(candidate.id as number, candidate);
  }
  const candidates = Array.from(candidateMap.values());

  return await hydrateLandingDirectoryCards(candidates, limit);
}

export async function getLandingTreatmentDirectoryCards(
  treatmentName: string,
  limit = 5,
  options: LandingTreatmentCardOptions = {},
): Promise<LandingFeaturedDirectoryCard[]> {
  const filters: string[] = ["t.canonical_name = ?"];
  const values: unknown[] = [treatmentName];

  if (options.countryCode) {
    filters.push("l.country_code = ?");
    values.push(options.countryCode);
  }

  if (options.localities?.length) {
    filters.push(`l.locality IN (${placeholders(options.localities.length)})`);
    values.push(...options.localities);
  }

  const requireImage = options.requireImage ?? true;
  const imageRequirement = requireImage
    ? `
      AND EXISTS (
        SELECT 1
        FROM images img
        WHERE img.entity_type = 'location'
          AND img.entity_id = l.id
          AND ${activeImageCondition("img")}
          AND img.blob_url IS NOT NULL
          AND img.blob_url <> ''
      )
    `
    : "";

  const candidates = await rows<AnyRow>(
    `
    SELECT l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_name,
           google_reviews.rating, google_reviews.review_count,
           org.canonical_name AS org_name
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    JOIN offerings o ON o.location_id = l.id AND ${activeOfferingCondition("o")}
    JOIN treatments t ON t.id = o.treatment_id
    WHERE ${activeEntityCondition("l")}
      AND ${filters.join(" AND ")}
      ${imageRequirement}
      AND COALESCE(NULLIF(TRIM(l.name), ''), NULLIF(TRIM(org.canonical_name), '')) IS NOT NULL
    GROUP BY
      l.id,
      l.name,
      l.locality,
      l.region,
      l.country_name,
      google_reviews.rating,
      google_reviews.review_count,
      org.canonical_name
    ORDER BY
      (google_reviews.rating IS NULL),
      google_reviews.rating DESC,
      (google_reviews.review_count IS NULL),
      google_reviews.review_count DESC,
      ${orderNoCase("l.name")}
    LIMIT 80
  `,
    values,
  );

  return await hydrateLandingDirectoryCards(candidates, limit, { requireImage: options.requireImage });
}

async function hydrateLandingDirectoryCards(
  candidates: AnyRow[],
  limit: number,
  options: { requireImage?: boolean } = {},
): Promise<LandingFeaturedDirectoryCard[]> {
  const ids = candidates.map((candidate) => candidate.id as number);
  if (!ids.length) {
    return [];
  }

  const marks = placeholders(ids.length);
  const images = await rows<{ lid: number } & ImageCandidate>(
    `
    SELECT entity_id AS lid, blob_url
    FROM images
    WHERE entity_type = 'location' AND entity_id IN (${marks})
      AND ${activeImageCondition("images")}
      AND blob_url IS NOT NULL
      AND blob_url != ''
  `,
    ids,
  );
  const imageMap = new Map<number, string>();
  for (const image of images) {
    const src = usableImageSource(image);
    if (!imageMap.has(image.lid) && src) {
      imageMap.set(image.lid, src);
    }
  }

  const requireImage = options.requireImage ?? true;
  const imageBacked = candidates.filter((candidate) => imageMap.has(candidate.id as number));
  const featured = (requireImage && imageBacked.length ? imageBacked : candidates).slice(0, limit);
  const featuredIds = featured.map((candidate) => candidate.id as number);
  if (!featuredIds.length) {
    return [];
  }

  const featuredMarks = placeholders(featuredIds.length);
  const treatments = await rows<{ lid: number; name: string; domain: string }>(
    `
    SELECT o.location_id AS lid, t.canonical_name AS name, t.category AS domain
    FROM offerings o
    JOIN treatments t ON t.id = o.treatment_id
    WHERE o.location_id IN (${featuredMarks})
      AND ${activeOfferingCondition("o")}
    GROUP BY o.location_id, t.id, t.canonical_name, t.category
  `,
    featuredIds,
  );
  const tags = await rows<{ lid: number; facet: string; value: string }>(
    `
    SELECT et.entity_id AS lid, tg.facet AS facet, tg.value AS value
    FROM entity_tags et
    JOIN tags tg ON tg.id = et.tag_id
    WHERE et.entity_type = 'location'
      AND et.entity_id IN (${featuredMarks})
      AND ${consumerTagFacetCondition("tg")}
  `,
    featuredIds,
  );

  const treatmentMap = new Map<number, { name: string; domain: string }[]>();
  for (const treatment of treatments) {
    const list = treatmentMap.get(treatment.lid) || [];
    list.push({ name: treatment.name, domain: treatment.domain });
    treatmentMap.set(treatment.lid, list);
  }

  const tagMap = new Map<number, { facet: string; value: string }[]>();
  for (const tag of tags) {
    const list = tagMap.get(tag.lid) || [];
    list.push({ facet: tag.facet, value: tag.value });
    tagMap.set(tag.lid, list);
  }

  return featured.map((card) => {
    const id = card.id as number;
    return {
      id,
      slug: (card.slug as string | null) || null,
      name: (card.name as string | null) || null,
      org_name: (card.org_name as string | null) || null,
      locality: (card.locality as string | null) || null,
      region: (card.region as string | null) || null,
      country_name: (card.country_name as string | null) || null,
      rating: (card.rating as number | null) || null,
      review_count: (card.review_count as number | null) || null,
      image: imageMap.get(id) || null,
      tags: tagMap.get(id) || [],
      treatments: (treatmentMap.get(id) || []).slice(0, 3),
    };
  });
}

export async function getFacets() {
  const countries = await rows<{ code: string; name: string; n: number }>(`
    SELECT country_code AS code, MAX(country_name) AS name, COUNT(*) AS n
    FROM locations l
    WHERE ${activeEntityCondition("l")}
      AND country_code IS NOT NULL AND country_code <> ''
    GROUP BY country_code
    ORDER BY
      CASE WHEN country_code = 'US' THEN 0 ELSE 1 END,
      ${isPostgres() ? "lower(MAX(country_name))" : "name COLLATE NOCASE"},
      country_code
  `);

  const localities = await rows<{ country_code: string; value: string; n: number }>(`
    SELECT country_code, locality AS value, COUNT(*) AS n
    FROM locations l
    WHERE ${activeEntityCondition("l")}
      AND COALESCE(l.is_virtual, false) = false
      AND country_code IS NOT NULL
      AND country_code <> ''
      AND locality IS NOT NULL
      AND TRIM(locality) <> ''
    GROUP BY country_code, locality
    ORDER BY country_code, ${orderNoCase("locality")}
  `);

  const treatments = await rows<{ domain: string; id: number; name: string; n: number }>(`
    SELECT t.category AS domain, t.id AS id,
           t.canonical_name AS name, COUNT(l.id) AS n
    FROM treatments t
    LEFT JOIN offerings o ON o.treatment_id = t.id AND ${activeOfferingCondition("o")}
    LEFT JOIN locations l ON l.id = o.location_id AND ${activeEntityCondition("l")}
    GROUP BY t.category, t.id, t.canonical_name
    ORDER BY t.category, t.canonical_name
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
        ${
          isPostgres() && entityType === "location"
            ? `AND EXISTS (SELECT 1 FROM locations l WHERE l.id = et.entity_id AND ${activeEntityCondition("l")})`
            : ""
        }
        ${
          isPostgres() && entityType === "practitioner"
            ? `AND EXISTS (SELECT 1 FROM practitioners p WHERE p.id = et.entity_id AND ${activeEntityCondition("p")})`
            : ""
        }
      GROUP BY tg.value
      ORDER BY n DESC
    `,
      [facet, entityType],
    );

  const [locationEntityTypes, locationCareModels, practitionerEntityTypes, practitionerCareModels] = await Promise.all([
    tagFacet("entity_type", "location"),
    tagFacet("care_model", "location"),
    tagFacet("entity_type", "practitioner"),
    tagFacet("care_model", "practitioner"),
  ]);

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
  const where: string[] = [activeEntityCondition("l")];
  const values: unknown[] = [];
  const match = ftsMatch(params.q);
  if (options.includeText !== false && match) {
    where.push(`l.id IN (SELECT entity_id FROM search_index WHERE ${searchIndexMatchCondition("location")})`);
    values.push(match);
  }
  if (params.country) {
    where.push("l.country_code = ?");
    values.push(params.country);
  }
  if (params.locality) {
    where.push(equalsNoCase("l.locality"));
    values.push(params.locality);
  }
  for (const treatmentId of params.treatment_ids || []) {
    where.push(`EXISTS (SELECT 1 FROM offerings o WHERE o.location_id = l.id AND o.treatment_id = ? AND ${activeOfferingCondition("o")})`);
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

function usesLocationAwareDefault(params: DirectoryParams) {
  return !ftsMatch(params.q)
    && !params.country
    && !params.locality
    && !(params.treatment_ids || []).length
    && !params.entity_type
    && !params.care_model;
}

function normalizedCountryCode(country?: string | null) {
  const value = country?.trim().toUpperCase();
  return value && /^[A-Z][A-Z]$/.test(value) ? value : undefined;
}

function normalizedLocationText(value?: string | null) {
  return value?.trim() || undefined;
}

function finiteCoordinate(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function activeLocationCountryCount(countryCode: string) {
  return (await row<{ count: number }>(
    `
    SELECT COUNT(*) AS count
    FROM locations l
    WHERE ${activeEntityCondition("l")}
      AND l.country_code = ?
  `,
    [countryCode],
  ))?.count || 0;
}

function distanceKmExpression() {
  return `
    CASE
      WHEN l.latitude IS NOT NULL
        AND l.longitude IS NOT NULL
      THEN (
        6371 * 2 * asin(
          sqrt(
            power(sin(radians((l.latitude - ?) / 2)), 2)
            + cos(radians(?)) * cos(radians(l.latitude))
            * power(sin(radians((l.longitude - ?) / 2)), 2)
          )
        )
      )
      ELSE NULL
    END
  `;
}

function locationAwareDefaultOrder(
  visitor: VisitorLocationParams | undefined,
  visitorCountryListingCount: number | null,
) {
  const countryCode = normalizedCountryCode(visitor?.country);
  const city = normalizedLocationText(visitor?.city);
  const region = normalizedLocationText(visitor?.region);
  const latitude = finiteCoordinate(visitor?.latitude);
  const longitude = finiteCoordinate(visitor?.longitude);
  const values: unknown[] = [];

  const hasVisitorCountry = Boolean(countryCode);
  const useUsFallbackAfterVisitorCountry =
    hasVisitorCountry && countryCode !== "US" && (visitorCountryListingCount ?? 0) < 5;

  let proximityRank = "CASE WHEN l.country_code = 'US' THEN 0 ELSE 1 END";

  if (countryCode) {
    const proximityCases: string[] = [];
    if (city) {
      proximityCases.push(`WHEN l.country_code = ? AND ${trimLower("l.locality")} = ${trimLower("?")} THEN 0`);
      values.push(countryCode, city);
    }
    if (region) {
      proximityCases.push(`WHEN l.country_code = ? AND ${trimLower("l.region")} = ${trimLower("?")} THEN 1`);
      values.push(countryCode, region);
    }
    proximityCases.push("WHEN l.country_code = ? THEN 2");
    values.push(countryCode);
    if (useUsFallbackAfterVisitorCountry) {
      proximityCases.push("WHEN l.country_code = 'US' THEN 3");
    }
    proximityRank = `
      CASE
        ${proximityCases.join("\n        ")}
        ELSE 4
      END
    `;
  }

  let distanceRank = "CASE WHEN false THEN 1 ELSE 0 END";
  if (latitude !== undefined && longitude !== undefined) {
    distanceRank = distanceKmExpression();
    values.push(latitude, latitude, longitude);
  }

  return {
    sql: `
      has_image DESC,
      ${proximityRank} ASC,
      (${distanceRank} IS NULL),
      ${distanceRank} ASC,
      has_treatment_menu DESC,
      has_practitioner DESC,
      (google_reviews.review_count IS NULL),
      google_reviews.review_count DESC,
      (google_reviews.rating IS NULL),
      google_reviews.rating DESC,
      ${orderNoCase("l.name")}
    `,
    values: latitude !== undefined && longitude !== undefined
      ? [...values, latitude, latitude, longitude]
      : values,
  };
}

export async function searchLocations(params: DirectoryParams, page = 0) {
  const match = ftsMatch(params.q);
  const matchJoin = match ? searchMatchJoin("l", "location") : "";
  const { clause, values } = locationWhere(params, { includeText: !match });
  const queryValues = match ? searchMatchValues(match, values) : values;
  const defaultOrdering = usesLocationAwareDefault(params);
  const visitorCountryCode = normalizedCountryCode(params.visitor?.country);
  const visitorCountryListingCount = defaultOrdering && visitorCountryCode
    ? await activeLocationCountryCount(visitorCountryCode)
    : null;
  const defaultOrder = defaultOrdering
    ? locationAwareDefaultOrder(params.visitor, visitorCountryListingCount)
    : null;
  const orderBy = defaultOrder?.sql || (match
    ? `search_match.fts_rank ASC, (google_reviews.rating IS NULL), google_reviews.rating DESC, (google_reviews.review_count IS NULL), google_reviews.review_count DESC, ${orderNoCase("l.name")}`
    : `(google_reviews.review_count IS NULL), google_reviews.review_count DESC, ${orderNoCase("l.name")}`);
  const total =
    (await row<{ count: number }>(
    `SELECT COUNT(*) AS count FROM locations l${matchJoin}${clause}`,
    queryValues,
    ))?.count || 0;
  const results = await rows<AnyRow>(
    `
    SELECT l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_code, l.country_name,
           l.website, google_reviews.rating, google_reviews.review_count, org.canonical_name AS org_name,
           COALESCE(image_flags.has_image, false) AS has_image,
           COALESCE(menu_flags.has_treatment_menu, false) AS has_treatment_menu,
           COALESCE(practitioner_flags.has_practitioner, false) AS has_practitioner,
           (
             SELECT MIN(o.price_amount)
             FROM offerings o
             WHERE o.location_id = l.id AND o.price_amount IS NOT NULL AND ${activeOfferingCondition("o")}
           ) AS min_price_amount,
           (
             SELECT o.price_currency
             FROM offerings o
             WHERE o.location_id = l.id AND o.price_amount IS NOT NULL AND ${activeOfferingCondition("o")}
             ORDER BY o.price_amount ASC
             LIMIT 1
           ) AS min_price_currency
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    LEFT JOIN (
      SELECT img.entity_id AS location_id, true AS has_image
      FROM images img
      WHERE img.entity_type = 'location'
        AND ${activeImageCondition("img")}
        AND img.blob_url IS NOT NULL
        AND img.blob_url != ''
      GROUP BY img.entity_id
    ) image_flags ON image_flags.location_id = l.id
    LEFT JOIN (
      SELECT menu_o.location_id, true AS has_treatment_menu
      FROM offerings menu_o
      WHERE ${activeOfferingCondition("menu_o")}
      GROUP BY menu_o.location_id
    ) menu_flags ON menu_flags.location_id = l.id
    LEFT JOIN (
      SELECT a.location_id, true AS has_practitioner
      FROM affiliations a
      WHERE ${activeEntityCondition("a")}
      GROUP BY a.location_id
    ) practitioner_flags ON practitioner_flags.location_id = l.id
    ${matchJoin}
    ${clause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `,
    [...queryValues, ...(defaultOrder?.values || []), PAGE_SIZE, page * PAGE_SIZE],
  );

  const ids = results.map((result) => result.id as number);
  if (ids.length) {
    const marks = placeholders(ids.length);
    const treatments = await rows<{ lid: number; name: string; domain: string }>(
      `
      SELECT o.location_id AS lid, t.canonical_name AS name, t.category AS domain
      FROM offerings o
      JOIN treatments t ON t.id = o.treatment_id
      WHERE o.location_id IN (${marks})
        AND ${activeOfferingCondition("o")}
      GROUP BY o.location_id, t.id, t.canonical_name, t.category
    `,
      ids,
    );
    const tags = await rows<{ lid: number; facet: string; value: string }>(
      `
      SELECT et.entity_id AS lid, tg.facet AS facet, tg.value AS value
      FROM entity_tags et
      JOIN tags tg ON tg.id = et.tag_id
      WHERE et.entity_type = 'location'
        AND et.entity_id IN (${marks})
        AND ${consumerTagFacetCondition("tg")}
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
    const images = await rows<{ lid: number } & ImageCandidate>(
      `
      SELECT entity_id AS lid, blob_url
      FROM images
      WHERE entity_type = 'location' AND entity_id IN (${marks})
        AND ${activeImageCondition("images")}
        AND blob_url IS NOT NULL
        AND blob_url != ''
    `,
      ids,
    );
    const imageMap = new Map<number, string>();
    for (const image of images) {
      const src = usableImageSource(image);
      if (!imageMap.has(image.lid) && src) {
        imageMap.set(image.lid, src);
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

export async function searchPractitioners(params: DirectoryParams, page = 0) {
  const where: string[] = [activeEntityCondition("p")];
  const values: unknown[] = [];
  const match = ftsMatch(params.q);
  const matchJoin = match ? searchMatchJoin("p", "practitioner") : "";
  if (params.country) {
    where.push(`
      (
        EXISTS (
          SELECT 1
          FROM affiliations a
          JOIN locations l ON l.id = a.location_id
          WHERE a.practitioner_id = p.id
            AND ${activeEntityCondition("a")}
            AND ${activeEntityCondition("l")}
            AND l.country_code = ?
        )
        OR EXISTS (
          SELECT 1
          FROM search_index si
          WHERE si.entity_type = 'practitioner'
            AND si.entity_id = p.id
            AND si.country IN (
              SELECT DISTINCT country_name
              FROM locations l
              WHERE ${activeEntityCondition("l")}
                AND country_code = ? AND country_name IS NOT NULL AND country_name != ''
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
          AND ${activeEntityCondition("a")}
          AND ${activeEntityCondition("l")}
          AND ${equalsNoCase("l.locality")}
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
        JOIN locations l ON l.id = a.location_id
        WHERE a.practitioner_id = p.id
          AND ${activeEntityCondition("a")}
          AND ${activeEntityCondition("l")}
          AND ${activeOfferingCondition("o")}
          AND o.treatment_id = ?
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
  const queryValues = match ? searchMatchValues(match, values) : values;
  const orderBy = match
    ? `search_match.fts_rank ASC, (p.years_experience IS NULL), p.years_experience DESC, ${orderNoCase("p.full_name")}`
    : `(p.years_experience IS NULL), p.years_experience DESC, ${orderNoCase("p.full_name")}`;
  const total =
    (await row<{ count: number }>(
    `SELECT COUNT(*) AS count FROM practitioners p${matchJoin}${clause}`,
    queryValues,
    ))?.count || 0;
  const results = await rows<AnyRow>(
    `
    SELECT p.id, ${practitionerSlugSelect("p")} AS slug, p.full_name, p.primary_specialty, p.years_experience, p.languages
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
    const affiliations = await rows<{ pid: number; clinic: string | null; locality: string | null; country_code: string | null; country_name: string | null }>(
      `
      SELECT a.practitioner_id AS pid, l.id, ${locationSlugSelect("l")} AS slug, l.name AS clinic, l.locality AS locality,
             l.country_code AS country_code, l.country_name AS country_name
      FROM affiliations a
      JOIN locations l ON l.id = a.location_id
      WHERE a.practitioner_id IN (${marks})
        AND ${activeEntityCondition("a")}
        AND ${activeEntityCondition("l")}
    `,
      ids,
    );
    const affiliationMap = new Map<number, typeof affiliations>();
    for (const affiliation of affiliations) {
      const list = affiliationMap.get(affiliation.pid) || [];
      list.push(affiliation);
      affiliationMap.set(affiliation.pid, list);
    }
    const images = await rows<{ pid: number } & ImageCandidate>(
      `
      SELECT entity_id AS pid, blob_url
      FROM images
      WHERE entity_type = 'practitioner' AND entity_id IN (${marks})
        AND ${activeImageCondition("images")}
        AND blob_url IS NOT NULL
        AND blob_url != ''
    `,
      ids,
    );
    const imageMap = new Map<number, string>();
    for (const image of images) {
      const src = usableImageSource(image);
      if (!imageMap.has(image.pid) && src) {
        imageMap.set(image.pid, src);
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

export async function getLocationDetail(ref: number | string) {
  const lookup = entityLookup("l", ref);
  const location = await row<AnyRow>(
    `
    SELECT l.*, org.canonical_name AS org_name, org.website_domain AS org_domain,
           google_reviews.rating AS google_rating,
           google_reviews.review_count AS google_review_count
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    WHERE ${lookup.clause}
      AND ${activeEntityCondition("l")}
  `,
    lookup.values,
  );
  if (!location) {
    return null;
  }
  const id = location.id as number;
  location.rating = (location.google_rating as number | null) || null;
  location.review_count = (location.google_review_count as number | null) || null;
  location.offerings = await rows(
    `
    SELECT o.raw_name, o.price_amount, o.price_currency,
           t.canonical_name AS treatment, t.category AS domain
    FROM offerings o
    LEFT JOIN treatments t ON t.id = o.treatment_id
    WHERE o.location_id = ?
      AND ${activeOfferingCondition("o")}
    ORDER BY (t.category IS NULL), t.category, t.canonical_name, o.raw_name
  `,
    [id],
  );
  location.tags = await rows(
    `
    SELECT tg.facet, tg.value
    FROM entity_tags et
    JOIN tags tg ON tg.id = et.tag_id
    WHERE et.entity_type = 'location' AND et.entity_id = ?
      AND ${consumerTagFacetCondition("tg")}
    ORDER BY tg.facet, tg.value
  `,
    [id],
  );
  location.practitioners = await rows(
    `
    SELECT p.id, ${practitionerSlugSelect("p")} AS slug, p.full_name, p.primary_specialty, a.role
    FROM affiliations a
    JOIN practitioners p ON p.id = a.practitioner_id
    WHERE a.location_id = ?
      AND ${activeEntityCondition("a")}
      AND ${activeEntityCondition("p")}
  `,
    [id],
  );
  location.reviews = await rows(
    `
    SELECT author, rating, review_date, text
    FROM reviews r
    WHERE location_id = ?
      AND provider = 'scrape'
      AND ${activeReviewCondition("r")}
    ORDER BY review_date DESC NULLS LAST, id DESC
    LIMIT 10
  `,
    [id],
  );
  location.external_reviews = await getExternalReviewGroups(id);
  const locationImages = await rows<{
    blob_url: string | null;
    alt: string | null;
  }>(
    `
    SELECT blob_url, alt
    FROM images
    WHERE entity_type = 'location' AND entity_id = ?
      AND ${activeImageCondition("images")}
      AND blob_url IS NOT NULL
      AND blob_url != ''
    LIMIT 8
  `,
    [id],
  );
  location.images = locationImages.filter((image) => usableImageSource(image));
  return location;
}

export async function getPractitionerDetail(ref: number | string) {
  const lookup = entityLookup("p", ref);
  const practitioner = await row<AnyRow>(
    `SELECT * FROM practitioners p WHERE ${lookup.clause} AND ${activeEntityCondition("p")}`,
    lookup.values,
  );
  if (!practitioner) {
    return null;
  }
  const id = practitioner.id as number;
  practitioner.tags = await rows(
    `
    SELECT tg.facet, tg.value
    FROM entity_tags et
    JOIN tags tg ON tg.id = et.tag_id
    WHERE et.entity_type = 'practitioner' AND et.entity_id = ?
      AND ${consumerTagFacetCondition("tg")}
    ORDER BY tg.facet, tg.value
  `,
    [id],
  );
  practitioner.affiliations = await rows(
    `
    SELECT l.id, ${locationSlugSelect("l")} AS slug, l.name AS clinic, l.locality, l.region, l.country_code, l.country_name, a.role
    FROM affiliations a
    JOIN locations l ON l.id = a.location_id
    WHERE a.practitioner_id = ?
      AND ${activeEntityCondition("a")}
      AND ${activeEntityCondition("l")}
  `,
    [id],
  );
  const practitionerImages = await rows<{
    blob_url: string | null;
    alt: string | null;
  }>(
    `
    SELECT blob_url, alt
    FROM images
    WHERE entity_type = 'practitioner' AND entity_id = ?
      AND ${activeImageCondition("images")}
      AND blob_url IS NOT NULL
      AND blob_url != ''
    LIMIT 8
  `,
    [id],
  );
  practitioner.images = practitionerImages.filter((image) => usableImageSource(image));
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
  const visitor = parseVisitorLocationParams(searchParams);
  return {
    kind: searchParams.get("kind") === "practitioners" ? "practitioners" : "locations",
    q: searchParams.get("q") || undefined,
    country: searchParams.get("country") || undefined,
    locality: searchParams.get("locality") || undefined,
    treatment_ids: treatmentIds.length ? treatmentIds : undefined,
    entity_type: searchParams.get("entity_type") || undefined,
    care_model: searchParams.get("care_model") || undefined,
    visitor,
  };
}

function parseVisitorLocationParams(searchParams: URLSearchParams): VisitorLocationParams | undefined {
  const country = normalizedCountryCode(searchParams.get("geo_country"));
  const region = normalizedLocationText(searchParams.get("geo_region"));
  const city = normalizedLocationText(searchParams.get("geo_city"));
  const latitude = parseFiniteNumber(searchParams.get("geo_lat"));
  const longitude = parseFiniteNumber(searchParams.get("geo_lng"));

  if (!country && !region && !city && latitude === undefined && longitude === undefined) {
    return undefined;
  }

  return {
    country,
    region,
    city,
    latitude,
    longitude,
  };
}

function parseFiniteNumber(raw: string | null) {
  if (!raw) {
    return undefined;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}
