"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import type { TreatmentExternalData as TreatmentExternalDataRecord } from "@/lib/treatment-external-data";
import { treatmentHref } from "@/lib/treatment-pages";

export function TreatmentExternalData({
  data,
  variant = "page",
}: {
  data: TreatmentExternalDataRecord;
  variant?: "page" | "menu";
}) {
  if (variant === "menu") {
    return (
      <div className="clinic-treatment-source-facts" aria-label={`${data.treatmentName} public source data`}>
        {data.clinicalTrials ? (
          <Link href={treatmentHref({ name: data.treatmentName })}>
            ClinicalTrials.gov&nbsp; {data.clinicalTrials.total.toLocaleString()} related studies
          </Link>
        ) : null}
      </div>
    );
  }

  if (!data.clinicalTrials) return null;
  const { clinicalTrials } = data;
  const updatedAt = clinicalTrials.updatedAt
    ? `Updated ${formatDate(clinicalTrials.updatedAt)}`
    : undefined;

  return (
    <>
      <a
        className="treatment-badge"
        data-tone="neutral"
        href={clinicalTrials.sourceUrl}
        target="_blank"
        rel="noreferrer"
        title={updatedAt}
      >
        <FlaskConical size={15} aria-hidden="true" />
        <span>{clinicalTrials.total.toLocaleString()} clinical trials on ClinicalTrials.gov</span>
        <small>
          {clinicalTrials.recruiting.toLocaleString()} recruiting ·{" "}
          {clinicalTrials.withResults.toLocaleString()} with results
        </small>
      </a>

      {clinicalTrials.records.length ? (
        <details className="treatment-source-records">
          <summary>View {clinicalTrials.records.length} recent study record{clinicalTrials.records.length === 1 ? "" : "s"}</summary>
          <div className="treatment-source-record-grid">
            <section aria-labelledby="clinical-trial-records-heading">
              <h3 id="clinical-trial-records-heading">Recently updated studies</h3>
              <ul>
                {clinicalTrials.records.map((record) => (
                  <li key={record.nctId}>
                    <a href={`https://clinicaltrials.gov/study/${record.nctId}`} target="_blank" rel="noreferrer">
                      <strong>{record.title}</strong>
                      <span>
                        {record.nctId} · {formatEnum(record.status)}
                        {record.phases.length ? ` · ${record.phases.map(formatEnum).join(" / ")}` : ""}
                        {record.enrollment != null ? ` · ${record.enrollment.toLocaleString()} enrolled` : ""}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </details>
      ) : null}
    </>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatEnum(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());
}
