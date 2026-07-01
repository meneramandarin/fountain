import { DirectoryShell, type DirectoryState } from "@/components/directory-shell";
import { getFacets, getStats } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DirectoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  const params = await searchParams;
  return (
    <DirectoryShell
      initialFacets={getFacets()}
      initialStats={getStats()}
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
    treatment_id: value(params, "treatment_id"),
    entity_type: value(params, "entity_type"),
    care_model: value(params, "care_model"),
    page: Math.max(0, Number.parseInt(value(params, "page") || "0", 10) || 0),
  };
}
