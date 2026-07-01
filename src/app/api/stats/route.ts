import { getStats } from "@/lib/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getStats());
}
