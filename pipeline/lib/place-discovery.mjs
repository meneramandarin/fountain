import { createHash } from "node:crypto";

import { createOpenRouterAgentWebSearch } from "./openrouter-web-search.mjs";
import { query as defaultQuery } from "./db.mjs";

export const PLACE_DISCOVERY_PROMPT_VERSION = "place-discovery-v1";
export const PLACE_DISCOVERY_DEFAULT_CONCURRENCY = 24;
export const PLACE_DISCOVERY_DEFAULT_MODEL = "openai/gpt-4o-mini";

const DISCOVERY_SYSTEM_PROMPT = [
  "You are a local-business research agent building a health and longevity directory.",
  "You must use web search and return strict JSON only.",
  "Find real, currently operating physical locations that explicitly offer at least one requested treatment.",
  "Exclude equipment manufacturers, equipment installers, product stores, directories, mobile-only services, telehealth-only practices, and virtual locations.",
  "Prefer the business's official website and official location or service pages.",
  "Do not treat directories, aggregators, listicles, or search-result snippets as proof when an official source is available.",
  "Never invent a business, address, contact detail, service, price, URL, or chain relationship.",
  "One physical branch is one place object.",
].join(" ");

export function buildPlaceDiscoveryPrompt(query) {
  const countryName = query.country_name
    || (String(query.country_code).toUpperCase() === "CA" ? "Canada" : "United States");
  const countryCode = String(query.country_code || "US").toUpperCase();
  const currency = query.currency || (countryCode === "CA" ? "CAD" : "USD");
  return [
    `Research physical providers in or very near ${query.market}, ${query.region}, ${countryName}.`,
    `Target treatments: ${query.treatments.join(", ")}.`,
    "Return up to 10 strong matches. Coverage matters, but evidence quality matters more.",
    "One physical branch must be one place object.",
    "Include a branch only when a source supports both its physical identity and at least one target treatment.",
    "For sauna, include studios, spas, gyms, clinics, bathhouses, and wellness centers where a customer can book or use a sauna; exclude sauna builders, installers, and equipment sellers.",
    "If a provider is a chain, set chain_name and include its official locations-page URL when found.",
    "Use null for unknown scalar fields and [] for unknown arrays.",
    "JSON schema:",
    JSON.stringify({
      places: [{
        name: "string",
        website: "https://official.example/location-or-homepage",
        address: "full street address",
        locality: "city",
        region: "state or province abbreviation",
        postal_code: "string",
        country_code: countryCode,
        phone: "string or null",
        email: "string or null",
        image_url: "official logo or place photo URL, or null",
        matched_treatments: ["exactly as described by the source"],
        offerings: [{
          name: "service/menu item",
          price_amount: "number or null",
          price_currency: `${currency} or null`,
          price_text: "verbatim short price context or null",
          source_url: "official source URL",
        }],
        chain_name: "string or null",
        chain_locations_url: "official chain locations URL or null",
        evidence_urls: ["URLs that support address and treatments"],
        physical_location: true,
      }],
    }),
  ].join("\n");
}

export function parsePlaceDiscoveryContent(content) {
  const parsed = parseJsonObject(content);
  if (!Array.isArray(parsed?.places)) {
    throw new Error("Agent discovery response must contain a places array.");
  }
  return parsed.places;
}

