import { describe, expect, test } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import {
  extractOfficialCoordinateObjects,
  resolveOfficialPageCoordinates,
  selectOfficialCoordinateEvidence,
  validateExactBranchAddress,
} from "../pipeline/lib/official-coordinate-evidence.mjs";

const candidate = {
  name: "Example Longevity",
  website: "https://www.example.com/locations/boulder",
  address: "2255 31st Street, Suite 110",
  locality: "Boulder",
  region: "CO",
  postal_code: "80301",
  country_code: "US",
};

describe("official coordinate evidence", () => {
  test("extracts coordinate-bearing place subtypes from arrays and nested @graph", () => {
    const html = pageWithJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          name: "Parent organization",
        },
        {
          "@type": ["MedicalClinic", "DiagnosticLab"],
          name: "Example Longevity",
          address: {
            "@type": "PostalAddress",
            streetAddress: "2255 31st Street",
            addressLocality: "Boulder",
            addressRegion: "CO",
            postalCode: "80301",
            addressCountry: "USA",
          },
          geo: {
            "@type": "GeoCoordinates",
            latitude: "40.023810",
            longitude: "-105.253180",
          },
        },
      ],
    });

    expect(extractOfficialCoordinateObjects(html, {
      sourceUrl: "https://example.com/locations/boulder",
    })).toEqual([{
      latitude: 40.02381,
      longitude: -105.25318,
      structured_type: ["MedicalClinic", "DiagnosticLab"],
      structured_name: "Example Longevity",
      address: {
        street: "2255 31st Street",
        locality: "Boulder",
        region: "CO",
        postal: "80301",
        country: "US",
      },
      source_url: "https://example.com/locations/boulder",
    }]);
  });

  test("ignores malformed JSON-LD, generic organizations, and invalid coordinates", () => {
    const html = [
      "<script type=\"application/ld+json\">{not-json}</script>",
      pageWithJsonLd({
        "@type": "Organization",
        address: postalAddress(),
        geo: { latitude: 40, longitude: -105 },
      }),
      pageWithJsonLd({
        "@type": "MedicalClinic",
        address: postalAddress(),
        geo: { latitude: 140, longitude: -105 },
      }),
      pageWithJsonLd({
        "@type": "MedicalClinic",
        address: postalAddress(),
        geo: { latitude: 0, longitude: 0 },
      }),
    ].join("");

    expect(extractOfficialCoordinateObjects(html)).toEqual([]);
  });

  test("requires an exact house number, street identity, country, and location axis", () => {
    expect(validateExactBranchAddress(candidate, {
      street: "2255 31st Street",
      locality: "Boulder",
      region: "CO",
      postal: "80301",
      country: "US",
    })).toMatchObject({
      verified: true,
      house_number_match: true,
      street_match: true,
      locality_match: true,
      country_match: true,
    });

    expect(validateExactBranchAddress(candidate, {
      street: "2256 31st Street",
      locality: "Boulder",
      region: "CO",
      postal: "80301",
      country: "US",
    })).toMatchObject({
      verified: false,
      house_number_match: false,
    });

    expect(validateExactBranchAddress(candidate, {
      street: "2255 31st Street",
      locality: "Atlanta",
      region: "GA",
      postal: "30339",
      country: "US",
    })).toMatchObject({
      verified: false,
      location_match: false,
    });

    expect(validateExactBranchAddress(candidate, {
      street: "2255 31st Street",
      locality: "Boulder",
      region: "CO",
      postal: "80301",
      country: "CA",
    })).toMatchObject({
      verified: false,
      country_match: false,
    });
  });

  test("does not mistake a matching suite number for a mismatched house number", () => {
    expect(validateExactBranchAddress({
      ...candidate,
      address: "325 Holiday Ct, Suite 112",
      locality: "La Jolla",
      region: "CA",
      postal_code: "92037",
    }, {
      street: "3252 Holiday Ct, Suite 112",
      locality: "La Jolla",
      region: "CA",
      postal: "92037",
      country: "US",
    })).toMatchObject({
      verified: false,
      candidate_house_number: "325",
      official_house_number: "3252",
      house_number_match: false,
    });
  });

  test("accepts an unnumbered named venue only with three address tokens", () => {
    expect(validateExactBranchAddress({
      ...candidate,
      address: "The Taste Thonglor, 2nd Floor",
      locality: "Bangkok",
      region: "Bangkok",
      postal_code: null,
      country_code: "TH",
    }, {
      street: "The Taste Thonglor, 2nd Floor, Bangkok",
      locality: "Bangkok",
      region: "Bangkok",
      postal: null,
      country: "TH",
    })).toMatchObject({
      verified: true,
      numbered: false,
      required_street_tokens: 3,
    });

    expect(validateExactBranchAddress({
      ...candidate,
      address: "Business Bay",
      locality: "Dubai",
      region: "Dubai",
      postal_code: null,
      country_code: "AE",
    }, {
      street: "Business Bay",
      locality: "Dubai",
      region: "Dubai",
      postal: null,
      country: "AE",
    })).toMatchObject({
      verified: false,
      street_match: false,
    });
  });

  test("collapses duplicate evidence to one coordinate but rejects conflicting pairs", () => {
    const address = {
      street: "2255 31st Street",
      locality: "Boulder",
      region: "CO",
      postal: "80301",
      country: "US",
    };
    const first = coordinateEvidence(40.0238101, -105.2531801, address);
    const duplicate = coordinateEvidence(40.0238102, -105.2531802, address);
    const conflict = coordinateEvidence(40.5, -105.5, address);

    expect(selectOfficialCoordinateEvidence(candidate, [first, duplicate])).toMatchObject({
      outcome: "matched",
      unique_coordinate_pairs: 1,
      latitude: 40.0238101,
      longitude: -105.2531801,
    });
    expect(selectOfficialCoordinateEvidence(candidate, [first, conflict])).toMatchObject({
      outcome: "ambiguous",
      unique_coordinate_pairs: 2,
    });
  });

  test("requires an official page host and returns provenance for a unique match", () => {
    const officialHtml = pageWithJsonLd({
      "@type": "MedicalClinic",
      name: "Example Longevity",
      address: postalAddress(),
      geo: { latitude: 40.02381, longitude: -105.25318 },
    });
    const result = resolveOfficialPageCoordinates(candidate, [
      { url: "https://directory.example.net/place", html: officialHtml },
      { url: "https://example.com/locations/boulder", html: officialHtml },
    ]);

    expect(result).toMatchObject({
      outcome: "matched",
      provider: "official_site_jsonld",
      latitude: 40.02381,
      longitude: -105.25318,
      source_url: "https://example.com/locations/boulder",
      structured_type: ["MedicalClinic"],
      structured_name: "Example Longevity",
      pages_rejected_for_host: 1,
      exact_branch_matches: 1,
      unique_coordinate_pairs: 1,
    });
  });

  test("holds an official canonical address correction instead of silently applying it", () => {
    const result = resolveOfficialPageCoordinates({
      ...candidate,
      name: "Equinox West Palm Beach",
      website: "https://www.equinox.com/clubs/florida/westpalmbeach",
      address: "5 S Rosemary Ave",
      locality: "West Palm Beach",
      region: "FL",
      postal_code: "33401",
    }, [{
      url: "https://www.equinox.com/clubs/florida/westpalmbeach",
      html: pageWithJsonLd({
        "@type": "ExerciseGym",
        name: "Equinox West Palm Beach",
        address: {
          "@type": "PostalAddress",
          streetAddress: "575 S Rosemary Ave",
          addressLocality: "West Palm Beach",
          addressRegion: "FL",
          postalCode: "33401",
          addressCountry: "US",
        },
        geo: { latitude: 26.7089552, longitude: -80.0624079 },
      }),
    }]);

    expect(result).toMatchObject({
      outcome: "no_match",
      considered: 1,
      exact_branch_matches: 0,
    });
  });
});

function pageWithJsonLd(value: unknown) {
  return `<script data-test="location" type="application/ld+json">${JSON.stringify(value)}</script>`;
}

function postalAddress() {
  return {
    "@type": "PostalAddress",
    streetAddress: "2255 31st Street",
    addressLocality: "Boulder",
    addressRegion: "CO",
    postalCode: "80301",
    addressCountry: "US",
  };
}

function coordinateEvidence(
  latitude: number,
  longitude: number,
  address: Record<string, unknown>,
) {
  return {
    latitude,
    longitude,
    source_url: "https://example.com/locations/boulder",
    structured_type: ["MedicalClinic"],
    structured_name: "Example Longevity",
    address,
  };
}
