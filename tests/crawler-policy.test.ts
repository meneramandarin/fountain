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
    "Mozilla/5.0 (compatible; PetalBot; +https://aspiegel.com/petalbot)",
  ])("allows discovery crawler %s", async (userAgent) => {
    expect((await proxyRequest(userAgent)).status).toBe(200);
  });

  test.each([
    "GPTBot/1.0; +https://openai.com/gptbot",
    "ClaudeBot/1.0; +https://anthropic.com/claudebot",
    "CCBot/2.0; +https://commoncrawl.org/faq/",
  ])("blocks training or bulk crawler %s", async (userAgent) => {
    expect((await proxyRequest(userAgent)).status).toBe(403);
  });

  test.each([
    "curl/8.7.1",
    "python-requests/2.32.0",
    "Mozilla/5.0 (compatible browser)",
    "",
  ])(
    "leaves generic automation detection to verified edge protection for %s",
    async (userAgent) => {
      expect((await proxyRequest(userAgent)).status).toBe(200);
    },
  );

  test("does not apply a process-local request counter", async () => {
    for (let requestNumber = 0; requestNumber < 150; requestNumber += 1) {
      expect(
        (await proxyRequest("Mozilla/5.0 repeated browser", "192.0.2.10")).status,
      ).toBe(200);
    }
  });

  test("publishes separate robots rules for discovery and training crawlers", () => {
    const rules = robots().rules;
    const groups = Array.isArray(rules) ? rules : [rules];
    const perplexity = groups.find(
      (rule) => rule.userAgent === "PerplexityBot",
    );
    const petal = groups.find((rule) => rule.userAgent === "PetalBot");
    const gptBot = groups.find((rule) => rule.userAgent === "GPTBot");

    expect(perplexity).toMatchObject({
      allow: "/",
      disallow: ["/api/", "/docs/", "/go/", "/*?_rsc=", "/*?from="],
    });
    expect(petal).toMatchObject({
      allow: "/",
      disallow: ["/api/", "/docs/", "/go/", "/*?_rsc=", "/*?from="],
    });
    expect(gptBot).toMatchObject({ disallow: "/" });
  });
});

async function proxyRequest(
  userAgent: string,
  clientIp = `192.0.2.${Math.floor(Math.random() * 200) + 1}`,
) {
  return await proxy(
    new NextRequest("https://fountain.clinic/treatments/dexa-scan/austin-tx", {
      headers: {
        "user-agent": userAgent,
        "x-forwarded-for": clientIp,
      },
    }),
  );
}
