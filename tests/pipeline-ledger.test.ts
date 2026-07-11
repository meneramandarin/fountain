import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The production ledger is intentionally an ESM JavaScript module.
import { createLedger } from "../pipeline/lib/ledger.mjs";

type FieldRow = {
  verification: string;
  locked: boolean;
  verified_by: string | null;
  verified_at: Date | null;
  source_note: string | null;
};

type QueryResult = {
  rows: FieldRow[] | Array<Record<string, unknown>>;
  rowCount: number;
};

type Queryable = {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
};

type TransactionState = {
  fieldWrites: Map<string, FieldRow>;
  businessWritten: boolean;
  businessValue: string | null;
  releases: Array<() => void>;
  savepoints: Map<string, TransactionSnapshot>;
};

type TransactionSnapshot = {
  fieldWrites: Map<string, FieldRow>;
  businessWritten: boolean;
  businessValue: string | null;
};

const LOCATION = { entity_type: "location", entity_id: 42 };
const FIELD = "website";
const TEST_MUTATION_SQL = "TEST MUTATE BUSINESS VALUE";

describe("pipeline field ledger", () => {
  test("authorizes an absent row, mutates, and records provenance atomically", async () => {
    const db = new FakeDatabase();
    const ledger = ledgerFor(db);

    expect(await ledger.canWrite(LOCATION, FIELD)).toBe(true);

    const result = await ledger.recordWrite({
      entity: LOCATION,
      field: FIELD,
      verification: "agent_verified",
      actor: "pipeline:test",
      mutate: async (tx: Queryable) => {
        await tx.query(TEST_MUTATION_SQL, ["https://example.test"]);
        return { changed: true };
      },
    });

    expect(result).toEqual({ written: true, result: { changed: true } });
    expect(db.businessValue).toBe("https://example.test");
    expect(db.getField(LOCATION, FIELD)).toMatchObject({
      verification: "agent_verified",
      locked: false,
      verified_by: "pipeline:test",
    });
  });

  test.each(["unverified", "agent_verified"])(
    "permits an existing %s field",
    async (currentVerification) => {
      const db = new FakeDatabase();
      db.seedField(LOCATION, FIELD, {
        verification: currentVerification,
        locked: false,
        verified_by: "earlier-agent",
        verified_at: new Date("2026-07-10T00:00:00Z"),
        source_note: "preserve me",
      });
      const ledger = ledgerFor(db);

      const result = await ledger.recordWrite({
        entity: LOCATION,
        field: FIELD,
        verification: "agent_verified",
        actor: "pipeline:new-agent",
        mutate: (tx: Queryable) => tx.query(TEST_MUTATION_SQL, ["new-value"]),
      });

      expect(result.written).toBe(true);
      expect(db.businessValue).toBe("new-value");
      expect(db.getField(LOCATION, FIELD)).toMatchObject({
        verification: "agent_verified",
        locked: false,
        verified_by: "pipeline:new-agent",
        source_note: "preserve me",
      });
    },
  );

  test.each(["human_verified", "owner_verified"])(
    "rejects a %s field without invoking mutate",
    async (verification) => {
      const db = new FakeDatabase();
      db.seedField(LOCATION, FIELD, fieldRow(verification));
      const ledger = ledgerFor(db);
      const mutate = vi.fn();

      expect(await ledger.canWrite(LOCATION, FIELD)).toBe(false);
      await expect(ledger.recordWrite({
        entity: LOCATION,
        field: FIELD,
        verification: "agent_verified",
        actor: "pipeline:test",
        mutate,
      })).resolves.toEqual({ written: false, reason: verification });

      expect(mutate).not.toHaveBeenCalled();
      expect(db.businessValue).toBe("initial");
    },
  );

  test("rejects a locked field regardless of its verification state", async () => {
    const db = new FakeDatabase();
    db.seedField(LOCATION, FIELD, {
      ...fieldRow("unverified"),
      locked: true,
    });
    const ledger = ledgerFor(db);
    const mutate = vi.fn();

    expect(await ledger.canWrite(LOCATION, FIELD)).toBe(false);
    await expect(ledger.recordWrite({
      entity: LOCATION,
      field: FIELD,
      verification: "agent_verified",
      actor: "pipeline:test",
      mutate,
    })).resolves.toEqual({ written: false, reason: "locked" });

    expect(mutate).not.toHaveBeenCalled();
  });

  test("rolls back both mutation and ledger insert when mutate throws", async () => {
    const db = new FakeDatabase();
    const ledger = ledgerFor(db);

    await expect(ledger.recordWrite({
      entity: LOCATION,
      field: FIELD,
      verification: "agent_verified",
      actor: "pipeline:test",
      mutate: async (tx: Queryable) => {
        await tx.query(TEST_MUTATION_SQL, ["must-roll-back"]);
        throw new Error("mutation failed");
      },
    })).rejects.toThrow("mutation failed");

    expect(db.businessValue).toBe("initial");
    expect(db.getField(LOCATION, FIELD)).toBeNull();
  });

  test("uses a savepoint so a failed write rolls back inside a caller-owned transaction", async () => {
    const db = new FakeDatabase();
    const ledger = ledgerFor(db);

    await db.withTransaction(async (tx) => {
      await tx.query(TEST_MUTATION_SQL, ["before-ledger-write"]);

      await expect(ledger.recordWrite({
        entity: LOCATION,
        field: FIELD,
        verification: "agent_verified",
        actor: "pipeline:test",
        tx,
        mutate: async (innerTx: Queryable) => {
          await innerTx.query(TEST_MUTATION_SQL, ["must-roll-back"]);
          throw new Error("nested mutation failed");
        },
      })).rejects.toThrow("nested mutation failed");
    });

    expect(db.businessValue).toBe("before-ledger-write");
    expect(db.getField(LOCATION, FIELD)).toBeNull();
  });

  test("serializes concurrent absent-row writers and rechecks after the lock", async () => {
    const db = new FakeDatabase();
    const ledger = ledgerFor(db);
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    const secondMutate = vi.fn();

    const firstWrite = ledger.recordWrite({
      entity: LOCATION,
      field: FIELD,
      verification: "human_verified",
      actor: "human-reviewer",
      mutate: async (tx: Queryable) => {
        await tx.query(TEST_MUTATION_SQL, ["human-value"]);
        firstEntered.resolve();
        await releaseFirst.promise;
        return "first";
      },
    });

    await firstEntered.promise;

    const contentionObserved = db.waitForNextContention();
    const secondWrite = ledger.recordWrite({
      entity: LOCATION,
      field: FIELD,
      verification: "agent_verified",
      actor: "pipeline:second",
      mutate: secondMutate,
    });

    await contentionObserved;
    expect(secondMutate).not.toHaveBeenCalled();

    releaseFirst.resolve();

    await expect(firstWrite).resolves.toEqual({ written: true, result: "first" });
    await expect(secondWrite).resolves.toEqual({
      written: false,
      reason: "human_verified",
    });
    expect(secondMutate).not.toHaveBeenCalled();
    expect(db.businessValue).toBe("human-value");
    expect(db.getField(LOCATION, FIELD)).toMatchObject({
      verification: "human_verified",
      verified_by: "human-reviewer",
    });
  });
});

