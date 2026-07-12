import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHARED_IN_FLIGHT = new Map();

class UnsafeWebUrlError extends TypeError {}

export const DEFAULT_WEB_CACHE_DIR = path.join(REPO_ROOT, ".cache", "pipeline", "web");
export const DEFAULT_WEB_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const DEFAULT_WEB_TIMEOUT_MS = 12_000;
export const DEFAULT_WEB_MAX_BYTES = 1_000_000;
export const DEFAULT_WEB_MAX_REDIRECTS = 5;
export const DEFAULT_WEB_EXCERPT_CHARS = 2_000;

/**
 * Cached, robots-aware website client for pipeline tasks.
 *
 * Successful responses and failures are cached by normalized URL. This means a
 * dead or blocked site cannot be hammered by overlapping tasks during the TTL.
 * Network and DNS functions are injectable so callers can test without making
 * live requests.
 */
export function createWebClient({
  cacheDir = DEFAULT_WEB_CACHE_DIR,
  ttlMs = DEFAULT_WEB_CACHE_TTL_MS,
  timeoutMs = DEFAULT_WEB_TIMEOUT_MS,
  maxBytes = DEFAULT_WEB_MAX_BYTES,
  maxRedirects = DEFAULT_WEB_MAX_REDIRECTS,
  maxExcerptChars = DEFAULT_WEB_EXCERPT_CHARS,
  fetchImpl = globalThis.fetch,
  resolveHost = defaultResolveHost,
  now = Date.now,
  respectRobots = true,
  userAgent = "FountainPipeline/1.0 (+https://fountain.clinic)",
  robotsUserAgent = "FountainPipeline",
} = {}) {
  assertFunction(fetchImpl, "Web fetch implementation");
  assertFunction(resolveHost, "Web hostname resolver");
  assertFunction(now, "Web clock");
  assertPositiveInteger(ttlMs, "ttlMs");
  assertPositiveInteger(timeoutMs, "timeoutMs");
  assertPositiveInteger(maxBytes, "maxBytes");
  assertNonNegativeInteger(maxRedirects, "maxRedirects");
  assertPositiveInteger(maxExcerptChars, "maxExcerptChars");

  const resolvedCacheDir = path.resolve(cacheDir);
  const stats = {
    cacheHits: 0,
    cacheMisses: 0,
    deduplicatedRequests: 0,
    networkRequests: 0,
    robotsBlocked: 0,
  };

  async function fetchHomepage(input, { signal } = {}) {
    let requestedUrl;
    try {
      requestedUrl = normalizeWebUrl(input);
      assertStaticallySafeUrl(requestedUrl);
    } catch (error) {
      return pageFailure({
        requestedUrl: String(input ?? ""),
        outcome: "invalid_url",
        error: errorMessage(error),
      });
    }

    // A fresh page hit needs no DNS lookup and no new robots request.
    const fresh = await readFreshCache(requestedUrl);
    if (fresh) {
      stats.cacheHits += 1;
      return homepageResult(fresh, { cached: true, maxExcerptChars });
    }

    let robots = null;
    if (respectRobots) {
      robots = await checkRobots(requestedUrl, { signal });
      if (!robots.allowed) {
        stats.robotsBlocked += 1;
        return pageFailure({
          requestedUrl,
          finalUrl: requestedUrl,
          outcome: "robots_disallowed",
          error: "robots.txt disallows this path for FountainPipeline.",
          robots,
        });
      }
    }

    const raw = await loadOrFetch(requestedUrl, { signal });
    return homepageResult(raw, { cached: raw.cached, robots, maxExcerptChars });
  }

  async function checkRobots(pageUrl, { signal } = {}) {
    const page = new URL(pageUrl);
    const robotsUrl = `${page.origin}/robots.txt`;
    const raw = await loadOrFetch(robotsUrl, { signal });

    // The common fail-open policy applies when robots.txt is absent or cannot
    // be retrieved. A positive 401/403 is treated as disallow-all.
    if (raw.status === 401 || raw.status === 403) {
      return { allowed: false, url: robotsUrl, cached: raw.cached, outcome: raw.outcome };
    }
    if (!raw.ok) {
      return { allowed: true, url: robotsUrl, cached: raw.cached, outcome: raw.outcome };
    }

    return {
      allowed: isRobotsPathAllowed(raw.body, page, robotsUserAgent),
      url: robotsUrl,
      cached: raw.cached,
      outcome: raw.outcome,
    };
  }

  async function loadOrFetch(requestedUrl, { signal } = {}) {
    const fresh = await readFreshCache(requestedUrl);
    if (fresh) {
      stats.cacheHits += 1;
      return { ...fresh, cached: true };
    }

    const cachePath = cachePathFor(requestedUrl);
    const inFlightKey = `${cachePath}\0${requestedUrl}`;
    const existing = SHARED_IN_FLIGHT.get(inFlightKey);
    if (existing) {
      stats.deduplicatedRequests += 1;
      const result = await existing;
      return { ...result, cached: true, deduplicated: true };
    }

    stats.cacheMisses += 1;
    const operation = (async () => {
      const result = await fetchRaw(requestedUrl, { signal });
      if (result.outcome !== "aborted") {
        await writeCache(cachePath, result);
      }
      return { ...result, cachePath, cached: false };
    })();
    SHARED_IN_FLIGHT.set(inFlightKey, operation);
    try {
      return await operation;
    } finally {
      SHARED_IN_FLIGHT.delete(inFlightKey);
    }
  }

  async function fetchRaw(requestedUrl, { signal } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Website fetch timed out.")), timeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });

    let currentUrl = requestedUrl;
    const fail = (outcome, details = {}) => rawFailure(requestedUrl, currentUrl, outcome, {
      ...details,
      fetchedAt: new Date(now()).toISOString(),
    });
    try {
      for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
        await assertNetworkSafeUrl(currentUrl, resolveHost);
        stats.networkRequests += 1;
        const response = await fetchImpl(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: {
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1",
            "User-Agent": userAgent,
          },
          signal: controller.signal,
        });

        if (isRedirectStatus(response.status)) {
          const location = response.headers.get("location");
          if (!location) {
            await response.body?.cancel();
            return fail("redirect_missing_location", {
              status: response.status,
              redirectCount,
            });
          }
          if (redirectCount === maxRedirects) {
            await response.body?.cancel();
            return fail("too_many_redirects", {
              status: response.status,
              redirectCount,
            });
          }
          await response.body?.cancel();
          currentUrl = normalizeWebUrl(new URL(location, currentUrl).href);
          assertStaticallySafeUrl(currentUrl);
          continue;
        }

        const contentType = normalizeContentType(response.headers.get("content-type"));
        if (!response.ok) {
          await response.body?.cancel();
          return fail("http_error", {
            status: response.status,
            contentType,
            redirectCount,
          });
        }

        const bodyResult = await readBoundedBody(response, maxBytes);
        if (!bodyResult.ok) {
          return fail("too_large", {
            status: response.status,
            contentType,
            redirectCount,
            error: `Response exceeded ${maxBytes} bytes.`,
          });
        }

        return {
          version: 1,
          ok: true,
          outcome: "ok",
          requestedUrl,
          finalUrl: currentUrl,
          status: response.status,
          contentType,
          body: bodyResult.text,
          bytes: bodyResult.bytes,
          redirectCount,
          error: null,
          fetchedAt: new Date(now()).toISOString(),
        };
      }
      return fail("too_many_redirects");
    } catch (error) {
      const callerAborted = Boolean(signal?.aborted);
      const timedOut = controller.signal.aborted && !callerAborted;
      const outcome = callerAborted
        ? "aborted"
        : timedOut
          ? "timeout"
          : error instanceof UnsafeWebUrlError
            ? "unsafe_url"
            : "network_error";
      return fail(outcome, { error: errorMessage(error) });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async function readFreshCache(requestedUrl) {
    const cachePath = cachePathFor(requestedUrl);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(cachePath, "utf8"));
    } catch {
      return null;
    }
    const fetchedAtMs = Date.parse(parsed?.fetchedAt);
    const cacheAgeMs = now() - fetchedAtMs;
    if (
      parsed?.version !== 1
      || parsed?.requestedUrl !== requestedUrl
      || !Number.isFinite(fetchedAtMs)
      || cacheAgeMs < 0
      || cacheAgeMs >= ttlMs
    ) {
      return null;
    }
    return {
      ...parsed,
      cachePath,
      cacheAgeMs,
    };
  }

  function cachePathFor(url) {
    const key = createHash("sha256").update(url).digest("hex");
    return path.join(resolvedCacheDir, `${key}.json`);
  }

  async function writeCache(cachePath, value) {
    await mkdir(resolvedCacheDir, { recursive: true });
    const temporaryPath = `${cachePath}.${process.pid}.${createHash("sha256")
      .update(`${now()}:${Math.random()}`)
      .digest("hex")
      .slice(0, 12)}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
      await rename(temporaryPath, cachePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  return {
    fetchHomepage,
    getStats: () => ({ ...stats }),
  };
}

export function normalizeWebUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) throw new TypeError("Website URL is empty.");
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//iu.test(raw) ? raw : `https://${raw}`);
  url.hash = "";
  if (url.pathname === "") url.pathname = "/";
  return url.href;
}

