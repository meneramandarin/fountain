import { NextResponse, type NextRequest } from "next/server";

type RouteKind = "page" | "docs" | "api" | "api-search" | "api-detail";
type RateBucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 5_000;

const RATE_LIMITS: Record<RouteKind, number> = {
  page: 120,
  docs: 30,
  api: 90,
  "api-search": 45,
  "api-detail": 80,
};

const BLOCKED_USER_AGENTS = [
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
  /\bperplexitybot\b/i,
  /\bsemrushbot\b/i,
  /\bahrefsbot\b/i,
  /\bmj12bot\b/i,
  /\bdotbot\b/i,
  /\bpetalbot\b/i,
];

const buckets = new Map<string, RateBucket>();
let lastCleanup = 0;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const routeKind = getRouteKind(pathname);

  if (isBlockedUserAgent(request)) {
    return blockedResponse(request, 403, "Request blocked");
  }

  if (routeKind.startsWith("api") && !isLikelySameOriginApiRequest(request)) {
    return blockedResponse(request, 403, "API requests must come from the site");
  }

  const rateLimit = RATE_LIMITS[routeKind];
  if (isRateLimited(`${getClientIp(request)}:${routeKind}`, rateLimit)) {
    return blockedResponse(request, 429, "Too many requests", { "Retry-After": "60" });
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (routeKind === "docs" || routeKind.startsWith("api")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return response;
}

function getRouteKind(pathname: string): RouteKind {
  if (pathname.startsWith("/api/search")) {
    return "api-search";
  }
  if (pathname.startsWith("/api/location/") || pathname.startsWith("/api/practitioner/")) {
    return "api-detail";
  }
  if (pathname.startsWith("/api/")) {
    return "api";
  }
  if (pathname.startsWith("/docs/")) {
    return "docs";
  }
  return "page";
}

function isBlockedUserAgent(request: NextRequest) {
  const userAgent = request.headers.get("user-agent")?.trim() || "";
  return !userAgent || BLOCKED_USER_AGENTS.some((pattern) => pattern.test(userAgent));
}

function isLikelySameOriginApiRequest(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return true;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") {
    return true;
  }

  return isSameHost(request.headers.get("origin"), request) || isSameHost(request.headers.get("referer"), request);
}

function isSameHost(value: string | null, request: NextRequest) {
  if (!value) {
    return false;
  }

  try {
    return new URL(value).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("true-client-ip") ||
    "unknown"
  );
}

function isRateLimited(key: string, limit: number) {
  const now = Date.now();
  cleanupBuckets(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

function cleanupBuckets(now: number) {
  if (now - lastCleanup < WINDOW_MS && buckets.size <= MAX_BUCKETS) {
    return;
  }

  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now || buckets.size > MAX_BUCKETS) {
      buckets.delete(key);
    }
  }
}

function blockedResponse(
  request: NextRequest,
  status: 403 | 429,
  message: string,
  headers: Record<string, string> = {},
) {
  const responseHeaders = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    ...headers,
  };

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status, headers: responseHeaders });
  }

  return new NextResponse(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...responseHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|webp|avif|gif|svg|ico|css|js|map|woff|woff2)$).*)"],
};
