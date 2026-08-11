import { LicenseVerificationBadge } from "@/components/license-verification-badge";

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

  return (
    <LicenseVerificationBadge
      accessibleLabel={compact ? accessibleLabel : `${accessibleLabel}. View the official license record.`}
      compact={compact}
      href={verification.board_source_url}
      label="Verified Clinician"
      title="Clinician license verified"
    />
  );
}
