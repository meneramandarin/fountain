import { getPlacesRequestConfig } from "../config/providers.mjs";
import { query as defaultQuery, setMutationActor } from "../lib/db.mjs";
import { recordWrite as defaultRecordWrite } from "../lib/ledger.mjs";
import { createPlacesClient } from "../lib/places.mjs";
import { getRunSpend as defaultGetRunSpend } from "../lib/runs.mjs";
import {
  selectGooglePlaceMatch,
  validateOfficialWebsiteCandidate,
} from "../lib/website-discovery.mjs";
import { createWebClient } from "../lib/web.mjs";

export const CONTACT_FILL_BUDGET_USD = 50;
export const CONTACT_FILL_ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607120009";
export const CONTACT_FILL_SCHEMA_VERSION = 1;
export const CONTACT_FILL_PAGE_LIMIT = 4;

const CONTACT_FIELDS = Object.freeze(["website", "email", "phone", "address"]);
const CONTACT_PATHS = Object.freeze([
  "/contact",
  "/about",
  "/impressum",
]);
const FIELD_COLUMNS = Object.freeze({
  website: "website",
  email: "email",
  phone: "phone",
  address: "address",
});
const DETAILS_COST_USD = Number(
  getPlacesRequestConfig("contact_fill", "details").estimatedCostUsd,
);

const LOAD_LOCATION_SQL = `
  SELECT
    location.id,
    location.name,
    location.address,
    location.locality,
    location.region,
    location.postal_code,
    location.country_code,
    location.latitude,
    location.longitude,
    location.website,
    location.email,
    location.phone,
    location.status,
    location.deleted_at,
    organization.canonical_name AS organization_name,
    COALESCE(place_data.external_place_matches, '[]'::jsonb) AS external_place_matches,
    COALESCE(suppression_data.suppression_count, 0)::integer AS suppression_count
  FROM fountain.locations location
  LEFT JOIN fountain.organizations organization ON organization.id = location.org_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'provider', place.provider,
        'provider_place_id', place.provider_place_id,
        'display_name', place.display_name,
        'match_status', place.match_status,
        'match_confidence', place.match_confidence
      ) ORDER BY place.provider
    ) AS external_place_matches
    FROM fountain.external_place_matches place
    WHERE place.location_id = location.id
      AND place.provider_place_id IS NOT NULL
  ) place_data ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS suppression_count
    FROM fountain.source_records source_record
    JOIN fountain.sources source ON source.id = source_record.source_id
    JOIN fountain_raw.suppressed_source_listings suppressed
      ON suppressed.source_slug = source.slug
     AND suppressed.source_listing_id = source_record.source_listing_id
    WHERE source_record.entity_type = 'location'
      AND source_record.entity_id = location.id
  ) suppression_data ON true
  WHERE location.id = $1
`;

const RECHECK_LOCATION_SQL = `
  SELECT
    location.status,
    location.deleted_at,
    location.website,
    location.email,
    location.phone,
    location.address,
    NOT EXISTS (
      SELECT 1
      FROM fountain.source_records source_record
      JOIN fountain.sources source ON source.id = source_record.source_id
      JOIN fountain_raw.suppressed_source_listings suppressed
        ON suppressed.source_slug = source.slug
       AND suppressed.source_listing_id = source_record.source_listing_id
      WHERE source_record.entity_type = 'location'
        AND source_record.entity_id = location.id
    ) AS non_suppressed
  FROM fountain.locations location
  WHERE location.id = $1
  FOR UPDATE
`;

export function createContactFillHandler({ agentSearch = null, ...dependencies } = {}) {
  return (input) => handleContactFill({
    ...input,
    agentSearch: input?.agentSearch ?? agentSearch,
  }, dependencies);
}

/**
 * Queue-handler-compatible contact enrichment. All network and mutation
 * dependencies are injectable; production defaults retain Places call-ledger,
 * cached crawl, and field-ledger behavior.
 */
