-- User-owned label categories. Existing labels remain uncategorized.
CREATE TABLE IF NOT EXISTS label_categories (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name),
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 40)
);

ALTER TABLE label_documents ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE label_documents DROP CONSTRAINT IF EXISTS label_documents_category_fk;
ALTER TABLE label_documents
  ADD CONSTRAINT label_documents_category_fk
  FOREIGN KEY (category_id) REFERENCES label_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS label_categories_user_name_idx ON label_categories (user_id, name);
