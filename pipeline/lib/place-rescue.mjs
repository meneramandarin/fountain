import { createHash } from "node:crypto";

import { createOpenRouterAgentWebSearch } from "./openrouter-web-search.mjs";
import {
  normalizeDiscoveredPlace,
  recordDiscoverySearch,
} from "./place-discovery.mjs";
import { query as defaultQuery } from "./db.mjs";
import { isNonOfficialWebsite } from "./place-promotion.mjs";
import { createOfficialSiteForensics } from "./official-site-forensics.mjs";

export const PLACE_RESCUE_PROMPT_VERSION = "place-rescue-v2";
export const PLACE_RESCUE_DEFAULT_CONCURRENCY = 48;
export const PLACE_RESCUE_DEFAULT_MODEL = "openai/gpt-4o-mini";
export const PLACE_RESCUE_DEFAULT_BATCH_SIZE = 10;

const RESCUE_MARKER = "_held_rescue_v2";
const RESCUE_SYSTEM_PROMPT = [
  "You are a high-precision local-business rescue researcher.",
  "Use web search and return strict JSON only.",
  "Research the supplied held candidate identities in parallel, using official business websites.",
  "First exhaust the supplied first-party crawl evidence, which was collected from the official domain.",
  "Inspect official contact, location, sitemap, structured-data, embedded-directions, and branch-page evidence.",
  "Recover exact physical branch addresses and official evidence for the requested treatments.",
  "Do not use Google Maps, directories, aggregators, booking marketplaces, social profiles, or review sites as evidence.",
  "Do not add unrelated branches or businesses.",
  "Never invent an address, contact, treatment, price, URL, or chain relationship.",
  "Use null for unknown scalar values and [] for unknown arrays.",
].join(" ");

export async function rescueHeldPlaces({
  campaign,
  runId,
  apply = false,
  model = PLACE_RESCUE_DEFAULT_MODEL,
  concurrency = PLACE_RESCUE_DEFAULT_CONCURRENCY,
  batchSize = PLACE_RESCUE_DEFAULT_BATCH_SIZE,
  limit = null,
  budgetUsd = null,
  heldRescueOnly = false,
  addressUnverifiedOnly = false,
}, operations = {}) {
  const query = operations.query || defaultQuery;
  const candidates = await loadHeldCandidates({
    campaign,
    limit,
    heldRescueOnly,
    addressUnverifiedOnly,
  }, { query });
  const jobs = buildRescueJobs(candidates, { batchSize });
  if (!apply) {
    return {
      candidates: candidates.length,
      planned_queries: jobs.length,
      domains: new Set(jobs.map((job) => job.domain).filter(Boolean)).size,
      failure_classes: failureClassCounts(candidates),
      model,
      concurrency,
      batch_size: batchSize,
      budget_usd: budgetUsd,
      sample: jobs.slice(0, 5).map(publicJob),
    };
  }

  const webSearch = operations.webSearch || createOpenRouterAgentWebSearch({
    model,
    maxResults: 10,
    maxCharacters: 5_000,
    maxTokens: 6_000,
    systemPrompt: RESCUE_SYSTEM_PROMPT,
    callType: "held_place_rescue_web_search",
    title: "Fountain held-candidate rescue",
  });
  const inspectOfficialSite = operations.inspectOfficialSite
    || createOfficialSiteForensics({
      maxPages: operations.maxSitePages || 12,
    });
  const results = new Array(jobs.length);
  let cursor = 0;
  let budgetExhausted = false;
  const loadSpend = async () => {
    if (operations.getRunSpend) return Number(await operations.getRunSpend(runId));
    const spend = await query(
      `SELECT COALESCE(sum(cost_estimate_usd), 0)::numeric AS spend
       FROM fountain_ops.external_calls WHERE run_id = $1`,
      [runId],
    );
    return Number(spend.rows?.[0]?.spend || 0);
  };

  async function worker() {
    while (true) {
      if (budgetUsd != null && await loadSpend() >= Number(budgetUsd)) {
        budgetExhausted = true;
        return;
      }
      const index = cursor++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      try {
        results[index] = await executeRescueJob({
          campaign,
          job,
          runId,
          webSearch,
          inspectOfficialSite,
          query,
        });
      } catch (error) {
        await recordDiscoverySearch({
          campaign,
          discoveryQuery: discoveryQueryForJob(job),
          runId,
          response: null,
          candidates: [],
          error,
        }, { query });
        results[index] = {
          job_id: job.id,
          status: "failed",
          source_candidates: job.candidates.length,
          rescued_proposals: 0,
          inserted_or_updated: 0,
          error: errorMessage(error),
        };
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(positiveInteger(concurrency, "concurrency"), Math.max(1, jobs.length)) },
    () => worker(),
  ));
  const completed = results.filter(Boolean);
  return {
    candidates: candidates.length,
    planned_queries: jobs.length,
    completed_queries: completed.filter((result) => result.status === "completed").length,
    failed_queries: completed.filter((result) => result.status === "failed").length,
    skipped_for_budget: jobs.length - completed.length,
    budget_exhausted: budgetExhausted,
    spend_usd: await loadSpend(),
    rescued_proposals: sum(completed, "rescued_proposals"),
    inserted_or_updated: sum(completed, "inserted_or_updated"),
    unresolved_sources: sum(completed, "unresolved_sources"),
    model,
    concurrency,
    batch_size: batchSize,
    held_rescue_only: heldRescueOnly,
    address_unverified_only: addressUnverifiedOnly,
    official_pages_fetched: sum(completed, "official_pages_fetched"),
    official_pages_with_evidence: sum(completed, "official_pages_with_evidence"),
    results: completed,
  };
}

