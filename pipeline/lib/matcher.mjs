const EARTH_RADIUS_METERS = 6_371_000;
const AUTO_GEO_RADIUS_METERS = 100;
const NAME_GEO_RADIUS_METERS = 150;
const NAME_GEO_SIMILARITY_THRESHOLD = 0.85;
const GEO_AMBIGUITY_METERS = 5;

// Keep this as a frozen array rather than an exported Set: Object.freeze(new Set())
// does not prevent callers from mutating it with .add(). Matching is performed against
// the private Set below after hosts are collapsed to registrable domains.
export const GENERIC_DOMAINS = Object.freeze([
  "acuityscheduling.com",
  "apple.com",
  "as.me",
  "bit.ly",
  "bookimed.com",
  "booksy.com",
  "calendly.com",
  "clientsecure.me",
  "doctoralia.com",
  "doctoralia.com.br",
  "doctoralia.com.mx",
  "europepmc.org",
  "facebook.com",
  "fresha.com",
  "g.page",
  "glossgenius.com",
  "gofundme.com",
  "goo.gl",
  "google.com",
  "health-tourism.com",
  "hyperbaric.app",
  "instagram.com",
  "lin.ee",
  "linkedin.com",
  "linktr.ee",
  "maps.app.goo.gl",
  "maps.google.com",
  "mapquest.com",
  "mindbody.io",
  "mindbodyonline.com",
  "mymeditravel.com",
  "myshopify.com",
  "onbuildhealth.com",
  "opencare.com",
  "patientnow.com",
  "placidway.com",
  "realself.com",
  "rymaps.xyz",
  "square.site",
  "squarespace.com",
  "tiktok.com",
  "twitter.com",
  "us-uk.bookimed.com",
  "vagaro.com",
  "wa.me",
  "webflow.io",
  "weence.com",
  "wixsite.com",
  "x.com",
  "yandex.com",
  "yandex.ru",
  "yelp.com",
  "youtu.be",
  "youtube.com",
  "zenoti.com",
  "zoca.com",
  "zocdoc.com",
]);

const GENERIC_DOMAIN_SET = new Set(GENERIC_DOMAINS);
const REVIEW_ONLY_DOMAINS = new Set(["flt.life"]);

const COMMON_MULTI_LABEL_SUFFIXES = new Set([
  "ac.uk",
  "co.il",
  "co.in",
  "co.jp",
  "co.kr",
  "co.nz",
  "co.th",
  "co.uk",
  "co.za",
  "com.au",
  "com.br",
  "com.cn",
  "com.co",
  "com.hk",
  "com.mx",
  "com.my",
  "com.ph",
  "com.sg",
  "com.tr",
  "com.tw",
  "com.ua",
  "gov.uk",
  "net.au",
  "or.th",
  "org.au",
  "org.uk",
]);

// Common registry labels used below country-code TLDs. This covers unlisted
// variants such as co.id without misclassifying ordinary subdomains such as
// appointments.example.de as separate registrable identities.
const COMMON_CC_SECOND_LEVEL_LABELS = new Set([
  "ac",
  "asn",
  "asso",
  "biz",
  "co",
  "com",
  "edu",
  "firm",
  "gen",
  "go",
  "gob",
  "gov",
  "id",
  "ind",
  "info",
  "lg",
  "med",
  "mil",
  "ne",
  "net",
  "nic",
  "nom",
  "or",
  "org",
  "per",
  "plc",
  "pro",
  "res",
  "sch",
  "web",
]);

const INSIGNIFICANT_NAME_TOKENS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "care",
  "center",
  "centers",
  "centre",
  "centres",
  "clinic",
  "clinics",
  "doctor",
  "doctors",
  "dr",
  "for",
  "from",
  "group",
  "health",
  "hospital",
  "hospitals",
  "hbot",
  "hyperbaric",
  "hyperbarics",
  "in",
  "inc",
  "limited",
  "llc",
  "ltd",
  "md",
  "medical",
  "medicine",
  "of",
  "on",
  "oxygen",
  "pa",
  "pc",
  "pllc",
  "service",
  "services",
  "spa",
  "the",
  "therapies",
  "therapy",
  "to",
  "treatment",
  "treatments",
  "wellness",
  "with",
  "wound",
]);

