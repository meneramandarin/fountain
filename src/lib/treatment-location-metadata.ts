import type { TreatmentSearchPriceSummary } from "@/lib/queries";

type TreatmentLocationDescriptionOptions = {
  total: number;
  treatment: string;
  cityLabel?: string;
  priceSummaries?: readonly TreatmentSearchPriceSummary[];
  preferredCurrency?: string;
};

type TreatmentLocationResultsHeadingOptions = Omit<
  TreatmentLocationDescriptionOptions,
  "treatment"
> & {
  treatmentLabel: string;
};

const treatmentDescriptionLabels: Record<string, string> = {
  "DEXA scan": "DEXA scans",
  "VO2 max test": "VO2 max tests",
  "MRI": "MRI scans",
};

export function treatmentLocationDescription({
  total,
  treatment,
  cityLabel,
  priceSummaries = [],
  preferredCurrency = "USD",
}: TreatmentLocationDescriptionOptions) {
  const treatmentLabel = treatmentDescriptionLabels[treatment] || treatment;
  const location = cityLabel ? ` in ${cityLabel}` : "";
  const base = `Compare ${total.toLocaleString("en-US")} locations for ${treatmentLabel}${location}.`;
  const startingPrice = treatmentStartingPrice(priceSummaries, preferredCurrency);

  return startingPrice
    ? `${base} Treatments starting at ${startingPrice}.`
    : base;
}

export function treatmentLocationResultsHeading({
  total,
  treatmentLabel,
  cityLabel,
  priceSummaries = [],
  preferredCurrency = "USD",
}: TreatmentLocationResultsHeadingOptions) {
  const location = cityLabel ? ` in ${cityLabel}` : "";
  const base = `${treatmentLabel}${location} · ${total.toLocaleString("en-US")} results`;
  const startingPrice = treatmentStartingPrice(priceSummaries, preferredCurrency);

  return startingPrice ? `${base} · starting at ${startingPrice}` : base;
}

export function directorySearchResultsHeading({
  total,
  query,
  priceSummaries = [],
  preferredCurrency = "USD",
}: {
  total: number;
  query: string;
  priceSummaries?: readonly TreatmentSearchPriceSummary[];
  preferredCurrency?: string;
}) {
  const base = `${total.toLocaleString("en-US")} result${total === 1 ? "" : "s"} for ${query}`;
  const startingPrice = treatmentStartingPrice(priceSummaries, preferredCurrency);

  return startingPrice ? `${base} · starting at ${startingPrice}` : base;
}

export function treatmentStartingPrice(
  priceSummaries: readonly TreatmentSearchPriceSummary[] = [],
  preferredCurrency = "USD",
) {
  const price = priceSummaries.find(
    (summary) => summary.currency?.toUpperCase() === preferredCurrency.toUpperCase(),
  );
  return price ? formatCurrency(price.minimum, preferredCurrency) : null;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}
