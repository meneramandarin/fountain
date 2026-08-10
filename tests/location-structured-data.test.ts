import { describe, expect, test } from "vitest";
import {
  buildLocationStructuredData,
  serializeStructuredData,
} from "../src/lib/location-structured-data";

const baseUrl = new URL("https://fountain.clinic");

describe("location structured data", () => {
  test("publishes visible clinic facts as LocalBusiness JSON-LD", () => {
    const result = buildLocationStructuredData({
      id: 42,
      slug: "example-clinic-austin",
      name: "Example Clinic",
      address: "100 Main St",
      locality: "Austin",
      region: "TX",
      postal_code: "78701",
      country_code: "US",
      latitude: 30.2672,
      longitude: -97.7431,
      phone: "+1-512-555-0100",
      email: "hello@example.com",
      website: "https://example.com/clinic",
      opening_hours: {
        monday: [{ open: "09:00", close: "17:00" }],
      },
      images: [{ blob_url: "https://assets.example.com/clinic.jpg" }],
    }, baseUrl);

    expect(result).toMatchObject({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "@id": "https://fountain.clinic/directory/locations/example-clinic-austin#business",
      name: "Example Clinic",
      url: "https://fountain.clinic/directory/locations/example-clinic-austin",
      sameAs: "https://example.com/clinic",
      telephone: "+1-512-555-0100",
      email: "hello@example.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "100 Main St",
        addressLocality: "Austin",
        addressRegion: "TX",
        postalCode: "78701",
        addressCountry: "US",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 30.2672,
        longitude: -97.7431,
      },
      image: ["https://assets.example.com/clinic.jpg"],
      openingHoursSpecification: [{
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "https://schema.org/Monday",
        opens: "09:00",
        closes: "17:00",
      }],
    });
  });

  test("omits invalid optional facts and safely serializes markup", () => {
    const result = buildLocationStructuredData({
      id: 7,
      org_name: "Clinic <Seven>",
      latitude: 200,
      longitude: -97,
      website: "javascript:alert(1)",
      images: [{ blob_url: "data:image/png;base64,abc" }],
    }, baseUrl);

    expect(result).not.toHaveProperty("geo");
    expect(result).not.toHaveProperty("sameAs");
    expect(result).not.toHaveProperty("image");
    expect(serializeStructuredData(result!)).toContain("Clinic \\u003cSeven>");
  });
});
