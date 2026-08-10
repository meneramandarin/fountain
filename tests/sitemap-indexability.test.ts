import { describe, expect, test } from "vitest";
import { isSitemapLocationIndexable } from "../src/lib/sitemap-indexability";

const completeLocation = {
  slug: "example-clinic-austin",
  title: "Example Clinic",
  hasPlace: true,
  hasContact: true,
  hasOffering: true,
  hasImage: true,
  hasHours: true,
};

describe("sitemap location indexability", () => {
  test("requires a stable slug and public title", () => {
    expect(isSitemapLocationIndexable({ ...completeLocation, slug: "" })).toBe(false);
    expect(isSitemapLocationIndexable({ ...completeLocation, title: "" })).toBe(false);
  });

  test("requires at least two substantive content signals", () => {
    expect(isSitemapLocationIndexable({
      ...completeLocation,
      hasContact: false,
      hasOffering: false,
      hasImage: false,
      hasHours: false,
    })).toBe(false);
    expect(isSitemapLocationIndexable({
      ...completeLocation,
      hasOffering: false,
      hasImage: false,
      hasHours: false,
    })).toBe(true);
  });
});
