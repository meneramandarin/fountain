import { describe, expect, test } from "vitest";

import { formatPrice } from "../src/lib/format-price";

describe("formatPrice", () => {
  test("renders a dollar sign when a US price has no stored currency", () => {
    expect(formatPrice(149, null, "US")).toBe("$149");
  });

  test("defaults an otherwise unscoped price to USD", () => {
    expect(formatPrice(179, null)).toBe("$179");
  });

  test("preserves explicit and country-specific currencies", () => {
    expect(formatPrice(149, "EUR", "US")).toBe("€149");
    expect(formatPrice(149, null, "CA")).toBe("CA$149");
  });

  test("preserves decimal cents", () => {
    expect(formatPrice(149.99, "USD", "US")).toBe("$149.99");
  });
});
