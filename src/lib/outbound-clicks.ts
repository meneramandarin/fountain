import crypto from "node:crypto";
import { row } from "@/lib/db";
import { addFountainReferralParams } from "./url-sanitize.mjs";

type LocationRedirectTarget = {
  id: number;
  slug: string | null;
  website: string | null;
};

type OutboundClickInput = {
  locationId: number;
  sourcePage: string | null;
  internalFrom: string | null;
  referrer: string | null;
  userAgent: string | null;
};

export async function getLocationRedirectTarget(ref: string) {
  const normalized = ref.trim();
  if (!normalized) {
    return null;
  }

  const numericId = /^[0-9]+$/.test(normalized) ? Number(normalized) : null;
  const lookupClause = numericId == null ? "slug = ?" : "(slug = ? OR id = ?)";
  const lookupValues = numericId == null ? [normalized] : [normalized, numericId];
  return (
    (await row<LocationRedirectTarget>(
      `
      SELECT id, slug, website
      FROM locations
      WHERE deleted_at IS NULL
        AND status = 'active'
        AND ${lookupClause}
      LIMIT 1
    `,
      lookupValues,
    )) || null
  );
}

export async function logOutboundClick(input: OutboundClickInput) {
  try {
    await row(
      `
      INSERT INTO outbound_clicks (
        location_id,
        source_page,
        internal_from,
        referrer,
        user_agent_hash,
        is_bot
      )
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `,
      [
        input.locationId,
        input.sourcePage,
        input.internalFrom,
        input.referrer,
        hashUserAgent(input.userAgent),
        isLikelyBot(input.userAgent),
      ],
    );
  } catch (error) {
    console.error("failed to log outbound click", error);
  }
}

export function websiteRedirectUrl(rawWebsite: string) {
  const withReferral = addFountainReferralParams(rawWebsite) || rawWebsite;
  return externalHref(withReferral);
}

export function outboundSourcePage(requestUrl: URL, referrer: string | null) {
  const explicit = normalizedNullable(requestUrl.searchParams.get("source_page"));
  if (explicit) {
    return explicit;
  }

  if (!referrer) {
    return null;
  }

  try {
    const parsedReferrer = new URL(referrer);
    if (parsedReferrer.origin === requestUrl.origin || equivalentLocalOrigins(parsedReferrer, requestUrl)) {
      return `${parsedReferrer.pathname}${parsedReferrer.search}`;
    }
  } catch {
    return null;
  }

  return null;
}

export function outboundInternalFrom(requestUrl: URL) {
  return normalizedNullable(requestUrl.searchParams.get("from"));
}

export function noindexHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

function externalHref(raw: string) {
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  return `https://${raw}`;
}

function normalizedNullable(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function hashUserAgent(userAgent: string | null) {
  const normalized = normalizedNullable(userAgent);
  if (!normalized) {
    return null;
  }
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function isLikelyBot(userAgent: string | null) {
  const normalized = (userAgent || "").toLowerCase();
  if (!normalized) {
    return true;
  }
  return /(bot|crawler|spider|scrapy|curl|wget|python-requests|httpclient|preview|validator|lighthouse)/i.test(normalized);
}

function equivalentLocalOrigins(first: URL, second: URL) {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  return localHosts.has(first.hostname) && localHosts.has(second.hostname) && first.port === second.port;
}
