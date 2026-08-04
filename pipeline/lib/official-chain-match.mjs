import { query as defaultQuery } from "./db.mjs";

export const OFFICIAL_CHAIN_SYNC_GROUP = "official_chain_sync";

export function isOfficialChainSync(candidate) {
  return Array.isArray(candidate?.discovered_groups)
    && candidate.discovered_groups.includes(OFFICIAL_CHAIN_SYNC_GROUP);
}

export async function matchOfficialChainLocation(candidate, operations = {}) {
  const query = operations.query || defaultQuery;
  const result = await query(
    `
      SELECT id, name, address, locality, region, website
      FROM fountain.locations
      WHERE deleted_at IS NULL
        AND regexp_replace(lower(coalesce(address, '')), '[^a-z0-9]', '', 'g') = $1
        AND regexp_replace(lower(coalesce(locality, '')), '[^a-z0-9]', '', 'g') = $2
        AND regexp_replace(lower(coalesce(region, '')), '[^a-z0-9]', '', 'g') = $3
      ORDER BY id
      LIMIT 2
    `,
    [
      normalizeIdentity(candidate.address),
      normalizeIdentity(candidate.locality),
      normalizeIdentity(candidate.region),
    ],
  );
  if (result.rows?.[0]) {
    return {
      status: "matched",
      location_id: Number(result.rows[0].id),
      method: "official_chain_exact_address",
    };
  }

  const website = urlIdentity(candidate.website);
  if (!website || !isBranchSpecificWebsite(candidate)) return { status: "none" };
  const websiteResult = await query(
    `
      SELECT id, website
      FROM fountain.locations
      WHERE deleted_at IS NULL
        AND website IS NOT NULL
        AND regexp_replace(
          lower(
            regexp_replace(
              split_part(split_part(website, '?', 1), '#', 1),
              '^https?://(www\.)?',
              ''
            )
          ),
          '/+$',
          ''
        ) = $1
      ORDER BY id
      LIMIT 2
    `,
    [website],
  );
  const websiteMatch = websiteResult.rows?.[0];
  return websiteMatch
    ? {
        status: "matched",
        location_id: Number(websiteMatch.id),
        method: "official_chain_exact_website",
      }
    : { status: "none" };
}

export function isBranchSpecificWebsite(candidate) {
  const website = canonicalUrl(candidate?.website);
  const directory = canonicalUrl(candidate?.chain_locations_url);
  if (!website || website === directory) return false;
  try {
    const pathname = new URL(website).pathname.replace(/\/+$/u, "") || "/";
    return !["/", "/locations", "/jivahealth-locations"].includes(pathname.toLowerCase());
  } catch {
    return false;
  }
}

function canonicalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/^www\./u, "").toLowerCase();
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.href;
  } catch {
    return null;
  }
}

function urlIdentity(value) {
  const canonical = canonicalUrl(value);
  if (!canonical) return null;
  const url = new URL(canonical);
  return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
}

function normalizeIdentity(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/gu, "");
}
