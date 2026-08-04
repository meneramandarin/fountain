import { createWebClient, readCachedWebPage } from "./web.mjs";

export const OFFICIAL_SITE_FORENSICS_DEFAULT_MAX_PAGES = 12;
export const OFFICIAL_SITE_FORENSICS_DEFAULT_CONCURRENCY = 24;

const HIGH_VALUE_PATHS = [
  "/contact",
  "/contact-us",
  "/locations",
  "/location",
  "/our-locations",
  "/find-us",
  "/visit-us",
  "/about",
];

const PAGE_HINTS = [
  "address",
  "clinic",
  "contact",
  "direction",
  "find",
  "location",
  "office",
  "studio",
  "visit",
];

const STRUCTURED_ADDRESS_KEYS = new Set([
  "address",
  "address1",
  "address2",
  "addresslocality",
  "addressregion",
  "city",
  "formattedaddress",
  "fulladdress",
  "locality",
  "postalcode",
  "postcode",
  "region",
  "state",
  "street",
  "streetaddress",
  "zipcode",
  "zip",
]);

/**
 * Create a robots-aware, cached first-party crawler. It intentionally never
 * calls a maps/search API. Maps and booking URLs embedded by the official site
 * are retained only as evidence strings from that first-party page.
 */
export function createOfficialSiteForensics({
  webClient = createWebClient({
    maxBytes: 2_500_000,
    maxExcerptChars: 8_000,
    timeoutMs: 15_000,
  }),
  maxPages = OFFICIAL_SITE_FORENSICS_DEFAULT_MAX_PAGES,
  fetchPage = null,
} = {}) {
  const normalizedMaxPages = positiveInteger(maxPages, "maxPages");
  const loadPage = fetchPage || (async (url) => {
    const fetched = await webClient.fetchHomepage(url);
    const cached = await readCachedWebPage(url);
    return {
      ...fetched,
      html: cached?.html || "",
      finalUrl: cached?.url || fetched.finalUrl || url,
    };
  });

  return async function inspectOfficialSite(candidate) {
    return inspectOfficialSiteCandidate(candidate, {
      loadPage,
      maxPages: normalizedMaxPages,
    });
  };
}

export async function inspectOfficialSiteCandidate(candidate, {
  loadPage,
  maxPages = OFFICIAL_SITE_FORENSICS_DEFAULT_MAX_PAGES,
} = {}) {
  if (typeof loadPage !== "function") {
    throw new TypeError("inspectOfficialSiteCandidate requires loadPage.");
  }
  const website = httpUrl(candidate?.website);
  if (!website) {
    return emptyResult(candidate, "missing_official_website");
  }
  const seed = new URL(website);
  const origin = seed.origin;
  const candidateTerms = identityTerms([
    candidate?.name,
    candidate?.locality,
    candidate?.region,
    candidate?.postal_code,
  ]);
  const queue = uniqueUrls([
    website,
    `${origin}/`,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    ...HIGH_VALUE_PATHS.map((path) => `${origin}${path}`),
  ]);
  const queued = new Set(queue);
  const visited = new Set();
  const pages = [];
  const failures = [];

  while (queue.length > 0 && visited.size < positiveInteger(maxPages, "maxPages")) {
    queue.sort((left, right) => (
      pagePriority(right, candidateTerms, website) - pagePriority(left, candidateTerms, website)
    ));
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);

    let page;
    try {
      page = await loadPage(url);
    } catch (error) {
      failures.push({ url, outcome: "fetch_error", error: errorMessage(error) });
      continue;
    }
    const html = String(page?.html || "");
    if (!html) {
      failures.push({
        url,
        outcome: page?.outcome || "empty",
        status: page?.status ?? null,
      });
      continue;
    }
    const finalUrl = httpUrl(page?.finalUrl) || url;
    if (!sameDomainFamily(website, finalUrl)) {
      failures.push({ url, outcome: "off_domain_redirect", final_url: finalUrl });
      continue;
    }

    const extracted = extractOfficialPageEvidence(html, {
      sourceUrl: finalUrl,
      candidate,
      title: page?.title || null,
    });
    pages.push(extracted);

    const links = [
      ...extractSameSiteLinks(html, finalUrl, website),
      ...extractSitemapLinks(html, website),
    ];
    for (const link of links
      .sort((left, right) => (
        pagePriority(right, candidateTerms, website) - pagePriority(left, candidateTerms, website)
      ))
      .slice(0, 80)) {
      if (queued.has(link) || visited.has(link)) continue;
      queued.add(link);
      queue.push(link);
    }
  }

  const usefulPages = pages
    .filter((page) => pageHasEvidence(page))
    .sort((left, right) => evidenceScore(right, candidateTerms) - evidenceScore(left, candidateTerms));
  return {
    source_candidate_id: Number(candidate?.id) || null,
    website,
    outcome: usefulPages.length > 0 ? "evidence_found" : "no_address_signal",
    pages_fetched: pages.length,
    pages_with_evidence: usefulPages.length,
    pages: usefulPages.slice(0, 8),
    failures: failures.slice(0, 12),
  };
}

