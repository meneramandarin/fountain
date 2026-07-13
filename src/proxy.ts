import { NextResponse, type NextRequest } from "next/server";
import { isDisallowedCrawlerUserAgent } from "@/lib/crawler-policy";

type RouteKind = "page" | "docs" | "api";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const routeKind = getRouteKind(pathname);

  if (isDisallowedCrawlerUserAgent(request.headers.get("user-agent"))) {
    return blockedResponse(request, 403, "Request blocked");
  }

  if (routeKind.startsWith("api") && !isLikelySameOriginApiRequest(request)) {
    return blockedResponse(
      request,
      403,
      "API requests must come from the site",
    );
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
  if (pathname.startsWith("/api/")) {
    return "api";
  }
  if (pathname.startsWith("/docs/")) {
    return "docs";
  }
  return "page";
}

function isLikelySameOriginApiRequest(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return true;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") {
    return true;
  }

  return (
    isSameHost(request.headers.get("origin"), request) ||
    isSameHost(request.headers.get("referer"), request)
  );
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

function blockedResponse(request: NextRequest, status: 403, message: string) {
  const responseHeaders = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: message },
      { status, headers: responseHeaders },
    );
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|webp|avif|gif|svg|ico|css|js|map|woff|woff2)$).*)",
  ],
};
