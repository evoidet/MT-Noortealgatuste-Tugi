import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";

const { Pool } = pg;
const STAFF_ROLES = new Set(["member", "editor", "finance", "admin"]);

function parseJson(value, fallback = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function timestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function safeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    googleSubjectId: row.google_subject,
    googleSubject: row.google_subject,
    email: row.email,
    name: row.name,
    profilePictureUrl: row.google_picture_url,
    pictureUrl: row.google_picture_url,
    role: row.role,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    lastLoginAt: timestamp(row.last_login_at)
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
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    submittedAt: timestamp(row.submitted_at),
    publishedAt: timestamp(row.published_at),
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
    storageStatus: row.storage_status,
    blobPathname: row.blob_pathname,
    blobUrl: row.blob_url,
    originalName: row.original_name,
    mimeType: row.mime_type,
    kind: row.kind || "additional",
    size: safeInteger(row.size_bytes),
    sha256: row.sha256,
    createdAt: timestamp(row.created_at),
    storageUpdatedAt: timestamp(row.storage_updated_at)
  };
}

function boundedLimit(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), maximum);
}

function normalizeRole(role) {
  return STAFF_ROLES.has(role) ? role : "member";
}

function connectionStringFrom(input) {
  if (typeof input === "string") return input.trim();
  if (input && typeof input === "object") {
    return String(input.storageDatabaseUrl ?? input.connectionString ?? "").trim();
  }
  return "";
}

function createIdentityConflictError(cause) {
  const error = new Error("The verified Google identity conflicts with an existing staff account.");
  error.code = "STAFF_IDENTITY_CONFLICT";
  error.cause = cause;
  return error;
}

function createWorkflowStateError() {
  const error = new Error("The submission workflow state changed.");
  error.code = "INVALID_WORKFLOW_STATE";
  error.status = 409;
  return error;
}

function createSubmissionInProgressError() {
  const error = new Error("The submission is already being processed.");
  error.code = "SUBMISSION_IN_PROGRESS";
  error.status = 409;
  return error;
}

/**
 * Open the serverless-compatible Postgres data layer.
 *
 * Migrations are deliberately not run here. Deployments must run `npm run db:migrate`
 * as a separate, explicit step so application startup can never rewrite production
 * schema or data.
 */