export function normalizeDiscoveredPlace(place, {
  market,
  group,
  citations = [],
  allowOutsideCalifornia = false,
  allowedRegions = null,
  allowedCountries = ["US"],
  defaultRegion = "CA",
  defaultCurrency = "USD",
} = {}) {
  if (!place || typeof place !== "object" || Array.isArray(place)) return null;
  if (place.physical_location === false) return null;
  const name = text(place.name);
  if (!name) return null;

  const website = httpUrl(place.website);
  const evidenceUrls = uniqueStrings([
    ...array(place.evidence_urls).map(httpUrl).filter(Boolean),
    ...array(place.offerings).map((offering) => httpUrl(offering?.source_url)).filter(Boolean),
  ]);
  const citationUrls = uniqueStrings(array(citations).map((citation) => httpUrl(citation?.url)).filter(Boolean));
  const corroborated = isCorroborated({ website, evidenceUrls, citationUrls });
  const address = text(place.address);
  const locality = text(place.locality);
  const region = normalizeRegionCode(text(place.region) || defaultRegion);
  const countryCode = normalizeCountryCode(text(place.country_code) || "US");
  const offerings = normalizeOfferings(place.offerings, { defaultCurrency });
  const normalizedAllowedCountries = array(allowedCountries)
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean);

  const normalized = {
    candidate_key: candidateKey({
      name,
      website,
      address,
      locality,
      region,
      country_code: countryCode,
    }),
    name,
    website,
    address,
    locality,
    region,
    postal_code: text(place.postal_code),
    country_code: countryCode,
    phone: text(place.phone),
    email: email(place.email),
    image_url: httpUrl(place.image_url),
    chain_name: text(place.chain_name),
    chain_locations_url: httpUrl(place.chain_locations_url),
    matched_treatments: uniqueStrings(array(place.matched_treatments).map(text).filter(Boolean)),
    offerings,
    evidence_urls: evidenceUrls,
    discovered_markets: market ? [market] : [],
    discovered_groups: group ? [group] : [],
    status: (
      looksLikePhysicalAddress(address, { countryCode, locality })
      && locality
      && (
        Array.isArray(allowedRegions)
          ? allowedRegions.map(normalizeRegionCode).includes(region)
          : allowOutsideCalifornia || region === "CA"
      )
      && normalizedAllowedCountries.includes(countryCode)
      && (website || evidenceUrls.length > 0)
      && corroborated
    ) ? "discovered" : "needs_review",
    corroborated,
    agent_payload: place,
  };
  return normalized;
}

export async function runPlaceDiscovery({
  campaign,
  queries,
  runId,
  apply = false,
  model = PLACE_DISCOVERY_DEFAULT_MODEL,
  concurrency = PLACE_DISCOVERY_DEFAULT_CONCURRENCY,
  limit = null,
  budgetUsd = null,
}, operations = {}) {
  const selected = (limit == null ? queries : queries.slice(0, positiveInteger(limit, "limit")));
  if (!apply) {
    return {
      planned_queries: selected.length,
      estimated_search_requests_max: selected.length,
      markets: new Set(selected.map((item) => item.market)).size,
      treatment_groups: new Set(selected.map((item) => item.group)).size,
      model,
      concurrency,
      budget_usd: budgetUsd,
      sample: selected.slice(0, 5),
    };
  }

  const query = operations.query || defaultQuery;
  const webSearch = operations.webSearch || createOpenRouterAgentWebSearch({
    model,
    maxResults: 10,
    maxCharacters: 3_000,
    maxTokens: 4_000,
    systemPrompt: DISCOVERY_SYSTEM_PROMPT,
    callType: "place_discovery_web_search",
    title: "Fountain place discovery",
  });
  const results = new Array(selected.length);
  let cursor = 0;
  let budgetExhausted = false;
  const loadSpend = () => (
    operations.getRunSpend
      ? operations.getRunSpend(runId)
      : loadRunSpend(runId, { query })
  );
  const checkBudget = operations.isBudgetExhausted || (async () => {
    const spendUsd = await loadSpend();
    return { exhausted: budgetUsd != null && spendUsd >= Number(budgetUsd), spendUsd };
  });

  async function worker() {
    while (true) {
      if (budgetUsd != null) {
        const budget = await checkBudget(runId, budgetUsd);
        if (budget.exhausted) {
          budgetExhausted = true;
          return;
        }
      }
      const index = cursor++;
      if (index >= selected.length) return;
      const discoveryQuery = selected[index];
      try {
        results[index] = await executeDiscoveryQuery({
          campaign,
          discoveryQuery,
          runId,
          webSearch,
          query,
        });
      } catch (error) {
        await recordDiscoverySearch({
          campaign,
          discoveryQuery,
          runId,
          response: null,
          candidates: [],
          error,
        }, { query });
        results[index] = {
          query_id: discoveryQuery.id,
          market: discoveryQuery.market,
          group: discoveryQuery.group,
          status: "failed",
          error: errorMessage(error),
          candidates: 0,
          inserted_or_updated: 0,
        };
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(positiveInteger(concurrency, "concurrency"), Math.max(1, selected.length)) },
    () => worker(),
  ));
  const failed = results.filter((result) => result.status === "failed").length;
  const completedResults = results.filter(Boolean);
  return {
    planned_queries: selected.length,
    completed_queries: completedResults.length - failed,
    failed_queries: failed,
    skipped_for_budget: selected.length - completedResults.length,
    budget_exhausted: budgetExhausted,
    spend_usd: await loadSpend(),
    candidates_returned: sum(completedResults, "candidates"),
    candidates_inserted_or_updated: sum(completedResults, "inserted_or_updated"),
    needs_review: sum(completedResults, "needs_review"),
    model,
    concurrency,
    results: completedResults,
  };
}