/**
 * Canonical identity-name normalization used by every name-based matcher.
 *
 * It folds case/diacritics, treats "&" as "and", preserves non-Latin letters,
 * and collapses punctuation/whitespace. It deliberately does not strip legal or
 * clinical words: historical ingestion did, while organization/Bookimed writers
 * did not, and preserving identity-bearing input is the safer common contract.
 */
export function normalizeName(value) {
  return normalizeHumanText(value, { ampersandAsAnd: true });
}

export function normalizeLocality(value) {
  return normalizeHumanText(value, { ampersandAsAnd: false });
}

export function normalizeCountryCode(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
}

export function normalizeWebsiteDomain(value) {
  return parseWebsite(value)?.registrableDomain ?? "";
}

export function isGenericDomain(value) {
  const website = parseWebsite(value);
  const domain = website?.registrableDomain || String(value ?? "").trim().toLowerCase();
  const host = website?.host || domain;
  if (!domain) return false;
  return GENERIC_DOMAIN_SET.has(domain)
    || GENERIC_DOMAIN_SET.has(host)
    || /(^|\.)google\.[a-z.]+$/u.test(host)
    || /(^|\.)yandex\.[a-z.]+$/u.test(host);
}

export function locationSlugBase(name, orgName, locality) {
  const nameSlug = slugifyListingText(firstNonEmpty(name, orgName, "location")) || "location";
  const localitySlug = slugifyListingText(locality);
  if (!localitySlug || nameSlug.includes(localitySlug)) return nameSlug;
  return `${nameSlug}-${localitySlug}`;
}

export function haversineMeters(latA, lngA, latB, lngB) {
  const first = normalizeCoordinatePair(latA, lngA);
  const second = normalizeCoordinatePair(latB, lngB);
  if (!first || !second) return null;

  const lat1 = degreesToRadians(first.lat);
  const lat2 = degreesToRadians(second.lat);
  const deltaLat = degreesToRadians(second.lat - first.lat);
  const deltaLng = degreesToRadians(second.lng - first.lng);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const boundedHaversine = Math.min(1, Math.max(0, haversine));
  return EARTH_RADIUS_METERS * 2
    * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
}

