"use client";

import { ArrowLeft, ArrowRight, Building2, MapPin, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useId, useRef } from "react";
import { locationHref } from "@/lib/directory-urls";
import type { LandingFeaturedDirectoryCard } from "@/lib/queries";

type LandingFeaturedDirectoryCarouselProps = {
  cards: LandingFeaturedDirectoryCard[];
  title: string;
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
  if (src.startsWith("data/media/")) {
    return `/media/${src.replace(/^data\/media\//, "")}`;
  }
  return src;
}

export function LandingFeaturedDirectoryCarousel({ cards, title }: LandingFeaturedDirectoryCarouselProps) {
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
        <h2 id={titleId}>{title}</h2>
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
        {cards.map((card) => {
          const place = [card.locality, card.region, card.country_name].filter(Boolean).join(", ");
          const type = card.tags.find((tag) => tag.facet === "entity_type");

          return (
            <Link className="landing-featured-card" href={locationHref(card)} key={card.id}>
              <span className="landing-featured-photo">
                {card.image ? (
                  <Image
                    src={imageSource(card.image)}
                    alt=""
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 82vw, (max-width: 980px) 42vw, 320px"
                  />
                ) : (
                  <span className="landing-featured-photo-fallback" aria-hidden="true">
                    <Building2 size={28} />
                  </span>
                )}
                {card.rating ? (
                  <span className="landing-featured-rating">
                    <Star size={12} aria-hidden="true" />
                    {Number(card.rating).toFixed(1)}
                  </span>
                ) : null}
              </span>
              <span className="landing-featured-body">
                <span className="landing-featured-main">
                  <b>{card.name || card.org_name}</b>
                  <small>
                    <MapPin size={14} aria-hidden="true" />
                    {place || "Location unavailable"}
                  </small>
                </span>
                <span className="landing-featured-meta">
                  {type ? <em>{type.value}</em> : null}
                  {card.review_count ? <small>{Number(card.review_count).toLocaleString()} reviews</small> : null}
                </span>
                <span className="landing-featured-treatments">
                  {card.treatments.map((treatment) => {
                    const tone = domainTone[treatment.domain] || { bg: "#eef2f0", fg: "#39443e" };
                    return (
                      <span key={`${card.id}-${treatment.name}`} style={{ background: tone.bg, color: tone.fg }}>
                        {treatment.name}
                      </span>
                    );
                  })}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
