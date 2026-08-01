import { describe, expect, it } from "vitest";

import {
  minimumBookingDateValue,
  normalizeEmail,
  parseBookingRequest,
  shouldShowBookingTotal,
} from "../src/lib/booking-request";

function dateFromMinimum(offset: number) {
  const date = new Date(
    `${minimumBookingDateValue(new Date(), "America/Los_Angeles")}T12:00:00.000Z`,
  );
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const validRequest = {
  locationId: 42,
  locationSlug: "fountain-clinic",
  locationName: "Fountain Clinic",
  name: "  Marlene   Ronstedt ",
  email: " HELLO@EXAMPLE.COM ",
  phone: "+1 (415) 555-0100",
  timezone: "America/Los_Angeles",
  sourcePath: "/directory/locations/fountain-clinic",
  services: [
    {
      serviceId: "nad-iv-0",
      name: "NAD+ IV Therapy",
      priceAmount: 350,
      priceMaxAmount: null,
      priceCurrency: "USD",
    },
  ],
  preferences: [{ date: dateFromMinimum(1), time: "morning" }],
};

describe("parseBookingRequest", () => {
  it("normalizes and accepts a request with only the first preference", () => {
    expect(parseBookingRequest(validRequest)).toEqual({
      ok: true,
      value: {
        ...validRequest,
        name: "Marlene Ronstedt",
        email: "hello@example.com",
      },
    });
  });

  it("accepts up to three coarse time preferences on different days", () => {
    const preferences = [
      { date: dateFromMinimum(0), time: "morning" },
      { date: dateFromMinimum(1), time: "afternoon" },
      { date: dateFromMinimum(2), time: "evening" },
    ];

    const result = parseBookingRequest({ ...validRequest, preferences });

    expect(result).toMatchObject({ ok: true, value: { preferences } });
  });

  it("rejects zero or more than three preferences", () => {
    expect(parseBookingRequest({ ...validRequest, preferences: [] })).toEqual({
      ok: false,
      error: "Choose between one and three appointment options.",
    });

    expect(
      parseBookingRequest({
        ...validRequest,
        preferences: [
          ...validRequest.preferences,
          { date: dateFromMinimum(2), time: "afternoon" },
          { date: dateFromMinimum(3), time: "evening" },
          { date: dateFromMinimum(4), time: "morning" },
        ],
      }),
    ).toEqual({
      ok: false,
      error: "Choose between one and three appointment options.",
    });
  });

  it("requires different days", () => {
    const date = dateFromMinimum(1);
    const result = parseBookingRequest({
      ...validRequest,
      preferences: [
        { date, time: "morning" },
        { date, time: "afternoon" },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: "Choose different days for each appointment option.",
    });
  });

  it("rejects exact clock times and dates inside the lead time", () => {
    expect(
      parseBookingRequest({
        ...validRequest,
        preferences: [{ date: dateFromMinimum(1), time: "09:00" }],
      }),
    ).toEqual({
      ok: false,
      error: "Complete each appointment option you add.",
    });

    const tomorrow = new Date(
      `${minimumBookingDateValue(new Date(), "America/Los_Angeles")}T12:00:00.000Z`,
    );
    tomorrow.setUTCDate(tomorrow.getUTCDate() - 1);
    expect(
      parseBookingRequest({
        ...validRequest,
        preferences: [
          { date: tomorrow.toISOString().slice(0, 10), time: "morning" },
        ],
      }),
    ).toEqual({
      ok: false,
      error: "Choose a date at least 48 hours from now.",
    });
  });

  it("requires at least one selected treatment", () => {
    expect(parseBookingRequest({ ...validRequest, services: [] })).toEqual({
      ok: false,
      error: "Select at least one treatment.",
    });
  });

  it("rejects malformed contact details", () => {
    expect(
      parseBookingRequest({ ...validRequest, email: "not-an-email" }),
    ).toEqual({
      ok: false,
      error: "Enter a valid email address.",
    });
  });
});

describe("normalizeEmail", () => {
  it("lowercases valid email addresses", () => {
    expect(normalizeEmail(" Person@Example.com ")).toBe("person@example.com");
  });
});

describe("shouldShowBookingTotal", () => {
  it("hides a duplicate total for one unpriced treatment", () => {
    expect(shouldShowBookingTotal(validRequest.services.map((service) => ({
      ...service,
      priceAmount: null,
    })))).toBe(false);
  });

  it("keeps totals for priced or multiple treatments", () => {
    expect(shouldShowBookingTotal(validRequest.services)).toBe(true);
    expect(
      shouldShowBookingTotal([
        ...validRequest.services,
        { ...validRequest.services[0], serviceId: "second", priceAmount: null },
      ]),
    ).toBe(true);
  });
});
