CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  user_id UUID,
  status TEXT NOT NULL DEFAULT 'subscribed'
    CHECK (status IN ('pending', 'subscribed', 'unsubscribed', 'bounced', 'complained')),
  source TEXT NOT NULL DEFAULT 'footer',
  consent_version TEXT NOT NULL DEFAULT 'newsletter-v1',
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  suppressed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email = LOWER(BTRIM(email)))
);

CREATE INDEX IF NOT EXISTS newsletter_subscriptions_status_idx
  ON newsletter_subscriptions (status);

CREATE INDEX IF NOT EXISTS newsletter_subscriptions_user_id_idx
  ON newsletter_subscriptions (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE newsletter_subscriptions IS
  'Newsletter consent records, intentionally separate from authenticated user accounts.';

COMMENT ON COLUMN newsletter_subscriptions.user_id IS
  'Optional link to a future authenticated user; anonymous subscribers remain valid without one.';
