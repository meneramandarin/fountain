import { chromium } from "playwright";
import { isIP } from "node:net";

import {
  extractOfficialPageEvidence,
} from "./official-site-forensics.mjs";
import { createWebClient } from "./web.mjs";

export const RENDERED_SITE_FORENSICS_MARKER = "_official_address_rendered_v1";
export const RENDERED_SITE_FORENSICS_DEFAULT_MAX_PAGES = 4;
export const RENDERED_SITE_FORENSICS_DEFAULT_TIMEOUT_MS = 20_000;

const PAGE_HINTS = [
  "contact",
  "direction",
  "find-us",
  "location",
  "office",
  "studio",
  "visit",
];

export function createRenderedSiteForensics({
  chromiumImpl = chromium,
  webClient = createWebClient({
    maxBytes: 2_500_000,
    maxExcerptChars: 20_000,
    timeoutMs: 15_000,
  }),
  maxPages = RENDERED_SITE_FORENSICS_DEFAULT_MAX_PAGES,
  timeoutMs = RENDERED_SITE_FORENSICS_DEFAULT_TIMEOUT_MS,
  settleMs = 1_250,
  launchOptions = { headless: true },
} = {}) {
  const normalizedMaxPages = positiveInteger(maxPages, "maxPages");
  const normalizedTimeoutMs = positiveInteger(timeoutMs, "timeoutMs");
  const normalizedSettleMs = nonnegativeInteger(settleMs, "settleMs");
  let browserPromise = null;

  const getBrowser = () => {
    browserPromise ||= chromiumImpl.launch(launchOptions);
    return browserPromise;
  };

  const inspect = async (candidate) => {
    const website = httpUrl(candidate?.website);
    if (!website) return emptyResult(candidate, "missing_official_website");
    const browser = await getBrowser();
    const context = await browser.newContext({
      ignoreHTTPSErrors: false,
      serviceWorkers: "block",
      userAgent: "FountainPipeline/1.0 (+https://fountain.clinic)",
    });
    const queue = uniqueUrls([
      website,
      ...(Array.isArray(candidate?.evidence_urls) ? candidate.evidence_urls : []),
    ]).filter((url) => sameDomainFamily(website, url));
    const visited = new Set();
    const pages = [];
    const failures = [];

    try {
      while (queue.length > 0 && visited.size < normalizedMaxPages) {
        queue.sort((left, right) => (
          pagePriority(right, candidate) - pagePriority(left, candidate)
        ));
        const url = queue.shift();
        if (!url || visited.has(url)) continue;
        visited.add(url);

        const robotsCheck = await webClient.fetchHomepage(url);
        if (robotsCheck?.outcome === "robots_disallowed") {
          failures.push({ url, outcome: "robots_disallowed" });
          continue;
        }

        const rendered = await renderPage({
          context,
          url,
          candidate,
          officialWebsite: website,
          timeoutMs: normalizedTimeoutMs,
          settleMs: normalizedSettleMs,
        });
        if (!rendered.ok) {
          failures.push(rendered.failure);
          continue;
        }
        pages.push(rendered.pageEvidence);
        for (const link of rendered.links) {
          if (!visited.has(link) && !queue.includes(link)) queue.push(link);
        }
        for (const networkEvidence of rendered.networkEvidence) pages.push(networkEvidence);
      }
    } finally {
      await context.close();
    }

    const usefulPages = pages.filter(pageHasEvidence);
    return {
      source_candidate_id: Number(candidate?.id) || null,
      website,
      outcome: usefulPages.length > 0 ? "evidence_found" : "no_address_signal",
      pages_fetched: visited.size,
      pages_with_evidence: usefulPages.length,
      pages: usefulPages.slice(0, 12),
      failures: failures.slice(0, 12),
    };
  };

  inspect.close = async () => {
    if (!browserPromise) return;
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    await browser?.close();
  };
  return inspect;
}