// PostgreSQL pg_trgm's similarity is the Jaccard similarity of unique padded
// word trigrams. Inputs are normalized here so every name signal shares one
// canonical name representation.
export function trigramSimilarity(left, right) {
  const leftTrigrams = wordTrigrams(normalizeName(left));
  const rightTrigrams = wordTrigrams(normalizeName(right));
  if (leftTrigrams.size === 0 || rightTrigrams.size === 0) return 0;

  let intersection = 0;
  for (const trigram of leftTrigrams) {
    if (rightTrigrams.has(trigram)) intersection += 1;
  }
  const union = leftTrigrams.size + rightTrigrams.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Deterministic, pure candidate scorer. No database or environment access occurs
 * here; regression fixtures can pass their complete candidate corpus directly.
 */
export function scoreLocationCandidates(input, candidates = []) {
  const incoming = prepareRecord(input, { input: true });
  const preparedCandidates = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => prepareRecord(candidate))
    .filter((candidate) => candidate.id > 0 && candidate.active)
    .map((candidate) => enrichCandidate(incoming, candidate))
    .sort(compareCandidateIds);

  if (preparedCandidates.length === 0) return { status: "none" };

  const websiteCandidates = preparedCandidates.filter((candidate) => (
    incoming.matchableDomain
      && candidate.matchableDomain === incoming.matchableDomain
      && incoming.normalizedLocality
      && candidate.normalizedLocality === incoming.normalizedLocality
  ));
  if (websiteCandidates.length > 0) {
    return resolveWebsiteDomainLocality(incoming, websiteCandidates, preparedCandidates.length);
  }

  const nameCandidates = preparedCandidates.filter((candidate) => (
    incoming.normalizedName
      && candidate.normalizedName === incoming.normalizedName
      && incoming.normalizedLocality
      && candidate.normalizedLocality === incoming.normalizedLocality
      && incoming.countryCode
      && candidate.countryCode === incoming.countryCode
  ));
  if (nameCandidates.length > 0) {
    return resolveNameLocalityCountry(incoming, nameCandidates, preparedCandidates.length);
  }

  if (incoming.coordinates) {
    const nearby = preparedCandidates
      .filter((candidate) => isWithinRadius(candidate.distanceMeters, AUTO_GEO_RADIUS_METERS))
      .sort(compareGeoCandidates);
    if (nearby.length > 0) {
      return resolveLatLng(incoming, nearby, preparedCandidates.length);
    }
  }

  const nameGeoCandidates = preparedCandidates
    .filter((candidate) => (
      isWithinRadius(candidate.distanceMeters, NAME_GEO_RADIUS_METERS)
        && candidate.countryCode === incoming.countryCode
        && incoming.normalizedName
        && candidate.normalizedName
        && candidate.nameSimilarity >= NAME_GEO_SIMILARITY_THRESHOLD
    ))
    .sort(compareNameGeoCandidates);
  if (nameGeoCandidates.length > 0) {
    const candidate = nameGeoCandidates[0];
    return reviewResult({
      candidate,
      method: "name_geo",
      confidence: candidate.nameSimilarity,
      guardrail: nameGeoCandidates.length > 1
        && nearlyEqual(candidate.nameSimilarity, nameGeoCandidates[1].nameSimilarity, 0.01)
        ? "ambiguous_name_geo_candidates"
        : "name_geo_review_only",
      incoming,
      poolSize: preparedCandidates.length,
      extraEvidence: nameGeoCandidates.length > 1
        ? { candidate_ids: nameGeoCandidates.map(({ id }) => id) }
        : {},
    });
  }

  const slugCandidates = preparedCandidates.filter((candidate) => candidate.slugCollision);
  if (slugCandidates.length > 0) {
    const candidate = slugCandidates[0];
    return reviewResult({
      candidate,
      method: "slug_collision",
      confidence: 0.65,
      guardrail: slugCandidates.length > 1 ? "ambiguous_slug_collision" : "slug_collision_only",
      incoming,
      poolSize: preparedCandidates.length,
      extraEvidence: slugCandidates.length > 1
        ? { candidate_ids: slugCandidates.map(({ id }) => id) }
        : {},
    });
  }

  return { status: "none" };
}

/**
 * Read-only database adapter. `options.query` may be injected for tests; otherwise
 * the pipeline DB module is loaded lazily so importing the pure scorer has no DB
 * or environment side effects.
 */
export async function matchLocation(input, options = {}) {
  const incoming = prepareRecord(input, { input: true });
  if (!hasCandidateLookupSignal(incoming)) return { status: "none" };

  const queryFn = resolveQueryFunction(options);
  const params = [
    incoming.matchableDomain,
    incoming.name,
    incoming.locality,
    incoming.countryCode,
    incoming.coordinates?.lat ?? null,
    incoming.coordinates?.lng ?? null,
    Boolean(incoming.coordinates),
    incoming.expectedSlugBase,
    slugLookupBase(incoming.explicitSlug, incoming.expectedSlugBase),
  ];
  const result = await queryFn(CANDIDATE_QUERY, params);
  const rows = Array.isArray(result) ? result : result?.rows ?? [];
  return scoreLocationCandidates(input, rows);
}

