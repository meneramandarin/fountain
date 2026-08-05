import { beforeEach, describe, expect, test, vi } from "vitest";

const { rowMock } = vi.hoisted(() => ({
  rowMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  hasTable: vi.fn(),
  isPostgres: () => true,
  row: rowMock,
  rows: vi.fn(),
}));

import { getTreatmentIndexClinicCount } from "../src/lib/queries";

describe("treatment index clinic count", () => {
  beforeEach(() => {
    rowMock.mockReset();
  });

  test("counts unique active physical clinics with active offerings", async () => {
    rowMock.mockResolvedValue({ count: 7_850 });

    await expect(getTreatmentIndexClinicCount()).resolves.toBe(7_850);

    const [sql] = rowMock.mock.calls[0];
    expect(sql).toContain("COUNT(DISTINCT l.id)");
    expect(sql).toContain("o.status = 'active' AND o.deleted_at IS NULL");
    expect(sql).toContain("l.status = 'active' AND l.deleted_at IS NULL");
    expect(sql).toContain("COALESCE(l.is_virtual, false) = false");
  });
});
