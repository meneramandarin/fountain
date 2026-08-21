import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { HbotComparisonGuide } from "../src/components/hbot-comparison-guide";

describe("HBOT comparison guide", () => {
  test("explains the provider dimensions without making a booking or outcome claim", () => {
    const markup = renderToStaticMarkup(createElement(HbotComparisonGuide));

    expect(markup).toContain("Compare Miami HBOT providers beyond price");
    expect(markup).toContain("Clinical setting");
    expect(markup).toContain("Chamber and pressure");
    expect(markup).toContain("Screening and oversight");
    expect(markup).toContain("Total treatment cost");
    expect(markup).toContain("FDA&#x27;s HBOT device safety guidance");
    expect(markup).not.toMatch(/book now|guaranteed|best provider/i);
  });
});
