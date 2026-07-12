const GOOGLE_PROVIDERS = new Map([
  ["google_places", 0],
  ["google", 1],
  ["google_place", 2],
  ["places", 3],
]);

const GENERIC_OR_DIRECTORY_DOMAINS = new Set([
  "facebook.com",
  "google.com",
  "healthgrades.com",
  "instagram.com",
  "linkedin.com",
  "mapquest.com",
  "webmd.com",
  "yellowpages.com",
  "yelp.com",
  "youtube.com",
  "zocdoc.com",
]);

const NAME_STOP_WORDS = new Set([
  "and",
  "care",
  "center",
  "centre",
  "clinic",
  "clinics",
  "company",
  "group",
  "health",
  "hospital",
  "institute",
  "medical",
  "of",
  "the",
  "wellness",
]);

const ADDRESS_STOP_WORDS = new Set([
  "avenue",
  "boulevard",
  "building",
  "drive",
  "floor",
  "highway",
  "lane",
  "road",
  "route",
  "street",
  "suite",
  "unit",
]);

/**
 * Discover an official website without mutating a location or its write ledger.
 *
 * `placesClient` follows pipeline/lib/places.mjs: searchText/getDetails return
 * `{ data }`. `webSearch` is an injected, ledger-aware adapter which receives
 * `{ query, runId, entityId, location }` and may return an array, `{ results }`,
 * or `{ items }` of `{ url|link, title|name, snippet|description, address }`.
 */
