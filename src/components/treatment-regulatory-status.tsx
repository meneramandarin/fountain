"use client";

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import {
  treatmentFdaRegulatoryStatusCopy,
  visibleTreatmentFdaMenuStatus,
  visibleTreatmentFdaStatus,
  type TreatmentFdaRegulatoryStatus,
} from "@/lib/treatment-regulatory-status";
import { treatmentHref } from "@/lib/treatment-pages";

const toneIcon = {
  positive: ShieldCheck,
  caution: ShieldAlert,
  neutral: ShieldQuestion,
};

export function TreatmentRegulatoryStatus({
  status,
  treatmentName,
  variant = "page",
}: {
  status: TreatmentFdaRegulatoryStatus | null | undefined;
  treatmentName: string;
  variant?: "page" | "menu";
}) {
  const visibleStatus = variant === "menu"
    ? visibleTreatmentFdaMenuStatus(status)
    : visibleTreatmentFdaStatus(status);
  if (!visibleStatus) return null;
  const copy = treatmentFdaRegulatoryStatusCopy[visibleStatus];

  if (variant === "menu") {
    return (
      <Link className="clinic-treatment-regulatory-status" href={treatmentHref({ name: treatmentName })}>
        {copy.menu}
      </Link>
    );
  }

  const Icon = toneIcon[copy.tone];

  return (
    <div className="treatment-regulatory-status">
      <a
        className="treatment-badge"
        data-tone={copy.tone}
        href={copy.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        <Icon size={15} aria-hidden="true" />
        <span>{copy.heading}</span>
      </a>
    </div>
  );
}
