-- Reconcile OpenRouter web-search tool fees for runs created before citation-
-- based request inference was added to the adapter. URL citations prove that
-- at least one $0.005 search request occurred even when server_tool_use was
-- omitted from the provider response.

BEGIN;

DO $$
DECLARE
  corrected_count integer;
BEGIN
  UPDATE fountain_ops.external_calls
  SET tokens = jsonb_set(tokens, '{web_search_requests}', '1'::jsonb, true),
      cost_estimate_usd = cost_estimate_usd + 0.005
  WHERE run_id IN (57, 59, 60, 61)
    AND provider = 'openrouter'
    AND call_type = 'website_discovery_web_search'
    AND status = 'ok'
    AND COALESCE((tokens->>'web_search_results')::integer, 0) > 0
    AND COALESCE((tokens->>'web_search_requests')::integer, 0) = 0;

  GET DIAGNOSTICS corrected_count = ROW_COUNT;
  IF corrected_count NOT IN (0, 5429) THEN
    RAISE EXCEPTION
      'OpenRouter web-search reconciliation drifted: expected 0 or 5429 rows, got %',
      corrected_count;
  END IF;

  UPDATE fountain_ops.runs run
  SET spent_usd_estimate = COALESCE((
        SELECT sum(call.cost_estimate_usd)
        FROM fountain_ops.external_calls call
        WHERE call.run_id = run.id
      ), 0),
      notes = CASE
        WHEN COALESCE(run.notes, '') LIKE '%openrouter_web_search_fee_reconciled_20260712%'
          THEN run.notes
        ELSE concat_ws(
          '; ',
          NULLIF(run.notes, ''),
          'openrouter_web_search_fee_reconciled_20260712'
        )
      END
  WHERE run.id IN (57, 59, 60, 61);
END
$$;

COMMIT;
