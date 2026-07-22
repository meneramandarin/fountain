import type { MetadataRoute } from "next";
import { editorialArticles } from "@/lib/editorial-articles";
import { legalDocuments } from "@/lib/legal-documents";
import { getTreatmentHubs } from "@/lib/treatment-hubs";
import { siteUrl } from "@/lib/site";
import {
  pilotTreatmentLocationHref,
  pilotTreatmentLocationPages,
} from "@/lib/treatment-location-pages";
import { treatmentHref, type TreatmentCatalogItem } from "@/lib/treatment-pages";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let treatments: TreatmentCatalogItem[] = [];
  try {
    treatments = (await getTreatmentHubs())
      .filter((hub) => hub.totalCities > 0)
      .map((hub) => ({ ...hub.treatment, href: hub.href }));
  } catch (error) {
    console.error("[sitemap] treatment catalog failed", error);
  }

  return buildSitemap(treatments);
}

export function buildSitemap(treatments: Array<TreatmentCatalogItem & { href?: string }> = []): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: new URL("/", siteUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: new URL("/directory", siteUrl).toString(),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: new URL("/treatments", siteUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    ...editorialArticles.map((article) => ({
      url: new URL(`/${article.slug}`, siteUrl).toString(),
      lastModified: new Date(article.updated),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...pilotTreatmentLocationPages.map((page) => ({
      url: new URL(pilotTreatmentLocationHref(page), siteUrl).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...treatments.map((treatment) => ({
      url: new URL(treatment.href || treatmentHref(treatment), siteUrl).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.75,
    })),
    ...legalDocuments.map((document) => ({
      url: new URL(`/${document.slug}`, siteUrl).toString(),
      lastModified: new Date(document.effectiveDate),
      changeFrequency: "yearly" as const,
      priority: 0.4,
    })),
  ];
}
