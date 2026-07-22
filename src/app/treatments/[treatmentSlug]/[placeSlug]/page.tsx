import { notFound, permanentRedirect } from "next/navigation";
import {
  directoryTreatmentCityHref,
  getTreatmentCityPage,
  getTreatmentHub,
} from "@/lib/treatment-hubs";

export const dynamic = "force-dynamic";

type TreatmentLocationRouteProps = {
  params: Promise<{ treatmentSlug: string; placeSlug: string }>;
};

export default async function TreatmentLocationPage({ params }: TreatmentLocationRouteProps) {
  const { treatmentSlug, placeSlug } = await params;
  const resolved = await getTreatmentCityPage(treatmentSlug, placeSlug);
  if (resolved) {
    permanentRedirect(directoryTreatmentCityHref(resolved.hub.treatment, resolved.city));
  }

  const hub = await getTreatmentHub(treatmentSlug);
  if (hub) {
    permanentRedirect(hub.href);
  }
  notFound();
}