export function extractOfficialPageEvidence(html, {
  sourceUrl = null,
  candidate = {},
  title = null,
} = {}) {
  const structured = extractStructuredAddressEvidence(html);
  const embeddedUrls = extractEmbeddedLocationUrls(html, sourceUrl);
  const text = htmlToText(html);
  const visibleAddresses = extractVisibleAddressEvidence(text, candidate);
  const embeddedAddresses = extractEmbeddedUrlAddressEvidence(embeddedUrls, candidate);
  const literalAddresses = extractLiteralCandidateAddressEvidence(html, text, candidate);
  const terms = identityTerms([
    candidate?.locality,
    candidate?.region,
    candidate?.postal_code,
    "address",
    "location",
    "directions",
  ]);
  const snippets = extractSignalSnippets(text, terms);
  return {
    url: httpUrl(sourceUrl),
    title: cleanText(title) || extractTitle(html),
    structured_addresses: uniqueObjects([
      ...structured.addresses,
      ...visibleAddresses,
      ...embeddedAddresses,
      ...literalAddresses,
    ]).slice(0, 24),
    structured_coordinates: structured.coordinates.slice(0, 12),
    embedded_location_urls: embeddedUrls.slice(0, 20),
    text_snippets: snippets.slice(0, 12),
  };
}

export function extractLiteralCandidateAddressEvidence(html, visibleText, candidate = {}) {
  const address = cleanText(candidate?.address);
  const locality = cleanText(candidate?.locality);
  const countryCode = String(candidate?.country_code || "").toUpperCase();
  if (!address || !locality || !hasNonPostalAddressNumber(address, {
    countryCode,
    postalCode: candidate?.postal_code,
  })) return [];

  const normalizedAddress = normalizeIdentity(address);
  const normalizedVisible = normalizeIdentity(visibleText);
  const normalizedRaw = normalizeIdentity(`${decodeHtml(html)} ${embeddedJsonText(html)}`);
  if (
    !normalizedAddress
    || (!normalizedVisible.includes(normalizedAddress) && !normalizedRaw.includes(normalizedAddress))
  ) return [];

  const normalizedLocality = normalizeIdentity(locality);
  const normalizedPostal = normalizeIdentity(candidate?.postal_code);
  const pageIdentity = `${normalizedVisible} ${normalizedRaw}`;
  if (!pageIdentity.includes(normalizedLocality)) return [];
  if (
    ["US", "CA"].includes(countryCode)
    && normalizedPostal
    && !pageIdentity.includes(normalizedPostal)
  ) return [];

  return [{
    streetAddress: address,
    addressLocality: locality,
    addressRegion: cleanText(candidate?.region),
    postalCode: cleanText(candidate?.postal_code),
    addressCountry: countryCode || null,
    evidenceSource: "official_literal_address",
  }];
}

