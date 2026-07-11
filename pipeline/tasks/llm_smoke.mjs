import { createLlmClient } from "../lib/llm.mjs";
import { withTransaction } from "../lib/db.mjs";

const SMOKE_LOCK_KEY = "fountain:gate_b:openrouter_smoke";

export async function handleLlmSmoke({
  task,
  run,
  createClient = createLlmClient,
  transact = withTransaction,
}) {
  const outcome = await transact(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [SMOKE_LOCK_KEY]);
    const existing = await tx.query(
      `
        SELECT id, run_id, status, tokens, cost_estimate_usd
        FROM fountain_ops.external_calls
        WHERE provider = 'openrouter' AND call_type = 'gate_b_smoke'
        ORDER BY id
        LIMIT 1
      `,
    );
    if (existing.rows[0]) {
      return { skipped: true, existing: existing.rows[0] };
    }

    const client = createClient({ query: tx });
    try {
      const response = await client.complete({
        runId: run.id,
        entityId: task.entity_id,
        callType: "gate_b_smoke",
        tier: "default",
        messages: [{ role: "user", content: "Reply with ok." }],
        maxTokens: 1,
        temperature: 0,
        maxAttempts: 1,
      });
      return { response };
    } catch (error) {
      // The client records its terminal failure through this transaction.
      // Return the error so that transaction can commit that ledger row, then
      // fail the task outside the transaction.
      return { error };
    }
  });

  if (outcome.error) throw outcome.error;
  if (outcome.skipped) {
    return {
      ok: true,
      skipped: true,
      reason: "gate_b_smoke_already_recorded",
      external_call_id: outcome.existing.id,
    };
  }

  const response = outcome.response;
  if (Number(response?.usage?.total_tokens || 0) <= 0) {
    throw new Error("Gate B LLM smoke returned no positive token usage; budget evidence is invalid.");
  }
  return {
    ok: true,
    model: response.model,
    usage: response.usage,
    cost_estimate_usd: response.costEstimateUsd,
  };
}
