import { query as defaultQuery, setMutationActor, withTransaction } from "./db.mjs";
import { GENERIC_DOMAINS, matchLocation as defaultMatchLocation } from "./matcher.mjs";
import {
  isOfficialChainSync,
  matchOfficialChainLocation,
} from "./official-chain-match.mjs";
import {
  buildTreatmentMap,
  MENU_TREATMENT_MAP_SQL,
  normalizeMenuTerm,
} from "../tasks/menu_extract.mjs";

export const AGENT_DISCOVERY_SOURCE_SLUG = "agent_discovery";
export const PLACE_PROMOTION_ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607230001";
export const QA_DISTINCT_LOCATION_GROUP = "qa_distinct_location_reviewed";
export const MOBILE_SERVICE_GROUP = "mobile_service_area_reviewed";
const NON_OFFICIAL_DOMAINS = new Set([
  ...GENERIC_DOMAINS,
  "atly.com",
  "business.keybiscaynechamber.org",
  "cd2.jdch.production.merge-digital.com",
  "docspot.com",
  "flhottub.com",
  "fresha.com",
  "gymswithsauna.com",
  "healthgrades.com",
  "hirefrederick.com",
  "ketaminehealingnow.com",
  "longevity.haus",
  "newchoicehealth.com",
  "nextmd.ai",
  "opennpi.com",
  "peptidealliance.io",
  "plungesaunafinder.com",
  "psychedelist.com",
  "saunanearme.com",
  "whatclinic.com",
  "yellowpagesdirectory.com",
  "webmd.com",
]);

