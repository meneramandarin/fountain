import { NextResponse } from "next/server";
import { rows } from "@/lib/db";

export const runtime = "nodejs";

const QUALITY_TABLE = "fountain_raw.impossible_health_review_quality_20260713";
const DECISIONS_TABLE = "fountain_raw.impossible_health_review_decisions_20260713";
const NOTES_TABLE = "fountain_raw.impossible_health_review_notes_20260713";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { candidateId?: unknown; decision?: unknown; comment?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const candidateId = Number(body.candidateId);
  const decision = body.decision;
  const hasDecision = Object.hasOwn(body, "decision");
  const hasComment = Object.hasOwn(body, "comment");
  if (!Number.isSafeInteger(candidateId) || candidateId <= 0) {
    return NextResponse.json({ error: "Invalid candidate ID" }, { status: 400 });
  }
  if (!hasDecision && !hasComment) {
    return NextResponse.json({ error: "A decision or comment is required" }, { status: 400 });
  }
  if (hasDecision && decision !== null && decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "Decision must be approved, rejected, or null" }, { status: 400 });
  }
  if (hasComment && typeof body.comment !== "string") {
    return NextResponse.json({ error: "Comment must be text" }, { status: 400 });
  }
  if (typeof body.comment === "string" && body.comment.length > 5000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }

  const eligible = await rows<{ candidate_id: number }>(`
    SELECT candidate_id
    FROM ${QUALITY_TABLE}
    WHERE candidate_id = ?
      AND decision = 'held_back'
      AND reasons <> ARRAY['missing_prices']::text[]
  `, [candidateId]);
  if (!eligible.length) return NextResponse.json({ error: "Candidate is not in the manual-review deck" }, { status: 404 });

  if (hasComment) {
    const comment = (body.comment as string).trim();
    if (comment) {
      await rows(`
        INSERT INTO ${NOTES_TABLE} (candidate_id, reviewer_comment, updated_at)
        VALUES (?, ?, now())
        ON CONFLICT (candidate_id) DO UPDATE
        SET reviewer_comment = EXCLUDED.reviewer_comment,
            updated_at = now()
      `, [candidateId, comment]);
    } else {
      await rows(`DELETE FROM ${NOTES_TABLE} WHERE candidate_id = ?`, [candidateId]);
    }
  }

  if (!hasDecision) return NextResponse.json({ ok: true, candidateId, commentSaved: true });

  if (decision === null) {
    await rows(`DELETE FROM ${DECISIONS_TABLE} WHERE candidate_id = ? AND decision_source = 'manual'`, [candidateId]);
    await rows(`UPDATE fountain.locations SET status = 'draft', updated_at = now() WHERE id = ?`, [candidateId]);
    return NextResponse.json({ ok: true, candidateId, decision: null });
  }

  await rows(`
    INSERT INTO ${DECISIONS_TABLE} (candidate_id, decision, decision_source, reviewed_at)
    VALUES (?, ?, 'manual', now())
    ON CONFLICT (candidate_id) DO UPDATE
    SET decision = EXCLUDED.decision,
        decision_source = 'manual',
        reviewed_at = now()
  `, [candidateId, decision]);
  await rows(`UPDATE fountain.locations SET status = ?, updated_at = now() WHERE id = ?`, [decision === "approved" ? "active" : "draft", candidateId]);

  return NextResponse.json({ ok: true, candidateId, decision });
}