export function openDatabase(storageDatabaseUrl, options = {}) {
  const connectionString = connectionStringFrom(storageDatabaseUrl);
  if (!options.pool && !connectionString) {
    const error = new Error("STORAGE_DATABASE_URL is required to open the staff database.");
    error.code = "STORAGE_DATABASE_URL_REQUIRED";
    throw error;
  }

  const pool = options.pool ?? new Pool({
    connectionString,
    max: options.maxConnections ?? 5,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
    allowExitOnIdle: options.allowExitOnIdle ?? true,
    application_name: "noortetugi-staff"
  });

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original error. A discarded pg client will not be reused.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function getSubmissionWith(queryable, id, { forUpdate = false } = {}) {
    const lockClause = forUpdate ? " FOR UPDATE OF s" : "";
    const result = await queryable.query(`
      SELECT s.*, u.email AS creator_email, u.name AS creator_name
      FROM submissions AS s
      JOIN users AS u ON u.id = s.creator_id
      WHERE s.id = $1${lockClause}
    `, [id]);
    return mapSubmission(result.rows[0]);
  }

  const database = {
    raw: pool,

    async close() {
      await pool.end();
    },

    async healthCheck() {
      const result = await pool.query("SELECT 1 AS ok");
      return result.rows[0]?.ok === 1;
    },

    async withSubmissionLock(submissionId, work) {
      if (typeof work !== "function") throw new TypeError("work must be a function.");
      const client = await pool.connect();
      let acquired = false;
      let releaseError;
      try {
        const result = await client.query(
          "SELECT pg_try_advisory_lock(hashtext('staff-submission-submit'), hashtext($1)) AS acquired",
          [submissionId]
        );
        acquired = result.rows[0]?.acquired === true;
        if (!acquired) throw createSubmissionInProgressError();
        return await work();
      } finally {
        if (acquired) {
          try {
            await client.query(
              "SELECT pg_advisory_unlock(hashtext('staff-submission-submit'), hashtext($1))",
              [submissionId]
            );
          } catch (error) {
            // Destroy a client whose session-level lock could not be released.
            releaseError = error;
          }
        }
        client.release(releaseError);
      }
    },

    async pruneExpired() {
      await transaction(async (client) => {
        await client.query("DELETE FROM oauth_attempts WHERE expires_at <= NOW()");
        await client.query("DELETE FROM sessions WHERE expires_at <= NOW()");
      });
    },

    async upsertUser({
      googleSubjectId,
      googleSubject,
      email,
      name,
      profilePictureUrl = null,
      pictureUrl = null,
      role = "member"
    }) {
      const normalizedSubject = String(googleSubjectId ?? googleSubject ?? "").trim();
      const normalizedEmail = String(email ?? "").trim().toLowerCase();
      if (!normalizedSubject || !normalizedEmail) {
        const error = new Error("A verified Google subject and email are required.");
        error.code = "VERIFIED_IDENTITY_REQUIRED";
        throw error;
      }

      const safeRole = normalizeRole(role);
      try {
        const result = await pool.query(`
          WITH updated_by_subject AS (
            UPDATE users
            SET email = $2,
                name = $3,
                google_picture_url = $4,
                role = CASE
                  WHEN $5 = 'admin' THEN 'admin'
                  WHEN users.role = 'admin' THEN 'member'
                  ELSE users.role
                END,
                updated_at = NOW(),
                last_login_at = NOW()
            WHERE google_subject = $1
            RETURNING *
          ),
          upserted_by_email AS (
            INSERT INTO users (
              id, google_subject, email, name, google_picture_url, role,
              created_at, updated_at, last_login_at
            )
            SELECT $6, $1, $2, $3, $4, $5, NOW(), NOW(), NOW()
            WHERE NOT EXISTS (SELECT 1 FROM updated_by_subject)
            ON CONFLICT ((lower(email))) DO UPDATE
            SET google_subject = EXCLUDED.google_subject,
                name = EXCLUDED.name,
                google_picture_url = EXCLUDED.google_picture_url,
                role = CASE
                  WHEN EXCLUDED.role = 'admin' THEN 'admin'
                  WHEN users.role = 'admin' THEN 'member'
                  ELSE users.role
                END,
                updated_at = NOW(),
                last_login_at = NOW()
            WHERE users.google_subject IS NULL
               OR users.google_subject = EXCLUDED.google_subject
            RETURNING *
          )
          SELECT * FROM updated_by_subject
          UNION ALL
          SELECT * FROM upserted_by_email
          LIMIT 1
        `, [
          normalizedSubject,
          normalizedEmail,
          String(name || normalizedEmail.split("@")[0]).slice(0, 160),
          profilePictureUrl || pictureUrl
            ? String(profilePictureUrl || pictureUrl).slice(0, 2048)
            : null,
          safeRole,
          randomUUID()
        ]);
        if (!result.rows[0]) throw createIdentityConflictError();
        return mapUser(result.rows[0]);
      } catch (error) {
        if (error?.code === "23505") throw createIdentityConflictError(error);
        throw error;
      }
    },

    async getUserByEmail(email) {
      const result = await pool.query(
        "SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1",
        [String(email ?? "").trim()]
      );
      return mapUser(result.rows[0]);
    },

    async getUserById(id) {
      const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      return mapUser(result.rows[0]);
    },

    async setUserRole(id, role) {
      if (!STAFF_ROLES.has(role)) {
        const error = new Error("Invalid staff role.");
        error.code = "INVALID_STAFF_ROLE";
        throw error;
      }
      const result = await pool.query(`
        UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING *
      `, [id, role]);
      return mapUser(result.rows[0]);
    },

    async createOauthAttempt({ stateHash, codeVerifier, nonce, redirectPath, expiresAt }) {
      await pool.query(`
        INSERT INTO oauth_attempts (
          state_hash, code_verifier, nonce, redirect_path, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, NOW(), $5)
      `, [stateHash, codeVerifier, nonce, redirectPath, expiresAt]);
    },

    async consumeOauthAttempt(stateHash) {
      const result = await pool.query(`
        DELETE FROM oauth_attempts
        WHERE state_hash = $1
        RETURNING code_verifier, nonce, redirect_path, expires_at
      `, [stateHash]);
      const row = result.rows[0];
      if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
      return {
        codeVerifier: row.code_verifier,
        nonce: row.nonce,
        redirectPath: row.redirect_path
      };
    },

    async createSession({ tokenHash, userId, expiresAt, userAgentHash, ipHash }) {
      await pool.query(`
        INSERT INTO sessions (
          token_hash, user_id, created_at, expires_at, last_seen_at, user_agent_hash, ip_hash
        ) VALUES ($1, $2, NOW(), $3, NOW(), $4, $5)
      `, [tokenHash, userId, expiresAt, userAgentHash, ipHash]);
    },

    async getSession(tokenHash) {
      const result = await pool.query(`
        WITH valid_session AS (
          UPDATE sessions
          SET last_seen_at = NOW()
          WHERE token_hash = $1 AND expires_at > NOW()
          RETURNING *
        )
        SELECT s.token_hash, s.expires_at,
               u.id, u.google_subject, u.email, u.name, u.google_picture_url,
               u.role, u.created_at, u.updated_at, u.last_login_at
        FROM valid_session AS s
        JOIN users AS u ON u.id = s.user_id
      `, [tokenHash]);
      const row = result.rows[0];
      if (!row) {
        await pool.query(
          "DELETE FROM sessions WHERE token_hash = $1 AND expires_at <= NOW()",
          [tokenHash]
        );
        return null;
      }
      return {
        tokenHash: row.token_hash,
        expiresAt: timestamp(row.expires_at),
        user: mapUser(row)
      };
    },

    async deleteSession(tokenHash) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    },

    async createSubmission({ type, creatorId, data }) {
      const id = randomUUID();
      const revisionId = randomUUID();
      const serialized = JSON.stringify(data ?? {});
      return transaction(async (client) => {
        await client.query(`
          INSERT INTO submissions (
            id, type, creator_id, status, data_json, revision_no,
            created_at, updated_at, submitted_at
          ) VALUES ($1, $2, $3, 'DRAFT', $4::jsonb, 1, NOW(), NOW(), NULL)
        `, [id, type, creatorId, serialized]);
        await client.query(`
          INSERT INTO revisions (
            id, submission_id, revision_no, data_json, event, created_by, created_at
          ) VALUES ($1, $2, 1, $3::jsonb, 'CREATED', $4, NOW())
        `, [revisionId, id, serialized, creatorId]);
        return getSubmissionWith(client, id);
      });
    },

    async getSubmission(id) {
      return getSubmissionWith(pool, id);
    },

    async listSubmissions(limit = 250) {
      const result = await pool.query(`
        SELECT s.*, u.email AS creator_email, u.name AS creator_name
        FROM submissions AS s
        JOIN users AS u ON u.id = s.creator_id
        ORDER BY s.updated_at DESC
        LIMIT $1
      `, [boundedLimit(limit, 250, 500)]);
      return result.rows.map(mapSubmission);
    },

    async listSubmissionsByCreator(creatorId, { type = null, limit = 250 } = {}) {
      const result = await pool.query(`
        SELECT s.*, u.email AS creator_email, u.name AS creator_name
        FROM submissions AS s
        JOIN users AS u ON u.id = s.creator_id
        WHERE s.creator_id = $1
          AND ($2::text IS NULL OR s.type = $2)
        ORDER BY s.updated_at DESC
        LIMIT $3
      `, [creatorId, type, boundedLimit(limit, 250, 500)]);
      return result.rows.map(mapSubmission);
    },

    async listReviewableSubmissions(types, { type = null, limit = 250 } = {}) {
      const allowedTypes = Array.isArray(types) ? types.filter((entry) =>
        ["news", "expense", "invoice"].includes(entry)
      ) : [];
      if (!allowedTypes.length) return [];
      const result = await pool.query(`
        SELECT s.*, u.email AS creator_email, u.name AS creator_name
        FROM submissions AS s
        JOIN users AS u ON u.id = s.creator_id
        WHERE s.type = ANY($1::text[])
          AND s.status IN ('SUBMITTED', 'UNDER_REVIEW')
          AND ($2::text IS NULL OR s.type = $2)
        ORDER BY s.updated_at DESC
        LIMIT $3
      `, [allowedTypes, type, boundedLimit(limit, 250, 500)]);
      return result.rows.map(mapSubmission);
    },

    async listPublishedNews(limit = 250) {
      const result = await pool.query(`
        SELECT s.*, u.email AS creator_email, u.name AS creator_name
        FROM submissions AS s
        JOIN users AS u ON u.id = s.creator_id
        WHERE s.type = 'news' AND s.status = 'PUBLISHED'
        ORDER BY
          CASE WHEN COALESCE((s.data_json ->> 'featured')::boolean, false) THEN 0 ELSE 1 END,
          COALESCE(s.published_at, s.updated_at) DESC
        LIMIT $1
      `, [boundedLimit(limit, 100, 250)]);
      return result.rows.map(mapSubmission);
    },

    async updateSubmission({ id, userId, data, event = "UPDATED" }) {
      const serialized = JSON.stringify(data ?? {});
      return transaction(async (client) => {
        const currentSubmission = await getSubmissionWith(client, id, { forUpdate: true });
        if (!currentSubmission) return null;
        if (!["DRAFT", "NEEDS_CHANGES"].includes(currentSubmission.status)) {
          throw createWorkflowStateError();
        }
        // Do not create a new revision for an identical retry. The expense
        // delivery idempotency key includes revision/updatedAt, so preserving
        // both prevents a retry after an ambiguous final-status failure from
        // sending the same email again.
        if (isDeepStrictEqual(currentSubmission.data, data ?? {})) return currentSubmission;
        const nextRevision = currentSubmission.revision + 1;
        await client.query(`
          UPDATE submissions
          SET data_json = $2::jsonb, revision_no = $3, updated_at = NOW()
          WHERE id = $1
        `, [id, serialized, nextRevision]);
        await client.query(`
          INSERT INTO revisions (
            id, submission_id, revision_no, data_json, event, created_by, created_at
          ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
        `, [randomUUID(), id, nextRevision, serialized, event, userId]);
        return getSubmissionWith(client, id);
      });
    },

    async setSubmissionStatus({
      id,
      status,
      userId,
      event,
      expectedStatuses = ["DRAFT", "NEEDS_CHANGES"]
    }) {
      return transaction(async (client) => {
        const submission = await getSubmissionWith(client, id, { forUpdate: true });
        if (!submission) return null;
        if (!expectedStatuses.includes(submission.status)) throw createWorkflowStateError();
        const nextRevision = submission.revision + 1;
        await client.query(`
          UPDATE submissions
          SET status = $2,
              revision_no = $3,
              updated_at = NOW(),
              submitted_at = CASE
                WHEN $2 = 'SUBMITTED' THEN COALESCE(submitted_at, NOW())
                ELSE submitted_at
              END,
              published_at = CASE
                WHEN $2 = 'PUBLISHED' THEN COALESCE(published_at, NOW())
                ELSE published_at
              END
          WHERE id = $1
        `, [id, status, nextRevision]);
        await client.query(`
          INSERT INTO revisions (
            id, submission_id, revision_no, data_json, event, created_by, created_at
          ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
        `, [randomUUID(), id, nextRevision, JSON.stringify(submission.data), event, userId]);
        return getSubmissionWith(client, id);
      });
    },

    async addReview({ submissionId, reviewerId, decision, comment, nextStatus }) {
      return transaction(async (client) => {
        const submission = await getSubmissionWith(client, submissionId, { forUpdate: true });
        if (!submission) return null;
        if (!["SUBMITTED", "UNDER_REVIEW"].includes(submission.status)) {
          throw createWorkflowStateError();
        }
        await client.query(`
          INSERT INTO reviews (
            id, submission_id, reviewer_id, decision, comment, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [randomUUID(), submissionId, reviewerId, decision, comment || null]);
        await client.query(`
          UPDATE submissions SET status = $2, updated_at = NOW() WHERE id = $1
        `, [submissionId, nextStatus]);
        return getSubmissionWith(client, submissionId);
      });
    },

    async listReviews(submissionId) {
      const result = await pool.query(`
        SELECT r.*, u.email AS reviewer_email, u.name AS reviewer_name
        FROM reviews AS r
        JOIN users AS u ON u.id = r.reviewer_id
        WHERE r.submission_id = $1
        ORDER BY r.created_at DESC
      `, [submissionId]);
      return result.rows.map((row) => ({
        id: row.id,
        decision: row.decision,
        comment: row.comment,
        reviewer: { id: row.reviewer_id, email: row.reviewer_email, name: row.reviewer_name },
        createdAt: timestamp(row.created_at)
      }));
    },

    async createAttachment(input) {
      const result = await pool.query(`
        INSERT INTO attachments (
          id, submission_id, uploader_id, storage_name, storage_status,
          blob_pathname, blob_url, original_name, mime_type, kind,
          size_bytes, sha256, created_at
        ) VALUES ($1, $2, $3, $4, 'ready', $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (blob_pathname) WHERE blob_pathname IS NOT NULL DO UPDATE
        SET blob_url = EXCLUDED.blob_url,
            mime_type = EXCLUDED.mime_type,
            size_bytes = EXCLUDED.size_bytes,
            sha256 = EXCLUDED.sha256,
            storage_updated_at = NOW()
        WHERE attachments.submission_id = EXCLUDED.submission_id
          AND attachments.uploader_id = EXCLUDED.uploader_id
          AND attachments.original_name = EXCLUDED.original_name
          AND attachments.storage_status = 'ready'
        RETURNING *
      `, [
        randomUUID(),
        input.submissionId,
        input.uploaderId,
        input.storageName ?? null,
        input.blobPathname ?? null,
        input.blobUrl ?? null,
        input.originalName,
        input.mimeType,
        input.kind === "primary" ? "primary" : "additional",
        input.size,
        input.sha256 ?? null
      ]);
      return mapAttachment(result.rows[0]);
    },

    async createPendingAttachment(input) {
      const result = await pool.query(`
        INSERT INTO attachments (
          id, submission_id, uploader_id, storage_name, storage_status,
          blob_pathname, blob_url, original_name, mime_type, kind,
          size_bytes, sha256, created_at
        ) VALUES ($1, $2, $3, NULL, 'pending', $4, NULL, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `, [
        input.id ?? randomUUID(),
        input.submissionId,
        input.uploaderId,
        input.blobPathname ?? null,
        input.originalName,
        input.mimeType,
        input.kind === "primary" ? "primary" : "additional",
        input.size ?? 0,
        input.sha256 ?? null
      ]);
      return mapAttachment(result.rows[0]);
    },

    async markAttachmentReady(id, { blobPathname, blobUrl, mimeType, size, sha256 = null }) {
      const result = await pool.query(`
        UPDATE attachments
        SET blob_pathname = $2,
            blob_url = $3,
            mime_type = $4,
            size_bytes = $5,
            sha256 = $6,
            storage_status = 'ready',
            storage_updated_at = NOW()
        WHERE id = $1
          AND (
            storage_status = 'pending'
            OR (
              storage_status = 'ready'
              AND blob_pathname = $2
              AND blob_url = $3
            )
          )
        RETURNING *
      `, [id, blobPathname, blobUrl, mimeType, size, sha256]);
      return mapAttachment(result.rows[0]);
    },

    async markAttachmentDeletePending(id) {
      const result = await pool.query(`
        UPDATE attachments
        SET storage_status = 'delete_pending', storage_updated_at = NOW()
        WHERE id = $1 AND storage_status = 'ready'
        RETURNING *
      `, [id]);
      return mapAttachment(result.rows[0]);
    },

    async getAttachment(id, { includePending = false } = {}) {
      const statusClause = includePending ? "" : " AND storage_status = 'ready'";
      const result = await pool.query(
        `SELECT * FROM attachments WHERE id = $1${statusClause}`,
        [id]
      );
      return mapAttachment(result.rows[0]);
    },

    async getAttachmentByBlobPathname(pathname, { includePending = false } = {}) {
      const statusClause = includePending ? "" : " AND storage_status = 'ready'";
      const result = await pool.query(
        `SELECT * FROM attachments WHERE blob_pathname = $1${statusClause}`,
        [pathname]
      );
      return mapAttachment(result.rows[0]);
    },

    async listAttachments(submissionId, { includePending = false } = {}) {
      const statusClause = includePending ? "" : " AND storage_status = 'ready'";
      const result = await pool.query(`
        SELECT * FROM attachments
        WHERE submission_id = $1${statusClause}
        ORDER BY created_at, id
      `, [submissionId]);
      return result.rows.map(mapAttachment);
    },

    async listPendingAttachmentsBefore(cutoff, limit = 100) {
      const result = await pool.query(`
        SELECT * FROM attachments
        WHERE storage_status = 'pending' AND created_at < $1
        ORDER BY created_at, id
        LIMIT $2
      `, [cutoff, boundedLimit(limit, 100, 500)]);
      return result.rows.map(mapAttachment);
    },

    async listDeletePendingAttachments(limit = 100) {
      const result = await pool.query(`
        SELECT * FROM attachments
        WHERE storage_status = 'delete_pending'
        ORDER BY created_at, id
        LIMIT $1
      `, [boundedLimit(limit, 100, 500)]);
      return result.rows.map(mapAttachment);
    },

    async deleteAttachment(id) {
      const result = await pool.query("DELETE FROM attachments WHERE id = $1 RETURNING *", [id]);
      return mapAttachment(result.rows[0]);
    },

    async audit({ user, action, targetType = null, targetId = null, metadata = {}, ipHash = null }) {
      await pool.query(`
        INSERT INTO audit_logs (
          user_id, email, action, target_type, target_id, metadata_json, ip_hash, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
      `, [
        user?.id ?? null,
        user?.email ?? null,
        action,
        targetType,
        targetId,
        JSON.stringify(metadata ?? {}),
        ipHash
      ]);
    },

    async hasExpenseDelivery(submissionId, deliveryKey) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT 1
          FROM audit_logs
          WHERE action = 'EXPENSE_NOTIFICATION_SENT'
            AND target_type = 'expense'
            AND target_id = $1
            AND metadata_json ->> 'deliveryKey' = $2
        ) AS delivered
      `, [submissionId, deliveryKey]);
      return result.rows[0]?.delivered === true;
    },

    async listAudit(limit = 200) {
      const result = await pool.query(`
        SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1
      `, [boundedLimit(limit, 200, 500)]);
      return result.rows.map((row) => ({
        id: safeInteger(row.id),
        userId: row.user_id,
        email: row.email,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        metadata: parseJson(row.metadata_json),
        ipHash: row.ip_hash,
        createdAt: timestamp(row.created_at)
      }));
    }
  };

  return database;
}
