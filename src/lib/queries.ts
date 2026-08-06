import { hasTable, isPostgres, row, rows } from "@/lib/db";
import {
  type CityIndexPlace,
  type TreatmentCatalogItem,
  type TreatmentCityCount,
} from "@/lib/treatment-pages";
import type { ClinicianLicenseVerificationData } from "@/components/clinician-license-verification";
import { orderTreatmentChips, type TreatmentChipWithId } from "@/lib/treatment-chip-order";

export const PAGE_SIZE = 18;

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
  image_kind?: string | null;
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
const RADIUS_COORDINATE_WARNING_CACHE_MS = 60 * 60 * 1000;

let radiusCoordinateWarningCache: { expiresAt: number; count: number } | null = null;

export type DirectoryParams = {
  kind?: SearchKind;
  q?: string;
  country?: string;
  locality?: string;
  city_label?: string;
  city_country?: string;
  place_type?: string;
  city_lat?: number;
  city_lng?: number;
  map_north?: number;
  map_south?: number;
  map_east?: number;
  map_west?: number;
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
  country_code: string | null;
  country_name: string | null;
  rating: number | null;
  review_count: number | null;
  min_price_amount: number | null;
  min_price_currency: string | null;
  image: string | null;
  image_kind?: string | null;
  tags: { facet: string; value: string }[];
  treatments: { name: string; domain: string }[];
  clinician_license_verification: ClinicianLicenseVerificationData | null;
};

export type TreatmentLocationLandingResult = {
  id: number;
  slug: string | null;
  name: string | null;
  org_name: string | null;
  locality: string | null;
  region: string | null;
  country_code: string | null;
  country_name: string | null;
  rating: number | null;
  review_count: number | null;
  min_price_amount: number | null;
  min_price_currency: string | null;
  image: string | null;
  image_kind: string | null;
  treatments: { name: string; domain: string }[];
  tags: { facet: string; value: string }[];
};

export type TreatmentLocationLandingData = {
  total: number;
  results: TreatmentLocationLandingResult[];
  priceSummaries: Array<{
    currency: string | null;
    minimum: number;
    maximum: number;
    offeringCount: number;
    locationCount: number;
  }>;
};

export type TreatmentLandingData = {
  totalLocations: number;
  totalCities: number;
  totalCountries: number;
  providers: LandingFeaturedDirectoryCard[];
  topCities: Array<{
    locality: string;
    region: string | null;
    countryCode: string;
    countryName: string | null;
    locationCount: number;
  }>;
  priceSummaries: Array<{
    currency: string | null;
    minimum: number;
    maximum: number;
    offeringCount: number;
    locationCount: number;
  }>;
};

type AnyRow = Record<string, unknown>;

type LandingTreatmentCardOptions = {
  countryCode?: string;
  localities?: string[];
  requireImage?: boolean;
  visitor?: VisitorLocationParams;
};

const landingLongevityClinicSourceSlugs = ["longevity_technology_clinics", "world_longevity_clinics"];

function ftsMatch(query?: string | null) {
  const tokens = (query || "").toLowerCase().match(/[a-z0-9]+/g);
  return tokens?.join(" ") || null;
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(",");
}

function orderNoCase(expression: string) {
  return isPostgres() ? `lower(${expression})` : `${expression} COLLATE NOCASE`;
}

function equalsNoCase(expression: string) {
  return isPostgres() ? `lower(${expression}) = lower(?)` : `${expression} = ? COLLATE NOCASE`;
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
  return isPostgres()
    ? `${alias}.status = 'active' AND ${alias}.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM offering_display_suppressions active_suppression
         WHERE active_suppression.offering_id = ${alias}.id
           AND active_suppression.active
       )`
    : "1=1";
}

