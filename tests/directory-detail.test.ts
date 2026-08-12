import { describe, expect, test } from "vitest";
import { normalizeOpeningHours } from "../src/components/directory-detail-page";

describe("directory detail", () => {
  test("normalizes object-shaped opening hours used by live listings", () => {
    expect(normalizeOpeningHours({
      monday: [{ open: "07:00", close: "17:00" }],
      sunday: [],
    })).toEqual([
      { day: "Monday", periods: ["07:00 – 17:00"] },
      { day: "Tuesday", periods: ["Closed"] },
      { day: "Wednesday", periods: ["Closed"] },
      { day: "Thursday", periods: ["Closed"] },
      { day: "Friday", periods: ["Closed"] },
      { day: "Saturday", periods: ["Closed"] },
      { day: "Sunday", periods: ["Closed"] },
    ]);
  });

  test("renders explicit closed days as standard rows", () => {
    expect(normalizeOpeningHours([
      { day: "Monday", open: "09:00", close: "17:00" },
      { day: "Saturday", closed: true },
      { day: "Sunday", closed: true },
    ])).toEqual([
      { day: "Monday", periods: ["09:00 – 17:00"] },
      { day: "Tuesday", periods: ["Closed"] },
      { day: "Wednesday", periods: ["Closed"] },
      { day: "Thursday", periods: ["Closed"] },
      { day: "Friday", periods: ["Closed"] },
      { day: "Saturday", periods: ["Closed"] },
      { day: "Sunday", periods: ["Closed"] },
    ]);
  });

  test("renders appointment-only days without a prose note", () => {
    expect(normalizeOpeningHours([
      { day: "Monday", by_appointment_only: true },
    ])[0]).toEqual({ day: "Monday", periods: ["By appointment only"] });
  });

  test("treats JSON null opening hours as empty", () => {
    expect(normalizeOpeningHours(null)).toEqual([]);
  });
});