export async function handleContactFill(
  {
    task,
    run,
    agentSearch = null,
  },
  {
    query = defaultQuery,
    placesClient = createPlacesClient(),
    webClient = createWebClient(),
    recordWrite = defaultRecordWrite,
    getRunSpend = defaultGetRunSpend,
    setActor = setMutationActor,
    contactBudgetUsd = CONTACT_FILL_BUDGET_USD,
  } = {},
) {
  const taskId = positiveIntegerString(task?.id, "task.id");
  const locationId = positiveInteger(task?.entity_id, "task.entity_id");
  const runId = positiveIntegerString(run?.id, "run.id");
  if (task?.entity_type && task.entity_type !== "location") {
    throw new Error("contact_fill supports only location tasks.");
  }
  if (agentSearch != null && typeof agentSearch !== "function") {
    throw new TypeError("agentSearch must be a function when supplied.");
  }
  const budgetLimit = normalizeBudgetLimit(contactBudgetUsd, run?.budget_usd);
  const initialResult = await executeQuery(query, LOAD_LOCATION_SQL, [locationId]);
  const initialRow = rowsFrom(initialResult)[0];
  if (!initialRow) {
    return skippedResult({ taskId, runId, locationId, reason: "location_missing" });
  }
  const initial = normalizeLocation(initialRow);
  if (!isActiveAndUnsuppressed(initial)) {
    return skippedResult({
      taskId,
      runId,
      locationId,
      reason: initial.status !== "active" || initial.deletedAt
        ? "location_not_active"
        : "location_suppressed",
      initial,
    });
  }

  const evidence = {
    discovery_order: [],
    agent_search: null,
    places: [],
    crawl: null,
  };
  const writes = Object.fromEntries(CONTACT_FIELDS.map((field) => [field, emptyWrite(field)]));
  const actorLabel = `contact_fill_run_${runId}`;
  let placesDetails = null;
  let storedDetailsAttempted = false;
  let workingWebsite = initial.website;
  const storedPlaceMatch = selectGooglePlaceMatch(initial.externalPlaceMatches);

  const budget = createPlacesBudgetGuard({
    runId,
    budgetLimit,
    getRunSpend,
  });

  // A stored provider ID is the one exception to agent-first discovery: it is
  // stronger identity evidence, so contact details are fetched directly.
  if (!workingWebsite && storedPlaceMatch && await budget.allowDetails()) {
    storedDetailsAttempted = true;
    evidence.discovery_order.push("stored_provider_details");
    placesDetails = await safePlacesDetails({
      placesClient,
      runId,
      location: initial,
      placeId: storedPlaceMatch.providerPlaceId,
      evidence,
      phase: "stored_provider_details",
    });
    const website = validatedPlacesWebsite(initial, placesDetails);
    if (website) workingWebsite = website;
  }

  if (!workingWebsite) {
    evidence.discovery_order.push("agent_web_search");
    const agent = await runAgentWebsiteSearch({
      agentSearch,
      runId,
      taskId,
      location: initial,
    });
    evidence.agent_search = agent;
    if (agent.official_website) workingWebsite = agent.official_website;
  }

  if (!workingWebsite && await budget.allowDetails()) {
    evidence.discovery_order.push("places_search_details_fallback");
    const searchedDetails = await searchPlacesDetails({
      placesClient,
      runId,
      location: initial,
      evidence,
      budget,
    });
    if (searchedDetails) placesDetails = searchedDetails;
    const website = validatedPlacesWebsite(initial, placesDetails);
    if (website) workingWebsite = website;
  }

  if (!initial.website && workingWebsite) {
    writes.website = await guardedFillField({
      field: "website",
      value: workingWebsite,
      source: websiteSource(evidence, placesDetails),
      taskId,
      runId,
      locationId,
      actorLabel,
    }, { recordWrite, setActor });
  }

  const crawlWebsite = initial.website || workingWebsite;
  let crawlContacts = { email: null, phone: null, address: null };
  if (crawlWebsite) {
    evidence.discovery_order.push("cached_contact_crawl");
    evidence.crawl = await crawlContactPages(crawlWebsite, webClient);
    crawlContacts = extractContactFields(evidence.crawl.pages, {
      countryCode: initial.countryCode,
    });
    for (const field of ["email", "phone", "address"]) {
      if (!initial[field] && crawlContacts[field]) {
        writes[field] = await guardedFillField({
          field,
          value: crawlContacts[field],
          source: "website_crawl",
          taskId,
          runId,
          locationId,
          actorLabel,
        }, { recordWrite, setActor });
      }
    }
  }

  // Places is last for fields still missing after the website crawl. Email is
  // intentionally absent: Google Places is never an email source.
  const stillMissing = (field) => (
    !initial[field]
    && !writes[field].written
    && !writes[field].attempted
  );
  if (["website", "phone", "address"].some(stillMissing)) {
    if (!placesDetails && await budget.allowDetails()) {
      evidence.discovery_order.push("final_places_contact_fill");
      if (storedPlaceMatch && !storedDetailsAttempted) {
        storedDetailsAttempted = true;
        placesDetails = await safePlacesDetails({
          placesClient,
          runId,
          location: initial,
          placeId: storedPlaceMatch.providerPlaceId,
          evidence,
          phase: "final_places_contact_fill",
        });
      } else {
        placesDetails = await searchPlacesDetails({
          placesClient,
          runId,
          location: initial,
          evidence,
          budget,
        });
      }
    }
    if (placesDetails) {
      const placeCandidates = {
        website: validatedPlacesWebsite(initial, placesDetails),
        phone: normalizePhone(
          placesDetails.internationalPhoneNumber || placesDetails.nationalPhoneNumber,
          initial.countryCode,
        ),
        address: normalizeAddress(placesDetails.formattedAddress),
      };
      for (const field of ["website", "phone", "address"]) {
        if (stillMissing(field) && placeCandidates[field]) {
          writes[field] = await guardedFillField({
            field,
            value: placeCandidates[field],
            source: "google_places_contact_details",
            taskId,
            runId,
            locationId,
            actorLabel,
          }, { recordWrite, setActor });
        }
      }
    }
  }

  const finalResult = await executeQuery(query, LOAD_LOCATION_SQL, [locationId]);
  const finalRow = rowsFrom(finalResult)[0];
  const final = finalRow ? normalizeLocation(finalRow) : initial;
  const budgetEvidence = await budget.snapshot();
  const writtenFields = CONTACT_FIELDS.filter((field) => writes[field].written);
  const attemptedFields = CONTACT_FIELDS.filter((field) => writes[field].attempted);
  return {
    schema_version: CONTACT_FILL_SCHEMA_VERSION,
    outcome: writtenFields.length > 0 ? "contact_filled" : "no_changes",
    task_id: taskId,
    run_id: runId,
    location_id: locationId,
    initial: contactSnapshot(initial),
    final: contactSnapshot(final),
    evidence,
    extracted: crawlContacts,
    fields: writes,
    budget: budgetEvidence,
    serving_write: {
      attempted: attemptedFields.length > 0,
      attempted_fields: attemptedFields,
      written: writtenFields.length > 0,
      written_fields: writtenFields,
    },
    email_source_policy: "website_only",
  };
}