// This query is intentionally a read-only superset: domain text, canonically
// normalized locality/name, wrapped 150m geo, and both computed/explicit slug
// bases can each admit a row. All identity decisions remain in the pure scorer.
const CANDIDATE_QUERY = `
  SELECT
    l.id,
    l.name,
    l.website,
    l.latitude,
    l.longitude,
    l.locality,
    l.country_code,
    l.slug,
    l.status,
    l.deleted_at,
    o.canonical_name AS org_canonical_name,
    o.website_domain AS org_website_domain
  FROM fountain.locations l
  LEFT JOIN fountain.organizations o ON o.id = l.org_id AND o.deleted_at IS NULL
  WHERE l.deleted_at IS NULL
    AND l.status = 'active'
    AND (
      (
        $1::text <> ''
        AND (
          lower(coalesce(l.website, '')) LIKE '%' || $1::text || '%'
          OR lower(coalesce(o.website_domain, '')) LIKE '%' || $1::text || '%'
        )
      )
      OR (
        $3::text <> ''
        AND lower(btrim(regexp_replace(fountain.unaccent(l.locality), '[^[:alnum:]]+', ' ', 'g')))
          = lower(btrim(regexp_replace(fountain.unaccent($3::text), '[^[:alnum:]]+', ' ', 'g')))
      )
      OR (
        $2::text <> ''
        AND $3::text <> ''
        AND $4::text <> ''
        AND lower(btrim(regexp_replace(replace(fountain.unaccent(l.name), '&', ' and '), '[^[:alnum:]]+', ' ', 'g')))
          = lower(btrim(regexp_replace(replace(fountain.unaccent($2::text), '&', ' and '), '[^[:alnum:]]+', ' ', 'g')))
        AND lower(btrim(regexp_replace(fountain.unaccent(l.locality), '[^[:alnum:]]+', ' ', 'g')))
          = lower(btrim(regexp_replace(fountain.unaccent($3::text), '[^[:alnum:]]+', ' ', 'g')))
        AND upper(btrim(l.country_code)) = $4::text
      )
      OR (
        $7::boolean
        AND l.latitude IS NOT NULL
        AND l.longitude IS NOT NULL
        AND l.latitude BETWEEN $5::double precision - (150.0 / 111320.0)
                           AND $5::double precision + (150.0 / 111320.0)
        AND least(
          abs(l.longitude - $6::double precision),
          360.0 - abs(l.longitude - $6::double precision)
        ) <= least(180.0, 150.0 / (111320.0 * greatest(abs(cos(radians($5::double precision))), 0.000001)))
      )
      OR (
        $8::text <> ''
        AND (l.slug = $8::text OR l.slug LIKE $8::text || '-%')
      )
      OR (
        $9::text <> ''
        AND (l.slug = $9::text OR l.slug LIKE $9::text || '-%')
      )
    )
  ORDER BY
    CASE
      WHEN $8::text <> '' AND (l.slug = $8::text OR l.slug LIKE $8::text || '-%') THEN 0
      WHEN $9::text <> '' AND (l.slug = $9::text OR l.slug LIKE $9::text || '-%') THEN 0
      WHEN $1::text <> '' AND (
        lower(coalesce(l.website, '')) LIKE '%' || $1::text || '%'
        OR lower(coalesce(o.website_domain, '')) LIKE '%' || $1::text || '%'
      ) THEN 1
      ELSE 2
    END,
    l.id
`;

function resolveWebsiteDomainLocality(incoming, candidates, poolSize) {
  const ranked = [...candidates].sort(compareIdentityCandidates);
  if (ranked.length > 1) {
    return reviewResult({
      candidate: ranked[0],
      method: "website_domain_locality",
      confidence: 0.8,
      guardrail: "ambiguous_candidates",
      incoming,
      poolSize,
      extraEvidence: { candidate_ids: ranked.map(({ id }) => id) },
    });
  }

  const candidate = ranked[0];
  if (REVIEW_ONLY_DOMAINS.has(incoming.matchableDomain)) {
    return reviewResult({
      candidate,
      method: "website_domain_locality",
      confidence: 0.7,
      guardrail: "mixed_brand_domain",
      incoming,
      poolSize,
    });
  }
  if (hasCountryConflict(incoming, candidate)) {
    return reviewResult({
      candidate,
      method: "website_domain_locality",
      confidence: 0.65,
      guardrail: "country_conflict",
      incoming,
      poolSize,
    });
  }
  if (hasBranchPathConflict(incoming, candidate)) {
    return reviewResult({
      candidate,
      method: "website_domain_locality",
      confidence: 0.7,
      guardrail: "same_domain_locality_branch_risk",
      incoming,
      poolSize,
    });
  }
  if (hasConflictingNames(incoming, candidate)) {
    return reviewResult({
      candidate,
      method: "website_domain_locality",
      confidence: 0.7,
      guardrail: "same_domain_locality_conflicting_identity",
      incoming,
      poolSize,
    });
  }

  const confidence = clampConfidence(0.96
    + (candidate.exactName ? 0.02 : 0)
    + (isWithinRadius(candidate.distanceMeters, AUTO_GEO_RADIUS_METERS) ? 0.01 : 0));
  return matchedResult({ candidate, method: "website_domain_locality", confidence, incoming, poolSize });
}

