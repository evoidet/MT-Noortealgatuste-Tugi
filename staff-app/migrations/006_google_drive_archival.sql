-- Google Drive is an additional archive for expense submissions. Remote object
-- identity is also stored in Drive appProperties so a retry can recover after a
-- successful Drive write followed by a failed database write.
CREATE TABLE IF NOT EXISTS submission_drive_archives (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  parent_folder_id TEXT,
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'complete', 'failed', 'not_configured')
  ),
  error_code TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS submission_drive_archives_status_idx
  ON submission_drive_archives (status, updated_at);
