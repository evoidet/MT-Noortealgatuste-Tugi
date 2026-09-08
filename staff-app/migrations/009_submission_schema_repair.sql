-- Repair every submissions column added after the initial schema. This is safe
-- for fresh databases, normally migrated databases, and installations whose
-- migration ledger exists but whose schema has drifted. All columns remain
-- nullable so legacy submissions and existing data are preserved unchanged.
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reimbursement_recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS reimbursement_recipient_name TEXT;

CREATE INDEX IF NOT EXISTS submissions_published_news_idx
  ON submissions (published_at DESC, updated_at DESC)
  WHERE type = 'news' AND status = 'PUBLISHED';