export function buildRescueJobs(candidates, { batchSize = PLACE_RESCUE_DEFAULT_BATCH_SIZE } = {}) {
  const size = positiveInteger(batchSize, "batchSize");
  const groups = new Map();
  for (const candidate of candidates) {
    const domain = hostname(candidate.website);
    const fallback = [
      normalizeIdentity(candidate.name),
      normalizeIdentity(candidate.locality),
      String(candidate.country_code || "").toUpperCase(),
    ].join(":");
    const key = [
      candidate.campaign,
      domain || fallback,
      String(candidate.country_code || "").toUpperCase(),
      normalizeIdentity(candidate.region),
    ].join("|");
    if (!groups.has(key)) groups.set(key, { domain, candidates: [] });
    groups.get(key).candidates.push(candidate);
  }
  const jobs = [];
  for (const [groupKey, group] of groups) {
    const ordered = [...group.candidates].sort((a, b) => Number(a.id) - Number(b.id));
    for (let offset = 0; offset < ordered.length; offset += size) {
      const chunk = ordered.slice(offset, offset + size);
      jobs.push({
        key: `held-rescue-${shortHash(`${groupKey}|${offset}`)}`,
        domain: group.domain,
        country_code: String(chunk[0]?.country_code || "").toUpperCase(),
        region: chunk[0]?.region || null,
        candidates: chunk,
      });
    }
  }
  return jobs
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((job, index) => ({ ...job, id: index + 1 }));
}

export function buildPlaceRescuePrompt(job, officialSiteEvidence = []) {
  return [
    `Official domain already associated with this batch: ${job.domain || "unknown"}.`,
    `Country: ${job.country_code || "unknown"}; region: ${job.region || "unknown"}.`,
    "For each supplied candidate, find the exact official branch page and exact physical address.",
    "At least one originally requested treatment must be explicitly supported by an official page.",
    "Return source_candidate_ids so every recovered place is tied to its supplied input identity.",
    "If multiple inputs are the same physical location, return one place with all applicable source IDs.",
    "If a candidate cannot be resolved confidently, put its ID in unresolved. Do not substitute a nearby business.",
    "First-party crawl evidence follows. It may expose JSON-LD, JavaScript hydration data,",
    "embedded directions, or text from deeper official pages. Prefer a unique branch-specific",
    "structured address. Treat conflicting addresses as ambiguous and never reuse another branch.",
    JSON.stringify(officialSiteEvidence.map(compactOfficialSiteEvidence)),
    "Input candidates:",
    JSON.stringify(job.candidates.map((candidate) => ({
      source_candidate_id: Number(candidate.id),
      name: candidate.name,
      website: candidate.website,
      address: candidate.address,
      locality: candidate.locality,
      region: candidate.region,
      postal_code: candidate.postal_code,
      country_code: candidate.country_code,
      chain_name: candidate.chain_name,
      matched_treatments: candidate.matched_treatments,
      evidence_urls: candidate.evidence_urls,
      prior_failure: classifyHeldReason(candidate),
    }))),
    "Return strict JSON using this schema:",
    JSON.stringify({
      places: [{
        source_candidate_ids: [123],
        name: "branch-specific display name",
        website: "official branch or business URL",
        address: "exact full physical address",
        locality: "city",
        region: "state, province, emirate, or administrative region",
        postal_code: "string or null",
        country_code: "ISO 3166-1 alpha-2 code",
        phone: "string or null",
        email: "string or null",
        image_url: "official image URL or null",
        offerings: [{
          name: "official menu item",
          price_amount: "number or null",
          price_currency: "ISO currency code or null",
          price_text: "short official price context or null",
          source_url: "official source URL",
        }],
        chain_name: "string or null",
        chain_locations_url: "official locations URL or null",
        evidence_urls: ["official branch/address and treatment URLs"],
        physical_location: true,
      }],
      unresolved: [{
        source_candidate_ids: [456],
        reason: "not_found, closed, ambiguous, or non_qualifying",
      }],
    }),
  ].join("\n");
}

