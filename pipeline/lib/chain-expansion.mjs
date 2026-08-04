import { createOpenRouterAgentWebSearch } from "./openrouter-web-search.mjs";
import {
  normalizeDiscoveredPlace,
  parsePlaceDiscoveryContent,
  recordDiscoverySearch,
} from "./place-discovery.mjs";
import { query as defaultQuery } from "./db.mjs";

export const CHAIN_EXPANSION_DEFAULT_CONCURRENCY = 12;
export const CHAIN_EXPANSION_DEFAULT_MODEL = "openai/gpt-4o-mini";

const COVERAGE_REGIONS = Object.freeze([
  Object.freeze({
    key: "pacific_mountain",
    country_code: "US",
    country_name: "United States",
    currency: "USD",
    states: "AK, AZ, CA, CO, HI, ID, MT, NM, NV, OR, UT, WA, WY",
  }),
  Object.freeze({
    key: "central",
    country_code: "US",
    country_name: "United States",
    currency: "USD",
    states: "AR, IA, IL, IN, KS, LA, MI, MN, MO, MS, ND, NE, OH, OK, SD, TX, WI",
  }),
  Object.freeze({
    key: "northeast",
    country_code: "US",
    country_name: "United States",
    currency: "USD",
    states: "CT, DC, DE, MA, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WV",
  }),
  Object.freeze({
    key: "southeast",
    country_code: "US",
    country_name: "United States",
    currency: "USD",
    states: "AL, FL, GA, KY, NC, SC, TN",
  }),
  Object.freeze({
    key: "canada",
    country_code: "CA",
    country_name: "Canada",
    currency: "CAD",
    states: "AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT",
  }),
]);

const GLOBAL_REGIONS = Object.freeze([
  Object.freeze({
    key: "north_america",
    country_code: "US",
    country_codes: ["US", "CA"],
    prompt: "United States and Canada",
  }),
  Object.freeze({
    key: "europe",
    country_code: "GB",
    country_codes: ["AT", "BE", "CH", "DE", "DK", "ES", "FI", "FR", "GB", "IE", "IT", "NL", "NO", "PT", "SE"],
    prompt: "Europe, including the United Kingdom, Germany, France, Spain, Portugal, Italy, Benelux, Switzerland, Austria, Ireland, and the Nordic countries",
  }),
  Object.freeze({
    key: "middle_east",
    country_code: "AE",
    country_codes: ["AE", "BH", "IL", "KW", "OM", "QA", "SA"],
    prompt: "the Middle East, including the UAE, Qatar, Saudi Arabia, Bahrain, Kuwait, Oman, and Israel",
  }),
  Object.freeze({
    key: "asia_pacific",
    country_code: "SG",
    country_codes: ["AU", "HK", "ID", "JP", "KR", "MY", "NZ", "PH", "SG", "TH"],
    prompt: "Asia-Pacific, including Singapore, Thailand, Indonesia, Malaysia, the Philippines, Hong Kong, Japan, South Korea, Australia, and New Zealand",
  }),
  Object.freeze({
    key: "latin_america",
    country_code: "MX",
    country_codes: ["AR", "BR", "CL", "CO", "CR", "MX", "PA", "PE"],
    prompt: "Latin America, including Mexico, Central America, Brazil, Argentina, Chile, Colombia, and Peru",
  }),
  Object.freeze({
    key: "africa",
    country_code: "ZA",
    country_codes: ["EG", "KE", "MA", "MU", "NG", "ZA"],
    prompt: "Africa, including South Africa, Egypt, Morocco, Kenya, Mauritius, and Nigeria",
  }),
]);

const CHAIN_SYSTEM_PROMPT = [
  "You are researching branch-level locations for a health and longevity directory.",
  "Use web search and return strict JSON only.",
  "Use the chain's official website, official locations pages, and official branch pages as primary evidence.",
  "Return one object per currently operating physical branch.",
  "Only include a branch when that branch or the chain-wide official service menu supports at least one requested treatment.",
  "Never invent an address, branch, treatment, URL, contact, or price.",
  "Exclude equipment sellers, mobile-only services, telehealth-only services, and virtual locations.",
].join(" ");

