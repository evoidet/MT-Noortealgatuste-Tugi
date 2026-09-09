-- Keep old archives intact while distinguishing corrected submission versions.
ALTER TABLE submission_drive_archives ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;
ALTER TABLE invoice_drive_archives ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;
