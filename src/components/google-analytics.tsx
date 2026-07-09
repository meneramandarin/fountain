"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { Suspense, useEffect, useMemo, useSyncExternalStore } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtagInitializedMeasurementId?: string;
    gtag?: (...args: unknown[]) => void;
  }
}

type GoogleAnalyticsProps = {
  measurementId?: string;
};

const productionAnalyticsHost = "fountain.clinic";

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const analyticsEnabled = useSyncExternalStore(subscribeToHostname, isProductionAnalyticsHost, () => false);

  if (!measurementId || !analyticsEnabled) {
    return null;
  }

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Suspense fallback={null}>
        <GoogleAnalyticsPageview measurementId={measurementId} />
      </Suspense>
    </>
  );
}

function subscribeToHostname() {
  return () => {};
}

function isProductionAnalyticsHost() {
  return typeof window !== "undefined" && window.location.hostname === productionAnalyticsHost;
}

function GoogleAnalyticsPageview({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const pagePath = useMemo(() => (search ? `${pathname}?${search}` : pathname), [pathname, search]);

  useEffect(() => {
    if (!measurementId || window.location.hostname !== productionAnalyticsHost) {
      return;
    }

    const gtag = initializeGtag(measurementId);
    gtag("config", measurementId, {
      page_path: pagePath,
      internal_from: searchParams.get("from") || undefined,
    });
  }, [measurementId, pagePath, searchParams]);

  return null;
}

function initializeGtag(measurementId: string): (...args: unknown[]) => void {
  window.dataLayer = window.dataLayer || [];
  const gtag =
    window.gtag ||
    function queuedGtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
  window.gtag = gtag;

  if (window.gtagInitializedMeasurementId === measurementId) {
    return gtag;
  }

  window.gtagInitializedMeasurementId = measurementId;
  gtag("js", new Date());
  gtag("config", measurementId, { send_page_view: false });
  return gtag;
}
