// Real application, migrations, repository, session and storage validation.
// Only external Google/Blob/AI services and multi-connection advisory locks
// are replaced. No live environment or production data is used.
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { createStaffApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { openDatabase } from "../../src/database.js";
import { createAiAssistant } from "../../src/ai.js";
import { createClientUploadGrant, verifyClientUploadedFile, openPrivateAttachment } from "../../src/storage.js";
import { loadMigrations } from "../../scripts/db-migrate.mjs";

export async function newsWorkflowFixture() {
  const engine = new PGlite();
  for (const migration of await loadMigrations()) await engine.exec(migration.sql);
  // PGlite has a single connection. Serialize repository transactions just as
  // a checked-out pg client would, while keeping all real SQL intact.
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    return release;
  }
  const pool = {
    async query(sql, values) {
      const release = await acquire();
      try { return await engine.query(sql, values); } finally { release(); }
    },
    async connect() {
      const release = await acquire();
      return { query: (sql, values) => engine.query(sql, values), release };
    },
    async end() {}
  };
  const database = openDatabase(null, { pool });
  const locks = new Set();
  database.withSubmissionLock = async (id, work) => {
    if (locks.has(id)) throw Object.assign(new Error("Busy"), { code: "SUBMISSION_IN_PROGRESS", status: 409 });
    locks.add(id);
    try { return await work(); } finally { locks.delete(id); }
  };
  const reader = openDatabase(null, { pool });
  const config = loadConfig({ environment: "test", appUrl: "http://localhost:3100",
    googleCallbackUrl: "http://localhost:3100/api/staff/auth/google/callback",
    sessionSecret: "synthetic-news-workflow-only".repeat(2), storageDatabaseUrl: "postgresql://unused.invalid/test",
    blobReadWriteToken: "synthetic-blob-token", allowedGoogleDomain: "noortetugi.ee",
    allowedStaffEmails: [], adminEmails: ["reviewer@noortetugi.ee"], googleClientId: "", googleClientSecret: "",
    openAiApiKey: "", openAiModel: "gpt-5-mini", smtpHost: "", smtpUser: "", smtpPassword: "", mailFrom: "",
    googleDriveArchiveEnabled: false, enableDevAuth: false });
  const users = {};
  for (const role of ["writer", "reviewer"]) {
    users[role] = await database.upsertUser({ googleSubject: `workflow-${role}`, email: `${role}@noortetugi.ee`,
      name: `Workflow ${role}`, role: role === "reviewer" ? "admin" : "member" });
    await database.createSession({ tokenHash: createHash("sha256").update(`synthetic-${role}`).digest("base64url"),
      userId: users[role].id, expiresAt: new Date(Date.now() + 3600000).toISOString(), userAgentHash: null, ipHash: null });
  }
  const state = { origin: "http://localhost:3100", blobs: new Map(), aiMode: "missing", aiCalls: 0,
    failFinalization: false, failCreateResponse: false, failSubmitResponse: false };
  const blobClient = {
    async issueSignedToken() { return "synthetic-signed-grant"; },
    async presignUrl(_token, options) {
      assert.equal(options.access, "private");
      assert.equal(options.allowOverwrite, false);
      return { presignedUrl: `${state.origin}/__test/blob/${encodeURIComponent(options.pathname)}` };
    },
    async get(pathname) {
      const buffer = state.blobs.get(pathname);
      return buffer ? { statusCode: 200, stream: new Blob([buffer]).stream(), blob: {
        pathname, size: buffer.length, url: `https://synthetic.private.blob.vercel-storage.com/${pathname}`
      } } : null;
    },
    async del(pathname) { state.blobs.delete(pathname); }
  };
  const ai = createAiAssistant(config, { client: { responses: { async create(input) {
    state.aiCalls++;
    if (state.aiMode === "error") throw Object.assign(new Error("Synthetic provider failure"), { status: 503 });
    return { status: "completed", output_text: JSON.parse(input.input).text.replace("palju noored", "palju noori") };
  } } } });
  const missingAi = createAiAssistant(config);
  const setStatus = database.setSubmissionStatus.bind(database);
  database.setSubmissionStatus = async (input) => {
    if (state.failFinalization) {
      state.failFinalization = false;
      throw Object.assign(new Error("Synthetic finalization failure"), { code: "TEST_DATABASE_ERROR" });
    }
    return setStatus(input);
  };
  function makeApp() {
    return createStaffApp({ config, database,
      aiAssistant: { get available() { return state.aiMode !== "missing"; },
        improve(input) { return (state.aiMode === "missing" ? missingAi : ai).improve(input); } },
      clientUploadGrantCreator: (input) => createClientUploadGrant({ ...input, blobClient }),
      clientUploadedFileVerifier: (input) => verifyClientUploadedFile({ ...input, blobClient }),
      privateAttachmentOpener: (input) => openPrivateAttachment({ ...input, blobClient }),
      mailService: { async sendExpenseSubmitted() { assert.fail("News must not send finance email"); } },
      driveArchiveService: { enabled: false }
    }).app;
  }
  return { app: makeApp(), makeApp, database, reader, engine, config, users, state,
    close: () => engine.close() };
}
