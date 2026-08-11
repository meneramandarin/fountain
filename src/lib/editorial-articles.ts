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

export const editorialBasePath = "/journal";

export function editorialArticlePath(slug: string) {
  return `${editorialBasePath}/${slug}`;
}

export const editorialArticles: EditorialArticle[] = [
  {
    slug: "clinic-spa-merge.html",
    bodySource: "clinic-spa-merge.html",
    title: "The Clinic and the Spa Are Merging",
    heroImage: "/domains/aman-japan-longevity.jpg",
    standfirst:
      "The same address now offers a hydrafacial, a testosterone panel, a GLP-1 refill and a vial of your own spun blood. It looks like a category error. It is closer to a homecoming.",
    description:
      "Facials, testosterone, GLP-1s, PRP and bloodwork now share an address. Where beauty ends and medicine begins is a sharper line than the décor suggests.",
    byline: "The Fountain Editors",
    published: "2026-08-08",
    publishedLabel: "8 August 2026",
    updated: "2026-08-08",
    updatedLabel: "8 August 2026",
    providerRails: {
      "clinic-spa-merge-clinics": {
        title: "Clinics that do both",
        locationSlugs: [
          "ubliss-medical-aesthetics-med-spa-usa",
          "juventee-fort-lee",
          "skin-vitality-society-amarillo",
          "neuage-health-and-wellness-ladue-st-louis",
        ],
        cta: {
          label: "Browse med spas on Fountain",
          href: "/directory?kind=locations&treatment_id=38",
        },
      },
    },
  },
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
          label: "Browse all peptide providers on Fountain",
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
          label: "Browse GLP-1 weight management providers on Fountain",
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
    updated: "2026-08-10",
    updatedLabel: "10 August 2026",
    providerRails: {
      "biological-age-providers": {
        title: "Biological age tests",
        cardFrom: "search",
        locationSlugs: [
          "elysium-index-biological-age-test",
          "mydnage-blood-biological-age-test",
          "trudiagnostic",
          "trume-labs-truage-explorer",
          "agemeter-functional-biological-age-platform",
          "glycanage-biological-age-test",
          "edifice-health-iage-inflammatory-age-test",
        ],
        dynamicTreatmentNames: ["Epigenetic age clock"],
        cta: {
          label: "Compare biological age providers on Fountain",
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
          label: "Browse fertility preservation providers on Fountain",
          href: "/directory?kind=locations&q=Fertility&treatment_id=9",
        },
      },
    },
  },
  {
    slug: "healthspan-vs-lifespan.html",
    bodySource: "healthspan-vs-lifespan.html",
    title: "The Ten Years Nobody Plans For",
    heroImage: "/domains/Biologicalage.avif",
    standfirst:
      "Lifespan tells you how many years you get. Healthspan tells you how many of those years are actually yours. In the United States the two numbers are drifting apart by more than a decade, and closing that gap, not simply extending the first number, is what a growing wing of functional medicine is built to do.",
    description:
      "Lifespan and healthspan are drifting apart by more than a decade in the US. Here is what the research says actually closes the gap, and how to find a functional medicine clinic built around doing it.",
    byline: "The Fountain Editors",
    updated: "2026-08-05",
    updatedLabel: "5 August 2026",
    providerRails: {
      "functional-health-providers": {
        title: "Functional medicine & longevity-focused clinics",
        dynamicTreatmentId: 43,
        dynamicTreatmentNames: ["Functional medicine"],
        cta: {
          label: "Browse functional medicine providers on Fountain",
          href: "/directory?kind=locations&treatment_id=43",
        },
      },
    },
  },
  {
    slug: "occult-longevity-treatments.html",
    bodySource: "occult-longevity-treatments.html",
    title: "The Most Occult Longevity Treatments Currently Available",
    heroImage: "/domains/longevitytreatments.png",
    standfirst:
      "Longevity medicine has a far-end menu of high-cost, low-certainty procedures that can look compelling and strange at the same time. Here is what this frontier looks like from the clinic side, and where to treat it as research rather than a shortcut.",
    description:
      "A guided look at the rare, high-variance longevity procedures clinics are offering now, and how to decide what is real science, what is theater, and who should be accountable if you do it.",
    byline: "The Fountain Editors",
    published: "2026-08-08",
    publishedLabel: "8 August 2026",
    updated: "2026-08-08",
    updatedLabel: "8 August 2026",
    providerRails: {
      "occult-longevity-clinics": {
        title: "Where the frontier is practiced openly",
        locationSlugs: [
          "humanaut-health-austin-2",
          "stem-cells-specialist-ny-new-york-city",
          "holistic-bio-spa-puerto-vallarta",
          "miskawaan-health-group-bangkok",
        ],
        cta: {
          label: "Browse all treatments on Fountain",
          href: "/treatments",
        },
      },
    },
  },
];

export function getEditorialArticle(slug: string) {
  return editorialArticles.find((article) => article.slug === slug);
}
