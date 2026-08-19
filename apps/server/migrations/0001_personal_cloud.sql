-- Personal cloud API baseline. Apply through the production migration runner as one transaction.
-- IDs are generated in the application, so this migration works with managed PostgreSQL roles
-- that are not permitted to install extensions.

CREATE TABLE auth_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT auth_users_email_normalized CHECK (email = lower(email)),
  CONSTRAINT auth_users_email_unique UNIQUE (email)
);

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth_users(id) ON DELETE RESTRICT,
  display_name TEXT,
  plan_code TEXT NOT NULL DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (plan_code IN ('free', 'pro'))
);

-- Only a hash of each opaque refresh/reset token is stored. Token plaintext never reaches this table.
CREATE TABLE auth_refresh_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_refresh_sessions_active_user_idx
  ON auth_refresh_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE label_documents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  category_id UUID,
  schema_version INTEGER NOT NULL,
  content JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CHECK (schema_version >= 1),
  CHECK (revision >= 1)
);
CREATE INDEX label_documents_user_updated_idx
  ON label_documents (user_id, updated_at DESC);
CREATE INDEX label_documents_user_deleted_idx
  ON label_documents (user_id, deleted_at);

CREATE TABLE label_categories (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name),
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 40)
);
ALTER TABLE label_documents
  ADD CONSTRAINT label_documents_category_fk
  FOREIGN KEY (category_id) REFERENCES label_categories(id) ON DELETE SET NULL;
CREATE INDEX label_categories_user_name_idx ON label_categories (user_id, name);

CREATE TABLE label_assets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  mime_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  upload_state TEXT NOT NULL DEFAULT 'initiated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CHECK (kind IN ('image', 'icon')),
  CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  CHECK (byte_size > 0 AND byte_size <= 10485760),
  CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (upload_state IN ('initiated', 'completed', 'deleted'))
);
CREATE INDEX label_assets_user_hash_idx ON label_assets (user_id, sha256);
CREATE UNIQUE INDEX label_assets_completed_hash_unique
  ON label_assets (user_id, sha256, mime_type) WHERE upload_state = 'completed' AND deleted_at IS NULL;

CREATE TABLE label_document_assets (
  label_id UUID NOT NULL REFERENCES label_documents(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES label_assets(id) ON DELETE RESTRICT,
  PRIMARY KEY (label_id, asset_id)
);
CREATE INDEX label_document_assets_asset_idx ON label_document_assets (asset_id);

CREATE TABLE official_templates (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  required_plan TEXT NOT NULL DEFAULT 'free',
  schema_version INTEGER NOT NULL,
  content JSONB NOT NULL,
  preview_object_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (required_plan IN ('free', 'pro'))
);
CREATE INDEX official_templates_catalog_idx
  ON official_templates (enabled, sort_order, name);

CREATE TABLE desktop_releases (
  id UUID PRIMARY KEY,
  version TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'stable',
  target TEXT NOT NULL,
  arch TEXT NOT NULL,
  artifact_url TEXT NOT NULL,
  artifact_signature TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  artifact_size BIGINT NOT NULL,
  release_notes TEXT NOT NULL DEFAULT '',
  minimum_supported_version TEXT,
  mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percent INTEGER NOT NULL DEFAULT 100,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version, channel, target, arch),
  CHECK (channel IN ('stable', 'beta')),
  CHECK (rollout_percent BETWEEN 0 AND 100),
  CHECK (artifact_size > 0)
);
CREATE INDEX desktop_releases_lookup_idx
  ON desktop_releases (channel, target, arch, published_at DESC) WHERE published_at IS NOT NULL;

-- Production repositories must perform quota checks and inserts in one transaction, for example:
--   SELECT pg_advisory_xact_lock(hashtextextended(:user_id::text, 0));
--   SELECT COUNT(*) FROM label_documents WHERE user_id = :user_id;
--   INSERT INTO label_documents (...);
-- Soft-deleted rows are intentionally counted; only DELETE permanently releases a label slot.
