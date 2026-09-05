import assert from "node:assert/strict";
import test from "node:test";
import { safeOperationalError } from "../src/safe-errors.js";

test("PostgreSQL undefined column diagnostic includes actionable safe identifiers", () => {
  assert.deepEqual(safeOperationalError({ name: "error", code: "42703",
    message: 'column "published_at" of relation "submissions" does not exist',
    table: "submissions", column: "published_at", constraint: "submissions_status_check",
    detail: "private document", query: "private statement", parameters: ["fake-secret"] }), {
    name: "error", code: "42703", table: "submissions", column: "published_at",
    constraint: "submissions_status_check",
    message: 'column "published_at" of relation "submissions" does not exist'
  });
});

test("database data errors and SMTP messages never echo arbitrary values", () => {
  for (const code of ["22P02", "23505", "XX000", "EAUTH", "TEST_ERROR"]) {
    const safe = safeOperationalError({ code, name: "Error", message: "fake-secret document text",
      detail: "fake-secret", response: "fake-secret", cause: { password: "fake-secret" } });
    assert.equal(JSON.stringify(safe).includes("fake-secret"), false);
    if (code === "EAUTH") assert.equal(safe.message, undefined);
  }
});
