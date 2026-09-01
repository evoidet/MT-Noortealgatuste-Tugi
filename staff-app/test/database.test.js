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
