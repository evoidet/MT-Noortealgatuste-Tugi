-- Issued invoice documents are archived independently from expense folders.
-- Drive appProperties remain the remote idempotency source if the database
-- write fails after a successful upload.
CREATE TABLE IF NOT EXISTS invoice_drive_archives (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  drive_file_id TEXT,
  drive_file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'complete', 'failed', 'not_configured')
  ),
  error_code TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_drive_archives_status_idx
  ON invoice_drive_archives (status, updated_at);
