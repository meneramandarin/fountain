import { NextResponse } from "next/server";

import { appRows } from "@/lib/app-db";
import { sendBookingNotification } from "@/lib/booking-notification";
import { parseBookingRequest } from "@/lib/booking-request";

export const runtime = "nodejs";

const SUCCESS_MESSAGE =
  "We’ve received your request. We’ll email you after we confirm the appointment with the clinic.";

type BookingRow = {
  id: string;
};

export async function POST(request: Request) {
  const contentLength = Number.parseInt(
    request.headers.get("content-length") || "0",
    10,
  );
  if (contentLength > 16_384) {
    return NextResponse.json(
      { error: "Request is too large." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Enter your appointment details." },
      { status: 400 },
    );
  }

  if (body && typeof body === "object") {
    const honeypot = (body as Record<string, unknown>).website;
    if (typeof honeypot === "string" && honeypot.trim()) {
      return NextResponse.json({ ok: true, message: SUCCESS_MESSAGE });
    }
  }

  const parsed = parseBookingRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const booking = parsed.value;
  try {
    const rows = await appRows<BookingRow>(
      `
        INSERT INTO booking_requests (
          location_id,
          location_slug,
          location_name,
          requester_name,
          requester_email,
          requester_phone,
          requester_timezone,
          selected_services,
          preferences,
          source_path,
          status,
          notification_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, 'pending', 'pending')
        RETURNING id
      `,
      [
        booking.locationId,
        booking.locationSlug,
        booking.locationName,
        booking.name,
        booking.email,
        booking.phone,
        booking.timezone,
        JSON.stringify(booking.services),
        JSON.stringify(booking.preferences),
        booking.sourcePath,
      ],
    );

    const saved = rows[0];
    if (!saved) {
      throw new Error("Booking request was not persisted.");
    }

    try {
      const notification = await sendBookingNotification({
        ...booking,
        requestId: saved.id,
      });
      await appRows(
        `
          UPDATE booking_requests
          SET notification_status = $2, notified_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE NULL END
          WHERE id = $1
        `,
        [saved.id, notification.sent ? "sent" : "not_configured"],
      );
    } catch (error) {
      console.error("Booking notification failed", error);
      await appRows(
        `
          UPDATE booking_requests
          SET notification_status = 'failed'
          WHERE id = $1
        `,
        [saved.id],
      ).catch((updateError) => {
        console.error("Booking notification status update failed", updateError);
      });
    }

    return NextResponse.json({
      ok: true,
      requestId: saved.id,
      message: SUCCESS_MESSAGE,
    });
  } catch (error) {
    console.error("Booking request failed", error);
    return NextResponse.json(
      {
        error:
          "We couldn’t submit your request right now. Please try again in a moment.",
      },
      { status: 500 },
    );
  }
}