function createPlacesBudgetGuard({ runId, budgetLimit, getRunSpend }) {
  let lastSpend = 0;
  let degraded = false;
  let checks = 0;
  async function allowDetails() {
    checks += 1;
    lastSpend = nonnegativeNumber(await getRunSpend(runId), "contact run spend");
    const allowed = lastSpend + DETAILS_COST_USD <= budgetLimit;
    if (!allowed) degraded = true;
    return allowed;
  }
  async function snapshot() {
    lastSpend = nonnegativeNumber(await getRunSpend(runId), "contact run spend");
    if (lastSpend + DETAILS_COST_USD > budgetLimit) degraded = true;
    return {
      limit_usd: budgetLimit,
      spend_usd: lastSpend,
      details_unit_cost_usd: DETAILS_COST_USD,
      checks,
      degraded_to_agent_only: degraded,
      places_calls_allowed: !degraded,
    };
  }
  return { allowDetails, snapshot };
}

async function safePlacesDetails({
  placesClient,
  runId,
  location,
  placeId,
  evidence,
  phase,
}) {
  try {
    const response = await placesClient.getDetails({
      runId,
      taskType: "contact_fill",
      entityId: location.id,
      placeId,
      maxAttempts: 4,
    });
    const data = object(response?.data);
    const identityValidated = validatePlacesIdentity(location, data);
    evidence.places.push({
      phase,
      operation: "details",
      outcome: identityValidated ? "ok" : "identity_mismatch",
      provider_place_id: placeId,
      external_call_id: response?.externalCallId ?? null,
      field_mask: response?.fieldMask || null,
      has_website: Boolean(text(data.websiteUri)),
      has_phone: Boolean(text(data.internationalPhoneNumber || data.nationalPhoneNumber)),
      has_address: Boolean(text(data.formattedAddress)),
      identity_validated: identityValidated,
    });
    return identityValidated ? data : null;
  } catch (error) {
    evidence.places.push({
      phase,
      operation: "details",
      outcome: "error",
      provider_place_id: placeId,
      error: errorMessage(error),
    });
    return null;
  }
}

