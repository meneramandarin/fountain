"use client";

import { getOfferingLabels } from "@/lib/offering-labels";
import { formatOfferingPrice } from "@/lib/offering-price";
import { Clock3 } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type OfferingRef = {
  raw_name?: string | null;
  price_amount?: number | null;
  price_max_amount?: number | null;
  price_currency?: string | null;
  price_type?: string | null;
  price_unit?: string | null;
  price_context?: string | null;
  price_audience?: string | null;
  duration_minutes?: number | null;
  description?: string | null;
  treatment?: string | null;
  domain?: string | null;
};

const treatmentCategoryOrder = [
  "Measure",
  "Optimize",
  "Recover",
  "Regenerate",
  "Rejuvenate",
] as const;

type TreatmentCategory = (typeof treatmentCategoryOrder)[number];
type MenuCategory = TreatmentCategory | "Other";
type GroupedOffering = { offering: OfferingRef; originalIndex: number };

export type TreatmentMenuGroup = {
  category: MenuCategory;
  offerings: GroupedOffering[];
};

export function groupOfferingsByCategory(offerings: OfferingRef[]): TreatmentMenuGroup[] {
  const groups = new Map<MenuCategory, GroupedOffering[]>();

  offerings.forEach((offering, originalIndex) => {
    const category = normalizeTreatmentCategory(offering.domain);
    const group = groups.get(category) || [];
    group.push({ offering, originalIndex });
    groups.set(category, group);
  });

  return [...treatmentCategoryOrder, "Other" as const]
    .filter((category) => groups.has(category))
    .map((category) => ({ category, offerings: groups.get(category) || [] }));
}

export function TreatmentMenu({
  offerings,
  countryCode,
}: {
  offerings: OfferingRef[];
  countryCode?: string | null;
}) {
  const groups = useMemo(() => groupOfferingsByCategory(offerings), [offerings]);
  const [activeCategory, setActiveCategory] = useState<MenuCategory>(groups[0]?.category || "Other");
  const tabListId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectTab(index: number) {
    const group = groups[index];
    if (!group) return;
    setActiveCategory(group.category);
    tabRefs.current[index]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectTab((index + 1) % groups.length);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectTab((index - 1 + groups.length) % groups.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(groups.length - 1);
    }
  }

  return (
    <div className="clinic-treatment-categories">
      <div className="clinic-treatment-tabs" role="tablist" aria-label="Treatment categories">
        {groups.map((group, index) => {
          const selected = group.category === activeCategory;
          return (
            <button
              aria-controls={`${tabListId}-panel-${index}`}
              aria-selected={selected}
              id={`${tabListId}-tab-${index}`}
              key={group.category}
              onClick={() => setActiveCategory(group.category)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              ref={(node) => { tabRefs.current[index] = node; }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {group.category}
            </button>
          );
        })}
      </div>

      {groups.map((group, index) => (
        <div
          aria-labelledby={`${tabListId}-tab-${index}`}
          hidden={group.category !== activeCategory}
          id={`${tabListId}-panel-${index}`}
          key={group.category}
          role="tabpanel"
          tabIndex={0}
        >
          <div className="clinic-treatment-list">
            {group.offerings.map(({ offering, originalIndex }) => (
              <TreatmentCard
                offering={offering}
                countryCode={countryCode}
                key={`${offering.raw_name || offering.treatment}-${originalIndex}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TreatmentCard({
  offering,
  countryCode,
}: {
  offering: OfferingRef;
  countryCode?: string | null;
}) {
  const { primary } = getOfferingLabels(offering);
  const duration = Number(offering.duration_minutes);
  const hasDuration = Number.isFinite(duration) && duration > 0;

  return (
    <article className="clinic-treatment-card">
      <div className="clinic-treatment-card-heading">
        <h3>{primary}</h3>
        <strong>{formatOfferingPrice(offering, countryCode)}</strong>
      </div>
      {hasDuration || offering.description ? (
        <div className="clinic-treatment-card-details">
          {hasDuration ? (
            <span className="clinic-treatment-duration">
              <Clock3 size={15} aria-hidden="true" />
              {duration} min
            </span>
          ) : null}
          {offering.description ? <p>{offering.description}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function normalizeTreatmentCategory(category?: string | null): MenuCategory {
  const value = category?.trim().toLocaleLowerCase();
  return treatmentCategoryOrder.find((candidate) => candidate.toLocaleLowerCase() === value) || "Other";
}
