import type { MetadataRoute } from "next";
import {
  discoveryCrawlerUserAgents,
  trainingAndCollectionCrawlerUserAgents,
} from "@/lib/crawler-policy";
import { siteUrl } from "@/lib/site";

const crawlExclusions = [
  "/api/",
  "/docs/",
  "/go/",
  "/*?*_rsc=",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...discoveryCrawlerUserAgents.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: crawlExclusions,
      })),
      ...trainingAndCollectionCrawlerUserAgents.map((userAgent) => ({
        userAgent,
        disallow: "/",
      })),
      { userAgent: "SemrushBot", disallow: "/" },
      { userAgent: "AhrefsBot", disallow: "/" },
      { userAgent: "MJ12bot", disallow: "/" },
      { userAgent: "DotBot", disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: crawlExclusions,
        crawlDelay: 10,
      },
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