async function searchPlacesDetails({ placesClient, runId, location, evidence, budget }) {
  let search;
  try {
    search = await placesClient.searchText({
      runId,
      taskType: "contact_fill",
      entityId: location.id,
      textQuery: placesTextQuery(location),
      ...(location.countryCode ? { regionCode: location.countryCode } : {}),
      maxResultCount: 1,
      maxAttempts: 4,
    });
    const placeId = text(search?.data?.places?.[0]?.id);
    evidence.places.push({
      phase: "places_search_details_fallback",
      operation: "search_text",
      outcome: placeId ? "place_id_found" : "no_results",
      provider_place_id: placeId || null,
      external_call_id: search?.externalCallId ?? null,
      field_mask: search?.fieldMask || null,
    });
    if (!placeId) return null;
    if (!await budget.allowDetails()) {
      evidence.places.push({
        phase: "places_search_details_fallback",
        operation: "details",
        outcome: "budget_degraded",
        provider_place_id: placeId,
      });
      return null;
    }
    return safePlacesDetails({
      placesClient,
      runId,
      location,
      placeId,
      evidence,
      phase: "places_search_details_fallback",
    });
  } catch (error) {
    evidence.places.push({
      phase: "places_search_details_fallback",
      operation: "search_text",
      outcome: "error",
      error: errorMessage(error),
    });
    return null;
  }
}

async function runAgentWebsiteSearch({ agentSearch, runId, taskId, location }) {
  if (typeof agentSearch !== "function") {
    return {
      outcome: "agent_search_unavailable",
      official_website: null,
      validation: null,
      query: agentWebsiteQuery(location),
      candidates_reviewed: 0,
      error: null,
    };
  }
  const query = agentWebsiteQuery(location);
  try {
    const response = await agentSearch({
      runId,
      taskId,
      entityId: location.id,
      query,
      location: contactLocationEvidence(location),
    });
    const candidates = normalizeAgentCandidates(response);
    for (const candidate of candidates) {
      const validation = validateOfficialWebsiteCandidate({
        location: {
          id: location.id,
          name: location.name,
          address: location.address,
          locality: location.locality,
          region: location.region,
          postal_code: location.postalCode,
          country_code: location.countryCode,
        },
        candidate,
      });
      if (validation.official) {
        return {
          outcome: "official_website_found",
          official_website: validation.website,
          validation,
          query,
          candidates_reviewed: candidates.indexOf(candidate) + 1,
          selected: summarizeAgentCandidate(candidate),
          error: null,
        };
      }
    }
    return {
      outcome: candidates.length ? "no_official_match" : "no_results",
      official_website: null,
      validation: null,
      query,
      candidates_reviewed: candidates.length,
      error: null,
    };
  } catch (error) {
    return {
      outcome: "agent_search_error",
      official_website: null,
      validation: null,
      query,
      candidates_reviewed: 0,
      error: errorMessage(error),
    };
  }
}

function normalizeAgentCandidates(response) {
  const values = Array.isArray(response)
    ? response
    : Array.isArray(response?.results)
      ? response.results
      : Array.isArray(response?.items)
        ? response.items
        : response && typeof response === "object"
          ? [response]
          : [];
  return values.map((candidate) => ({
    url: text(candidate?.url ?? candidate?.link ?? candidate?.officialWebsite),
    title: text(candidate?.title ?? candidate?.name),
    description: [
      text(candidate?.snippet ?? candidate?.description),
      text(candidate?.evidence),
      text(candidate?.formattedAddress ?? candidate?.address),
    ].filter(Boolean).join(" "),
    address: text(candidate?.formattedAddress ?? candidate?.address),
  })).filter((candidate) => candidate.url);
}

function summarizeAgentCandidate(candidate) {
  return {
    url: candidate.url,
    title: truncate(candidate.title, 300),
    description: truncate(candidate.description, 500),
    address: truncate(candidate.address, 300),
  };
}

function validatedPlacesWebsite(location, details) {
  if (!details?.websiteUri) return null;
  const validation = validateOfficialWebsiteCandidate({
    location: {
      id: location.id,
      name: location.name,
      address: location.address,
      locality: location.locality,
      region: location.region,
      postal_code: location.postalCode,
      country_code: location.countryCode,
    },
    candidate: {
      url: details.websiteUri,
      title: details.displayName?.text ?? details.displayName,
      address: details.formattedAddress,
      description: details.formattedAddress,
    },
  });
  return validation.official ? validation.website : null;
}

