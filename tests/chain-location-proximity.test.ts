import { beforeEach, describe, expect, test, vi } from "vitest";

const { hasTableMock, rowMock, rowsMock } = vi.hoisted(() => ({
  hasTableMock: vi.fn(),
  rowMock: vi.fn(),
  rowsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  hasTable: hasTableMock,
  isPostgres: () => true,
  row: rowMock,
  rows: rowsMock,
}));

import { getLocationDetail } from "../src/lib/queries";

describe("chain location proximity", () => {
  beforeEach(() => {
    hasTableMock.mockReset();
    hasTableMock.mockResolvedValue(false);
    rowMock.mockReset();
    rowMock.mockResolvedValue({
      id: 42,
      org_id: 7,
      slug: "simonmed-san-francisco",
      latitude: 37.7749,
      longitude: -122.4194,
    });
    rowsMock.mockReset();
    rowsMock.mockResolvedValue([]);
  });

  test("orders sibling branches by distance with geographic fallbacks", async () => {
    await getLocationDetail("simonmed-san-francisco");

    const siblingCall = rowsMock.mock.calls.find(([sql]) => String(sql).includes("FROM locations sibling"));
    expect(siblingCall).toBeDefined();

    const [sql, values] = siblingCall!;
    expect(sql).toContain("JOIN locations current_location ON current_location.id = ?");
    expect(sql).toContain("sibling.latitude - current_location.latitude");
    expect(sql).toContain("sibling.longitude - current_location.longitude");
    expect(sql).toContain("distance_miles ASC NULLS LAST");
    expect(sql).toContain("lower(trim(sibling.locality)) = lower(trim(current_location.locality))");
    expect(sql).toContain("lower(trim(sibling.region)) = lower(trim(current_location.region))");
    expect(sql).toContain("LIMIT 12");
    expect(values).toEqual([42]);
  });
});