async function loadRunSpend(runId, { query }) {
  const result = await query(
    `
      SELECT COALESCE(sum(cost_estimate_usd), 0)::numeric AS spend
      FROM fountain_ops.external_calls
      WHERE run_id = $1
    `,
    [runId],
  );
  return Number(result.rows?.[0]?.spend || 0);
}

async function executeDiscoveryQuery({
  campaign,
  discoveryQuery,
  runId,
  webSearch,
  query,
}) {
  const response = await webSearch({
    query: buildPlaceDiscoveryPrompt(discoveryQuery),
    runId,
    location: {
      locality: discoveryQuery.market,
      region: discoveryQuery.region,
      country_code: discoveryQuery.country_code,
    },
  });
  const rawPlaces = parsePlaceDiscoveryContent(response.content);
  const candidates = rawPlaces
    .map((place) => normalizeDiscoveredPlace(place, {
      market: discoveryQuery.market,
      group: discoveryQuery.group,
      citations: response.results,
      allowedRegions: discoveryQuery.allowed_regions || [discoveryQuery.region],
      allowedCountries: [discoveryQuery.country_code],
      defaultRegion: discoveryQuery.region,
      defaultCurrency: discoveryQuery.currency || (
        discoveryQuery.country_code === "CA" ? "CAD" : "USD"
      ),
    }))
    .filter(Boolean);
  const stored = await recordDiscoverySearch({
    campaign,
    discoveryQuery,
    runId,
    response,
    candidates,
    error: null,
  }, { query });
  return {
    query_id: discoveryQuery.id,
    market: discoveryQuery.market,
    group: discoveryQuery.group,
    status: "completed",
    candidates: candidates.length,
    inserted_or_updated: stored.candidates,
    needs_review: candidates.filter((candidate) => candidate.status === "needs_review").length,
    cost_estimate_usd: response.costEstimateUsd,
  };
}

export async function recordDiscoverySearch({
  campaign,
  discoveryQuery,
  runId,
  response,
  candidates,
  error,
}, operations = {}) {
  const query = operations.query || defaultQuery;
  await query(
    `
      INSERT INTO fountain_raw.agent_discovery_searches (
        campaign, run_id, query_id, market, treatment_group, treatments,
        model, response_content, citations, candidate_count, error
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11)
      ON CONFLICT (campaign, run_id, query_id) DO UPDATE SET
        model = EXCLUDED.model,
        response_content = EXCLUDED.response_content,
        citations = EXCLUDED.citations,
        candidate_count = EXCLUDED.candidate_count,
        error = EXCLUDED.error
    `,
    [
      campaign,
      runId,
      discoveryQuery.id,
      discoveryQuery.market,
      discoveryQuery.group,
      JSON.stringify(discoveryQuery.treatments),
      response?.model || null,
      response?.content || null,
      JSON.stringify(response?.results || []),
      candidates.length,
      error ? errorMessage(error).slice(0, 8_000) : null,
    ],
  );
  let stored = 0;
  for (const candidate of candidates) {
    await upsertDiscoveryCandidate({ campaign, runId, candidate }, { query });
    stored += 1;
  }
  return { candidates: stored };
}

