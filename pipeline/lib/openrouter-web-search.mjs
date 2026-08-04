import { createHash } from "node:crypto";

import {
  estimateModelCostUsd,
  getModelPrice,
  MODEL_PRICES_USD_PER_MILLION,
  MODEL_TIERS,
  resolveModel,
} from "../config/models.mjs";
import { getOpenRouterApiKey } from "../../scripts/lib/pipeline-env.mjs";
import { normalizeUsage, OPENROUTER_CHAT_URL } from "./llm.mjs";

export const OPENROUTER_WEB_SEARCH_ENGINE = "exa";
export const OPENROUTER_WEB_SEARCH_REQUEST_USD = 0.005;
export const OPENROUTER_WEB_SEARCH_MAX_RESULTS = 3;
export const OPENROUTER_WEB_SEARCH_MAX_CHARACTERS = 2_000;

export class OpenRouterWebSearchError extends Error {
  constructor(message, { status = null, body = null, attempts = 1, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "OpenRouterWebSearchError";
    this.status = status;
    this.body = body;
    this.attempts = attempts;
  }
}

/**
 * Build a website-discovery-compatible agent search function.
 *
 * OpenRouter's deprecated `plugins: [{ id: "web" }]` shape is intentionally
 * not used. The current server tool lets the model decide when to search and
 * reports actual requests in usage.server_tool_use.web_search_requests.
 */
export function createOpenRouterAgentWebSearch({
  apiKey,
  endpoint = OPENROUTER_CHAT_URL,
  tier = "default",
  model,
  fetchImpl = globalThis.fetch,
  query,
  sleep = defaultSleep,
  tiers = MODEL_TIERS,
  prices = MODEL_PRICES_USD_PER_MILLION,
  defaultMaxAttempts = 4,
  maxResults = OPENROUTER_WEB_SEARCH_MAX_RESULTS,
  maxCharacters = OPENROUTER_WEB_SEARCH_MAX_CHARACTERS,
  maxTokens = 350,
  webSearchRequestUsd = OPENROUTER_WEB_SEARCH_REQUEST_USD,
  httpReferer = "https://fountain.clinic",
  title = "Fountain website discovery",
  systemPrompt = [
    "Find the official website for the supplied business identity.",
    "Use the web-search tool for the supplied query, do not invent URLs,",
    "and briefly identify the best official-site candidate from the cited results.",
  ].join(" "),
  callType = "website_discovery_web_search",
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Web-search fetch implementation must be a function.");
  }
  if (typeof sleep !== "function") {
    throw new TypeError("Web-search sleep implementation must be a function.");
  }
  assertNonEmptyString(systemPrompt, "systemPrompt");
  assertNonEmptyString(callType, "callType");
  const selectedModel = resolveModel(model || tier, tiers);
  getModelPrice(selectedModel, prices);
  const normalizedMaxResults = boundedInteger(maxResults, 1, 25, "maxResults");
  const normalizedMaxCharacters = boundedInteger(
    maxCharacters,
    1,
    100_000,
    "maxCharacters",
  );
  const normalizedMaxTokens = positiveInteger(maxTokens, "maxTokens");
  const searchUnitCostUsd = nonnegativeNumber(webSearchRequestUsd, "webSearchRequestUsd");
  const database = createQueryExecutor(query);

  const webSearch = async ({
    query: searchQuery,
    runId,
    entityId = null,
    location = null,
    maxAttempts = defaultMaxAttempts,
    signal,
  } = {}) => {
    const normalizedRunId = normalizeRunId(runId);
    assertOptionalEntityId(entityId);
    assertNonEmptyString(searchQuery, "web-search query");
    const attemptsAllowed = positiveInteger(maxAttempts, "maxAttempts");
    const resolvedApiKey = apiKey || getOpenRouterApiKey();
    if (!resolvedApiKey) {
      throw new Error("Missing OPENROUTER_API_KEY; refusing agent web-search call.");
    }

    const requestBody = {
      model: selectedModel,
      messages: [
        {
          role: "system",
          content: systemPrompt.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            search_query: searchQuery.trim(),
            target: locationIdentity(location),
          }),
        },
      ],
      tools: [{
        type: "openrouter:web_search",
        parameters: {
          engine: OPENROUTER_WEB_SEARCH_ENGINE,
          max_results: normalizedMaxResults,
          max_total_results: normalizedMaxResults,
          max_characters: normalizedMaxCharacters,
        },
      }],
      tool_choice: "required",
      temperature: 0,
      max_tokens: normalizedMaxTokens,
      usage: { include: true },
    };
    const requestFingerprint = fingerprint({ endpoint, callType, requestBody });
    let finalError = null;
    let finalStatus = null;
    let attemptsMade = 0;

