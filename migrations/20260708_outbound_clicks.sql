CREATE TABLE IF NOT EXISTS fountain.outbound_clicks (
  id bigserial PRIMARY KEY,
  location_id integer NOT NULL REFERENCES fountain.locations(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL DEFAULT now(),
  source_page text,
  internal_from text,
  referrer text,
  user_agent_hash text,
  is_bot boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_location_clicked
  ON fountain.outbound_clicks (location_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_clicks_clicked_at
  ON fountain.outbound_clicks (clicked_at DESC);
