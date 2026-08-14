-- Stop all currently queued tasks whose configured handlers call OpenRouter.
-- This is intentionally narrower than stopping the whole pipeline: tasks that
-- do not use OpenRouter (for example image_harvest) remain untouched.
CREATE SCHEMA IF NOT EXISTS fountain_raw;
BEGIN;
SELECT fountain.set_mutation_actor(
  'ad5ebdc6-64a9-4f10-99a0-2edbeff758a4'::uuid,
  'stop_all_openrouter_backed_tasks_20260811'
);

CREATE TABLE IF NOT EXISTS fountain_raw.openrouter_backed_tasks_stopped_backup_20260811 AS
SELECT task.*, now() AS backed_up_at
FROM fountain_ops.task_queue task
WHERE task.task_type IN ('contact_fill','image_classify','menu_extract','llm_smoke')
  AND task.status IN ('pending','claimed');

DO $$
BEGIN
  IF (SELECT count(*) FROM fountain_raw.openrouter_backed_tasks_stopped_backup_20260811) <> 1063 THEN
    RAISE EXCEPTION 'OpenRouter-backed runnable task population changed from 1063';
  END IF;
END;
$$;

UPDATE fountain_ops.task_queue task
SET status='skipped', claimed_by=NULL, claimed_at=NULL,
    result=coalesce(task.result,'{}'::jsonb)||jsonb_build_object(
      'outcome','skipped','reason','user_requested_no_openrouter_20260811'
    ),
    error=NULL, updated_at=now()
WHERE task.task_type IN ('contact_fill','image_classify','menu_extract','llm_smoke')
  AND task.status IN ('pending','claimed');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM fountain_ops.task_queue
    WHERE task_type IN ('contact_fill','image_classify','menu_extract','llm_smoke')
      AND status IN ('pending','claimed')
  ) THEN
    RAISE EXCEPTION 'An OpenRouter-backed task is still runnable';
  END IF;
END;
$$;
COMMIT;
