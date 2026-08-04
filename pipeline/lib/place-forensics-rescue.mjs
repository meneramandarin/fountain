import { query as defaultQuery } from "./db.mjs";
import { createOfficialSiteForensics } from "./official-site-forensics.mjs";

export const PLACE_FORENSICS_RESCUE_DEFAULT_CONCURRENCY = 16;
export const PLACE_FORENSICS_RESCUE_MARKER = "_official_address_forensics_v2";

export async function rescueAddressesFromOfficialSites({
  campaign,
  runId = null,
  apply = false,
  concurrency = PLACE_FORENSICS_RESCUE_DEFAULT_CONCURRENCY,
  limit = null,
  marker = PLACE_FORENSICS_RESCUE_MARKER,
}, operations = {}) {
  const query = operations.query || defaultQuery;
  const normalizedMarker = nonemptyString(marker, "marker");
  const candidates = await loadCandidates({
    campaign,
    limit,
    marker: normalizedMarker,
  }, { query });
  if (!apply) {
    return {
      selected: candidates.length,
      accepted: 0,
      corrected: 0,
      confirmed: 0,
      ambiguous: 0,
      no_structured_address: 0,
      sample: candidates.slice(0, 10).map(publicCandidate),
    };
  }

  const inspectOfficialSite = operations.inspectOfficialSite
    || createOfficialSiteForensics({ maxPages: operations.maxSitePages || 12 });
  const results = new Array(candidates.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) return;
      const candidate = candidates[index];
      let evidence;
      try {
        evidence = await inspectOfficialSite(candidate);
      } catch (error) {
        evidence = {
          outcome: "crawl_failed",
          pages_fetched: 0,
          pages_with_evidence: 0,
          pages: [],
          failures: [{ error: errorMessage(error) }],
        };
      }
      const proposal = selectStructuredAddressProposal(candidate, evidence);
      const markerPayload = {
        outcome: proposal.outcome,
        run_id: runId,
        inspected_at: new Date().toISOString(),
        before: addressSnapshot(candidate),
        proposal: proposal.accepted ? proposal.address : null,
        evidence_url: proposal.evidence_url || null,
        evidence_method: proposal.evidence_method || null,
        candidates_considered: proposal.candidates_considered,
        pages_fetched: evidence.pages_fetched || 0,
        pages_with_evidence: evidence.pages_with_evidence || 0,
      };

      if (!proposal.accepted) {
        await query(
          `
            UPDATE fountain_raw.agent_discovery_candidates
            SET agent_payload = jsonb_set(
                  coalesce(agent_payload, '{}'::jsonb),
                  $2::text[],
                  $3::jsonb,
                  true
                ),
                updated_at = now()
            WHERE id = $1
              AND promoted_location_id IS NULL
              AND status = 'needs_review'
          `,
          [candidate.id, [normalizedMarker], JSON.stringify(markerPayload)],
        );
        results[index] = {
          candidate_id: Number(candidate.id),
          outcome: proposal.outcome,
          accepted: 0,
          corrected: 0,
          confirmed: 0,
          pages_fetched: evidence.pages_fetched || 0,
        };
        continue;
      }

      const changed = addressChanged(candidate, proposal.address);
      const existingVerification = candidate.official_site_verification || {};
      const verification = {
        ...existingVerification,
        address_verified: true,
        address_evidence: {
          verified: true,
          method: proposal.evidence_method,
          source_url: proposal.evidence_url,
          structured_address: proposal.address,
          candidates_considered: proposal.candidates_considered,
        },
        official_site_forensics: {
          marker: normalizedMarker,
          run_id: runId,
          pages_fetched: evidence.pages_fetched || 0,
          pages_with_evidence: evidence.pages_with_evidence || 0,
        },
      };
      const evidenceUrls = uniqueStrings([
        ...(Array.isArray(candidate.evidence_urls) ? candidate.evidence_urls : []),
        proposal.evidence_url,
      ]);
      await query(
        `
          UPDATE fountain_raw.agent_discovery_candidates
          SET address = CASE WHEN $8::boolean THEN $2 ELSE address END,
              locality = CASE WHEN $8::boolean THEN $3 ELSE locality END,
              region = CASE WHEN $8::boolean THEN $4 ELSE region END,
              postal_code = CASE WHEN $8::boolean THEN $5 ELSE postal_code END,
              address_verified = true,
              official_site_verification = $6::jsonb,
              evidence_urls = $7::jsonb,
              latitude = CASE WHEN $8::boolean THEN NULL ELSE latitude END,
              longitude = CASE WHEN $8::boolean THEN NULL ELSE longitude END,
              geocode_provider = CASE WHEN $8::boolean THEN NULL ELSE geocode_provider END,
              geocode_result = CASE WHEN $8::boolean THEN NULL ELSE geocode_result END,
              match_result = NULL,
              status = 'discovered',
              agent_payload = jsonb_set(
                coalesce(agent_payload, '{}'::jsonb),
                $9::text[],
                $10::jsonb,
                true
              ),
              updated_at = now()
          WHERE id = $1
            AND promoted_location_id IS NULL
            AND status = 'needs_review'
        `,
        [
          candidate.id,
          proposal.address.street,
          candidate.locality || proposal.address.locality,
          candidate.region || proposal.address.region,
          proposal.address.postal_code || (changed ? null : candidate.postal_code),
          JSON.stringify(verification),
          JSON.stringify(evidenceUrls),
          changed,
          [normalizedMarker],
          JSON.stringify(markerPayload),
        ],
      );
      results[index] = {
        candidate_id: Number(candidate.id),
        outcome: changed ? "corrected" : "confirmed",
        accepted: 1,
        corrected: changed ? 1 : 0,
        confirmed: changed ? 0 : 1,
        pages_fetched: evidence.pages_fetched || 0,
        evidence_url: proposal.evidence_url,
      };
    }
  }

  try {
    await Promise.all(Array.from(
      { length: Math.min(positiveInteger(concurrency, "concurrency"), Math.max(1, candidates.length)) },
      () => worker(),
    ));
  } finally {
    await inspectOfficialSite.close?.();
  }
  return {
    selected: candidates.length,
    accepted: count(results, "accepted"),
    corrected: count(results, "corrected"),
    confirmed: count(results, "confirmed"),
    ambiguous: results.filter((result) => result.outcome === "ambiguous").length,
    no_structured_address: results.filter((result) => (
      result.outcome === "no_structured_address"
      || result.outcome === "no_locality_match"
    )).length,
    pages_fetched: count(results, "pages_fetched"),
    results,
  };
}