function validatePlacesIdentity(location, details) {
  const expectedName = normalizeIdentityText(location.name);
  const actualName = normalizeIdentityText(details?.displayName?.text ?? details?.displayName);
  const expectedTokens = meaningfulNameTokens(expectedName);
  const actualTokens = new Set(meaningfulNameTokens(actualName));
  const nameMatch = expectedName && actualName && (
    expectedName.includes(actualName)
    || actualName.includes(expectedName)
    || expectedTokens.some((token) => actualTokens.has(token))
  );
  const address = normalizeIdentityText(details?.formattedAddress);
  const locality = normalizeIdentityText(location.locality);
  const postalCode = normalizeIdentityText(location.postalCode);
  const locationMatch = Boolean(
    (locality && (` ${address} `).includes(` ${locality} `))
    || (postalCode && (` ${address} `).includes(` ${postalCode} `))
    || addressTokenMatch(location.address, address)
  );
  return Boolean(nameMatch && locationMatch);
}

function meaningfulNameTokens(value) {
  const stop = new Set([
    "and", "care", "center", "centre", "clinic", "clinics", "health",
    "hospital", "medical", "of", "the", "wellness",
  ]);
  return [...new Set(String(value || "").split(" ")
    .filter((token) => token.length >= 3 && !stop.has(token)))];
}

function addressTokenMatch(expectedAddress, actualAddress) {
  const tokens = normalizeIdentityText(expectedAddress).split(" ")
    .filter((token) => token.length >= 3 || /^\d+$/u.test(token));
  if (tokens.length < 2) return false;
  const actual = new Set(String(actualAddress || "").split(" "));
  return tokens.filter((token) => actual.has(token)).length >= 2;
}

function normalizeIdentityText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

export async function crawlContactPages(website, webClient, {
  pageLimit = CONTACT_FILL_PAGE_LIMIT,
} = {}) {
  const normalizedLimit = positiveInteger(pageLimit, "pageLimit");
  const pages = [];
  const attempted = new Set();
  const homepage = await safeCachedFetch(website, webClient);
  pages.push(homepage);
  attempted.add(homepage.requested_url || String(website));
  const urls = contactPageUrls(homepage, normalizedLimit - 1);
  for (const url of urls) {
    if (attempted.has(url)) continue;
    attempted.add(url);
    pages.push(await safeCachedFetch(url, webClient));
    if (pages.length >= normalizedLimit) break;
  }
  return {
    website,
    pages,
    attempted_urls: [...attempted],
    successful_pages: pages.filter((page) => page.ok).length,
  };
}

async function safeCachedFetch(url, webClient) {
  try {
    const page = await webClient.fetchHomepage(url);
    return {
      ok: Boolean(page.ok),
      outcome: page.outcome || (page.ok ? "ok" : "fetch_failed"),
      requested_url: page.requestedUrl || url,
      final_url: page.finalUrl || null,
      title: truncate(page.title, 500),
      description: truncate(page.description, 1_000),
      text_excerpt: truncate(page.textExcerpt, 5_000),
      cached: Boolean(page.cached),
      deduplicated: Boolean(page.deduplicated),
      links: normalizePageLinks(page.links, page.finalUrl || page.requestedUrl || url),
      error: page.error || null,
    };
  } catch (error) {
    return {
      ok: false,
      outcome: "network_error",
      requested_url: String(url),
      final_url: null,
      title: "",
      description: "",
      text_excerpt: "",
      cached: false,
      deduplicated: false,
      links: [],
      error: errorMessage(error),
    };
  }
}

function contactPageUrls(homepage, limit) {
  if (limit <= 0) return [];
  const base = parseWebUrl(homepage.final_url || homepage.requested_url);
  if (!base) return [];
  const sameOriginLinks = homepage.links.filter((link) => sameOrigin(base, link.url));
  const categories = [
    { pattern: /(?:contact|kontakt)/iu, fallback: CONTACT_PATHS[0] },
    { pattern: /about/iu, fallback: CONTACT_PATHS[1] },
    { pattern: /impressum/iu, fallback: CONTACT_PATHS[2] },
  ];
  return categories.map(({ pattern, fallback }) => (
    sameOriginLinks.find((link) => pattern.test(`${link.text} ${link.url}`))?.url
      || new URL(fallback, base).href
  )).slice(0, limit);
}