export async function promoteDiscoveredPlaces({
  campaign,
  runId,
  apply = false,
  limit = null,
}, operations = {}) {
  const query = operations.query || defaultQuery;
  const candidates = await loadReadyCandidates({ campaign, limit }, { query });
  if (!apply) {
    return {
      selected: candidates.length,
      chain_branches: candidates.filter((candidate) => candidate.chain_name).length,
      with_phone: candidates.filter((candidate) => candidate.phone).length,
      with_email: candidates.filter((candidate) => candidate.email).length,
      with_agent_image: candidates.filter((candidate) => candidate.image_url).length,
      with_agent_offerings: candidates.filter((candidate) => candidate.offerings?.length).length,
      sample: candidates.slice(0, 20).map(publicCandidate),
    };
  }

  const sourceId = await ensureAgentDiscoverySource({ campaign }, { query });
  const treatmentRows = await query(MENU_TREATMENT_MAP_SQL);
  const treatmentMap = buildTreatmentMap(treatmentRows.rows || []);
  const transaction = operations.withTransaction || withTransaction;
  const setActor = operations.setMutationActor || setMutationActor;
  const matchLocation = operations.matchLocation || ((input, options) => defaultMatchLocation(input, options));
  const results = [];

  for (const candidate of candidates) {
    const qaDistinctLocation = isQaDistinctLocationReviewed(candidate);
    if (
      !qaDistinctLocation
      && (
        isNonOfficialWebsite(candidate.website)
        || isPlainHospitalCandidate(candidate)
        || isChainDomainMismatch(candidate)
      )
    ) {
      const refusal = {
        status: "review",
        guardrail: isNonOfficialWebsite(candidate.website)
          ? "non_official_website_domain"
          : isPlainHospitalCandidate(candidate)
            ? "plain_hospital_scope_review"
            : "chain_domain_mismatch",
        website_domain: websiteDomain(candidate.website),
      };
      await query(
        `
          UPDATE fountain_raw.agent_discovery_candidates
          SET status = 'needs_review', match_result = $2::jsonb, updated_at = now()
          WHERE id = $1 AND status = 'ready'
        `,
        [candidate.id, JSON.stringify(refusal)],
      );
      results.push({
        candidate_id: Number(candidate.id),
        outcome: "needs_review",
        location_id: null,
      });
      continue;
    }
    const recheck = qaDistinctLocation
      ? { status: "none" }
      : isOfficialChainSync(candidate)
      ? await matchOfficialChainLocation(candidate, { query })
      : await matchLocation(candidateMatchInput(candidate), { query });
    if (recheck.status !== "none") {
      const status = recheck.status === "matched" ? "existing_match" : "needs_review";
      await query(
        `
          UPDATE fountain_raw.agent_discovery_candidates
          SET status = $2, match_result = $3::jsonb, updated_at = now()
          WHERE id = $1 AND status = 'ready'
        `,
        [candidate.id, status, JSON.stringify(recheck)],
      );
      results.push({
        candidate_id: Number(candidate.id),
        outcome: status,
        location_id: recheck.location_id || recheck.candidate_location_id || null,
      });
      continue;
    }

    const promoted = await transaction(async (tx) => {
      await setActor(tx, {
        actorId: PLACE_PROMOTION_ACTOR_ID,
        actorLabel: `agent_discovery_promote_run_${runId}`,
      });
      const locked = (await tx.query(
        `
          SELECT *
          FROM fountain_raw.agent_discovery_candidates
          WHERE id = $1 AND status = 'ready' AND promoted_location_id IS NULL
          FOR UPDATE
        `,
        [candidate.id],
      )).rows[0];
      if (!locked) return { outcome: "no_longer_ready", location_id: null, offerings: 0 };

      const mobileService = isMobileServiceCandidate(locked);
      const organizationId = await ensureOrganization(tx, locked);
      const locationResult = await tx.query(
        `
          SELECT fountain.create_location($1::jsonb, $2::uuid) AS location_id
        `,
        [
          JSON.stringify({
            org_id: organizationId,
            name: locked.name,
            address: mobileService ? null : locked.address,
            locality: locked.locality,
            region: locked.region,
            postal_code: mobileService ? null : locked.postal_code,
            country_code: locked.country_code,
            country_name: countryName(locked.country_code),
            latitude: locked.latitude,
            longitude: locked.longitude,
            phone: isOfficialChainSync(locked) || mobileService ? locked.phone : null,
            email: isOfficialChainSync(locked) || mobileService ? locked.email : null,
            website: locked.website,
            data_origin: "scraped",
            verification_status: "unverified",
          }),
          PLACE_PROMOTION_ACTOR_ID,
        ],
      );
      const locationId = Number(locationResult.rows[0]?.location_id);
      if (!Number.isInteger(locationId) || locationId <= 0) {
        throw new Error(`create_location returned an invalid id for candidate ${locked.id}.`);
      }
      if (mobileService) {
        await attachMobileServiceTag(tx, { locationId });
      }

      const sourceUrl = locked.website || locked.evidence_urls?.[0];
      await upsertRawSourceListing(tx, {
        campaign,
        candidate: locked,
        sourceUrl,
      });
      await attachSourceRecord(tx, {
        sourceId,
        locationId,
        candidateId: Number(locked.id),
        sourceUrl,
        campaign,
      });
      const offerings = candidateOfferings(locked, { treatmentMap });
      for (const offering of offerings) {
        await insertOffering(tx, { offering, locationId, sourceId });
      }
      await tx.query(
        `
          INSERT INTO fountain.entity_change_events (
            entity_type, entity_id, action, actor_type, actor_id, reason, metadata
          )
          VALUES (
            'location', $1, 'agent_discovery_promote', 'admin', $2::uuid,
            'agent_discovery:promote',
            jsonb_build_object(
              'run_id', $3::bigint,
              'campaign', $4::text,
              'candidate_id', $5::bigint,
              'source_id', $6::integer
            )
          )
        `,
        [locationId, PLACE_PROMOTION_ACTOR_ID, runId, campaign, locked.id, sourceId],
      );
      await tx.query(
        `
          UPDATE fountain_raw.agent_discovery_candidates
          SET status = 'promoted',
              promoted_location_id = $2,
              updated_at = now()
          WHERE id = $1
        `,
        [locked.id, locationId],
      );
      await enqueueNewLocationEnrichment(tx, {
        locationId,
        runId,
        campaign,
        needsContact: true,
      });
      return {
        outcome: "promoted",
        location_id: locationId,
        organization_id: organizationId,
        offerings: offerings.length,
      };
    });
    results.push({ candidate_id: Number(candidate.id), ...promoted });
  }

  await query(
    `
      UPDATE fountain_raw.source_databases
      SET listing_count = (
            SELECT count(*)::integer
            FROM fountain_raw.source_listings
            WHERE source_slug = $1
          ),
          field_count = (
            SELECT count(*)::integer
            FROM fountain_raw.source_listing_fields
            WHERE source_slug = $1
          ),
          last_synced_at = now(),
          updated_at = now(),
          sync_status = 'complete'
      WHERE source_slug = $1
    `,
    [AGENT_DISCOVERY_SOURCE_SLUG],
  );
  return {
    selected: candidates.length,
    promoted: results.filter((result) => result.outcome === "promoted").length,
    existing_matches: results.filter((result) => result.outcome === "existing_match").length,
    needs_review: results.filter((result) => result.outcome === "needs_review").length,
    offerings_inserted: results.reduce((sum, result) => sum + Number(result.offerings || 0), 0),
    results,
  };
}

