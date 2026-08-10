"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SplitDirectorySearch } from "@/components/split-directory-search";

type LandingScrollHeaderProps = {
  alwaysVisible?: boolean;
  initialWhat?: string;
  initialTreatmentId?: string;
  initialWhere?: string;
  initialCityCountry?: string;
  initialPlaceType?: string;
  initialCityLat?: number;
  initialCityLng?: number;
  kind?: "locations" | "practitioners";
  onSubmit?: (payload: {
    what: string;
    treatment_id?: string;
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
  initialTreatmentId,
  initialWhere,
  initialCityCountry,
  initialPlaceType,
  initialCityLat,
  initialCityLng,
  kind,
  onSubmit,
}: LandingScrollHeaderProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [searchIsExpanded, setSearchIsExpanded] = useState(false);
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
    <header
      className={[
        "landing-scroll-header",
        headerIsVisible ? "is-visible" : "",
        searchIsExpanded ? "is-search-expanded" : "",
      ].filter(Boolean).join(" ")}
      aria-label="Site header"
    >
      <Link className="landing-brand landing-scroll-brand" href="/" prefetch={false}>
        fountain
      </Link>
      <SplitDirectorySearch
        className="landing-scroll-search"
        initialWhat={initialWhat}
        initialTreatmentId={initialTreatmentId}
        initialWhere={initialWhere}
        initialCityCountry={initialCityCountry}
        initialPlaceType={initialPlaceType}
        initialCityLat={initialCityLat}
        initialCityLng={initialCityLng}
        kind={kind}
        compact
        onExpandedChange={setSearchIsExpanded}
        onSubmit={onSubmit}
      />
      <button className="coming-soon-pill landing-scroll-join" type="button">
        Coming Soon <span aria-hidden="true">|</span> Join
      </button>
    </header>
  );
}
