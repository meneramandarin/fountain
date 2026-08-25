"use client";

import { Bookmark, CircleDollarSign, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  ClinicianLicenseVerification,
  type ClinicianLicenseVerificationData,
} from "@/components/clinician-license-verification";
import {
  LocationRegulatoryVerification,
  type LocationRegulatoryVerificationData,
} from "@/components/location-regulatory-verification";
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
  regulatory_verifications?: LocationRegulatoryVerificationData[] | null;
};

function imageSource(src: string) {
  return src;
}

const savedLocationsStorageKey = "fountain.saved-location-ids";
const savedLocationsChangedEvent = "fountain:saved-locations-changed";

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
  const saved = useSyncExternalStore(
    subscribeToSavedLocations,
    () => readSavedLocationIds().includes(result.id),
    () => false,
  );
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
  const destinationHref = href || locationHref(result, { treatment: treatmentName });
  const entityLabel = mobileService ? "Mobile service" : type?.value;
  const treatmentTags = [...new Set((result.treatments || []).map((treatment) => treatment.name))].slice(0, 3);
  const rating = Number(result.rating || 0);
  const reviewCount = Number(result.review_count || 0);
  const locationLine = [
    place || "Location unavailable",
    result.distance_miles != null ? formatDistance(result.distance_miles) : null,
  ].filter(Boolean).join(" · ");

  function toggleSaved() {
    const nextSaved = !saved;
    const ids = new Set(readSavedLocationIds());
    if (nextSaved) {
      ids.add(result.id);
    } else {
      ids.delete(result.id);
    }
    writeSavedLocationIds([...ids]);
  }

  return (
    <article
      className="result-card"
      onMouseEnter={() => onActiveChange?.(result.id)}
      onMouseLeave={() => onActiveChange?.(null)}
      onFocus={() => onActiveChange?.(result.id)}
      onBlur={() => onActiveChange?.(null)}
    >
      <Link
        className="result-card-link"
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
        </span>
        <span className="result-body">
          {entityLabel || rating > 0 ? (
            <span className="result-card-topline">
              {entityLabel ? <span>{entityLabel}</span> : null}
              {rating > 0 ? (
                <span className="result-card-rating">
                  <Star size={13} fill="currentColor" aria-hidden="true" />
                  {rating.toFixed(1)}
                  {reviewCount > 0 ? <i>({reviewCount.toLocaleString()})</i> : null}
                </span>
              ) : null}
            </span>
          ) : null}
          <span className="result-main">
            <span className="result-title-row">
              <b>{result.name || result.org_name || "Unnamed location"}</b>
              <ClinicianLicenseVerification verification={result.clinician_license_verification} compact />
              <LocationRegulatoryVerification verifications={result.regulatory_verifications} compact />
            </span>
            <small>
              <MapPin size={13} aria-hidden="true" />
              {locationLine}
            </small>
          </span>
          {treatmentTags.length ? (
            <span className="result-treatment-tags">
              {treatmentTags.map((tag) => <span key={`${result.id}-${tag}`}>{tag}</span>)}
            </span>
          ) : null}
          <span className="result-meta-row">
            {price ? (
              <span className="result-price">
                <CircleDollarSign size={15} aria-hidden="true" />
                From {price}
              </span>
            ) : <span className="muted">View details</span>}
            {rating <= 0 && reviewCount > 0 ? (
              <span className="muted">{reviewCount.toLocaleString()} reviews</span>
            ) : null}
          </span>
        </span>
      </Link>
      <button
        className={`result-save-button${saved ? " is-saved" : ""}`}
        type="button"
        onClick={toggleSaved}
        aria-label={saved ? `Remove ${result.name || result.org_name || "location"} from saved` : `Save ${result.name || result.org_name || "location"}`}
        aria-pressed={saved}
      >
        <Bookmark size={17} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      </button>
    </article>
  );
}

function readSavedLocationIds() {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(savedLocationsStorageKey) || "[]");
    return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

function writeSavedLocationIds(ids: number[]) {
  try {
    window.localStorage.setItem(savedLocationsStorageKey, JSON.stringify(ids));
    window.dispatchEvent(new Event(savedLocationsChangedEvent));
  } catch {
    // Saving remains a progressive enhancement when local storage is unavailable.
  }
}

function subscribeToSavedLocations(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === savedLocationsStorageKey) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(savedLocationsChangedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(savedLocationsChangedEvent, onStoreChange);
  };
}

function formatDistance(distance: number) {
  return `${Math.max(0, Math.round(distance)).toLocaleString()} mi away`;
}