export function extractVisibleAddressEvidence(text, candidate = {}) {
  const locality = cleanText(candidate?.locality);
  const region = cleanText(candidate?.region);
  if (!locality) return [];
  const compact = cleanText(text) || "";
  const values = [];
  const streetPattern = /\b\d{1,6}[A-Za-z]?(?:[-–]\d{1,6})?\s+(?:[A-Za-zÀ-ÿ0-9.'’#&/-]+\s+){0,9}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Highway|Hwy|Parkway|Pkwy|Court|Ct|Place|Pl|Terrace|Ter|Trail|Trl|Circle|Cir|Plaza|Square|Courtyard)\b(?:[.,]?\s*(?:Suite|Ste|Unit|Floor|Fl|Room|Rm|#)\s*[A-Za-z0-9-]+)?/giu;
  for (const match of compact.matchAll(streetPattern)) {
    const start = match.index || 0;
    const context = compact.slice(Math.max(0, start - 40), Math.min(compact.length, start + match[0].length + 180));
    if (!placeTextIncludes(context, locality)) continue;
    const streetAddress = cleanText(match[0]);
    const numericGroups = streetAddress?.match(/\b\d+\b/gu) || [];
    if (
      !streetAddress
      || numericGroups[0] === "0"
      || numericGroups.length > 1
      || /\b(?:clinic|doctor|hours?|medical|price|scan|therapy|years?)\b/iu.test(streetAddress)
    ) continue;
    const postalCode = postalFromText(context, { exclude: numericGroups });
    if (region && !placeTextIncludes(context, region) && !postalCode) continue;
    if (["US", "CA"].includes(String(candidate?.country_code || "").toUpperCase()) && !postalCode) {
      continue;
    }
    values.push({
      streetAddress,
      addressLocality: locality,
      addressRegion: region,
      postalCode,
      evidenceSource: "official_visible_text",
    });
  }
  return uniqueObjects(values);
}

export function extractEmbeddedUrlAddressEvidence(urls, candidate = {}) {
  const values = [];
  for (const raw of urls || []) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    for (const key of ["q", "query", "destination", "daddr", "address"]) {
      const value = cleanText(url.searchParams.get(key));
      if (!value || !/\d/u.test(value)) continue;
      values.push(...extractVisibleAddressEvidence(value.replace(/\+/gu, " "), candidate)
        .map((address) => ({ ...address, evidenceSource: "official_embedded_directions" })));
    }
  }
  return uniqueObjects(values);
}

function extractStructuredAddressEvidence(html) {
  const addresses = [];
  const coordinates = [];
  const blocks = jsonScriptBlocks(html);
  const standaloneJson = standaloneJsonBlock(html);
  if (standaloneJson) blocks.push(standaloneJson);
  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(cleanJson(block));
    } catch {
      continue;
    }
    walkJson(parsed, (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const address = addressObject(value);
      if (address) addresses.push(address);
      const latitude = numericValue(value.latitude ?? value.lat);
      const longitude = numericValue(value.longitude ?? value.lng ?? value.lon);
      if (validCoordinates(latitude, longitude)) {
        coordinates.push({ latitude, longitude });
      }
    });
  }

  for (const match of String(html || "").matchAll(
    /<(?:meta|span|div|p)\b[^>]*\bitemprop\s*=\s*(?:"|')?(streetAddress|addressLocality|addressRegion|postalCode)(?:"|')?[^>]*>/giu,
  )) {
    const tag = match[0];
    const content = attributeValue(tag, "content")
      || htmlToText(tag)
      || null;
    if (content) addresses.push({ [match[1]]: cleanText(content) });
  }
  return {
    addresses: uniqueObjects(addresses),
    coordinates: uniqueObjects(coordinates),
  };
}

