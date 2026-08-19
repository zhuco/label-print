-- Provider-neutral, signed subscription relay events. The provider-specific adapter verifies
-- its native callback before sending a single normalized event to the cloud API.

ALTER TABLE user_profiles
  ADD COLUMN subscription_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE billing_webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  plan_expires_at TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id),
  CHECK (char_length(btrim(provider)) BETWEEN 1 AND 80),
  CHECK (char_length(btrim(event_id)) BETWEEN 1 AND 200),
  CHECK (event_type IN ('subscription_activated', 'subscription_renewed', 'subscription_cancelled', 'subscription_refunded')),
  CHECK (plan_code IN ('free', 'pro'))
);

CREATE INDEX billing_webhook_events_user_occurred_idx
  ON billing_webhook_events (user_id, occurred_at DESC);