function resolveNameLocalityCountry(incoming, candidates, poolSize) {
  const ranked = [...candidates].sort(compareIdentityCandidates);
  if (ranked.length > 1) {
    return reviewResult({
      candidate: ranked[0],
      method: "name_locality_country",
      confidence: 0.78,
      guardrail: "ambiguous_candidates",
      incoming,
      poolSize,
      extraEvidence: { candidate_ids: ranked.map(({ id }) => id) },
    });
  }

  const candidate = ranked[0];
  const confidence = clampConfidence(0.93
    + (isWithinRadius(candidate.distanceMeters, AUTO_GEO_RADIUS_METERS) ? 0.03 : 0)
    + (candidate.domainMatch ? 0.02 : 0));
  return matchedResult({ candidate, method: "name_locality_country", confidence, incoming, poolSize });
}

function resolveLatLng(incoming, nearby, poolSize) {
  const qualified = nearby.filter((candidate) => candidate.meaningfulSharedTokens.length > 0 || candidate.domainMatch);
  if (qualified.length === 0) {
    const candidate = nearby[0];
    return reviewResult({
      candidate,
      method: "lat_lng_100m",
      confidence: 0.35,
      guardrail: "insufficient_geo_identity",
      incoming,
      poolSize,
    });
  }

  const candidate = qualified[0];
  if (qualified.length > 1
      && Math.abs(candidate.distanceMeters - qualified[1].distanceMeters) <= GEO_AMBIGUITY_METERS) {
    return reviewResult({
      candidate,
      method: "lat_lng_100m",
      confidence: 0.72,
      guardrail: "ambiguous_candidates",
      incoming,
      poolSize,
      extraEvidence: { candidate_ids: qualified.map(({ id }) => id) },
    });
  }
  if (hasCountryConflict(incoming, candidate)) {
    return reviewResult({
      candidate,
      method: "lat_lng_100m",
      confidence: 0.65,
      guardrail: "country_conflict",
      incoming,
      poolSize,
    });
  }
  if (candidate.domainMatch && hasBranchPathConflict(incoming, candidate)) {
    return reviewResult({
      candidate,
      method: "lat_lng_100m",
      confidence: 0.68,
      guardrail: "same_domain_branch_risk",
      incoming,
      poolSize,
    });
  }
  if (candidate.domainMatch && hasConflictingNames(incoming, candidate)) {
    return reviewResult({
      candidate,
      method: "lat_lng_100m",
      confidence: 0.68,
      guardrail: "same_domain_conflicting_identity",
      incoming,
      poolSize,
    });
  }

  const confidence = clampConfidence(0.84
    + (candidate.domainMatch ? 0.07 : 0)
    + (candidate.exactName ? 0.04 : 0)
    + Math.min(0.03, candidate.meaningfulSharedTokens.length * 0.01));
  return matchedResult({ candidate, method: "lat_lng_100m", confidence, incoming, poolSize });
}

function matchedResult({ candidate, method, confidence, incoming, poolSize }) {
  return {
    status: "matched",
    location_id: candidate.id,
    method,
    confidence: clampConfidence(confidence),
    guardrail: null,
    evidence: buildEvidence(incoming, candidate, poolSize),
  };
}

function reviewResult({
  candidate,
  method,
  confidence,
  guardrail,
  incoming,
  poolSize,
  extraEvidence = {},
}) {
  return {
    status: "review",
    candidate_location_id: candidate.id,
    method,
    confidence: clampConfidence(confidence),
    guardrail,
    evidence: {
      ...buildEvidence(incoming, candidate, poolSize),
      ...extraEvidence,
    },
  };
}

