import { NextResponse } from "next/server";
// @ts-expect-error Operational JavaScript module shared with the standing CLI.
import { refreshTreatmentFdaStatuses } from "../../../../../scripts/refresh-treatment-fda-statuses.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "FDA status refresh is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const report = await refreshTreatmentFdaStatuses({ apply: true, quiet: true });
    return NextResponse.json(report);
  } catch (error) {
    console.error("Treatment FDA status refresh failed", error);
    return NextResponse.json({ error: "FDA status refresh failed." }, { status: 500 });
  }
}