function comparableOfferingPriceCondition(alias: string) {
  return isPostgres()
    ? `${alias}.price_amount > 0
       AND COALESCE(NULLIF(TRIM(${alias}.price_unit), ''), 'service') IN ('service', 'session', 'visit')
       AND COALESCE(NULLIF(TRIM(${alias}.price_audience), ''), 'retail') = 'retail'`
    : `${alias}.price_amount > 0`;
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

function googleReviewMatchJoin(alias = "google_reviews", locationAlias = "l") {
  return `
    LEFT JOIN external_place_matches ${alias}
      ON ${alias}.location_id = ${locationAlias}.id
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

function locationEntityLookup(alias: string, ref: number | string) {
  const text = String(ref).trim();
  if (isPostgres() && text && !/^\d+$/.test(text)) {
    return {
      clause: `(
        ${alias}.slug = ?
        OR ${alias}.id = (
          SELECT alias.location_id
          FROM location_slug_aliases alias
          WHERE alias.slug = ?
        )
      )`,
      values: [text, text] as unknown[],
    };
  }

  return entityLookup(alias, ref);
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

export async function getTreatmentCatalog(minimumLocations = 1): Promise<TreatmentCatalogItem[]> {
  const treatments = await rows<{
    id: number;
    name: string;
    category: string | null;
    location_count: number;
  }>(
    `
    SELECT
      t.id,
      t.canonical_name AS name,
      t.category,
      COUNT(DISTINCT l.id) AS location_count
    FROM treatments t
    LEFT JOIN offerings o ON o.treatment_id = t.id AND ${activeOfferingCondition("o")}
    LEFT JOIN locations l ON l.id = o.location_id AND ${activeEntityCondition("l")}
    WHERE COALESCE(l.is_virtual, false) = false
    GROUP BY t.id, t.canonical_name, t.category
    HAVING COUNT(DISTINCT l.id) >= ?
    ORDER BY location_count DESC, ${orderNoCase("t.canonical_name")}
  `,
    [minimumLocations],
  );

  return treatments.map((treatment) => ({
    id: treatment.id,
    name: treatment.name,
    category: treatment.category?.trim() || "Other treatments",
    locationCount: Number(treatment.location_count),
  }));
}

export async function getTreatmentIndexClinicCount() {
  const result = await row<{ count: number }>(`
    SELECT COUNT(DISTINCT l.id) AS count
    FROM locations l
    JOIN offerings o
      ON o.location_id = l.id
     AND ${activeOfferingCondition("o")}
    WHERE ${activeEntityCondition("l")}
      AND COALESCE(l.is_virtual, false) = false
  `);
  return Number(result?.count || 0);
}

export async function getEligibleTreatmentCities(
  minimumLocations = 1,
): Promise<TreatmentCityCount[]> {
  const cities = await rows<{
    treatment_id: number;
    city: string;
    region: string | null;
    country_code: string;
    country_name: string | null;
    latitude: number;
    longitude: number;
    location_count: number;
  }>(
    `
    SELECT
      o.treatment_id,
      ci.city,
      ci.region,
      ci.country_code,
      ci.country_name,
      ci.latitude,
      ci.longitude,
      COUNT(DISTINCT l.id) AS location_count
    FROM offerings o
    JOIN locations l ON l.id = o.location_id AND ${activeEntityCondition("l")}
    JOIN city_index ci
      ON ${trimLower("ci.city")} = ${trimLower("l.locality")}
      AND ci.country_code = l.country_code
    WHERE ${activeOfferingCondition("o")}
      AND COALESCE(l.is_virtual, false) = false
    GROUP BY o.treatment_id, ci.city, ci.region, ci.country_code, ci.country_name, ci.latitude, ci.longitude
    HAVING COUNT(DISTINCT l.id) >= ?
    ORDER BY location_count DESC, ${orderNoCase("ci.city")}
  `,
    [minimumLocations],
  );

  return cities.map((city) => ({
    treatmentId: Number(city.treatment_id),
    city: city.city,
    region: city.region,
    countryCode: city.country_code,
    countryName: city.country_name,
    latitude: Number(city.latitude),
    longitude: Number(city.longitude),
    locationCount: Number(city.location_count),
  }));
}

export async function getCityIndexPlaces(): Promise<CityIndexPlace[]> {
  const places = await rows<{
    city: string;
    region: string | null;
    country_code: string;
    country_name: string | null;
    latitude: number;
    longitude: number;
  }>(`
    SELECT city, region, country_code, country_name, latitude, longitude
    FROM city_index
    ORDER BY ${orderNoCase("city")}, ${orderNoCase("region")}, country_code
  `);

  return places.map((place) => ({
    city: place.city,
    region: place.region,
    countryCode: place.country_code,
    countryName: place.country_name,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
  }));
}

export async function getTreatmentNameById(id: number) {
  const treatment = await row<{ name: string }>(
    "SELECT canonical_name AS name FROM treatments WHERE id = ?",
    [id],
  );
  return treatment?.name || null;
}

export async function getTreatmentTrackingContextById(id: number) {
  const treatment = await row<{ name: string; category: string | null }>(
    "SELECT canonical_name AS name, category FROM treatments WHERE id = ?",
    [id],
  );
  if (!treatment) {
    return null;
  }
  return {
    name: treatment.name,
    category: treatment.category?.trim() || "Uncategorized",
  };
}

export async function getTreatmentLandingData(treatment: Pick<TreatmentCatalogItem, "id" | "name">): Promise<TreatmentLandingData> {
  const [summary, topCities, priceRows, providers] = await Promise.all([
    row<{ total_locations: number; total_cities: number; total_countries: number }>(
      `
      SELECT
        COUNT(DISTINCT l.id) AS total_locations,
        COUNT(DISTINCT l.locality) AS total_cities,
        COUNT(DISTINCT l.country_code) AS total_countries
      FROM offerings o
      JOIN locations l ON l.id = o.location_id
      WHERE o.treatment_id = ?
        AND ${activeOfferingCondition("o")}
        AND ${activeEntityCondition("l")}
        AND COALESCE(l.is_virtual, false) = false
    `,
      [treatment.id],
    ),
    rows<{
      locality: string;
      region: string | null;
      country_code: string;
      country_name: string | null;
      location_count: number;
    }>(
      `
      SELECT
        l.locality,
        MAX(l.region) AS region,
        l.country_code,
        MAX(l.country_name) AS country_name,
        COUNT(DISTINCT l.id) AS location_count
      FROM offerings o
      JOIN locations l ON l.id = o.location_id
      WHERE o.treatment_id = ?
        AND ${activeOfferingCondition("o")}
        AND ${activeEntityCondition("l")}
        AND COALESCE(l.is_virtual, false) = false
        AND l.locality IS NOT NULL
        AND TRIM(l.locality) <> ''
        AND l.country_code IS NOT NULL
        AND TRIM(l.country_code) <> ''
      GROUP BY l.country_code, l.locality
      ORDER BY location_count DESC, ${orderNoCase("l.locality")}
      LIMIT 12
    `,
      [treatment.id],
    ),
    rows<{
      currency: string | null;
      minimum: number;
      maximum: number;
      offering_count: number;
      location_count: number;
    }>(
      `
      SELECT
        NULLIF(TRIM(o.price_currency), '') AS currency,
        MIN(o.price_amount) AS minimum,
        MAX(o.price_amount) AS maximum,
        COUNT(*) AS offering_count,
        COUNT(DISTINCT l.id) AS location_count
      FROM offerings o
      JOIN locations l ON l.id = o.location_id
      WHERE o.treatment_id = ?
        AND ${comparableOfferingPriceCondition("o")}
        AND ${activeOfferingCondition("o")}
        AND ${activeEntityCondition("l")}
        AND COALESCE(l.is_virtual, false) = false
      GROUP BY NULLIF(TRIM(o.price_currency), '')
      ORDER BY offering_count DESC, currency
    `,
      [treatment.id],
    ),
    getLandingTreatmentDirectoryCards(treatment.name, 18, { requireImage: false }),
  ]);

  return {
    totalLocations: Number(summary?.total_locations || 0),
    totalCities: Number(summary?.total_cities || 0),
    totalCountries: Number(summary?.total_countries || 0),
    providers,
    topCities: topCities.map((city) => ({
      locality: city.locality,
      region: city.region,
      countryCode: city.country_code,
      countryName: city.country_name,
      locationCount: Number(city.location_count),
    })),
    priceSummaries: priceRows.map((price) => ({
      currency: price.currency,
      minimum: Number(price.minimum),
      maximum: Number(price.maximum),
      offeringCount: Number(price.offering_count),
      locationCount: Number(price.location_count),
    })),
  };
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
  const sourceFilter = landingLongevityClinicSourceFilter("l");
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
      SELECT p.rank, l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_code, l.country_name,
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
        AND ${sourceFilter.sql}
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
    SELECT id, slug, name, locality, region, country_code, country_name, rating, review_count, org_name
    FROM matches
    WHERE match_rank = 1
    ORDER BY rank
  `,
    sourceFilter.values,
  );
  const fallbackSourceFilter = landingLongevityClinicSourceFilter("l");
  const fallbackCandidates = await rows<AnyRow>(
    `
    SELECT l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_code, l.country_name,
           google_reviews.rating, google_reviews.review_count,
           org.canonical_name AS org_name
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    WHERE ${activeEntityCondition("l")}
      AND ${fallbackSourceFilter.sql}
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
    fallbackSourceFilter.values,
  );
  const candidateMap = new Map<number, AnyRow>();
  for (const candidate of [...preferredCandidates, ...fallbackCandidates]) {
    candidateMap.set(candidate.id as number, candidate);
  }
  const candidates = Array.from(candidateMap.values());

  return await hydrateLandingDirectoryCards(candidates, limit);
}

function landingLongevityClinicSourceFilter(locationAlias: string) {
  return {
    sql: `
      EXISTS (
        SELECT 1
        FROM source_records sr
        JOIN sources s ON s.id = sr.source_id
        WHERE sr.entity_type = 'location'
          AND sr.entity_id = ${locationAlias}.id
          AND s.slug IN (${placeholders(landingLongevityClinicSourceSlugs.length)})
      )
    `,
    values: [...landingLongevityClinicSourceSlugs] as unknown[],
  };
}

export async function getLandingTreatmentDirectoryCards(
  treatmentReference: string | number,
  limit = 5,
  options: LandingTreatmentCardOptions = {},
): Promise<LandingFeaturedDirectoryCard[]> {
  const treatment = typeof treatmentReference === "number"
    ? await row<{ id: number }>("SELECT id FROM treatments WHERE id = ?", [treatmentReference])
    : await row<{ id: number }>("SELECT id FROM treatments WHERE canonical_name = ?", [treatmentReference]);

  if (!treatment) {
    console.warn(`[landing] treatment not found: ${treatmentReference}`);
    return [];
  }

  const filters: string[] = ["o.treatment_id = ?"];
  const values: unknown[] = [treatment.id];
  const visitorCountry = normalizedCountryCode(options.visitor?.country);
  const visitorRegion = normalizedLocationText(options.visitor?.region);
  const visitorCity = normalizedLocationText(options.visitor?.city);
  const visitorLatitude = finiteCoordinate(options.visitor?.latitude);
  const visitorLongitude = finiteCoordinate(options.visitor?.longitude);
  const hasVisitorLocation = Boolean(
    visitorCountry || visitorRegion || visitorCity || (visitorLatitude !== undefined && visitorLongitude !== undefined),
  );

  if (!hasVisitorLocation && options.countryCode) {
    filters.push("l.country_code = ?");
    values.push(options.countryCode);
  }

  let distanceSelect = "NULL AS distance_miles";
  let distanceOrder = "CASE WHEN false THEN 1 ELSE 0 END";
  const distanceSelectValues: unknown[] = [];
  const distanceOrderValues: unknown[] = [];
  if (visitorLatitude !== undefined && visitorLongitude !== undefined) {
    const distanceSql = distanceMilesExpression();
    distanceSelect = `(${distanceSql}) AS distance_miles`;
    distanceOrder = `(${distanceSql} IS NULL), ${distanceSql} ASC`;
    distanceSelectValues.push(visitorLatitude, visitorLatitude, visitorLongitude);
    distanceOrderValues.push(visitorLatitude, visitorLatitude, visitorLongitude, visitorLatitude, visitorLatitude, visitorLongitude);
  }

  const locationRank = landingLocationRankExpression({
    city: visitorCity,
    country: visitorCountry,
    region: visitorRegion,
  });
  const fallbackLocalityRank = !hasVisitorLocation
    ? landingFallbackLocalityRankExpression(options.localities)
    : { sql: "0", values: [] as unknown[] };

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
    SELECT l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_code, l.country_name,
           google_reviews.rating, google_reviews.review_count,
           ${distanceSelect},
           ${locationRank.sql} AS location_rank,
           ${fallbackLocalityRank.sql} AS fallback_location_rank,
           org.canonical_name AS org_name
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    JOIN offerings o ON o.location_id = l.id AND ${activeOfferingCondition("o")}
    WHERE ${activeEntityCondition("l")}
      AND ${filters.join(" AND ")}
      ${imageRequirement}
      AND COALESCE(NULLIF(TRIM(l.name), ''), NULLIF(TRIM(org.canonical_name), '')) IS NOT NULL
    GROUP BY
      l.id,
      l.name,
      l.locality,
      l.region,
      l.country_code,
      l.country_name,
      l.latitude,
      l.longitude,
      google_reviews.rating,
      google_reviews.review_count,
      org.canonical_name
    ORDER BY
      location_rank ASC,
      fallback_location_rank ASC,
      ${distanceOrder},
      (google_reviews.rating IS NULL),
      google_reviews.rating DESC,
      (google_reviews.review_count IS NULL),
      google_reviews.review_count DESC,
      ${orderNoCase("l.name")}
    LIMIT 80
  `,
    [...distanceSelectValues, ...locationRank.values, ...fallbackLocalityRank.values, ...values, ...distanceOrderValues],
  );

  return await hydrateLandingDirectoryCards(candidates, limit, { requireImage: options.requireImage });
}

