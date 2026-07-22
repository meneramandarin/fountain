import type { MetadataRoute } from "next";
import { fixedTreatmentLocationPages } from "@/lib/fixed-treatment-location-pages";
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
      changeFrequency: "weekly",
      priority: 0.85,
    },
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
