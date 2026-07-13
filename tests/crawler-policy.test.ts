import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import robots from "../src/app/robots";
import { proxy } from "../src/proxy";

describe("crawler lanes", () => {
  test.each([
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://anthropic.com/searchbot)",
    "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  ])("allows discovery crawler %s", (userAgent) => {
    expect(proxyRequest(userAgent).status).toBe(200);
  });

  test.each([
    "GPTBot/1.0; +https://openai.com/gptbot",
    "ClaudeBot/1.0; +https://anthropic.com/claudebot",
    "CCBot/2.0; +https://commoncrawl.org/faq/",
  ])("blocks training or bulk crawler %s", (userAgent) => {
    expect(proxyRequest(userAgent).status).toBe(403);
  });

  test("publishes separate robots rules for Perplexity discovery and GPTBot training", () => {
    const rules = robots().rules;
    const groups = Array.isArray(rules) ? rules : [rules];
    const perplexity = groups.find((rule) => rule.userAgent === "PerplexityBot");
    const gptBot = groups.find((rule) => rule.userAgent === "GPTBot");

    expect(perplexity).toMatchObject({ allow: "/", disallow: ["/api/", "/docs/", "/go/"] });
    expect(gptBot).toMatchObject({ disallow: "/" });
  });
});

function proxyRequest(userAgent: string) {
  return proxy(new NextRequest("https://fountain.clinic/treatments/dexa-scan/austin-tx", {
    headers: {
      "user-agent": userAgent,
      "x-forwarded-for": `192.0.2.${Math.floor(Math.random() * 200) + 1}`,
    },
  }));
}