export function parsePlaceRescueContent(content) {
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
      if (parsed && Array.isArray(parsed.places) && Array.isArray(parsed.unresolved || [])) {
        return { places: parsed.places, unresolved: parsed.unresolved || [] };
      }
    } catch {
      // Try the next bounded extraction.
    }
  }
  throw new Error("Held-candidate rescue response was not valid JSON.");
}

export function normalizeRescueProposal(place, job, citations = []) {
  if (!place || place.physical_location === false) return null;
  const sourceIds = uniquePositiveIntegers(place.source_candidate_ids);
  if (sourceIds.length === 0) return null;
  const allowedIds = new Set(job.candidates.map((candidate) => Number(candidate.id)));
  if (sourceIds.some((id) => !allowedIds.has(id))) return null;
  const sources = job.candidates.filter((candidate) => sourceIds.includes(Number(candidate.id)));
  if (sources.length === 0 || !identitySupported(place, sources)) return null;
  const countries = new Set(sources.map((source) => String(source.country_code || "").toUpperCase()));
  const countryCode = String(place.country_code || "").toUpperCase();
  if (countries.size !== 1 || !countries.has(countryCode)) return null;

  const website = httpUrl(place.website);
  if (!website || isNonOfficialWebsite(website)) return null;
  const sourceOfficialDomains = sources
    .map((source) => source.website)
    .filter((url) => url && !isNonOfficialWebsite(url))
    .map(hostname)
    .filter(Boolean);
  if (
    sourceOfficialDomains.length > 0
    && !sourceOfficialDomains.some((domain) => sameDomainFamily(website, `https://${domain}`))
  ) return null;
  if (!citations.some((citation) => sameDomainFamily(website, citation?.url))) return null;

  const treatments = uniqueStrings(sources.flatMap((source) => source.matched_treatments || []));
  if (treatments.length === 0) return null;
  const evidenceUrls = uniqueStrings([
    website,
    ...(Array.isArray(place.evidence_urls) ? place.evidence_urls : []),
  ].map(httpUrl).filter((url) => url && sameDomainFamily(website, url)));
  const offerings = (Array.isArray(place.offerings) ? place.offerings : [])
    .filter((offering) => sameDomainFamily(website, offering?.source_url));
  const normalized = normalizeDiscoveredPlace({
    ...place,
    website,
    country_code: countryCode,
    matched_treatments: treatments,
    evidence_urls: evidenceUrls,
    offerings,
    image_url: sameDomainFamily(website, place.image_url) ? place.image_url : null,
    source_candidate_ids: sourceIds,
  }, {
    market: uniqueStrings(sources.flatMap((source) => source.discovered_markets || [])).join(" | "),
    group: "held_rescue",
    citations,
    allowOutsideCalifornia: true,
    allowedCountries: [...countries],
    defaultRegion: sources[0]?.region || null,
    defaultCurrency: null,
  });
  if (!normalized || normalized.status !== "discovered") return null;
  normalized.discovered_markets = uniqueStrings(
    sources.flatMap((source) => source.discovered_markets || []),
  );
  normalized.discovered_groups = uniqueStrings([
    ...sources.flatMap((source) => source.discovered_groups || []),
    "held_rescue",
  ]);
  normalized.agent_payload = { ...place, source_candidate_ids: sourceIds };
  return normalized;
}

