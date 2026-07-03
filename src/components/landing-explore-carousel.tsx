"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

export type LandingExploreItem = {
  label: string;
  href: string;
  image: string;
};

type LandingExploreCarouselProps = {
  items: LandingExploreItem[];
};

export function LandingExploreCarousel({ items }: LandingExploreCarouselProps) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;

    if (!rail) {
      return;
    }

    const firstTile = rail.querySelector<HTMLElement>(".landing-explore-tile");
    const gap = Number.parseFloat(getComputedStyle(rail).columnGap) || 0;
    const initialOffset = (firstTile?.offsetWidth || 0) + gap;

    rail.scrollLeft = initialOffset;
  }, []);

  function scrollRail(direction: -1 | 1) {
    const rail = railRef.current;

    if (!rail) {
      return;
    }

    rail.scrollBy({
      left: direction * Math.min(rail.clientWidth * 0.82, 680),
      behavior: "smooth",
    });
  }

  return (
    <section className="landing-explore" aria-labelledby="landing-explore-title">
      <div className="landing-explore-header">
        <h2 id="landing-explore-title">Explore Treatments and Clinics</h2>
        <div className="landing-explore-controls" role="group" aria-label="Carousel controls">
          <button type="button" onClick={() => scrollRail(-1)} aria-label="Scroll left">
            <span className="landing-explore-arrow landing-explore-arrow-left" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => scrollRail(1)} aria-label="Scroll right">
            <span className="landing-explore-arrow landing-explore-arrow-right" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="landing-explore-rail" ref={railRef}>
        {items.map((item) => (
          <Link className="landing-explore-tile" href={item.href} key={item.label}>
            <span className="landing-explore-thumb">
              <Image
                src={item.image}
                alt=""
                fill
                sizes="(max-width: 640px) 74vw, (max-width: 980px) 39vw, 325px"
              />
            </span>
            <span className="landing-explore-caption">{item.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