export function isQaDistinctLocationReviewed(candidate) {
  return Array.isArray(candidate?.discovered_groups)
    && candidate.discovered_groups.includes(QA_DISTINCT_LOCATION_GROUP);
}

export function isMobileServiceCandidate(candidate) {
  return Array.isArray(candidate?.discovered_groups)
    && candidate.discovered_groups.includes(MOBILE_SERVICE_GROUP);
}

async function ensureAgentDiscoverySource({ campaign }, { query }) {
  const source = await query(
    `
      INSERT INTO fountain.sources (id, slug, trust_weight, offering_granularity)
      VALUES (
        nextval(pg_get_serial_sequence('fountain.sources', 'id'))::integer,
        $1, 0.85, 'menu_item'
      )
      ON CONFLICT (slug) DO UPDATE SET trust_weight = EXCLUDED.trust_weight
      RETURNING id
    `,
    [AGENT_DISCOVERY_SOURCE_SLUG],
  );
  await query(
    `
      INSERT INTO fountain_raw.source_databases (
        source_slug, source_db_path, file_size_bytes, file_mtime_ms,
        listing_count, image_count, review_count, field_count, page_count,
        metadata, last_synced_at, sync_status
      )
      VALUES (
        $1, 'openrouter://agent-discovery', 0, 0, 0, 0, 0, 0, 0,
        jsonb_build_object('provider','openrouter','campaign',$2::text),
        NULL, 'pending'
      )
      ON CONFLICT (source_slug) DO UPDATE SET
        metadata = fountain_raw.source_databases.metadata
          || jsonb_build_object('latest_campaign',$2::text),
        updated_at = now()
    `,
    [AGENT_DISCOVERY_SOURCE_SLUG, campaign],
  );
  return Number(source.rows[0].id);
}

async function ensureOrganization(tx, candidate) {
  const domain = websiteDomain(candidate.website);
  if (domain) {
    const existing = await tx.query(
      `
        SELECT id
        FROM fountain.organizations
        WHERE deleted_at IS NULL
          AND status = 'active'
          AND (lower(coalesce(website_domain,'')) = $1 OR lower(coalesce(dedup_key,'')) = $1)
        ORDER BY id
        LIMIT 1
      `,
      [domain],
    );
    if (existing.rows[0]) return Number(existing.rows[0].id);
  }
  const canonicalName = candidate.chain_name || candidate.name;
  const normalizedName = normalizeName(canonicalName);
  const fallbackDedup = `agent-discovery:${normalizedName}:${normalizeName(candidate.locality)}`;
  const dedupKey = domain || fallbackDedup;
  const inserted = await tx.query(
    `
      INSERT INTO fountain.organizations (
        id, canonical_name, name_normalized, website_domain, dedup_key,
        status, data_origin, verification_status
      )
      VALUES (
        nextval(pg_get_serial_sequence('fountain.organizations', 'id'))::integer,
        $1, $2, $3, $4, 'active', 'scraped', 'unverified'
      )
      ON CONFLICT (dedup_key) DO UPDATE SET
        canonical_name = EXCLUDED.canonical_name,
        website_domain = COALESCE(fountain.organizations.website_domain, EXCLUDED.website_domain),
        status = 'active'
      RETURNING id
    `,
    [canonicalName, normalizedName, domain, dedupKey],
  );
  return Number(inserted.rows[0].id);
}