export function classifyHeldReason(candidate) {
  if (!candidate.official_site_verification) return "initial_gate";
  if (candidate.address_verified !== true && candidate.treatment_verified !== true) {
    return "official_neither";
  }
  if (candidate.address_verified !== true) return "official_address_missing";
  if (candidate.treatment_verified !== true) return "official_treatment_missing";
  if (candidate.match_result?.status === "review") return "identity_ambiguity";
  if (candidate.latitude == null || candidate.longitude == null) return "coordinate_unresolved";
  return "promotion_review";
}

async function executeRescueJob({
  campaign,
  job,
  runId,
  webSearch,
  inspectOfficialSite,
  query,
}) {
  const officialSiteEvidence = await Promise.all(job.candidates.map(async (candidate) => {
    try {
      return await inspectOfficialSite(candidate);
    } catch (error) {
      return {
        source_candidate_id: Number(candidate.id),
        website: candidate.website,
        outcome: "crawl_failed",
        pages_fetched: 0,
        pages_with_evidence: 0,
        pages: [],
        failures: [{ error: errorMessage(error) }],
      };
    }
  }));
  const response = await webSearch({
    query: buildPlaceRescuePrompt(job, officialSiteEvidence),
    runId,
    location: {
      region: job.region,
      country_code: job.country_code,
    },
  });
  const parsed = parsePlaceRescueContent(response.content);
  const crawlCitations = officialSiteEvidence.flatMap((evidence) => (
    (evidence.pages || []).map((page) => ({
      url: page.url,
      title: page.title || null,
      snippet: JSON.stringify({
        structured_addresses: page.structured_addresses,
        structured_coordinates: page.structured_coordinates,
        embedded_location_urls: page.embedded_location_urls,
        text_snippets: page.text_snippets,
      }).slice(0, 5_000),
      source: "official_site_crawl",
    }))
  )).filter((citation) => citation.url);
  const combinedCitations = uniqueCitations([
    ...crawlCitations,
    ...(response.results || []),
  ]);
  const candidates = parsed.places
    .map((place) => normalizeRescueProposal(place, job, combinedCitations))
    .filter(Boolean);
  const stored = await recordDiscoverySearch({
    campaign,
    discoveryQuery: discoveryQueryForJob(job),
    runId,
    response: { ...response, results: combinedCitations },
    candidates,
    error: null,
  }, { query });

  const candidateKeys = candidates.map((candidate) => candidate.candidate_key);
  if (candidateKeys.length > 0) {
    await query(
      `
        UPDATE fountain_raw.agent_discovery_candidates
        SET official_site_verification = NULL,
            address_verified = false,
            treatment_verified = false,
            latitude = NULL,
            longitude = NULL,
            geocode_provider = NULL,
            geocode_result = NULL,
            match_result = NULL,
            status = 'discovered',
            updated_at = now()
        WHERE campaign = $1
          AND candidate_key = ANY($2::text[])
          AND promoted_location_id IS NULL
          AND status NOT IN ('existing_match', 'ready', 'promoted')
      `,
      [campaign, candidateKeys],
    );
  }
  const rescuedSourceIds = uniquePositiveIntegers(
    candidates.flatMap((candidate) => candidate.agent_payload?.source_candidate_ids || []),
  );
  const unresolvedSourceIds = uniquePositiveIntegers(
    parsed.unresolved.flatMap((item) => item?.source_candidate_ids || []),
  ).filter((id) => !rescuedSourceIds.includes(id));
  const attemptedIds = uniquePositiveIntegers([
    ...job.candidates.map((candidate) => candidate.id),
  ]);
  await query(
    `
      UPDATE fountain_raw.agent_discovery_candidates
      SET agent_payload = jsonb_set(
            coalesce(agent_payload, '{}'::jsonb),
            $2::text[],
            jsonb_build_object(
              'run_id', $3::bigint,
              'job_id', $4::text,
              'outcome', CASE
                WHEN id = ANY($5::bigint[]) THEN 'recovered'
                WHEN id = ANY($6::bigint[]) THEN 'unresolved'
                ELSE 'no_valid_proposal'
              END
            ),
            true
          ),
          updated_at = now()
      WHERE campaign = $1 AND id = ANY($7::bigint[])
        AND status = 'needs_review'
    `,
    [
      campaign,
      [RESCUE_MARKER],
      runId,
      job.key,
      rescuedSourceIds,
      unresolvedSourceIds,
      attemptedIds,
    ],
  );
  return {
    job_id: job.id,
    status: "completed",
    source_candidates: job.candidates.length,
    rescued_proposals: candidates.length,
    inserted_or_updated: stored.candidates,
    unresolved_sources: attemptedIds.length - rescuedSourceIds.length,
    cost_estimate_usd: response.costEstimateUsd,
    official_pages_fetched: sum(officialSiteEvidence, "pages_fetched"),
    official_pages_with_evidence: sum(officialSiteEvidence, "pages_with_evidence"),
  };
}

