import type { MetadataRoute } from "next";
import { fixedTreatmentLocationPages } from "@/lib/fixed-treatment-location-pages";
import { editorialArticles, editorialArticlePath } from "@/lib/editorial-articles";
import { legalDocuments } from "@/lib/legal-documents";
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
  return [
    {
      url: new URL("/", siteUrl).toString(),
    },
    {
      url: new URL("/treatments", siteUrl).toString(),
    },
    {
      url: new URL("/journal", siteUrl).toString(),
    },
    {
      url: new URL("/directory", siteUrl).toString(),
    },
    ...legalDocuments.map((document) => ({
      url: new URL(`/${document.slug}`, siteUrl).toString(),
      lastModified: document.effectiveDate,
    })),
    ...editorialArticles.map((article) => ({
      url: new URL(editorialArticlePath(article.slug), siteUrl).toString(),
      lastModified: article.updated,
    })),
    ...hubs.filter((hub) => hub.totalCities > 0).map((hub) => ({
      url: new URL(hub.href, siteUrl).toString(),
    })),
    ...fixedTreatmentLocationPages.map((page) => ({
      url: new URL(page.href, siteUrl).toString(),
    })),
    ...locations.map((location) => ({
      url: new URL(`/directory/locations/${location.slug}`, siteUrl).toString(),
      ...(location.updated_at ? { lastModified: location.updated_at } : {}),
    })),
  ];
}
