CREATE INDEX IF NOT EXISTS cloud_sync_queue_user_retry_idx
  ON cloud_sync_queue (user_id, next_attempt_at ASC, created_at ASC);
