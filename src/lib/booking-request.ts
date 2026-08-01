const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const BOOKING_PREFERENCE_COUNT = 3;
export const BOOKING_MIN_LEAD_DAYS = 2;
export const BOOKING_TIME_BUCKETS = ["morning", "afternoon", "evening"] as const;

export type BookingTimeBucket = (typeof BOOKING_TIME_BUCKETS)[number];

export type BookingPreference = {
  date: string;
  time: BookingTimeBucket;
};

export type BookingService = {
  serviceId: string;
  name: string;
  priceAmount: number | null;
  priceMaxAmount: number | null;
  priceCurrency: string | null;
};

export type BookingRequestInput = {
  locationId: number;
  locationSlug: string | null;
  locationName: string;
  name: string;
  email: string;
  phone: string | null;
  timezone: string;
  sourcePath: string | null;
  services: BookingService[];
  preferences: BookingPreference[];
};

export function shouldShowBookingTotal(services: BookingService[]) {
  return !(
    services.length === 1 && services[0]?.priceAmount == null
  );
}

type ParseResult =
  | { ok: true; value: BookingRequestInput }
  | { ok: false; error: string };

export function parseBookingRequest(value: unknown): ParseResult {
  if (!value || typeof value !== "object") {
    return invalid("Enter your appointment details.");
  }

  const payload = value as Record<string, unknown>;
  const locationId =
    typeof payload.locationId === "number" && Number.isSafeInteger(payload.locationId)
      ? payload.locationId
      : Number.NaN;
  const locationSlug = cleanOptionalText(payload.locationSlug, 180);
  const locationName = cleanText(payload.locationName, 240);
  const name = cleanText(payload.name, 120);
  const email = normalizeEmail(payload.email);
  const phone = cleanOptionalText(payload.phone, 40);
  const timezone = cleanText(payload.timezone, 100);
  const sourcePath = cleanOptionalText(payload.sourcePath, 500);

  if (!Number.isSafeInteger(locationId) || locationId <= 0 || !locationName) {
    return invalid("This listing could not be identified. Refresh the page and try again.");
  }
  if (!name) {
    return invalid("Enter your name.");
  }
  if (!email) {
    return invalid("Enter a valid email address.");
  }
  if (phone && !/[0-9]{5}/.test(phone.replace(/\D/g, ""))) {
    return invalid("Enter a valid phone number or leave it blank.");
  }
  if (!timezone) {
    return invalid("Your time zone could not be identified. Refresh the page and try again.");
  }

  if (!Array.isArray(payload.services) || payload.services.length === 0) {
    return invalid("Select at least one treatment.");
  }
  if (payload.services.length > 25) {
    return invalid("You can select up to 25 treatments.");
  }

  const services: BookingService[] = [];
  const uniqueServiceIds = new Set<string>();
  for (const service of payload.services) {
    if (!service || typeof service !== "object") {
      return invalid("One of the selected treatments is invalid.");
    }
    const entry = service as Record<string, unknown>;
    const serviceId = cleanText(entry.serviceId, 180);
    const serviceName = cleanText(entry.name, 300);
    const priceAmount = optionalPrice(entry.priceAmount);
    const priceMaxAmount = optionalPrice(entry.priceMaxAmount);
    const priceCurrency = cleanOptionalText(entry.priceCurrency, 3)?.toUpperCase() || null;
    if (
      !serviceId ||
      !serviceName ||
      uniqueServiceIds.has(serviceId) ||
      priceAmount === undefined ||
      priceMaxAmount === undefined
    ) {
      return invalid("One of the selected treatments is invalid.");
    }
    if (priceMaxAmount != null && priceAmount != null && priceMaxAmount < priceAmount) {
      return invalid("One of the selected treatment prices is invalid.");
    }
    uniqueServiceIds.add(serviceId);
    services.push({
      serviceId,
      name: serviceName,
      priceAmount,
      priceMaxAmount,
      priceCurrency,
    });
  }

  if (
    !Array.isArray(payload.preferences) ||
    payload.preferences.length < 1 ||
    payload.preferences.length > BOOKING_PREFERENCE_COUNT
  ) {
    return invalid("Choose between one and three appointment options.");
  }

  const preferences: BookingPreference[] = [];
  const uniqueOptions = new Set<string>();
  const uniqueDays = new Set<string>();
  const minimumDate = minimumBookingDateValue(new Date(), timezone);
  for (const preference of payload.preferences) {
    if (!preference || typeof preference !== "object") {
      return invalid("Complete each appointment option you add.");
    }
    const entry = preference as Record<string, unknown>;
    const date = cleanText(entry.date, 10);
    const time = cleanText(entry.time, 16);
    if (!date || !time || !DATE_PATTERN.test(date) || !isBookingTimeBucket(time)) {
      return invalid("Complete each appointment option you add.");
    }
    if (date < minimumDate) {
      return invalid("Choose a date at least 48 hours from now.");
    }
    const key = `${date}T${time}`;
    if (uniqueOptions.has(key)) {
      return invalid("Choose different appointment options.");
    }
    if (uniqueDays.has(date)) {
      return invalid("Choose different days for each appointment option.");
    }
    uniqueOptions.add(key);
    uniqueDays.add(date);
    preferences.push({ date, time });
  }

  return {
    ok: true,
    value: {
      locationId,
      locationSlug,
      locationName,
      name,
      email,
      phone,
      timezone,
      sourcePath,
      services,
      preferences,
    },
  };
}

export function minimumBookingDateValue(now = new Date(), timezone = "UTC") {
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let day = now.getUTCDate();

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(now);
    year = Number(parts.find((part) => part.type === "year")?.value);
    month = Number(parts.find((part) => part.type === "month")?.value) - 1;
    day = Number(parts.find((part) => part.type === "day")?.value);
  } catch {
    // Fall back to UTC if a client sends an unrecognized IANA timezone.
  }

  const minimum = new Date(Date.UTC(year, month, day + BOOKING_MIN_LEAD_DAYS));
  return minimum.toISOString().slice(0, 10);
}

function isBookingTimeBucket(value: string): value is BookingTimeBucket {
  return (BOOKING_TIME_BUCKETS as readonly string[]).includes(value);
}

function optionalPrice(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function normalizeEmail(value: unknown) {
  const email = cleanText(value, 254)?.toLowerCase() || null;
  return email && EMAIL_PATTERN.test(email) ? email : null;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (value == null || value === "") {
    return null;
  }
  return cleanText(value, maxLength);
}

function invalid(error: string): ParseResult {
  return { ok: false, error };
}