function landingLocationRankExpression(visitor: { country?: string; region?: string; city?: string }) {
  const values: unknown[] = [];
  const cases: string[] = [];

  if (visitor.country && visitor.city) {
    cases.push(`WHEN l.country_code = ? AND ${trimLower("l.locality")} = ${trimLower("?")} THEN 0`);
    values.push(visitor.country, visitor.city);
  }
  if (visitor.country && visitor.region) {
    cases.push(`WHEN l.country_code = ? AND ${trimLower("l.region")} = ${trimLower("?")} THEN 1`);
    values.push(visitor.country, visitor.region);
  }
  if (visitor.country) {
    cases.push("WHEN l.country_code = ? THEN 2");
    values.push(visitor.country);
  }
  if (!cases.length) {
    return {
      sql: "0",
      values,
    };
  }

  return {
    sql: `
      CASE
        ${cases.join("\n        ")}
        ELSE 3
      END
    `,
    values,
  };
}

function landingFallbackLocalityRankExpression(localities: string[] | undefined) {
  if (!localities?.length) {
    return {
      sql: "0",
      values: [] as unknown[],
    };
  }

  return {
    sql: `CASE WHEN l.locality IN (${placeholders(localities.length)}) THEN 0 ELSE 1 END`,
    values: localities as unknown[],
  };
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
    SELECT entity_id AS lid, blob_url, image_kind
    FROM images
    WHERE entity_type = 'location' AND entity_id IN (${marks})
      AND ${activeImageCondition("images")}
      AND blob_url IS NOT NULL
      AND blob_url != ''
    ORDER BY (image_kind = 'logo') DESC, updated_at DESC NULLS LAST, id DESC
    `,
    ids,
  );
  const imageMap = new Map<number, ImageCandidate>();
  for (const image of images) {
    const src = usableImageSource(image);
    if (!imageMap.has(image.lid) && src) {
      imageMap.set(image.lid, image);
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
  const prices = await rows<{ lid: number; amount: number; currency: string | null }>(
    `
    SELECT DISTINCT ON (o.location_id)
      o.location_id AS lid,
      o.price_amount AS amount,
      o.price_currency AS currency
    FROM offerings o
    WHERE o.location_id IN (${featuredMarks})
      AND ${comparableOfferingPriceCondition("o")}
      AND ${activeOfferingCondition("o")}
    ORDER BY o.location_id, o.price_amount ASC
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

  const priceMap = new Map(prices.map((price) => [price.lid, price]));

  const verificationMap = await locationClinicianLicenseVerificationMap(featuredIds);

  return featured.map((card) => {
    const id = card.id as number;
    return {
      id,
      slug: (card.slug as string | null) || null,
      name: (card.name as string | null) || null,
      org_name: (card.org_name as string | null) || null,
      locality: (card.locality as string | null) || null,
      region: (card.region as string | null) || null,
      country_code: (card.country_code as string | null) || null,
      country_name: (card.country_name as string | null) || null,
      rating: (card.rating as number | null) || null,
      review_count: (card.review_count as number | null) || null,
      min_price_amount: priceMap.get(id)?.amount ?? null,
      min_price_currency: priceMap.get(id)?.currency || null,
      image: imageMap.get(id)?.blob_url || null,
      image_kind: imageMap.get(id)?.image_kind || null,
      tags: tagMap.get(id) || [],
      treatments: (treatmentMap.get(id) || []).slice(0, 3),
      clinician_license_verification: verificationMap.get(id) || null,
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
      AND COALESCE(l.is_virtual, false) = false
      AND l.country_code = ?
  `,
    [countryCode],
  ))?.count || 0;
}

async function warnRadiusCoordinateExclusions() {
  const now = Date.now();
  if (!radiusCoordinateWarningCache || radiusCoordinateWarningCache.expiresAt <= now) {
    const count = (await row<{ count: number }>(
      `
      SELECT COUNT(*) AS count
      FROM locations l
      WHERE ${activeEntityCondition("l")}
        AND COALESCE(l.is_virtual, false) = false
        AND (l.latitude IS NULL OR l.longitude IS NULL)
    `,
    ))?.count || 0;
    radiusCoordinateWarningCache = { count, expiresAt: now + RADIUS_COORDINATE_WARNING_CACHE_MS };
  }
  if (radiusCoordinateWarningCache.count > 0) {
    console.warn(`Radius search excluded ${radiusCoordinateWarningCache.count} active non-virtual locations with null coordinates.`);
  }
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

function distanceMilesExpression() {
  return `
    (
      3958.7613 * 2 * asin(
        sqrt(
          power(sin(radians((l.latitude - ?) / 2)), 2)
          + cos(radians(?)) * cos(radians(l.latitude))
          * power(sin(radians((l.longitude - ?) / 2)), 2)
        )
      )
    )
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
      ${locationDirectoryCompletenessRank()} ASC,
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

// A complete directory listing is materially more useful when its offerings and
// contact details let a visitor make a decision without leaving Fountain. Keep
// these tiers ahead of every result ordering; the caller's normal relevance,
// proximity, and review ordering then breaks ties within a tier.
function locationDirectoryCompletenessRank() {
  const hasCompleteListingDetails = `
    COALESCE(image_flags.has_image, false)
    AND google_reviews.rating IS NOT NULL
    AND NULLIF(TRIM(l.address), '') IS NOT NULL
    AND NULLIF(TRIM(l.phone), '') IS NOT NULL
    AND NULLIF(TRIM(l.website), '') IS NOT NULL
  `;

  return `
    CASE
      WHEN COALESCE(menu_flags.has_treatment_menu, false)
        AND COALESCE(price_flags.has_priced_offering, false)
        AND (${hasCompleteListingDetails}) THEN 0
      WHEN COALESCE(menu_flags.has_treatment_menu, false)
        AND NOT COALESCE(price_flags.has_priced_offering, false)
        AND (${hasCompleteListingDetails}) THEN 1
      ELSE 2
    END
  `;
}

function locationDirectoryRankingJoins() {
  return `
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
      SELECT priced_o.location_id, true AS has_priced_offering
      FROM offerings priced_o
      WHERE priced_o.price_amount IS NOT NULL
        AND ${activeOfferingCondition("priced_o")}
      GROUP BY priced_o.location_id
    ) price_flags ON price_flags.location_id = l.id
  `;
}

export async function getTreatmentLocationLandingData(params: {
  treatmentId: number;
  treatmentName: string;
  countryCode: string;
  locality: string;
  resultLimit?: number;
}): Promise<TreatmentLocationLandingData> {
  const resultLimit = Math.min(24, Math.max(1, params.resultLimit || PAGE_SIZE));
  const locationFilter = `
    ${activeEntityCondition("l")}
    AND COALESCE(l.is_virtual, false) = false
    AND l.country_code = ?
    AND ${equalsNoCase("TRIM(l.locality)")}
    AND EXISTS (
      SELECT 1
      FROM offerings matching_o
      WHERE matching_o.location_id = l.id
        AND matching_o.treatment_id = ?
        AND ${activeOfferingCondition("matching_o")}
    )
  `;
  const filterValues = [params.countryCode, params.locality, params.treatmentId];
  const total =
    (await row<{ count: number }>(
      `SELECT COUNT(DISTINCT l.id) AS count FROM locations l WHERE ${locationFilter}`,
      filterValues,
    ))?.count || 0;

  const results = await rows<AnyRow>(
    `
    SELECT
      l.id,
      ${locationSlugSelect("l")} AS slug,
      l.name,
      l.locality,
      l.region,
      l.country_code,
      l.country_name,
      org.canonical_name AS org_name,
      google_reviews.rating,
      google_reviews.review_count,
      COALESCE(image_flags.has_image, false) AS has_image,
      COALESCE(menu_flags.has_treatment_menu, false) AS has_treatment_menu,
      (
        SELECT treatment_o.price_amount
        FROM offerings treatment_o
        WHERE treatment_o.location_id = l.id
          AND treatment_o.treatment_id = ?
          AND ${comparableOfferingPriceCondition("treatment_o")}
          AND ${activeOfferingCondition("treatment_o")}
        ORDER BY treatment_o.price_amount ASC
        LIMIT 1
      ) AS min_price_amount,
      (
        SELECT treatment_o.price_currency
        FROM offerings treatment_o
        WHERE treatment_o.location_id = l.id
          AND treatment_o.treatment_id = ?
          AND ${comparableOfferingPriceCondition("treatment_o")}
          AND ${activeOfferingCondition("treatment_o")}
        ORDER BY treatment_o.price_amount ASC
        LIMIT 1
      ) AS min_price_currency
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    ${locationDirectoryRankingJoins()}
    WHERE ${locationFilter}
    ORDER BY
      ${locationDirectoryCompletenessRank()} ASC,
      (google_reviews.rating IS NULL),
      google_reviews.rating DESC,
      (google_reviews.review_count IS NULL),
      google_reviews.review_count DESC,
      ${orderNoCase("l.name")}
    LIMIT ?
  `,
    [params.treatmentId, params.treatmentId, ...filterValues, resultLimit],
  );

  await hydrateLocationRows(results, [params.treatmentId]);

  const priceRows = await rows<{
    currency: string | null;
    minimum: number;
    maximum: number;
    offering_count: number;
    location_count: number;
  }>(
    `
    SELECT
      NULLIF(TRIM(o.price_currency), '') AS currency,
      MIN(o.price_amount) AS minimum,
      MAX(o.price_amount) AS maximum,
      COUNT(*) AS offering_count,
      COUNT(DISTINCT l.id) AS location_count
    FROM offerings o
    JOIN locations l ON l.id = o.location_id
    WHERE o.treatment_id = ?
      AND ${comparableOfferingPriceCondition("o")}
      AND ${activeOfferingCondition("o")}
      AND ${activeEntityCondition("l")}
      AND COALESCE(l.is_virtual, false) = false
      AND l.country_code = ?
      AND ${equalsNoCase("TRIM(l.locality)")}
    GROUP BY NULLIF(TRIM(o.price_currency), '')
    ORDER BY offering_count DESC, currency
  `,
    [params.treatmentId, params.countryCode, params.locality],
  );

  return {
    total,
    results: results as TreatmentLocationLandingResult[],
    priceSummaries: priceRows.map((price) => ({
      currency: price.currency,
      minimum: Number(price.minimum),
      maximum: Number(price.maximum),
      offeringCount: Number(price.offering_count),
      locationCount: Number(price.location_count),
    })),
  };
}

export async function searchLocations(params: DirectoryParams, page = 0) {
  if (hasMapBounds(params)) {
    return searchLocationsByMapBounds(params, page);
  }
  const selectedCountryCode = normalizedCountryCode(params.city_country || params.country);
  if (params.place_type === "country" && selectedCountryCode) {
    return searchLocationsByCountry(params, selectedCountryCode, page);
  }

  const cityLatitude = finiteCoordinate(params.city_lat);
  const cityLongitude = finiteCoordinate(params.city_lng);
  if (cityLatitude !== undefined && cityLongitude !== undefined) {
    return searchLocationsByCityRadius(params, cityLatitude, cityLongitude, page);
  }

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
  const orderBy = defaultOrder?.sql || ((params.treatment_ids || []).length
    ? `${treatmentRatingOrder()}, ${orderNoCase("l.name")}`
    : match
    ? `${locationDirectoryCompletenessRank()} ASC, search_match.fts_rank ASC, (google_reviews.rating IS NULL), google_reviews.rating DESC, (google_reviews.review_count IS NULL), google_reviews.review_count DESC, ${orderNoCase("l.name")}`
    : `${locationDirectoryCompletenessRank()} ASC, (google_reviews.review_count IS NULL), google_reviews.review_count DESC, ${orderNoCase("l.name")}`);
  const total =
    (await row<{ count: number }>(
    `SELECT COUNT(*) AS count FROM locations l${matchJoin}${clause}`,
    queryValues,
    ))?.count || 0;
  const results = await rows<AnyRow>(
    `
    SELECT l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_code, l.country_name, l.latitude, l.longitude,
           l.website, google_reviews.rating, google_reviews.review_count, org.canonical_name AS org_name,
           COALESCE(image_flags.has_image, false) AS has_image,
           COALESCE(menu_flags.has_treatment_menu, false) AS has_treatment_menu,
           COALESCE(practitioner_flags.has_practitioner, false) AS has_practitioner,
           (
             SELECT MIN(o.price_amount)
             FROM offerings o
             WHERE o.location_id = l.id AND ${comparableOfferingPriceCondition("o")} AND ${activeOfferingCondition("o")}
           ) AS min_price_amount,
           (
             SELECT o.price_currency
             FROM offerings o
             WHERE o.location_id = l.id AND ${comparableOfferingPriceCondition("o")} AND ${activeOfferingCondition("o")}
             ORDER BY o.price_amount ASC
             LIMIT 1
           ) AS min_price_currency
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    ${locationDirectoryRankingJoins()}
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

  await hydrateLocationRows(results, params.treatment_ids);
  return { results, total, page, page_size: PAGE_SIZE };
}

function hasMapBounds(params: DirectoryParams): params is DirectoryParams & {
  map_north: number;
  map_south: number;
  map_east: number;
  map_west: number;
} {
  return [params.map_north, params.map_south, params.map_east, params.map_west]
    .every((value) => typeof value === "number" && Number.isFinite(value))
    && params.map_north! > params.map_south!;
}

async function searchLocationsByMapBounds(
  params: DirectoryParams & { map_north: number; map_south: number; map_east: number; map_west: number },
  page: number,
) {
  const match = ftsMatch(params.q);
  const matchJoin = match ? searchMatchJoin("l", "location") : "";
  const filteredParams: DirectoryParams = {
    ...params,
    country: undefined,
    locality: undefined,
    city_lat: undefined,
    city_lng: undefined,
  };
  const { clause, values } = locationWhere(filteredParams, { includeText: !match });
  const where = clause ? [clause.replace(/^\s*WHERE\s+/i, "")] : [];
  const queryValues = match ? searchMatchValues(match, values) : [...values];
  where.push("COALESCE(l.is_virtual, false) = false");
  where.push("l.latitude IS NOT NULL AND l.longitude IS NOT NULL");
  where.push("l.latitude BETWEEN ? AND ?");
  queryValues.push(params.map_south, params.map_north);
  if (params.map_west <= params.map_east) {
    where.push("l.longitude BETWEEN ? AND ?");
  } else {
    // MapLibre represents a viewport crossing the antimeridian with west > east.
    where.push("(l.longitude >= ? OR l.longitude <= ?)");
  }
  queryValues.push(params.map_west, params.map_east);

  const centerLatitude = (params.map_north + params.map_south) / 2;
  const centerLongitude = params.map_west <= params.map_east
    ? (params.map_west + params.map_east) / 2
    : ((((params.map_west + params.map_east + 360) / 2) + 540) % 360) - 180;
  const payload = await locationPayloadFromWhere({
    latitude: centerLatitude,
    longitude: centerLongitude,
    matchJoin,
    where,
    values: queryValues,
    page,
    preferTreatmentRating: Boolean(params.treatment_ids?.length),
  });
  await hydrateLocationRows(payload.results, params.treatment_ids);
  return { ...payload, mode: "map_bounds" as const, effective_radius: null };
}

async function searchLocationsByCountry(params: DirectoryParams, countryCode: string, page: number) {
  const match = ftsMatch(params.q);
  const matchJoin = match ? searchMatchJoin("l", "location") : "";
  const filteredParams: DirectoryParams = {
    ...params,
    country: countryCode,
    locality: undefined,
    city_lat: undefined,
    city_lng: undefined,
  };
  const { clause, values } = locationWhere(filteredParams, { includeText: !match });
  const queryValues = match ? searchMatchValues(match, values) : values;
  const total = (await row<{ count: number }>(
    `SELECT COUNT(*) AS count FROM locations l${matchJoin}${clause}`,
    queryValues,
  ))?.count || 0;
  const results = await rows<AnyRow>(
    `
    SELECT l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_code, l.country_name, l.latitude, l.longitude,
           l.website, google_reviews.rating, google_reviews.review_count, org.canonical_name AS org_name,
           (
             SELECT MIN(o.price_amount)
             FROM offerings o
             WHERE o.location_id = l.id AND ${comparableOfferingPriceCondition("o")} AND ${activeOfferingCondition("o")}
           ) AS min_price_amount,
           (
             SELECT o.price_currency
             FROM offerings o
             WHERE o.location_id = l.id AND ${comparableOfferingPriceCondition("o")} AND ${activeOfferingCondition("o")}
             ORDER BY o.price_amount ASC
             LIMIT 1
           ) AS min_price_currency
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    ${locationDirectoryRankingJoins()}
    ${matchJoin}
    ${clause}
    ORDER BY
      ${(params.treatment_ids || []).length ? treatmentRatingOrder() : `${locationDirectoryCompletenessRank()} ASC, (google_reviews.rating IS NULL), google_reviews.rating DESC, (google_reviews.review_count IS NULL), google_reviews.review_count DESC`},
      ${orderNoCase("l.name")}
    LIMIT ? OFFSET ?
  `,
    [...queryValues, PAGE_SIZE, page * PAGE_SIZE],
  );
  await hydrateLocationRows(results, params.treatment_ids);
  const searchedCountry = params.city_label || params.city_country || countryCode;
  return {
    results,
    total,
    page,
    page_size: PAGE_SIZE,
    mode: "country_search" as const,
    effective_radius: null,
    searched_city: null,
    searched_country: searchedCountry,
  };
}

async function hydrateLocationRows(results: AnyRow[], preferredTreatmentIds: readonly number[] = []) {
  const ids = results.map((result) => result.id as number);
  if (ids.length) {
    const marks = placeholders(ids.length);
    const treatments = await rows<{ lid: number } & TreatmentChipWithId>(
      `
      SELECT o.location_id AS lid, t.id, t.canonical_name AS name, t.category AS domain
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
    const treatmentMap = new Map<number, TreatmentChipWithId[]>();
    const tagMap = new Map<number, { facet: string; value: string }[]>();
    for (const treatment of treatments) {
      const list = treatmentMap.get(treatment.lid) || [];
      list.push({ id: treatment.id, name: treatment.name, domain: treatment.domain });
      treatmentMap.set(treatment.lid, list);
    }
    for (const tag of tags) {
      const list = tagMap.get(tag.lid) || [];
      list.push({ facet: tag.facet, value: tag.value });
      tagMap.set(tag.lid, list);
    }
    const images = await rows<{ lid: number } & ImageCandidate>(
      `
      SELECT entity_id AS lid, blob_url, image_kind
      FROM images
      WHERE entity_type = 'location' AND entity_id IN (${marks})
        AND ${activeImageCondition("images")}
        AND blob_url IS NOT NULL
        AND blob_url != ''
      ORDER BY (image_kind = 'logo') DESC, updated_at DESC NULLS LAST, id DESC
    `,
      ids,
    );
    const imageMap = new Map<number, ImageCandidate>();
    for (const image of images) {
      const src = usableImageSource(image);
      if (!imageMap.has(image.lid) && src) {
        imageMap.set(image.lid, image);
      }
    }
    const verificationMap = await locationClinicianLicenseVerificationMap(ids);
    for (const result of results) {
      const id = result.id as number;
      result.treatments = orderTreatmentChips(treatmentMap.get(id) || [], preferredTreatmentIds);
      result.tags = tagMap.get(id) || [];
      result.image = imageMap.get(id)?.blob_url || null;
      result.image_kind = imageMap.get(id)?.image_kind || null;
      result.clinician_license_verification = verificationMap.get(id) || null;
    }
  }
}

async function locationClinicianLicenseVerificationMap(ids: number[]) {
  const verificationMap = new Map<number, ClinicianLicenseVerificationData>();
  if (!ids.length) {
    return verificationMap;
  }

  const verificationRows = await rows<{ lid: number } & ClinicianLicenseVerificationData>(
    `
    SELECT DISTINCT ON (verification.location_id)
           verification.location_id AS lid,
           practitioner.full_name AS practitioner_name,
           verification.jurisdiction_code,
           verification.license_number,
           verification.license_type,
           verification.licensing_authority,
           verification.license_status,
           verification.license_expires_at::text,
           verification.board_source_url,
           verification.verified_at::text
    FROM location_clinician_license_verifications verification
    JOIN locations location ON location.id = verification.location_id
    JOIN practitioners practitioner ON practitioner.id = verification.practitioner_id
    WHERE verification.location_id IN (${placeholders(ids.length)})
      AND verification.verification_status = 'verified'
      AND verification.next_review_at > CURRENT_TIMESTAMP
      AND (verification.license_expires_at IS NULL OR verification.license_expires_at >= CURRENT_DATE)
      AND EXISTS (
        SELECT 1
        FROM affiliations affiliation
        WHERE affiliation.location_id = verification.location_id
          AND affiliation.practitioner_id = verification.practitioner_id
          AND affiliation.status = 'active'
          AND affiliation.verification_status = 'verified'
          AND affiliation.deleted_at IS NULL
      )
      AND location.country_code = 'US'
      AND upper(trim(location.region)) = verification.jurisdiction_code
      AND ${activeEntityCondition("location")}
      AND ${activeEntityCondition("practitioner")}
    ORDER BY verification.location_id, verification.verified_at DESC
  `,
    ids,
  );

  for (const verification of verificationRows) {
    verificationMap.set(verification.lid, verification);
  }
  return verificationMap;
}

type RadiusSearchMode = "exact_radius" | "expanded_radius" | "country_fallback" | "country_search" | "cross_border" | "empty";

async function searchLocationsByCityRadius(params: DirectoryParams, latitude: number, longitude: number, page: number) {
  await warnRadiusCoordinateExclusions();
  const countryCode = normalizedCountryCode(params.city_country || params.country);
  const radii = [25, 50, 100];
  let lastRadiusPayload: Awaited<ReturnType<typeof radiusLocationPayload>> | null = null;
  // The exact-radius (25mi) count, kept separately from whichever wider radius
  // ends up supplying the padded result set, so the "no clinics" banner can
  // tell "genuinely zero in this city" apart from "a few in this city, padded
  // with nearby listings to reach a fuller page."
  let cityTotal: number | null = null;

  for (const radius of radii) {
    const payload = await radiusLocationPayload(params, latitude, longitude, radius, countryCode, page);
    lastRadiusPayload = payload;
    if (radius === 25) {
      cityTotal = payload.total;
    }
    if (payload.total >= 5) {
      await hydrateLocationRows(payload.results, params.treatment_ids);
      return {
        ...payload,
        mode: radius === 25 ? "exact_radius" as const : "expanded_radius" as const,
        effective_radius: radius,
        searched_city: params.city_label || null,
        searched_country: countryCode || null,
        city_total: cityTotal,
      };
    }
  }

  if (countryCode) {
    const countryTotal = await activeLocationCountryCount(countryCode);
    if (countryTotal <= 10 && countryTotal > 0) {
      const payload = await fallbackLocationPayload(latitude, longitude, page, {
        mode: "country_fallback",
        countryCode,
        preferTreatmentRating: Boolean(params.treatment_ids?.length),
      });
      await hydrateLocationRows(payload.results, params.treatment_ids);
      return {
        ...payload,
        mode: "country_fallback" as const,
        effective_radius: null,
        searched_city: params.city_label || null,
        searched_country: countryCode,
        city_total: cityTotal,
      };
    }

    if (countryTotal === 0) {
      const payload = await fallbackLocationPayload(latitude, longitude, page, {
        mode: "cross_border",
        radius: 500,
        preferTreatmentRating: Boolean(params.treatment_ids?.length),
      });
      await hydrateLocationRows(payload.results, params.treatment_ids);
      return {
        ...payload,
        mode: payload.total ? "cross_border" as const : "empty" as const,
        effective_radius: payload.total ? 500 : null,
        searched_city: params.city_label || null,
        searched_country: countryCode,
        city_total: cityTotal,
      };
    }
  }

  if (lastRadiusPayload) {
    await hydrateLocationRows(lastRadiusPayload.results, params.treatment_ids);
    return {
      ...lastRadiusPayload,
      mode: lastRadiusPayload.total ? "expanded_radius" as const : "empty" as const,
      effective_radius: lastRadiusPayload.total ? 100 : null,
      searched_city: params.city_label || null,
      searched_country: countryCode || null,
      city_total: cityTotal,
    };
  }

  return emptyLocationPayload(page, params.city_label || null, countryCode || null);
}

function radiusBox(latitude: number, longitude: number, radiusMiles: number) {
  const latDelta = radiusMiles / 69;
  const cos = Math.max(0.1, Math.cos(latitude * Math.PI / 180));
  const lngDelta = radiusMiles / (69 * cos);
  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLng: longitude - lngDelta,
    maxLng: longitude + lngDelta,
  };
}

async function radiusLocationPayload(
  params: DirectoryParams,
  latitude: number,
  longitude: number,
  radius: number,
  countryCode: string | undefined,
  page: number,
) {
  const match = ftsMatch(params.q);
  const matchJoin = match ? searchMatchJoin("l", "location") : "";
  const filteredParams: DirectoryParams = { ...params, country: countryCode, locality: undefined };
  const { clause, values } = locationWhere(filteredParams, { includeText: !match });
  const where = clause ? [clause.replace(/^\s*WHERE\s+/i, "")] : [];
  const queryValues = match ? searchMatchValues(match, values) : [...values];
  const box = radiusBox(latitude, longitude, radius);
  where.push("COALESCE(l.is_virtual, false) = false");
  where.push("l.latitude IS NOT NULL AND l.longitude IS NOT NULL");
  where.push("l.latitude BETWEEN ? AND ?");
  queryValues.push(box.minLat, box.maxLat);
  where.push("l.longitude BETWEEN ? AND ?");
  queryValues.push(box.minLng, box.maxLng);
  where.push(`${distanceMilesExpression()} <= ?`);
  queryValues.push(latitude, latitude, longitude, radius);
  return locationPayloadFromWhere({
    latitude,
    longitude,
    matchJoin,
    where,
    values: queryValues,
    page,
    preferTreatmentRating: Boolean(params.treatment_ids?.length),
  });
}

async function fallbackLocationPayload(
  latitude: number,
  longitude: number,
  page: number,
  options: { mode: Exclude<RadiusSearchMode, "exact_radius" | "expanded_radius" | "empty">; countryCode?: string; radius?: number; preferTreatmentRating?: boolean },
) {
  const where = [
    activeEntityCondition("l"),
    "COALESCE(l.is_virtual, false) = false",
    "l.latitude IS NOT NULL AND l.longitude IS NOT NULL",
  ];
  const values: unknown[] = [];
  if (options.countryCode) {
    where.push("l.country_code = ?");
    values.push(options.countryCode);
  }
  if (options.radius) {
    const box = radiusBox(latitude, longitude, options.radius);
    where.push("l.latitude BETWEEN ? AND ?");
    values.push(box.minLat, box.maxLat);
    where.push("l.longitude BETWEEN ? AND ?");
    values.push(box.minLng, box.maxLng);
    where.push(`${distanceMilesExpression()} <= ?`);
    values.push(latitude, latitude, longitude, options.radius);
  }
  return locationPayloadFromWhere({
    latitude,
    longitude,
    matchJoin: "",
    where,
    values,
    page,
    preferTreatmentRating: options.preferTreatmentRating,
  });
}

async function locationPayloadFromWhere({
  latitude,
  longitude,
  matchJoin,
  where,
  values,
  page,
  preferTreatmentRating = false,
}: {
  latitude: number;
  longitude: number;
  matchJoin: string;
  where: string[];
  values: unknown[];
  page: number;
  preferTreatmentRating?: boolean;
}) {
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (await row<{ count: number }>(
    `SELECT COUNT(*) AS count FROM locations l${matchJoin} ${clause}`,
    values,
  ))?.count || 0;
  const distanceSql = distanceMilesExpression();
  const results = await rows<AnyRow>(
    `
    SELECT l.id, ${locationSlugSelect("l")} AS slug, l.name, l.locality, l.region, l.country_code, l.country_name, l.latitude, l.longitude,
           l.website, google_reviews.rating, google_reviews.review_count, org.canonical_name AS org_name,
           (${distanceSql}) AS distance_miles,
           (
             SELECT MIN(o.price_amount)
             FROM offerings o
             WHERE o.location_id = l.id AND ${comparableOfferingPriceCondition("o")} AND ${activeOfferingCondition("o")}
           ) AS min_price_amount,
           (
             SELECT o.price_currency
             FROM offerings o
             WHERE o.location_id = l.id AND ${comparableOfferingPriceCondition("o")} AND ${activeOfferingCondition("o")}
             ORDER BY o.price_amount ASC
             LIMIT 1
           ) AS min_price_currency
    FROM locations l
    LEFT JOIN organizations org ON org.id = l.org_id
    ${googleReviewMatchJoin()}
    ${locationDirectoryRankingJoins()}
    ${matchJoin}
    ${clause}
    ORDER BY ${preferTreatmentRating ? treatmentRatingOrder() : `${locationDirectoryCompletenessRank()} ASC, distance_miles ASC, (google_reviews.rating IS NULL), google_reviews.rating DESC, (google_reviews.review_count IS NULL), google_reviews.review_count DESC`},
      ${orderNoCase("l.name")}
    LIMIT ? OFFSET ?
  `,
    [latitude, latitude, longitude, ...values, PAGE_SIZE, page * PAGE_SIZE],
  );
  return { results, total, page, page_size: PAGE_SIZE };
}

function treatmentRatingOrder() {
  return `(google_reviews.rating IS NULL), google_reviews.rating DESC, (google_reviews.review_count IS NULL), google_reviews.review_count DESC, ${locationDirectoryCompletenessRank()} ASC`;
}

function emptyLocationPayload(page: number, searchedCity: string | null, searchedCountry: string | null) {
  return {
    results: [],
    total: 0,
    page,
    page_size: PAGE_SIZE,
    mode: "empty" as const,
    effective_radius: null,
    searched_city: searchedCity,
    searched_country: searchedCountry,
  };
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
  const lookup = locationEntityLookup("l", ref);
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
    SELECT
           CASE
             WHEN translation.review_status IN ('auto_approved', 'human_approved')
               THEN translation.english_text
             ELSE o.raw_name
           END AS raw_name,
           o.price_amount, o.price_max_amount, o.price_currency,
           o.price_type, o.price_unit, o.price_context, o.price_audience,
           o.duration_minutes, o.description,
           t.canonical_name AS treatment, t.category AS domain
    FROM offerings o
    LEFT JOIN treatments t ON t.id = o.treatment_id
    LEFT JOIN offering_term_translations translation ON translation.source_text = o.raw_name
    WHERE o.location_id = ?
      AND ${activeOfferingCondition("o")}
      AND NOT EXISTS (
        SELECT 1
        FROM offering_display_suppressions suppression
        WHERE suppression.offering_id = o.id
          AND suppression.active
      )
    ORDER BY (o.price_amount IS NULL), o.id
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
  location.other_locations = await getOtherOrganizationLocations(location);
  location.clinician_license_verification = (await locationClinicianLicenseVerificationMap([id])).get(id) || null;
  const locationImages = await rows<{
    blob_url: string | null;
    alt: string | null;
    image_kind: string | null;
  }>(
    `
    SELECT blob_url, alt, image_kind
    FROM images
    WHERE entity_type = 'location' AND entity_id = ?
      AND ${activeImageCondition("images")}
      AND blob_url IS NOT NULL
      AND blob_url != ''
    ORDER BY (image_kind = 'logo') DESC, updated_at DESC NULLS LAST, id DESC
    LIMIT 8
  `,
    [id],
  );
  location.images = locationImages.filter((image) => usableImageSource(image));
  return location;
}

async function getOtherOrganizationLocations(location: AnyRow) {
  const orgId = location.org_id as number | null | undefined;
  const locationId = location.id as number;
  if (!orgId) {
    return [];
  }

  const siblings = await rows<AnyRow>(
    `
    SELECT sibling.id,
           ${locationSlugSelect("sibling")} AS slug,
           sibling.name,
           sibling.locality,
           sibling.region,
           sibling.country_code,
           sibling.country_name,
           sibling.latitude,
           sibling.longitude,
           sibling_google_reviews.rating,
           sibling_google_reviews.review_count,
           org.canonical_name AS org_name,
           CASE
             WHEN current_location.latitude BETWEEN -90 AND 90
              AND current_location.longitude BETWEEN -180 AND 180
              AND sibling.latitude BETWEEN -90 AND 90
              AND sibling.longitude BETWEEN -180 AND 180
             THEN 3958.7613 * 2 * asin(
               sqrt(
                 power(sin(radians((sibling.latitude - current_location.latitude) / 2)), 2)
                 + cos(radians(current_location.latitude)) * cos(radians(sibling.latitude))
                 * power(sin(radians((sibling.longitude - current_location.longitude) / 2)), 2)
               )
             )
             ELSE NULL
           END AS distance_miles,
           (
             SELECT MIN(o.price_amount)
             FROM offerings o
             WHERE o.location_id = sibling.id
               AND ${comparableOfferingPriceCondition("o")}
               AND ${activeOfferingCondition("o")}
           ) AS min_price_amount,
           (
             SELECT o.price_currency
             FROM offerings o
             WHERE o.location_id = sibling.id
               AND ${comparableOfferingPriceCondition("o")}
               AND ${activeOfferingCondition("o")}
             ORDER BY o.price_amount ASC
             LIMIT 1
           ) AS min_price_currency
    FROM locations sibling
    JOIN locations current_location ON current_location.id = ?
    LEFT JOIN organizations org ON org.id = sibling.org_id
    ${googleReviewMatchJoin("sibling_google_reviews", "sibling")}
    WHERE sibling.org_id = current_location.org_id
      AND sibling.id <> current_location.id
      AND ${activeEntityCondition("sibling")}
    ORDER BY
      distance_miles ASC NULLS LAST,
      CASE
        WHEN sibling.country_code = current_location.country_code
         AND NULLIF(TRIM(sibling.locality), '') IS NOT NULL
         AND ${trimLower("sibling.locality")} = ${trimLower("current_location.locality")}
          THEN 0
        WHEN sibling.country_code = current_location.country_code
         AND NULLIF(TRIM(sibling.region), '') IS NOT NULL
         AND ${trimLower("sibling.region")} = ${trimLower("current_location.region")}
          THEN 1
        WHEN sibling.country_code = current_location.country_code THEN 2
        ELSE 3
      END,
      (sibling_google_reviews.review_count IS NULL),
      sibling_google_reviews.review_count DESC,
      (sibling_google_reviews.rating IS NULL),
      sibling_google_reviews.rating DESC,
      ${orderNoCase("sibling.locality")},
      ${orderNoCase("sibling.name")}
    LIMIT 12
  `,
    [locationId],
  );

  await hydrateLocationRows(siblings);
  return siblings;
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
    city_label: normalizedLocationText(searchParams.get("city_label")),
    city_country: normalizedCountryCode(searchParams.get("city_country")),
    place_type: searchParams.get("place_type") === "country" ? "country" : undefined,
    city_lat: parseFiniteNumber(searchParams.get("city_lat")),
    city_lng: parseFiniteNumber(searchParams.get("city_lng")),
    map_north: boundedCoordinate(searchParams.get("map_north"), -90, 90),
    map_south: boundedCoordinate(searchParams.get("map_south"), -90, 90),
    map_east: boundedCoordinate(searchParams.get("map_east"), -180, 180),
    map_west: boundedCoordinate(searchParams.get("map_west"), -180, 180),
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

function boundedCoordinate(raw: string | null, min: number, max: number) {
  const value = parseFiniteNumber(raw);
  return value !== undefined && value >= min && value <= max ? value : undefined;
}
