const COUNTRY_CURRENCIES: Record<string, string> = {
  AE: "AED", AT: "EUR", BE: "EUR", CA: "CAD", DE: "EUR", ES: "EUR",
  FI: "EUR", FR: "EUR", GB: "GBP", GR: "EUR", ID: "IDR", IE: "EUR",
  IT: "EUR", LU: "EUR", NL: "EUR", PT: "EUR", QA: "QAR", UA: "UAH",
  US: "USD",
};

export function formatPrice(
  amount?: number | null,
  currency?: string | null,
  countryCode?: string | null,
) {
  if (amount == null || !Number.isFinite(Number(amount))) return null;

  const value = Number(amount);
  const suppliedCurrency = currency?.trim();
  const inferredCurrency = COUNTRY_CURRENCIES[countryCode?.trim().toUpperCase() || ""];
  const effectiveCurrency = suppliedCurrency || inferredCurrency || "USD";
  const maximumFractionDigits = Number.isInteger(value) ? 0 : 2;

  if (/^[A-Za-z]{3}$/.test(effectiveCurrency)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: effectiveCurrency.toUpperCase(),
      maximumFractionDigits,
    }).format(value);
  }

  const formatted = value.toLocaleString("en-US", { maximumFractionDigits });
  if (/^[^\dA-Za-z\s]+$/.test(effectiveCurrency)) return `${effectiveCurrency}${formatted}`;
  return `${formatted} ${effectiveCurrency}`;
}
