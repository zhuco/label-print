-- Account deletion is deliberately two-stage: service access is frozen immediately, then a
-- scheduled worker can erase the account and its storage after the stated grace period.
ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS auth_users_deletion_schedule_idx
  ON auth_users (deletion_scheduled_for)
  WHERE deletion_scheduled_for IS NOT NULL;
