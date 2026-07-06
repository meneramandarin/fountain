import { getLocationDetail } from "@/lib/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const locationId = Number.parseInt(id, 10);
  if (!Number.isFinite(locationId)) {
    return NextResponse.json({ error: "invalid location id" }, { status: 400 });
  }
  const location = await getLocationDetail(locationId);
  return location
    ? NextResponse.json(location)
    : NextResponse.json({ error: "location not found" }, { status: 404 });
}
