import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import { createWebClient, isRobotsPathAllowed, normalizeWebUrl } from "../pipeline/lib/web.mjs";

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const temporaryDirectories: string[] = [];
const publicDns = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("pipeline cached website client", () => {
  test("normalizes a homepage and reuses its disk cache until the TTL expires", async () => {
    const cacheDir = await temporaryCache();
    let time = Date.parse("2026-07-11T12:00:00.000Z");
    const fetchImpl = vi.fn<FetchImpl>()
      .mockResolvedValueOnce(htmlResponse(`
        <html>
          <head>
            <title> Fountain &amp; Longevity </title>
            <meta name="description" content="Preventive care &amp; recovery">
          </head>
          <body><script>ignore me</script><h1>Live better</h1><p>${"x".repeat(80)}</p></body>
        </html>
      `))
      .mockResolvedValueOnce(htmlResponse("<title>Refreshed</title><body>new</body>"));
    const client = createWebClient({
      cacheDir,
      ttlMs: 1_000,
      now: () => time,
      fetchImpl,
      resolveHost: publicDns,
      respectRobots: false,
      maxExcerptChars: 40,
    });

    const first = await client.fetchHomepage("example.com/#fragment");
    const cached = await client.fetchHomepage("https://example.com/");

    expect(first).toMatchObject({
      ok: true,
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      title: "Fountain & Longevity",
      description: "Preventive care & recovery",
      cached: false,
    });
    expect(first.textExcerpt).toContain("Live better");
    expect(first.textExcerpt).not.toContain("ignore me");
    expect(first.textExcerpt).toHaveLength(40);
    expect(cached).toMatchObject({ ok: true, title: first.title, cached: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(publicDns).toHaveBeenCalledTimes(1);

    time += 1_000;
    const refreshed = await client.fetchHomepage("https://example.com/");
    expect(refreshed).toMatchObject({ ok: true, title: "Refreshed", cached: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(client.getStats()).toMatchObject({ cacheHits: 1, cacheMisses: 2, networkRequests: 2 });
  });

  test("deduplicates concurrent requests for the same normalized URL", async () => {
    const cacheDir = await temporaryCache();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const fetchImpl = vi.fn<FetchImpl>(async () => {
      await pending;
      return htmlResponse("<title>One request</title><body>hello</body>");
    });
    const client = createWebClient({
      cacheDir,
      fetchImpl,
      resolveHost: publicDns,
      respectRobots: false,
    });

    const firstPromise = client.fetchHomepage("https://example.com");
    const secondPromise = client.fetchHomepage("https://example.com/");
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    release();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first.cached).toBe(false);
    expect(second).toMatchObject({ ok: true, cached: true, deduplicated: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.getStats().deduplicatedRequests).toBe(1);
  });

  test("honors and caches robots.txt before requesting a disallowed homepage", async () => {
    const cacheDir = await temporaryCache();
    const fetchImpl = vi.fn<FetchImpl>(async (input) => {
      expect(String(input)).toBe("https://example.com/robots.txt");
      return new Response("User-agent: *\nDisallow: /private\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    });
    const client = createWebClient({ cacheDir, fetchImpl, resolveHost: publicDns });

    const first = await client.fetchHomepage("https://example.com/private/clinic");
    const second = await client.fetchHomepage("https://example.com/private/clinic");

    expect(first).toMatchObject({
      ok: false,
      outcome: "robots_disallowed",
      robots: { allowed: false, cached: false },
    });
    expect(second).toMatchObject({
      ok: false,
      outcome: "robots_disallowed",
      robots: { allowed: false, cached: true },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("validates every redirect target and never follows a private-network redirect", async () => {
    const cacheDir = await temporaryCache();
    const fetchImpl = vi.fn<FetchImpl>(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/admin" },
    }));
    const client = createWebClient({
      cacheDir,
      fetchImpl,
      resolveHost: publicDns,
      respectRobots: false,
    });

    const result = await client.fetchHomepage("https://example.com/");

    expect(result).toMatchObject({ ok: false, outcome: "unsafe_url" });
    expect(result.error).toMatch(/private|reserved/iu);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("rejects private DNS answers before fetch and caches the safe failure", async () => {
    const cacheDir = await temporaryCache();
    const fetchImpl = vi.fn<FetchImpl>();
    const resolveHost = vi.fn(async () => [{ address: "10.0.0.8", family: 4 }]);
    const client = createWebClient({
      cacheDir,
      fetchImpl,
      resolveHost,
      respectRobots: false,
    });

    const first = await client.fetchHomepage("https://example.com/");
    const second = await client.fetchHomepage("https://example.com/");

    expect(first).toMatchObject({ ok: false, outcome: "unsafe_url", cached: false });
    expect(second).toMatchObject({ ok: false, outcome: "unsafe_url", cached: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resolveHost).toHaveBeenCalledTimes(1);
  });

  test("caps response bytes without consuming an oversized body and caches the result", async () => {
    const cacheDir = await temporaryCache();
    const fetchImpl = vi.fn<FetchImpl>(async () => htmlResponse("ignored", {
      headers: { "content-type": "text/html", "content-length": "101" },
    }));
    const client = createWebClient({
      cacheDir,
      fetchImpl,
      resolveHost: publicDns,
      respectRobots: false,
      maxBytes: 100,
    });

    const first = await client.fetchHomepage("https://example.com/");
    const second = await client.fetchHomepage("https://example.com/");

    expect(first).toMatchObject({ ok: false, outcome: "too_large", cached: false });
    expect(second).toMatchObject({ ok: false, outcome: "too_large", cached: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("times out a stalled request and serves the cached timeout on retry", async () => {
    const cacheDir = await temporaryCache();
    const fetchImpl = vi.fn<FetchImpl>(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const client = createWebClient({
      cacheDir,
      fetchImpl,
      resolveHost: publicDns,
      respectRobots: false,
      timeoutMs: 10,
    });

    const first = await client.fetchHomepage("https://example.com/");
    const second = await client.fetchHomepage("https://example.com/");

    expect(first).toMatchObject({ ok: false, outcome: "timeout", cached: false });
    expect(second).toMatchObject({ ok: false, outcome: "timeout", cached: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("reports unsupported content and invalid URLs as structured failures", async () => {
    const cacheDir = await temporaryCache();
    const fetchImpl = vi.fn<FetchImpl>(async () => new Response("pdf", {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }));
    const client = createWebClient({
      cacheDir,
      fetchImpl,
      resolveHost: publicDns,
      respectRobots: false,
    });

    await expect(client.fetchHomepage("https://example.com/file.pdf")).resolves.toMatchObject({
      ok: false,
      outcome: "unsupported_content_type",
    });
    await expect(client.fetchHomepage("file:///etc/passwd")).resolves.toMatchObject({
      ok: false,
      outcome: "invalid_url",
    });
    await expect(client.fetchHomepage("http://[::1]/admin")).resolves.toMatchObject({
      ok: false,
      outcome: "invalid_url",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("robots and URL helpers", () => {
  test("uses the most specific robots group and longest allow/disallow match", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /",
      "",
      "User-agent: FountainPipeline",
      "Disallow: /private",
      "Allow: /private/public",
    ].join("\n");

    expect(isRobotsPathAllowed(robots, "https://example.com/private", "FountainPipeline")).toBe(false);
    expect(isRobotsPathAllowed(robots, "https://example.com/private/public/page", "FountainPipeline")).toBe(true);
    expect(isRobotsPathAllowed(robots, "https://example.com/ordinary", "FountainPipeline")).toBe(true);
    expect(isRobotsPathAllowed(robots, "https://example.com/ordinary", "OtherBot")).toBe(false);
  });

  test("normalizes scheme-less URLs and strips fragments", () => {
    expect(normalizeWebUrl(" Example.com/path#team ")).toBe("https://example.com/path");
    expect(normalizeWebUrl("example.com:443/path")).toBe("https://example.com/path");
  });
});

async function temporaryCache() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fountain-web-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function htmlResponse(body: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "text/html; charset=utf-8");
  return new Response(body, { status: 200, ...init, headers });
}
