import { query as defaultQuery, setMutationActor } from "../lib/db.mjs";
import { recordWrite as defaultRecordWrite } from "../lib/ledger.mjs";
import { createPlacesClient } from "../lib/places.mjs";
import { selectGooglePlaceMatch } from "../lib/website-discovery.mjs";

export const GEOCODE_SCHEMA_VERSION = 1;
export const GEOCODE_ACTOR_ID = "b5c71897-83d0-4c30-a7a3-202607120010";
export const GEOCODE_MAX_CANDIDATES = 3;

const COORDINATE_FIELDS = Object.freeze(["latitude", "longitude"]);
const GENERIC_NAME_WORDS = new Set([
  "and", "care", "center", "centre", "clinic", "clinics", "health",
  "hospital", "medical", "of", "spa", "the", "therapy", "wellness",
]);
const ADDRESS_WORDS_TO_IGNORE = new Set([
  "avenue", "ave", "boulevard", "blvd", "building", "bldg", "drive", "dr",
  "floor", "fl", "highway", "hwy", "lane", "ln", "place", "pl", "road",
  "rd", "route", "rte", "street", "st", "suite", "ste", "unit", "way",
]);
const COUNTRY_ALIASES = new Map(Object.entries({
  AE: ["united arab emirates", "uae"],
  AR: ["argentina"],
  AT: ["austria"],
  AU: ["australia"],
  BE: ["belgium"],
  BR: ["brazil", "brasil"],
  CA: ["canada"],
  CH: ["switzerland", "schweiz", "suisse", "svizzera"],
  CL: ["chile"],
  CO: ["colombia"],
  CR: ["costa rica"],
  CZ: ["czechia", "czech republic"],
  DE: ["germany", "deutschland"],
  DK: ["denmark"],
  ES: ["spain", "espana"],
  FI: ["finland"],
  FR: ["france"],
  GB: ["united kingdom", "uk", "england", "scotland", "wales", "northern ireland"],
  GR: ["greece"],
  ID: ["indonesia"],
  IE: ["ireland"],
  IL: ["israel"],
  IN: ["india"],
  IS: ["iceland"],
  IT: ["italy", "italia"],
  JP: ["japan"],
  KR: ["south korea", "republic of korea"],
  MX: ["mexico"],
  MY: ["malaysia"],
  NL: ["netherlands"],
  NO: ["norway"],
  NZ: ["new zealand"],
  PA: ["panama"],
  PE: ["peru"],
  PH: ["philippines"],
  PL: ["poland"],
  PT: ["portugal"],
  QA: ["qatar"],
  SA: ["saudi arabia"],
  SE: ["sweden"],
  SG: ["singapore"],
  TH: ["thailand"],
  TR: ["turkiye", "turkey"],
  US: ["united states", "united states of america", "usa"],
  ZA: ["south africa"],
}));

export const GEOCODE_LOAD_SQL = `
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
    location.status,
    location.deleted_at,
    COALESCE(location.is_virtual, false) AS is_virtual,
    organization.canonical_name AS organization_name,
    COALESCE(place_data.external_place_matches, '[]'::jsonb) AS external_place_matches,
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
  WHERE location.id = $1
`;

