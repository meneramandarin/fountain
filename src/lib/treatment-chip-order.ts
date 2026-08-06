export type TreatmentChipWithId = {
  id: number;
  name: string;
  domain: string;
};

export type TreatmentChip = Omit<TreatmentChipWithId, "id">;

export function orderTreatmentChips(
  treatments: TreatmentChipWithId[],
  preferredTreatmentIds: readonly number[] = [],
  limit = 6,
): TreatmentChip[] {
  const preferredRanks = new Map<number, number>();
  for (const treatmentId of preferredTreatmentIds) {
    if (!preferredRanks.has(treatmentId)) {
      preferredRanks.set(treatmentId, preferredRanks.size);
    }
  }

  return treatments
    .map((treatment, index) => ({
      treatment,
      index,
      rank: preferredRanks.get(treatment.id),
    }))
    .sort((left, right) => {
      const leftRank = left.rank ?? Number.POSITIVE_INFINITY;
      const rightRank = right.rank ?? Number.POSITIVE_INFINITY;
      return leftRank - rightRank || left.index - right.index;
    })
    .slice(0, limit)
    .map(({ treatment }) => ({ name: treatment.name, domain: treatment.domain }));
}
