import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { runMaintenance } from "../pipeline/cli.mjs";
// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { inspectCityIndex, normalizeIdentifier, refreshCityIndex } from "../pipeline/lib/city-index.mjs";
// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { DEFAULT_SCHEMAS, regenerateStructureDocument } from "../pipeline/lib/structure-doc.mjs";

describe("pipeline maintenance", () => {
  test("keeps refresh-city-index read-only unless apply is set", async () => {
    const inspect = vi.fn(async () => ({ schema: "fountain", count: 41 }));
    const refresh = vi.fn(async () => ({ schema: "fountain", count: 42 }));

    const preview = await runMaintenance(
      { positional: ["refresh-city-index"] },
      { dry_run: true },
      { inspectCityIndex: inspect, refreshCityIndex: refresh },
    );
    expect(preview).toMatchObject({
      counts: { refreshes_applied: 0, cities_indexed: 41 },
      result: { dryRun: true, count: 41 },
    });
    expect(inspect).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();

    const applied = await runMaintenance(
      { positional: ["refresh-city-index"] },
      { dry_run: false },
      { inspectCityIndex: inspect, refreshCityIndex: refresh },
    );
    expect(applied).toMatchObject({
      counts: { refreshes_applied: 1, cities_indexed: 42 },
      result: { dryRun: false, count: 42 },
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  test("queries the current city count without calling the refresh function", async () => {
    const query = vi.fn(async (sql: string) => {
      void sql;
      return { rows: [{ count: 12 }] };
    });
    await expect(inspectCityIndex({ schema: "fountain" }, { query }))
      .resolves.toEqual({ schema: "fountain", count: 12 });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('FROM "fountain".city_index');
    expect(query.mock.calls[0]?.[0]).not.toContain("refresh_city_index");
  });

  test("refreshes and counts inside the injected transaction", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 13 }] }),
    };
    const withTransaction = vi.fn(async (operation: (value: typeof client) => Promise<unknown>) => operation(client));

    await expect(refreshCityIndex({ schema: "fountain" }, { withTransaction }))
      .resolves.toEqual({ schema: "fountain", count: 13 });
    expect(client.query.mock.calls.map((call) => call[0])).toEqual([
      'SELECT "fountain".refresh_city_index()',
      'SELECT COUNT(*)::int AS count FROM "fountain".city_index',
    ]);
  });

  test("rejects unsafe dynamic schema identifiers", () => {
    expect(() => normalizeIdentifier("fountain; DROP SCHEMA fountain"))
      .toThrow("Unsafe identifier");
  });

  test("builds a generic structure document and writes only in apply mode", async () => {
    expect(DEFAULT_SCHEMAS).toContain("fountain_ops");
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      return { rows: [] };
    });
    const writeFile = vi.fn(async () => undefined);

    const preview = await regenerateStructureDocument({
      outputPath: "/tmp/structure.md",
      apply: false,
      query,
      writeFile,
      generatedAt: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(preview.outputPath).toBeNull();
    expect(preview.markdown).toContain("# Neon Database Structure Current");
    expect(preview.markdown).not.toMatch(/hyperbaric/i);
    expect(statements.join("\n")).not.toMatch(/hyperbaric/i);
    expect(writeFile).not.toHaveBeenCalled();

    await regenerateStructureDocument({
      outputPath: "/tmp/structure.md",
      apply: true,
      query,
      writeFile,
      generatedAt: new Date("2026-07-11T00:00:00.000Z"),
    });
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/structure.md",
      expect.stringContaining("Generated: 2026-07-11T00:00:00.000Z"),
      "utf8",
    );
  });
});