function buildEvidence(incoming, candidate, poolSize) {
  return compactObject({
    candidate_pool_size: poolSize,
    normalized_name: incoming.normalizedName,
    candidate_normalized_name: candidate.normalizedName,
    normalized_locality: incoming.normalizedLocality,
    candidate_normalized_locality: candidate.normalizedLocality,
    country_code: incoming.countryCode,
    candidate_country_code: candidate.countryCode,
    website_domain: incoming.domain,
    candidate_website_domain: candidate.domain,
    website_domain_matchable: Boolean(incoming.matchableDomain),
    candidate_website_domain_matchable: Boolean(candidate.matchableDomain),
    website_path: incoming.websitePath,
    candidate_website_path: candidate.websitePath,
    exact_name: candidate.exactName,
    domain_match: candidate.domainMatch,
    meaningful_shared_name_tokens: candidate.meaningfulSharedTokens,
    distance_meters: roundNumber(candidate.distanceMeters, 2),
    name_similarity: roundNumber(candidate.nameSimilarity, 6),
    slug_collision: candidate.slugCollision || undefined,
  });
}

function prepareRecord(record = {}, { input = false } = {}) {
  const name = String(record?.name ?? "").trim();
  const locality = String(record?.locality ?? "").trim();
  const locationWebsite = parseWebsite(record?.website);
  const organizationWebsite = input
    ? null
    : parseWebsite(firstNonEmpty(record?.org_website_domain, record?.website_domain));
  // Historical ingestion preferred a parseable location URL and used the
  // organization domain only when that URL could not be parsed. A parseable
  // generic location URL therefore remains authoritative (and unmatchable).
  const website = locationWebsite || organizationWebsite;
  const domain = website?.registrableDomain ?? "";
  const coordinates = normalizeCoordinatePair(
    record?.lat ?? record?.latitude,
    record?.lng ?? record?.longitude,
  );
  const slugIdentityName = firstNonEmpty(name, record?.org_canonical_name);
  const expectedSlugBase = slugIdentityName
    ? locationSlugBase(name, record?.org_canonical_name, locality)
    : "";
  const explicitSlug = slugifyListingText(record?.slug);

  return {
    id: input ? 0 : normalizeLocationId(record?.id ?? record?.location_id),
    active: input || isActiveCandidate(record),
    name,
    normalizedName: normalizeName(name),
    locality,
    normalizedLocality: normalizeLocality(locality),
    countryCode: normalizeCountryCode(record?.country_code),
    coordinates,
    domain,
    matchableDomain: domain && !isGenericDomain(domain) ? domain : "",
    websiteHost: website?.host ?? "",
    websitePath: website?.path ?? "",
    expectedSlugBase,
    explicitSlug,
    slug: input ? explicitSlug : slugifyListingText(record?.slug),
    raw: record,
  };
}

function enrichCandidate(incoming, candidate) {
  const distanceMeters = incoming.coordinates && candidate.coordinates
    ? haversineMeters(
      incoming.coordinates.lat,
      incoming.coordinates.lng,
      candidate.coordinates.lat,
      candidate.coordinates.lng,
    )
    : null;
  const meaningfulSharedTokens = sharedMeaningfulNameTokens(
    incoming.normalizedName,
    candidate.normalizedName,
    [incoming.normalizedLocality, candidate.normalizedLocality, incoming.countryCode, candidate.countryCode],
  );
  const candidateFieldSlugBase = locationSlugBase(
    candidate.name,
    candidate.raw?.org_canonical_name,
    candidate.locality,
  );
  const slugCollision = detectSlugCollision(incoming, candidate, candidateFieldSlugBase);

  return {
    ...candidate,
    distanceMeters,
    exactName: Boolean(incoming.normalizedName && incoming.normalizedName === candidate.normalizedName),
    domainMatch: Boolean(incoming.matchableDomain && incoming.matchableDomain === candidate.matchableDomain),
    meaningfulSharedTokens,
    nameSimilarity: trigramSimilarity(incoming.normalizedName, candidate.normalizedName),
    slugCollision,
  };
}

