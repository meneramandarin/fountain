import type { Metadata } from "next";
import { DirectoryShell, type DirectoryState, type SearchPayload } from "@/components/directory-shell";
import { directoryParamsFromState, directoryStateFromSearchParams } from "@/lib/directory-search-state";
import { searchLocations } from "@/lib/queries";
import { ogImage, siteDescription } from "@/lib/site";
import { redirect } from "next/navigation";

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
  if (value(params, "kind") === "practitioners") {
    redirect(directoryHrefWithoutPractitionerKind(params));
  }
  const initialState = directoryStateFromSearchParams(params);
  const initialParams = directoryParamsFromState(initialState);
  const initialPayload = await searchLocations(initialParams, initialState.page);
  return (
    <DirectoryShell
      key={stateKey(initialState)}
      initialPayload={initialPayload as SearchPayload}
      initialState={initialState}
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
