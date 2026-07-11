import { createHash } from "node:crypto";
import process from "node:process";

import { getPlacesRequestConfig } from "../config/providers.mjs";
import {
  getGooglePlacesApiKey,
} from "../../scripts/lib/pipeline-env.mjs";

export const GOOGLE_PLACES_BASE_URL = "https://places.googleapis.com/v1";

export class PlacesError extends Error {
  constructor(message, { status = null, body = null, attempts = 1, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "PlacesError";
    this.status = status;
    this.body = body;
    this.attempts = attempts;
  }
}

/**
 * Construct a Places client without making a request. Every request rechecks
 * PLACES_LIVE so an accidentally constructed production client remains inert.
 * Tests pass an isolated env object containing PLACES_LIVE=1 plus mock I/O.
 */
export function createPlacesClient({
  apiKey,
  baseUrl = GOOGLE_PLACES_BASE_URL,
  env = process.env,
  fetchImpl = globalThis.fetch,
  query,
  sleep = defaultSleep,
  defaultMaxAttempts = 4,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Places fetch implementation must be a function.");
  }
  if (typeof sleep !== "function") {
    throw new TypeError("Places sleep implementation must be a function.");
  }
  const database = createQueryExecutor(query);

  async function searchText({
    runId,
    taskType,
    entityId = null,
    textQuery,
    languageCode,
    regionCode,
    includedType,
    strictTypeFiltering,
    locationBias,
    maxResultCount,
    costEstimateUsd,
    maxAttempts = defaultMaxAttempts,
    signal,
  }) {
    assertLiveEnabled(env);
    const normalizedRunId = normalizeRunId(runId);
    assertOptionalEntityId(entityId);
    assertNonEmptyString(textQuery, "Places textQuery");

    const requestConfig = getPlacesRequestConfig(taskType, "searchText");
    const estimatedCost = resolveCostEstimate(costEstimateUsd, requestConfig, taskType, "searchText");
    const body = {
      textQuery: textQuery.trim(),
      ...(languageCode ? { languageCode } : {}),
      ...(regionCode ? { regionCode } : {}),
      ...(includedType ? { includedType } : {}),
      ...(strictTypeFiltering === undefined ? {} : { strictTypeFiltering: Boolean(strictTypeFiltering) }),
      ...(locationBias === undefined ? {} : { locationBias }),
      ...(maxResultCount === undefined
        ? {}
        : { maxResultCount: positiveInteger(maxResultCount, "maxResultCount") }),
    };

    return execute({
      runId: normalizedRunId,
      entityId,
      taskType,
      callType: "search_text",
      method: "POST",
      url: `${trimTrailingSlash(baseUrl)}/places:searchText`,
      fieldMask: requestConfig.fieldMask,
      body,
      costEstimateUsd: estimatedCost,
      maxAttempts,
      signal,
    });
  }

  async function getDetails({
    runId,
    taskType,
    entityId = null,
    placeId,
    languageCode,
    regionCode,
    costEstimateUsd,
    maxAttempts = defaultMaxAttempts,
    signal,
  }) {
    assertLiveEnabled(env);
    const normalizedRunId = normalizeRunId(runId);
    assertOptionalEntityId(entityId);
    assertNonEmptyString(placeId, "Places placeId");

    const requestConfig = getPlacesRequestConfig(taskType, "details");
    const estimatedCost = resolveCostEstimate(costEstimateUsd, requestConfig, taskType, "details");
    const params = new URLSearchParams();
    if (languageCode) params.set("languageCode", languageCode);
    if (regionCode) params.set("regionCode", regionCode);
    const suffix = params.size ? `?${params}` : "";

    return execute({
      runId: normalizedRunId,
      entityId,
      taskType,
      callType: "place_details",
      method: "GET",
      url: `${trimTrailingSlash(baseUrl)}/places/${encodeURIComponent(placeId.trim())}${suffix}`,
      fieldMask: requestConfig.fieldMask,
      body: undefined,
      costEstimateUsd: estimatedCost,
      maxAttempts,
      signal,
    });
  }

  async function execute({
    runId,
    entityId,
    taskType,
    callType,
    method,
    url,
    fieldMask,
    body,
    costEstimateUsd,
    maxAttempts,
    signal,
  }) {
    const attemptsAllowed = positiveInteger(maxAttempts, "maxAttempts");
    const resolvedApiKey = apiKey || getGooglePlacesApiKey();
    if (!resolvedApiKey) {
      throw new Error("Missing Google Places API key; refusing Places call.");
    }

    const requestFingerprint = fingerprint({ method, url, taskType, fieldMask, body: body ?? null });
    let finalError = null;
    let finalStatus = null;
    let attemptsMade = 0;

    for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
      attemptsMade = attempt;
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            "X-Goog-Api-Key": resolvedApiKey,
            "X-Goog-FieldMask": fieldMask,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal,
        });
      } catch (error) {
        finalError = new PlacesError(`Google Places request failed: ${errorMessage(error)}`, {
          attempts: attempt,
          cause: error,
        });
        if (attempt < attemptsAllowed) {
          await sleep(retryDelayMs(null, attempt));
          continue;
        }
        break;
      }

      finalStatus = numericHttpStatus(response.status);
      const { body: responseBody, text } = await readResponse(response);
      if (response.ok) {
        const externalCallId = await insertExternalCall(database.query, {
          runId,
          callType,
          entityId,
          requestFingerprint,
          status: "ok",
          httpStatus: finalStatus,
          costEstimateUsd,
        });
        return {
          data: responseBody,
          fieldMask,
          costEstimateUsd,
          requestFingerprint,
          externalCallId,
          attempts: attempt,
          httpStatus: finalStatus,
        };
      }

      finalError = new PlacesError(
        `Google Places request failed (${finalStatus ?? "unknown"}): ${providerErrorMessage(responseBody, text, response.statusText)}`,
        { status: finalStatus, body: responseBody, attempts: attempt },
      );
      if (isRetryableStatus(finalStatus) && attempt < attemptsAllowed) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
      break;
    }

    const error = finalError || new PlacesError("Google Places retry loop exhausted.", {
      status: finalStatus,
      attempts: attemptsMade,
    });
    try {
      await insertExternalCall(database.query, {
        runId,
        callType,
        entityId,
        requestFingerprint,
        status: "error",
        httpStatus: finalStatus,
        costEstimateUsd: 0,
      });
    } catch (ledgerError) {
      throw new AggregateError(
        [error, ledgerError],
        `Google Places call failed and its external_calls ledger write also failed: ${error.message}`,
      );
    }
    throw error;
  }

  return {
    searchText,
    getDetails,
    close: database.close,
  };
}

