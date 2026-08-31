ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_subject TEXT,
  ADD COLUMN IF NOT EXISTS google_picture_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_subject_unique
  ON users(google_subject)
  WHERE google_subject IS NOT NULL;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS storage_status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS blob_pathname TEXT,
  ADD COLUMN IF NOT EXISTS blob_url TEXT,
  ADD COLUMN IF NOT EXISTS storage_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE attachments ALTER COLUMN storage_name DROP NOT NULL;
ALTER TABLE attachments ALTER COLUMN sha256 DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attachments_blob_pathname_unique
  ON attachments(blob_pathname)
  WHERE blob_pathname IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attachments_blob_url_unique
  ON attachments(blob_url)
  WHERE blob_url IS NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_storage_status_check'
  ) THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_storage_status_check
      CHECK (storage_status IN ('pending', 'ready', 'delete_pending'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_storage_location_check'
  ) THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_storage_location_check
      CHECK (
        storage_status = 'pending'
        OR storage_name IS NOT NULL
        OR (blob_pathname IS NOT NULL AND blob_url IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_blob_pair_check'
  ) THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_blob_pair_check
      CHECK (blob_url IS NULL OR blob_pathname IS NOT NULL);
  END IF;
END
$migration$;