export async function expandDiscoveredChains({
  campaign,
  runId,
  apply = false,
  model = CHAIN_EXPANSION_DEFAULT_MODEL,
  concurrency = CHAIN_EXPANSION_DEFAULT_CONCURRENCY,
  limit = null,
}, operations = {}) {
  const query = operations.query || defaultQuery;
  const chains = await loadChains({ campaign, limit }, { query });
  const regions = String(campaign).startsWith("international_metro_")
    ? GLOBAL_REGIONS
    : COVERAGE_REGIONS;
  const jobs = chains.flatMap((chain) => regions.map((region, regionIndex) => ({
    id: chain.ordinal * regions.length + regionIndex + 1,
    chain,
    region,
  })));
  if (!apply) {
    return {
      chains: chains.length,
      planned_queries: jobs.length,
      regions_per_chain: regions.length,
      sample: jobs.slice(0, 12).map((job) => ({
        chain_name: job.chain.chain_name,
        chain_locations_url: job.chain.chain_locations_url,
        region: job.region.key,
        treatments: job.chain.treatments,
      })),
    };
  }

  const webSearch = operations.webSearch || createOpenRouterAgentWebSearch({
    model,
    maxResults: 10,
    maxCharacters: 4_000,
    maxTokens: 8_000,
    systemPrompt: CHAIN_SYSTEM_PROMPT,
    callType: "chain_expansion_web_search",
    title: "Fountain chain expansion",
  });
  const results = new Array(jobs.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      const discoveryQuery = {
        id: job.id,
        market: `${job.chain.chain_name}:${job.region.key}`,
        group: "chain_expansion",
        treatments: job.chain.treatments,
      };
      try {
        const response = await webSearch({
          query: buildChainPrompt(job),
          runId,
          location: job.region.country_codes
            ? null
            : { country_code: job.region.country_code },
        });
        const candidates = parsePlaceDiscoveryContent(response.content)
          .map((place) => normalizeDiscoveredPlace({
            ...place,
            chain_name: place.chain_name || job.chain.chain_name,
            chain_locations_url: place.chain_locations_url || job.chain.chain_locations_url,
          }, {
            market: discoveryQuery.market,
            group: "chain_expansion",
            citations: response.results,
            allowOutsideCalifornia: true,
            allowedCountries: job.region.country_codes || [job.region.country_code],
            defaultCurrency: job.region.currency || null,
          }))
          .filter((candidate) => (
            candidate
            && sameDomainFamily(candidate.website, job.chain.chain_locations_url)
          ));
        await recordDiscoverySearch({
          campaign,
          discoveryQuery,
          runId,
          response,
          candidates,
          error: null,
        }, { query });
        results[index] = {
          status: "completed",
          chain_name: job.chain.chain_name,
          region: job.region.key,
          candidates: candidates.length,
          needs_review: candidates.filter((candidate) => candidate.status === "needs_review").length,
          cost_estimate_usd: response.costEstimateUsd,
        };
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
          status: "failed",
          chain_name: job.chain.chain_name,
          region: job.region.key,
          candidates: 0,
          needs_review: 0,
          error: String(error?.message || error),
        };
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(positiveInteger(concurrency, "concurrency"), Math.max(1, jobs.length)) },
    () => worker(),
  ));
  return {
    chains: chains.length,
    planned_queries: jobs.length,
    completed_queries: results.filter((result) => result.status === "completed").length,
    failed_queries: results.filter((result) => result.status === "failed").length,
    candidates_returned: sum(results, "candidates"),
    needs_review: sum(results, "needs_review"),
    model,
    concurrency,
    results,
  };
}

function buildChainPrompt({ chain, region }) {
  return [
    `Chain: ${chain.chain_name}`,
    `Official locations page: ${chain.chain_locations_url}`,
    `Requested treatments already evidenced for this chain: ${chain.treatments.join(", ")}`,
    region.prompt
      ? `Enumerate all qualifying branches in ${region.prompt}.`
      : `Enumerate all qualifying ${region.country_name} branches in these states or provinces: ${region.states}.`,
    "Do not include a branch merely because the chain exists there; treatment availability must be supported by an official branch or chain-wide service page.",
    "Return as many qualifying branches as the evidence supports. Use null for unknown scalars and [] for unknown arrays.",
    "JSON schema:",
    JSON.stringify({
      places: [{
        name: "branch-specific display name",
        website: "official branch or chain URL",
        address: "full street address",
        locality: "city",
        region: "state, province, emirate, or first-level administrative region",
        postal_code: "string",
        country_code: region.country_codes
          ? "ISO 3166-1 alpha-2 country code"
          : region.country_code,
        phone: "string or null",
        email: "string or null",
        image_url: "official image URL or null",
        matched_treatments: ["supported requested treatment"],
        offerings: [{
          name: "menu item",
          price_amount: "number or null",
          price_currency: region.currency ? `${region.currency} or null` : "local ISO currency or null",
          price_text: "short context or null",
          source_url: "official source URL",
        }],
        chain_name: chain.chain_name,
        chain_locations_url: chain.chain_locations_url,
        evidence_urls: ["official URLs supporting branch and treatment"],
        physical_location: true,
      }],
    }),
  ].join("\n");
}