export function isRobotsPathAllowed(text, urlInput, userAgent = "FountainPipeline") {
  const url = urlInput instanceof URL ? urlInput : new URL(urlInput);
  const groups = parseRobotsGroups(text);
  const target = String(userAgent).toLowerCase();
  const exact = groups.filter((group) => group.agents.some((agent) => agent === target));
  const applicable = exact.length
    ? exact
    : groups.filter((group) => group.agents.includes("*"));
  const requestPath = `${url.pathname}${url.search}`;
  let winner = null;

  for (const rule of applicable.flatMap((group) => group.rules)) {
    if (!rule.path) continue;
    const match = robotsRuleMatch(rule.path, requestPath);
    if (!match) continue;
    if (!winner || match.length > winner.length || (match.length === winner.length && rule.allow)) {
      winner = { allow: rule.allow, length: match.length };
    }
  }
  return winner?.allow ?? true;
}

function homepageResult(raw, {
  cached,
  robots = null,
  maxExcerptChars = DEFAULT_WEB_EXCERPT_CHARS,
} = {}) {
  if (!raw.ok) {
    return pageFailure({ ...raw, cached, robots });
  }
  if (!isHtmlContentType(raw.contentType)) {
    return pageFailure({
      ...raw,
      outcome: "unsupported_content_type",
      error: `Expected HTML but received ${raw.contentType || "an unknown content type"}.`,
      cached,
      robots,
    });
  }

  return {
    ok: true,
    outcome: "ok",
    requestedUrl: raw.requestedUrl,
    finalUrl: raw.finalUrl,
    status: raw.status,
    contentType: raw.contentType,
    title: extractTitle(raw.body),
    description: extractDescription(raw.body),
    textExcerpt: htmlToText(raw.body).slice(0, maxExcerptChars),
    fetchedAt: raw.fetchedAt,
    cachePath: raw.cachePath ?? null,
    cacheAgeMs: raw.cacheAgeMs ?? 0,
    cached: Boolean(cached),
    deduplicated: Boolean(raw.deduplicated),
    redirectCount: raw.redirectCount ?? 0,
    bytes: raw.bytes ?? 0,
    robots,
    error: null,
  };
}