async function upsertRawSourceListing(tx, { campaign, candidate, sourceUrl }) {
  const listingSourceUrl = rawListingSourceUrl(candidate, sourceUrl);
  await tx.query(
    `
      INSERT INTO fountain_raw.source_listings (
        source_slug, source_listing_id, source_url, name, extracted_at, payload
      )
      VALUES ($1, $2, $3, $4, now()::text, $5::jsonb)
      ON CONFLICT (source_slug, source_listing_id) DO UPDATE SET
        source_url = EXCLUDED.source_url,
        name = EXCLUDED.name,
        extracted_at = EXCLUDED.extracted_at,
        payload = EXCLUDED.payload,
        synced_at = now()
    `,
    [
      AGENT_DISCOVERY_SOURCE_SLUG,
      candidate.id,
      listingSourceUrl,
      candidate.name,
      JSON.stringify({
        campaign,
        candidate_id: Number(candidate.id),
        name: candidate.name,
        website: candidate.website,
        address: candidate.address,
        locality: candidate.locality,
        region: candidate.region,
        postal_code: candidate.postal_code,
        country_code: candidate.country_code,
        phone: candidate.phone,
        email: candidate.email,
        image_url: candidate.image_url,
        chain_name: candidate.chain_name,
        chain_locations_url: candidate.chain_locations_url,
        matched_treatments: candidate.matched_treatments,
        offerings: candidate.offerings,
        evidence_urls: candidate.evidence_urls,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        geocode_provider: candidate.geocode_provider,
      }),
    ],
  );
  const fields = {
    address: candidate.address,
    phone: candidate.phone,
    email: candidate.email,
    website: candidate.website,
    chain_name: candidate.chain_name,
  };
  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue;
    await tx.query(
      `
        INSERT INTO fountain_raw.source_listing_fields (
          source_slug, source_listing_id, field_name, field_value
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (source_slug, source_listing_id, field_name) DO UPDATE SET
          field_value = EXCLUDED.field_value,
          synced_at = now()
      `,
      [AGENT_DISCOVERY_SOURCE_SLUG, candidate.id, field, String(value)],
    );
  }
}

function rawListingSourceUrl(candidate, sourceUrl) {
  if (!sourceUrl) return sourceUrl;
  try {
    const url = new URL(sourceUrl);
    url.hash = `location-${candidate.id}`;
    return url.href;
  } catch {
    return sourceUrl;
  }
}

function countryName(countryCode) {
  const names = {
    AE: "United Arab Emirates",
    AT: "Austria",
    CA: "Canada",
    DE: "Germany",
    ES: "Spain",
    FR: "France",
    GB: "United Kingdom",
    ID: "Indonesia",
    MX: "Mexico",
    PT: "Portugal",
    QA: "Qatar",
    SG: "Singapore",
    TH: "Thailand",
    US: "United States",
    ZA: "South Africa",
  };
  return names[String(countryCode || "").toUpperCase()] || null;
}

async function attachSourceRecord(tx, {
  sourceId,
  locationId,
  candidateId,
  sourceUrl,
  campaign,
}) {
  await tx.query(
    `
      INSERT INTO fountain.source_records (
        id, source_id, entity_type, entity_id, source_listing_id, source_url, raw_ref
      )
      VALUES (
        nextval(pg_get_serial_sequence('fountain.source_records', 'id'))::integer,
        $1, 'location', $2, $3, $4, $5
      )
    `,
    [sourceId, locationId, candidateId, sourceUrl, `agent-discovery:${campaign}:${candidateId}`],
  );
}

async function insertOffering(tx, { offering, locationId, sourceId }) {
  await tx.query(
    `
      INSERT INTO fountain.offerings (
        id, location_id, treatment_id, raw_name, price_amount, price_currency,
        source_offer_url, source_id, status, data_origin, verification_status
      )
      VALUES (
        nextval(pg_get_serial_sequence('fountain.offerings', 'id'))::integer,
        $1, $2, $3, $4, $5, $6, $7, 'active', 'scraped', 'unverified'
      )
      ON CONFLICT (location_id, source_id, raw_name) DO NOTHING
    `,
    [
      locationId,
      offering.treatment_id,
      offering.raw_name,
      offering.price_amount,
      offering.price_currency,
      offering.source_url,
      sourceId,
    ],
  );
}

async function attachMobileServiceTag(tx, { locationId }) {
  const tag = await tx.query(
    `
      INSERT INTO fountain.tags (id, facet, value)
      VALUES (
        nextval(pg_get_serial_sequence('fountain.tags', 'id'))::integer,
        'care_model',
        'Mobile service'
      )
      ON CONFLICT (facet, value) DO UPDATE SET value = EXCLUDED.value
      RETURNING id
    `,
  );
  await tx.query(
    `
      INSERT INTO fountain.entity_tags (id, entity_type, entity_id, tag_id)
      VALUES (
        nextval(pg_get_serial_sequence('fountain.entity_tags', 'id'))::integer,
        'location',
        $1,
        $2
      )
      ON CONFLICT (entity_type, entity_id, tag_id) DO NOTHING
    `,
    [locationId, Number(tag.rows[0].id)],
  );
}