function normalizePageLinks(value, baseUrl) {
  if (!Array.isArray(value)) return [];
  return value.map((link) => {
    const rawUrl = typeof link === "string" ? link : link?.url ?? link?.href;
    try {
      return {
        url: new URL(String(rawUrl || ""), baseUrl).href,
        text: text(typeof link === "string" ? "" : link?.text ?? link?.label),
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function extractContactFields(pages, { countryCode = "" } = {}) {
  const successful = Array.isArray(pages) ? pages.filter((page) => page?.ok) : [];
  const combined = successful.map((page) => [
    page.title,
    page.description,
    page.text_excerpt,
  ].filter(Boolean).join(" ")).join("\n");
  return {
    email: extractEmail(combined),
    phone: extractPhone(combined, countryCode),
    address: extractAddress(combined),
  };
}

export async function guardedFillField(
  {
    field,
    value,
    source,
    taskId,
    runId,
    locationId,
    actorLabel,
  },
  {
    recordWrite = defaultRecordWrite,
    setActor = setMutationActor,
  } = {},
) {
  const normalizedField = normalizeContactField(field);
  const normalizedValue = normalizeFieldValue(normalizedField, value);
  const normalizedLocationId = positiveInteger(locationId, "locationId");
  const normalizedRunId = positiveIntegerString(runId, "runId");
  const normalizedTaskId = positiveIntegerString(taskId, "taskId");
  const normalizedSource = nonemptyString(source, "source");
  const normalizedActor = nonemptyString(actorLabel, "actorLabel");
  if (!normalizedValue) return emptyWrite(normalizedField, "invalid_candidate");
  if (normalizedField === "email" && normalizedSource !== "website_crawl") {
    return emptyWrite(normalizedField, "email_source_not_allowed");
  }

  try {
    const result = await recordWrite({
      entity: { entity_type: "location", entity_id: normalizedLocationId },
      field: normalizedField,
      verification: "agent_verified",
      actor: normalizedActor,
      mutate: async (tx) => {
        const stateResult = await tx.query(RECHECK_LOCATION_SQL, [normalizedLocationId]);
        const state = rowsFrom(stateResult)[0];
        if (!state) throw new ContactWriteRefusal("location_missing");
        if (state.status !== "active" || state.deleted_at) {
          throw new ContactWriteRefusal("location_not_active");
        }
        if (state.non_suppressed !== true) {
          throw new ContactWriteRefusal("location_suppressed");
        }
        if (text(state[normalizedField])) {
          throw new ContactWriteRefusal("field_already_present");
        }
        await setActor(tx, {
          actorId: CONTACT_FILL_ACTOR_ID,
          actorLabel: normalizedActor,
        });
        const timestampResult = await tx.query("SELECT transaction_timestamp() AS write_started_at");
        const writeStartedAt = rowsFrom(timestampResult)[0]?.write_started_at;
        if (!writeStartedAt) throw new Error("Contact write timestamp is unavailable.");
        const column = FIELD_COLUMNS[normalizedField];
        const update = await tx.query(`
          UPDATE fountain.locations
          SET ${column} = $2, updated_at = now()
          WHERE id = $1
            AND status = 'active'
            AND deleted_at IS NULL
            AND NULLIF(btrim(COALESCE(${column}, '')), '') IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM fountain.source_records source_record
              JOIN fountain.sources source ON source.id = source_record.source_id
              JOIN fountain_raw.suppressed_source_listings suppressed
                ON suppressed.source_slug = source.slug
               AND suppressed.source_listing_id = source_record.source_listing_id
              WHERE source_record.entity_type = 'location'
                AND source_record.entity_id = fountain.locations.id
            )
        `, [normalizedLocationId, normalizedValue]);
        assertCount(`${normalizedField} location update`, update, 1);
        const event = await tx.query(`
          UPDATE fountain.entity_change_events event
          SET reason = 'contact_fill:${normalizedField}',
              metadata = event.metadata || jsonb_build_object(
                'run_id', $1::bigint,
                'task_id', $2::bigint,
                'campaign', 'contact_fill',
                'field', $3::text,
                'source', $4::text,
                'verification', 'agent_verified'
              )
          WHERE event.entity_type = 'locations'
            AND event.entity_id = $5::integer
            AND event.action = 'update'
            AND event.actor_id = $6::uuid
            AND event.created_at >= $7::timestamptz
            AND NULLIF(btrim(COALESCE(event.before_data->>$3::text, '')), '') IS NULL
            AND event.after_data->>$3::text = $8::text
            AND NOT (event.metadata ? 'run_id')
        `, [
          normalizedRunId,
          normalizedTaskId,
          normalizedField,
          normalizedSource,
          normalizedLocationId,
          CONTACT_FILL_ACTOR_ID,
          writeStartedAt,
          normalizedValue,
        ]);
        assertCount(`${normalizedField} provenance event`, event, 1);
        return {
          field: normalizedField,
          value: normalizedValue,
          source: normalizedSource,
          eventStamped: true,
          writtenAt: new Date(writeStartedAt).toISOString(),
        };
      },
    });
    if (!result?.written) {
      return {
        field: normalizedField,
        attempted: true,
        written: false,
        value: normalizedValue,
        source: normalizedSource,
        reason: result?.reason || "field_ledger_refused",
      };
    }
    return {
      field: normalizedField,
      attempted: true,
      written: true,
      value: normalizedValue,
      source: normalizedSource,
      reason: null,
      event_stamped: Boolean(result.result?.eventStamped),
      written_at: result.result?.writtenAt || null,
    };
  } catch (error) {
    if (error instanceof ContactWriteRefusal) {
      return {
        field: normalizedField,
        attempted: true,
        written: false,
        value: normalizedValue,
        source: normalizedSource,
        reason: error.reason,
      };
    }
    throw error;
  }
}

class ContactWriteRefusal extends Error {
  constructor(reason) {
    super(`Contact field write refused: ${reason}`);
    this.name = "ContactWriteRefusal";
    this.reason = reason;
  }
}

function extractEmail(value) {
  const matches = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) || [];
  return matches
    .map((email) => email.replace(/[),.;:]+$/u, "").toLowerCase())
    .find((email) => !/^(?:example|name|email)@/iu.test(email)) || null;
}

function extractPhone(value, countryCode) {
  const candidates = String(value || "").match(/(?:\+\d[\d\s().-]{6,}\d|\b(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{3,4}\b)/gu) || [];
  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate, countryCode);
    if (normalized) return normalized;
  }
  return null;
}

export function normalizePhone(value, countryCode = "") {
  const raw = text(value);
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith("+");
  let digits = raw.replace(/\D/gu, "");
  if (!digits) return null;
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    return validE164Digits(digits) ? `+${digits}` : null;
  }
  if (hasPlus) return validE164Digits(digits) ? `+${digits}` : null;
  const country = text(countryCode).toUpperCase();
  const dialing = COUNTRY_DIALING_CODES[country];
  if (!dialing) return null;
  if (["US", "CA"].includes(country)) {
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length !== 10) return null;
  } else if (country !== "IT") {
    digits = digits.replace(/^0+/u, "");
  }
  const combined = `${dialing}${digits}`;
  return validE164Digits(combined) ? `+${combined}` : null;
}

