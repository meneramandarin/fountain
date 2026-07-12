export type OfferingLabelInput = {
  raw_name?: string | null;
  treatment?: string | null;
  /** Legacy input is accepted but intentionally ignored by the UI. */
  treatment_display_mode?: string | null;
};

/**
 * Clinic wording is the only consumer-facing offering label. The canonical
 * treatment remains attached in the database for search and discovery, but
 * is not repeated as UI copy (for example, Dysport stays discoverable via
 * Botox without rendering "Botox" beneath it).
 */
export function getOfferingLabels(offering: OfferingLabelInput) {
  const rawName = offering.raw_name?.trim();
  const treatment = offering.treatment?.trim();
  const primary = capitalizeOfferingLabel(rawName || treatment || "Offering");
  return { primary, secondary: null };
}

function capitalizeOfferingLabel(value: string) {
  const [first, ...rest] = Array.from(value);
  return first ? `${first.toLocaleUpperCase()}${rest.join("")}` : value;
}