async function renderPage({
  context,
  url,
  candidate,
  officialWebsite,
  timeoutMs,
  settleMs,
}) {
  const page = await context.newPage();
  const jsonPayloads = [];
  let capturedBytes = 0;
  const responseHandler = async (response) => {
    if (jsonPayloads.length >= 20 || capturedBytes >= 2_000_000) return;
    if (!sameDomainFamily(officialWebsite, response.url())) return;
    const contentType = String(response.headers()["content-type"] || "").toLowerCase();
    if (!contentType.includes("json")) return;
    try {
      const body = await response.text();
      if (!looksLikeAddressPayload(body, candidate)) return;
      const clipped = body.slice(0, 250_000);
      capturedBytes += Buffer.byteLength(clipped);
      jsonPayloads.push({
        response_url: response.url(),
        body: clipped,
      });
    } catch {
      // A detached/streaming response is not evidence.
    }
  };
  page.on("response", responseHandler);
  await page.route("**/*", async (route) => {
    const request = route.request();
    const type = request.resourceType();
    const requestUrl = httpUrl(request.url());
    const method = request.method().toUpperCase();
    if (["font", "image", "media"].includes(type)) {
      await route.abort();
      return;
    }
    if (
      !requestUrl
      || isUnsafeLiteralUrl(requestUrl)
      || isGoogleMapsUrl(requestUrl)
      || isTrackerUrl(requestUrl)
      || (type === "document" && !sameDomainFamily(officialWebsite, requestUrl))
      || (!["GET", "HEAD"].includes(method) && !isSafeFirstPartyGraphqlQuery({
        method,
        requestUrl,
        officialWebsite,
        postData: request.postData(),
      }))
    ) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    if (settleMs > 0) await page.waitForTimeout(settleMs);
    const finalUrl = httpUrl(page.url());
    if (!finalUrl || !sameDomainFamily(officialWebsite, finalUrl)) {
      return failure(url, "off_domain_redirect", {
        final_url: finalUrl,
        status: response?.status() ?? null,
      });
    }
    const html = await page.content();
    const visibleText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    if (isChallengeShell(html, visibleText)) {
      return failure(url, "challenge_detected", {
        final_url: finalUrl,
        status: response?.status() ?? null,
      });
    }
    const title = await page.title().catch(() => "");
    const pageEvidence = extractOfficialPageEvidence(html, {
      sourceUrl: finalUrl,
      candidate,
      title,
    });
    const networkEvidence = jsonPayloads.map((payload) => {
      const evidence = extractOfficialPageEvidence(
        `<script type="application/json">${escapeScriptPayload(payload.body)}</script>`,
        {
          sourceUrl: finalUrl,
          candidate,
          title: `Rendered network data: ${payload.response_url}`,
        },
      );
      return {
        ...evidence,
        network_response_url: payload.response_url,
      };
    }).filter(pageHasEvidence);
    const links = await page.locator("a[href]").evaluateAll((anchors) => (
      anchors.map((anchor) => anchor.href)
    )).catch(() => []);
    return {
      ok: true,
      pageEvidence,
      networkEvidence,
      links: uniqueUrls(links)
        .filter((link) => sameDomainFamily(officialWebsite, link))
        .filter((link) => PAGE_HINTS.some((hint) => link.toLowerCase().includes(hint)))
        .slice(0, 30),
    };
  } catch (error) {
    return failure(url, error?.name === "TimeoutError" ? "timeout" : "render_error", {
      error: errorMessage(error),
    });
  } finally {
    page.off("response", responseHandler);
    await page.close();
  }
}

function looksLikeAddressPayload(body, candidate) {
  const text = String(body || "");
  if (!/(?:streetAddress|postalCode|formattedAddress|fullAddress|addressLocality|locations?)/iu
    .test(text)) return false;
  const locality = normalizeIdentity(candidate?.locality);
  return !locality || normalizeIdentity(text).includes(locality);
}

function isChallengeShell(html, visibleText) {
  const text = `${html}\n${visibleText}`.toLowerCase();
  return [
    "cf-chl-",
    "cloudflare ray id",
    "incapsula incident id",
    "just a moment...",
    "verify you are human",
    "checking your browser",
  ].some((marker) => text.includes(marker));
}

function pagePriority(url, candidate) {
  const text = String(url || "").toLowerCase();
  let score = url === httpUrl(candidate?.website) ? 500 : 0;
  for (const hint of PAGE_HINTS) if (text.includes(hint)) score += 80;
  for (const token of normalizeIdentity(candidate?.locality).split(" ").filter(Boolean)) {
    if (text.includes(token)) score += 100;
  }
  return score - Math.min(100, text.length / 5);
}

function pageHasEvidence(page) {
  return Boolean(
    page?.structured_addresses?.length
    || page?.structured_coordinates?.length
    || page?.embedded_location_urls?.length
    || page?.text_snippets?.length
  );
}

function escapeScriptPayload(value) {
  return String(value || "").replace(/<\/script/giu, "<\\/script");
}

function failure(url, outcome, details = {}) {
  return {
    ok: false,
    pageEvidence: null,
    networkEvidence: [],
    links: [],
    failure: { url, outcome, ...details },
  };
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

function uniqueUrls(values) {
  return [...new Set(values.map(httpUrl).filter(Boolean))];
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

function isGoogleMapsUrl(value) {
  const host = hostname(value);
  if (!host) return false;
  return (
    host === "maps.googleapis.com"
    || host === "maps.gstatic.com"
    || host === "maps.google.com"
    || (/(^|\.)google\.[a-z.]+$/u.test(host) && new URL(value).pathname.startsWith("/maps"))
  );
}

function isTrackerUrl(value) {
  const host = hostname(value);
  return Boolean(host && [
    "doubleclick.net",
    "google-analytics.com",
    "googletagmanager.com",
    "facebook.net",
    "hotjar.com",
    "clarity.ms",
  ].some((domain) => host === domain || host.endsWith(`.${domain}`)));
}

function isUnsafeLiteralUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
    if (
      url.username
      || url.password
      || host === "localhost"
      || host.endsWith(".localhost")
      || host.endsWith(".local")
      || host.endsWith(".internal")
    ) return true;
    if (!isIP(host)) return false;
    if (isIP(host) === 4) {
      const [a, b] = host.split(".").map(Number);
      return (
        a === 0
        || a === 10
        || a === 127
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || a >= 224
      );
    }
    return (
      host === "::"
      || host === "::1"
      || host.startsWith("fc")
      || host.startsWith("fd")
      || /^fe[89ab]/u.test(host)
    );
  } catch {
    return true;
  }
}

function isSafeFirstPartyGraphqlQuery({
  method,
  requestUrl,
  officialWebsite,
  postData,
}) {
  if (method !== "POST" || !sameDomainFamily(officialWebsite, requestUrl)) return false;
  if (!new URL(requestUrl).pathname.toLowerCase().includes("graphql")) return false;
  const body = String(postData || "");
  return (
    body.length > 0
    && body.length <= 100_000
    && /(?:\bquery\b|"query"\s*:)/iu.test(body)
    && !/\bmutation\b/iu.test(body)
  );
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

function normalizeIdentity(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}

function nonnegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return number;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
