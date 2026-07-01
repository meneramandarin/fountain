import { parseDirectoryParams, searchLocations, searchPractitioners } from "@/lib/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const params = parseDirectoryParams(url.searchParams);
  const page = Math.max(0, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0);
  const payload =
    params.kind === "practitioners" ? searchPractitioners(params, page) : searchLocations(params, page);
  return NextResponse.json(payload);
}
