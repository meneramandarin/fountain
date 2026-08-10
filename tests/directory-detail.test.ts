import { describe, expect, test } from "vitest";
import { normalizeOpeningHours } from "../src/components/directory-detail-page";

describe("directory detail", () => {
  test("normalizes object-shaped opening hours used by live listings", () => {
    expect(normalizeOpeningHours({
      monday: [{ open: "07:00", close: "17:00" }],
      sunday: [],
    })).toEqual([
      { day: "Monday", open: "07:00", close: "17:00" },
    ]);
  });

  test("accepts array-shaped opening hours unchanged", () => {
    const hours = [{ day: "Monday", open: "09:00", close: "17:00" }];
    expect(normalizeOpeningHours(hours)).toBe(hours);
  });

  test("treats JSON null opening hours as empty", () => {
    expect(normalizeOpeningHours(null)).toEqual([]);
  });
});