const COUNTRY_DIALING_CODES = Object.freeze({
  AE: "971",
  AU: "61",
  BE: "32",
  CA: "1",
  CH: "41",
  DE: "49",
  DK: "45",
  ES: "34",
  FI: "358",
  FR: "33",
  GB: "44",
  IE: "353",
  IN: "91",
  IT: "39",
  JP: "81",
  MX: "52",
  NL: "31",
  NO: "47",
  NZ: "64",
  PT: "351",
  SE: "46",
  SG: "65",
  TR: "90",
  US: "1",
  ZA: "27",
});

function validE164Digits(value) {
  return /^[1-9]\d{7,14}$/u.test(value);
}

function extractAddress(value) {
  const normalized = String(value || "").replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  const patterns = [
    /\b\d{1,6}\s+[A-Z0-9][A-Z0-9 .'-]{2,80}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Highway|Hwy|Court|Ct|Place|Pl)\b(?:[^|;]{0,100})/iu,
    /\b[A-Z][A-Z .'-]{2,80}\s+(?:Straße|Strasse|Str\.?|Weg|Platz|Rue|Avenida|Via)\s*\d{1,6}\b(?:[^|;]{0,100})/iu,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern)?.[0];
    if (match) {
      const bounded = match.split(
        /\b(?:Phone|Telephone|Tel|Email|E-mail|Contact|Hours|Directions)\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
        1,
      )[0];
      return normalizeAddress(bounded);
    }
  }
  return null;
}

function normalizeAddress(value) {
  const address = text(value).replace(/\s+/gu, " ").replace(/^[,;\s]+|[,;\s]+$/gu, "");
  return address.length >= 8 && address.length <= 500 ? address : null;
}

function normalizeContactField(field) {
  const normalized = text(field);
  if (!CONTACT_FIELDS.includes(normalized)) throw new Error(`Unsupported contact field: ${normalized || "missing"}.`);
  return normalized;
}

function normalizeFieldValue(field, value) {
  if (field === "email") return extractEmail(value);
  if (field === "phone") return text(value).startsWith("+") && validE164Digits(text(value).slice(1))
    ? text(value)
    : null;
  if (field === "address") return normalizeAddress(value);
  if (field === "website") {
    try {
      const url = new URL(text(value));
      return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.href : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeLocation(row) {
  return {
    id: positiveInteger(row.id, "location.id"),
    name: text(row.name || row.organization_name),
    address: text(row.address),
    locality: text(row.locality),
    region: text(row.region),
    postalCode: text(row.postal_code),
    countryCode: text(row.country_code).toUpperCase(),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    website: text(row.website),
    email: text(row.email),
    phone: text(row.phone),
    status: text(row.status),
    deletedAt: row.deleted_at ?? null,
    suppressionCount: number(row.suppression_count),
    externalPlaceMatches: objectArray(row.external_place_matches),
  };
}

function isActiveAndUnsuppressed(location) {
  return location.status === "active" && !location.deletedAt && location.suppressionCount === 0;
}

function contactSnapshot(location) {
  return {
    website: location.website || null,
    email: location.email || null,
    phone: location.phone || null,
    address: location.address || null,
  };
}

function skippedResult({ taskId, runId, locationId, reason, initial = null }) {
  return {
    schema_version: CONTACT_FILL_SCHEMA_VERSION,
    outcome: "skipped",
    task_id: taskId,
    run_id: runId,
    location_id: locationId,
    skip_reason: reason,
    initial: initial ? contactSnapshot(initial) : null,
    fields: Object.fromEntries(CONTACT_FIELDS.map((field) => [field, emptyWrite(field)])),
    serving_write: { attempted: false, attempted_fields: [], written: false, written_fields: [] },
    email_source_policy: "website_only",
  };
}

function emptyWrite(field, reason = "not_attempted") {
  return {
    field,
    attempted: false,
    written: false,
    value: null,
    source: null,
    reason,
  };
}

function websiteSource(evidence, placesDetails) {
  if (evidence.agent_search?.official_website) return "agent_web_search";
  if (placesDetails?.websiteUri) return "google_places_contact_details";
  return "website_discovery";
}

function placesTextQuery(location) {
  return [
    location.name,
    location.address,
    location.locality,
    location.region,
    location.postalCode,
    location.countryCode,
  ].filter(Boolean).join(", ");
}

function agentWebsiteQuery(location) {
  return `"${location.name}" ${[
    location.address,
    location.locality,
    location.region,
    location.countryCode,
  ].filter(Boolean).join(", ")} official website contact`;
}

function contactLocationEvidence(location) {
  return {
    id: location.id,
    name: location.name,
    address: location.address,
    locality: location.locality,
    region: location.region,
    postal_code: location.postalCode,
    country_code: location.countryCode,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

function normalizeBudgetLimit(configured, runBudget) {
  const contactLimit = nonnegativeNumber(configured, "contactBudgetUsd");
  if (runBudget == null || runBudget === "") return contactLimit;
  return Math.min(contactLimit, nonnegativeNumber(runBudget, "run.budget_usd"));
}

function parseWebUrl(value) {
  try {
    return new URL(text(value));
  } catch {
    return null;
  }
}

function sameOrigin(base, candidate) {
  try {
    return new URL(candidate).origin === base.origin;
  } catch {
    return false;
  }
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function objectArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item))
    : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonemptyString(value, label) {
  const normalized = text(value);
  if (!normalized) throw new TypeError(`${label} must be non-empty.`);
  return normalized;
}

function positiveInteger(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) throw new TypeError(`${label} must be positive.`);
  return normalized;
}

function positiveIntegerString(value, label) {
  const normalized = String(value ?? "");
  if (!/^[1-9]\d*$/u.test(normalized)) throw new TypeError(`${label} must be a positive integer.`);
  return normalized;
}

function nonnegativeNumber(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) throw new TypeError(`${label} must be non-negative.`);
  return normalized;
}

function nullableNumber(value) {
  if (value == null || value === "") return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function number(value) {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function truncate(value, length) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .trim()
    .slice(0, length);
}

function assertCount(label, result, expected) {
  const actual = number(result?.rowCount ?? rowsFrom(result).length);
  if (actual !== expected) throw new Error(`${label} did not reconcile: ${actual}/${expected}.`);
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or pg-compatible object.");
}

function rowsFrom(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

function errorMessage(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 1_000);
}
