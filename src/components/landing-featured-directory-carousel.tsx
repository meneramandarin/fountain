"use client";

import { ArrowLeft, ArrowRight, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useId, useRef } from "react";
import { trackClinicClick } from "@/lib/clinic-click-analytics";
import { locationHref } from "@/lib/directory-urls";
import { formatLocationPlace } from "@/lib/location-display";
import { formatPrice } from "@/lib/format-price";
import type { LandingFeaturedDirectoryCard } from "@/lib/queries";
import { ClinicianLicenseVerification } from "@/components/clinician-license-verification";

type LandingFeaturedDirectoryCarouselProps = {
  cards: LandingFeaturedDirectoryCard[];
  eyebrow: string;
  title: string;
  subtitle: string;
  treatmentName: string;
  clinicCategory: string;
};

function imageSource(src: string) {
  return src;
}

export function LandingFeaturedDirectoryCarousel({
  cards,
  eyebrow,
  title,
  subtitle,
  treatmentName,
  clinicCategory,
}: LandingFeaturedDirectoryCarouselProps) {
  const titleId = useId();
  const railRef = useRef<HTMLDivElement>(null);

  function scrollRail(direction: -1 | 1) {
    const rail = railRef.current;

    if (!rail) {
      return;
    }

    rail.scrollBy({
      left: direction * Math.min(rail.clientWidth * 0.78, 620),
      behavior: "smooth",
    });
  }

  if (!cards.length) {
    return null;
  }

  return (
    <section className="landing-featured" aria-labelledby={titleId}>
      <div className="landing-featured-header">
        <div className="landing-featured-heading">
          <p className="landing-featured-eyebrow">{eyebrow}</p>
          <h2 id={titleId}>{title}</h2>
          <p className="landing-featured-subtitle">{subtitle}</p>
        </div>
        <div className="landing-featured-controls" role="group" aria-label={`${title} carousel controls`}>
          <button type="button" onClick={() => scrollRail(-1)} aria-label="Scroll left">
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => scrollRail(1)} aria-label="Scroll right">
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="landing-featured-rail" ref={railRef}>
        {cards.map((card, index) => {
          const place = formatLocationPlace({
            locality: card.locality,
            region: card.region,
            countryCode: card.country_code,
            countryName: card.country_name,
          });
          const previewTreatments = card.treatments.slice(0, 3);
          const isContainedGraphic = card.image_kind === "text_graphic" || card.image_kind === "logo";
          const price = formatPrice(card.min_price_amount, card.min_price_currency, card.country_code);

          return (
            <Link
              className="landing-featured-card"
              href={locationHref(card)}
              key={card.id}
              prefetch={false}
              onClick={() => {
                trackClinicClick({
                  locationId: card.id,
                  locationSlug: card.slug,
                  treatments: card.treatments,
                  treatmentName,
                  clinicCategory,
                  clickSurface: "homepage_carousel",
                  resultPosition: index + 1,
                });
              }}
            >
              <span className={`landing-featured-photo${isContainedGraphic ? " image-frame-text-graphic" : ""}`}>
                {card.image ? (
                  <>
                    {isContainedGraphic ? <Image className="image-frame-backdrop" src={imageSource(card.image)} alt="" fill unoptimized aria-hidden="true" sizes="100vw" /> : null}
                    <Image
                      className={isContainedGraphic ? "image-frame-content" : undefined}
                      src={imageSource(card.image)}
                      alt=""
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 82vw, (max-width: 980px) 42vw, 320px"
                    />
                  </>
                ) : (
                  <span className="landing-featured-photo-fallback listing-image-fallback" aria-hidden="true" />
                )}
                {card.rating ? (
                  <span className="landing-featured-rating">
                    <Star size={12} aria-hidden="true" />
                    {Number(card.rating).toFixed(1)}
                  </span>
                ) : null}
                {previewTreatments.length ? (
                  <span className="landing-featured-photo-tags" aria-hidden="true">
                    {previewTreatments.map((treatment) => (
                      <span key={`${card.id}-photo-${treatment.name}`}>{treatment.name}</span>
                    ))}
                  </span>
                ) : null}
              </span>
              <span className="landing-featured-body">
                <span className="landing-featured-main">
                  <span className="landing-featured-title-row">
                    <b>{card.name || card.org_name}</b>
                    <ClinicianLicenseVerification verification={card.clinician_license_verification} compact />
                  </span>
                  <small>
                    <MapPin size={14} aria-hidden="true" />
                    {place || "Location unavailable"}
                  </small>
                </span>
                <span className="landing-featured-footer">
                  <span className="landing-featured-meta">
                    {price ? <small>From {price}</small> : null}
                    {price && card.review_count ? <i aria-hidden="true">·</i> : null}
                    {card.review_count ? <small>{Number(card.review_count).toLocaleString()} reviews</small> : null}
                  </span>
                  <span className="landing-featured-card-arrow" aria-hidden="true"><ArrowRight size={15} /></span>
                </span>
                <span className="landing-featured-treatments">
                  {card.treatments.map((treatment) => (
                    <span key={`${card.id}-${treatment.name}`}>{treatment.name}</span>
                  ))}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
