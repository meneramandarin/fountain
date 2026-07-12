import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline intentionally uses native .mjs modules.
import * as geocode from "../pipeline/tasks/geocode.mjs";

const {
  buildGeocodeQuery,
  guardedWriteCoordinates,
  handleGeocode,
  hasValidCoordinates,
  validateGeocodeCandidate,
} = geocode;

describe("geocode queue handler", () => {
  test.each([
    [{ status: "hidden" }, "location_not_active"],
    [{ deleted_at: "2026-07-12T01:00:00.000Z" }, "location_not_active"],
    [{ is_virtual: true }, "virtual_location"],
    [{ non_suppressed: false }, "location_suppressed"],
    [{ latitude: 30.2672, longitude: -97.7431 }, "coordinates_already_valid"],
  ])("skips an ineligible location before provider or ledger calls: %s", async (override, reason) => {
    const placesClient = { searchText: vi.fn(), getDetails: vi.fn() };
    const recordWrite = vi.fn();
    const result = await handleGeocode(taskInput(101), {
      query: initialQuery(locationRow({ id: 101, ...override })),
      placesClient,
      recordWrite,
      detailsCostUsd: 0.005,
    });

    expect(result).toMatchObject({ outcome: "skipped", reason });
    expect(placesClient.searchText).not.toHaveBeenCalled();
    expect(placesClient.getDetails).not.toHaveBeenCalled();
    expect(recordWrite).not.toHaveBeenCalled();
  });

  test("fails closed before any provider call when details pricing is not approved", async () => {
    const placesClient = { searchText: vi.fn(), getDetails: vi.fn() };
    const result = await handleGeocode(taskInput(102), {
      query: initialQuery(locationRow({ id: 102 })),
      placesClient,
      recordWrite: vi.fn(),
    });

    expect(result).toMatchObject({
      outcome: "needs_human_review",
      reason: "places_details_price_not_approved",
      serving_write: { attempted: false, written: false },
    });
    expect(placesClient.searchText).not.toHaveBeenCalled();
    expect(placesClient.getDetails).not.toHaveBeenCalled();
  });

  test("uses a stored Google provider ID, validates its address, and atomically guards both coordinate fields", async () => {
    const state = locationRow({
      id: 103,
      external_place_matches: [{
        provider: "google_places",
        provider_place_id: "stored-alpha",
        match_status: "matched",
      }],
    });
    const placesClient = {
      searchText: vi.fn(),
      getDetails: vi.fn(async (request: Record<string, unknown>) => {
        expect(request).toMatchObject({
          taskType: "geocode",
          entityId: 103,
          placeId: "stored-alpha",
          regionCode: "US",
          costEstimateUsd: 0.005,
        });
        return placeDetails({
          id: "stored-alpha",
          latitude: 30.26721,
          longitude: -97.74311,
          externalCallId: 7001,
          displayName: null,
        });
      }),
    };
    const writes = coordinateWriteHarness(state);

    const result = await handleGeocode(taskInput(103), {
      query: initialQuery(state),
      placesClient,
      recordWrite: writes.recordWrite,
      setActor: writes.setActor,
      detailsCostUsd: 0.005,
    });

    expect(placesClient.searchText).not.toHaveBeenCalled();
    expect(placesClient.getDetails).toHaveBeenCalledTimes(1);
    expect(writes.guards).toEqual([
      { field: "latitude", nested: false },
      { field: "longitude", nested: true },
    ]);
    expect(writes.coordinateUpdates).toHaveLength(1);
    expect(writes.eventStamps).toHaveLength(1);
    expect(writes.setActor).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      outcome: "geocoded",
      final: { latitude: 30.26721, longitude: -97.74311 },
      selected: {
        provider_place_id: "stored-alpha",
        source: "stored_provider_match",
        validation: { valid: true, reason: "identity_validated" },
      },
      write: {
        attempted: true,
        written: true,
        fields: ["latitude", "longitude"],
        event_stamped: true,
      },
    });
  });

  test("searches ID-only then validates details when no stored provider ID exists", async () => {
    const state = locationRow({ id: 104, latitude: 91, longitude: -97 });
    const placesClient = {
      searchText: vi.fn(async (request: Record<string, unknown>) => {
        expect(request).toMatchObject({
          taskType: "geocode",
          entityId: 104,
          maxResultCount: 3,
          regionCode: "US",
        });
        return {
          data: { places: [{ id: "alpha-search" }] },
          externalCallId: 7100,
          fieldMask: "places.id",
          costEstimateUsd: 0,
        };
      }),
      getDetails: vi.fn(async () => placeDetails({
        id: "alpha-search",
        latitude: 30.2673,
        longitude: -97.7432,
        externalCallId: 7101,
      })),
    };
    const writes = coordinateWriteHarness(state);

    const result = await handleGeocode(taskInput(104), {
      query: initialQuery(state),
      placesClient,
      recordWrite: writes.recordWrite,
      setActor: writes.setActor,
      detailsCostUsd: 0.005,
    });

    expect(result.outcome).toBe("geocoded");
    expect(result.selected).toMatchObject({
      provider_place_id: "alpha-search",
      source: "search_candidate_details",
    });
    expect(result.evidence.calls.map((call: { operation: string }) => call.operation)).toEqual([
      "search_text",
      "details",
    ]);
  });

  test("holds distinct identity-valid results for human review as ambiguous", async () => {
    const state = locationRow({ id: 105 });
    const placesClient = {
      searchText: vi.fn(async () => ({
        data: { places: [{ id: "alpha-a" }, { id: "alpha-b" }] },
        externalCallId: 7200,
      })),
      getDetails: vi.fn(async ({ placeId }: { placeId: string }) => placeId === "alpha-a"
        ? placeDetails({
          id: placeId,
          latitude: 30.2672,
          longitude: -97.7431,
          externalCallId: 7201,
        })
        : placeDetails({
          id: placeId,
          latitude: 30.2772,
          longitude: -97.7531,
          externalCallId: 7202,
        })),
    };
    const recordWrite = vi.fn();

    const result = await handleGeocode(taskInput(105), {
      query: initialQuery(state),
      placesClient,
      recordWrite,
      detailsCostUsd: 0.005,
    });

    expect(result).toMatchObject({
      outcome: "needs_human_review",
      reason: "ambiguous_identity_valid_candidates",
      serving_write: { attempted: false, written: false },
    });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((candidate: { validation: { valid: boolean } }) => (
      candidate.validation.valid
    ))).toBe(true);
    expect(recordWrite).not.toHaveBeenCalled();
  });

  test("accepts duplicate provider records only when they resolve to the same physical address", async () => {
    const state = locationRow({ id: 106 });
    const placesClient = {
      searchText: vi.fn(async () => ({
        data: { places: [{ id: "duplicate-a" }, { id: "duplicate-b" }] },
        externalCallId: 7300,
      })),
      getDetails: vi.fn(async ({ placeId }: { placeId: string }) => placeDetails({
        id: placeId,
        latitude: placeId === "duplicate-a" ? 30.2672 : 30.26721,
        longitude: placeId === "duplicate-a" ? -97.7431 : -97.74311,
        externalCallId: placeId === "duplicate-a" ? 7301 : 7302,
      })),
    };
    const writes = coordinateWriteHarness(state);

    const result = await handleGeocode(taskInput(106), {
      query: initialQuery(state),
      placesClient,
      recordWrite: writes.recordWrite,
      setActor: writes.setActor,
      detailsCostUsd: 0.005,
    });

    expect(result).toMatchObject({
      outcome: "geocoded",
      selected: { equivalent_candidate_count: 2 },
    });
  });

  test("does not write out-of-range or address-mismatched provider results", async () => {
    const cases = [
      {
        id: 107,
        details: placeDetails({ id: "bad-range", latitude: 95, longitude: -97 }),
        validationReason: "coordinates_out_of_range",
      },
      {
        id: 108,
        details: placeDetails({
          id: "wrong-address",
          latitude: 32.7767,
          longitude: -96.797,
          formattedAddress: "900 Elm Street, Dallas, TX 75201, USA",
        }),
        validationReason: "address_identity_mismatch",
      },
    ];
    for (const item of cases) {
      const recordWrite = vi.fn();
      const result = await handleGeocode(taskInput(item.id), {
        query: initialQuery(locationRow({ id: item.id })),
        placesClient: {
          searchText: vi.fn(async () => ({ data: { places: [{ id: `place-${item.id}` }] } })),
          getDetails: vi.fn(async () => item.details),
        },
        recordWrite,
        detailsCostUsd: 0.005,
      });

      expect(result).toMatchObject({
        outcome: "needs_human_review",
        reason: "no_identity_valid_candidate",
      });
      expect(result.candidates[0].validation.reason).toBe(item.validationReason);
      expect(recordWrite).not.toHaveBeenCalled();
    }
  });

  test("holds a partially failed candidate set because ambiguity cannot be ruled out", async () => {
    const placesClient = {
      searchText: vi.fn(async () => ({
        data: { places: [{ id: "good" }, { id: "unavailable" }] },
      })),
      getDetails: vi.fn(async ({ placeId }: { placeId: string }) => {
        if (placeId === "unavailable") throw new Error("temporary provider failure");
        return placeDetails({ id: placeId, latitude: 30.2672, longitude: -97.7431 });
      }),
    };
    const result = await handleGeocode(taskInput(109), {
      query: initialQuery(locationRow({ id: 109 })),
      placesClient,
      recordWrite: vi.fn(),
      detailsCostUsd: 0.005,
    });

    expect(result).toMatchObject({
      outcome: "needs_human_review",
      reason: "candidate_details_incomplete",
    });
  });

  test.each([
    [{ status: "hidden" }, "location_not_active"],
    [{ deleted_at: "2026-07-12T08:00:00.000Z" }, "location_not_active"],
    [{ is_virtual: true }, "virtual_location"],
    [{ non_suppressed: false }, "location_suppressed"],
    [{ latitude: 30.2672, longitude: -97.7431 }, "coordinates_already_valid"],
  ])("rechecks every eligibility invariant under the coordinate transaction: %s", async (override, reason) => {
    const tx = geocodeTransaction(override);
    const recordWrite = nestedLedgerHarness(tx).recordWrite;
    const setActor = vi.fn();

    const result = await guardedWriteCoordinates(writeInput(201), { recordWrite, setActor });

    expect(result).toMatchObject({
      attempted: true,
      written: false,
      reason,
    });
    expect(setActor).not.toHaveBeenCalled();
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE fountain.locations"))).toBe(false);
  });

  test.each([
    ["latitude", "human_verified", "latitude_field_human_verified"],
    ["longitude", "owner_verified", "longitude_field_owner_verified"],
  ])("refuses the whole coordinate pair when the %s ledger field is protected", async (blockedField, guardReason, expectedReason) => {
    const tx = geocodeTransaction({});
    const ledger = nestedLedgerHarness(tx, { [blockedField]: guardReason });
    const setActor = vi.fn();

    const result = await guardedWriteCoordinates(writeInput(202), {
      recordWrite: ledger.recordWrite,
      setActor,
    });

    expect(result).toMatchObject({ attempted: true, written: false, reason: expectedReason });
    expect(setActor).not.toHaveBeenCalled();
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE fountain.locations"))).toBe(false);
  });
});