function extractEmbeddedLocationUrls(html, sourceUrl) {
  const urls = [];
  for (const match of String(html || "").matchAll(
    /\b(?:href|src|data-src)\s*=\s*(["'])(.*?)\1/giu,
  )) {
    const raw = decodeHtml(match[2]);
    let url;
    try {
      url = new URL(raw, sourceUrl || undefined);
    } catch {
      continue;
    }
    const haystack = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
    if (
      haystack.includes("maps")
      || haystack.includes("direction")
      || haystack.includes("daddr=")
      || haystack.includes("destination=")
      || haystack.includes("query=")
    ) {
      urls.push(url.href);
    }
  }
  return [...new Set(urls)];
}

function extractSameSiteLinks(html, pageUrl, officialWebsite) {
  const urls = [];
  for (const match of String(html || "").matchAll(/\bhref\s*=\s*(["'])(.*?)\1/giu)) {
    const raw = decodeHtml(match[2]);
    if (!raw || raw.startsWith("#") || /^(?:mailto|tel|javascript):/iu.test(raw)) continue;
    let url;
    try {
      url = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    url.hash = "";
    if (!["http:", "https:"].includes(url.protocol)) continue;
    if (!sameDomainFamily(officialWebsite, url.href)) continue;
    if (/\.(?:avif|css|gif|jpe?g|js|pdf|png|svg|webp|woff2?)(?:$|\?)/iu.test(url.href)) continue;
    urls.push(url.href);
  }
  return uniqueUrls(urls);
}

function extractSitemapLinks(html, officialWebsite) {
  const urls = [];
  for (const match of String(html || "").matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/giu)) {
    const url = httpUrl(decodeHtml(match[1]).trim());
    if (url && sameDomainFamily(officialWebsite, url)) urls.push(url);
  }
  return uniqueUrls(urls);
}

function jsonScriptBlocks(html) {
  const blocks = [];
  for (const match of String(html || "").matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu,
  )) {
    const attrs = match[1];
    if (
      /\btype\s*=\s*(?:(["'])application\/(?:ld\+)?json\1|application\/(?:ld\+)?json)(?:\s|>|$)/iu.test(attrs)
      || /\bid\s*=\s*(?:(["'])__NEXT_DATA__\1|__NEXT_DATA__)(?:\s|>|$)/iu.test(attrs)
    ) {
      blocks.push(match[2]);
    }
  }
  return blocks;
}

function walkJson(value, visitor) {
  const seen = new Set();
  const visit = (item) => {
    if (!item || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    visitor(item);
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
    } else {
      for (const child of Object.values(item)) visit(child);
    }
  };
  visit(value);
}

function addressObject(value) {
  const type = String(value?.["@type"] || "").toLowerCase();
  const entries = Object.entries(value || {});
  const addressEntries = entries.filter(([key, item]) => (
    STRUCTURED_ADDRESS_KEYS.has(normalizeKey(key))
    && scalar(item)
  ));
  const looksAddressLike = type.includes("postaladdress")
    || addressEntries.some(([key]) => ["streetaddress", "formattedaddress", "fulladdress", "address1"]
      .includes(normalizeKey(key)))
    || (
      addressEntries.some(([key]) => ["addresslocality", "city", "locality"].includes(normalizeKey(key)))
      && addressEntries.some(([key]) => ["postalcode", "postcode", "zipcode", "zip"].includes(normalizeKey(key)))
    );
  if (!looksAddressLike) return null;
  return Object.fromEntries(addressEntries
    .slice(0, 16)
    .map(([key, item]) => [key, cleanText(scalar(item))]));
}

function extractSignalSnippets(text, terms) {
  const compact = cleanText(text);
  if (!compact) return [];
  const lower = compact.toLowerCase();
  const offsets = [];
  for (const term of terms) {
    let cursor = 0;
    while (cursor < lower.length) {
      const index = lower.indexOf(term, cursor);
      if (index < 0) break;
      offsets.push(index);
      cursor = index + Math.max(1, term.length);
      if (offsets.length >= 60) break;
    }
  }
  for (const match of compact.matchAll(
    /\b\d{1,6}[A-Za-z]?(?:[-–]\d{1,6})?\s+(?:[A-Za-zÀ-ÿ0-9.'’-]+\s+){1,7}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Highway|Hwy|Plaza|Square|Sq|Strasse|Straße|Rue|Chemin|Avenida|Calle|Jalan|Soi)\b/giu,
  )) {
    offsets.push(match.index || 0);
  }
  const snippets = offsets
    .sort((a, b) => a - b)
    .map((offset) => compact.slice(Math.max(0, offset - 180), Math.min(compact.length, offset + 420)))
    .filter((snippet) => /\d/u.test(snippet));
  return [...new Set(snippets)].slice(0, 12);
}

function pagePriority(url, candidateTerms, seedUrl) {
  const normalized = String(url || "").toLowerCase();
  let score = url === seedUrl ? 500 : 0;
  if (/sitemap(?:_index)?\.xml/iu.test(normalized)) score += 420;
  if (normalized.includes("/wp-json/")) score += 460;
  for (const hint of PAGE_HINTS) if (normalized.includes(hint)) score += 60;
  for (const term of candidateTerms) if (normalized.includes(slug(term))) score += 90;
  score -= Math.min(100, normalized.length / 5);
  return score;
}

function evidenceScore(page, candidateTerms) {
  let score = page.structured_addresses.length * 100
    + page.structured_coordinates.length * 30
    + page.embedded_location_urls.length * 20
    + page.text_snippets.length * 10;
  const haystack = JSON.stringify(page).toLowerCase();
  for (const term of candidateTerms) if (haystack.includes(term)) score += 25;
  return score;
}

function pageHasEvidence(page) {
  return Boolean(
    page.structured_addresses.length
    || page.structured_coordinates.length
    || page.embedded_location_urls.length
    || page.text_snippets.length
  );
}

function identityTerms(values) {
  return [...new Set(values.flatMap((value) => (
    normalizeIdentity(value).split(" ").filter((term) => term.length >= 3)
  )))];
}

function htmlToText(html) {
  return decodeHtml(String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/giu, " ")
    .replace(/<[^>]+>/gu, " "));
}

function extractTitle(html) {
  return cleanText(String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]);
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, "\"")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanJson(value) {
  return decodeHtml(String(value || ""))
    .replace(/^\s*<!--/u, "")
    .replace(/-->\s*$/u, "")
    .trim()
    .replace(/;\s*$/u, "");
}

function standaloneJsonBlock(value) {
  const text = String(value || "").trim();
  return /^(?:\{|\[)/u.test(text) && /(?:\}|\])$/u.test(text) ? text : null;
}

function embeddedJsonText(value) {
  const block = standaloneJsonBlock(value);
  if (!block) return "";
  try {
    const parsed = JSON.parse(cleanJson(block));
    const strings = [];
    walkJson(parsed, (item) => {
      for (const child of Object.values(item)) {
        if (typeof child === "string" || typeof child === "number") strings.push(String(child));
      }
    });
    return strings.join(" ");
  } catch {
    return "";
  }
}

function attributeValue(tag, name) {
  const match = String(tag || "").match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "iu"),
  );
  return match?.[2] ? decodeHtml(match[2]) : null;
}

function scalar(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return scalar(value.name ?? value.value ?? value["@id"]);
  }
  return null;
}

function numericValue(value) {
  const number = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(number) ? number : null;
}

function validCoordinates(latitude, longitude) {
  return latitude != null
    && longitude != null
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function normalizeIdentity(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

function slug(value) {
  return normalizeIdentity(value).replace(/\s+/gu, "-");
}

function cleanText(value) {
  const normalized = decodeHtml(value).replace(/\s+/gu, " ").trim();
  return normalized || null;
}

function placeTextIncludes(haystack, needle) {
  const normalizedHaystack = normalizeIdentity(haystack);
  const normalizedNeedle = normalizeIdentity(needle);
  return Boolean(
    normalizedNeedle
    && (
      normalizedHaystack.includes(normalizedNeedle)
      || normalizedNeedle.includes(normalizedHaystack)
    )
  );
}

function hasNonPostalAddressNumber(address, { countryCode, postalCode } = {}) {
  let value = normalizeIdentity(address);
  const normalizedPostal = normalizeIdentity(postalCode);
  if (normalizedPostal) value = value.replace(normalizedPostal, " ");
  if (["US", "CA"].includes(countryCode)) {
    value = value.replace(/\b\d{5}(?:\s+\d{4})?\b/gu, " ");
  }
  return /\d/u.test(value);
}

function postalFromText(value, { exclude = [] } = {}) {
  const text = String(value || "");
  const excluded = new Set(exclude.map(String));
  const usValues = [...text.matchAll(/\b\d{5}(?:-\d{4})?\b/gu)]
    .map((match) => match[0])
    .filter((item) => !excluded.has(item));
  if (usValues.length > 0) return usValues.at(-1);
  return text.match(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/iu)?.[0]?.toUpperCase() || null;
}

function uniqueUrls(values) {
  return [...new Set(values.map(httpUrl).filter(Boolean))];
}

function uniqueObjects(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}

function emptyResult(candidate, outcome) {
  return {
    source_candidate_id: Number(candidate?.id) || null,
    website: httpUrl(candidate?.website),
    outcome,
    pages_fetched: 0,
    pages_with_evidence: 0,
    pages: [],
    failures: [],
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
