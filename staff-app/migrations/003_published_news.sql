ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS submissions_status_check;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check CHECK (
    status IN (
      'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED',
      'READY_FOR_EXPORT', 'PUBLISHED', 'NEEDS_CHANGES', 'REJECTED'
    )
  );

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE submissions
SET status = 'PUBLISHED',
    published_at = COALESCE(published_at, updated_at)
WHERE type = 'news' AND status = 'READY_FOR_EXPORT';

CREATE UNIQUE INDEX IF NOT EXISTS submissions_news_slug_unique
  ON submissions ((lower(data_json ->> 'slug')))
  WHERE type = 'news' AND NULLIF(btrim(data_json ->> 'slug'), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attachments_one_primary_per_submission
  ON attachments (submission_id)
  WHERE kind = 'primary' AND storage_status <> 'delete_pending';

CREATE INDEX IF NOT EXISTS submissions_published_news_idx
  ON submissions (published_at DESC, updated_at DESC)
  WHERE type = 'news' AND status = 'PUBLISHED';
