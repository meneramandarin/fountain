"use client";

import { getOfferingLabels } from "@/lib/offering-labels";
import { formatOfferingPrice } from "@/lib/offering-price";
import { Clock3 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { TreatmentExternalData } from "@/components/treatment-external-data";
import { TreatmentRegulatoryStatus } from "@/components/treatment-regulatory-status";
import type {
  TreatmentExternalData as TreatmentExternalDataRecord,
  TreatmentExternalDataByName,
} from "@/lib/treatment-external-data";
import {
  visibleTreatmentFdaMenuStatus,
  type TreatmentFdaRegulatoryStatus,
} from "@/lib/treatment-regulatory-status";

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
  fda_regulatory_status?: TreatmentFdaRegulatoryStatus | null;
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

type TreatmentOfferingsProps = {
  offerings: OfferingRef[];
  countryCode?: string | null;
  focusedTreatment?: string;
  treatmentExternalData?: TreatmentExternalDataByName;
};

export function FocusedTreatmentOfferings(
  props: Omit<TreatmentOfferingsProps, "focusedTreatment">,
) {
  return (
    <Suspense fallback={<TreatmentOfferings {...props} />}>
      <TreatmentOfferingsFromSearchParams {...props} />
    </Suspense>
  );
}

function TreatmentOfferingsFromSearchParams(
  props: Omit<TreatmentOfferingsProps, "focusedTreatment">,
) {
  const searchParams = useSearchParams();
  const focusedTreatment = cleanFocusedTreatment(searchParams.get("treatment"));

  return <TreatmentOfferings {...props} focusedTreatment={focusedTreatment} />;
}

export function TreatmentOfferings({
  offerings,
  countryCode,
  focusedTreatment,
  treatmentExternalData,
}: TreatmentOfferingsProps) {
  const orderedOfferings = useMemo(
    () => orderOfferingsForDisplay(offerings, focusedTreatment),
    [offerings, focusedTreatment],
  );

  if (orderedOfferings.length > 4) {
    return (
      <TreatmentMenu
        offerings={orderedOfferings}
        countryCode={countryCode}
        focusedTreatment={focusedTreatment}
        key={focusedTreatment || "default-treatment-menu"}
        treatmentExternalData={treatmentExternalData}
      />
    );
  }

  return (
    <div className="clinic-treatment-list">
      {orderedOfferings.map((offering, index) => (
        <TreatmentCard
          offering={offering}
          countryCode={countryCode}
          externalData={offering.treatment ? treatmentExternalData?.[offering.treatment] : undefined}
          key={`${offering.raw_name || offering.treatment}-${index}`}
        />
      ))}
    </div>
  );
}

export function orderOfferingsForDisplay(
  offerings: OfferingRef[],
  focusedTreatment?: string,
) {
  const ordered = [...offerings].sort(
    (first, second) => Number(first.price_amount == null) - Number(second.price_amount == null),
  );
  const focusedIndex = ordered.findIndex((offering) =>
    offeringMatchesTreatment(offering, focusedTreatment),
  );
  if (focusedIndex <= 0) {
    return ordered;
  }

  return [
    ordered[focusedIndex],
    ...ordered.slice(0, focusedIndex),
    ...ordered.slice(focusedIndex + 1),
  ];
}

export function groupOfferingsByCategory(
  offerings: OfferingRef[],
  focusedTreatment?: string,
): TreatmentMenuGroup[] {
  const groups = new Map<MenuCategory, GroupedOffering[]>();

  offerings.forEach((offering, originalIndex) => {
    const category = isMembershipOffering(offering)
      ? "Other"
      : normalizeTreatmentCategory(offering.domain);
    const group = groups.get(category) || [];
    group.push({ offering, originalIndex });
    groups.set(category, group);
  });

  return [...treatmentCategoryOrder, "Other" as const]
    .filter((category) => groups.has(category))
    .map((category) => ({
      category,
      offerings: moveFocusedOfferingFirst(groups.get(category) || [], focusedTreatment),
    }));
}

export function TreatmentMenu({
  offerings,
  countryCode,
  focusedTreatment,
  treatmentExternalData,
}: {
  offerings: OfferingRef[];
  countryCode?: string | null;
  focusedTreatment?: string;
  treatmentExternalData?: TreatmentExternalDataByName;
}) {
  const groups = useMemo(
    () => groupOfferingsByCategory(offerings, focusedTreatment),
    [offerings, focusedTreatment],
  );
  const focusedCategory = focusedTreatmentCategory(groups, focusedTreatment);
  const [activeCategory, setActiveCategory] = useState<MenuCategory>(
    focusedCategory || groups[0]?.category || "Other",
  );
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
                externalData={offering.treatment ? treatmentExternalData?.[offering.treatment] : undefined}
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
  externalData,
}: {
  offering: OfferingRef;
  countryCode?: string | null;
  externalData?: TreatmentExternalDataRecord;
}) {
  const { primary } = getOfferingLabels(offering);
  const duration = Number(offering.duration_minutes);
  const hasDuration = Number.isFinite(duration) && duration > 0;
  const description = offering.description
    ?.replace(/\\[nr]|\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const regulatoryStatus = visibleTreatmentFdaMenuStatus(offering.fda_regulatory_status);

  return (
    <article className="clinic-treatment-card">
      <div className="clinic-treatment-card-heading">
        <h3>{primary}</h3>
        <strong>{formatOfferingPrice(offering, countryCode)}</strong>
      </div>
      {hasDuration || description || externalData || regulatoryStatus ? (
        <div className="clinic-treatment-card-details">
          {hasDuration ? (
            <span className="clinic-treatment-duration">
              <Clock3 size={15} aria-hidden="true" />
              {duration} min
            </span>
          ) : null}
          {description ? <p>{description}</p> : null}
          {regulatoryStatus && offering.treatment ? (
            <TreatmentRegulatoryStatus
              status={regulatoryStatus}
              treatmentName={offering.treatment}
              variant="menu"
            />
          ) : null}
          {externalData ? <TreatmentExternalData data={externalData} variant="menu" /> : null}
        </div>
      ) : null}
    </article>
  );
}

function normalizeTreatmentCategory(category?: string | null): MenuCategory {
  const value = category?.trim().toLocaleLowerCase();
  return treatmentCategoryOrder.find((candidate) => candidate.toLocaleLowerCase() === value) || "Other";
}

function isMembershipOffering(offering: OfferingRef) {
  const membershipMetadata = [offering.raw_name, offering.price_context]
    .filter(Boolean)
    .join(" ");

  return /\bmemberships?\b/i.test(membershipMetadata);
}

function focusedTreatmentCategory(
  groups: TreatmentMenuGroup[],
  focusedTreatment?: string,
) {
  return groups.find((group) => group.offerings.some(({ offering }) =>
    offeringMatchesTreatment(offering, focusedTreatment),
  ))?.category;
}

function moveFocusedOfferingFirst(
  offerings: GroupedOffering[],
  focusedTreatment?: string,
) {
  const focusedIndex = offerings.findIndex(({ offering }) =>
    offeringMatchesTreatment(offering, focusedTreatment),
  );
  if (focusedIndex <= 0) {
    return offerings;
  }

  return [
    offerings[focusedIndex],
    ...offerings.slice(0, focusedIndex),
    ...offerings.slice(focusedIndex + 1),
  ];
}

function offeringMatchesTreatment(
  offering: OfferingRef,
  focusedTreatment?: string,
) {
  const focused = normalizeTreatmentName(focusedTreatment);
  if (!focused) {
    return false;
  }
  return [offering.treatment, offering.raw_name]
    .some((name) => normalizeTreatmentName(name) === focused);
}

function normalizeTreatmentName(value?: string | null) {
  return value?.trim().toLocaleLowerCase().replace(/\s+/g, " ") || "";
}

function cleanFocusedTreatment(value: string | null) {
  const focusedTreatment = value?.trim();
  return focusedTreatment ? focusedTreatment.slice(0, 160) : undefined;
}
