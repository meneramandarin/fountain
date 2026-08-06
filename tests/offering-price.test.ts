import { describe, expect, it } from "vitest";

import { formatOfferingPrice } from "../src/lib/offering-price";

describe("formatOfferingPrice", () => {
  it("qualifies neurotoxin prices as per-unit prices", () => {
    expect(formatOfferingPrice({ price_amount: 12, price_currency: "USD", price_unit: "unit" }, "US"))
      .toBe("$12 per unit");
  });

  it("renders starting prices and ranges without implying an exact total", () => {
    expect(formatOfferingPrice({ price_amount: 250, price_currency: "USD", price_type: "starting_at" }, "US"))
      .toBe("Starting at $250");
    expect(formatOfferingPrice({ price_amount: 250, price_max_amount: 350, price_currency: "USD", price_type: "range" }, "US"))
      .toBe("$250–$350");
  });

  it("keeps member pricing explicit", () => {
    expect(formatOfferingPrice({ price_amount: 6, price_currency: "USD", price_unit: "unit", price_audience: "member" }, "US"))
      .toBe("Member price: $6 per unit");
  });

  it("distinguishes free and included services from missing prices", () => {
    expect(formatOfferingPrice({ price_type: "free" }, "US")).toBe("Free");
    expect(formatOfferingPrice({ price_type: "included" }, "US")).toBe("Included");
    expect(formatOfferingPrice({}, "US")).toBe("Price on request");
  });
});