export function selectStructuredAddressProposal(candidate, evidence) {
  const extracted = [];
  for (const page of evidence?.pages || []) {
    for (const raw of page?.structured_addresses || []) {
      const address = normalizeStructuredAddress(raw, candidate);
      if (!address?.street) continue;
      extracted.push({
        address,
        evidence_url: page.url,
        evidence_method: address.evidence_source === "official_embedded_directions"
          ? "official_embedded_directions"
          : address.evidence_source === "official_visible_text"
            ? "official_visible_text"
            : address.evidence_source === "official_literal_address"
              ? "official_literal_address"
            : "official_site_structured_address",
      });
    }
  }
  const unique = uniqueProposals(extracted);
  if (unique.length === 0) {
    return rejected("no_structured_address", 0);
  }

  const localityMatches = unique.filter(({ address }) => locationCompatible(candidate, address));
  if (localityMatches.length === 0) {
    return rejected("no_locality_match", unique.length);
  }
  if (localityMatches.length === 1) {
    return acceptIfBranchSafe(candidate, localityMatches[0], unique.length);
  }

  const exactStreet = localityMatches.filter(({ address }) => (
    streetIdentity(address.street) === streetIdentity(candidate.address)
  ));
  if (exactStreet.length === 1) return acceptIfBranchSafe(candidate, exactStreet[0], unique.length);

  const exactPostal = localityMatches.filter(({ address }) => (
    postalIdentity(address.postal_code)
    && postalIdentity(address.postal_code) === postalIdentity(candidate.postal_code)
  ));
  if (exactPostal.length === 1) return acceptIfBranchSafe(candidate, exactPostal[0], unique.length);
  return rejected("ambiguous", unique.length);
}

function normalizeStructuredAddress(raw, candidate) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const values = new Map(Object.entries(raw).map(([key, value]) => [
    normalizeKey(key),
    scalar(value),
  ]));
  const street = firstValue(values, [
    "streetaddress",
    "address1",
    "street",
    "formattedaddress",
    "fulladdress",
    "address",
  ]);
  if (!street) return null;
  const locality = firstValue(values, ["addresslocality", "locality", "city"]);
  const region = firstValue(values, ["addressregion", "region", "state"]);
  const postalCode = firstValue(values, ["postalcode", "postcode", "zipcode", "zip"]);
  const countryCode = normalizeCountry(firstValue(values, ["addresscountry", "country"]))
    || normalizeCountry(candidate?.country_code);
  return {
    street: cleanStreet(street, { locality, region, postalCode }),
    locality: clean(locality),
    region: clean(region),
    postal_code: clean(postalCode),
    country_code: countryCode,
    evidence_source: firstValue(values, ["evidencesource"]),
  };
}

