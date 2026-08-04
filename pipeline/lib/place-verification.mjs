import { query as defaultQuery } from "./db.mjs";
import { createWebClient } from "./web.mjs";

export const PLACE_VERIFICATION_DEFAULT_CONCURRENCY = 12;
export const PLACE_VERIFICATION_PAGE_LIMIT = 6;

const STREET_STOPWORDS = new Set([
  "street", "st", "avenue", "ave", "road", "rd", "boulevard", "blvd",
  "drive", "dr", "lane", "ln", "court", "ct", "way", "highway", "hwy",
  "suite", "ste", "unit", "floor", "fl", "level", "building", "bldg",
]);

export async function verifyDiscoveredPlaces({
  campaign,
  apply = false,
  concurrency = PLACE_VERIFICATION_DEFAULT_CONCURRENCY,
  limit = null,
}, operations = {}) {
  const query = operations.query || defaultQuery;
  const candidates = await loadCandidates({ campaign, limit }, { query });
  if (!apply) {
    return {
      selected: candidates.length,
      pages_planned_max: candidates.length * PLACE_VERIFICATION_PAGE_LIMIT,
      sample: candidates.slice(0, 10).map((candidate) => ({
        id: Number(candidate.id),
        name: candidate.name,
        address: candidate.address,
        website: candidate.website,
        matched_treatments: candidate.matched_treatments,
      })),
    };
  }

  const webClient = operations.webClient || createWebClient({ maxExcerptChars: 200_000 });
  const results = new Array(candidates.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) return;
      const candidate = candidates[index];
      const verification = await verifyCandidate(candidate, { webClient });
      const status = verification.address_verified && verification.treatment_verified
        ? "discovered"
        : "needs_review";
      await query(
        `
          UPDATE fountain_raw.agent_discovery_candidates
          SET official_site_verification = $2::jsonb,
              address_verified = $3,
              treatment_verified = $4,
              status = $5,
              updated_at = now()
          WHERE id = $1
            AND status = 'discovered'
        `,
        [
          candidate.id,
          JSON.stringify(verification),
          verification.address_verified,
          verification.treatment_verified,
          status,
        ],
      );
      results[index] = {
        candidate_id: Number(candidate.id),
        status,
        address_verified: verification.address_verified ? 1 : 0,
        treatment_verified: verification.treatment_verified ? 1 : 0,
        fully_verified: status === "discovered" ? 1 : 0,
        pages_ok: verification.pages.filter((page) => page.ok).length,
      };
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(positiveInteger(concurrency, "concurrency"), Math.max(1, candidates.length)) },
    () => worker(),
  ));
  return {
    selected: candidates.length,
    address_verified: count(results, "address_verified"),
    treatment_verified: count(results, "treatment_verified"),
    fully_verified: count(results, "fully_verified"),
    needs_review: results.filter((result) => result.status === "needs_review").length,
    pages_ok: count(results, "pages_ok"),
    results,
  };
}

export async function verifyCandidate(candidate, { webClient }) {
  const urls = candidateUrls(candidate).slice(0, PLACE_VERIFICATION_PAGE_LIMIT);
  const pages = [];
  for (const url of urls) {
    const page = await webClient.fetchHomepage(url);
    pages.push({
      url,
      ok: Boolean(page.ok),
      outcome: page.outcome,
      final_url: page.finalUrl || null,
      cached: Boolean(page.cached),
      text: page.ok ? String(page.textExcerpt || "") : "",
    });
  }
  const combinedText = normalizeText(pages.filter((page) => page.ok).map((page) => page.text).join(" "));
  const address = addressEvidence(candidate.address, combinedText);
  const treatment = treatmentEvidence(candidate.matched_treatments, combinedText);
  return {
    address_verified: address.verified,
    treatment_verified: treatment.verified,
    address_evidence: address,
    treatment_evidence: treatment,
    pages: pages.map(({ text: _text, ...page }) => page),
  };
}

export function addressEvidence(address, normalizedPageText) {
  const normalizedAddress = normalizeText(address);
  const streetSegment = normalizeText(String(address || "").split(",")[0]);
  const numbers = [...streetSegment.matchAll(/\b\d+[a-z]?\b/gu)].map((match) => match[0]);
  const tokens = streetSegment.split(" ").filter((token) => (
    token.length >= 3
    && !STREET_STOPWORDS.has(token)
    && !/^\d+[a-z]?$/u.test(token)
  ));
  const matchedNumbers = numbers.filter((number) => hasToken(normalizedPageText, number));
  const matchedTokens = tokens.filter((token) => hasToken(normalizedPageText, token));
  const requiredTokens = Math.max(1, Math.ceil(tokens.length / 2));
  const numberedAddressVerified = numbers.length > 0
    && matchedNumbers.length > 0
    && tokens.length > 0
    && matchedTokens.length >= requiredTokens;
  const unnumberedAddressVerified = numbers.length === 0
    && tokens.length >= 2
    && matchedTokens.length >= Math.max(2, requiredTokens);
  return {
    verified: Boolean(
      normalizedAddress
      && (numberedAddressVerified || unnumberedAddressVerified)
    ),
    street_numbers: numbers,
    matched_street_numbers: matchedNumbers,
    street_tokens: tokens,
    matched_street_tokens: matchedTokens,
    required_street_tokens: requiredTokens,
  };
}