describe("geocode candidate validation", () => {
  test("requires finite in-range non-null coordinate pairs and treats 0,0 as invalid", () => {
    expect(hasValidCoordinates({ latitude: 0, longitude: 12 })).toBe(true);
    expect(hasValidCoordinates({ latitude: 0, longitude: 0 })).toBe(false);
    expect(hasValidCoordinates({ latitude: 91, longitude: 12 })).toBe(false);
    expect(hasValidCoordinates({ latitude: 30, longitude: null })).toBe(false);
  });

  test("requires street/location identity and rejects an explicit foreign country", () => {
    const location = locationRow({ id: 301 });
    const accepted = validateGeocodeCandidate(location, placeDetails({
      id: "accepted",
      latitude: 30.2672,
      longitude: -97.7431,
    }).data);
    const rejected = validateGeocodeCandidate(location, placeDetails({
      id: "rejected",
      latitude: 30.2672,
      longitude: -97.7431,
      formattedAddress: "123 Main Street, Toronto, ON M5V 2T6, Canada",
    }).data);

    expect(accepted).toMatchObject({
      valid: true,
      checks: {
        address_identity: true,
        street_number_match: true,
        locality_match: true,
        postal_code_match: true,
        country_match: true,
      },
    });
    expect(rejected).toMatchObject({
      valid: false,
      reason: "country_mismatch",
      checks: { country_match: false },
    });

    const wrongBranch = validateGeocodeCandidate(location, placeDetails({
      id: "wrong-branch",
      latitude: 32.7767,
      longitude: -96.797,
      formattedAddress: "123 Main Street, Dallas, TX 75201, USA",
    }).data);
    expect(wrongBranch).toMatchObject({
      valid: false,
      reason: "address_identity_mismatch",
      checks: {
        street_number_match: true,
        locality_match: false,
        postal_code_match: false,
      },
    });
  });

  test("validates locality-only rows without requiring the non-Essentials displayName field", () => {
    const candidate = placeDetails({
      id: "locality-only",
      latitude: 30.2672,
      longitude: -97.7431,
      formattedAddress: "Austin, TX, USA",
      displayName: null,
    }).data;
    const validation = validateGeocodeCandidate(locationRow({
      address: null,
      postal_code: null,
    }), candidate);

    expect(validation).toMatchObject({
      valid: true,
      display_name: null,
      checks: {
        address_identity: true,
        locality_match: true,
        region_match: true,
      },
    });
  });

  test("builds an address-rich provider query", () => {
    expect(buildGeocodeQuery(locationRow())).toBe(
      "Alpha Longevity, 123 Main Street, Austin, TX, 78701, US",
    );
  });
});