function locationCompatible(candidate, address) {
  const candidateCountry = normalizeCountry(candidate?.country_code);
  if (candidateCountry && address.country_code && candidateCountry !== address.country_code) return false;
  const candidateLocality = placeIdentity(candidate?.locality);
  const addressLocality = placeIdentity(address.locality);
  const localityMatch = Boolean(
    candidateLocality
    && addressLocality
    && (
      candidateLocality === addressLocality
      || candidateLocality.includes(addressLocality)
      || addressLocality.includes(candidateLocality)
    )
  );
  const candidatePostal = postalIdentity(candidate?.postal_code);
  const addressPostal = postalIdentity(address.postal_code);
  const postalMatch = Boolean(candidatePostal && addressPostal && candidatePostal === addressPostal);
  if (
    ["official_visible_text", "official_embedded_directions"].includes(address.evidence_source)
    && candidatePostal
    && addressPostal
    && !postalMatch
  ) return false;
  if (candidateLocality || addressLocality) return localityMatch || postalMatch;
  const candidateRegion = regionIdentity(candidate?.region);
  const addressRegion = regionIdentity(address.region);
  return Boolean(candidateRegion && addressRegion && candidateRegion === addressRegion);
}

function cleanStreet(street, { locality, region, postalCode }) {
  let value = clean(street);
  if (!value) return null;
  for (const suffix of [postalCode, region, locality].filter(Boolean)) {
    value = value.replace(new RegExp(`(?:,?\\s*)${escapeRegex(suffix)}(?:\\s*)$`, "iu"), "").trim();
  }
  return value.replace(/,\s*$/u, "").trim() || null;
}

function addressChanged(candidate, address) {
  return streetIdentity(candidate?.address) !== streetIdentity(address.street)
    || placeIdentity(candidate?.locality) !== placeIdentity(address.locality || candidate?.locality)
    || regionIdentity(candidate?.region) !== regionIdentity(address.region || candidate?.region)
    || postalIdentity(candidate?.postal_code) !== postalIdentity(address.postal_code || candidate?.postal_code);
}

function addressSnapshot(candidate) {
  return {
    address: candidate.address || null,
    locality: candidate.locality || null,
    region: candidate.region || null,
    postal_code: candidate.postal_code || null,
    country_code: candidate.country_code || null,
    latitude: candidate.latitude == null ? null : Number(candidate.latitude),
    longitude: candidate.longitude == null ? null : Number(candidate.longitude),
  };
}

async function loadCandidates({ campaign, limit, marker }, { query }) {
  const params = [campaign, marker];
  const limitClause = limit == null ? "" : `LIMIT $${params.push(positiveInteger(limit, "limit"))}`;
  const result = await query(
    `
      SELECT *
      FROM fountain_raw.agent_discovery_candidates
      WHERE campaign = $1
        AND status = 'needs_review'
        AND promoted_location_id IS NULL
        AND address_verified IS DISTINCT FROM true
        AND coalesce(discovered_groups, '[]'::jsonb) ? 'held_rescue'
        AND NOT (coalesce(agent_payload, '{}'::jsonb) ? $2)
      ORDER BY id
      ${limitClause}
    `,
    params,
  );
  return result.rows || [];
}

function publicCandidate(candidate) {
  return {
    id: Number(candidate.id),
    name: candidate.name,
    website: candidate.website,
    address: candidate.address,
    locality: candidate.locality,
    region: candidate.region,
    postal_code: candidate.postal_code,
  };
}

