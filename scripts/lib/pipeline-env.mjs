import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
export const ENV_LOCAL_PATH = path.join(REPO_ROOT, ".env.local");
export const OPENROUTER_DISABLED_PATH = path.join(REPO_ROOT, "config", "openrouter.disabled");

const loaded = [];

loadDotenvFile(ENV_LOCAL_PATH);

export function loadPipelineEnv(extraFiles = []) {
  for (const file of extraFiles) {
    loadDotenvFile(path.resolve(REPO_ROOT, file));
  }
  return loaded;
}

export function getDatabaseUrl() {
  return firstNonEmpty("DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING");
}

export function getOpenRouterApiKey() {
  if (existsSync(OPENROUTER_DISABLED_PATH)) return "";
  return firstNonEmpty("OPENROUTER_API_KEY");
}

export function getGooglePlacesApiKey() {
  return firstNonEmpty("GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY");
}

export function requirePipelineCredentials(requirements = {}) {
  const missing = [];
  if (requirements.database && !getDatabaseUrl()) {
    missing.push("DATABASE_URL or POSTGRES_URL or POSTGRES_PRISMA_URL or POSTGRES_URL_NON_POOLING");
  }
  if (requirements.llm && !getOpenRouterApiKey()) {
    missing.push("OPENROUTER_API_KEY");
  }
  if (requirements.places && !getGooglePlacesApiKey()) {
    missing.push("GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY or GOOGLE_API_KEY");
  }
  if (missing.length) {
    if (requirements.llm && existsSync(OPENROUTER_DISABLED_PATH)) {
      throw new Error(`OpenRouter is disabled by ${OPENROUTER_DISABLED_PATH}; refusing external LLM calls.`);
    }
    throw new Error(`Missing required pipeline credential(s) in ${ENV_LOCAL_PATH}: ${missing.join("; ")}`);
  }
  return {
    databaseUrl: getDatabaseUrl(),
    openRouterApiKey: getOpenRouterApiKey(),
    googlePlacesApiKey: getGooglePlacesApiKey(),
  };
}

export function assertEnvLocalGitignored() {
  const gitignorePath = path.join(REPO_ROOT, ".gitignore");
  if (!existsSync(gitignorePath)) {
    throw new Error(".gitignore is missing; cannot verify .env.local is ignored.");
  }
  const rules = readFileSync(gitignorePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const ignored = rules.some((rule) => rule === ".env.local" || rule === ".env.*" || rule === ".env*.local" || rule === ".env");
  if (!ignored) {
    throw new Error(".env.local is not covered by .gitignore.");
  }
  return true;
}

export async function verifyOpenRouterOneToken({ model = "openai/gpt-4o-mini" } = {}) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    if (existsSync(OPENROUTER_DISABLED_PATH)) {
      throw new Error(`OpenRouter is disabled by ${OPENROUTER_DISABLED_PATH}; refusing test call.`);
    }
    throw new Error(`Missing OPENROUTER_API_KEY in ${ENV_LOCAL_PATH}; refusing LLM test call.`);
  }
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://fountain.local",
      "X-Title": "fountain pipeline preflight",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with ok." }],
      max_tokens: 1,
      temperature: 0,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenRouter 1-token test failed (${response.status}): ${body?.error?.message || response.statusText}`);
  }
  return {
    ok: true,
    model: body.model || model,
    usage: body.usage || null,
  };
}

function loadDotenvFile(filePath) {
  if (!existsSync(filePath)) return false;
  const result = dotenv.config({ path: filePath, override: false, quiet: true });
  if (result.error) {
    throw result.error;
  }
  loaded.push(filePath);
  return true;
}

function firstNonEmpty(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return "";
}
