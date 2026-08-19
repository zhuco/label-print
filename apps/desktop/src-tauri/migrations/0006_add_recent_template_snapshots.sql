CREATE TABLE IF NOT EXISTS recent_template_snapshots (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT,
  opened_at INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS recent_template_snapshots_opened_idx
  ON recent_template_snapshots (opened_at DESC);
