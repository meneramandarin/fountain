import type { MetadataRoute } from "next";
import { fixedTreatmentLocationPages } from "@/lib/fixed-treatment-location-pages";
import { editorialArticles, editorialArticlePath } from "@/lib/editorial-articles";
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
      url: new URL("/treatments", siteUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    },
    {
      url: new URL("/blog", siteUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    ...editorialArticles.map((article) => ({
      url: new URL(editorialArticlePath(article.slug), siteUrl).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...hubs.filter((hub) => hub.totalCities > 0).map((hub) => ({
      url: new URL(hub.href, siteUrl).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.75,
    })),
    ...fixedTreatmentLocationPages.map((page) => ({
      url: new URL(page.href, siteUrl).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}

