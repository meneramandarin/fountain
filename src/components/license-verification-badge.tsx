import { BadgeCheck } from "lucide-react";

export function LicenseVerificationBadge({
  accessibleLabel,
  compact = false,
  href,
  label,
  title,
}: {
  accessibleLabel: string;
  compact?: boolean;
  href: string;
  label: string;
  title: string;
}) {
  if (compact) {
    return (
      <span className="clinician-license-icon" aria-label={accessibleLabel} title={title}>
        <BadgeCheck size={17} aria-hidden="true" />
      </span>
    );
  }

  return (
    <a
      className="clinician-license-badge"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={accessibleLabel}
    >
      <BadgeCheck size={18} aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}