async function loadHeldCandidates({
  campaign,
  limit,
  heldRescueOnly = false,
  addressUnverifiedOnly = false,
}, { query }) {
  const params = [campaign, RESCUE_MARKER];
  const heldRescueClause = heldRescueOnly
    ? "AND coalesce(discovered_groups, '[]'::jsonb) ? 'held_rescue'"
    : "";
  const addressClause = addressUnverifiedOnly
    ? "AND address_verified IS DISTINCT FROM true"
    : "";
  const limitClause = limit == null ? "" : `LIMIT $${params.push(positiveInteger(limit, "limit"))}`;
  const result = await query(
    `
      SELECT *
      FROM fountain_raw.agent_discovery_candidates
      WHERE campaign = $1
        AND status = 'needs_review'
        AND promoted_location_id IS NULL
        AND NOT (coalesce(agent_payload, '{}'::jsonb) ? $2)
        ${heldRescueClause}
        ${addressClause}
      ORDER BY id
      ${limitClause}
    `,
    params,
  );
  return result.rows || [];
}

function compactOfficialSiteEvidence(evidence) {
  return {
    source_candidate_id: evidence.source_candidate_id,
    website: evidence.website,
    outcome: evidence.outcome,
    pages_fetched: evidence.pages_fetched,
    pages: (evidence.pages || []).slice(0, 6).map((page) => ({
      url: page.url,
      title: page.title,
      structured_addresses: (page.structured_addresses || []).slice(0, 10),
      structured_coordinates: (page.structured_coordinates || []).slice(0, 6),
      embedded_location_urls: (page.embedded_location_urls || []).slice(0, 8),
      text_snippets: (page.text_snippets || []).slice(0, 5),
    })),
    failures: (evidence.failures || []).slice(0, 4),
  };
}

function uniqueCitations(values) {
  const seen = new Set();
  return values.filter((value) => {
    const url = httpUrl(value?.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function discoveryQueryForJob(job) {
  return {
    id: job.id,
    key: job.key,
    market: `held_rescue:${job.domain || job.region || job.country_code}`,
    group: "held_rescue",
    treatments: uniqueStrings(
      job.candidates.flatMap((candidate) => candidate.matched_treatments || []),
    ),
  };
}

function failureClassCounts(candidates) {
  const counts = {};
  for (const candidate of candidates) {
    const reason = classifyHeldReason(candidate);
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}

function publicJob(job) {
  return {
    id: job.id,
    domain: job.domain,
    country_code: job.country_code,
    region: job.region,
    candidate_ids: job.candidates.map((candidate) => Number(candidate.id)),
  };
}

function identitySupported(place, sources) {
  const returnedTokens = meaningfulNameTokens(place.name);
  const returnedLocality = normalizeIdentity(place.locality);
  return sources.some((source) => {
    const sharedName = meaningfulNameTokens(source.name)
      .some((token) => returnedTokens.includes(token));
    const locality = normalizeIdentity(source.locality);
    const localityCompatible = !locality || !returnedLocality || locality === returnedLocality;
    return sharedName && localityCompatible;
  });
}

function meaningfulNameTokens(value) {
  const generic = new Set([
    "and", "center", "centre", "clinic", "health", "medical", "spa",
    "studio", "the", "therapy", "wellness",
  ]);
  return normalizeIdentity(value).split(" ")
    .filter((token) => token.length >= 3 && !generic.has(token));
}

function sameDomainFamily(left, right) {
  const a = hostname(left);
  const b = hostname(right);
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));
}

function hostname(value) {
  try {
    return new URL(String(value || "")).hostname.replace(/^www\./u, "").toLowerCase();
  } catch {
    return null;
  }
}

function httpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeIdentity(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function uniquePositiveIntegers(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + Number(row?.[field] || 0), 0);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
