const OFFICIAL_COORDINATE_PROVIDER = "official_site_jsonld";

const PLACE_TYPES = new Set([
  "LocalBusiness",
  "MedicalBusiness",
  "MedicalClinic",
  "DiagnosticLab",
  "Hospital",
  "Physician",
  "Dentist",
  "Pharmacy",
  "DaySpa",
  "ExerciseGym",
  "HealthAndBeautyBusiness",
  "HealthClub",
  "SportsActivityLocation",
  "Hotel",
  "Resort",
  "LodgingBusiness",
  "Place",
]);

const ADDRESS_STOPWORDS = new Set([
  "street", "st", "avenue", "ave", "road", "rd", "boulevard", "blvd",
  "drive", "dr", "lane", "ln", "court", "ct", "way", "highway", "hwy",
  "route", "rte", "suite", "ste", "unit", "floor", "fl", "level",
  "building", "bldg", "shop", "room", "office",
  "north", "south", "east", "west", "n", "s", "e", "w",
]);

const COUNTRY_ALIASES = new Map([
  ["ae", "AE"],
  ["uae", "AE"],
  ["united arab emirates", "AE"],
  ["ca", "CA"],
  ["canada", "CA"],
  ["de", "DE"],
  ["germany", "DE"],
  ["es", "ES"],
  ["spain", "ES"],
  ["fr", "FR"],
  ["france", "FR"],
  ["gb", "GB"],
  ["uk", "GB"],
  ["united kingdom", "GB"],
  ["great britain", "GB"],
  ["id", "ID"],
  ["indonesia", "ID"],
  ["mx", "MX"],
  ["mexico", "MX"],
  ["pt", "PT"],
  ["portugal", "PT"],
  ["qa", "QA"],
  ["qatar", "QA"],
  ["sg", "SG"],
  ["singapore", "SG"],
  ["th", "TH"],
  ["thailand", "TH"],
  ["us", "US"],
  ["usa", "US"],
  ["united states", "US"],
  ["united states of america", "US"],
  ["za", "ZA"],
  ["south africa", "ZA"],
]);

/**
 * Extract normalized, coordinate-bearing place objects from JSON-LD in an
 * official page. Malformed or unrelated JSON-LD blocks are ignored.
 */
export function extractOfficialCoordinateObjects(html, { sourceUrl = null } = {}) {
  const objects = [];
  for (const json of jsonLdBlocks(html)) {
    let parsed;
    try {
      parsed = JSON.parse(cleanJsonLd(json));
    } catch {
      continue;
    }
    for (const item of walkJsonLd(parsed)) {
      if (!isCoordinateBearingPlace(item)) continue;
      const coordinates = normalizedCoordinates(item.geo);
      if (!coordinates) continue;
      for (const address of normalizedAddresses(item.address)) {
        objects.push({
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          structured_type: normalizedTypes(item["@type"]),
          structured_name: scalarText(item.name),
          address,
          source_url: httpUrl(sourceUrl),
        });
      }
    }
  }
  return deduplicateExtractedObjects(objects);
}

/**
 * Resolve coordinates from one or more already-fetched official pages.
 *
 * Each page must contain `{ url, html }`. The candidate website and page must
 * have the same normalized hostname. A match is returned only when exact
 * branch-address validation leaves one unique coordinate pair.
 */
export function resolveOfficialPageCoordinates(candidate, pages) {
  const officialHost = hostname(candidate?.website);
  const evidence = [];
  let pagesRejectedForHost = 0;

  for (const page of Array.isArray(pages) ? pages : []) {
    const sourceUrl = httpUrl(page?.url);
    if (!sourceUrl || !officialHost || hostname(sourceUrl) !== officialHost) {
      pagesRejectedForHost += 1;
      continue;
    }
    evidence.push(...extractOfficialCoordinateObjects(page?.html, { sourceUrl }));
  }

  return selectOfficialCoordinateEvidence(candidate, evidence, {
    pagesRejectedForHost,
  });
}

/**
 * Select one exact-branch coordinate from previously extracted evidence.
 */