function pageFailure({
  requestedUrl,
  finalUrl = null,
  outcome,
  status = null,
  contentType = "",
  fetchedAt = null,
  cachePath = null,
  cacheAgeMs = 0,
  cached = false,
  deduplicated = false,
  redirectCount = 0,
  robots = null,
  error = null,
}) {
  return {
    ok: false,
    outcome,
    requestedUrl,
    finalUrl,
    status,
    contentType,
    title: "",
    description: "",
    textExcerpt: "",
    fetchedAt,
    cachePath,
    cacheAgeMs,
    cached: Boolean(cached),
    deduplicated: Boolean(deduplicated),
    redirectCount,
    bytes: 0,
    robots,
    error,
  };
}

function rawFailure(requestedUrl, finalUrl, outcome, details = {}) {
  return {
    version: 1,
    ok: false,
    outcome,
    requestedUrl,
    finalUrl,
    status: details.status ?? null,
    contentType: details.contentType ?? "",
    body: "",
    bytes: 0,
    redirectCount: details.redirectCount ?? 0,
    error: details.error ?? null,
    fetchedAt: details.fetchedAt ?? new Date().toISOString(),
  };
}

async function assertNetworkSafeUrl(urlString, resolveHost) {
  const url = new URL(urlString);
  assertStaticallySafeUrl(url.href);
  const hostname = bareHostname(url.hostname);
  if (isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw new UnsafeWebUrlError("Website URL resolves to a non-public address.");
    }
    return;
  }
  const resolved = await resolveHost(hostname);
  const addresses = (Array.isArray(resolved) ? resolved : [resolved])
    .map((entry) => typeof entry === "string" ? entry : entry?.address)
    .filter(Boolean);
  if (!addresses.length || addresses.some((address) => !isPublicIp(address))) {
    throw new UnsafeWebUrlError("Website hostname does not resolve exclusively to public addresses.");
  }
}