export async function upsertDiscoveryCandidate({ campaign, runId, candidate }, operations = {}) {
  const query = operations.query || defaultQuery;
  return query(
    `
      INSERT INTO fountain_raw.agent_discovery_candidates (
        campaign, candidate_key, first_run_id, last_run_id, name, website,
        address, locality, region, postal_code, country_code, phone, email,
        image_url, chain_name, chain_locations_url, matched_treatments,
        offerings, evidence_urls, discovered_markets, discovered_groups,
        agent_payload, latitude, longitude, geocode_provider, geocode_result,
        official_site_verification, address_verified, treatment_verified, status
      )
      VALUES (
        $1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb,
        $20::jsonb, $21::jsonb, $22, $23, $24, $25::jsonb, $26::jsonb,
        $27, $28, $29
      )
      ON CONFLICT (campaign, candidate_key) DO UPDATE SET
        last_run_id = EXCLUDED.last_run_id,
        website = COALESCE(fountain_raw.agent_discovery_candidates.website, EXCLUDED.website),
        address = COALESCE(fountain_raw.agent_discovery_candidates.address, EXCLUDED.address),
        locality = COALESCE(fountain_raw.agent_discovery_candidates.locality, EXCLUDED.locality),
        region = COALESCE(fountain_raw.agent_discovery_candidates.region, EXCLUDED.region),
        postal_code = COALESCE(fountain_raw.agent_discovery_candidates.postal_code, EXCLUDED.postal_code),
        phone = COALESCE(fountain_raw.agent_discovery_candidates.phone, EXCLUDED.phone),
        email = COALESCE(fountain_raw.agent_discovery_candidates.email, EXCLUDED.email),
        image_url = COALESCE(fountain_raw.agent_discovery_candidates.image_url, EXCLUDED.image_url),
        chain_name = COALESCE(fountain_raw.agent_discovery_candidates.chain_name, EXCLUDED.chain_name),
        chain_locations_url = COALESCE(
          fountain_raw.agent_discovery_candidates.chain_locations_url,
          EXCLUDED.chain_locations_url
        ),
        matched_treatments = fountain_raw.jsonb_text_array_union(
          fountain_raw.agent_discovery_candidates.matched_treatments,
          EXCLUDED.matched_treatments
        ),
        evidence_urls = fountain_raw.jsonb_text_array_union(
          fountain_raw.agent_discovery_candidates.evidence_urls,
          EXCLUDED.evidence_urls
        ),
        discovered_markets = fountain_raw.jsonb_text_array_union(
          fountain_raw.agent_discovery_candidates.discovered_markets,
          EXCLUDED.discovered_markets
        ),
        discovered_groups = fountain_raw.jsonb_text_array_union(
          fountain_raw.agent_discovery_candidates.discovered_groups,
          EXCLUDED.discovered_groups
        ),
        offerings = CASE
          WHEN jsonb_array_length(fountain_raw.agent_discovery_candidates.offerings)
            >= jsonb_array_length(EXCLUDED.offerings)
          THEN fountain_raw.agent_discovery_candidates.offerings
          ELSE EXCLUDED.offerings
        END,
        agent_payload = EXCLUDED.agent_payload,
        latitude = COALESCE(fountain_raw.agent_discovery_candidates.latitude, EXCLUDED.latitude),
        longitude = COALESCE(fountain_raw.agent_discovery_candidates.longitude, EXCLUDED.longitude),
        geocode_provider = COALESCE(
          fountain_raw.agent_discovery_candidates.geocode_provider,
          EXCLUDED.geocode_provider
        ),
        geocode_result = COALESCE(
          fountain_raw.agent_discovery_candidates.geocode_result,
          EXCLUDED.geocode_result
        ),
        official_site_verification = COALESCE(
          fountain_raw.agent_discovery_candidates.official_site_verification,
          EXCLUDED.official_site_verification
        ),
        address_verified = (
          fountain_raw.agent_discovery_candidates.address_verified
          OR EXCLUDED.address_verified
        ),
        treatment_verified = (
          fountain_raw.agent_discovery_candidates.treatment_verified
          OR EXCLUDED.treatment_verified
        ),
        status = CASE
          WHEN fountain_raw.agent_discovery_candidates.status IN (
            'existing_match', 'ready', 'rejected', 'promoted'
          ) THEN fountain_raw.agent_discovery_candidates.status
          WHEN fountain_raw.agent_discovery_candidates.status = 'discovered'
            OR EXCLUDED.status = 'discovered' THEN 'discovered'
          ELSE 'needs_review'
        END,
        updated_at = now()
      RETURNING id, status
    `,
    [
      campaign,
      candidate.candidate_key,
      runId,
      candidate.name,
      candidate.website,
      candidate.address,
      candidate.locality,
      candidate.region,
      candidate.postal_code,
      candidate.country_code,
      candidate.phone,
      candidate.email,
      candidate.image_url,
      candidate.chain_name,
      candidate.chain_locations_url,
      JSON.stringify(candidate.matched_treatments),
      JSON.stringify(candidate.offerings),
      JSON.stringify(candidate.evidence_urls),
      JSON.stringify(candidate.discovered_markets),
      JSON.stringify(candidate.discovered_groups),
      JSON.stringify(candidate.agent_payload),
      candidate.latitude ?? null,
      candidate.longitude ?? null,
      candidate.geocode_provider || null,
      candidate.geocode_result == null ? null : JSON.stringify(candidate.geocode_result),
      candidate.official_site_verification == null
        ? null
        : JSON.stringify(candidate.official_site_verification),
      candidate.address_verified === true,
      candidate.treatment_verified === true,
      candidate.status,
    ],
  );
}