export async function discoverWebsiteForLocation(
  {
    location,
    externalPlaceMatches = [],
    runId,
    maxPlacesAttempts = 1,
  } = {},
  {
    placesClient = null,
    webSearch = null,
  } = {},
) {
  const normalizedLocation = normalizeLocation(location);
  const normalizedRunId = normalizeRunId(runId);
  const attempts = [];

  if (normalizedLocation.website) {
    return discoveryResult(normalizedLocation, {
      outcome: "stored_website_present",
      attempts,
    });
  }
  const storedPlaceMatch = selectGooglePlaceMatch(externalPlaceMatches);

  // A persisted provider ID is the sole exception to agent-first discovery:
  // it may go directly to the cheaper, unambiguous contact-details lookup.
  if (storedPlaceMatch && placesClient && typeof placesClient.getDetails === "function") {
    try {
      const response = await placesClient.getDetails({
        runId: normalizedRunId,
        taskType: "contact_fill",
        entityId: normalizedLocation.id,
        placeId: storedPlaceMatch.providerPlaceId,
        maxAttempts: positiveInteger(maxPlacesAttempts, "maxPlacesAttempts"),
      });
      const candidate = placesCandidate(response?.data);
      const validation = validateOfficialWebsiteCandidate({
        location: normalizedLocation,
        candidate,
      });
      attempts.push({
        source: "google_places",
        provider: storedPlaceMatch.provider,
        provider_place_id: storedPlaceMatch.providerPlaceId,
        provider_id_source: storedPlaceMatch.providerIdSource || "stored_match",
        outcome: validation.official ? "accepted" : validation.reason,
        website: validation.website,
        validation,
        external_call_id: response?.externalCallId ?? null,
      });
      if (validation.official) {
        return discoveryResult(normalizedLocation, {
          outcome: "official_website_found",
          source: "google_places",
          website: validation.website,
          validation,
          provider: storedPlaceMatch.provider,
          providerPlaceId: storedPlaceMatch.providerPlaceId,
          attempts,
        });
      }
    } catch (error) {
      attempts.push({
        source: "google_places",
        provider: storedPlaceMatch.provider,
        provider_place_id: storedPlaceMatch.providerPlaceId,
        outcome: "provider_error",
        error: errorMessage(error),
      });
    }
  } else if (storedPlaceMatch) {
    attempts.push({
      source: "google_places",
      provider: storedPlaceMatch.provider,
      provider_place_id: storedPlaceMatch.providerPlaceId,
      provider_id_source: storedPlaceMatch.providerIdSource || "stored_match",
      outcome: "places_client_unavailable",
    });
  }

  // Without a stored provider ID, the canonical flow is agent search first.
  if (typeof webSearch === "function") {
    const query = buildOfficialWebsiteSearchQuery(normalizedLocation);
    try {
      const response = await webSearch({
        query,
        runId: normalizedRunId,
        entityId: normalizedLocation.id,
        location: { ...normalizedLocation },
      });
      const candidates = normalizeSearchResults(response);
      for (const candidate of candidates) {
        const validation = validateOfficialWebsiteCandidate({
          location: normalizedLocation,
          candidate,
        });
        attempts.push({
          source: "web_search",
          outcome: validation.official ? "accepted" : validation.reason,
          website: validation.website,
          validation,
        });
        if (validation.official) {
          return discoveryResult(normalizedLocation, {
            outcome: "official_website_found",
            source: "web_search",
            website: validation.website,
            validation,
            searchQuery: query,
            attempts,
          });
        }
      }
      if (candidates.length === 0) {
        attempts.push({ source: "web_search", outcome: "no_results" });
      }
    } catch (error) {
      attempts.push({
        source: "web_search",
        outcome: "provider_error",
        error: errorMessage(error),
      });
    }
  }

  // Places Find Place + contact details is the fallback only after agent
  // search fails. Do not pay to resolve an ID we already had above.
  if (!storedPlaceMatch && placesClient && typeof placesClient.searchText === "function") {
    let fallbackPlaceMatch = null;
    try {
      const response = await placesClient.searchText({
        runId: normalizedRunId,
        taskType: "contact_fill",
        entityId: normalizedLocation.id,
        textQuery: buildPlacesTextQuery(normalizedLocation),
        ...(normalizedLocation.countryCode
          ? { regionCode: normalizedLocation.countryCode }
          : {}),
        maxResultCount: 1,
        maxAttempts: positiveInteger(maxPlacesAttempts, "maxPlacesAttempts"),
      });
      const providerPlaceId = firstPlacesResultId(response?.data);
      attempts.push({
        source: "google_places_search",
        outcome: providerPlaceId ? "place_id_found" : "no_results",
        provider_place_id: providerPlaceId,
        external_call_id: response?.externalCallId ?? null,
      });
      if (providerPlaceId) {
        fallbackPlaceMatch = {
          provider: "google_places",
          providerPlaceId,
          providerIdSource: "text_search",
        };
      }
    } catch (error) {
      attempts.push({
        source: "google_places_search",
        outcome: "provider_error",
        error: errorMessage(error),
      });
    }

    if (fallbackPlaceMatch && typeof placesClient.getDetails === "function") {
      try {
        const response = await placesClient.getDetails({
          runId: normalizedRunId,
          taskType: "contact_fill",
          entityId: normalizedLocation.id,
          placeId: fallbackPlaceMatch.providerPlaceId,
          maxAttempts: positiveInteger(maxPlacesAttempts, "maxPlacesAttempts"),
        });
        const candidate = placesCandidate(response?.data);
        const validation = validateOfficialWebsiteCandidate({
          location: normalizedLocation,
          candidate,
        });
        attempts.push({
          source: "google_places",
          provider: fallbackPlaceMatch.provider,
          provider_place_id: fallbackPlaceMatch.providerPlaceId,
          provider_id_source: fallbackPlaceMatch.providerIdSource,
          outcome: validation.official ? "accepted" : validation.reason,
          website: validation.website,
          validation,
          external_call_id: response?.externalCallId ?? null,
        });
        if (validation.official) {
          return discoveryResult(normalizedLocation, {
            outcome: "official_website_found",
            source: "google_places",
            website: validation.website,
            validation,
            provider: fallbackPlaceMatch.provider,
            providerPlaceId: fallbackPlaceMatch.providerPlaceId,
            attempts,
          });
        }
      } catch (error) {
        attempts.push({
          source: "google_places",
          provider: fallbackPlaceMatch.provider,
          provider_place_id: fallbackPlaceMatch.providerPlaceId,
          provider_id_source: fallbackPlaceMatch.providerIdSource,
          outcome: "provider_error",
          error: errorMessage(error),
        });
      }
    } else if (fallbackPlaceMatch) {
      attempts.push({
        source: "google_places",
        provider: fallbackPlaceMatch.provider,
        provider_place_id: fallbackPlaceMatch.providerPlaceId,
        provider_id_source: fallbackPlaceMatch.providerIdSource,
        outcome: "places_client_unavailable",
      });
    }
  } else if (!storedPlaceMatch && placesClient) {
    attempts.push({
      source: "google_places_search",
      outcome: "places_search_unavailable",
    });
  }

  return discoveryResult(normalizedLocation, {
    outcome: "official_website_not_found",
    attempts,
  });
}

