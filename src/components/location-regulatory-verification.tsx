import { LicenseVerificationBadge } from "@/components/license-verification-badge";

export type LocationRegulatoryVerificationData = {
  authority_code: "DHA" | "MOHAP";
  verification_kind: "facility_license" | "health_advertisement_license";
  credential_number: string;
  credential_status: string;
  authority_name: string;
  evidence_level: "regulator_registry" | "first_party_disclosure";
  source_url: string;
  verified_at: string;
};

export function LocationRegulatoryVerification({
  verifications,
  compact = false,
}: {
  verifications?: LocationRegulatoryVerificationData[] | null;
  compact?: boolean;
}) {
  if (!verifications?.length) {
    return null;
  }

  const dha = verifications.find(
    (verification) =>
      verification.authority_code === "DHA" &&
      verification.verification_kind === "facility_license" &&
      verification.evidence_level === "regulator_registry",
  );
  const mohap = verifications.find(
    (verification) =>
      verification.authority_code === "MOHAP" &&
      verification.verification_kind === "health_advertisement_license",
  );

  return (
    <span className="license-verification-group">
      {dha ? (
        <LicenseVerificationBadge
          accessibleLabel={`DHA facility licence ${dha.credential_number} verified in the active Dubai Medical Registry${compact ? "" : ". View the official facility record."}`}
          compact={compact}
          href={dha.source_url}
          label="DHA Licensed"
          title="DHA facility licence verified"
        />
      ) : null}
      {mohap ? (
        <LicenseVerificationBadge
          accessibleLabel={`MOHAP health-advertisement licence ${mohap.credential_number} is disclosed on the facility's official website. This is not a facility licence${compact ? "" : ". View the disclosure."}`}
          compact={compact}
          href={mohap.source_url}
          label="MOHAP Ad Licence"
          title="MOHAP ad licence disclosed"
        />
      ) : null}
    </span>
  );
}
