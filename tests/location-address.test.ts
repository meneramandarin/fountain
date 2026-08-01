import { describe, expect, it } from "vitest";
import { formatLocationAddress } from "../src/lib/location-address";

describe("formatLocationAddress", () => {
  it("removes a structured suffix appended after a complete US address", () => {
    expect(formatLocationAddress({
      address: "347 5th Ave 606 B, New York, NY 10016, USA, New York, NY, 10016",
      locality: "New York",
      region: "NY",
      postalCode: "10016",
      countryCode: "US",
      countryName: "United States",
    })).toBe("347 5th Ave 606 B, New York, NY 10016, USA");
  });

  it("removes a repeated Canadian locality suffix and retains its postal code", () => {
    expect(formatLocationAddress({
      address: "234 Lockhart Rd, Barrie, ON, Barrie, ON, L4N 9G8, CA",
      locality: "Barrie",
      region: "ON",
      postalCode: "L4N 9G8",
      countryCode: "CA",
      countryName: "Canada",
    })).toBe("234 Lockhart Rd, Barrie, ON, L4N 9G8");
  });

  it("removes an appended international locality and country-code suffix", () => {
    expect(formatLocationAddress({
      address: "Lindenberger Weg 27, 13125 Berlin, Germany, Berlin, DE",
      locality: "Berlin",
      countryCode: "DE",
      countryName: "Germany",
    })).toBe("Lindenberger Weg 27, 13125 Berlin, Germany");
  });

  it("leaves a normal structured address unchanged", () => {
    expect(formatLocationAddress({
      address: "2255 31st St, Boulder, CO 80301, USA",
      locality: "Boulder",
      region: "CO",
      postalCode: "80301",
      countryCode: "US",
      countryName: "United States",
    })).toBe("2255 31st St, Boulder, CO 80301, USA");
  });
});