    for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
      attemptsMade = attempt;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            "Authorization": `Bearer ${resolvedApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": httpReferer,
            "X-Title": title,
          },
          body: JSON.stringify(requestBody),
          signal,
        });
      } catch (error) {
        finalError = new OpenRouterWebSearchError(
          `OpenRouter agent web-search request failed: ${errorMessage(error)}`,
          { attempts: attempt, cause: error },
        );
        if (attempt < attemptsAllowed) {
          await sleep(retryDelayMs(null, attempt));
          continue;
        }
        break;
      }

      finalStatus = numericHttpStatus(response.status);
      const { body, text } = await readResponse(response);
      if (response.ok) {
        const usage = normalizeUsage(body?.usage);
        const reportedWebSearchRequests = nonnegativeInteger(
          body?.usage?.server_tool_use?.web_search_requests ?? 0,
          "web-search request count",
        );
        const results = extractUrlCitationResults(body, normalizedMaxResults);
        // Some OpenRouter routes currently return URL citations while omitting
        // server_tool_use. A non-empty citation set proves at least one search
        // request, so fail toward complete cost accounting instead of $0.
        const webSearchRequests = Math.max(reportedWebSearchRequests, results.length > 0 ? 1 : 0);
        const modelCostUsd = estimateModelCostUsd(selectedModel, usage, prices);
        const webSearchCostUsd = webSearchRequests * searchUnitCostUsd;
        const costEstimateUsd = modelCostUsd + webSearchCostUsd;
        const meteredUsage = {
          ...usage,
          web_search_requests: webSearchRequests,
          web_search_results: results.length,
        };
        const content = optionalString(body?.choices?.[0]?.message?.content) || "";
        const externalCallId = await insertExternalCall(database.query, {
          runId: normalizedRunId,
          callType,
          entityId,
          model: selectedModel,
          requestFingerprint,
          status: "ok",
          httpStatus: finalStatus,
          tokens: meteredUsage,
          costEstimateUsd,
        });
        return {
          content,
          results,
          model: body?.model || selectedModel,
          usage: meteredUsage,
          webSearchRequests,
          modelCostUsd,
          webSearchCostUsd,
          costEstimateUsd,
          requestFingerprint,
          externalCallId,
          attempts: attempt,
          httpStatus: finalStatus,
        };
      }

      finalError = new OpenRouterWebSearchError(
        `OpenRouter agent web-search failed (${finalStatus ?? "unknown"}): ${providerErrorMessage(body, text, response.statusText)}`,
        { status: finalStatus, body, attempts: attempt },
      );
      if (isRetryableStatus(finalStatus) && attempt < attemptsAllowed) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
      break;
    }

    const error = finalError || new OpenRouterWebSearchError(
      "OpenRouter agent web-search retry loop exhausted.",
      { status: finalStatus, attempts: attemptsMade },
    );
    try {
      await insertExternalCall(database.query, {
        runId: normalizedRunId,
        callType,
        entityId,
        model: selectedModel,
        requestFingerprint,
        status: "error",
        httpStatus: finalStatus,
        tokens: {},
        costEstimateUsd: 0,
      });
    } catch (ledgerError) {
      throw new AggregateError(
        [error, ledgerError],
        `Agent web-search failed and its external_calls ledger write also failed: ${error.message}`,
      );
    }
    throw error;
  };

  webSearch.close = database.close;
  return webSearch;
}

export function extractUrlCitationResults(body, limit = OPENROUTER_WEB_SEARCH_MAX_RESULTS) {
  const normalizedLimit = boundedInteger(limit, 1, 25, "result limit");
  const annotations = Array.isArray(body?.choices?.[0]?.message?.annotations)
    ? body.choices[0].message.annotations
    : [];
  const seen = new Set();
  const results = [];
  for (const annotation of annotations) {
    const citation = annotation?.url_citation || annotation;
    const url = httpUrl(citation?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    results.push({
      url,
      title: optionalString(citation?.title),
      snippet: optionalString(citation?.content),
    });
    if (results.length >= normalizedLimit) break;
  }
  return results;
}

function locationIdentity(location) {
  if (!location || typeof location !== "object" || Array.isArray(location)) return null;
  return {
    name: optionalString(location.name),
    address: optionalString(location.address),
    locality: optionalString(location.locality),
    region: optionalString(location.region),
    postal_code: optionalString(location.postal_code ?? location.postalCode),
    country_code: optionalString(location.country_code ?? location.countryCode),
  };
}

function createQueryExecutor(injectedQuery) {
  if (injectedQuery !== undefined) {
    const bound = bindQuery(injectedQuery);
    return { query: bound, close: async () => {} };
  }
  return {
    query: queryWithDefaultDb,
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
  if (typeof query === "function") return query;
  if (query && typeof query.query === "function") return query.query.bind(query);
  throw new TypeError("Injected query must be a function or an object with query().");
}

async function insertExternalCall(query, call) {
  const result = await query(
    `
      INSERT INTO fountain_ops.external_calls (
        run_id, provider, call_type, entity_id, model, request_fingerprint,
        status, http_status, tokens, cost_estimate_usd
      )
      VALUES ($1, 'openrouter', $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      RETURNING id
    `,
    [
      call.runId,
      call.callType,
      call.entityId,
      call.model,
      call.requestFingerprint,
      call.status,
      call.httpStatus,
      JSON.stringify(call.tokens),
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
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  if (typeof value === "bigint" && value > 0n) return value.toString();
  if (Number.isSafeInteger(value) && value > 0) return value;
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

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return value;
}

function nonnegativeInteger(value, label) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return number;
}

function nonnegativeNumber(value, label) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative finite number.`);
  }
  return number;
}

function optionalString(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function httpUrl(value) {
  const normalized = optionalString(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
