export type ClinicClickTreatment = {
  name: string;
  domain: string;
};

export type ClinicClickInput = {
  locationId: number;
  locationSlug?: string | null;
  treatments?: ClinicClickTreatment[];
  treatmentName?: string | null;
  clinicCategory?: string | null;
  clickSurface: string;
  resultPosition?: number | null;
};

export function buildClinicClickParameters(input: ClinicClickInput) {
  const categories = uniqueValues(input.treatments?.map((treatment) => treatment.domain));
  const treatmentNames = uniqueValues(input.treatments?.map((treatment) => treatment.name));
  const clinicCategory = input.clinicCategory?.trim() || categories.join(" | ") || "Uncategorized";
  const treatmentName = input.treatmentName?.trim() || treatmentNames[0] || "Unspecified";

  return {
    location_id: input.locationId,
    location_slug: input.locationSlug?.trim() || String(input.locationId),
    clinic_category: clinicCategory,
    clinic_categories: categories.join(" | ") || clinicCategory,
    treatment_name: treatmentName,
    click_surface: input.clickSurface,
    result_position: input.resultPosition ?? undefined,
  };
}

export function trackClinicClick(input: ClinicClickInput) {
  if (typeof window === "undefined") {
    return;
  }

  window.gtag?.("event", "clinic_clicked", {
    ...buildClinicClickParameters(input),
    source_page: `${window.location.pathname}${window.location.search}`,
    transport_type: "beacon",
  });
}

function uniqueValues(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}
