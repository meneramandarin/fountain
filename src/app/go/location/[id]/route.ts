import { getLocationRedirectTarget, noindexHeaders } from "@/lib/outbound-clicks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const location = await getLocationRedirectTarget(id);
  const headers = noindexHeaders();

  if (!location?.slug) {
    return NextResponse.json({ error: "location website not found" }, { status: 404, headers });
  }

  const requestUrl = new URL(request.url);
  const slugUrl = new URL(`/go/${location.slug}`, requestUrl.origin);
  slugUrl.search = requestUrl.search;
  return NextResponse.redirect(slugUrl, { status: 302, headers });
}