async function loadChains({ campaign, limit }, { query }) {
  const params = [campaign];
  const namedResult = await query(
    `
      SELECT
        row_number() OVER (
          ORDER BY lower(candidate.chain_name), lower(candidate.chain_locations_url)
        ) - 1 AS ordinal,
        candidate.chain_name,
        candidate.chain_locations_url,
        (
          SELECT COALESCE(jsonb_agg(DISTINCT treatment.value ORDER BY treatment.value), '[]'::jsonb)
          FROM fountain_raw.agent_discovery_candidates sibling
          CROSS JOIN LATERAL jsonb_array_elements_text(sibling.matched_treatments) treatment(value)
          WHERE sibling.campaign = $1
            AND (
              sibling.status IN ('ready', 'existing_match')
              OR (sibling.address_verified = true AND sibling.treatment_verified = true)
            )
            AND sibling.chain_name = candidate.chain_name
            AND sibling.chain_locations_url = candidate.chain_locations_url
        ) AS treatments,
        count(*)::integer AS discovered_branches
      FROM fountain_raw.agent_discovery_candidates candidate
      WHERE candidate.campaign = $1
        AND (
          candidate.status IN ('ready', 'existing_match')
          OR (candidate.address_verified = true AND candidate.treatment_verified = true)
        )
        AND candidate.chain_name IS NOT NULL
        AND candidate.chain_locations_url IS NOT NULL
        AND jsonb_array_length(candidate.matched_treatments) > 0
      GROUP BY candidate.chain_name, candidate.chain_locations_url
      ORDER BY lower(candidate.chain_name), lower(candidate.chain_locations_url)
    `,
    params,
  );
  const inferredResult = await query(
    `
      WITH eligible AS (
        SELECT
          candidate.*,
          lower(regexp_replace(
            split_part(regexp_replace(candidate.website, '^https?://', '', 'i'), '/', 1),
            '^www\\.', '', 'i'
          )) AS website_domain
        FROM fountain_raw.agent_discovery_candidates candidate
        WHERE candidate.campaign = $1
          AND (
            candidate.status IN ('ready', 'existing_match')
            OR (candidate.address_verified = true AND candidate.treatment_verified = true)
          )
          AND candidate.website IS NOT NULL
          AND jsonb_array_length(candidate.matched_treatments) > 0
      )
      SELECT
        (array_agg(eligible.name ORDER BY eligible.id))[1] AS chain_name,
        'https://' || eligible.website_domain || '/' AS chain_locations_url,
        (
          SELECT COALESCE(jsonb_agg(DISTINCT treatment.value ORDER BY treatment.value), '[]'::jsonb)
          FROM eligible sibling
          CROSS JOIN LATERAL jsonb_array_elements_text(sibling.matched_treatments) treatment(value)
          WHERE sibling.website_domain = eligible.website_domain
        ) AS treatments,
        count(DISTINCT lower(regexp_replace(eligible.address, '[^a-z0-9]', '', 'g')))::integer
          AS discovered_branches
      FROM eligible
      WHERE eligible.website_domain <> ''
      GROUP BY eligible.website_domain
      HAVING count(DISTINCT lower(regexp_replace(eligible.address, '[^a-z0-9]', '', 'g'))) > 1
         AND count(DISTINCT lower(eligible.locality)) > 1
      ORDER BY lower((array_agg(eligible.name ORDER BY eligible.id))[1])
    `,
    [campaign],
  );
  const expandedResult = await query(
    `
      SELECT DISTINCT chain_name, chain_locations_url
      FROM fountain_raw.agent_discovery_candidates
      WHERE campaign = $1
        AND discovered_groups ? 'chain_expansion'
    `,
    [campaign],
  );
  const expandedNames = new Set((expandedResult.rows || []).map(
    (row) => String(row.chain_name || "").trim().toLowerCase(),
  ));
  const expandedDomains = new Set((expandedResult.rows || [])
    .map((row) => hostname(row.chain_locations_url))
    .filter(Boolean));
  const rows = [...(namedResult.rows || []), ...(inferredResult.rows || [])];
  const deduplicated = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${String(row.chain_name).toLowerCase()}\0${hostname(row.chain_locations_url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(row);
  }
  const unexpanded = deduplicated.filter((row) => (
    !expandedNames.has(String(row.chain_name).trim().toLowerCase())
    && !expandedDomains.has(hostname(row.chain_locations_url))
  ));
  const selected = limit == null
    ? unexpanded
    : unexpanded.slice(0, positiveInteger(limit, "limit"));
  return selected.map((row, index) => ({
    ...row,
    ordinal: index,
    treatments: Array.isArray(row.treatments) ? row.treatments : [],
  }));
}

function hostname(value) {
  try {
    return new URL(String(value || "")).hostname.replace(/^www\./u, "").toLowerCase();
  } catch {
    return "";
  }
}

function sameDomainFamily(left, right) {
  const leftHost = hostname(left);
  const rightHost = hostname(right);
  return Boolean(leftHost && rightHost && (
    leftHost === rightHost
    || leftHost.endsWith(`.${rightHost}`)
    || rightHost.endsWith(`.${leftHost}`)
  ));
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
