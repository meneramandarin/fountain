import { getTreatmentCatalog, getTreatmentSynonyms } from "@/lib/queries";
import { normalizeTreatmentSearchTerm } from "@/lib/search-query";
import { hyperbaricOxygenTherapy } from "@/lib/treatment-pages";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultSuggestions = [
  { label: hyperbaricOxygenTherapy.name, canonicalName: hyperbaricOxygenTherapy.name },
  { label: "DEXA", canonicalName: "DEXA scan" },
  { label: "VO2Max", canonicalName: "VO2 max test" },
  { label: "IV Therapy", canonicalName: "IV Infusions" },
  { label: "MRI", canonicalName: "MRI" },
];

export async function GET(request: NextRequest) {
  const query = normalizeTreatmentSearchTerm(request.nextUrl.searchParams.get("q"));
  const [treatments, synonyms] = await Promise.all([
    getTreatmentCatalog(0),
    getTreatmentSynonyms(),
  ]);
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
    normalizeTreatmentSearchTerm(suggestion.label).includes(query),
  );
  const matchedIds = new Set(matchingAliases.map((suggestion) => suggestion.id));
  const matchingSynonymRows = synonyms
    .filter((synonym) => normalizeTreatmentSearchTerm(synonym.synonym).includes(query))
    .flatMap((synonym) => {
      const treatment = treatments.find((candidate) => candidate.id === synonym.treatmentId);
      return treatment && !matchedIds.has(treatment.id) ? [{
        id: treatment.id,
        label: treatment.name,
        category: treatment.category,
        locationCount: treatment.locationCount,
      }] : [];
    });
  const matchingSynonyms = [...new Map(
    matchingSynonymRows.map((suggestion) => [suggestion.id, suggestion]),
  ).values()];
  for (const suggestion of matchingSynonyms) matchedIds.add(suggestion.id);
  const matchingTreatments = treatments
    .filter((treatment) => normalizeTreatmentSearchTerm(treatment.name).includes(query))
    .filter((treatment) => !matchedIds.has(treatment.id))
    .sort((a, b) => {
      const aName = normalizeTreatmentSearchTerm(a.name);
      const bName = normalizeTreatmentSearchTerm(b.name);
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
  const suggestions = [...matchingAliases, ...matchingSynonyms, ...matchingTreatments].slice(0, 8);

  return NextResponse.json({ suggestions });
}
