"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function LandingScrollHeader() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    function updateVisibility() {
      setIsVisible(window.scrollY > 24);
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateVisibility);
    };
  }, []);

  return (
    <header className={`landing-scroll-header${isVisible ? " is-visible" : ""}`} aria-label="Site header">
      <Link className="landing-brand landing-scroll-brand" href="/">
        fountain
      </Link>
    </header>
  );
}