export function selectOfficialCoordinateEvidence(candidate, evidence, {
  pagesRejectedForHost = 0,
} = {}) {
  const considered = Array.isArray(evidence) ? evidence : [];
  const matches = considered.map((item) => ({
    item,
    validation: validateExactBranchAddress(candidate, item?.address),
  })).filter(({ validation }) => validation.verified);

  const coordinateGroups = new Map();
  for (const match of matches) {
    const key = coordinateKey(match.item.latitude, match.item.longitude);
    if (!key) continue;
    if (!coordinateGroups.has(key)) coordinateGroups.set(key, []);
    coordinateGroups.get(key).push(match);
  }

  const base = {
    provider: OFFICIAL_COORDINATE_PROVIDER,
    considered: considered.length,
    exact_branch_matches: matches.length,
    unique_coordinate_pairs: coordinateGroups.size,
    pages_rejected_for_host: pagesRejectedForHost,
  };
  if (coordinateGroups.size === 0) {
    return { outcome: "no_match", ...base };
  }
  if (coordinateGroups.size !== 1) {
    return { outcome: "ambiguous", ...base };
  }

  const group = [...coordinateGroups.values()][0];
  const selected = group[0];
  return {
    outcome: "matched",
    provider: OFFICIAL_COORDINATE_PROVIDER,
    latitude: Number(selected.item.latitude),
    longitude: Number(selected.item.longitude),
    source_url: selected.item.source_url || null,
    structured_type: selected.item.structured_type,
    structured_name: selected.item.structured_name || null,
    matched_address: selected.item.address,
    validation: selected.validation,
    ...base,
  };
}

/**
 * Validate that a structured address represents the candidate's exact branch.
 * This intentionally does not repair differing staged addresses.
 */
export function validateExactBranchAddress(candidate, structuredAddress) {
  const candidateAddress = normalizedCandidateAddress(candidate);
  const officialAddress = normalizedStructuredAddress(structuredAddress);
  const countryMatch = Boolean(
    candidateAddress.country
    && officialAddress.country
    && candidateAddress.country === officialAddress.country
  );
  const localityMatch = localityIdentity(candidateAddress.locality)
    === localityIdentity(officialAddress.locality);
  const regionMatch = regionIdentity(candidateAddress.region)
    === regionIdentity(officialAddress.region);
  const postalMatch = Boolean(
    candidateAddress.postal
    && officialAddress.postal
    && candidateAddress.postal === officialAddress.postal
  );
  const locationMatch = Boolean(
    (candidateAddress.locality && officialAddress.locality && localityMatch)
    || (candidateAddress.region && officialAddress.region && regionMatch)
    || postalMatch
  );

  const candidateHouseNumber = houseNumber(candidateAddress.street);
  const officialHouseNumber = houseNumber(officialAddress.street);
  const candidateTokens = addressTokens(candidateAddress.street, candidate);
  const officialTokens = addressTokens(officialAddress.street, officialAddress);
  const matchedTokens = candidateTokens.filter((token) => officialTokens.includes(token));
  const numbered = Boolean(candidateHouseNumber || officialHouseNumber);
  const houseNumberMatch = Boolean(
    candidateHouseNumber
    && officialHouseNumber
    && candidateHouseNumber === officialHouseNumber
  );
  const requiredTokens = numbered
    ? Math.max(1, Math.min(2, Math.ceil(Math.min(
        candidateTokens.length,
        officialTokens.length,
      ) / 2)))
    : 3;
  const streetMatch = Boolean(
    candidateTokens.length >= requiredTokens
    && officialTokens.length >= requiredTokens
    && matchedTokens.length >= requiredTokens
  );
  const verified = Boolean(
    countryMatch
    && locationMatch
    && streetMatch
    && (numbered ? houseNumberMatch : true)
  );

  return {
    verified,
    country_match: countryMatch,
    locality_match: localityMatch,
    region_match: regionMatch,
    postal_match: postalMatch,
    location_match: locationMatch,
    numbered,
    candidate_house_number: candidateHouseNumber,
    official_house_number: officialHouseNumber,
    house_number_match: houseNumberMatch,
    candidate_street_tokens: candidateTokens,
    official_street_tokens: officialTokens,
    matched_street_tokens: matchedTokens,
    required_street_tokens: requiredTokens,
    street_match: streetMatch,
  };
}

