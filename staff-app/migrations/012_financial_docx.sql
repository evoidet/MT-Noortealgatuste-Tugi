-- Existing PDF bytes and financial data remain unchanged.
ALTER TABLE financial_documents ADD COLUMN docx BYTEA;
ALTER TABLE financial_documents ADD COLUMN confirmed_at TIMESTAMPTZ;
ALTER TABLE financial_documents ADD COLUMN confirmed_by TEXT REFERENCES users(id);
ALTER TABLE financial_documents ADD COLUMN confirmation_delivery_status TEXT
 CHECK (confirmation_delivery_status IN ('SENDING','SENT','UNCERTAIN'));
DO $$ DECLARE c RECORD; BEGIN
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='financial_documents'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%pdf IS NOT NULL%'
 LOOP EXECUTE format('ALTER TABLE financial_documents DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE financial_documents ADD CONSTRAINT financial_document_artifact
 CHECK(status='DRAFT' OR pdf IS NOT NULL OR docx IS NOT NULL);
ALTER TABLE financial_deliveries ADD COLUMN purpose TEXT NOT NULL DEFAULT 'manual';
CREATE UNIQUE INDEX financial_confirmation_once ON financial_deliveries(document_id) WHERE purpose='confirmation';
