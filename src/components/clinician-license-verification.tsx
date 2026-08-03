import { BadgeCheck } from "lucide-react";

export type ClinicianLicenseVerificationData = {
  practitioner_name: string;
  jurisdiction_code: string;
  license_number: string;
  license_type: string;
  licensing_authority: string;
  license_status: string;
  license_expires_at?: string | null;
  board_source_url: string;
  verified_at: string;
};

export function ClinicianLicenseVerification({
  verification,
  compact = false,
}: {
  verification?: ClinicianLicenseVerificationData | null;
  compact?: boolean;
}) {
  if (!verification) {
    return null;
  }

  const accessibleLabel = `${verification.practitioner_name}'s ${verification.jurisdiction_code} clinician license was verified with ${verification.licensing_authority}`;

  if (compact) {
    return (
      <span className="clinician-license-icon" aria-label={accessibleLabel} title="Clinician license verified">
        <BadgeCheck size={17} aria-hidden="true" />
      </span>
    );
  }

  return (
    <a
      className="clinician-license-badge"
      href={verification.board_source_url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${accessibleLabel}. View the official license record.`}
    >
      <BadgeCheck size={18} aria-hidden="true" />
      <span>Verified Clinician</span>
    </a>
  );
}