function jsonLdBlocks(html) {
  const blocks = [];
  for (const match of String(html || "").matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu,
  )) {
    if (!/\btype\s*=\s*(?:(["'])application\/ld\+json\1|application\/ld\+json)(?:\s|>|$)/iu
      .test(match[1])) continue;
    blocks.push(match[2]);
  }
  return blocks;
}

function cleanJsonLd(value) {
  return String(value || "")
    .replace(/^\s*<!--/u, "")
    .replace(/-->\s*$/u, "")
    .trim()
    .replace(/;\s*$/u, "");
}

function walkJsonLd(value) {
  const objects = [];
  const seen = new Set();
  const visit = (item) => {
    if (!item || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    objects.push(item);
    for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return objects;
}

function isCoordinateBearingPlace(value) {
  if (!value?.geo || !value?.address) return false;
  return normalizedTypes(value["@type"]).some((type) => PLACE_TYPES.has(type));
}

function normalizedTypes(value) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => scalarText(item)?.split(/[\/#]/u).at(-1) || null)
    .filter(Boolean);
}

function normalizedCoordinates(value) {
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    const latitude = numericValue(item?.latitude);
    const longitude = numericValue(item?.longitude);
    if (
      latitude != null
      && longitude != null
      && latitude >= -90
      && latitude <= 90
      && longitude >= -180
      && longitude <= 180
      && !(latitude === 0 && longitude === 0)
    ) {
      return { latitude, longitude };
    }
  }
  return null;
}

function normalizedAddresses(value) {
  return (Array.isArray(value) ? value : [value])
    .map(normalizedStructuredAddress)
    .filter((address) => address.street);
}

function normalizedStructuredAddress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      street: scalarText(value),
      locality: null,
      region: null,
      postal: null,
      country: null,
    };
  }
  return {
    street: scalarText(value.streetAddress ?? value.street),
    locality: scalarText(value.addressLocality ?? value.locality),
    region: scalarText(value.addressRegion ?? value.region),
    postal: postalIdentity(value.postalCode ?? value.postal),
    country: countryIdentity(value.addressCountry ?? value.country),
  };
}

function normalizedCandidateAddress(candidate) {
  return {
    street: scalarText(candidate?.address),
    locality: scalarText(candidate?.locality),
    region: scalarText(candidate?.region),
    postal: postalIdentity(candidate?.postal_code ?? candidate?.postalCode),
    country: countryIdentity(candidate?.country_code ?? candidate?.countryCode),
  };
}

function houseNumber(value) {
  const withoutUnitOrFloor = String(value || "").split(
    /\b(?:suite|ste|unit|floor|fl|level|room|office)\b/iu,
  )[0];
  for (const match of withoutUnitOrFloor.matchAll(/\b\d{1,6}[a-z]?\b/giu)) {
    if (/^\d+(?:st|nd|rd|th)$/iu.test(match[0])) continue;
    return match[0].toLowerCase();
  }
  return null;
}

function addressTokens(value, context) {
  const excluded = new Set([
    ...identityTokens(context?.locality),
    ...identityTokens(context?.region),
    ...identityTokens(context?.country),
    ...identityTokens(context?.postal),
  ]);
  return [...new Set(identityTokens(
    String(value || "").split(/\b(?:suite|ste|unit|floor|fl|level|room|office)\b/iu)[0],
  ).filter((token) => (
    token.length >= 2
    && !ADDRESS_STOPWORDS.has(token)
    && !excluded.has(token)
    && !/^\d+$/u.test(token)
  )))];
}

function identityTokens(value) {
  return normalizeIdentity(value).split(" ").filter(Boolean);
}

function localityIdentity(value) {
  return normalizeIdentity(value)
    .replace(/^ft\b/u, "fort")
    .replace(/\bft\b/u, "fort");
}

function regionIdentity(value) {
  return normalizeIdentity(value);
}

function postalIdentity(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]/gu, "");
  return normalized || null;
}

function countryIdentity(value) {
  if (value && typeof value === "object") {
    value = value.name || value["@id"] || null;
  }
  const normalized = normalizeIdentity(value);
  return COUNTRY_ALIASES.get(normalized) || (
    /^[a-z]{2}$/u.test(normalized) ? normalized.toUpperCase() : null
  );
}

function coordinateKey(latitude, longitude) {
  const lat = numericValue(latitude);
  const lon = numericValue(longitude);
  if (lat == null || lon == null) return null;
  return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}

function deduplicateExtractedObjects(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = JSON.stringify([
      coordinateKey(value.latitude, value.longitude),
      value.source_url,
      value.structured_type,
      value.structured_name,
      value.address,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numericValue(value) {
  const raw = value && typeof value === "object" ? value["@value"] : value;
  if (raw == null || raw === "") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function scalarText(value) {
  if (value == null) return null;
  if (typeof value === "object") value = value["@value"] ?? value.name ?? null;
  const normalized = String(value || "").replace(/\s+/gu, " ").trim();
  return normalized || null;
}

function normalizeIdentity(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function httpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function hostname(value) {
  const url = httpUrl(value);
  return url ? new URL(url).hostname.replace(/^www\./u, "").toLowerCase() : null;
}
