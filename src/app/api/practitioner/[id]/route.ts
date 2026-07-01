import { getPractitionerDetail } from "@/lib/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const practitionerId = Number.parseInt(id, 10);
  if (!Number.isFinite(practitionerId)) {
    return NextResponse.json({ error: "invalid practitioner id" }, { status: 400 });
  }
  const practitioner = getPractitionerDetail(practitionerId);
  return practitioner
    ? NextResponse.json(practitioner)
    : NextResponse.json({ error: "practitioner not found" }, { status: 404 });
}
