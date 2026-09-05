-- New migration version repairs installations whose earlier migration ledger
-- is current but whose news timestamp is missing. Never rewrite old checksums.
-- News shares submissions with finance records; unpublished rows stay NULL.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS submissions_published_news_idx
  ON submissions (published_at DESC, updated_at DESC)
  WHERE type = 'news' AND status = 'PUBLISHED';
