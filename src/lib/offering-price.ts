import { formatPrice } from "@/lib/format-price";

export type OfferingPrice = {
  price_amount?: number | null;
  price_max_amount?: number | null;
  price_currency?: string | null;
  price_type?: string | null;
  price_unit?: string | null;
  price_context?: string | null;
  price_audience?: string | null;
};

const UNIT_LABELS: Record<string, string> = {
  minute: "minute", month: "month", package: "package", session: "session",
  unit: "unit", visit: "visit", week: "week",
};

export function formatOfferingPrice(offering: OfferingPrice, countryCode?: string | null) {
  const amount = offering.price_amount;
  const priceType = normalized(offering.price_type);
  if (amount == null || !Number.isFinite(Number(amount))) {
    if (priceType === "free") return "Free";
    if (priceType === "included") return "Included";
    return "Price on request";
  }

  const low = formatPrice(amount, offering.price_currency, countryCode);
  if (!low) return "Price on request";
  const high = formatPrice(offering.price_max_amount, offering.price_currency, countryCode);
  const amountLabel = priceType === "range" && high && Number(offering.price_max_amount) !== Number(amount)
    ? `${low}–${high}`
    : low;
  const qualifier = priceType === "starting_at" ? `Starting at ${amountLabel}` : amountLabel;
  const unit = normalized(offering.price_unit);
  const unitLabel = unit && unit !== "service" ? UNIT_LABELS[unit] : null;
  const audience = normalized(offering.price_audience);
  const audienceLabel = audience === "member" ? "Member price: " : audience === "promo" ? "Promotional price: " : "";
  return `${audienceLabel}${qualifier}${unitLabel ? ` per ${unitLabel}` : ""}`;
}

function normalized(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/gu, "_") || "";
}
