export type LegalDocument = {
  slug: string;
  source: string;
  title: string;
  description: string;
  effectiveDate: string;
};

export const legalDocuments: LegalDocument[] = [
  {
    slug: "terms-of-service",
    source: "terms-of-service.md",
    title: "Terms of Service",
    description: "Terms governing use of Fountain.",
    effectiveDate: "2026-07-09",
  },
  {
    slug: "privacy-policy",
    source: "privacy-policy.md",
    title: "Privacy Policy",
    description: "How Fountain collects and uses information.",
    effectiveDate: "2026-07-09",
  },
];

export function getLegalDocument(slug: string) {
  return legalDocuments.find((document) => document.slug === slug);
}
