import { describe, expect, test } from "vitest";

// @ts-expect-error -- pipeline runtime intentionally uses native .mjs modules.
import * as displayModule from "../pipeline/lib/offering-display.mjs";

const { normalizeOfferingTerm, resolveOfferingDisplay } = displayModule;

describe("offering display resolution", () => {
  test("does not collapse distinct names merely because they share a treatment", () => {
    const result = resolveOfferingDisplay([
      offering(1, "NAD+ Therapy", {
      }),
      offering(2, "NAD+", {
        price_amount: 250,
        price_currency: "USD",
        source_offer_url: "https://clinic.example/menu",
        data_origin: "scraped",
      }),
    ]);

    expect(result.decisions).toEqual([]);
  });

  test("keeps distinct priced menu variants sharing one canonical treatment", () => {
    const result = resolveOfferingDisplay([
      offering(1, "IV Therapy", {
      }),
      offering(2, "Hangover IV Drip", { price_amount: 280 }),
      offering(3, "Vitamin C IV Therapy", { price_amount: 250 }),
    ]);

    expect(result.decisions).toEqual([]);
  });

  test("collapses normalized same-term same-price duplicates to the stronger source", () => {
    const result = resolveOfferingDisplay([
      offering(10, "Myers' Cocktail", {
        price_amount: 300,
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
      offering(20, "NAD+ IV Therapy", { price_amount: 500 }),
      offering(21, "NAD+ IV Therapy", { price_amount: 600 }),
    ]);

    expect(result.decisions).toEqual([]);
    expect(result.price_conflicts).toEqual([
      expect.objectContaining({ offering_ids: [20, 21] }),
    ]);
  });

  test("retains differently named rows across different treatments", () => {
    const result = resolveOfferingDisplay([
      offering(30, "Peptide Therapy", {
        treatment_id: 20,
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

  test("deduplicates unmapped offerings without requiring taxonomy", () => {
    const result = resolveOfferingDisplay([
      offering(40, "Brain Tap", { treatment_id: null }),
      offering(41, "Brain-Tap", {
        treatment_id: null,
        source_offer_url: "https://clinic.example/braintap",
      }),
    ]);

    expect(result.decisions).toEqual([
      expect.objectContaining({
        offering_id: 40,
        winner_offering_id: 41,
        reason: "duplicate_same_term",
      }),
    ]);
  });

  test("does not treat unrelated unmapped rows as one treatment", () => {
    const result = resolveOfferingDisplay([
      offering(50, "Brain health", { treatment_id: null }),
      offering(51, "Deuterium-depleted water", {
        treatment_id: null,
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
    status: "active",
    data_origin: "imported",
    verification_status: "unverified",
    owner_account_id: null,
    created_at: "2026-07-07T00:00:00.000Z",
    updated_at: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}
