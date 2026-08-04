import type { Metadata } from "next";
import { DirectoryShell, type DirectoryState, type SearchPayload } from "@/components/directory-shell";
import { directoryParamsFromState, directoryStateFromSearchParams } from "@/lib/directory-search-state";
import { getTreatmentTrackingContextById, searchLocations } from "@/lib/queries";
import { ogImage, siteDescription } from "@/lib/site";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const baseMetadata: Metadata = {
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

export async function generateMetadata({ searchParams }: DirectoryPageProps): Promise<Metadata> {
  const params = await searchParams;
  const hasSearchParams = Object.values(params).some((raw) =>
    (Array.isArray(raw) ? raw : [raw]).some((item) => Boolean(item)),
  );
  return hasSearchParams
    ? { ...baseMetadata, robots: { index: false, follow: true } }
    : { ...baseMetadata, robots: { index: true, follow: true } };
}

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  const params = await searchParams;
  if (value(params, "kind") === "practitioners") {
    redirect(directoryHrefWithoutPractitionerKind(params));
  }
  const initialState = directoryStateFromSearchParams(params);
  const initialParams = directoryParamsFromState(initialState);
  const treatmentId = initialState.treatment_ids.length === 1
    ? Number.parseInt(initialState.treatment_ids[0], 10)
    : NaN;
  const [initialPayload, initialTreatment] = await Promise.all([
    searchLocations(initialParams, initialState.page),
    Number.isFinite(treatmentId) ? getTreatmentTrackingContextById(treatmentId) : null,
  ]);
  return (
    <DirectoryShell
      key={stateKey(initialState)}
      initialPayload={initialPayload as SearchPayload}
      initialState={initialState}
      initialTreatmentLabel={initialTreatment?.name}
      initialTreatmentCategory={initialTreatment?.category}
    />
  );
}

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}

function directoryHrefWithoutPractitionerKind(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (key === "kind") {
      continue;
    }
    for (const item of Array.isArray(raw) ? raw : [raw]) {
      if (item) {
        query.append(key, item);
      }
    }
  }
  const suffix = query.toString();
  return suffix ? `/directory?${suffix}` : "/directory";
}

function stateKey(state: DirectoryState) {
  return JSON.stringify([
    state.kind,
    state.q,
    state.country,
    state.locality,
    state.city_label,
    state.city_country,
    state.place_type,
    state.city_lat,
    state.city_lng,
    state.treatment_ids.join(","),
    state.entity_type,
    state.care_model,
    state.page,
  ]);
}