function parseWebsite(value, depth = 0) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let parsed;
  try {
    if (depth === 0 && /^\/url(?:[/?]|$)/iu.test(raw)) {
      parsed = new URL(raw, "https://google.com");
    } else {
      parsed = new URL(/^[a-z][a-z0-9+.-]*:/iu.test(raw) ? raw : `https://${raw}`);
    }
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;

  let host = parsed.hostname.toLowerCase().replace(/\.$/u, "").replace(/^www\d*\./u, "");
  if (!host || host === "localhost" || isIpAddress(host) || !host.includes(".")) return null;

  if (depth === 0 && isGoogleHost(host) && parsed.pathname.replace(/\/+$/u, "") === "/url") {
    const target = parsed.searchParams.get("q") || parsed.searchParams.get("url");
    if (target) return parseWebsite(target, depth + 1);
  }

  const registrableDomain = registrableDomainFromHost(host);
  if (!registrableDomain) return null;
  const normalizedPath = parsed.pathname.replace(/\/{2,}/gu, "/").replace(/\/+$/u, "");
  const pathWithQuery = `${normalizedPath || (parsed.search ? "/" : "")}${parsed.search}`;
  return {
    host,
    registrableDomain,
    path: pathWithQuery === "/" ? "" : pathWithQuery.toLowerCase(),
  };
}

function registrableDomainFromHost(host) {
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return "";
  const lastTwo = labels.slice(-2).join(".");
  if (COMMON_MULTI_LABEL_SUFFIXES.has(lastTwo)) {
    return labels.length >= 3 ? labels.slice(-3).join(".") : "";
  }
  // Cover conventional but unlisted ccTLD registry structures (for example
  // co.id) without treating every ordinary ccTLD subdomain as registrable.
  if (labels.at(-1).length === 2
      && COMMON_CC_SECOND_LEVEL_LABELS.has(labels.at(-2))
      && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }
  return lastTwo;
}

