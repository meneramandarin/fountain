"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SplitDirectorySearch } from "@/components/split-directory-search";

type LandingScrollHeaderProps = {
  alwaysVisible?: boolean;
  initialWhat?: string;
  initialWhere?: string;
  initialCityCountry?: string;
  initialPlaceType?: string;
  initialCityLat?: number;
  initialCityLng?: number;
  kind?: "locations" | "practitioners";
  onSubmit?: (payload: {
    what: string;
    city_label: string;
    city_country: string;
    place_type?: string;
    city_lat?: number;
    city_lng?: number;
  }) => void;
};

export function LandingScrollHeader({
  alwaysVisible = false,
  initialWhat,
  initialWhere,
  initialCityCountry,
  initialPlaceType,
  initialCityLat,
  initialCityLng,
  kind,
  onSubmit,
}: LandingScrollHeaderProps) {
  const [isVisible, setIsVisible] = useState(false);
  const headerIsVisible = alwaysVisible || isVisible;

  useEffect(() => {
    if (alwaysVisible) {
      return;
    }

    let animationFrame = 0;

    function updateVisibility() {
      const heroSearch = document.querySelector<HTMLElement>(
        ".landing-hero-search .split-search, .directory-search .split-search",
      );
      const shouldShow = heroSearch ? heroSearch.getBoundingClientRect().bottom <= 0 : window.scrollY > 220;

      setIsVisible(shouldShow);
    }

    function requestVisibilityUpdate() {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updateVisibility);
    }

    updateVisibility();
    window.addEventListener("scroll", requestVisibilityUpdate, { passive: true });
    window.addEventListener("resize", requestVisibilityUpdate);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", requestVisibilityUpdate);
      window.removeEventListener("resize", requestVisibilityUpdate);
    };
  }, [alwaysVisible]);

  return (
    <header className={`landing-scroll-header${headerIsVisible ? " is-visible" : ""}`} aria-label="Site header">
      <Link className="landing-brand landing-scroll-brand" href="/">
        fountain
      </Link>
      <SplitDirectorySearch
        className="landing-scroll-search"
        initialWhat={initialWhat}
        initialWhere={initialWhere}
        initialCityCountry={initialCityCountry}
        initialPlaceType={initialPlaceType}
        initialCityLat={initialCityLat}
        initialCityLng={initialCityLng}
        kind={kind}
        compact
        onSubmit={onSubmit}
      />
      <button className="coming-soon-pill landing-scroll-join" type="button">
        Coming Soon <span aria-hidden="true">|</span> Join
      </button>
    </header>
  );
}
