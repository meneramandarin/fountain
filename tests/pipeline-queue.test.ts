import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- the pipeline runtime intentionally uses native .mjs modules.
import { claimTask, claimTasks, completeTask, enqueueTasks, failTask, previewDrain, transitionTaskStage, validateWherePredicate } from "../pipeline/lib/queue.mjs";

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

  test("preview and single-task claim remain backwards compatible without a stage", async () => {
    const previewQuery = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).not.toContain("payload->>'stage' = $3");
      expect(params).toEqual(["noop", 10]);
      return { rows: [{ id: "11", payload: {} }] };
    });
    await expect(previewDrain({ taskType: "noop" }, { query: previewQuery }))
      .resolves.toEqual([{ id: "11", payload: {} }]);

    const claimQuery = vi.fn(async (_sql: string, params: unknown[]) => {
      expect(params).toEqual(["noop", "worker-1", "8"]);
      return { rows: [{ id: "12", status: "claimed" }] };
    });
    await expect(claimTask({ taskType: "noop", workerId: "worker-1", runId: "8" }, { query: claimQuery }))
      .resolves.toMatchObject({ id: "12", status: "claimed" });
  });

  test("filters previews and single-task claims by payload stage", async () => {
    const previewQuery = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("payload->>'stage' = $2");
      expect(sql).toContain("LIMIT $3");
      expect(params).toEqual(["legitimacy_check", "stage_2", 8]);
      return { rows: [{ id: "21", payload: { stage: "stage_2" } }] };
    });
    await previewDrain({ taskType: "legitimacy_check", stage: "stage_2", limit: 8 }, { query: previewQuery });

    const claimQuery = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("payload->>'stage' = $4");
      expect(params).toEqual(["legitimacy_check", "worker-2", "9", "stage_2"]);
      return { rows: [{ id: "21", status: "claimed", payload: { stage: "stage_2" } }] };
    });
    await claimTask({
      taskType: "legitimacy_check",
      workerId: "worker-2",
      runId: "9",
      stage: " stage_2 ",
    }, { query: claimQuery });
  });

  test("parameterizes campaign and prompt filters for previews and both claim paths", async () => {
    const campaign = "pass1_gate_b_dry_run";
    const promptVersion = "pass1-legitimacy-v2";
    const previewQuery = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("payload->>'stage' = $2");
      expect(sql).toContain("payload->>'campaign' = $3");
      expect(sql).toContain("payload->>'prompt_version' = $4");
      expect(sql).toContain("LIMIT $5");
      expect(params).toEqual(["legitimacy_check", "stage_2", campaign, promptVersion, 8]);
      return { rows: [{ id: "51", payload: { campaign, prompt_version: promptVersion } }] };
    });
    await previewDrain({
      taskType: "legitimacy_check",
      stage: "stage_2",
      campaign,
      promptVersion,
      limit: 8,
    }, { query: previewQuery });

    const singleQuery = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("payload->>'stage' = $4");
      expect(sql).toContain("payload->>'campaign' = $5");
      expect(sql).toContain("payload->>'prompt_version' = $6");
      expect(params).toEqual([
        "legitimacy_check",
        "worker-single",
        "31",
        "stage_2",
        campaign,
        promptVersion,
      ]);
      return { rows: [{ id: "51", status: "claimed" }] };
    });
    await claimTask({
      taskType: "legitimacy_check",
      workerId: "worker-single",
      runId: "31",
      stage: "stage_2",
      campaign,
      promptVersion,
    }, { query: singleQuery });

    const batchQuery = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("payload->>'campaign' = $6");
      expect(sql).toContain("payload->>'prompt_version' = $7");
      expect(sql).toContain("LIMIT $5");
      expect(params).toEqual([
        "legitimacy_check",
        "worker-batch",
        "32",
        "stage_2",
        8,
        campaign,
        promptVersion,
      ]);
      return { rows: [{ id: "52", status: "claimed" }] };
    });
    await claimTasks({
      taskType: "legitimacy_check",
      workerId: "worker-batch",
      runId: "32",
      stage: "stage_2",
      campaign,
      promptVersion,
      limit: 8,
    }, { query: batchQuery });
  });

  test("claims a stage-filtered batch atomically and returns queue order", async () => {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("FOR UPDATE SKIP LOCKED");
      expect(sql).toContain("LIMIT $5");
      expect(sql).toContain("attempts = q.attempts + 1");
      expect(sql).toContain("ORDER BY next_tasks.priority, next_tasks.id");
      expect(params).toEqual(["legitimacy_check", "worker-batch", "10", "stage_1", 20]);
      return {
        rows: [
          { id: "31", status: "claimed", attempts: 1 },
          { id: "32", status: "claimed", attempts: 1 },
        ],
      };
    });

    await expect(claimTasks({
      taskType: "legitimacy_check",
      workerId: "worker-batch",
      runId: "10",
      stage: "stage_1",
      limit: 20,
    }, { query })).resolves.toHaveLength(2);
  });

  test("atomically transitions an owned task to a new stage and resets per-stage attempts", async () => {
    const payload = {
      schema_version: 1,
      stage: "stage_2",
      stage_1: { class: "junk", confidence: 0.42 },
    };
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toContain("status = 'pending'");
      expect(sql).toContain("attempts = 0");
      expect(sql).toContain("claimed_by = NULL");
      expect(sql).toContain("claimed_at = NULL");
      expect(sql).toContain("result = NULL");
      expect(sql).toContain("WHERE id = $1 AND status = 'claimed' AND claimed_by = $2 AND run_id = $3");
      expect(params).toEqual(["41", "worker-stage", "11", JSON.stringify(payload)]);
      return { rows: [{ id: "41", status: "pending", attempts: 0, payload }] };
    });

    await expect(transitionTaskStage({
      taskId: "41",
      workerId: "worker-stage",
      runId: "11",
      payload,
    }, { query })).resolves.toMatchObject({ status: "pending", attempts: 0, payload });
  });

  test("stage transitions validate payload and reject lost ownership", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await expect(transitionTaskStage({
      taskId: "41",
      workerId: "worker-stage",
      runId: "11",
      payload: { stage: "stage_2" },
    }, { query })).rejects.toThrow("no longer owns task 41");
    await expect(transitionTaskStage({
      taskId: "41",
      workerId: "worker-stage",
      runId: "11",
      payload: {},
    }, { query })).rejects.toThrow("payload.stage is required");
    expect(query).toHaveBeenCalledOnce();
  });

  test("normalizes the stored stage and rejects invalid stage filters", async () => {
    const query = vi.fn(async (_sql: string, params: unknown[]) => ({
      rows: [{ id: "42", payload: JSON.parse(String(params[3])) }],
    }));

    await expect(transitionTaskStage({
      taskId: "42",
      workerId: "worker-stage",
      runId: "11",
      payload: { stage: " stage_2 " },
    }, { query })).resolves.toMatchObject({ payload: { stage: "stage_2" } });
    await expect(previewDrain({ taskType: "legitimacy_check", stage: " " }, { query }))
      .rejects.toThrow("stage must be a non-empty string");
    expect(query).toHaveBeenCalledOnce();
  });

  test("sanitizes NUL characters from JSONB stage payload and result writes", async () => {
    const nul = String.fromCharCode(0);
    const query = vi.fn(async (_sql: string, params: unknown[]) => ({
      rows: [{ id: String(params[0]), stored: JSON.parse(String(params[3])) }],
    }));

    await transitionTaskStage({
      taskId: "43",
      workerId: "worker-stage",
      runId: "12",
      payload: {
        stage: "stage_2",
        website: { [`title${nul}part`]: `Alpha${nul}Beta`, literal: "\\u0000" },
      },
    }, { query });
    await completeTask({
      taskId: "44",
      workerId: "worker-stage",
      runId: "12",
      result: { website: { text: `One${nul}Two` } },
    }, { query });

    const payloadJson = String(query.mock.calls[0]![1][3]);
    const resultJson = String(query.mock.calls[1]![1][3]);
    expect(JSON.parse(payloadJson)).toEqual({
      stage: "stage_2",
      website: { "title�part": "Alpha�Beta", literal: "\\u0000" },
    });
    expect(JSON.parse(resultJson)).toEqual({ website: { text: "One�Two" } });
    expect(payloadJson).not.toContain(`${nul}`);
    expect(resultJson).not.toContain(`${nul}`);
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
