import type { Metadata } from "next";
import { DirectoryShell, type DirectoryState } from "@/components/directory-shell";
import { getFacets, getStats, MAX_TREATMENT_FILTERS } from "@/lib/queries";
import { ogImage, siteDescription } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Longevity Directory",
  description: siteDescription,
  alternates: {
    canonical: "/directory",
  },
  openGraph: {
    title: "Longevity Directory | Fountain",
    description: siteDescription,
    url: "/directory",
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Longevity Directory | Fountain",
    description: siteDescription,
    images: [ogImage.url],
  },
};

type DirectoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  const params = await searchParams;
  const [facets, stats] = await Promise.all([getFacets(), getStats()]);
  return (
    <DirectoryShell
      initialFacets={facets}
      initialStats={stats}
      initialState={stateFromSearchParams(params)}
    />
  );
}

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}

function stateFromSearchParams(params: Record<string, string | string[] | undefined>): DirectoryState {
  return {
    kind: value(params, "kind") === "practitioners" ? "practitioners" : "locations",
    q: value(params, "q"),
    country: value(params, "country"),
    locality: value(params, "locality"),
    treatment_ids: value(params, "treatment_id")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, MAX_TREATMENT_FILTERS),
    entity_type: value(params, "entity_type"),
    care_model: value(params, "care_model"),
    page: Math.max(0, Number.parseInt(value(params, "page") || "0", 10) || 0),
  };
}
