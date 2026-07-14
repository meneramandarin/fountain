import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateMetadata(): Metadata {
  return {
    robots: { index: false, follow: false },
  };
}

export default function PractitionerDetailRoute() {
  notFound();
}
