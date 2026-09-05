import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { parseArguments, reconcileExpenseDelivery } from "../scripts/reconcile-expense-delivery.mjs";
import { loadMigrations } from "../scripts/db-migrate.mjs";
import { openDatabase } from "../src/database.js";

const submissionId = "60a25fad-becd-4942-b0f6-979f71bb9960";

function client({ acquired = true, submission, latest, failInsert = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired }] };
      if (sql.includes("SELECT id, type, status")) {
        return { rows: submission === null ? [] : [submission ?? { id: submissionId, type: "expense", status: "DRAFT" }] };
      }
      if (sql.includes("SELECT id, action")) {
        return { rows: latest === null ? [] : [latest ?? { id: "12", action: "EXPENSE_NOTIFICATION_STARTED", delivery_key: "4:test-timestamp" }] };
      }
      if (failInsert && sql.includes("INSERT INTO audit_logs")) throw new Error("synthetic write failure");
      return { rows: [] };
    }
  };
}

test("reconciliation arguments require UUID and outcome and default to dry-run", () => {
  assert.deepEqual(parseArguments(["--submission", submissionId, "--outcome", "sent"]), {
    submissionId, outcome: "sent", apply: false
  });
  assert.deepEqual(parseArguments(["--apply", "--outcome", "not-sent", "--submission", submissionId]), {
    submissionId, outcome: "not-sent", apply: true
  });
  for (const argv of [
    [], ["--submission", "invalid", "--outcome", "sent"],
    ["--submission", submissionId, "--outcome", "unknown"],
    ["--submission", submissionId, "--outcome", "sent", "--apply", "--apply"],
    ["--submission", submissionId, "--outcome", "sent", "--unexpected"],
    ["--submission", submissionId, "--outcome"]
  ]) assert.throws(() => parseArguments(argv), { code: "INVALID_RECONCILIATION_ARGUMENTS" });
});

test("dry-run acquires the submission lock and reads state without persisting changes or exposing metadata", async () => {
  const db = client();
  const result = await reconcileExpenseDelivery(db, { submissionId, outcome: "sent" });
  assert.deepEqual(result, { submissionId, state: "uncertain", outcome: "sent", applied: false });
  assert.match(db.calls[1].sql, /pg_try_advisory_xact_lock\(hashtext\('staff-submission-submit'\), hashtext\(\$1\)\)/);
  assert.deepEqual(db.calls[1].params, [submissionId]);
  assert.equal(db.calls.some(({ sql }) => sql.includes("INSERT")), false);
  assert.equal(db.calls.at(-1).sql, "ROLLBACK");
  assert.equal(JSON.stringify(result).includes("test-timestamp"), false);
});

test("apply records only the confirmed outcome with the existing delivery key", async (t) => {
  for (const [outcome, action, state] of [
    ["sent", "EXPENSE_NOTIFICATION_SENT", "sent"],
    ["not-sent", "EXPENSE_NOTIFICATION_REJECTED", "ready"]
  ]) {
    await t.test(outcome, async () => {
      const db = client();
      const result = await reconcileExpenseDelivery(db, { submissionId, outcome, apply: true });
      const writes = db.calls.filter(({ sql }) => sql.includes("INSERT INTO audit_logs"));
      assert.equal(writes.length, 1);
      assert.deepEqual(writes[0].params, [action, submissionId,
        JSON.stringify({ deliveryKey: "4:test-timestamp", reconciliation: true })]);
      assert.equal(db.calls.at(-1).sql, "COMMIT");
      assert.deepEqual(result, { submissionId, state, outcome, applied: true });
      assert.equal(db.calls.some(({ sql }) => /UPDATE submissions|DELETE FROM/.test(sql)), false);
    });
  }
});

