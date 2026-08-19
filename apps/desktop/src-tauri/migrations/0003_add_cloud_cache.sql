CREATE TABLE IF NOT EXISTS cloud_label_cache (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  content TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  last_opened_at TEXT,
  sync_status TEXT NOT NULL,
  last_synced_at TEXT,
  PRIMARY KEY (user_id, id),
  CHECK (sync_status IN ('synced', 'pending', 'syncing', 'conflict', 'failed'))
);
CREATE INDEX IF NOT EXISTS cloud_label_cache_user_updated_idx
  ON cloud_label_cache (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS cloud_sync_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  expected_revision INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_sync_queue_user_created_idx
  ON cloud_sync_queue (user_id, created_at ASC);
