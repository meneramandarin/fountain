ALTER TABLE fountain.outbound_clicks
  ADD COLUMN IF NOT EXISTS param_skipped boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_param_skipped_clicked
  ON fountain.outbound_clicks (param_skipped, clicked_at DESC);