export function assertLiveEnabled(env = process.env) {
  if (env?.PLACES_LIVE !== "1") {
    throw new Error("Google Places live calls are disabled. Set PLACES_LIVE=1 explicitly to enable them.");
  }
  return true;
}

function resolveCostEstimate(override, config, taskType, operation) {
  const value = override === undefined ? config.estimatedCostUsd : override;
  if (value === null || value === undefined) {
    throw new Error(
      `No approved Google Places cost estimate is configured for ${taskType}.${operation}; supply costEstimateUsd after pricing approval.`,
    );
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError("Places costEstimateUsd must be a non-negative finite number.");
  }
  return number;
}

function createQueryExecutor(injectedQuery) {
  if (injectedQuery !== undefined) {
    const query = bindQuery(injectedQuery);
    return { query, close: async () => {} };
  }
  return {
    query: queryWithDefaultDb,
    // The shared pool lifecycle belongs to pipeline/lib/db.mjs and the CLI.
    close: async () => {},
  };
}

let defaultDbPromise;

async function queryWithDefaultDb(text, values) {
  defaultDbPromise ||= import("./db.mjs");
  const database = await defaultDbPromise;
  return database.query(text, values);
}

function bindQuery(query) {
  if (typeof query === "function") {
    return query;
  }
  if (query && typeof query.query === "function") {
    return query.query.bind(query);
  }
  throw new TypeError("Injected query must be a function or an object with query().");
}

async function insertExternalCall(query, call) {
  const result = await query(
    `
      INSERT INTO fountain_ops.external_calls (
        run_id, provider, call_type, entity_id, model, request_fingerprint,
        status, http_status, tokens, cost_estimate_usd
      )
      VALUES ($1, 'google_places', $2, $3, NULL, $4, $5, $6, '{}'::jsonb, $7)
      RETURNING id
    `,
    [
      call.runId,
      call.callType,
      call.entityId,
      call.requestFingerprint,
      call.status,
      call.httpStatus,
      call.costEstimateUsd,
    ],
  );
  return result?.rows?.[0]?.id ?? null;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readResponse(response) {
  const text = await response.text().catch(() => "");
  if (!text) return { body: {}, text: "" };
  try {
    return { body: JSON.parse(text), text };
  } catch {
    return { body: {}, text };
  }
}

function providerErrorMessage(body, text, statusText) {
  return body?.error?.message || body?.message || text.slice(0, 500) || statusText || "unknown error";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableStatus(status) {
  return status === 429 || (status !== null && status >= 500);
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number.parseFloat(response?.headers?.get?.("retry-after") || "");
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(30_000, retryAfter * 1000);
  }
  return Math.min(30_000, 500 * (2 ** (attempt - 1)));
}

function numericHttpStatus(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 100 && number <= 599 ? number : null;
}

function normalizeRunId(value) {
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    return value;
  }
  if (typeof value === "bigint" && value > 0n) {
    return value.toString();
  }
  if (Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  throw new TypeError("runId must be a positive integer or decimal integer string.");
}

function assertOptionalEntityId(value) {
  if (value !== null && (!Number.isInteger(value) || value <= 0)) {
    throw new TypeError("entityId must be null or a positive integer.");
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return value;
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
