import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/database.js";

test("an identical draft save preserves revision and delivery-key timestamps", async () => {
  const queries = [];
  const row = {
    id: "submission-1",
    type: "expense",
    creator_id: "user-1",
    creator_email: "mari@noortetugi.ee",
    creator_name: "Mari Maasikas",
    status: "DRAFT",
    data_json: { project: "Noorte arengupäev", amount: 12.35 },
    created_at: "2026-08-29T09:00:00.000Z",
    updated_at: "2026-08-29T10:00:00.000Z",
    submitted_at: null,
    published_at: null,
    revision_no: 4,
  };
  const client = {
    async query(sql) {
      queries.push(String(sql));
      if (String(sql).includes("SELECT s.*")) return { rows: [row] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
    async end() {},
  };
  const database = openDatabase(null, { pool });

  const result = await database.updateSubmission({
    id: row.id,
    userId: row.creator_id,
    data: { project: "Noorte arengupäev", amount: 12.35 },
  });

  assert.equal(result.revision, 4);
  assert.equal(result.updatedAt, "2026-08-29T10:00:00.000Z");
  assert.equal(queries.some((sql) => sql.includes("UPDATE submissions")), false);
  assert.equal(queries.some((sql) => sql.includes("INSERT INTO revisions")), false);
  assert.match(queries[0], /BEGIN/);
  assert.match(queries.at(-1), /COMMIT/);
});

test("submission lock uses a pinned transaction and dedicated capacity; overlap is rejected", async () => {
  const locked = new Set();
  const lockQueries = [];
  let workQueries = 0;
  const pool = { async query() { workQueries++; return { rows: [] }; }, async end() {} };
  const lockPool = {
    async connect() {
      let held;
      return {
        async query(sql, params) {
          lockQueries.push(sql);
          if (sql.includes("pg_try_advisory_xact_lock")) {
            if (locked.has(params[0])) return { rows: [{ acquired: false }] };
            held = params[0]; locked.add(held);
            return { rows: [{ acquired: true }] };
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") locked.delete(held);
          return { rows: [] };
        },
        release() {}
      };
    },
    async end() {}
  };
  const database = openDatabase(null, { pool, lockPool });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let finish;
  const barrier = new Promise((resolve) => { finish = resolve; });
  const first = database.withSubmissionLock("same", async () => {
    await database.withSubmissionLock("same", async () => pool.query("synthetic work"));
    entered();
    await barrier;
  });
  await started;
  await assert.rejects(database.withSubmissionLock("same", async () => {}), { code: "SUBMISSION_IN_PROGRESS" });
  await Promise.all(Array.from({ length: 8 }, (_, index) => database.withSubmissionLock(`other-${index}`,
    async () => pool.query("synthetic work"))));
  assert.equal(workQueries, 9);
  finish();
  await first;
  assert.equal(locked.size, 0);
  assert.equal(lockQueries.filter((sql) => sql.includes("pg_try_advisory_xact_lock")).length, 10);
  assert.equal(lockQueries.some((sql) => sql.includes("pg_advisory_unlock")), false);
});
