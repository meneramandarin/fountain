import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { normalizePostgresConnectionString, withTransaction } from "../pipeline/lib/db.mjs";

describe("pipeline database transactions", () => {
  test("preserves the existing verified-Neon SSL behavior explicitly", () => {
    expect(normalizePostgresConnectionString("postgres://user:pass@example.test/db?sslmode=require"))
      .toBe("postgres://user:pass@example.test/db?sslmode=verify-full");
    expect(normalizePostgresConnectionString("not a URL")).toBe("not a URL");
  });

  test("commits successful work", async () => {
    const client = fakeClient();
    const pool = { connect: vi.fn(async () => client) };

    await expect(withTransaction(async (tx: typeof client) => {
      await tx.query("SELECT 1");
      return "ok";
    }, { pool })).resolves.toBe("ok");

    expect(client.query.mock.calls.map((call) => call[0])).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  test("rolls back failed work", async () => {
    const client = fakeClient();
    const pool = { connect: vi.fn(async () => client) };

    await expect(withTransaction(async () => {
      throw new Error("boom");
    }, { pool })).rejects.toThrow("boom");

    expect(client.query.mock.calls.map((call) => call[0])).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledOnce();
  });
});

function fakeClient() {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      void sql;
      void params;
      return { rows: [] };
    }),
    release: vi.fn(),
  };
}
