CREATE TABLE IF NOT EXISTS cloud_asset_cache (
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  data_url TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, asset_id)
);
CREATE INDEX IF NOT EXISTS cloud_asset_cache_user_updated_idx
  ON cloud_asset_cache (user_id, updated_at DESC);
