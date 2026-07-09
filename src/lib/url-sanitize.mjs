export const TRACKING_PARAM_NAMES = new Set([
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "yclid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "srsltid",
]);

const TRACKER_REF_HOST_PATTERNS = [
  /(^|\.)googleadservices\.com$/i,
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)facebook\.net$/i,
  /(^|\.)veritone-ce\.com$/i,
];

export const OUTBOUND_REFERRAL_PARAM_SKIP_HOSTS = ["shawellnessclinic.com"];

export function isTrackingParamName(name, url) {
  const normalized = String(name || "").toLowerCase();
  if (normalized.startsWith("utm_") || TRACKING_PARAM_NAMES.has(normalized)) {
    return true;
  }
  return normalized === "ref" && isKnownTrackerRefHost(url);
}

export function shouldSkipFountainReferralParams(value) {
  const url = parseUrlLike(value);
  if (!url?.hostname) {
    return false;
  }

  const hostname = normalizedHostname(url.hostname);
  return OUTBOUND_REFERRAL_PARAM_SKIP_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function isGoogleSerpRedirectWrapper(value) {
  const url = parseUrlLike(value);
  if (!url) {
    return false;
  }

  return isGoogleSerpRedirectUrl(url) && Boolean(googleSerpRedirectTargetParam(url));
}

export function extractGoogleSerpRedirectTarget(value) {
  const url = parseUrlLike(value);
  if (!url || !isGoogleSerpRedirectUrl(url)) {
    return null;
  }

  const target = googleSerpRedirectTargetParam(url);
  if (!target) {
    return null;
  }

  return sanitizeUrl(target);
}

export function sanitizeUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const hadScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const isRootRelative = trimmed.startsWith("/");
  const parseValue = hadScheme ? trimmed : isRootRelative ? `https://fountain.local${trimmed}` : `https://${trimmed}`;

  try {
    const url = new URL(parseValue);
    let removedAny = false;
    for (const key of [...url.searchParams.keys()]) {
      if (isTrackingParamName(key, url)) {
        url.searchParams.delete(key);
        removedAny = true;
      }
    }
    for (const [key, paramValue] of [...url.searchParams.entries()]) {
      const sanitizedValue = sanitizeNestedUrlParam(paramValue);
      if (sanitizedValue !== paramValue) {
        url.searchParams.set(key, sanitizedValue);
        removedAny = true;
      }
    }
    if (!removedAny) {
      return trimmed;
    }
    const query = url.searchParams.toString();
    return rebuildOriginalUrlWithQuery(trimmed, query);
  } catch {
    return trimmed;
  }
}

export function addFountainReferralParams(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const hadScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const parseValue = hadScheme ? trimmed : `https://${trimmed}`;

  try {
    if (shouldSkipFountainReferralParams(trimmed)) {
      return trimmed;
    }

    const url = new URL(parseValue);
    url.searchParams.set("utm_source", "fountain.clinic");
    url.searchParams.set("utm_medium", "referral");
    const withParams = url.toString();
    return hadScheme ? withParams : withParams.replace(/^https:\/\//i, "");
  } catch {
    return trimmed;
  }
}

export function containsTrackingParams(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  try {
    const hadScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
    const isRootRelative = value.trim().startsWith("/");
    const parseValue = hadScheme ? value : isRootRelative ? `https://fountain.local${value}` : `https://${value}`;
    const url = new URL(parseValue);
    return (
      [...url.searchParams.keys()].some((key) => isTrackingParamName(key, url)) ||
      [...url.searchParams.values()].some((paramValue) => {
        const sanitizedValue = sanitizeNestedUrlParam(paramValue);
        return sanitizedValue !== paramValue;
      })
    );
  } catch {
    return /[?&#](utm_[^=&?#]+|fbclid|gclid|gbraid|wbraid|msclkid|yclid|twclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|srsltid)=/i.test(value);
  }
}

function isKnownTrackerRefHost(url) {
  if (!url?.hostname) {
    return false;
  }
  return TRACKER_REF_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname));
}

function parseUrlLike(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const hadScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const isProtocolRelative = trimmed.startsWith("//");
  const isRootRelative = trimmed.startsWith("/");
  const parseValue = hadScheme
    ? trimmed
    : isProtocolRelative
      ? `https:${trimmed}`
      : isRootRelative
        ? `https://www.google.com${trimmed}`
        : `https://${trimmed}`;

  try {
    return new URL(parseValue);
  } catch {
    return null;
  }
}

function normalizedHostname(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .replace(/^www\d?\./, "");
}

function isGoogleSerpRedirectUrl(url) {
  return normalizedHostname(url.hostname).startsWith("google.") && url.pathname === "/url";
}

function googleSerpRedirectTargetParam(url) {
  return url.searchParams.get("q") || url.searchParams.get("url");
}

function rebuildOriginalUrlWithQuery(original, query) {
  const hashIndex = original.indexOf("#");
  const withoutHash = hashIndex === -1 ? original : original.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : original.slice(hashIndex);
  const queryIndex = withoutHash.indexOf("?");
  const base = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  return `${base}${query ? `?${query}` : ""}${hash}`;
}

function sanitizeNestedUrlParam(value) {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !value.includes("?")) {
    return value;
  }
  return sanitizeUrl(value) || value;
}
