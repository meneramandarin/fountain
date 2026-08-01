import type { BookingRequestInput } from "@/lib/booking-request";

type BookingNotification = BookingRequestInput & {
  requestId: string;
};

export async function sendBookingNotification(booking: BookingNotification) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false as const, reason: "not_configured" as const };
  }

  const to = process.env.BOOKING_NOTIFICATION_EMAIL || "bookings@fountain.clinic";
  const from =
    process.env.BOOKING_FROM_EMAIL ||
    "Fountain Bookings <bookings@fountain.clinic>";
  const locationLabel = booking.locationSlug
    ? `${booking.locationName} (${booking.locationSlug})`
    : booking.locationName;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `booking-request-${booking.requestId}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: booking.email,
      subject: `New booking request: ${booking.locationName}`,
      text: [
        "New appointment request",
        "",
        `Clinic: ${locationLabel}`,
        `Location ID: ${booking.locationId}`,
        `Request ID: ${booking.requestId}`,
        "",
        `Name: ${booking.name}`,
        `Email: ${booking.email}`,
        `Phone: ${booking.phone || "Not provided"}`,
        `Time zone: ${booking.timezone}`,
        "",
        "Selected treatments:",
        ...booking.services.map(
          (service, index) =>
            `${index + 1}. ${service.name} — ${formatNotificationPrice(service)}`,
        ),
        "",
        "Preferred appointment times:",
        ...booking.preferences.map(
          (preference, index) =>
            `${index + 1}. ${preference.date} — ${formatTimeBucket(preference.time)}`,
        ),
        "",
        `Source: ${booking.sourcePath || "Not provided"}`,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const responseText = (await response.text()).slice(0, 500);
    throw new Error(
      `Booking notification failed (${response.status}): ${responseText}`,
    );
  }

  return { sent: true as const };
}

function formatTimeBucket(value: BookingRequestInput["preferences"][number]["time"]) {
  if (value === "morning") return "Morning (9am–12pm)";
  if (value === "afternoon") return "Afternoon (12–4pm)";
  return "Evening (4–8pm)";
}

function formatNotificationPrice(service: BookingRequestInput["services"][number]) {
  if (service.priceAmount == null) {
    return "Price on request";
  }
  const currency = service.priceCurrency || "USD";
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: service.priceAmount % 1 === 0 ? 0 : 2,
  }).format(service.priceAmount);
  if (service.priceMaxAmount != null && service.priceMaxAmount !== service.priceAmount) {
    const maximum = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: service.priceMaxAmount % 1 === 0 ? 0 : 2,
    }).format(service.priceMaxAmount);
    return `${amount}–${maximum}`;
  }
  return amount;
}
