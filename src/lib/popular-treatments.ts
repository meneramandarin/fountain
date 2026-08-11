import { hyperbaricOxygenTherapy } from "@/lib/treatment-pages";

type TreatmentLike = {
  id: number;
  name: string;
  n: number;
};

const popularTreatmentExclusions = new Set(["Botox", "Dermal fillers", "Med spa", "IV nutrient therapy", "Shockwave therapy"]);

export function popularTreatmentLabel(name: string) {
  return name === hyperbaricOxygenTherapy.legacyName ? hyperbaricOxygenTherapy.name : name;
}

export function getPopularTreatments<Treatment extends TreatmentLike>(treatments: Treatment[], limit = 12) {
  return [...treatments]
    .filter((treatment) => !popularTreatmentExclusions.has(treatment.name))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}