async function enqueueNewLocationEnrichment(tx, {
  locationId,
  runId,
  campaign,
  needsContact,
}) {
  const tasks = [
    ...(needsContact ? [{
      task_type: "contact_fill",
      payload: { campaign, skip_google_places: true },
    }] : []),
    { task_type: "image_harvest", payload: { campaign } },
    { task_type: "image_classify", payload: { campaign } },
    {
      task_type: "menu_extract",
      payload: { campaign, model: "openai/gpt-4o-mini" },
    },
  ];
  for (const task of tasks) {
    await tx.query(
      `
        INSERT INTO fountain_ops.task_queue (
          task_type, entity_type, entity_id, priority, payload, max_attempts, run_id
        )
        VALUES ($1, 'location', $2, 40, $3::jsonb, 3, $4)
        ON CONFLICT (task_type, entity_type, entity_id)
          WHERE status IN ('pending', 'claimed')
          DO NOTHING
      `,
      [task.task_type, locationId, JSON.stringify(task.payload), runId],
    );
  }
}

function candidateOfferings(candidate, { treatmentMap }) {
  const trustOfficialPrices = isOfficialChainSync(candidate);
  const combined = [];
  for (const offering of candidate.offerings || []) {
    combined.push({
      raw_name: offering.name,
      price_amount: trustOfficialPrices ? numberOrNull(offering.price_amount) : null,
      price_currency: trustOfficialPrices && numberOrNull(offering.price_amount) != null
        ? (offering.price_currency || "USD")
        : null,
      source_url: offering.source_url || candidate.website || candidate.evidence_urls?.[0],
    });
  }
  for (const rawName of candidate.matched_treatments || []) {
    combined.push({
      raw_name: rawName,
      price_amount: null,
      price_currency: null,
      source_url: candidate.evidence_urls?.[0] || candidate.website,
    });
  }
  const unique = new Map();
  for (const item of combined) {
    const normalized = normalizeMenuTerm(item.raw_name);
    if (!normalized || unique.has(normalized)) continue;
    const mapping = treatmentMap.get(normalized);
    unique.set(normalized, {
      ...item,
      treatment_id: mapping?.status === "mapped" ? mapping.treatment_id : null,
    });
  }
  return [...unique.values()];
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function loadReadyCandidates({ campaign, limit }, { query }) {
  const params = [campaign];
  const limitClause = limit == null ? "" : `LIMIT $${params.push(positiveInteger(limit, "limit"))}`;
  const result = await query(
    `
      SELECT *
      FROM fountain_raw.agent_discovery_candidates
      WHERE campaign = $1
        AND status = 'ready'
        AND promoted_location_id IS NULL
      ORDER BY id
      ${limitClause}
    `,
    params,
  );
  return result.rows || [];
}

function candidateMatchInput(candidate) {
  return {
    name: candidate.name,
    website: candidate.website,
    address: candidate.address,
    locality: candidate.locality,
    region: candidate.region,
    postal_code: candidate.postal_code,
    country_code: candidate.country_code,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  };
}

function publicCandidate(candidate) {
  return {
    id: Number(candidate.id),
    name: candidate.name,
    address: candidate.address,
    locality: candidate.locality,
    website: candidate.website,
    chain_name: candidate.chain_name,
    matched_treatments: candidate.matched_treatments,
    offerings: candidate.offerings,
  };
}

function websiteDomain(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./u, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeName(value) {
  return String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

export function isNonOfficialWebsite(value) {
  const domain = websiteDomain(value);
  return !domain || NON_OFFICIAL_DOMAINS.has(domain);
}

function isPlainHospitalCandidate(candidate) {
  const identity = String(candidate?.name || "").toLowerCase();
  if (!/\b(?:hospital|medical center)\b/u.test(identity)) return false;
  return !/\b(?:diagnostic|imaging|longevity|outpatient|radiology|screening|sleep|wellness)\b/u
    .test(identity);
}

function isChainDomainMismatch(candidate) {
  if (!candidate?.chain_name || !candidate?.chain_locations_url) return false;
  const website = websiteDomain(candidate.website);
  const chain = websiteDomain(candidate.chain_locations_url);
  if (!website || !chain) return true;
  return !(
    website === chain
    || website.endsWith(`.${chain}`)
    || chain.endsWith(`.${website}`)
  );
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}
