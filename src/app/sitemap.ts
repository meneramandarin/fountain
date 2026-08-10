import type { MetadataRoute } from "next";
import { fixedTreatmentLocationPages } from "@/lib/fixed-treatment-location-pages";
import { editorialArticles, editorialArticlePath } from "@/lib/editorial-articles";
import { getSitemapLocations, type SitemapLocation } from "@/lib/queries";
import { getTreatmentHubs, type TreatmentHub } from "@/lib/treatment-hubs";
import { siteUrl } from "@/lib/site";

// Directory records change throughout the day. Keep retired listings from
// lingering in the sitemap for a full day after a lifecycle update.
export const revalidate = 3_600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [hubResult, locationResult] = await Promise.allSettled([
    getTreatmentHubs(),
    getSitemapLocations(),
  ]);

  if (hubResult.status === "rejected") {
    console.error("[sitemap] treatment catalog failed", hubResult.reason);
  }
  if (locationResult.status === "rejected") {
    console.error("[sitemap] location catalog failed", locationResult.reason);
  }

  return buildSitemap(
    hubResult.status === "fulfilled" ? hubResult.value : [],
    locationResult.status === "fulfilled" ? locationResult.value : [],
  );
}

export function buildSitemap(
  hubs: TreatmentHub[] = [],
  locations: SitemapLocation[] = [],
): MetadataRoute.Sitemap {
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
      url: new URL("/journal", siteUrl).toString(),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: new URL("/directory", siteUrl).toString(),
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: new URL("/privacy-policy", siteUrl).toString(),
      changeFrequency: "yearly" as const,
      priority: 0.2,
    },
    {
      url: new URL("/terms-of-service", siteUrl).toString(),
      changeFrequency: "yearly" as const,
      priority: 0.2,
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
    ...locations.map((location) => ({
      url: new URL(`/directory/locations/${location.slug}`, siteUrl).toString(),
      ...(location.updated_at ? { lastModified: location.updated_at } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
