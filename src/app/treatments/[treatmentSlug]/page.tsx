import { notFound, permanentRedirect } from "next/navigation";
import { getTreatmentHub } from "@/lib/treatment-hubs";

export const dynamic = "force-dynamic";

type TreatmentPageProps = {
  params: Promise<{ treatmentSlug: string }>;
};

export default async function TreatmentPage({ params }: TreatmentPageProps) {
  const hub = await getTreatmentHub((await params).treatmentSlug);
  if (!hub) {
    notFound();
  }
  permanentRedirect(hub.href);
}
