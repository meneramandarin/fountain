"use client";

import { Building2, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { locationHref } from "@/lib/directory-urls";
import { formatLocationPlace } from "@/lib/location-display";

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
};

function imageSource(src: string) {
  return src;
}

function formatPrice(amount?: number | null, currency?: string | null) {
  if (amount == null || !Number.isFinite(Number(amount))) {
    return null;
  }

  const value = Number(amount);
  const trimmedCurrency = currency?.trim();
  const maximumFractionDigits = Number.isInteger(value) ? 0 : 2;

  if (trimmedCurrency && /^[A-Z]{3}$/.test(trimmedCurrency)) {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: trimmedCurrency,
      maximumFractionDigits,
    }).format(value);
  }

  const formatted = value.toLocaleString("en", { maximumFractionDigits });
  if (!trimmedCurrency) {
    return formatted;
  }
  if (/^[^\dA-Za-z\s]+$/.test(trimmedCurrency)) {
    return `${trimmedCurrency}${formatted}`;
  }
  return `${formatted} ${trimmedCurrency}`;
}

export function DirectoryLocationCard({
  result,
  from = "search",
  onActiveChange,
}: {
  result: DirectoryLocationCardData;
  from?: string;
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
  const price = formatPrice(result.min_price_amount, result.min_price_currency);

  return (
    <Link
      className="result-card"
      href={`${locationHref(result)}?from=${encodeURIComponent(from)}`}
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
          <span className="result-photo-fallback" aria-hidden="true">
            <Building2 size={26} aria-hidden="true" />
          </span>
        )}
        {result.rating ? (
          <span className="result-rating-badge">
            <Star size={12} aria-hidden="true" />
            {Number(result.rating).toFixed(1)}
          </span>
        ) : null}
        {result.treatments?.length ? (
          <span className="result-photo-tags" aria-hidden="true">
            {result.treatments.slice(0, 3).map((treatment) => (
              <span key={`${result.id}-photo-${treatment.name}`}>{treatment.name}</span>
            ))}
          </span>
        ) : null}
      </span>
      <span className="result-body">
        <span className="result-main">
          <b>{result.name || result.org_name || "Unnamed location"}</b>
          <small>
            <MapPin size={14} aria-hidden="true" />
            {place || "Location unavailable"}
          </small>
        </span>
        <span className="result-side">
          {type ? <em>{type.value}</em> : null}
          {price ? <small>From {price}</small> : null}
          {result.review_count ? <small>{Number(result.review_count).toLocaleString()} reviews</small> : null}
          {result.distance_miles != null ? <small>{formatDistance(result.distance_miles)} away</small> : null}
        </span>
        <span className="treatment-row">
          {(result.treatments || []).slice(0, 3).map((treatment) => (
            <span key={`${result.id}-${treatment.name}`}>{treatment.name}</span>
          ))}
        </span>
      </span>
    </Link>
  );
}

function formatDistance(distance: number) {
  return `${Math.max(0, Math.round(distance)).toLocaleString()} mi`;
}