test("reconciliation refuses busy, missing, finalized, unrelated, or already resolved submissions", async (t) => {
  for (const [name, fixture, code] of [
    ["busy", { acquired: false }, "SUBMISSION_IN_PROGRESS"],
    ["missing", { submission: null }, "SUBMISSION_NOT_FOUND"],
    ["finalized", { submission: { id: submissionId, type: "expense", status: "SUBMITTED" } }, "INVALID_WORKFLOW_STATE"],
    ["unrelated type", { submission: { id: submissionId, type: "invoice", status: "DRAFT" } }, "INVALID_WORKFLOW_STATE"],
    ["no marker", { latest: null }, "DELIVERY_NOT_UNCERTAIN"],
    ["sent", { latest: { action: "EXPENSE_NOTIFICATION_SENT" } }, "DELIVERY_NOT_UNCERTAIN"],
    ["rejected", { latest: { action: "EXPENSE_NOTIFICATION_REJECTED" } }, "DELIVERY_NOT_UNCERTAIN"],
    ["missing key", { latest: { action: "EXPENSE_NOTIFICATION_STARTED" } }, "DELIVERY_KEY_MISSING"]
  ]) {
    await t.test(name, async () => {
      const db = client(fixture);
      await assert.rejects(reconcileExpenseDelivery(db, { submissionId, outcome: "sent", apply: true }), { code });
      assert.equal(db.calls.some(({ sql }) => sql.includes("INSERT")), false);
      assert.equal(db.calls.at(-1).sql, "ROLLBACK");
    });
  }
});

test("failed reconciliation writes roll back rather than reporting success", async () => {
  const db = client({ failInsert: true });
  await assert.rejects(reconcileExpenseDelivery(db, { submissionId, outcome: "sent", apply: true }));
  assert.equal(db.calls.some(({ sql }) => sql === "COMMIT"), false);
  assert.equal(db.calls.at(-1).sql, "ROLLBACK");
});

test("PostgreSQL recovery ignores previous review cycles and updates the application's delivery state", async (t) => {
  const engine = new PGlite();
  t.after(() => engine.close());
  for (const migration of await loadMigrations()) await engine.exec(migration.sql);
  const connection = { query: (sql, params) => engine.query(sql, params), release() {} };
  const database = openDatabase(null, { pool: {
    query: connection.query, async connect() { return connection; }, async end() {}
  } });
  const user = await database.upsertUser({ googleSubject: "recovery-fixture",
    email: "fixture@example.test", name: "Recovery Fixture", role: "member" });
  const submission = await database.createSubmission({ type: "expense", creatorId: user.id, data: {} });
  await engine.query(`INSERT INTO audit_logs (action, target_type, target_id, metadata_json, created_at)
    VALUES ('EXPENSE_NOTIFICATION_STARTED', 'expense', $1, '{"deliveryKey":"old-cycle"}', '2000-01-01')`, [submission.id]);
  await engine.query(`INSERT INTO reviews (id, submission_id, reviewer_id, decision, created_at)
    VALUES ('synthetic-review', $1, $2, 'needs_changes', '2000-01-02')`, [submission.id, user.id]);
  await assert.rejects(reconcileExpenseDelivery(connection, {
    submissionId: submission.id, outcome: "sent", apply: true
  }), { code: "DELIVERY_NOT_UNCERTAIN" });
  await engine.query(`INSERT INTO audit_logs (action, target_type, target_id, metadata_json, created_at)
    VALUES ('EXPENSE_NOTIFICATION_STARTED', 'expense', $1, '{"deliveryKey":"current-cycle"}', '2000-01-03')`, [submission.id]);
  const initialCount = (await engine.query("SELECT count(*)::int AS count FROM audit_logs")).rows[0].count;
  await reconcileExpenseDelivery(connection, { submissionId: submission.id, outcome: "not-sent" });
  assert.equal((await engine.query("SELECT count(*)::int AS count FROM audit_logs")).rows[0].count, initialCount);
  assert.equal(await database.getExpenseDeliveryState(submission.id), "uncertain");
  await reconcileExpenseDelivery(connection, { submissionId: submission.id, outcome: "not-sent", apply: true });
  assert.equal(await database.getExpenseDeliveryState(submission.id), "ready");
  const marker = (await engine.query("SELECT metadata_json FROM audit_logs ORDER BY id DESC LIMIT 1")).rows[0];
  assert.deepEqual(marker.metadata_json, { deliveryKey: "current-cycle", reconciliation: true });
  assert.equal((await database.getSubmission(submission.id)).status, "DRAFT");
  await assert.rejects(reconcileExpenseDelivery(connection, {
    submissionId: submission.id, outcome: "sent", apply: true
  }), { code: "DELIVERY_NOT_UNCERTAIN" });
});
