"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function LandingScrollHeader() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let animationFrame = 0;

    function updateVisibility() {
      const heroSearch = document.querySelector<HTMLElement>(".landing-search");
      const triggerLine = 0;
      const shouldShow = heroSearch ? heroSearch.getBoundingClientRect().bottom <= triggerLine : window.scrollY > 220;

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
  }, []);

  return (
    <header className={`landing-scroll-header${isVisible ? " is-visible" : ""}`} aria-label="Site header">
      <Link className="landing-brand landing-scroll-brand" href="/">
        fountain
      </Link>
      <form className="landing-scroll-search" action="/directory" role="search">
        <input
          name="q"
          type="search"
          aria-label="Search treatments, clinics, doctors"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" aria-label="Search">
          <Search size={16} aria-hidden="true" />
        </button>
      </form>
    </header>
  );
}