function ledgerFor(db: FakeDatabase) {
  return createLedger({
    query: db.query,
    withTransaction: db.withTransaction,
  });
}

class FakeDatabase {
  businessValue: string | null = "initial";

  private readonly fields = new Map<string, FieldRow>();
  private readonly heldLocks = new Set<string>();
  private readonly lockQueues = new Map<string, Array<() => void>>();
  private contentionObservers: Array<() => void> = [];

  query = async (sql: string, params: unknown[] = []): Promise<QueryResult> => {
    const normalized = normalizeSql(sql);
    if (isFieldSelect(normalized)) {
      const row = this.fields.get(fieldKeyFromParams(params));
      return queryResult(row ? [cloneRow(row)] : []);
    }
    throw new Error(`Unexpected non-transaction query: ${normalized}`);
  };

  withTransaction = async <T,>(fn: (tx: Queryable) => Promise<T>): Promise<T> => {
    const state: TransactionState = {
      fieldWrites: new Map(),
      businessWritten: false,
      businessValue: null,
      releases: [],
      savepoints: new Map(),
    };
    const tx: Queryable = {
      query: (sql, params = []) => this.transactionQuery(state, sql, params),
    };

    try {
      const result = await fn(tx);
      for (const [key, row] of state.fieldWrites) {
        this.fields.set(key, cloneRow(row));
      }
      if (state.businessWritten) {
        this.businessValue = state.businessValue;
      }
      return result;
    } finally {
      for (const release of state.releases.reverse()) {
        release();
      }
    }
  };

  seedField(entity: typeof LOCATION, field: string, row: FieldRow) {
    this.fields.set(fieldKey(entity.entity_type, entity.entity_id, field), cloneRow(row));
  }

