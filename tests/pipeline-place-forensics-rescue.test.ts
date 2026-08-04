import { describe, expect, test } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import { selectStructuredAddressProposal } from "../pipeline/lib/place-forensics-rescue.mjs";

const candidate = {
  address: "1411 7th St",
  locality: "Santa Monica",
  region: "CA",
  postal_code: "90401",
  country_code: "US",
};

describe("deterministic official address rescue", () => {
  test("selects a unique locality-compatible structured address", () => {
    const result = selectStructuredAddressProposal(candidate, {
      pages: [{
        url: "https://clinic.example/contact",
        structured_addresses: [{
          "@type": "PostalAddress",
          streetAddress: "3306 Pico Blvd",
          addressLocality: "Santa Monica",
          addressRegion: "California",
          postalCode: "90405",
          addressCountry: "US",
        }],
      }],
    });
    expect(result).toMatchObject({
      accepted: true,
      address: {
        street: "3306 Pico Blvd",
        locality: "Santa Monica",
        region: "California",
        postal_code: "90405",
        country_code: "US",
      },
      evidence_url: "https://clinic.example/contact",
    });
  });

  test("does not select another branch from a multi-location page", () => {
    const result = selectStructuredAddressProposal(candidate, {
      pages: [{
        url: "https://clinic.example/locations",
        structured_addresses: [
          {
            streetAddress: "100 Main St",
            addressLocality: "Los Angeles",
            addressRegion: "CA",
            postalCode: "90001",
          },
          {
            streetAddress: "200 Main St",
            addressLocality: "Beverly Hills",
            addressRegion: "CA",
            postalCode: "90210",
          },
        ],
      }],
    });
    expect(result).toMatchObject({ accepted: false, outcome: "no_locality_match" });
  });

  test("keeps multiple same-city branches ambiguous unless one matches the staged street", () => {
    const evidence = {
      pages: [{
        url: "https://clinic.example/locations",
        structured_addresses: [
          {
            streetAddress: "1411 7th St",
            addressLocality: "Santa Monica",
            postalCode: "90401",
          },
          {
            streetAddress: "3306 Pico Blvd",
            addressLocality: "Santa Monica",
            postalCode: "90405",
          },
        ],
      }],
    };
    expect(selectStructuredAddressProposal(candidate, evidence)).toMatchObject({
      accepted: true,
      address: { street: "1411 7th St" },
    });
    expect(selectStructuredAddressProposal({
      ...candidate,
      address: "123 Example Rd",
      postal_code: null,
    }, evidence)).toMatchObject({
      accepted: false,
      outcome: "ambiguous",
    });
  });

  test("requires a branch-specific official URL before correcting a chain address", () => {
    const result = selectStructuredAddressProposal({
      ...candidate,
      name: "Spa Sydell Integrative Aesthetics - Buckhead",
      chain_name: "Spa Sydell",
      locality: "Atlanta",
      address: "3005 Peachtree Rd Suite E",
    }, {
      pages: [{
        url: "https://www.spasydell.example/integrative-aesthetics-defined/",
        structured_addresses: [{
          streetAddress: "4520 Olde Perimeter Way",
          addressLocality: "Atlanta",
          addressRegion: "GA",
        }],
      }],
    });
    expect(result).toMatchObject({ accepted: false, outcome: "ambiguous" });
  });

  test("holds conflicting suites and locality-only correction proposals", () => {
    expect(selectStructuredAddressProposal({
      ...candidate,
      address: "320 Pine Ave, Suite 609",
      locality: "Long Beach",
      postal_code: "90802",
    }, {
      pages: [{
        url: "https://clinic.example/location",
        structured_addresses: [{
          streetAddress: "320 Pine Ave, Suite 699",
          addressLocality: "Long Beach",
          postalCode: "90802",
        }],
      }],
    })).toMatchObject({ accepted: false, outcome: "ambiguous" });
    expect(selectStructuredAddressProposal({
      ...candidate,
      address: "Rua da Prata 4",
      locality: "Lisbon",
      country_code: "PT",
      postal_code: "1100-420",
    }, {
      pages: [{
        url: "https://clinic.example/",
        structured_addresses: [{
          formattedAddress: "Lisbon, Portugal",
          addressLocality: "Lisbon",
          addressCountry: "PT",
        }],
      }],
    })).toMatchObject({ accepted: false, outcome: "ambiguous" });
  });
});
