import { describe, expect, test } from "vitest";

import {
  addFountainReferralParams,
  extractGoogleSerpRedirectTarget,
  isGoogleSerpRedirectWrapper,
  sanitizeUrl,
  shouldSkipFountainReferralParams,
} from "../src/lib/url-sanitize.mjs";

describe("URL sanitizer", () => {
  test("removes tracking parameters while preserving ordinary parameters and fragments", () => {
    expect(sanitizeUrl("https://example.com/path?utm_source=x&keep=1&gclid=abc#section"))
      .toBe("https://example.com/path?keep=1#section");
    expect(sanitizeUrl("https://example.com/path?utm_medium=email&fbclid=abc"))
      .toBe("https://example.com/path");
    expect(sanitizeUrl("example.com/path?mc_cid=abc&keep=yes"))
      .toBe("example.com/path?keep=yes");
    expect(sanitizeUrl("https://example.com/path?ref=doctor-directory&keep=yes"))
      .toBe("https://example.com/path?ref=doctor-directory&keep=yes");
  });

  test("handles tracker-specific ref and nested tracking parameters", () => {
    expect(sanitizeUrl(
      "https://www.googleadservices.com/pagead?url=https%3A%2F%2Fexample.com&ref=https%3A%2F%2Fsource.example",
    )).toBe("https://www.googleadservices.com/pagead?url=https%3A%2F%2Fexample.com");
    expect(sanitizeUrl("/url?q=https://example.com/path%3Futm_source%3Dgoogle%26keep%3D1&opi=abc"))
      .toBe("/url?q=https%3A%2F%2Fexample.com%2Fpath%3Fkeep%3D1&opi=abc");
    expect(sanitizeUrl(
      "https://example.com/specialties/wound-care?location=clinic-slug%3Futm_campaign%3Dcorp_listings_mgmt",
    )).toBe("https://example.com/specialties/wound-care?location=clinic-slug");
  });

  test("adds Fountain referral parameters except for denylisted hosts", () => {
    expect(addFountainReferralParams("https://example.com/path?keep=1"))
      .toBe("https://example.com/path?keep=1&utm_source=fountain.clinic&utm_medium=referral");
    expect(shouldSkipFountainReferralParams("https://shawellnessclinic.com/programs")).toBe(true);
    expect(shouldSkipFountainReferralParams("https://booking.shawellnessclinic.com/programs")).toBe(true);
    expect(addFountainReferralParams("https://shawellnessclinic.com/programs"))
      .toBe("https://shawellnessclinic.com/programs");
  });

  test("detects and unwraps Google search-result redirects", () => {
    expect(isGoogleSerpRedirectWrapper(
      "/url?q=https%3A%2F%2Fwww.carilionclinic.org%2F&sa=U&ved=abc",
    )).toBe(true);
    expect(extractGoogleSerpRedirectTarget(
      "/url?q=https%3A%2F%2Fwww.carilionclinic.org%2F%3Futm_source%3Dgoogle&sa=U&ved=abc",
    )).toBe("https://www.carilionclinic.org/");
  });
});
