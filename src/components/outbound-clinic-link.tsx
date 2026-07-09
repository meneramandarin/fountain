"use client";

import type { ReactNode } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type OutboundClinicLinkProps = {
  href: string;
  locationId: number;
  locationSlug?: string | null;
  className?: string;
  children: ReactNode;
};

export function OutboundClinicLink({ href, locationId, locationSlug, className, children }: OutboundClinicLinkProps) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener"
      onClick={() => {
        window.gtag?.("event", "outbound_click", {
          location_id: locationId,
          location_slug: locationSlug || String(locationId),
          source_page: window.location.pathname,
        });
      }}
    >
      {children}
    </a>
  );
}
