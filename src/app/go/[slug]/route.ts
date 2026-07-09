import {
  getLocationRedirectTarget,
  logOutboundClick,
  noindexHeaders,
  outboundInternalFrom,
  outboundSourcePage,
  websiteRedirectTarget,
} from "@/lib/outbound-clicks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const location = await getLocationRedirectTarget(slug);
  const website = typeof location?.website === "string" && location.website ? websiteRedirectTarget(location.website) : null;
  const headers = noindexHeaders();

  if (!location || !website) {
    return NextResponse.json({ error: "location website not found" }, { status: 404, headers });
  }

  const requestUrl = new URL(request.url);
  const referrer = request.headers.get("referer");
  await logOutboundClick({
    locationId: location.id,
    sourcePage: outboundSourcePage(requestUrl, referrer),
    internalFrom: outboundInternalFrom(requestUrl),
    referrer,
    userAgent: request.headers.get("user-agent"),
    paramSkipped: website.paramSkipped,
  });

  return NextResponse.redirect(website.href, { status: 302, headers });
}
