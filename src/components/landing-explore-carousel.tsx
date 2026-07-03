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

const LOOP_COPIES = 3;
const MIDDLE_COPY_INDEX = 1;

export function LandingExploreCarousel({ items }: LandingExploreCarouselProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const isResettingScrollRef = useRef(false);

  useEffect(() => {
    const rail = railRef.current;

    if (!rail || items.length === 0) {
      return;
    }

    const railElement = rail;

    function getCopyStart(copyIndex: number) {
      return (
        railElement
          .querySelector<HTMLElement>(`[data-loop-copy="${copyIndex}"][data-loop-index="0"]`)
          ?.offsetLeft ?? 0
      );
    }

    function getTileAdvance() {
      const firstTile = railElement.querySelector<HTMLElement>(
        `[data-loop-copy="${MIDDLE_COPY_INDEX}"][data-loop-index="0"]`
      );
      const secondTile = railElement.querySelector<HTMLElement>(
        `[data-loop-copy="${MIDDLE_COPY_INDEX}"][data-loop-index="1"]`
      );
      const gap = Number.parseFloat(getComputedStyle(railElement).columnGap) || 0;

      return secondTile && firstTile ? secondTile.offsetLeft - firstTile.offsetLeft : (firstTile?.offsetWidth || 0) + gap;
    }

    function getLoopMetrics() {
      const leadingOffset = getCopyStart(0);
      const middleStart = getCopyStart(MIDDLE_COPY_INDEX);
      const lastStart = getCopyStart(MIDDLE_COPY_INDEX + 1);

      return {
        lowerBoundary: middleStart - leadingOffset,
        lastStart,
        loopWidth: lastStart - middleStart,
        middleStart,
        upperBoundary: lastStart - leadingOffset,
      };
    }

    function setScrollLeftInstant(scrollLeft: number) {
      const previousScrollBehavior = railElement.style.scrollBehavior;

      railElement.style.scrollBehavior = "auto";
      railElement.scrollLeft = scrollLeft;
      railElement.style.scrollBehavior = previousScrollBehavior;
    }

    function keepScrollInMiddleCopy() {
      const { loopWidth, lowerBoundary, upperBoundary } = getLoopMetrics();

      if (isResettingScrollRef.current || loopWidth <= 0) {
        return;
      }

      let nextScrollLeft = railElement.scrollLeft;

      if (nextScrollLeft < lowerBoundary) {
        nextScrollLeft += loopWidth;
      } else if (nextScrollLeft > upperBoundary) {
        nextScrollLeft -= loopWidth;
      }

      if (nextScrollLeft !== railElement.scrollLeft) {
        isResettingScrollRef.current = true;
        setScrollLeftInstant(nextScrollLeft);
        requestAnimationFrame(() => {
          isResettingScrollRef.current = false;
        });
      }
    }

    const initialScrollFrame = requestAnimationFrame(() => {
      const { lowerBoundary } = getLoopMetrics();

      setScrollLeftInstant(lowerBoundary + getTileAdvance());
    });

    railElement.addEventListener("scroll", keepScrollInMiddleCopy, { passive: true });

    return () => {
      cancelAnimationFrame(initialScrollFrame);
      railElement.removeEventListener("scroll", keepScrollInMiddleCopy);
    };
  }, [items.length]);

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
        <h2 id="landing-explore-title">On the pursuit of a longer life</h2>
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
        {Array.from({ length: LOOP_COPIES }, (_, copyIndex) =>
          items.map((item, itemIndex) => {
            const isCanonicalCopy = copyIndex === MIDDLE_COPY_INDEX;

            return (
              <Link
                aria-hidden={!isCanonicalCopy}
                className="landing-explore-tile"
                data-loop-copy={copyIndex}
                data-loop-index={itemIndex}
                href={item.href}
                key={`${copyIndex}-${item.label}`}
                tabIndex={isCanonicalCopy ? undefined : -1}
              >
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
            );
          })
        )}
      </div>
    </section>
  );
}
