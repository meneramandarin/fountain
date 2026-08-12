-- Stop the catalog price-only OpenRouter campaign at the user's request.
-- Completed work is retained; only work that had not completed is skipped.

CREATE SCHEMA IF NOT EXISTS fountain_raw;

BEGIN;

SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'stop_catalog_price_only_openrouter_sweep_20260811'
);

CREATE TABLE IF NOT EXISTS fountain_raw.catalog_price_sweep_stopped_tasks_backup_20260811 AS
SELECT *, now() AS backed_up_at
FROM fountain_ops.task_queue
WHERE task_type = 'menu_extract'
  AND payload->>'campaign' = 'catalog_price_only_20260811'
  AND status IN ('pending', 'claimed');

UPDATE fountain_ops.task_queue
SET status = 'skipped',
    claimed_by = NULL,
    claimed_at = NULL,
    result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
      'outcome', 'skipped',
      'reason', 'manual_only_requested_20260811'
    ),
    error = NULL,
    updated_at = now()
WHERE task_type = 'menu_extract'
  AND payload->>'campaign' = 'catalog_price_only_20260811'
  AND status IN ('pending', 'claimed');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fountain_ops.task_queue
    WHERE task_type = 'menu_extract'
      AND payload->>'campaign' = 'catalog_price_only_20260811'
      AND status IN ('pending', 'claimed')
  ) THEN
    RAISE EXCEPTION 'Catalog price-only campaign still has runnable tasks';
  END IF;
END;
$$;

COMMIT;
