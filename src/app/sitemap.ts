import type { MetadataRoute } from "next";
import { editorialArticles } from "@/lib/editorial-articles";
import { legalDocuments } from "@/lib/legal-documents";
import { siteUrl } from "@/lib/site";

export const revalidate = 86_400;

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap();
}

export function buildSitemap(): MetadataRoute.Sitemap {
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
    ...legalDocuments.map((document) => ({
      url: new URL(`/${document.slug}`, siteUrl).toString(),
      lastModified: new Date(document.effectiveDate),
      changeFrequency: "yearly" as const,
      priority: 0.4,
    })),
  ];
}