export function validateOfficialWebsiteCandidate({ location, candidate } = {}) {
  const normalizedLocation = normalizeLocation(location);
  const normalizedCandidate = normalizeCandidate(candidate);
  if (!normalizedCandidate.website) {
    return invalidValidation("missing_or_invalid_website");
  }

  const url = parseHttpUrl(normalizedCandidate.website);
  if (!url) return invalidValidation("missing_or_invalid_website");
  const domain = canonicalDomain(url.hostname);
  if (!domain || isGenericOrDirectoryDomain(domain)) {
    return invalidValidation("generic_or_directory_domain", url.href, domain);
  }

  const evidenceText = normalizeText([
    normalizedCandidate.title,
    normalizedCandidate.snippet,
    normalizedCandidate.displayName,
    normalizedCandidate.formattedAddress,
    normalizedCandidate.address,
  ].filter(Boolean).join(" "));
  const nameTokens = meaningfulTokens(normalizedLocation.name, NAME_STOP_WORDS);
  const compactDomain = domain.replace(/[^a-z0-9]/gu, "");
  const domainNameMatch = nameTokens.some((token) => compactDomain.includes(token));
  const evidenceNameMatch = nameTokens.some((token) => containsToken(evidenceText, token));
  const locationMatch = hasLocationEvidence(normalizedLocation, evidenceText);

  if (!domainNameMatch) {
    return invalidValidation("domain_name_mismatch", url.href, domain, {
      domain_name_match: false,
      evidence_name_match: evidenceNameMatch,
      location_match: locationMatch,
    });
  }
  if (!evidenceNameMatch) {
    return invalidValidation("name_evidence_mismatch", url.href, domain, {
      domain_name_match: true,
      evidence_name_match: false,
      location_match: locationMatch,
    });
  }
  if (!locationMatch) {
    return invalidValidation("locality_or_address_evidence_mismatch", url.href, domain, {
      domain_name_match: domainNameMatch,
      evidence_name_match: evidenceNameMatch,
      location_match: false,
    });
  }

  return {
    official: true,
    reason: "official_evidence_match",
    website: url.href,
    domain,
    domain_name_match: domainNameMatch,
    evidence_name_match: evidenceNameMatch,
    location_match: true,
  };
}

export function selectGooglePlaceMatch(matches = []) {
  if (!Array.isArray(matches)) {
    throw new TypeError("externalPlaceMatches must be an array.");
  }
  return matches
    .map((match, index) => normalizePlaceMatch(match, index))
    .filter(Boolean)
    .sort((left, right) => left.priority - right.priority || left.index - right.index)[0] || null;
}

export function buildOfficialWebsiteSearchQuery(location) {
  const normalized = normalizeLocation(location);
  return [normalized.name, normalized.locality].filter(Boolean).join(" ");
}

export function buildPlacesTextQuery(location) {
  const normalized = normalizeLocation(location);
  return [
    normalized.name,
    normalized.address,
    normalized.locality,
    normalized.region,
    normalized.postalCode,
    normalized.countryCode,
  ].filter(Boolean).join(", ");
}

function discoveryResult(location, {
  outcome,
  source = null,
  website = null,
  validation = null,
  provider = null,
  providerPlaceId = null,
  searchQuery = null,
  attempts,
}) {
  return {
    location_id: location.id,
    outcome,
    source,
    would_write_website: website,
    provider,
    provider_place_id: providerPlaceId,
    search_query: searchQuery,
    validation,
    attempts,
    write_attempted: false,
    database_mutated: false,
  };
}

