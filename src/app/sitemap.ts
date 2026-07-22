import type { MetadataRoute } from "next";
import { editorialArticles } from "@/lib/editorial-articles";
import { legalDocuments } from "@/lib/legal-documents";
import { getTreatmentHubs, type TreatmentHub } from "@/lib/treatment-hubs";
import { siteUrl } from "@/lib/site";

export const revalidate = 86_400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let hubs: TreatmentHub[] = [];
  try {
    hubs = await getTreatmentHubs();
  } catch (error) {
    console.error("[sitemap] treatment catalog failed", error);
  }

  return buildSitemap(hubs);
}

export function buildSitemap(hubs: TreatmentHub[] = []): MetadataRoute.Sitemap {
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
    ...hubs.flatMap((hub) => hub.cities.filter((city) => city.indexable).map((city) => ({
      url: new URL(city.href, siteUrl).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))),
    ...hubs.filter((hub) => hub.totalCities > 0).map((hub) => ({
      url: new URL(hub.href, siteUrl).toString(),
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
