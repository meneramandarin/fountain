import { describe, expect, test } from "vitest";

// @ts-expect-error -- pipeline runtime intentionally uses native .mjs modules.
import * as displayModule from "../pipeline/lib/offering-display.mjs";

const { normalizeOfferingTerm, resolveOfferingDisplay } = displayModule;

describe("offering display resolution", () => {
  test("suppresses a legacy summary when stronger same-treatment evidence exists", () => {
    const result = resolveOfferingDisplay([
      offering(1, "NAD+ Therapy", {
        source_slug: "bioedge_clinics",
        source_granularity: "summary",
      }),
      offering(2, "NAD+", {
        price_amount: 250,
        price_currency: "USD",
        source_offer_url: "https://clinic.example/menu",
        data_origin: "scraped",
      }),
    ]);

    expect(result.decisions).toEqual([
      expect.objectContaining({
        offering_id: 1,
        winner_offering_id: 2,
        reason: "legacy_summary_shadow",
      }),
    ]);
  });

  test("keeps distinct priced menu variants sharing one canonical treatment", () => {
    const result = resolveOfferingDisplay([
      offering(1, "IV Therapy", {
        source_slug: "bioedge_clinics",
        source_granularity: "summary",
      }),
      offering(2, "Hangover IV Drip", { price_amount: 280, source_granularity: "menu_item" }),
      offering(3, "Vitamin C IV Therapy", { price_amount: 250, source_granularity: "menu_item" }),
    ]);

    expect(result.decisions).toEqual([
      expect.objectContaining({ offering_id: 1, reason: "legacy_summary_shadow" }),
    ]);
  });

  test("collapses normalized same-term same-price duplicates to the stronger source", () => {
    const result = resolveOfferingDisplay([
      offering(10, "Myers' Cocktail", {
        price_amount: 300,
        source_granularity: "menu_item",
      }),
      offering(11, "Myers’ Cocktail", {
        price_amount: 300,
        source_offer_url: "https://clinic.example/treatments",
        data_origin: "scraped",
      }),
    ]);

    expect(normalizeOfferingTerm("Myers' Cocktail")).toBe(normalizeOfferingTerm("Myers’ Cocktail"));
    expect(result.decisions).toEqual([
      expect.objectContaining({
        offering_id: 10,
        winner_offering_id: 11,
        reason: "duplicate_same_term",
      }),
    ]);
  });

  test("keeps conflicting explicit prices visible for review", () => {
    const result = resolveOfferingDisplay([
      offering(20, "NAD+ IV Therapy", { price_amount: 500, source_granularity: "menu_item" }),
      offering(21, "NAD+ IV Therapy", { price_amount: 600, source_granularity: "direct_service" }),
    ]);

    expect(result.decisions).toEqual([]);
    expect(result.price_conflicts).toEqual([
      expect.objectContaining({ offering_ids: [20, 21] }),
    ]);
  });

  test("retains a legacy summary when it is the only evidence for its treatment", () => {
    const result = resolveOfferingDisplay([
      offering(30, "Peptide Therapy", {
        treatment_id: 20,
        source_granularity: "summary",
      }),
      offering(31, "NAD+", {
        treatment_id: 22,
        price_amount: 250,
        data_origin: "scraped",
        source_offer_url: "https://clinic.example",
      }),
    ]);

    expect(result.decisions).toEqual([]);
  });
});

function offering(id: number, rawName: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    location_id: 42,
    treatment_id: 22,
    raw_name: rawName,
    price_amount: null,
    price_currency: "USD",
    source_offer_url: null,
    source_id: null,
    source_slug: null,
    source_granularity: "unknown",
    status: "active",
    data_origin: "imported",
    verification_status: "unverified",
    owner_account_id: null,
    created_at: "2026-07-07T00:00:00.000Z",
    updated_at: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}