function normalizeOfferings(value, { defaultCurrency = "USD" } = {}) {
  return array(value).map((offering) => {
    if (!offering || typeof offering !== "object" || Array.isArray(offering)) return null;
    const name = text(offering.name);
    const sourceUrl = httpUrl(offering.source_url);
    if (!name || !sourceUrl) return null;
    const priceAmount = nullableNonnegativeNumber(offering.price_amount);
    return {
      name,
      price_amount: priceAmount,
      price_currency: priceAmount == null
        ? text(offering.price_currency)
        : (text(offering.price_currency) || defaultCurrency),
      price_text: text(offering.price_text),
      source_url: sourceUrl,
    };
  }).filter(Boolean);
}

function candidateKey(place) {
  const website = parsedUrl(place.website);
  const websiteIdentity = website
    ? `${website.hostname.replace(/^www\./u, "")}${website.pathname.replace(/\/+$/u, "")}`
    : "";
  const identity = [
    normalizeIdentity(place.name),
    normalizeIdentity(place.address),
    normalizeIdentity(place.locality),
    normalizeIdentity(place.region),
    normalizeIdentity(place.country_code),
    websiteIdentity,
  ].join("|");
  return createHash("sha256").update(identity).digest("hex");
}

function isCorroborated({ website, evidenceUrls, citationUrls }) {
  if (citationUrls.length === 0) return false;
  const evidence = [website, ...evidenceUrls].filter(Boolean);
  return evidence.some((url) => citationUrls.some((citationUrl) => (
    sameDomainFamily(url, citationUrl)
  )));
}

