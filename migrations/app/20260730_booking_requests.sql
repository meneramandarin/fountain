CREATE TABLE IF NOT EXISTS booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id BIGINT NOT NULL,
  location_slug TEXT,
  location_name TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_phone TEXT,
  requester_timezone TEXT NOT NULL,
  selected_services JSONB NOT NULL,
  preferences JSONB NOT NULL,
  source_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'contacting_clinic', 'confirmed', 'declined', 'cancelled')),
  notification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent', 'failed', 'not_configured')),
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(preferences) = 'array'),
  CHECK (jsonb_array_length(preferences) = 3),
  CONSTRAINT booking_requests_selected_services_check
    CHECK (
      jsonb_typeof(selected_services) = 'array'
      AND jsonb_array_length(selected_services) > 0
    ),
  CHECK (requester_email = LOWER(BTRIM(requester_email)))
);

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS selected_services JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_requests_selected_services_check'
      AND conrelid = 'booking_requests'::regclass
  ) THEN
    ALTER TABLE booking_requests
      ADD CONSTRAINT booking_requests_selected_services_check
      CHECK (
        jsonb_typeof(selected_services) = 'array'
        AND jsonb_array_length(selected_services) > 0
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE booking_requests
  ALTER COLUMN selected_services DROP DEFAULT;

CREATE INDEX IF NOT EXISTS booking_requests_status_created_idx
  ON booking_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS booking_requests_location_idx
  ON booking_requests (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS booking_requests_email_idx
  ON booking_requests (requester_email, created_at DESC);

COMMENT ON TABLE booking_requests IS
  'Appointment requests submitted from location listing pages for manual fulfillment by Fountain.';
