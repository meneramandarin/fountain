import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import {
  extractEmbeddedUrlAddressEvidence,
  extractLiteralCandidateAddressEvidence,
  extractOfficialPageEvidence,
  extractVisibleAddressEvidence,
  inspectOfficialSiteCandidate,
} from "../pipeline/lib/official-site-forensics.mjs";

describe("official site forensics", () => {
  test("extracts address-only JSON-LD, Next hydration data, coordinates, and map links", () => {
    const html = `
      <html>
        <head>
          <title>Infuse Wellness Santa Monica</title>
          <script type="application/ld+json">
            {
              "@type": "MedicalClinic",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "3306 Pico Blvd",
                "addressLocality": "Santa Monica",
                "addressRegion": "CA",
                "postalCode": "90405"
              }
            }
          </script>
          <script id="__NEXT_DATA__" type="application/json">
            {"props":{"branch":{"fullAddress":"3306 Pico Blvd, Santa Monica, CA 90405","lat":34.026,"lng":-118.457}}}
          </script>
        </head>
        <body>
          <a href="https://maps.example.test/?destination=3306%20Pico%20Blvd">Directions</a>
          <p>Visit us at 3306 Pico Blvd in Santa Monica, CA 90405.</p>
        </body>
      </html>
    `;
    const evidence = extractOfficialPageEvidence(html, {
      sourceUrl: "https://infuse.example/locations/santa-monica",
      candidate: { locality: "Santa Monica", region: "CA", postal_code: "90405" },
    });
    expect(evidence.structured_addresses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        streetAddress: "3306 Pico Blvd",
        addressLocality: "Santa Monica",
      }),
      expect.objectContaining({
        fullAddress: "3306 Pico Blvd, Santa Monica, CA 90405",
      }),
    ]));
    expect(evidence.structured_coordinates).toContainEqual({
      latitude: 34.026,
      longitude: -118.457,
    });
    expect(evidence.embedded_location_urls[0]).toContain("destination=");
    expect(evidence.text_snippets.join(" ")).toContain("3306 Pico Blvd");
  });

  test("crawls same-domain sitemap and locality-ranked location pages", async () => {
    const pages = new Map([
      ["https://clinic.example/branch", `
        <a href="/contact">Contact</a>
        <a href="/locations/santa-monica">Santa Monica</a>
      `],
      ["https://clinic.example/", "<a href='/locations'>Locations</a>"],
      ["https://clinic.example/sitemap.xml", `
        <urlset><url><loc>https://clinic.example/locations/santa-monica</loc></url></urlset>
      `],
      ["https://clinic.example/sitemap_index.xml", "<sitemapindex></sitemapindex>"],
      ["https://clinic.example/locations/santa-monica", `
        <script type="application/ld+json">
          {"@type":"PostalAddress","streetAddress":"123 Ocean Ave","addressLocality":"Santa Monica","postalCode":"90401"}
        </script>
      `],
    ]);
    const loadPage = vi.fn(async (url: string) => ({
      outcome: pages.has(url) ? "ok" : "http_error",
      status: pages.has(url) ? 200 : 404,
      finalUrl: url,
      html: pages.get(url) || "",
    }));
    const result = await inspectOfficialSiteCandidate({
      id: 7,
      name: "Clinic",
      website: "https://clinic.example/branch",
      locality: "Santa Monica",
      region: "CA",
    }, { loadPage, maxPages: 12 });
    expect(result.outcome).toBe("evidence_found");
    expect(result.pages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: "https://clinic.example/locations/santa-monica",
        structured_addresses: [
          expect.objectContaining({ streetAddress: "123 Ocean Ave" }),
        ],
      }),
    ]));
    expect(loadPage).not.toHaveBeenCalledWith(expect.stringContaining("google."));
  });

  test("rejects off-domain redirects and links", async () => {
    const loadPage = vi.fn(async (url: string) => ({
      outcome: "ok",
      status: 200,
      finalUrl: url === "https://clinic.example/" ? "https://directory.example/clinic" : url,
      html: "<a href='https://directory.example/clinic'>Directory</a>",
    }));
    const result = await inspectOfficialSiteCandidate({
      id: 8,
      website: "https://clinic.example/",
      locality: "Austin",
    }, { loadPage, maxPages: 2 });
    expect(result.pages).toHaveLength(0);
    expect(result.failures[0].outcome).toBe("off_domain_redirect");
  });

  test("extracts high-confidence visible and officially embedded street addresses", () => {
    expect(extractVisibleAddressEvidence(
      "Contact us at 2202 Wilshire Blvd. Santa Monica, CA 90403 today.",
      { locality: "Santa Monica", region: "CA" },
    )).toContainEqual(expect.objectContaining({
      streetAddress: "2202 Wilshire Blvd",
      postalCode: "90403",
    }));
    expect(extractEmbeddedUrlAddressEvidence([
      "https://maps.example/?q=2202+Wilshire+Blvd.+Santa+Monica%2C+CA+90403",
    ], {
      locality: "Santa Monica",
      region: "CA",
    })).toContainEqual(expect.objectContaining({
      streetAddress: "2202 Wilshire Blvd",
      evidenceSource: "official_embedded_directions",
    }));
    expect(extractVisibleAddressEvidence(
      "Celebrating 26 years Clinic Clinic Dr Miguel in Lisbon.",
      { locality: "Lisbon", region: "Lisbon", country_code: "PT" },
    )).toEqual([]);
  });

  test("confirms an exact official-page address even when generic street grammar rejects it", () => {
    const candidate = {
      address: "9280 US 42 B",
      locality: "Union",
      region: "KY",
      postal_code: "41091",
      country_code: "US",
    };
    expect(extractLiteralCandidateAddressEvidence(
      "<p>HOTWORX Union — 9280 US 42 B, Union, KY 41091</p>",
      "HOTWORX Union — 9280 US 42 B, Union, KY 41091",
      candidate,
    )).toContainEqual(expect.objectContaining({
      streetAddress: "9280 US 42 B",
      evidenceSource: "official_literal_address",
    }));
    expect(extractLiteralCandidateAddressEvidence(
      "<p>Federal Highway, Fort Lauderdale, FL 33308</p>",
      "Federal Highway, Fort Lauderdale, FL 33308",
      {
        ...candidate,
        address: "Federal Highway, Fort Lauderdale, FL 33308",
        locality: "Fort Lauderdale",
        region: "FL",
        postal_code: "33308",
      },
    )).toEqual([]);
  });

  test("extracts evidence from a standalone WordPress REST payload", () => {
    const payload = JSON.stringify({
      title: { rendered: "Lutz Imaging Center" },
      meta: {
        streetAddress: "22299 SR 54 Ste 104",
        addressLocality: "Lutz",
        addressRegion: "FL",
        postalCode: "33549",
      },
      content: {
        rendered: "<p>Visit 22299 SR 54 Ste 104, Lutz, FL 33549</p>",
      },
    });
    const evidence = extractOfficialPageEvidence(payload, {
      sourceUrl: "https://clinic.example/wp-json/wp/v2/locations/4435",
      candidate: {
        address: "22299 SR 54 Ste 104",
        locality: "Lutz",
        region: "FL",
        postal_code: "33549",
        country_code: "US",
      },
    });
    expect(evidence.structured_addresses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        streetAddress: "22299 SR 54 Ste 104",
        addressLocality: "Lutz",
      }),
      expect.objectContaining({
        evidenceSource: "official_literal_address",
      }),
    ]));
  });
});
