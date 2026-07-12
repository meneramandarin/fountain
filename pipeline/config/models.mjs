const GPT_4O_MINI = "openai/gpt-4o-mini";
const GEMINI_3_5_FLASH = "google/gemini-3.5-flash";

/**
 * Task code selects a tier, not a provider model name. Keep tier mappings on
 * stable model slugs so routing changes cannot silently change ledger rates.
 */
export const MODEL_TIERS = Object.freeze({
  default: GPT_4O_MINI,
  escalation: GEMINI_3_5_FLASH,
});

/**
 * Configured USD rates per one million tokens. Keep these rates explicit so a
 * model change cannot silently produce a zero-dollar ledger entry.
 */
export const MODEL_PRICES_USD_PER_MILLION = Object.freeze({
  [GPT_4O_MINI]: Object.freeze({
    input: 0.15,
    output: 0.6,
  }),
  [GEMINI_3_5_FLASH]: Object.freeze({
    input: 1.5,
    output: 9,
  }),
});

export function resolveModel(tierOrModel = "default", tiers = MODEL_TIERS) {
  if (typeof tierOrModel !== "string" || !tierOrModel.trim()) {
    throw new TypeError("LLM tier or model must be a non-empty string.");
  }

  const requested = tierOrModel.trim();
  if (!Object.prototype.hasOwnProperty.call(tiers, requested)) {
    return requested;
  }

  const model = tiers[requested];
  if (typeof model !== "string" || !model.trim()) {
    throw new Error(`LLM model tier \"${requested}\" is not configured.`);
  }
  return model.trim();
}

export function getModelPrice(model, prices = MODEL_PRICES_USD_PER_MILLION) {
  const price = prices[model];
  if (!price) {
    throw new Error(`No per-token price is configured for model \"${model}\".`);
  }

  const input = nonNegativeNumber(price.input, `${model} input price`);
  const output = nonNegativeNumber(price.output, `${model} output price`);
  return { input, output };
}

export function estimateModelCostUsd(model, usage, prices = MODEL_PRICES_USD_PER_MILLION) {
  const price = getModelPrice(model, prices);
  const inputTokens = tokenCount(usage?.prompt_tokens ?? usage?.input_tokens ?? 0, "input token count");
  const outputTokens = tokenCount(usage?.completion_tokens ?? usage?.output_tokens ?? 0, "output token count");

  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

function tokenCount(value, label) {
  const number = nonNegativeNumber(value, label);
  if (!Number.isInteger(number)) {
    throw new TypeError(`${label} must be an integer.`);
  }
  return number;
}

function nonNegativeNumber(value, label) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative finite number.`);
  }
  return number;
}
