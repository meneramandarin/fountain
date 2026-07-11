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
  distance_miles?: number | null;
};

const domainTone: Record<string, { bg: string; fg: string }> = {
  "Diagnostics & testing": { bg: "#e8eaf4", fg: "#33447a" },
  "Regenerative & cellular": { bg: "#e3f0e6", fg: "#1e5c3e" },
  "IV & infusion": { bg: "#f1e8d3", fg: "#6b4e23" },
  "Hormone & metabolic": { bg: "#f1e6f0", fg: "#6a3568" },
  "Recovery & performance": { bg: "#e3eff0", fg: "#1f5860" },
  Aesthetic: { bg: "#f3e6e9", fg: "#7a2f42" },
  "Lifestyle & foundational": { bg: "#edefe0", fg: "#4b5227" },
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

export function DirectoryLocationCard({ result, from = "search" }: { result: DirectoryLocationCardData; from?: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const place = formatLocationPlace({
    locality: result.locality,
    region: result.region,
    countryCode: result.country_code,
    countryName: result.country_name,
  });
  const type = result.tags?.find((tag) => tag.facet === "entity_type");
  const price = formatPrice(result.min_price_amount, result.min_price_currency);

  return (
    <Link className="result-card" href={`${locationHref(result)}?from=${encodeURIComponent(from)}`}>
      <span className="result-photo">
        {result.image && !imageFailed ? (
          <Image
            src={imageSource(result.image)}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 640px) 92vw, (max-width: 980px) 46vw, 360px"
            onError={() => setImageFailed(true)}
          />
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
            {result.treatments.slice(0, 3).map((treatment) => {
              const tone = domainTone[treatment.domain] || { bg: "#eef2f0", fg: "#39443e" };
              return (
                <span key={`${result.id}-photo-${treatment.name}`} style={{ background: tone.bg, color: tone.fg }}>
                  {treatment.name}
                </span>
              );
            })}
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
          {(result.treatments || []).slice(0, 3).map((treatment) => {
            const tone = domainTone[treatment.domain] || { bg: "#eef2f0", fg: "#39443e" };
            return (
              <span key={`${result.id}-${treatment.name}`} style={{ background: tone.bg, color: tone.fg }}>
                {treatment.name}
              </span>
            );
          })}
        </span>
      </span>
    </Link>
  );
}

function formatDistance(distance: number) {
  return `${Math.max(0, Math.round(distance)).toLocaleString()} mi`;
}