function uniqueProposals(values) {
  const seen = new Set();
  return values.filter(({ address }) => {
    const key = [
      streetIdentity(address.street),
      placeIdentity(address.locality),
      regionIdentity(address.region),
      postalIdentity(address.postal_code),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function accepted(value, candidatesConsidered) {
  return {
    accepted: true,
    outcome: "accepted",
    address: value.address,
    evidence_url: value.evidence_url,
    evidence_method: value.evidence_method,
    candidates_considered: candidatesConsidered,
  };
}

function acceptIfBranchSafe(candidate, value, candidatesConsidered) {
  const candidateUnit = unitIdentity(candidate?.address);
  const proposedUnit = unitIdentity(value.address.street);
  if (candidateUnit && proposedUnit && candidateUnit !== proposedUnit) {
    return rejected("ambiguous", candidatesConsidered);
  }
  const changedStreet = streetIdentity(candidate?.address) !== streetIdentity(value.address.street);
  if (changedStreet && !specificStreetAddress(value.address.street)) {
    return rejected("ambiguous", candidatesConsidered);
  }
  if (!changedStreet || !candidate?.chain_name) return accepted(value, candidatesConsidered);
  const urlIdentity = normalizeIdentity(value.evidence_url);
  const branchTokens = [
    ...normalizeIdentity(candidate?.locality).split(" "),
    ...normalizeIdentity(candidate?.name).split(" "),
  ].filter((token) => token.length >= 4 && ![
    "center",
    "centre",
    "clinic",
    "aesthetics",
    "health",
    "integrative",
    "medical",
    "radiology",
    "sleep",
    "wellness",
    ...normalizeIdentity(candidate?.chain_name).split(" "),
  ].includes(token));
  if (!branchTokens.some((token) => urlIdentity.includes(token))) {
    return rejected("ambiguous", candidatesConsidered);
  }
  return accepted(value, candidatesConsidered);
}

function rejected(outcome, candidatesConsidered) {
  return {
    accepted: false,
    outcome,
    address: null,
    evidence_url: null,
    evidence_method: null,
    candidates_considered: candidatesConsidered,
  };
}

function firstValue(map, keys) {
  for (const key of keys) {
    const value = clean(map.get(key));
    if (value) return value;
  }
  return null;
}

function scalar(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return scalar(value.name ?? value.value ?? value["@id"]);
  }
  return null;
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function streetIdentity(value) {
  return normalizeIdentity(String(value || "").split(
    /\b(?:suite|ste|unit|floor|fl|level|room|office)\b/iu,
  )[0]);
}

function unitIdentity(value) {
  const match = String(value || "").match(
    /(?:\b(?:suite|ste|unit|floor|fl|level|room|office)\s*|#\s*)([A-Za-z0-9-]+)/iu,
  );
  return normalizeIdentity(match?.[1]);
}

function specificStreetAddress(value) {
  const text = String(value || "");
  return /\d/u.test(text)
    || /\b(?:avenue|ave|boulevard|blvd|building|bldg|calle|carrer|drive|dr|highway|hwy|jalan|lane|ln|mall|plaza|road|rd|rue|soi|strasse|straße|street|st|tower|way)\b/iu.test(text);
}

function placeIdentity(value) {
  return normalizeIdentity(value).replace(/^ft\b/u, "fort");
}

function regionIdentity(value) {
  const normalized = normalizeIdentity(value);
  const aliases = new Map([
    ["california", "ca"],
    ["florida", "fl"],
    ["new york", "ny"],
    ["texas", "tx"],
    ["washington", "wa"],
    ["massachusetts", "ma"],
    ["pennsylvania", "pa"],
    ["georgia", "ga"],
    ["north carolina", "nc"],
    ["colorado", "co"],
    ["nevada", "nv"],
    ["arizona", "az"],
    ["illinois", "il"],
    ["maryland", "md"],
  ]);
  return aliases.get(normalized) || normalized;
}

function postalIdentity(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function normalizeCountry(value) {
  if (value && typeof value === "object") value = value.name || value["@id"];
  const normalized = normalizeIdentity(value);
  const aliases = new Map([
    ["united states", "US"],
    ["united states of america", "US"],
    ["usa", "US"],
    ["us", "US"],
    ["canada", "CA"],
    ["ca", "CA"],
    ["united kingdom", "GB"],
    ["uk", "GB"],
    ["great britain", "GB"],
    ["united arab emirates", "AE"],
    ["uae", "AE"],
  ]);
  return aliases.get(normalized)
    || (/^[a-z]{2}$/u.test(normalized) ? normalized.toUpperCase() : null);
}

function normalizeIdentity(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

function clean(value) {
  const normalized = String(value || "").replace(/\s+/gu, " ").trim();
  return normalized || null;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}

function nonemptyString(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${label} must be a non-empty string.`);
  return normalized;
}

function count(results, field) {
  return results.reduce((total, result) => total + Number(result?.[field] || 0), 0);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
