import { getPractitionerDetail } from "@/lib/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const practitioner = await getPractitionerDetail(id);
  return practitioner
    ? NextResponse.json(practitioner)
    : NextResponse.json({ error: "practitioner not found" }, { status: 404 });
}
