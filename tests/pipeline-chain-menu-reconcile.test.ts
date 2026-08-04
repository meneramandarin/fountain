import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The pipeline is intentionally implemented as native .mjs.
import * as chainMenuReconcile from "../pipeline/lib/chain-menu-reconcile.mjs";

const {
  buildChainMenuReconcilePlan,
  CHAIN_MENU_RECONCILE_CAMPAIGN,
  CHAIN_MENU_RECONCILE_LOAD_SQL,
  enqueueChainMenuReconcilePlan,
} = chainMenuReconcile;

describe("chain menu reconciliation", () => {
  test("selects missing and materially sparse menus only within same-domain, distinct-place chains", () => {
    const plan = buildChainMenuReconcilePlan([
      row({ id: 1, locality: "Austin", menu_count: 30 }),
      row({ id: 2, locality: "Dallas", menu_count: 0 }),
      row({ id: 3, locality: "Houston", menu_count: 2 }),
      row({ id: 4, locality: "El Paso", menu_count: 8 }),
      row({ id: 5, website: "https://unrelated.example", locality: "Waco", menu_count: 0 }),
      row({ id: 6, org_id: 20, website: "https://duplicate.example", locality: "Miami", menu_count: 25 }),
      row({ id: 7, org_id: 20, website: "https://duplicate.example", locality: "Miami", menu_count: 0 }),
    ]);

    expect(plan.campaign).toBe(CHAIN_MENU_RECONCILE_CAMPAIGN);
    expect(plan.candidate_count).toBe(2);
    expect(plan.candidates.map((item: { entity_id: number; reason: string }) => [item.entity_id, item.reason]))
      .toEqual([
        [2, "menu_missing"],
        [3, "menu_sparse_absolute"],
      ]);
    expect(plan.cohort_count).toBe(1);
  });

  test("uses a conservative peer floor and supports deterministic limiting", () => {
    const rows = [
      row({ id: 4, locality: "D", menu_count: 0 }),
      row({ id: 3, locality: "C", menu_count: 4 }),
      row({ id: 2, locality: "B", menu_count: 0 }),
      row({ id: 1, locality: "A", menu_count: 4 }),
    ];
    const full = buildChainMenuReconcilePlan(rows);
    const limited = buildChainMenuReconcilePlan(rows, { limit: 1 });

    expect(full.candidates.map((item: { entity_id: number }) => item.entity_id)).toEqual([2, 4]);
    expect(limited.candidates.map((item: { entity_id: number }) => item.entity_id)).toEqual([2]);
    expect(limited.limited).toBe(true);
    expect(buildChainMenuReconcilePlan([...rows].reverse(), { limit: 1 }).digest).toBe(limited.digest);
  });

  test("loads only active, non-suppressed organization listings", () => {
    expect(CHAIN_MENU_RECONCILE_LOAD_SQL).toContain("location.status = 'active'");
    expect(CHAIN_MENU_RECONCILE_LOAD_SQL).toContain("location.deleted_at IS NULL");
    expect(CHAIN_MENU_RECONCILE_LOAD_SQL).toContain("organization.deleted_at IS NULL");
    expect(CHAIN_MENU_RECONCILE_LOAD_SQL).toContain("fountain_raw.suppressed_source_listings");
  });

  test("enqueues campaign-scoped menu extraction tasks with audit context", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        selected_count: 1,
        inserted_count: 1,
        adopted_pending_count: 0,
        queued_count: 1,
        claimed_conflict_count: 0,
        queued_entity_ids: [2],
      }],
    });
    const withTransaction = vi.fn(async (operation) => operation({ query }));
    const plan = buildChainMenuReconcilePlan([
      row({ id: 1, locality: "Austin", menu_count: 30 }),
      row({ id: 2, locality: "Dallas", menu_count: 0 }),
    ]);

    const result = await enqueueChainMenuReconcilePlan(plan, { runId: 91 }, { withTransaction });

    expect(result).toEqual({
      selectedCount: 1,
      insertedCount: 1,
      adoptedPendingCount: 0,
      queuedCount: 1,
      claimedConflictCount: 0,
      queuedEntityIds: [2],
    });
    const tasks = JSON.parse(query.mock.calls[0][1][0]);
    expect(tasks[0]).toMatchObject({
      entity_id: 2,
      priority: 70,
      max_attempts: 3,
      payload: {
        campaign: CHAIN_MENU_RECONCILE_CAMPAIGN,
        reconcile_reason: "menu_missing",
        organization_id: 10,
        previous_menu_count: 0,
        peer_menu_maximum: 30,
      },
    });
  });
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    org_id: 10,
    name: "Example Clinic",
    website: "https://chain.example/locations/example",
    address: "1 Main St",
    locality: "Austin",
    region: "TX",
    country_code: "US",
    organization_name: "Example Chain",
    menu_count: 10,
    priced_count: 0,
    ...overrides,
  };
}
