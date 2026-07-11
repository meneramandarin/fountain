import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { claimTask, enqueueTasks, failTask, validateWherePredicate } from "../pipeline/lib/queue.mjs";

describe("pipeline queue", () => {
  test("accepts one trusted-operator predicate and rejects statement injection", () => {
    expect(validateWherePredicate("id % 997 = 0")).toBe("id % 997 = 0");
    expect(() => validateWherePredicate("true; DROP TABLE fountain.locations")).toThrow("single SQL predicate");
    expect(() => validateWherePredicate("true -- surprise")).toThrow("single SQL predicate");
    expect(() => validateWherePredicate("EXISTS (SELECT 1)")).toThrow("statements or subqueries");
    expect(() => validateWherePredicate("dangerous_function(id)")).toThrow("may not invoke SQL functions");
    expect(validateWherePredicate("name = 'Select Medical' AND id IN (1, 2)")).toBe(
      "name = 'Select Medical' AND id IN (1, 2)",
    );
  });

  test("enqueue relies on the partial unique index conflict target", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("ON CONFLICT (task_type, entity_type, entity_id)");
      expect(sql).toContain("WHERE status IN ('pending', 'claimed')");
      expect(params).toEqual(["noop", "location", 100, 3, "7", 25]);
      return {
        rows: [{ selected_count: 2, inserted_count: 1, inserted_entity_ids: [997] }],
      };
    });

    await expect(enqueueTasks({
      taskType: "noop",
      where: "id % 997 = 0",
      runId: "7",
      limit: 25,
    }, { query })).resolves.toEqual({
      selectedCount: 2,
      insertedCount: 1,
      insertedEntityIds: [997],
    });
  });

  test("claim is an atomic SKIP LOCKED update", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("FOR UPDATE SKIP LOCKED");
      expect(sql).toContain("attempts = q.attempts + 1");
      expect(params).toEqual(["noop", "worker-1", "8"]);
      return { rows: [{ id: "12", status: "claimed", attempts: 1 }] };
    });

    await expect(claimTask({ taskType: "noop", workerId: "worker-1", runId: "8" }, { query }))
      .resolves.toMatchObject({ id: "12", status: "claimed", attempts: 1 });
  });

  test("non-retryable failure forces a terminal state", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("CASE WHEN $5 AND attempts < max_attempts");
      expect(params[4]).toBe(false);
      return { rows: [{ id: "12", status: "failed" }] };
    });

    await expect(failTask({
      taskId: "12",
      workerId: "worker-1",
      runId: "8",
      error: new Error("no retry"),
      retryable: false,
    }, { query })).resolves.toMatchObject({ status: "failed" });
  });
});