function normalizeHumanText(value, { ampersandAsAnd }) {
  let text = String(value ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
  text = text
    .replace(/ł/gu, "l")
    .replace(/ø/gu, "o")
    .replace(/đ/gu, "d")
    .replace(/ð/gu, "d")
    .replace(/þ/gu, "th")
    .replace(/æ/gu, "ae")
    .replace(/œ/gu, "oe")
    .replace(/ß/gu, "ss")
    .replace(/ı/gu, "i");
  text = ampersandAsAnd ? text.replace(/&/gu, " and ") : text.replace(/&/gu, " ");
  return text.replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");
}

function slugifyListingText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function normalizeCoordinatePair(latValue, lngValue) {
  const lat = finiteNumber(latValue);
  const lng = finiteNumber(lngValue);
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLocationId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function isActiveCandidate(record) {
  if (record?.deleted_at) return false;
  const status = String(record?.status ?? "active").trim().toLowerCase();
  return status === "active";
}

function sharedMeaningfulNameTokens(left, right, excludedValues = []) {
  if (!left || !right) return [];
  const excludedTokens = new Set(
    excludedValues
      .flatMap((value) => normalizeHumanText(value, { ampersandAsAnd: false }).split(" "))
      .filter(Boolean),
  );
  const leftTokens = new Set(significantNameTokens(left).filter((token) => !excludedTokens.has(token)));
  return [...new Set(
    significantNameTokens(right).filter((token) => leftTokens.has(token) && !excludedTokens.has(token)),
  )].sort();
}

function significantNameTokens(normalizedName) {
  return normalizedName
    .split(" ")
    .filter((token) => token.length >= 3 && !INSIGNIFICANT_NAME_TOKENS.has(token));
}

function wordTrigrams(normalized) {
  const trigrams = new Set();
  for (const word of normalized.split(" ").filter(Boolean)) {
    const padded = `  ${word} `;
    for (let index = 0; index <= padded.length - 3; index += 1) {
      trigrams.add(padded.slice(index, index + 3));
    }
  }
  return trigrams;
}

function hasCountryConflict(incoming, candidate) {
  return Boolean(incoming.countryCode && candidate.countryCode && incoming.countryCode !== candidate.countryCode);
}

function hasBranchPathConflict(incoming, candidate) {
  return Boolean(
    incoming.websitePath
      && candidate.websitePath
      && incoming.websitePath !== candidate.websitePath,
  );
}

function hasConflictingNames(incoming, candidate) {
  return Boolean(
    incoming.normalizedName
      && candidate.normalizedName
      && !candidate.exactName
      && candidate.meaningfulSharedTokens.length === 0,
  );
}

function deriveCollisionBase(slug, fieldBase) {
  if (!slug) return "";
  if (slug === fieldBase) return slug;
  const stripped = stripNumericSlugSuffix(slug);
  return stripped === fieldBase ? stripped : slug;
}

function detectSlugCollision(incoming, candidate, candidateFieldSlugBase) {
  const incomingSlug = incoming.explicitSlug;
  const candidateSlug = candidate.slug;
  if (!candidateSlug) return null;

  const candidateComputedBase = deriveCollisionBase(candidateSlug, candidateFieldSlugBase);
  if (incoming.expectedSlugBase
      && (candidateSlug === incoming.expectedSlugBase || candidateComputedBase === incoming.expectedSlugBase)) {
    return compactObject({
      base: incoming.expectedSlugBase,
      signal: "computed_base",
      incoming_slug: incomingSlug,
      candidate_slug: candidateSlug,
    });
  }
  if (!incomingSlug) return null;
  if (incomingSlug === candidateSlug) {
    return {
      base: incomingSlug,
      signal: "exact_slug",
      incoming_slug: incomingSlug,
      candidate_slug: candidateSlug,
    };
  }

  const incomingSuffixBase = slugLookupBase(incomingSlug, incoming.expectedSlugBase);
  const candidateSuffixBase = slugLookupBase(candidateSlug, candidateFieldSlugBase);
  const suffixPair = (incomingSuffixBase !== incomingSlug && incomingSuffixBase === candidateSlug)
    || (candidateSuffixBase !== candidateSlug && candidateSuffixBase === incomingSlug)
    || (
      incomingSuffixBase !== incomingSlug
      && candidateSuffixBase !== candidateSlug
      && incomingSuffixBase === candidateSuffixBase
    );
  if (!suffixPair) return null;
  return {
    base: incomingSuffixBase === candidateSlug ? incomingSuffixBase : candidateSuffixBase,
    signal: "numeric_suffix_pair",
    incoming_slug: incomingSlug,
    candidate_slug: candidateSlug,
  };
}

function stripNumericSlugSuffix(slug) {
  return String(slug ?? "").replace(/-[0-9]+$/u, "");
}

function slugLookupBase(slug, identityBase) {
  const normalizedSlug = String(slug ?? "");
  if (!normalizedSlug || normalizedSlug === identityBase) return normalizedSlug;
  return stripNumericSlugSuffix(normalizedSlug);
}

function compareCandidateIds(left, right) {
  return left.id - right.id;
}

function compareIdentityCandidates(left, right) {
  if (left.exactName !== right.exactName) return left.exactName ? -1 : 1;
  const leftDistance = left.distanceMeters ?? Number.POSITIVE_INFINITY;
  const rightDistance = right.distanceMeters ?? Number.POSITIVE_INFINITY;
  return leftDistance - rightDistance || left.id - right.id;
}

function compareGeoCandidates(left, right) {
  return left.distanceMeters - right.distanceMeters || left.id - right.id;
}

function compareNameGeoCandidates(left, right) {
  return right.nameSimilarity - left.nameSimilarity
    || left.distanceMeters - right.distanceMeters
    || left.id - right.id;
}

function hasCandidateLookupSignal(incoming) {
  return Boolean(
    (incoming.matchableDomain && incoming.normalizedLocality)
      || (incoming.normalizedName && incoming.normalizedLocality && incoming.countryCode)
      || incoming.coordinates
      || incoming.expectedSlugBase,
  );
}

function resolveQueryFunction(options) {
  if (typeof options?.query === "function") return options.query;
  if (typeof options?.client?.query === "function") return options.client.query.bind(options.client);
  return async (sql, params) => {
    const database = await import("./db.mjs");
    return database.query(sql, params);
  };
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ""));
}

function roundNumber(value, precision) {
  if (!Number.isFinite(value)) return undefined;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clampConfidence(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Math.round(value * 1_000_000) / 1_000_000));
}

function nearlyEqual(left, right, tolerance) {
  return Math.abs(left - right) <= tolerance;
}

function isWithinRadius(distanceMeters, radiusMeters) {
  return Number.isFinite(distanceMeters) && distanceMeters <= radiusMeters + 0.000001;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function isGoogleHost(host) {
  return host === "google.com" || host.endsWith(".google.com") || /^google\.[a-z.]+$/u.test(host);
}

function isIpAddress(host) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) return true;
  return host.includes(":");
}