function assertStaticallySafeUrl(urlString) {
  const url = new URL(urlString);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UnsafeWebUrlError("Website URL must use http or https.");
  }
  if (url.username || url.password) {
    throw new UnsafeWebUrlError("Website URL must not contain credentials.");
  }
  if ((url.protocol === "http:" && url.port && url.port !== "80")
    || (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw new UnsafeWebUrlError("Website URL must use a standard HTTP port.");
  }
  const hostname = bareHostname(url.hostname).toLowerCase().replace(/\.$/u, "");
  if (
    !hostname
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || (!hostname.includes(".") && !isIP(hostname))
  ) {
    throw new UnsafeWebUrlError("Website URL must use a public hostname.");
  }
  if (isIP(hostname) && !isPublicIp(hostname)) {
    throw new UnsafeWebUrlError("Website URL must not use a private or reserved address.");
  }
}

function isPublicIp(address) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  const mapped = normalized.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/u);
  if (mapped) return isPublicIpv4(mapped[1]);
  const mappedHex = normalized.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/u);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isPublicIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return !(
    normalized === "::"
    || normalized === "::1"
    || /^f[cd]/u.test(normalized)
    || /^fe[89ab]/u.test(normalized)
    || /^ff/u.test(normalized)
    || /^2001:db8(?:[:]|$)/u.test(normalized)
  );
}

function bareHostname(hostname) {
  return String(hostname).replace(/^\[|\]$/gu, "");
}

function isPublicIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b, c] = octets;
  return !(
    a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
  );
}

async function defaultResolveHost(hostname) {
  return lookup(hostname, { all: true, verbatim: true });
}

async function readBoundedBody(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false };
  if (!response.body) return { ok: true, text: "", bytes: 0 };

  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }
  return {
    ok: true,
    text: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks)),
    bytes,
  };
}

function parseRobotsGroups(text) {
  const groups = [];
  let group = null;
  for (const rawLine of String(text ?? "").split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && group?.agents.length) {
      group.rules.push({ allow: field === "allow", path: value });
    }
  }
  return groups;
}

function robotsRuleMatch(pattern, requestPath) {
  const endAnchored = pattern.endsWith("$");
  const source = pattern
    .replace(/\$$/u, "")
    .split("*")
    .map(escapeRegExp)
    .join(".*");
  const match = requestPath.match(new RegExp(`^${source}${endAnchored ? "$" : ""}`, "u"));
  return match?.[0] ?? null;
}

function extractTitle(html) {
  const match = String(html ?? "").match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu);
  return cleanHtmlText(match?.[1] ?? "").slice(0, 300);
}

function extractDescription(html) {
  for (const tag of String(html ?? "").match(/<meta\b[^>]*>/giu) ?? []) {
    const attrs = parseHtmlAttributes(tag);
    const key = String(attrs.name || attrs.property || "").toLowerCase();
    if (key === "description" || key === "og:description") {
      return decodeHtmlEntities(attrs.content || "").replace(/\s+/gu, " ").trim().slice(0, 500);
    }
  }
  return "";
}

function parseHtmlAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu;
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function htmlToText(html) {
  return cleanHtmlText(String(html ?? "")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<(?:script|style|noscript|svg)\b[\s\S]*?<\/(?:script|style|noscript|svg)\s*>/giu, " ")
    .replace(/<[^>]+>/gu, " "));
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(String(value)).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}

function decodeHtmlEntities(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return String(value).replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (match, decimal, hex, name) => {
    if (decimal) return safeCodePoint(Number(decimal), match);
    if (hex) return safeCodePoint(Number.parseInt(hex, 16), match);
    return named[String(name).toLowerCase()] ?? match;
  });
}

function safeCodePoint(value, fallback) {
  try {
    return String.fromCodePoint(value);
  } catch {
    return fallback;
  }
}

function normalizeContentType(value) {
  return String(value ?? "").split(";", 1)[0].trim().toLowerCase();
}

function isHtmlContentType(value) {
  return value === "text/html" || value === "application/xhtml+xml";
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function.`);
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${label} must be a positive integer.`);
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer.`);
}