function taskInput(locationId: number) {
  return {
    task: { id: "900", entity_type: "location", entity_id: locationId, payload: {} },
    run: { id: "80" },
  };
}

function locationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Alpha Longevity",
    address: "123 Main Street",
    locality: "Austin",
    region: "TX",
    postal_code: "78701",
    country_code: "US",
    latitude: null,
    longitude: null,
    status: "active",
    deleted_at: null,
    is_virtual: false,
    organization_name: null,
    external_place_matches: [],
    non_suppressed: true,
    ...overrides,
  };
}

function initialQuery(state: Record<string, unknown>) {
  return vi.fn(async () => ({ rows: [{ ...state }] }));
}

function placeDetails({
  id,
  latitude,
  longitude,
  formattedAddress = "123 Main Street, Austin, TX 78701, USA",
  displayName = "Alpha Longevity",
  externalCallId = 7000,
}: {
  id: string;
  latitude: number;
  longitude: number;
  formattedAddress?: string;
  displayName?: string | null;
  externalCallId?: number;
}) {
  return {
    data: {
      id,
      ...(displayName ? { displayName: { text: displayName } } : {}),
      formattedAddress,
      location: { latitude, longitude },
    },
    externalCallId,
    fieldMask: "id,formattedAddress,location",
    costEstimateUsd: 0.005,
  };
}

