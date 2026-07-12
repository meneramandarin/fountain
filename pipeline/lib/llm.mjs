import { createHash } from "node:crypto";

import {
  getModelPrice,
  estimateModelCostUsd,
  MODEL_PRICES_USD_PER_MILLION,
  MODEL_TIERS,
  resolveModel,
} from "../config/models.mjs";
import {
  getOpenRouterApiKey,
} from "../../scripts/lib/pipeline-env.mjs";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterError extends Error {
  constructor(message, { status = null, body = null, attempts = 1, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "OpenRouterError";
    this.status = status;
    this.body = body;
    this.attempts = attempts;
  }
}

/**
 * Build an OpenRouter client. `fetchImpl`, `query`, and `sleep` are injectable
 * so tests exercise the complete retry + ledger path without network or Neon.
 */
export function createLlmClient({
  apiKey,
  endpoint = OPENROUTER_CHAT_URL,
  fetchImpl = globalThis.fetch,
  query,
  sleep = defaultSleep,
  tiers = MODEL_TIERS,
  prices = MODEL_PRICES_USD_PER_MILLION,
  defaultMaxAttempts = 4,
  httpReferer = "https://fountain.clinic",
  title = "Fountain pipeline",
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("LLM fetch implementation must be a function.");
  }
  if (typeof sleep !== "function") {
    throw new TypeError("LLM sleep implementation must be a function.");
  }
  const database = createQueryExecutor(query);

  async function complete({
    runId,
    entityId = null,
    tier = "default",
    model,
    messages,
    callType = "chat_completion",
    maxAttempts = defaultMaxAttempts,
    maxTokens,
    temperature = 0,
    responseFormat,
    reasoning,
    signal,
  }) {
    const normalizedRunId = normalizeRunId(runId);
    assertOptionalEntityId(entityId);
    assertMessages(messages);
    assertNonEmptyString(callType, "LLM call type");
    if (reasoning !== undefined) {
      assertPlainJsonObject(reasoning, "reasoning");
    }
    const attemptsAllowed = positiveInteger(maxAttempts, "maxAttempts");
    const selectedModel = resolveModel(model || tier, tiers);

    // Validate pricing before spending money. Missing model pricing must never
    // turn a real call into an uncosted ledger row.
    getModelPrice(selectedModel, prices);

    const resolvedApiKey = apiKey || getOpenRouterApiKey();
    if (!resolvedApiKey) {
      throw new Error("Missing OPENROUTER_API_KEY; refusing OpenRouter call.");
    }

    const requestBody = {
      model: selectedModel,
      messages,
      temperature,
      usage: { include: true },
      ...(maxTokens === undefined ? {} : { max_tokens: nonNegativeInteger(maxTokens, "maxTokens") }),
      ...(responseFormat === undefined ? {} : { response_format: responseFormat }),
      ...(reasoning === undefined ? {} : { reasoning }),
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
        finalError = new OpenRouterError(`OpenRouter request failed: ${errorMessage(error)}`, {
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
      const { body, text } = await readResponse(response);
      if (response.ok) {
        const usage = normalizeUsage(body?.usage);
        const costEstimateUsd = estimateModelCostUsd(selectedModel, usage, prices);
        const externalCallId = await insertExternalCall(database.query, {
          runId: normalizedRunId,
          provider: "openrouter",
          callType,
          entityId,
          model: selectedModel,
          requestFingerprint,
          status: "ok",
          httpStatus: finalStatus,
          tokens: usage,
          costEstimateUsd,
        });
        return {
          content: body?.choices?.[0]?.message?.content ?? "",
          model: body?.model || selectedModel,
          usage,
          costEstimateUsd,
          requestFingerprint,
          externalCallId,
          attempts: attempt,
          raw: body,
        };
      }

      finalError = new OpenRouterError(
        `OpenRouter request failed (${finalStatus ?? "unknown"}): ${providerErrorMessage(body, text, response.statusText)}`,
        { status: finalStatus, body, attempts: attempt },
      );
      if (isRetryableStatus(finalStatus) && attempt < attemptsAllowed) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
      break;
    }

    const error = finalError || new OpenRouterError("OpenRouter retry loop exhausted.", {
      status: finalStatus,
      attempts: attemptsMade,
    });
    try {
      await insertExternalCall(database.query, {
        runId: normalizedRunId,
        provider: "openrouter",
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
        `OpenRouter call failed and its external_calls ledger write also failed: ${error.message}`,
      );
    }
    throw error;
  }

  return {
    complete,
    close: database.close,
  };
}

export function normalizeUsage(usage = {}) {
  const promptTokens = nonNegativeInteger(usage?.prompt_tokens ?? usage?.input_tokens ?? 0, "prompt token count");
  const completionTokens = nonNegativeInteger(usage?.completion_tokens ?? usage?.output_tokens ?? 0, "completion token count");
  const rawReasoningTokens = usage?.completion_tokens_details?.reasoning_tokens
    ?? usage?.reasoning_tokens;
  const reasoningTokens = rawReasoningTokens === undefined || rawReasoningTokens === null
    ? null
    : nonNegativeInteger(rawReasoningTokens, "reasoning token count");
  const totalTokens = nonNegativeInteger(
    usage?.total_tokens ?? promptTokens + completionTokens,
    "total token count",
  );
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    ...(reasoningTokens === null ? {} : { reasoning_tokens: reasoningTokens }),
  };
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      RETURNING id
    `,
    [
      call.runId,
      call.provider,
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

function assertMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new TypeError("LLM messages must be a non-empty array.");
  }
}

function assertPlainJsonObject(value, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain JSON object.`);
  }
  assertJsonValue(value, label, new Set());
}

function assertJsonValue(value, label, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new TypeError(`${label} must contain only JSON-compatible values.`);
  }
  if (typeof value !== "object") {
    throw new TypeError(`${label} must contain only JSON-compatible values.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${label} must not contain circular references.`);
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new TypeError(`${label} must contain only plain JSON objects and arrays.`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${label} must contain only string-keyed JSON values.`);
  }
  ancestors.add(value);
  for (const child of Object.values(value)) {
    assertJsonValue(child, label, ancestors);
  }
  ancestors.delete(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function nonNegativeInteger(value, label) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return number;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
