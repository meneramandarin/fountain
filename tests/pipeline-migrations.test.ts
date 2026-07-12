import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { runMigrate } from "../pipeline/cli.mjs";
// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { executeMigrationSql, validateMigrationSql } from "../pipeline/lib/migrations.mjs";

const SQL = "BEGIN;\nSELECT 1;\nCOMMIT;\n";

describe("pipeline migrations", () => {
  test("requires migration files to own an explicit transaction", () => {
    expect(() => validateMigrationSql("SELECT 1"))
      .toThrow("Migration must contain explicit BEGIN; and COMMIT;");
    expect(validateMigrationSql(SQL)).toBe(SQL);
  });

  test("executes SQL directly through a dedicated client", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    const withClient = vi.fn(async (operation: (value: typeof client) => Promise<unknown>) => operation(client));

    await executeMigrationSql(SQL, { withClient });
    expect(withClient).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledWith(SQL);
  });

  test("rolls back before releasing a client after migration failure", async () => {
    const failure = new Error("migration failed");
    const client = {
      query: vi.fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ rows: [] }),
    };
    const withClient = async (operation: (value: typeof client) => Promise<unknown>) => operation(client);

    await expect(executeMigrationSql(SQL, { withClient })).rejects.toThrow("migration failed");
    expect(client.query.mock.calls.map((call) => call[0])).toEqual([SQL, "ROLLBACK"]);
  });

  test("keeps migrate dry-run non-executing and applies through the internal executor", async () => {
    const loadMigrationFile = vi.fn(() => SQL);
    const executeMigrationSql = vi.fn(async () => undefined);

    const preview = await runMigrate(
      { file: "migrations/example.sql" },
      { dry_run: true },
      { loadMigrationFile, executeMigrationSql },
    );
    expect(preview).toMatchObject({
      counts: { migrations_applied: 0 },
      result: { dryRun: true, file: "migrations/example.sql" },
    });
    expect(executeMigrationSql).not.toHaveBeenCalled();

    const applied = await runMigrate(
      { file: "migrations/example.sql" },
      { dry_run: false },
      { loadMigrationFile, executeMigrationSql },
    );
    expect(applied).toMatchObject({
      counts: { migrations_applied: 1 },
      result: { dryRun: false, file: "migrations/example.sql" },
    });
    expect(executeMigrationSql).toHaveBeenCalledOnce();
    expect(executeMigrationSql).toHaveBeenCalledWith(SQL);
  });
});
