import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryDetailPage, type LocationDetailRecord } from "@/components/directory-detail-page";
import type { ImpossibleHealthReport, Provider } from "../../review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = { title: "Candidate preview", robots: { index: false, follow: false } };

export default async function CandidatePreviewPage({ params }: { params: Promise<{ citySlug: string; providerSlug: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { citySlug, providerSlug } = await params;
  const report = await loadReport();
  const provider = report.providers.find((item) => item.source.city_slug === citySlug && item.source.provider_slug === providerSlug);
  if (!provider) notFound();
  const enrichment = await loadEnrichment(provider.source.source_url);
  if (!enrichment) notFound();

  return <DirectoryDetailPage kind="locations" data={asPreviewRecord(provider, enrichment)} showBackLink backHref="/review/impossible-health" />;
}

async function loadReport(): Promise<ImpossibleHealthReport> {
  const file = path.join(process.cwd(), "docs", "runs", "impossible-health-prospecting-20260713.json");
  return JSON.parse(await readFile(file, "utf8")) as ImpossibleHealthReport;
}

function asPreviewRecord(provider: Provider, enrichment: CandidateEnrichmentRecord | null): LocationDetailRecord {
  return {
    id: stablePreviewId(provider.source.source_url),
    slug: provider.source.provider_slug,
    name: provider.source.name,
    locality: provider.source.city,
    country_code: provider.source.country_code,
    address: enrichment?.contact.address || provider.source.address,
    phone: enrichment?.contact.phone || provider.source.phone,
    email: enrichment?.contact.email || null,
    website: enrichment?.contact.website || provider.source.website,
    external_website_href: enrichment?.contact.website || provider.source.website,
    offerings: enrichment?.offerings.length
      ? enrichment.offerings.map((offering) => ({ ...offering, treatment: offering.raw_name, domain: "impossible-health" }))
      : provider.source.services.map((raw_name) => ({ raw_name, treatment: raw_name, domain: "impossible-health" })),
    tags: [
      { facet: "source", value: "Impossible Health candidate" },
      { facet: "verification", value: provider.google ? "Google Places enriched" : "Google Places unresolved" },
    ],
  };
}

type CandidateEnrichmentRecord = {
  source_url: string;
  contact: { address?: string | null; phone?: string | null; email?: string | null; website?: string | null };
  offerings: Array<{
    raw_name: string;
    price_amount: number;
    price_max_amount: number;
    price_currency: string;
    price_context?: string | null;
  }>;
};

async function loadEnrichment(sourceUrl: string): Promise<CandidateEnrichmentRecord | null> {
  const file = path.join(process.cwd(), "docs", "runs", "impossible-health-candidate-enrichment-20260713.json");
  try {
    const data = JSON.parse(await readFile(file, "utf8")) as { records?: CandidateEnrichmentRecord[] };
    return data.records?.find((record) => record.source_url === sourceUrl) || null;
  } catch {
    return null;
  }
}

function stablePreviewId(value: string) {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) | 0;
  return Math.abs(hash) || 1;
}
