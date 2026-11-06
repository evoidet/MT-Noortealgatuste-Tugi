-- Claims are committed before SMTP. Unknown outcomes are never automatically retried.
ALTER TABLE financial_deliveries ADD COLUMN snapshot_key TEXT;
ALTER TABLE financial_deliveries ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE financial_deliveries ADD COLUMN legacy_submission_id TEXT REFERENCES submissions(id);
ALTER TABLE financial_deliveries ADD CONSTRAINT financial_delivery_source
 CHECK ((document_id IS NULL) <> (legacy_submission_id IS NULL));
CREATE INDEX financial_legacy_copy_lookup
 ON financial_deliveries(legacy_submission_id,snapshot_key,created_at);
CREATE INDEX financial_invoice_copy_lookup
 ON financial_deliveries(document_id,snapshot_key,created_at);
