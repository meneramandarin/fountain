-- Standing operational schema for the Fountain pipeline.
-- This is an intentionally one-shot migration: reruns fail on existing tables
-- instead of silently accepting schema drift.

BEGIN;

CREATE SCHEMA IF NOT EXISTS fountain_ops;

CREATE TABLE fountain_ops.runs (
  id bigserial PRIMARY KEY,
  command text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_usd numeric(18, 10),
  spent_usd_estimate numeric(18, 10) NOT NULL DEFAULT 0,
  notes text,
  dry_run boolean NOT NULL DEFAULT true,
  CONSTRAINT runs_command_nonempty_check
    CHECK (btrim(command) <> ''),
  CONSTRAINT runs_args_object_check
    CHECK (jsonb_typeof(args) = 'object'),
  CONSTRAINT runs_counts_object_check
    CHECK (jsonb_typeof(counts) = 'object'),
  CONSTRAINT runs_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'budget_exhausted', 'cancelled')),
  CONSTRAINT runs_budget_nonnegative_check
    CHECK (budget_usd IS NULL OR budget_usd >= 0),
  CONSTRAINT runs_spent_nonnegative_check
    CHECK (spent_usd_estimate >= 0),
  CONSTRAINT runs_finished_after_started_check
    CHECK (finished_at IS NULL OR finished_at >= started_at),
  CONSTRAINT runs_lifecycle_check
    CHECK (
      (status = 'running' AND finished_at IS NULL)
      OR (status <> 'running' AND finished_at IS NOT NULL)
    )
);

CREATE TABLE fountain_ops.task_queue (
  id bigserial PRIMARY KEY,
  task_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id integer NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  claimed_by text,
  claimed_at timestamptz,
  result jsonb,
  error text,
  run_id bigint REFERENCES fountain_ops.runs(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_queue_task_type_check
    CHECK (task_type IN (
      'legitimacy_check',
      'contact_fill',
      'geocode',
      'image_harvest',
      'image_classify',
      'menu_extract',
      'reviews_fetch',
      'dedup_scan',
      'freshness_check',
      'noop',
      'llm_smoke'
    )),
  CONSTRAINT task_queue_entity_type_nonempty_check
    CHECK (btrim(entity_type) <> ''),
  CONSTRAINT task_queue_status_check
    CHECK (status IN ('pending', 'claimed', 'done', 'failed', 'skipped')),
  CONSTRAINT task_queue_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT task_queue_attempts_check
    CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts),
  CONSTRAINT task_queue_claim_check
    CHECK (status <> 'claimed' OR (claimed_by IS NOT NULL AND claimed_at IS NOT NULL)),
  CONSTRAINT task_queue_updated_after_created_check
    CHECK (updated_at >= created_at)
);

CREATE INDEX task_queue_claim_idx
  ON fountain_ops.task_queue (task_type, status, priority, id);

CREATE INDEX task_queue_entity_idx
  ON fountain_ops.task_queue (entity_type, entity_id);

CREATE INDEX task_queue_run_idx
  ON fountain_ops.task_queue (run_id);

CREATE UNIQUE INDEX task_queue_active_unique_idx
  ON fountain_ops.task_queue (task_type, entity_type, entity_id)
  WHERE status IN ('pending', 'claimed');

CREATE TABLE fountain_ops.field_status (
  entity_type text NOT NULL,
  entity_id integer NOT NULL,
  field text NOT NULL,
  verification text NOT NULL DEFAULT 'unverified',
  locked boolean NOT NULL DEFAULT false,
  verified_by text,
  verified_at timestamptz,
  source_note text,
  PRIMARY KEY (entity_type, entity_id, field),
  CONSTRAINT field_status_entity_type_nonempty_check
    CHECK (btrim(entity_type) <> ''),
  CONSTRAINT field_status_field_nonempty_check
    CHECK (btrim(field) <> ''),
  CONSTRAINT field_status_verification_check
    CHECK (verification IN ('unverified', 'agent_verified', 'human_verified', 'owner_verified'))
);

CREATE TABLE fountain_ops.external_calls (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES fountain_ops.runs(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  call_type text NOT NULL,
  entity_id integer,
  model text,
  request_fingerprint text NOT NULL,
  status text NOT NULL,
  http_status integer,
  tokens jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_estimate_usd numeric(18, 10) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_calls_provider_nonempty_check
    CHECK (btrim(provider) <> ''),
  CONSTRAINT external_calls_call_type_nonempty_check
    CHECK (btrim(call_type) <> ''),
  CONSTRAINT external_calls_request_fingerprint_nonempty_check
    CHECK (btrim(request_fingerprint) <> ''),
  CONSTRAINT external_calls_status_nonempty_check
    CHECK (btrim(status) <> ''),
  CONSTRAINT external_calls_tokens_object_check
    CHECK (jsonb_typeof(tokens) = 'object'),
  CONSTRAINT external_calls_http_status_check
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT external_calls_cost_nonnegative_check
    CHECK (cost_estimate_usd >= 0)
);

CREATE INDEX external_calls_run_idx
  ON fountain_ops.external_calls (run_id);

CREATE INDEX external_calls_provider_created_idx
  ON fountain_ops.external_calls (provider, created_at);

CREATE INDEX external_calls_request_fingerprint_idx
  ON fountain_ops.external_calls (request_fingerprint, created_at DESC);

COMMIT;