function normalizeLocation(location) {
  if (!location || typeof location !== "object" || Array.isArray(location)) {
    throw new TypeError("location must be an object.");
  }
  const id = Number(location.id ?? location.location_id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TypeError("location.id must be a positive integer.");
  }
  const name = optionalString(location.name);
  if (!name) throw new TypeError("location.name must be a non-empty string.");
  return {
    id,
    name,
    address: optionalString(location.address),
    locality: optionalString(location.locality),
    region: optionalString(location.region),
    postalCode: optionalString(location.postal_code ?? location.postalCode),
    countryCode: optionalString(location.country_code ?? location.countryCode)?.toUpperCase() || null,
    // Any non-empty stored value keeps this evidence-only helper from
    // proposing an overwrite, even when the legacy value is not parseable.
    website: optionalString(location.website),
  };
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  return {
    website: optionalString(candidate.website ?? candidate.websiteUri ?? candidate.url ?? candidate.link),
    title: optionalString(candidate.title ?? candidate.name),
    snippet: optionalString(candidate.snippet ?? candidate.description ?? candidate.text),
    displayName: optionalString(
      candidate.displayName?.text ?? candidate.displayName ?? candidate.display_name,
    ),
    formattedAddress: optionalString(candidate.formattedAddress ?? candidate.formatted_address),
    address: optionalString(candidate.address),
  };
}

function placesCandidate(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return {
    website: data.websiteUri,
    displayName: data.displayName?.text ?? data.displayName,
    formattedAddress: data.formattedAddress,
  };
}

function normalizeSearchResults(response) {
  const values = Array.isArray(response)
    ? response
    : Array.isArray(response?.results)
      ? response.results
      : Array.isArray(response?.items)
        ? response.items
        : [];
  return values.map(normalizeCandidate);
}

function normalizePlaceMatch(match, index) {
  if (!match || typeof match !== "object" || Array.isArray(match)) return null;
  const provider = optionalString(match.provider)?.toLowerCase();
  const providerPlaceId = optionalString(
    match.provider_place_id ?? match.providerPlaceId ?? match.place_id ?? match.placeId,
  );
  if (!provider || !GOOGLE_PROVIDERS.has(provider) || !providerPlaceId) return null;
  return {
    provider,
    providerPlaceId,
    providerIdSource: "stored_match",
    priority: GOOGLE_PROVIDERS.get(provider),
    index,
  };
}

function firstPlacesResultId(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const places = Array.isArray(data.places) ? data.places : [];
  return optionalString(places[0]?.id);
}

function hasLocationEvidence(location, evidenceText) {
  if (!evidenceText) return false;
  const locality = normalizeText(location.locality);
  if (locality && containsPhrase(evidenceText, locality)) return true;

  const postalCode = normalizeText(location.postalCode);
  if (postalCode && containsPhrase(evidenceText, postalCode)) return true;

  const addressTokens = meaningfulTokens(location.address, ADDRESS_STOP_WORDS);
  const addressMatches = addressTokens.filter((token) => containsToken(evidenceText, token));
  return addressMatches.length >= Math.min(2, addressTokens.length) && addressTokens.length > 0;
}

function invalidValidation(reason, website = null, domain = null, evidence = {}) {
  return {
    official: false,
    reason,
    website,
    domain,
    domain_name_match: evidence.domain_name_match ?? false,
    evidence_name_match: evidence.evidence_name_match ?? false,
    location_match: evidence.location_match ?? false,
  };
}

function meaningfulTokens(value, stopWords) {
  return [...new Set(normalizeText(value).split(" ")
    .filter((token) => token.length >= 3 && !stopWords.has(token)))];
}

function containsToken(text, token) {
  return (` ${text} `).includes(` ${token} `);
}

function containsPhrase(text, phrase) {
  return (` ${text} `).includes(` ${phrase} `);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function parseHttpUrl(value) {
  const text = optionalString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function canonicalDomain(value) {
  return String(value || "").toLowerCase().replace(/^www\./u, "").replace(/\.$/u, "");
}

function isGenericOrDirectoryDomain(domain) {
  return [...GENERIC_OR_DIRECTORY_DOMAINS].some((blocked) => (
    domain === blocked || domain.endsWith(`.${blocked}`)
  ));
}

function optionalString(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeRunId(value) {
  if (typeof value === "string" && /^[1-9]\d*$/u.test(value)) return value;
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (Number.isSafeInteger(value) && value > 0) return value;
  throw new TypeError("runId must be a positive integer or decimal integer string.");
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}

function errorMessage(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 1_000);
}
