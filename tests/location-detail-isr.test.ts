import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const routeSource = readFileSync(
  new URL("../src/app/directory/locations/[slug]/page.tsx", import.meta.url),
  "utf8",
);

describe("location detail ISR", () => {
  test("keeps request search parameters out of the cached server route", () => {
    expect(routeSource).toContain("export const revalidate = 3_600");
    expect(routeSource).not.toContain("searchParams");
  });
});
