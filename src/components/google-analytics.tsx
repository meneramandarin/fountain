"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type GoogleAnalyticsPageviewProps = {
  measurementId?: string;
};

export function GoogleAnalyticsPageview({ measurementId }: GoogleAnalyticsPageviewProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!measurementId || !window.gtag) {
      return;
    }

    const query = searchParams.toString();
    window.gtag("config", measurementId, {
      page_path: query ? `${pathname}?${query}` : pathname,
      internal_from: searchParams.get("from") || undefined,
    });
  }, [measurementId, pathname, searchParams]);

  return null;
}