export function treatmentEvidence(treatments, normalizedPageText) {
  const pageText = normalizeText(normalizedPageText);
  const evidence = (Array.isArray(treatments) ? treatments : []).map((treatment) => {
    const normalized = normalizeText(treatment);
    const patterns = treatmentPatterns(normalized);
    const matched = patterns.filter((pattern) => pageText.includes(pattern));
    return { treatment, patterns, matched, verified: matched.length > 0 };
  });
  return {
    verified: evidence.some((item) => item.verified),
    treatments: evidence,
  };
}

function treatmentPatterns(normalized) {
  const patterns = [];
  if (/\bfull body mri\b/u.test(normalized)) {
    patterns.push(
      "full body mri",
      "whole body mri",
      "full body magnetic resonance",
      "whole body magnetic resonance",
    );
  } else if (/\bmri\b/u.test(normalized)) {
    patterns.push("mri", "magnetic resonance");
  }
  if (/\bfull body ct\b/u.test(normalized)) {
    patterns.push(
      "full body ct",
      "whole body ct",
      "full body computed tomography",
      "whole body computed tomography",
    );
  } else if (/\bct\b/u.test(normalized)) {
    patterns.push("ct scan", "computed tomography");
  }
  if (/\badvanced biomarker panel\b/u.test(normalized)) {
    patterns.push(
      "advanced biomarker",
      "comprehensive biomarker",
      "biomarker panel",
      "cellular biomarker",
    );
  }
  if (/\badvanced blood panel\b/u.test(normalized)) {
    patterns.push(
      "advanced blood panel",
      "comprehensive blood panel",
      "comprehensive blood test",
      "extensive blood panel",
    );
  }
  const rules = [
    [/\bcryotherapy\b/u, ["cryotherapy", "cryotherapie"]],
    [/\bnad\b/u, ["nad"]],
    [/\bsauna\b/u, ["sauna", "infrared"]],
    [/\bketamine\b/u, ["ketamine"]],
    [/\bpeptide\b/u, ["peptide"]],
    [/\bbpc 157\b/u, ["bpc 157", "bpc157"]],
    [/\bmots c\b/u, ["mots c", "motsc"]],
    [/\btelomere\b/u, ["telomere"]],
    [/\bepigenetic\b/u, ["epigenetic", "biological age"]],
    [/\bhormone\b/u, ["hormone"]],
    [/\bcardiometabolic\b/u, ["cardiometabolic", "cardio metabolic"]],
    [/\bcardiac\b/u, ["cardiac", "heart screening"]],
    [/\bcancer\b/u, [
      "cancer screening",
      "cancer risk testing",
      "multi cancer early detection",
      "multicancer early detection",
    ]],
    [/\bsleep\b/u, ["sleep study", "sleep studies", "polysomnography"]],
    [/\biv\b/u, ["iv therapy", "iv infusion", "iv drip", "intravenous"]],
    [/\bvitamin b\b/u, ["vitamin b", "b12", "b 12"]],
    [/\bvitamin d\b/u, ["vitamin d"]],
    [/\bbiomarker\b(?! panel)/u, ["biomarker"]],
    [/\bblood\b(?! panel)/u, ["blood panel", "blood test", "lab testing"]],
  ];
  for (const [rule, values] of rules) {
    if (rule.test(normalized)) patterns.push(...values);
  }
  if (patterns.length === 0 && normalized) patterns.push(normalized);
  return [...new Set(patterns)];
}

async function loadCandidates({ campaign, limit }, { query }) {
  const params = [campaign];
  const limitClause = limit == null ? "" : `LIMIT $${params.push(positiveInteger(limit, "limit"))}`;
  const result = await query(
    `
      SELECT *
      FROM fountain_raw.agent_discovery_candidates
      WHERE campaign = $1
        AND status = 'discovered'
        AND promoted_location_id IS NULL
        AND official_site_verification IS NULL
      ORDER BY id
      ${limitClause}
    `,
    params,
  );
  return result.rows || [];
}

function candidateUrls(candidate) {
  const websiteHost = hostname(candidate.website);
  const values = [
    ...(Array.isArray(candidate.evidence_urls) ? candidate.evidence_urls : []),
    ...(Array.isArray(candidate.offerings)
      ? candidate.offerings.map((offering) => offering?.source_url)
      : []),
    candidate.website,
  ].filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const url = httpUrl(value);
    if (!url || seen.has(url)) continue;
    if (websiteHost && hostname(url) !== websiteHost) continue;
    seen.add(url);
    unique.push(url);
  }
  return unique;
}

function httpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function hostname(value) {
  const url = httpUrl(value);
  return url ? new URL(url).hostname.replace(/^www\./u, "").toLowerCase() : null;
}

function normalizeText(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function hasToken(haystack, needle) {
  return (` ${haystack} `).includes(` ${needle} `);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}

function count(results, field) {
  return results.reduce((total, result) => total + Number(result?.[field] || 0), 0);
}