  getField(entity: typeof LOCATION, field: string) {
    const row = this.fields.get(fieldKey(entity.entity_type, entity.entity_id, field));
    return row ? cloneRow(row) : null;
  }

  waitForNextContention() {
    return new Promise<void>((resolve) => {
      this.contentionObservers.push(resolve);
    });
  }

  private async transactionQuery(
    state: TransactionState,
    sql: string,
    params: unknown[],
  ): Promise<QueryResult> {
    const normalized = normalizeSql(sql);

    if (normalized.startsWith("savepoint ")) {
      const name = normalized.slice("savepoint ".length);
      state.savepoints.set(name, snapshot(state));
      return queryResult([]);
    }

    if (normalized.startsWith("rollback to savepoint ")) {
      const name = normalized.slice("rollback to savepoint ".length);
      const saved = state.savepoints.get(name);
      if (!saved) throw new Error(`Unknown savepoint: ${name}`);
      state.fieldWrites = cloneMap(saved.fieldWrites);
      state.businessWritten = saved.businessWritten;
      state.businessValue = saved.businessValue;
      return queryResult([]);
    }

    if (normalized.startsWith("release savepoint ")) {
      const name = normalized.slice("release savepoint ".length);
      state.savepoints.delete(name);
      return queryResult([]);
    }

    if (normalized.includes("pg_advisory_xact_lock")) {
      const release = await this.acquireLock(String(params[0]));
      state.releases.push(release);
      return queryResult([{}]);
    }

    if (isFieldSelect(normalized)) {
      const key = fieldKeyFromParams(params);
      const row = state.fieldWrites.get(key) || this.fields.get(key);
      return queryResult(row ? [cloneRow(row)] : []);
    }

    if (normalized.startsWith("insert into fountain_ops.field_status")) {
      const key = fieldKeyFromParams(params);
      const current = state.fieldWrites.get(key) || this.fields.get(key);
      state.fieldWrites.set(key, {
        verification: String(params[3]),
        locked: current?.locked ?? false,
        verified_by: String(params[4]),
        verified_at: new Date(),
        source_note: current?.source_note ?? null,
      });
      return queryResult([]);
    }

    if (normalized === TEST_MUTATION_SQL.toLowerCase()) {
      state.businessWritten = true;
      state.businessValue = String(params[0]);
      return queryResult([]);
    }

    throw new Error(`Unexpected transaction query: ${normalized}`);
  }

  private async acquireLock(key: string): Promise<() => void> {
    if (!this.heldLocks.has(key)) {
      this.heldLocks.add(key);
      return () => this.releaseLock(key);
    }

    for (const observe of this.contentionObservers.splice(0)) {
      observe();
    }

    await new Promise<void>((resolve) => {
      const queue = this.lockQueues.get(key) || [];
      queue.push(resolve);
      this.lockQueues.set(key, queue);
    });

    return () => this.releaseLock(key);
  }

  private releaseLock(key: string) {
    const queue = this.lockQueues.get(key);
    const next = queue?.shift();
    if (next) {
      next();
      return;
    }
    this.lockQueues.delete(key);
    this.heldLocks.delete(key);
  }
}

function fieldRow(verification: string): FieldRow {
  return {
    verification,
    locked: false,
    verified_by: "fixture",
    verified_at: new Date("2026-07-10T00:00:00Z"),
    source_note: null,
  };
}

function fieldKeyFromParams(params: unknown[]) {
  return fieldKey(String(params[0]), Number(params[1]), String(params[2]));
}

function fieldKey(entityType: string, entityId: number, field: string) {
  return JSON.stringify([entityType, entityId, field]);
}

function isFieldSelect(sql: string) {
  return sql.includes("from fountain_ops.field_status");
}

function normalizeSql(sql: string) {
  return sql.trim().replace(/\s+/g, " ").toLowerCase();
}

function queryResult(rows: QueryResult["rows"]): QueryResult {
  return { rows, rowCount: rows.length };
}

function cloneRow(row: FieldRow): FieldRow {
  return {
    ...row,
    verified_at: row.verified_at ? new Date(row.verified_at) : null,
  };
}

function cloneMap(map: Map<string, FieldRow>) {
  return new Map([...map].map(([key, value]) => [key, cloneRow(value)]));
}

function snapshot(state: TransactionState): TransactionSnapshot {
  return {
    fieldWrites: cloneMap(state.fieldWrites),
    businessWritten: state.businessWritten,
    businessValue: state.businessValue,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
