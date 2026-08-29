import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

function mapSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    creatorId: row.creator_id,
    creatorEmail: row.creator_email,
    creatorName: row.creator_name,
    status: row.status,
    data: parseJson(row.data_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    revision: row.revision_no
  };
}

function mapAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    submissionId: row.submission_id,
    uploaderId: row.uploader_id,
    storageName: row.storage_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size_bytes,
    sha256: row.sha256,
    createdAt: row.created_at
  };
}

export function openDatabase(databasePath) {
  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA synchronous = NORMAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('member','editor','finance','admin')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      user_agent_hash TEXT,
      ip_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS oauth_attempts (
      state_hash TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      nonce TEXT NOT NULL,
      redirect_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS oauth_attempts_expiry_idx ON oauth_attempts(expires_at);

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('news','expense','invoice')),
      creator_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','READY_FOR_EXPORT','NEEDS_CHANGES','REJECTED')),
      data_json TEXT NOT NULL,
      revision_no INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS submissions_creator_idx ON submissions(creator_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS submissions_review_idx ON submissions(type, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      revision_no INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      event TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE(submission_id, revision_no)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      reviewer_id TEXT NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL CHECK (decision IN ('approve','needs_changes','reject')),
      comment TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reviews_submission_idx ON reviews(submission_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      uploader_id TEXT NOT NULL REFERENCES users(id),
      storage_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attachments_submission_idx ON attachments(submission_id, created_at);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      email TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      ip_hash TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);
  `);

  const statements = {
    upsertUser: sqlite.prepare(`
      INSERT INTO users (id,email,name,role,created_at,updated_at,last_login_at)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET
        name=excluded.name,
        role=excluded.role,
        updated_at=excluded.updated_at,
        last_login_at=excluded.last_login_at
    `),
    userByEmail: sqlite.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE"),
    userById: sqlite.prepare("SELECT * FROM users WHERE id = ?"),
    createOauth: sqlite.prepare("INSERT INTO oauth_attempts VALUES (?,?,?,?,?,?)"),
    oauthByState: sqlite.prepare("SELECT * FROM oauth_attempts WHERE state_hash = ?"),
    deleteOauth: sqlite.prepare("DELETE FROM oauth_attempts WHERE state_hash = ?"),
    pruneOauth: sqlite.prepare("DELETE FROM oauth_attempts WHERE expires_at <= ?"),
    createSession: sqlite.prepare("INSERT INTO sessions VALUES (?,?,?,?,?,?,?)"),
    sessionByHash: sqlite.prepare(`
      SELECT s.*,u.id AS user_id_value,u.email,u.name,u.role,u.created_at AS user_created_at,
             u.updated_at AS user_updated_at,u.last_login_at
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?
    `),
    touchSession: sqlite.prepare("UPDATE sessions SET last_seen_at=? WHERE token_hash=?"),
    deleteSession: sqlite.prepare("DELETE FROM sessions WHERE token_hash=?"),
    pruneSessions: sqlite.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
    createSubmission: sqlite.prepare(`
      INSERT INTO submissions (id,type,creator_id,status,data_json,revision_no,created_at,updated_at,submitted_at)
      VALUES (?,?,?,?,?,1,?,?,NULL)
    `),
    createRevision: sqlite.prepare(`
      INSERT INTO revisions (id,submission_id,revision_no,data_json,event,created_by,created_at)
      VALUES (?,?,?,?,?,?,?)
    `),
    submissionById: sqlite.prepare(`
      SELECT s.*,u.email AS creator_email,u.name AS creator_name
      FROM submissions s JOIN users u ON u.id=s.creator_id WHERE s.id=?
    `),
    listSubmissions: sqlite.prepare(`
      SELECT s.*,u.email AS creator_email,u.name AS creator_name
      FROM submissions s JOIN users u ON u.id=s.creator_id ORDER BY s.updated_at DESC LIMIT ?
    `),
    updateSubmission: sqlite.prepare(`
      UPDATE submissions SET data_json=?,revision_no=?,updated_at=? WHERE id=?
    `),
    updateStatus: sqlite.prepare(`
      UPDATE submissions SET status=?,updated_at=?,submitted_at=COALESCE(?,submitted_at) WHERE id=?
    `),
    createReview: sqlite.prepare(`
      INSERT INTO reviews (id,submission_id,reviewer_id,decision,comment,created_at)
      VALUES (?,?,?,?,?,?)
    `),
    listReviews: sqlite.prepare(`
      SELECT r.*,u.email AS reviewer_email,u.name AS reviewer_name
      FROM reviews r JOIN users u ON u.id=r.reviewer_id
      WHERE r.submission_id=? ORDER BY r.created_at DESC
    `),
    createAttachment: sqlite.prepare(`
      INSERT INTO attachments (id,submission_id,uploader_id,storage_name,original_name,mime_type,size_bytes,sha256,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `),
    attachmentById: sqlite.prepare("SELECT * FROM attachments WHERE id=?"),
    attachmentsForSubmission: sqlite.prepare("SELECT * FROM attachments WHERE submission_id=? ORDER BY created_at"),
    createAudit: sqlite.prepare(`
      INSERT INTO audit_logs (user_id,email,action,target_type,target_id,metadata_json,ip_hash,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `),
    listAudit: sqlite.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?")
  };

  function transaction(work) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    raw: sqlite,
    close: () => sqlite.close(),
    pruneExpired() {
      const current = nowIso();
      statements.pruneOauth.run(current);
      statements.pruneSessions.run(current);
    },
    upsertUser({ email, name, role }) {
      const normalizedEmail = email.toLowerCase();
      const current = nowIso();
      const existing = statements.userByEmail.get(normalizedEmail);
      const id = existing?.id ?? randomUUID();
      statements.upsertUser.run(id, normalizedEmail, name, role, existing?.created_at ?? current, current, current);
      return mapUser(statements.userByEmail.get(normalizedEmail));
    },
    getUserByEmail(email) {
      return mapUser(statements.userByEmail.get(email.toLowerCase()));
    },
    getUserById(id) {
      return mapUser(statements.userById.get(id));
    },
    createOauthAttempt({ stateHash, codeVerifier, nonce, redirectPath, expiresAt }) {
      statements.createOauth.run(stateHash, codeVerifier, nonce, redirectPath, nowIso(), expiresAt);
    },
    consumeOauthAttempt(stateHash) {
      return transaction(() => {
        const row = statements.oauthByState.get(stateHash);
        statements.deleteOauth.run(stateHash);
        if (!row || row.expires_at <= nowIso()) return null;
        return {
          codeVerifier: row.code_verifier,
          nonce: row.nonce,
          redirectPath: row.redirect_path
        };
      });
    },
    createSession({ tokenHash, userId, expiresAt, userAgentHash, ipHash }) {
      const current = nowIso();
      statements.createSession.run(tokenHash, userId, current, expiresAt, current, userAgentHash, ipHash);
    },
    getSession(tokenHash) {
      const row = statements.sessionByHash.get(tokenHash);
      if (!row || row.expires_at <= nowIso()) {
        if (row) statements.deleteSession.run(tokenHash);
        return null;
      }
      statements.touchSession.run(nowIso(), tokenHash);
      return {
        tokenHash,
        expiresAt: row.expires_at,
        user: mapUser({
          id: row.user_id_value,
          email: row.email,
          name: row.name,
          role: row.role,
          created_at: row.user_created_at,
          updated_at: row.user_updated_at,
          last_login_at: row.last_login_at
        })
      };
    },
    deleteSession(tokenHash) {
      statements.deleteSession.run(tokenHash);
    },
    createSubmission({ type, creatorId, data }) {
      const id = randomUUID();
      const current = nowIso();
      const serialized = JSON.stringify(data);
      transaction(() => {
        statements.createSubmission.run(id, type, creatorId, "DRAFT", serialized, current, current);
        statements.createRevision.run(randomUUID(), id, 1, serialized, "CREATED", creatorId, current);
      });
      return this.getSubmission(id);
    },
    getSubmission(id) {
      return mapSubmission(statements.submissionById.get(id));
    },
    listSubmissions(limit = 250) {
      return statements.listSubmissions.all(Math.min(Math.max(limit, 1), 500)).map(mapSubmission);
    },
    updateSubmission({ id, userId, data, event = "UPDATED" }) {
      return transaction(() => {
        const currentSubmission = this.getSubmission(id);
        if (!currentSubmission) return null;
        const nextRevision = currentSubmission.revision + 1;
        const serialized = JSON.stringify(data);
        const current = nowIso();
        statements.updateSubmission.run(serialized, nextRevision, current, id);
        statements.createRevision.run(randomUUID(), id, nextRevision, serialized, event, userId, current);
        return this.getSubmission(id);
      });
    },
    setSubmissionStatus({ id, status, userId, event }) {
      return transaction(() => {
        const submission = this.getSubmission(id);
        if (!submission) return null;
        const current = nowIso();
        statements.updateStatus.run(status, current, status === "SUBMITTED" ? current : null, id);
        const updated = this.getSubmission(id);
        statements.createRevision.run(
          randomUUID(),
          id,
          updated.revision + 1,
          JSON.stringify(updated.data),
          event,
          userId,
          current
        );
        statements.updateSubmission.run(JSON.stringify(updated.data), updated.revision + 1, current, id);
        return this.getSubmission(id);
      });
    },
    addReview({ submissionId, reviewerId, decision, comment, nextStatus }) {
      return transaction(() => {
        const current = nowIso();
        statements.createReview.run(randomUUID(), submissionId, reviewerId, decision, comment || null, current);
        statements.updateStatus.run(nextStatus, current, null, submissionId);
        return this.getSubmission(submissionId);
      });
    },
    listReviews(submissionId) {
      return statements.listReviews.all(submissionId).map((row) => ({
        id: row.id,
        decision: row.decision,
        comment: row.comment,
        reviewer: { id: row.reviewer_id, email: row.reviewer_email, name: row.reviewer_name },
        createdAt: row.created_at
      }));
    },
    createAttachment(input) {
      const id = randomUUID();
      statements.createAttachment.run(
        id,
        input.submissionId,
        input.uploaderId,
        input.storageName,
        input.originalName,
        input.mimeType,
        input.size,
        input.sha256,
        nowIso()
      );
      return this.getAttachment(id);
    },
    getAttachment(id) {
      return mapAttachment(statements.attachmentById.get(id));
    },
    listAttachments(submissionId) {
      return statements.attachmentsForSubmission.all(submissionId).map(mapAttachment);
    },
    audit({ user, action, targetType = null, targetId = null, metadata = {}, ipHash = null }) {
      statements.createAudit.run(
        user?.id ?? null,
        user?.email ?? null,
        action,
        targetType,
        targetId,
        JSON.stringify(metadata),
        ipHash,
        nowIso()
      );
    },
    listAudit(limit = 200) {
      return statements.listAudit.all(Math.min(Math.max(limit, 1), 500)).map((row) => ({
        id: row.id,
        userId: row.user_id,
        email: row.email,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        metadata: parseJson(row.metadata_json),
        ipHash: row.ip_hash,
        createdAt: row.created_at
      }));
    }
  };
}

