import { describe, expect, test } from "vitest";
import { parseDirectoryReturn } from "../src/lib/directory-return-navigation";

const savedAt = Date.parse("2026-08-10T12:00:00Z");

describe("directory return navigation", () => {
  test("restores the exact directory search for the matching listing", () => {
    const raw = JSON.stringify({
      destinationPath: "/directory/locations/example-clinic",
      returnHref: "/directory?kind=locations&treatment_id=3&city_label=Austin%2C+TX",
      savedAt,
    });

    expect(parseDirectoryReturn(raw, "/directory/locations/example-clinic", savedAt + 1_000)).toBe(
      "/directory?kind=locations&treatment_id=3&city_label=Austin%2C+TX",
    );
  });

  test("rejects stale, mismatched, and non-directory destinations", () => {
    const record = {
      destinationPath: "/directory/locations/example-clinic",
      returnHref: "/directory?kind=locations",
      savedAt,
    };

    expect(parseDirectoryReturn(JSON.stringify(record), "/directory/locations/other", savedAt + 1_000)).toBeNull();
    expect(parseDirectoryReturn(JSON.stringify(record), record.destinationPath, savedAt + 3_600_001)).toBeNull();
    expect(parseDirectoryReturn(JSON.stringify({ ...record, returnHref: "/journal" }), record.destinationPath, savedAt + 1_000)).toBeNull();
  });
});