function coordinateWriteHarness(state: Record<string, unknown>) {
  const coordinateUpdates: unknown[][] = [];
  const eventStamps: unknown[][] = [];
  const tx = geocodeTransaction({}, {
    onCoordinateUpdate(params) {
      state.latitude = params[1];
      state.longitude = params[2];
      coordinateUpdates.push(params);
    },
    onEventStamp(params) {
      eventStamps.push(params);
    },
    state,
  });
  const ledger = nestedLedgerHarness(tx);
  return {
    ...ledger,
    setActor: vi.fn(async () => undefined),
    coordinateUpdates,
    eventStamps,
  };
}

function nestedLedgerHarness(
  tx: ReturnType<typeof geocodeTransaction>,
  blocked: Record<string, string> = {},
) {
  const guards: Array<{ field: string; nested: boolean }> = [];
  const recordWrite = vi.fn(async (options: {
    field: string;
    tx?: typeof tx;
    mutate: (transaction: typeof tx) => Promise<unknown>;
  }) => {
    guards.push({ field: options.field, nested: Boolean(options.tx) });
    if (blocked[options.field]) return { written: false, reason: blocked[options.field] };
    const result = await options.mutate(options.tx || tx);
    return { written: true, result };
  });
  return { recordWrite, guards };
}

function geocodeTransaction(
  overrides: Record<string, unknown>,
  hooks: {
    state?: Record<string, unknown>;
    onCoordinateUpdate?: (params: unknown[]) => void;
    onEventStamp?: (params: unknown[]) => void;
  } = {},
) {
  const state = hooks.state || locationRow({ id: 1 });
  const recheck = {
    status: state.status ?? "active",
    deleted_at: state.deleted_at ?? null,
    is_virtual: state.is_virtual ?? false,
    latitude: state.latitude ?? null,
    longitude: state.longitude ?? null,
    non_suppressed: state.non_suppressed ?? true,
    ...overrides,
  };
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FOR UPDATE")) return { rows: [recheck] };
      if (sql.includes("transaction_timestamp")) {
        return { rows: [{ write_started_at: "2026-07-12T08:00:00.000Z" }] };
      }
      if (sql.includes("UPDATE fountain.locations")) {
        hooks.onCoordinateUpdate?.(params);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("UPDATE fountain.entity_change_events")) {
        hooks.onEventStamp?.(params);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected geocode SQL: ${sql}`);
    }),
  };
}

function writeInput(locationId: number) {
  return {
    locationId,
    taskId: "901",
    runId: "81",
    candidate: {
      provider_place_id: "write-place",
      external_call_id: 8000,
      latitude: 30.2672,
      longitude: -97.7431,
      formatted_address: "123 Main Street, Austin, TX 78701, USA",
      validation: {
        valid: true,
        checks: { address_identity: true },
      },
    },
  };
}
