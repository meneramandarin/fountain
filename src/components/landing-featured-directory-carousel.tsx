"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useId, useRef } from "react";
import { DirectoryLocationCard } from "@/components/directory-location-card";
import type { LandingFeaturedDirectoryCard } from "@/lib/queries";

type LandingFeaturedDirectoryCarouselProps = {
  cards: LandingFeaturedDirectoryCard[];
  eyebrow: string;
  title: string;
  subtitle: string;
  treatmentName: string;
  clinicCategory: string;
};

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
        {cards.map((card, index) => (
          <DirectoryLocationCard
            key={card.id}
            result={card}
            from="homepage_carousel"
            treatmentName={treatmentName}
            clinicCategory={clinicCategory}
            resultPosition={index + 1}
            showImageTreatmentTags
          />
        ))}
      </div>
    </section>
  );
}
