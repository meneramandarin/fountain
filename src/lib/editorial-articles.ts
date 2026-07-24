export type EditorialProviderRail = {
  title: string;
  cardFrom?: string;
  cards?: Array<{
    name: string;
    location: string;
    href: string;
    tags: string[];
    rating?: string;
  }>;
  dynamicTreatmentId?: number;
  dynamicTreatmentIds?: number[];
  dynamicTreatmentNames?: string[];
  dynamicSearchQuery?: string;
  locationSlugs?: string[];
  cta: {
    label: string;
    href: string;
  };
};

export type EditorialArticle = {
  slug: string;
  bodySource: string;
  title: string;
  heroImage: string;
  standfirst: string;
  description: string;
  byline: string;
  published?: string;
  publishedLabel?: string;
  updated: string;
  updatedLabel: string;
  providerRails?: Record<string, EditorialProviderRail>;
};

export const editorialArticles: EditorialArticle[] = [
  {
    slug: "peptide-regulation.html",
    bodySource: "peptide-regulation.html",
    title: "The Grey Market Comes In From the Cold",
    heroImage: "/domains/peptides.webp",
    standfirst:
      "For three years, the peptides half of the longevity world swears by were exiled to a regulatory no-man's-land. This week, a federal advisory panel voted to let most of them back. Here is what actually changes, and what doesn't.",
    description:
      "For three years, the peptides half of the longevity world swears by were exiled to a regulatory no-man's-land. This week, a federal advisory panel voted to let most of them back. Here is what actually changes, and what doesn't.",
    byline: "The Fountain Editors",
    published: "2026-07-01",
    publishedLabel: "1 July 2026",
    updated: "2026-07-24",
    updatedLabel: "24 July 2026",
    providerRails: {
      "peptide-providers": {
        title: "Peptide therapy under medical supervision",
        dynamicTreatmentId: 20,
        dynamicTreatmentNames: ["Peptide therapy"],
        cta: {
          label: "Browse all peptide providers on Fountain →",
          href: "/directory?kind=locations&treatment_id=20",
        },
      },
    },
  },
  {
    slug: "glp1-microdosing.html",
    bodySource: "glp1-microdosing.html",
    title: "The Case for Taking Less",
    heroImage: "/domains/microdosing.png",
    standfirst:
      "The most powerful weight-loss drugs of the decade have spawned an unlikely counter-movement: people deliberately taking a fraction of the dose, chasing something other than weight. Welcome to GLP-1 microdosing, where the promise is large and the evidence is small.",
    description:
      "The most powerful weight-loss drugs of the decade have spawned an unlikely counter-movement: people deliberately taking a fraction of the dose.",
    byline: "The Fountain Editors",
    updated: "2026-07-03",
    updatedLabel: "3 July 2026",
    providerRails: {
      "metabolic-providers": {
        title: "Metabolic & hormone-focused clinics",
        dynamicTreatmentId: 25,
        dynamicTreatmentNames: ["GLP-1 weight management"],
        cta: {
          label: "Browse GLP-1 weight management providers on Fountain →",
          href: "/directory?kind=locations&treatment_id=25",
        },
      },
    },
  },
  {
    slug: "biological-age.html",
    bodySource: "04-biological-age.html",
    title: "Your Biological Age Is a Marketing Number",
    heroImage: "/domains/epigeneticage.jpg",
    standfirst:
      "The finger-prick test says you're seven years younger than your birthday. Take it again next week and the number moves. Here is what epigenetic clocks actually measure, why two of them can disagree by a decade, and how to read the result without being sold to.",
    description:
      "Epigenetic clocks are real tools, but the consumer biological-age number is noisier than the dashboard suggests.",
    byline: "The Fountain Editors",
    updated: "2026-07-07",
    updatedLabel: "7 July 2026",
    providerRails: {
      "biological-age-providers": {
        title: "Biological age & advanced diagnostics",
        cardFrom: "search",
        locationSlugs: [
          "craft-body-scan-nashville",
          "bodyspec-chicago",
          "austin-medical-partners",
          "human-longevity-inc-san-diego-2",
        ],
        dynamicTreatmentNames: ["Epigenetic age clock"],
        cta: {
          label: "Compare biological age providers on Fountain →",
          href: "/directory?kind=locations&treatment_id=5",
        },
      },
    },
  },
  {
    slug: "ovarian-longevity.html",
    bodySource: "ovarian-longevity.html",
    title: "Menopause Is Becoming Optional",
    heroImage: "/domains/ovarian health.jpg",
    standfirst:
      "One surgeon freezes ovarian tissue in your thirties to give it back decades later. One weekly pill may slow the clock without any surgery at all. Both rest on the same radical idea: that the ovary is not just a fertility organ but the pacemaker of how a woman ages.",
    description:
      "One surgeon freezes ovarian tissue in your thirties to give it back decades later. One weekly pill may slow the clock without any surgery at all.",
    byline: "The Fountain Editors",
    updated: "2026-07-07",
    updatedLabel: "7 July 2026",
    providerRails: {
      "ovarian-providers": {
        title: "Ovarian & fertility preservation providers",
        dynamicSearchQuery: "Fertility",
        dynamicTreatmentIds: [9],
        dynamicTreatmentNames: ["Genetic testing"],
        locationSlugs: [
          "no-pauze-new-york",
          "ovealth",
          "riverdale-holistic-center-riverdale-usa",
          "sunfert-international-fertility-centre-selangor",
        ],
        cta: {
          label: "Browse fertility preservation providers on Fountain →",
          href: "/directory?kind=locations&q=Fertility&treatment_id=9",
        },
      },
    },
  },
];

export function getEditorialArticle(slug: string) {
  return editorialArticles.find((article) => article.slug === slug);
}
