export type TreatmentDisplayMode = "raw_only" | "raw_and_canonical" | "canonical_only";

export type OfferingLabelInput = {
  raw_name?: string | null;
  treatment?: string | null;
  treatment_display_mode?: TreatmentDisplayMode | null;
};

/**
 * Clinic wording is the default consumer-facing label. Canonical taxonomy
 * context is visible only when a reviewed presentation rule says it adds
 * meaning (for example, Dysport -> Botox).
 */
export function getOfferingLabels(offering: OfferingLabelInput) {
  const rawName = offering.raw_name?.trim();
  const treatment = offering.treatment?.trim();
  const mode = offering.treatment_display_mode || "raw_only";

  if (mode === "canonical_only") {
    return { primary: capitalizeOfferingLabel(treatment || rawName || "Offering"), secondary: null };
  }

  const primary = capitalizeOfferingLabel(rawName || treatment || "Offering");
  const secondary = mode === "raw_and_canonical"
    && rawName
    && treatment
    && normalizeDisplayLabel(rawName) !== normalizeDisplayLabel(treatment)
    ? treatment
    : null;

  return { primary, secondary };
}

function capitalizeOfferingLabel(value: string) {
  const [first, ...rest] = Array.from(value);
  return first ? `${first.toLocaleUpperCase()}${rest.join("")}` : value;
}

function normalizeDisplayLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .replace(/[™®©℠]/gu, " ")
    .replace(/&/gu, " and ")
    .replace(/\+/gu, " plus ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
