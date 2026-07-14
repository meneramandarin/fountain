import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { BackPillLink } from "../src/components/back-pill-link";

describe("BackPillLink", () => {
  test("renders a crawlable parent link with a decorative arrow", () => {
    const markup = renderToStaticMarkup(
      BackPillLink({ children: "All treatments", href: "/treatments" }),
    );

    expect(markup).toContain('href="/treatments"');
    expect(markup).toContain("All treatments");
    expect(markup).toContain('aria-hidden="true"');
  });
});
