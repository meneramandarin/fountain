import { describe, expect, it, vi } from "vitest";

import {
  isBranchSpecificWebsite,
  isOfficialChainSync,
  matchOfficialChainLocation,
} from "../pipeline/lib/official-chain-match.mjs";
import { syncOfficialChains } from "../pipeline/lib/official-chain-sync.mjs";

describe("official chain matching", () => {
  it("matches an existing branch only by exact address", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 42, address: "123 Main St", locality: "Oakland", region: "CA" }],
    });
    const result = await matchOfficialChainLocation({
      address: "123 Main St.",
      locality: "Oakland",
      region: "CA",
      website: "https://example.com/locations/oakland",
      chain_locations_url: "https://example.com/locations",
    }, { query });
    expect(result).toEqual({
      status: "matched",
      location_id: 42,
      method: "official_chain_exact_address",
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not treat a shared chain directory URL as a branch identity", () => {
    const candidate = {
      discovered_groups: ["official_chain_sync"],
      website: "https://jivahealth.com/jivahealth-locations/",
      chain_locations_url: "https://jivahealth.com/jivahealth-locations/",
    };
    expect(isOfficialChainSync(candidate)).toBe(true);
    expect(isBranchSpecificWebsite(candidate)).toBe(false);
  });
});

describe("official chain sync", () => {
  it("builds normalized records from official directory responses in dry-run mode", async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = String(input);
      if (url === "https://hydrationroom.com/locations") {
        return response('<a href="/locations/ca/oakland/123-main-st">Oakland</a>');
      }
      if (url.includes("/locations/ca/oakland/123-main-st")) {
        return response(`<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "Hydration Room",
          url,
          telephone: "(510) 555-0100",
          address: {
            streetAddress: "123 Main St",
            addressLocality: "Oakland",
            addressRegion: "CA",
            postalCode: "94612",
            addressCountry: "US",
          },
          geo: { latitude: 37.8, longitude: -122.27 },
        })}</script>`);
      }
      if (url.includes("api.perspiresaunastudio.com")) {
        return response({
          items: [{
            fieldData: {
              name: "Oakland",
              slug: "oakland",
              address: "456 Broadway",
              city: "Oakland",
              stateprovcode: "CA",
              postalcode: "94607",
              latitude: 37.8,
              longitude: -122.27,
              "studio-status": "Open",
            },
          }],
        });
      }
      if (url.includes("wp-json/brandpie")) {
        return response([{
          title: "Oakland",
          link: "https://simonmed.com/locations/ca/oakland/",
          procedures: ["CT/CAT Scan"],
          "sm-location_address_group": {
            street_address_1: "789 Grand Ave",
            street_address_2: "",
            city: "Oakland",
            state: "CA",
            zipcode: "94610",
          },
          "sm-latitude_longitude": { latitude: "37.81", longitude: "-122.25" },
          "sm-contact_numbers": { phone_number: "(510) 555-0199" },
        }]);
      }
      if (url.includes("jivahealth.com")) return response("official locations");
      throw new Error(`Unexpected URL: ${url}`);
    });
    const result = await syncOfficialChains({
      runId: 1,
      apply: false,
      concurrency: 2,
    }, { fetchImpl });
    expect(result.by_chain).toEqual({
      "Hydration Room": 1,
      "Perspire Sauna Studio": 1,
      "SimonMed Imaging": 1,
      "Jiva Health": 10,
    });
    expect(result.candidates).toBe(13);
  });
});

function response(body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": typeof body === "string" ? "text/html" : "application/json" },
  });
}