function sameDomainFamily(left, right) {
  const a = hostname(left);
  const b = hostname(right);
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));
}

function parseJsonObject(content) {
  const value = String(content || "").trim();
  const candidates = [
    value,
    value.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, ""),
    value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next bounded extraction.
    }
  }
  throw new Error("Agent discovery response was not valid JSON.");
}

function parsedUrl(value) {
  const normalized = text(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function httpUrl(value) {
  return parsedUrl(value)?.href || null;
}

function hostname(value) {
  return parsedUrl(value)?.hostname.replace(/^www\./u, "").toLowerCase() || null;
}

function email(value) {
  const normalized = text(value)?.toLowerCase() || null;
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ? normalized : null;
}

function normalizeIdentity(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function normalizeRegionCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const codes = {
    ALABAMA: "AL",
    ARIZONA: "AZ",
    CALIFORNIA: "CA",
    COLORADO: "CO",
    "DISTRICT OF COLUMBIA": "DC",
    FLORIDA: "FL",
    GEORGIA: "GA",
    ILLINOIS: "IL",
    MARYLAND: "MD",
    MASSACHUSETTS: "MA",
    NEVADA: "NV",
    "NEW JERSEY": "NJ",
    "NEW YORK": "NY",
    "NORTH CAROLINA": "NC",
    PENNSYLVANIA: "PA",
    TEXAS: "TX",
    VIRGINIA: "VA",
    WASHINGTON: "WA",
    "BRITISH COLUMBIA": "BC",
    ONTARIO: "ON",
    QUEBEC: "QC",
    QUÉBEC: "QC",
    BAVARIA: "BY",
    BAYERN: "BY",
    "GREATER LONDON": "LONDON",
    "BALEARIC ISLANDS": "IB",
    "ILLES BALEARS": "IB",
    IBIZA: "IB",
    "ÎLE-DE-FRANCE": "IDF",
    "ILE-DE-FRANCE": "IDF",
    PARIS: "IDF",
    "QUINTANA ROO": "QR",
    "MEXICO CITY": "CMX",
    "CIUDAD DE MÉXICO": "CMX",
    CDMX: "CMX",
    "WESTERN CAPE": "WC",
    LISBOA: "LISBON",
    QATAR: "DOHA",
    QA: "DOHA",
  };
  if (codes[normalized]) return codes[normalized];
  return normalized;
}

function text(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || /^(?:null|none|n\/a|unknown|not available)$/iu.test(normalized)) return null;
  return normalized;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function looksLikePhysicalAddress(value, { countryCode = "US", locality = null } = {}) {
  const normalized = text(value);
  if (!normalized || !/[a-z]/iu.test(normalized)) return false;
  if (/\d/u.test(normalized)) return true;
  if (["US", "CA"].includes(String(countryCode).toUpperCase())) return false;
  const firstSegment = normalized.split(",")[0].trim();
  const tokens = firstSegment.split(/\s+/u).filter((token) => /[a-z]{2,}/iu.test(token));
  return tokens.length >= 2
    && normalizeIdentity(firstSegment) !== normalizeIdentity(locality);
}

function normalizeCountryCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const codes = {
    CANADA: "CA",
    GERMANY: "DE",
    SPAIN: "ES",
    FRANCE: "FR",
    INDONESIA: "ID",
    MEXICO: "MX",
    PORTUGAL: "PT",
    QATAR: "QA",
    SINGAPORE: "SG",
    THAILAND: "TH",
    UAE: "AE",
    "UNITED ARAB EMIRATES": "AE",
    UK: "GB",
    "UNITED KINGDOM": "GB",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    "SOUTH AFRICA": "ZA",
  };
  return codes[normalized] || normalized;
}

function nullableNonnegativeNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}

function sum(results, field) {
  return results.reduce((total, result) => total + Number(result?.[field] || 0), 0);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