const GEOCODE_RECHECK_SQL = `
  SELECT
    location.status,
    location.deleted_at,
    COALESCE(location.is_virtual, false) AS is_virtual,
    location.latitude,
    location.longitude,
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

export function createGeocodeHandler(dependencies = {}) {
  return (input) => handleGeocode(input, dependencies);
}

/**
 * Queue-handler-compatible geocoding for active physical locations. Google
 * Places calls remain behind the standing PLACES_LIVE and external-call-ledger
 * client. Because geocode.details has intentionally deferred pricing, callers
 * must inject detailsCostUsd or put places_details_cost_usd in the task payload.
 */
export async function handleGeocode(
  { task, run },
  {
    query = defaultQuery,
    placesClient = createPlacesClient(),
    recordWrite = defaultRecordWrite,
    setActor = setMutationActor,
    detailsCostUsd,
    maxCandidates = GEOCODE_MAX_CANDIDATES,
  } = {},
) {
  const taskId = positiveIntegerString(task?.id, "task.id");
  const runId = positiveIntegerString(run?.id, "run.id");
  const locationId = positiveInteger(task?.entity_id, "task.entity_id");
  if (task?.entity_type && task.entity_type !== "location") {
    throw new Error("geocode supports only location tasks.");
  }
  const candidateLimit = boundedPositiveInteger(maxCandidates, "maxCandidates", 5);
  const initialResult = await executeQuery(query, GEOCODE_LOAD_SQL, [locationId]);
  const initialRow = rowsFrom(initialResult)[0];
  if (!initialRow) {
    return skippedResult({ taskId, runId, locationId, reason: "location_missing" });
  }
  const initial = normalizeLocation(initialRow);
  const initialRefusal = initialLocationRefusal(initial);
  if (initialRefusal) {
    return skippedResult({ taskId, runId, locationId, reason: initialRefusal, initial });
  }
  if (!hasIdentityEvidence(initial)) {
    return reviewResult({
      taskId,
      runId,
      locationId,
      initial,
      reason: "insufficient_address_identity_evidence",
    });
  }

  const approvedDetailsCost = approvedCost(
    detailsCostUsd ?? task?.payload?.places_details_cost_usd,
  );
  if (approvedDetailsCost === null) {
    return reviewResult({
      taskId,
      runId,
      locationId,
      initial,
      reason: "places_details_price_not_approved",
      query: buildGeocodeQuery(initial),
    });
  }

  const evidence = {
    provider: "google_places",
    query: buildGeocodeQuery(initial),
    details_unit_cost_usd: approvedDetailsCost,
    candidate_limit: candidateLimit,
    calls: [],
  };
  const storedMatch = selectGooglePlaceMatch(initial.externalPlaceMatches);
  if (storedMatch) {
    const stored = await safeDetailsCall({
      placesClient,
      runId,
      location: initial,
      placeId: storedMatch.providerPlaceId,
      detailsCostUsd: approvedDetailsCost,
      phase: "stored_provider_match",
      evidence,
    });
    if (stored.error === null) {
      const validation = validateGeocodeCandidate(initial, stored.data);
      const candidate = candidateEvidence({
        placeId: storedMatch.providerPlaceId,
        source: "stored_provider_match",
        response: stored.response,
        validation,
      });
      evidence.calls.at(-1).validation = validationSummary(validation);
      if (validation.valid) {
        return applySelectedCandidate({
          taskId,
          runId,
          initial,
          selected: candidate,
          evidence,
        }, { recordWrite, setActor });
      }
    }
  }

  const search = await placesClient.searchText({
    runId,
    taskType: "geocode",
    entityId: initial.id,
    textQuery: evidence.query,
    ...(initial.countryCode ? { regionCode: initial.countryCode } : {}),
    maxResultCount: candidateLimit,
    maxAttempts: 4,
  });
  const placeIds = uniquePlaceIds(search?.data?.places).slice(0, candidateLimit);
  evidence.calls.push({
    phase: "places_search",
    operation: "search_text",
    outcome: placeIds.length ? "place_ids_found" : "no_results",
    provider_place_ids: placeIds,
    external_call_id: search?.externalCallId ?? null,
    field_mask: search?.fieldMask || null,
    cost_estimate_usd: finiteNumberOrNull(search?.costEstimateUsd),
  });
  if (placeIds.length === 0) {
    return reviewResult({
      taskId,
      runId,
      locationId,
      initial,
      reason: "no_provider_candidates",
      query: evidence.query,
      evidence,
    });
  }

  const candidates = [];
  const detailErrors = [];
  for (const placeId of placeIds) {
    const details = await safeDetailsCall({
      placesClient,
      runId,
      location: initial,
      placeId,
      detailsCostUsd: approvedDetailsCost,
      phase: "search_candidate_details",
      evidence,
    });
    if (details.error) {
      detailErrors.push(details.error);
      continue;
    }
    const validation = validateGeocodeCandidate(initial, details.data);
    evidence.calls.at(-1).validation = validationSummary(validation);
    candidates.push(candidateEvidence({
      placeId,
      source: "search_candidate_details",
      response: details.response,
      validation,
    }));
  }
  if (detailErrors.length === placeIds.length) {
    throw detailErrors[0];
  }
  if (detailErrors.length > 0) {
    return reviewResult({
      taskId,
      runId,
      locationId,
      initial,
      reason: "candidate_details_incomplete",
      query: evidence.query,
      evidence,
      candidates,
    });
  }

  const validCandidates = candidates.filter((candidate) => candidate.validation.valid);
  if (validCandidates.length === 0) {
    return reviewResult({
      taskId,
      runId,
      locationId,
      initial,
      reason: "no_identity_valid_candidate",
      query: evidence.query,
      evidence,
      candidates,
    });
  }
  const distinctCandidates = distinctPhysicalCandidates(validCandidates);
  if (distinctCandidates.length > 1) {
    return reviewResult({
      taskId,
      runId,
      locationId,
      initial,
      reason: "ambiguous_identity_valid_candidates",
      query: evidence.query,
      evidence,
      candidates,
    });
  }

  const selected = validCandidates[0];
  selected.equivalent_candidate_count = validCandidates.length;
  return applySelectedCandidate({
    taskId,
    runId,
    initial,
    selected,
    evidence,
    candidates,
  }, { recordWrite, setActor });
}

async function applySelectedCandidate(
  { taskId, runId, initial, selected, evidence, candidates = [selected] },
  { recordWrite, setActor },
) {
  const write = await guardedWriteCoordinates({
    locationId: initial.id,
    taskId,
    runId,
    candidate: selected,
  }, { recordWrite, setActor });
  if (!write.written) {
    return reviewResult({
      taskId,
      runId,
      locationId: initial.id,
      initial,
      reason: write.reason || "coordinate_write_refused",
      query: evidence.query,
      evidence,
      candidates,
      selected,
      write,
    });
  }
  return {
    ...baseResult({ taskId, runId, locationId: initial.id }),
    outcome: "geocoded",
    reason: null,
    initial: coordinateSnapshot(initial),
    final: {
      latitude: selected.latitude,
      longitude: selected.longitude,
    },
    query: evidence.query,
    evidence,
    candidates,
    selected,
    write,
    serving_write: {
      attempted: true,
      written: true,
      fields: [...COORDINATE_FIELDS],
      reason: null,
    },
  };
}

export async function guardedWriteCoordinates(
  { locationId, taskId, runId, candidate },
  {
    recordWrite = defaultRecordWrite,
    setActor = setMutationActor,
  } = {},
) {
  const normalizedLocationId = positiveInteger(locationId, "locationId");
  const normalizedTaskId = positiveIntegerString(taskId, "taskId");
  const normalizedRunId = positiveIntegerString(runId, "runId");
  const normalizedCandidate = normalizeWritableCandidate(candidate);
  const actorLabel = `geocode_run_${normalizedRunId}`;
  const entity = { entity_type: "location", entity_id: normalizedLocationId };

  try {
    const latitudeGuard = await recordWrite({
      entity,
      field: "latitude",
      verification: "agent_verified",
      actor: actorLabel,
      mutate: async (tx) => {
        const longitudeGuard = await recordWrite({
          entity,
          field: "longitude",
          verification: "agent_verified",
          actor: actorLabel,
          tx,
          mutate: async (coordinateTx) => {
            const stateResult = await coordinateTx.query(GEOCODE_RECHECK_SQL, [normalizedLocationId]);
            const state = rowsFrom(stateResult)[0];
            const refusal = recheckedLocationRefusal(state);
            if (refusal) throw new CoordinateWriteRefusal(refusal);

            await setActor(coordinateTx, {
              actorId: GEOCODE_ACTOR_ID,
              actorLabel,
            });
            const timestampResult = await coordinateTx.query(
              "SELECT transaction_timestamp() AS write_started_at",
            );
            const writeStartedAt = rowsFrom(timestampResult)[0]?.write_started_at;
            if (!writeStartedAt) throw new Error("Geocode write timestamp is unavailable.");

            const updated = await coordinateTx.query(`
              UPDATE fountain.locations
              SET latitude = $2,
                  longitude = $3,
                  updated_at = now()
              WHERE id = $1
                AND status = 'active'
                AND deleted_at IS NULL
                AND COALESCE(is_virtual, false) = false
                AND (
                  latitude IS NULL
                  OR longitude IS NULL
                  OR latitude NOT BETWEEN -90 AND 90
                  OR longitude NOT BETWEEN -180 AND 180
                  OR (latitude = 0 AND longitude = 0)
                )
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
            `, [
              normalizedLocationId,
              normalizedCandidate.latitude,
              normalizedCandidate.longitude,
            ]);
            if (affectedRows(updated) !== 1) {
              throw new CoordinateWriteRefusal("eligibility_changed_before_update");
            }

            const stamped = await coordinateTx.query(`
              UPDATE fountain.entity_change_events event
              SET reason = 'geocode:coordinates',
                  metadata = COALESCE(event.metadata, '{}'::jsonb) || jsonb_build_object(
                    'run_id', $1::bigint,
                    'task_id', $2::bigint,
                    'campaign', 'geocode',
                    'provider', 'google_places',
                    'provider_place_id', $3::text,
                    'external_call_id', $4::text,
                    'formatted_address', $5::text,
                    'address_identity_validated', true,
                    'fields', jsonb_build_array('latitude', 'longitude'),
                    'verification', 'agent_verified'
                  )
              WHERE event.entity_type = 'locations'
                AND event.entity_id = $6::integer
                AND event.action = 'update'
                AND event.actor_id = $7::uuid
                AND event.created_at >= $8::timestamptz
                AND (event.after_data->>'latitude')::double precision = $9::double precision
                AND (event.after_data->>'longitude')::double precision = $10::double precision
                AND NOT (COALESCE(event.metadata, '{}'::jsonb) ? 'run_id')
            `, [
              normalizedRunId,
              normalizedTaskId,
              normalizedCandidate.placeId,
              normalizedCandidate.externalCallId,
              normalizedCandidate.formattedAddress,
              normalizedLocationId,
              GEOCODE_ACTOR_ID,
              writeStartedAt,
              normalizedCandidate.latitude,
              normalizedCandidate.longitude,
            ]);
            assertCount("geocode provenance event", stamped, 1);
            return {
              eventStamped: true,
              writeStartedAt,
            };
          },
        });
        if (!longitudeGuard?.written) {
          throw new CoordinateWriteRefusal(
            `longitude_field_${longitudeGuard?.reason || "ledger_refused"}`,
          );
        }
        return longitudeGuard.result;
      },
    });
    if (!latitudeGuard?.written) {
      return writeRefusal(`latitude_field_${latitudeGuard?.reason || "ledger_refused"}`);
    }
    return {
      attempted: true,
      written: true,
      reason: null,
      fields: [...COORDINATE_FIELDS],
      latitude: normalizedCandidate.latitude,
      longitude: normalizedCandidate.longitude,
      event_stamped: Boolean(latitudeGuard.result?.eventStamped),
      written_at: toIso(latitudeGuard.result?.writeStartedAt),
    };
  } catch (error) {
    if (error instanceof CoordinateWriteRefusal) return writeRefusal(error.reason);
    throw error;
  }
}

export function validateGeocodeCandidate(locationInput, candidateInput) {
  const location = normalizeIdentityLocation(locationInput);
  const candidate = object(candidateInput);
  const latitude = numericCoordinate(candidate?.location?.latitude);
  const longitude = numericCoordinate(candidate?.location?.longitude);
  const coordinatesInRange = hasValidCoordinates({ latitude, longitude });
  const formattedAddress = text(candidate.formattedAddress);
  const displayName = text(candidate?.displayName?.text ?? candidate.displayName);
  const candidateAddress = normalizeText(formattedAddress);
  const expectedAddress = normalizeText(location.address);
  const expectedName = normalizeText(location.name);
  const actualName = normalizeText(displayName);
  const nameMatch = identityNameMatch(expectedName, actualName);
  const localityMatch = phraseMatch(candidateAddress, location.locality);
  const regionMatch = phraseMatch(candidateAddress, location.region);
  const postalMatch = postalCodeMatch(candidateAddress, location.postalCode);
  const street = streetAddressMatch(expectedAddress, candidateAddress);
  const countryMatch = countryAddressMatch(candidateAddress, location.countryCode);
  let addressIdentity = false;
  if (expectedAddress) {
    const hasLocalContext = Boolean(
      normalizeText(location.locality) || alphanumeric(location.postalCode),
    );
    const contextMatch = hasLocalContext
      ? localityMatch || postalMatch
      : normalizeText(location.region)
        ? regionMatch
        : countryMatch === true || street.strong;
    addressIdentity = street.match && contextMatch;
  } else if (normalizeText(location.locality)) {
    const secondaryContextMatch = alphanumeric(location.postalCode)
      ? postalMatch
      : normalizeText(location.region)
        ? regionMatch
        : countryMatch === true;
    addressIdentity = localityMatch && secondaryContextMatch;
  }
  if (countryMatch === false) addressIdentity = false;

  let reason = "identity_validated";
  if (!coordinatesInRange) reason = "coordinates_out_of_range";
  else if (!formattedAddress) reason = "formatted_address_missing";
  else if (!addressIdentity) reason = countryMatch === false
    ? "country_mismatch"
    : "address_identity_mismatch";

  return {
    valid: coordinatesInRange && Boolean(formattedAddress) && addressIdentity,
    reason,
    latitude,
    longitude,
    formatted_address: formattedAddress || null,
    display_name: displayName || null,
    checks: {
      coordinates_in_range: coordinatesInRange,
      formatted_address_present: Boolean(formattedAddress),
      address_identity: addressIdentity,
      name_match: nameMatch,
      street_match: street.match,
      street_number_match: street.number_match,
      locality_match: localityMatch,
      region_match: regionMatch,
      postal_code_match: postalMatch,
      country_match: countryMatch,
    },
  };
}

export function hasValidCoordinates(value) {
  const latitude = numericCoordinate(value?.latitude);
  const longitude = numericCoordinate(value?.longitude);
  return latitude !== null
    && longitude !== null
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

export function buildGeocodeQuery(locationInput) {
  const location = normalizeIdentityLocation(locationInput);
  return [
    location.name,
    location.address,
    location.locality,
    location.region,
    location.postalCode,
    location.countryCode,
  ].filter(Boolean).join(", ");
}

async function safeDetailsCall({
  placesClient,
  runId,
  location,
  placeId,
  detailsCostUsd,
  phase,
  evidence,
}) {
  try {
    const response = await placesClient.getDetails({
      runId,
      taskType: "geocode",
      entityId: location.id,
      placeId,
      ...(location.countryCode ? { regionCode: location.countryCode } : {}),
      costEstimateUsd: detailsCostUsd,
      maxAttempts: 4,
    });
    evidence.calls.push({
      phase,
      operation: "details",
      outcome: "ok",
      provider_place_id: placeId,
      external_call_id: response?.externalCallId ?? null,
      field_mask: response?.fieldMask || null,
      cost_estimate_usd: finiteNumberOrNull(response?.costEstimateUsd) ?? detailsCostUsd,
      validation: null,
    });
    return { response, data: object(response?.data), error: null };
  } catch (error) {
    evidence.calls.push({
      phase,
      operation: "details",
      outcome: "error",
      provider_place_id: placeId,
      error: errorMessage(error),
    });
    return { response: null, data: null, error };
  }
}

function candidateEvidence({ placeId, source, response, validation }) {
  return {
    provider: "google_places",
    provider_place_id: placeId,
    source,
    external_call_id: response?.externalCallId ?? null,
    latitude: validation.latitude,
    longitude: validation.longitude,
    formatted_address: validation.formatted_address,
    display_name: validation.display_name,
    validation,
  };
}

function validationSummary(validation) {
  return {
    valid: validation.valid,
    reason: validation.reason,
    checks: validation.checks,
  };
}

function uniquePlaceIds(places) {
  const seen = new Set();
  const ids = [];
  for (const place of Array.isArray(places) ? places : []) {
    const id = text(place?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function distinctPhysicalCandidates(candidates) {
  const groups = [];
  for (const candidate of candidates) {
    const equivalent = groups.find((existing) => samePhysicalCandidate(existing, candidate));
    if (!equivalent) groups.push(candidate);
  }
  return groups;
}

function samePhysicalCandidate(left, right) {
  const distance = haversineMeters(
    left.latitude,
    left.longitude,
    right.latitude,
    right.longitude,
  );
  if (distance > 25) return false;
  const leftAddress = normalizeText(left.formatted_address);
  const rightAddress = normalizeText(right.formatted_address);
  return leftAddress === rightAddress
    || leftAddress.includes(rightAddress)
    || rightAddress.includes(leftAddress);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const phi1 = radians(lat1);
  const phi2 = radians(lat2);
  const deltaPhi = radians(lat2 - lat1);
  const deltaLambda = radians(lon2 - lon1);
  const a = Math.sin(deltaPhi / 2) ** 2
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function streetAddressMatch(expected, actual) {
  if (!expected || !actual) {
    return { match: false, strong: false, number_expected: false, number_match: false };
  }
  const expectedNumber = firstStreetNumber(expected);
  const actualNumbers = new Set(actual.match(/\b\d+[a-z]?\b/gu) || []);
  const numberMatch = expectedNumber ? actualNumbers.has(expectedNumber) : false;
  const expectedTokens = meaningfulAddressTokens(expected);
  const actualTokens = new Set(actual.split(" "));
  const matchedTokens = expectedTokens.filter((token) => actualTokens.has(token));
  const tokenThreshold = Math.min(2, expectedTokens.length);
  const tokenMatch = tokenThreshold > 0 && matchedTokens.length >= tokenThreshold;
  return {
    match: expectedNumber ? numberMatch && tokenMatch : tokenMatch,
    strong: Boolean(expectedNumber && numberMatch && matchedTokens.length >= 2),
    number_expected: Boolean(expectedNumber),
    number_match: numberMatch,
  };
}

function meaningfulAddressTokens(value) {
  return [...new Set(String(value || "").split(" ").filter((token) => (
    token.length >= 3
    && !/^\d+[a-z]?$/u.test(token)
    && !ADDRESS_WORDS_TO_IGNORE.has(token)
  )))];
}

function firstStreetNumber(value) {
  return String(value || "").match(/\b\d+[a-z]?\b/u)?.[0] || null;
}

function identityNameMatch(expected, actual) {
  if (!expected || !actual) return false;
  if (expected === actual || expected.includes(actual) || actual.includes(expected)) return true;
  const expectedTokens = meaningfulNameTokens(expected);
  const actualTokens = new Set(meaningfulNameTokens(actual));
  if (expectedTokens.length === 0) return false;
  const matches = expectedTokens.filter((token) => actualTokens.has(token)).length;
  return matches >= Math.min(2, expectedTokens.length);
}

function meaningfulNameTokens(value) {
  return [...new Set(String(value || "").split(" ").filter((token) => (
    token.length >= 3 && !GENERIC_NAME_WORDS.has(token)
  )))];
}

function phraseMatch(haystack, needle) {
  const normalizedNeedle = normalizeText(needle);
  return Boolean(
    haystack
    && normalizedNeedle
    && (` ${haystack} `).includes(` ${normalizedNeedle} `),
  );
}

function postalCodeMatch(address, postalCode) {
  const expected = alphanumeric(postalCode);
  if (!expected || !address) return false;
  return alphanumeric(address).includes(expected);
}

function countryAddressMatch(address, countryCode) {
  const expectedCode = text(countryCode).toUpperCase();
  if (!expectedCode || !address) return null;
  const expectedAliases = COUNTRY_ALIASES.get(expectedCode);
  if (!expectedAliases) return null;
  const matches = [];
  for (const [code, aliases] of COUNTRY_ALIASES) {
    for (const alias of aliases) {
      if (phraseMatch(address, alias)) matches.push({ code, alias });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((left, right) => right.alias.length - left.alias.length);
  return matches[0].code === expectedCode;
}

function hasIdentityEvidence(location) {
  if (normalizeText(location.address)) return true;
  return Boolean(normalizeText(location.name) && normalizeText(location.locality));
}

function initialLocationRefusal(location) {
  if (location.status !== "active" || location.deletedAt) return "location_not_active";
  if (location.isVirtual) return "virtual_location";
  if (!location.nonSuppressed) return "location_suppressed";
  if (hasValidCoordinates(location)) return "coordinates_already_valid";
  return null;
}

function recheckedLocationRefusal(row) {
  if (!row) return "location_missing";
  if (row.status !== "active" || row.deleted_at) return "location_not_active";
  if (row.is_virtual === true) return "virtual_location";
  if (row.non_suppressed !== true) return "location_suppressed";
  if (hasValidCoordinates(row)) return "coordinates_already_valid";
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
    latitude: numericCoordinate(row.latitude),
    longitude: numericCoordinate(row.longitude),
    status: text(row.status),
    deletedAt: row.deleted_at ?? null,
    isVirtual: row.is_virtual === true,
    nonSuppressed: row.non_suppressed === true,
    externalPlaceMatches: objectArray(row.external_place_matches),
  };
}

function normalizeIdentityLocation(value) {
  const location = object(value);
  return {
    name: text(location.name ?? location.organization_name ?? location.organizationName),
    address: text(location.address),
    locality: text(location.locality),
    region: text(location.region),
    postalCode: text(location.postalCode ?? location.postal_code),
    countryCode: text(location.countryCode ?? location.country_code).toUpperCase(),
  };
}

function normalizeWritableCandidate(candidateInput) {
  const candidate = object(candidateInput);
  const latitude = numericCoordinate(candidate.latitude);
  const longitude = numericCoordinate(candidate.longitude);
  if (!hasValidCoordinates({ latitude, longitude })) {
    throw new TypeError("candidate coordinates must be finite, in range, and not 0,0.");
  }
  if (candidate?.validation?.valid !== true || candidate?.validation?.checks?.address_identity !== true) {
    throw new TypeError("candidate must carry successful address-identity validation.");
  }
  return {
    latitude,
    longitude,
    placeId: nonemptyText(candidate.provider_place_id, "candidate.provider_place_id"),
    externalCallId: candidate.external_call_id == null
      ? null
      : text(candidate.external_call_id),
    formattedAddress: nonemptyText(candidate.formatted_address, "candidate.formatted_address"),
  };
}

function baseResult({ taskId, runId, locationId }) {
  return {
    schema_version: GEOCODE_SCHEMA_VERSION,
    task_id: taskId,
    run_id: runId,
    location_id: locationId,
  };
}

function skippedResult({ taskId, runId, locationId, reason, initial = null }) {
  return {
    ...baseResult({ taskId, runId, locationId }),
    outcome: "skipped",
    reason,
    initial: initial ? coordinateSnapshot(initial) : null,
    final: initial ? coordinateSnapshot(initial) : null,
    query: null,
    evidence: null,
    candidates: [],
    selected: null,
    write: writeNotAttempted(reason),
    serving_write: { attempted: false, written: false, fields: [], reason },
  };
}

function reviewResult({
  taskId,
  runId,
  locationId,
  initial,
  reason,
  query = null,
  evidence = null,
  candidates = [],
  selected = null,
  write = null,
}) {
  const normalizedWrite = write || writeNotAttempted(reason);
  return {
    ...baseResult({ taskId, runId, locationId }),
    outcome: "needs_human_review",
    reason,
    initial: initial ? coordinateSnapshot(initial) : null,
    final: initial ? coordinateSnapshot(initial) : null,
    query,
    evidence,
    candidates,
    selected,
    write: normalizedWrite,
    serving_write: {
      attempted: Boolean(normalizedWrite.attempted),
      written: false,
      fields: [],
      reason: normalizedWrite.reason || reason,
    },
  };
}

function coordinateSnapshot(value) {
  return {
    latitude: numericCoordinate(value?.latitude),
    longitude: numericCoordinate(value?.longitude),
  };
}

function writeNotAttempted(reason) {
  return {
    attempted: false,
    written: false,
    fields: [],
    reason,
  };
}

function writeRefusal(reason) {
  return {
    attempted: true,
    written: false,
    fields: [],
    reason,
  };
}

class CoordinateWriteRefusal extends Error {
  constructor(reason) {
    super(`Coordinate write refused: ${reason}`);
    this.name = "CoordinateWriteRefusal";
    this.reason = reason;
  }
}

function approvedCost(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError("detailsCostUsd must be a non-negative finite number.");
  }
  return number;
}

function numericCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function alphanumeric(value) {
  return normalizeText(value).replace(/[^a-z0-9]/gu, "");
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
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function nonemptyText(value, label) {
  const normalized = text(value);
  if (!normalized) throw new TypeError(`${label} must be non-empty.`);
  return normalized;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return number;
}

function boundedPositiveInteger(value, label, maximum) {
  const number = positiveInteger(value, label);
  if (number > maximum) throw new TypeError(`${label} must not exceed ${maximum}.`);
  return number;
}

function positiveIntegerString(value, label) {
  if (typeof value === "string" && /^[1-9]\d*$/u.test(value)) return value;
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  throw new TypeError(`${label} must be a positive integer.`);
}

async function executeQuery(query, sql, params) {
  if (typeof query === "function") return query(sql, params);
  if (query && typeof query.query === "function") return query.query(sql, params);
  throw new TypeError("query must be a function or expose query(sql, params).");
}

function rowsFrom(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function affectedRows(result) {
  if (Number.isInteger(result?.rowCount)) return result.rowCount;
  return rowsFrom(result).length;
}

function assertCount(label, result, expected) {
  const actual = affectedRows(result);
  if (actual !== expected) throw new Error(`${label} expected ${expected} row(s), got ${actual}.`);
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function errorMessage(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 1_000);
}
