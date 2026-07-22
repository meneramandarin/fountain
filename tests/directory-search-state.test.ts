import { describe, expect, test } from "vitest";
import {
  directoryParamsFromState,
  directoryStateFromSearchParams,
} from "../src/lib/directory-search-state";

describe("directory search state", () => {
  test("preserves treatment and city inputs used by server-rendered searches", () => {
    const state = directoryStateFromSearchParams({
      q: "DEXA scan",
      city_label: "Austin, TX",
      city_country: "US",
      city_lat: "30.2672",
      city_lng: "-97.7431",
    });

    expect(directoryParamsFromState(state)).toMatchObject({
      kind: "locations",
      q: "DEXA scan",
      city_label: "Austin, TX",
      city_country: "US",
      city_lat: 30.2672,
      city_lng: -97.7431,
    });
  });
});
