import { describe, expect, test } from "vitest";

import { normalizeNewsletterEmail } from "../src/lib/newsletter";

describe("normalizeNewsletterEmail", () => {
  test("normalizes case and surrounding whitespace", () => {
    expect(normalizeNewsletterEmail("  Hello+News@Example.COM ")).toBe(
      "hello+news@example.com",
    );
  });

  test.each([
    null,
    undefined,
    "",
    "not-an-email",
    "@example.com",
    "hello@example",
    "hello @example.com",
  ])("rejects invalid input %j", (value) => {
    expect(normalizeNewsletterEmail(value)).toBeNull();
  });
});
