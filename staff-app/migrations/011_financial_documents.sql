-- Additive only. Identity conflicts are not merged or deleted.
CREATE TABLE financial_access (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO financial_access(user_id)
 SELECT id FROM users WHERE google_subject IS NOT NULL AND lower(email) IN
 ('egor@noortetugi.ee','egor.stepanov@noortetugi.ee','mihhail.komarov@noortetugi.ee')
 ON CONFLICT DO NOTHING;
CREATE SEQUENCE financial_invoice_number;
CREATE SEQUENCE financial_quotation_number;
CREATE TABLE financial_documents (
 id UUID PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('invoice','quotation')),
 number TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','READY','SENDING','SENT','UNCERTAIN')),
 data JSONB NOT NULL,
 issuer JSONB NOT NULL,
 creator_id TEXT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 version INTEGER NOT NULL DEFAULT 1,
 correction_of UUID REFERENCES financial_documents(id),
 pdf BYTEA,
 CHECK(status = 'DRAFT' OR pdf IS NOT NULL)
);
CREATE INDEX financial_documents_created ON financial_documents(created_at DESC);
CREATE INDEX financial_documents_status ON financial_documents(status,created_at DESC);
CREATE TABLE financial_history (
 id BIGSERIAL PRIMARY KEY,
 document_id UUID NOT NULL REFERENCES financial_documents(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 snapshot JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX financial_history_document ON financial_history(document_id,id);
CREATE TABLE financial_deliveries (
 id UUID PRIMARY KEY,
 document_id UUID NOT NULL REFERENCES financial_documents(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 recipient TEXT NOT NULL,
 subject TEXT NOT NULL,
 message TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('SENDING','SENT','UNCERTAIN')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ
);

-- Verified renames preserve IDs, Google subjects, roles and all foreign keys.
-- Conflicts remain untouched for manual identity verification.
WITH mapping(old_email,new_email) AS (VALUES
 ('egor@noortetugi.ee','egor.stepanov@noortetugi.ee'),
 ('sofia@noortetugi.ee','sofia.germ@noortetugi.ee'),
 ('andrei@noortetugi.ee','andrei.ostretsov@noortetugi.ee'),
 ('jekaterina@noortetugi.ee','jekaterina.rogozina@noortetugi.ee'),
 ('mihhail@noortetugi.ee','mihhail.semiyanov@noortetugi.ee'),
 ('mario@noortetugi.ee','mario.polshin@noortetugi.ee'))
UPDATE users u SET email=m.new_email,updated_at=NOW() FROM mapping m
 WHERE lower(u.email)=m.old_email
 AND NOT EXISTS(SELECT 1 FROM users other WHERE lower(other.email)=m.new_email);
