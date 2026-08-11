"use client";

import { MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ClinicianLicenseVerification,
  type ClinicianLicenseVerificationData,
} from "@/components/clinician-license-verification";
import { trackClinicClick } from "@/lib/clinic-click-analytics";
import { locationHref } from "@/lib/directory-urls";
import { rememberDirectoryReturn } from "@/lib/directory-return-navigation";
import { formatLocationPlace } from "@/lib/location-display";
import { formatPrice } from "@/lib/format-price";

export type DirectoryLocationCardData = {
  id: number;
  slug?: string | null;
  name?: string | null;
  org_name?: string | null;
  locality?: string | null;
  region?: string | null;
  country_code?: string | null;
  country_name?: string | null;
  rating?: number | null;
  review_count?: number | null;
  min_price_amount?: number | null;
  min_price_currency?: string | null;
  treatments?: { name: string; domain: string }[];
  tags?: { facet: string; value: string }[];
  image?: string | null;
  image_kind?: string | null;
  distance_miles?: number | null;
  clinician_license_verification?: ClinicianLicenseVerificationData | null;
};

function imageSource(src: string) {
  return src;
}

export function DirectoryLocationCard({
  result,
  from = "search",
  href,
  clinicCategory,
  treatmentName,
  resultPosition,
  onActiveChange,
}: {
  result: DirectoryLocationCardData;
  from?: string;
  href?: string;
  clinicCategory?: string | null;
  treatmentName?: string | null;
  resultPosition?: number | null;
  onActiveChange?: (id: number | null) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const isContainedGraphic = result.image_kind === "text_graphic" || result.image_kind === "logo";
  const place = formatLocationPlace({
    locality: result.locality,
    region: result.region,
    countryCode: result.country_code,
    countryName: result.country_name,
  });
  const type = result.tags?.find((tag) => tag.facet === "entity_type");
  const mobileService = result.tags?.find(
    (tag) => tag.facet === "care_model" && tag.value.toLowerCase() === "mobile service",
  );
  const price = formatPrice(result.min_price_amount, result.min_price_currency, result.country_code);
  const destinationHref = href || locationHref(result);
  const tagsLine = [
    mobileService ? "Mobile service" : type?.value,
    ...(result.treatments || []).map((treatment) => treatment.name),
  ].filter(Boolean).slice(0, 3).join(" · ");

  return (
    <Link
      className="result-card"
      href={destinationHref}
      prefetch={false}
      onClick={() => {
        if (from === "search") {
          rememberDirectoryReturn(destinationHref);
        }
        trackClinicClick({
          locationId: result.id,
          locationSlug: result.slug,
          treatments: result.treatments,
          clinicCategory,
          treatmentName,
          clickSurface: from || "clinic_card",
          resultPosition,
        });
      }}
      onMouseEnter={() => onActiveChange?.(result.id)}
      onMouseLeave={() => onActiveChange?.(null)}
      onFocus={() => onActiveChange?.(result.id)}
      onBlur={() => onActiveChange?.(null)}
    >
      <span className={`result-photo${isContainedGraphic ? " image-frame-text-graphic" : ""}`}>
        {result.image && !imageFailed ? (
          <>
            {isContainedGraphic ? <Image className="image-frame-backdrop" src={imageSource(result.image)} alt="" fill unoptimized aria-hidden="true" sizes="100vw" /> : null}
            <Image
              className={isContainedGraphic ? "image-frame-content" : undefined}
              src={imageSource(result.image)}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 640px) 92vw, (max-width: 980px) 46vw, 360px"
              onError={() => setImageFailed(true)}
            />
          </>
        ) : (
          <span className="result-photo-fallback listing-image-fallback" aria-hidden="true" />
        )}
        {result.rating ? (
          <span className="result-rating-badge">
            <Star size={11} aria-hidden="true" />
            {Number(result.rating).toFixed(1)}
          </span>
        ) : null}
      </span>
      <span className="result-body">
        <span className="result-main">
          <span className="result-title-row">
            <b>{result.name || result.org_name || "Unnamed location"}</b>
            <ClinicianLicenseVerification verification={result.clinician_license_verification} compact />
          </span>
          <small>
            <MapPin size={13} aria-hidden="true" />
            {place || "Location unavailable"}
          </small>
        </span>
        {tagsLine ? <span className="treatment-row">{tagsLine}</span> : null}
        <span className="result-meta-row">
          {price ? <span>From {price}</span> : null}
          {price && result.review_count ? <i className="result-meta-dot" aria-hidden="true">·</i> : null}
          {result.review_count ? <span className="muted">{Number(result.review_count).toLocaleString()} reviews</span> : null}
          {result.distance_miles != null ? (
            <>
              {price || result.review_count ? <i className="result-meta-dot" aria-hidden="true">·</i> : null}
              <span className="muted">{formatDistance(result.distance_miles)} away</span>
            </>
          ) : null}
          {!price && !result.review_count && result.distance_miles == null ? (
            <span className="muted">View details</span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function formatDistance(distance: number) {
  return `${Math.max(0, Math.round(distance)).toLocaleString()} mi`;
}
