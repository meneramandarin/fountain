export const siteName = "Fountain";

export const siteDescription =
  "Discover longevity clinics, doctors, treatments, and programs in one searchable directory.";

export const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"),
);

export const ogImage = {
  url: "/fountain%20-%20OG.png",
  width: 2928,
  height: 1664,
  alt: "Fountain longevity marketplace preview",
};
