import { NextResponse } from "next/server";

import { appRows } from "@/lib/app-db";
import { normalizeNewsletterEmail } from "@/lib/newsletter";

export const runtime = "nodejs";

const SUCCESS_MESSAGE = "You’re on the list—thank you!";

type SubscriptionRow = {
  status: "pending" | "subscribed" | "unsubscribed" | "bounced" | "complained";
};

export async function POST(request: Request) {
  const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > 4096) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;

  // Quietly accept bot submissions that fill the hidden honeypot field.
  if (typeof payload.website === "string" && payload.website.trim().length > 0) {
    return NextResponse.json({ ok: true, message: SUCCESS_MESSAGE });
  }

  const email = normalizeNewsletterEmail(payload.email);
  if (!email) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const subscriptions = await appRows<SubscriptionRow>(
      `
        INSERT INTO newsletter_subscriptions (
          email,
          status,
          source,
          consent_version,
          consented_at
        )
        VALUES ($1, 'subscribed', 'footer', 'newsletter-v1', NOW())
        ON CONFLICT (email) DO UPDATE SET
          status = CASE
            WHEN newsletter_subscriptions.status IN ('bounced', 'complained')
              THEN newsletter_subscriptions.status
            ELSE 'subscribed'
          END,
          source = EXCLUDED.source,
          consent_version = EXCLUDED.consent_version,
          consented_at = CASE
            WHEN newsletter_subscriptions.status IN ('bounced', 'complained')
              THEN newsletter_subscriptions.consented_at
            ELSE NOW()
          END,
          unsubscribed_at = CASE
            WHEN newsletter_subscriptions.status IN ('bounced', 'complained')
              THEN newsletter_subscriptions.unsubscribed_at
            ELSE NULL
          END,
          updated_at = NOW()
        RETURNING status
      `,
      [email],
    );

    if (!subscriptions[0]) {
      throw new Error("Newsletter subscription was not persisted.");
    }

    return NextResponse.json({ ok: true, message: SUCCESS_MESSAGE });
  } catch (error) {
    console.error("Newsletter subscription failed", error);
    return NextResponse.json(
      { error: "We couldn’t subscribe you right now. Please try again." },
      { status: 500 },
    );
  }
}
