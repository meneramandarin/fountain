/**
 * Search, answer-engine, and user-directed fetchers that Fountain wants to
 * welcome. Vercel performs the actual identity verification at the network
 * layer; these tokens document the application/robots policy.
 */
export const discoveryCrawlerUserAgents = [
  "Googlebot",
  "Google-InspectionTool",
  "bingbot",
  "BingPreview",
  "DuckDuckBot",
  "Applebot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
] as const;

/**
 * Crawlers whose primary purpose is model training or bulk collection. These
 * are separate from the discovery/user-fetch agents above.
 */
export const trainingAndCollectionCrawlerUserAgents = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Bytespider",
  "Meta-ExternalAgent",
  "cohere-ai",
] as const;

const blockedAutomationPatterns = [
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bscrapy\b/i,
  /\bpython-requests\b/i,
  /\bpython-urllib\b/i,
  /\baiohttp\b/i,
  /\bhttpx\b/i,
  /\bgo-http-client\b/i,
  /\bokhttp\b/i,
  /\blibwww-perl\b/i,
  /\bmechanize\b/i,
  /\bphantomjs\b/i,
  /\bbytespider\b/i,
  /\bgptbot\b/i,
  /\bccbot\b/i,
  /\bclaudebot\b/i,
  /\banthropic-ai\b/i,
  /\bmeta-externalagent\b/i,
  /\bcohere-ai\b/i,
  /\bsemrushbot\b/i,
  /\bahrefsbot\b/i,
  /\bmj12bot\b/i,
  /\bdotbot\b/i,
  /\bpetalbot\b/i,
];

export function isBlockedAutomationUserAgent(userAgent: string | null) {
  const normalized = userAgent?.trim() || "";
  return !normalized || blockedAutomationPatterns.some((pattern) => pattern.test(normalized));
}
