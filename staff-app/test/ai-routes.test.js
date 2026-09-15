import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import OpenAI from "openai";
import { safeAiError } from "../src/ai.js";
import { aiFixture, original, corrected } from "./helpers/ai-fixture.mjs";

async function session(fixture) {
  const cookie = `${fixture.config.cookieName}=synthetic-session`;
  const response = await request(fixture.app).get("/api/staff/session").set("Cookie", cookie);
  return { cookie, csrf: response.body.csrfToken, available: response.body.aiAvailable };
}
const input = (field) => ({ text: original, field, mode: "fix_language", language: "et" });

test("all News and Kuluaruanne fields reach the real SDK through authenticated HTTP", async () => {
  const fixture = aiFixture();
  const auth = await session(fixture);
  for (const field of ["news.title", "news.summary", "news.content", "expense.activity", "expense.goal", "expense.result"]) {
    const response = await request(fixture.app).post("/api/staff/ai/improve").set("Cookie", auth.cookie)
      .set("X-CSRF-Token", auth.csrf).send(input(field));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { suggestion: corrected });
    assert.equal(fixture.state.calls.at(-1).input.field, field);
    assert.equal(fixture.state.calls.at(-1).model, "gpt-5-mini");
    assert.equal(fixture.state.calls.at(-1).store, false);
  }
  assert.equal(fixture.state.drafts.size, 0, "Correction does not save a draft");
  assert.equal(fixture.state.audits.length, 6);
});

test("authentication, CSRF, field permissions and request schema stop invalid AI requests", async () => {
  const fixture = aiFixture();
  const auth = await session(fixture);
  assert.equal((await request(fixture.app).post("/api/staff/ai/improve").send(input("news.title"))).status, 401);
  assert.equal((await request(fixture.app).post("/api/staff/ai/improve").set("Cookie", auth.cookie).send(input("news.title"))).status, 403);
  for (const [body, status] of [[input("invoice.description"), 403], [input("expense.unknown"), 400], [{ ...input("news.title"), text: "a".repeat(8001) }, 400]]) {
    assert.equal((await request(fixture.app).post("/api/staff/ai/improve").set("Cookie", auth.cookie).set("X-CSRF-Token", auth.csrf).send(body)).status, status);
  }
  assert.equal(fixture.state.calls.length, 0);
});

test("provider failures have safe actionable logs and never expose provider details", async () => {
  const fixture = aiFixture();
  const auth = await session(fixture);
  const logs = [];
  const previous = console.error;
  console.error = (...args) => logs.push(args);
  try {
    for (const behavior of ["authentication", "rate_limit", "invalid_request", "provider_error", "malformed", "empty", "incomplete"]) {
      fixture.state.behavior = behavior;
      const response = await request(fixture.app).post("/api/staff/ai/improve").set("Cookie", auth.cookie)
        .set("X-CSRF-Token", auth.csrf).send(input("expense.activity"));
      assert.equal(response.status, 502, behavior);
      assert.equal(logs.at(-1)[0], "AI correction failed:");
      assert.equal(logs.at(-1)[1].reason, ["malformed", "empty", "incomplete"].includes(behavior) ? "invalid_response" : behavior);
      assert.doesNotMatch(JSON.stringify([response.body, logs]), /PRIVATE_PROVIDER_DETAIL|synthetic-not-a-real-key|Meie üritus/);
    }
    assert.equal(logs.at(-1)[1].incompleteReason, "max_output_tokens");
  } finally { console.error = previous; }
});

test("missing key is explicit while ordinary news draft creation still works", async () => {
  const fixture = aiFixture({ missingKey: true });
  const auth = await session(fixture);
  assert.equal(auth.available, false);
  const response = await request(fixture.app).post("/api/staff/ai/improve").set("Cookie", auth.cookie)
    .set("X-CSRF-Token", auth.csrf).send(input("news.title"));
  assert.equal(response.status, 503);
  assert.equal(response.body.error, "AI_UNAVAILABLE");
  const draft = await request(fixture.app).post("/api/staff/submissions").set("Cookie", auth.cookie)
    .set("X-CSRF-Token", auth.csrf).send({ type: "news", data: { title: original } });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.item.data.title, original);
  assert.equal(fixture.state.calls.length, 0);
});

test("timeout, network and internal diagnostics discard arbitrary secrets", () => {
  assert.equal(safeAiError(new OpenAI.APIConnectionTimeoutError()).reason, "timeout");
  assert.equal(safeAiError(new OpenAI.APIConnectionError({ message: "PRIVATE_DETAIL" })).reason, "network");
  assert.deepEqual(safeAiError(Object.assign(new Error("PRIVATE_DETAIL"), { code: "PRIVATE_DETAIL", cause: "PRIVATE_DETAIL", request_id: "not-a-provider-id" })), { reason: "internal" });
});

test("the existing per-user AI limit rejects a thirteenth request before the provider", async () => {
  const fixture = aiFixture();
  const auth = await session(fixture);
  for (let index = 0; index < 13; index++) {
    const response = await request(fixture.app).post("/api/staff/ai/improve").set("Cookie", auth.cookie)
      .set("X-CSRF-Token", auth.csrf).send(input("news.title"));
    assert.equal(response.status, index < 12 ? 200 : 429);
    if (index === 12) assert.equal(response.body.error, "TOO_MANY_REQUESTS");
  }
  assert.equal(fixture.state.calls.length, 12);
});
