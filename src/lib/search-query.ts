/**
 * Normalize only spelling and formatting differences that cannot change
 * treatment intent. Semantic synonyms live in treatment_synonyms instead.
 */
export function normalizeTreatmentSearchTerm(value?: string | null) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[™®©℠]/gu, " ")
    .toLocaleLowerCase("en-US")
    .replace(/&/gu, " and ")
    .replace(/\+/gu, " plus ")
    .replace(/([\p{L}])([\p{N}])/gu, "$1 $2")
    .replace(/([\p{N}])([\p{L}])/gu, "$1 $2")
    .replace(/\bintravenous\b/gu, "iv")
    .replace(/\bmagnetic resonance imaging\b/gu, "mri")
    .replace(/\bmris\b/gu, "mri")
    .replace(/\btherapies\b/gu, "therapy")
    .replace(/\binfusions\b/gu, "infusion")
    .replace(/\binjections\b/gu, "injection")
    .replace(/\btreatments\b/gu, "treatment")
    .replace(/\bscans\b/gu, "scan")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
