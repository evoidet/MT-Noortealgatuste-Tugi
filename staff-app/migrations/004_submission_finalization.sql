-- Repair the finalization contract without changing checksummed migration 003.
-- Safe for both fully migrated databases and installations with schema drift.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check CHECK (
  status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED',
    'READY_FOR_EXPORT', 'PUBLISHED', 'NEEDS_CHANGES', 'REJECTED')
);

CREATE UNIQUE INDEX IF NOT EXISTS submissions_news_slug_unique
  ON submissions ((lower(data_json ->> 'slug')))
  WHERE type = 'news' AND NULLIF(btrim(data_json ->> 'slug'), '') IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attachments_one_primary_per_submission
  ON attachments (submission_id)
  WHERE kind = 'primary' AND storage_status <> 'delete_pending';
CREATE INDEX IF NOT EXISTS submissions_published_news_idx
  ON submissions (published_at DESC, updated_at DESC)
  WHERE type = 'news' AND status = 'PUBLISHED';

-- Delivery state is persisted in the existing audit log, including markers from
-- older deployments. No submission or attachment records are removed or changed.
CREATE INDEX IF NOT EXISTS audit_expense_delivery_idx
  ON audit_logs (target_id, (metadata_json ->> 'deliveryKey'), id DESC)
  WHERE target_type = 'expense'
    AND action IN ('EXPENSE_NOTIFICATION_STARTED', 'EXPENSE_NOTIFICATION_SENT',
      'EXPENSE_NOTIFICATION_REJECTED');
