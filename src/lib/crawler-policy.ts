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
  "PetalBot",
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

const otherDisallowedCrawlerUserAgents = [
  "SemrushBot",
  "AhrefsBot",
  "MJ12bot",
  "DotBot",
] as const;

/**
 * Enforce explicit crawler policy at the application boundary. Generic tools
 * and unknown clients are handled by Vercel Bot Protection instead: the edge
 * can verify real crawlers and challenge browsers, while a User-Agent check
 * cannot.
 */
export function isDisallowedCrawlerUserAgent(userAgent: string | null) {
  const normalized = userAgent?.trim().toLocaleLowerCase("en-US") || "";
  return normalized
    ? [
        ...trainingAndCollectionCrawlerUserAgents,
        ...otherDisallowedCrawlerUserAgents,
      ].some((crawler) =>
        normalized.includes(crawler.toLocaleLowerCase("en-US")),
      )
    : false;
}
