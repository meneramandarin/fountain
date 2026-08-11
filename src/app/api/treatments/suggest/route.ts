import { getTreatmentCatalog } from "@/lib/queries";
import { hyperbaricOxygenTherapy } from "@/lib/treatment-pages";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultSuggestions = [
  { label: hyperbaricOxygenTherapy.name, canonicalName: hyperbaricOxygenTherapy.name },
  { label: "DEXA", canonicalName: "DEXA scan" },
  { label: "VO2Max", canonicalName: "VO2 max test" },
  { label: "IV Therapy", canonicalName: "IV Infusions" },
  { label: "Full-body MRI", canonicalName: "Full-body MRI" },
];

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim().toLocaleLowerCase("en-US") || "";
  const treatments = await getTreatmentCatalog(0);
  const treatmentsByName = new Map(treatments.map((treatment) => [treatment.name, treatment]));
  const curatedSuggestions = defaultSuggestions.flatMap(({ label, canonicalName }) => {
    const treatment = treatmentsByName.get(canonicalName) || (
      canonicalName === hyperbaricOxygenTherapy.name
        ? treatmentsByName.get(hyperbaricOxygenTherapy.legacyName)
        : undefined
    );
    return treatment ? [{
      id: treatment.id,
      label,
      category: treatment.category,
      locationCount: treatment.locationCount,
    }] : [];
  });

  if (!query) {
    return NextResponse.json({ suggestions: curatedSuggestions });
  }

  const matchingAliases = curatedSuggestions.filter((suggestion) =>
    suggestion.label.toLocaleLowerCase("en-US").includes(query),
  );
  const matchedIds = new Set(matchingAliases.map((suggestion) => suggestion.id));
  const matchingTreatments = treatments
    .filter((treatment) => treatment.name.toLocaleLowerCase("en-US").includes(query))
    .filter((treatment) => !matchedIds.has(treatment.id))
    .sort((a, b) => {
      const aName = a.name.toLocaleLowerCase("en-US");
      const bName = b.name.toLocaleLowerCase("en-US");
      const aStartsWithQuery = aName.startsWith(query);
      const bStartsWithQuery = bName.startsWith(query);
      if (aStartsWithQuery !== bStartsWithQuery) {
        return aStartsWithQuery ? -1 : 1;
      }
      return b.locationCount - a.locationCount || a.name.localeCompare(b.name);
    })
    .map((treatment) => ({
      id: treatment.id,
      label: treatment.name,
      category: treatment.category,
      locationCount: treatment.locationCount,
    }));
  const suggestions = [...matchingAliases, ...matchingTreatments].slice(0, 8);

  return NextResponse.json({ suggestions });
}
