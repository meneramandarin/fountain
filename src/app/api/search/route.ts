import { parseDirectoryParams, searchLocations } from "@/lib/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("kind") === "practitioners") {
    return NextResponse.json({ error: "practitioner search is unavailable" }, { status: 404 });
  }
  const params = parseDirectoryParams(url.searchParams);
  const page = Math.max(0, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0);
  const payload = await searchLocations(params, page, { includeTreatmentPriceSummaries: true });
  return NextResponse.json(payload);
}
