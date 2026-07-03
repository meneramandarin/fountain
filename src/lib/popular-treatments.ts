type TreatmentLike = {
  id: number;
  name: string;
  n: number;
};

const popularTreatmentExclusions = new Set(["Botox", "Dermal fillers", "Med spa", "IV nutrient therapy", "Shockwave therapy"]);

const popularTreatmentLabelOverrides: Record<string, string> = {
  "Hyperbaric oxygen therapy": "HBOT",
};

export function popularTreatmentLabel(name: string) {
  return popularTreatmentLabelOverrides[name] || name;
}

export function getPopularTreatments<Treatment extends TreatmentLike>(treatments: Treatment[], limit = 12) {
  return [...treatments]
    .filter((treatment) => !popularTreatmentExclusions.has(treatment.name))
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}
