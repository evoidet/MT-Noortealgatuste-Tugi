-- Preserve the authenticated creator while storing the approved reimbursement
-- recipient as a separate identity. NULL keeps legacy submissions valid and
-- means that their creator remains their reimbursement recipient.
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS reimbursement_recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS reimbursement_recipient_name TEXT;
