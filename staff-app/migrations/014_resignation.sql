-- Extend the unified registry; resignation payloads remain private to their creator.
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_type_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_type_check
  CHECK (type IN ('news', 'expense', 'invoice', 'resignation'));
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_status_check CHECK (
  status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'READY_FOR_EXPORT',
    'PUBLISHED', 'NEEDS_CHANGES', 'REJECTED') OR
  (type = 'resignation' AND status IN ('SENDING', 'SENT', 'SEND_FAILED', 'UNCERTAIN'))
);
