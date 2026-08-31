import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createStaffApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function testConfig() {
  return loadConfig({
    environment: "test",
    appUrl: "http://localhost:3100",
    googleCallbackUrl: "http://localhost:3100/api/staff/auth/google/callback",
    storageDatabaseUrl: "postgresql://unused.invalid/test",
    blobReadWriteToken: "unit-test-token",
    sessionSecret: "s".repeat(48),
    allowedGoogleDomain: "noortetugi.ee",
    allowedStaffEmails: [],
    adminEmails: [],
    googleClientId: "",
    googleClientSecret: "",
    openAiApiKey: "",
    smtpHost: "",
    smtpUser: "",
    smtpPassword: "",
    mailFrom: "",
    enableDevAuth: false
  });
}

function testDatabase() {
  return {
    async getSession() { return null; },
    async healthCheck() { return true; }
  };
}

const mailService = Object.freeze({
  available: false,
  async sendExpenseSubmitted() {}
});

test("public staff health checks Postgres without requiring a session", async () => {
  const { app } = createStaffApp({ config: testConfig(), database: testDatabase(), mailService });
  const response = await request(app).get("/api/staff/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, database: "ok" });
});

test("staff data routes require authentication and admin UI remains available", async () => {
  const { app } = createStaffApp({ config: testConfig(), database: testDatabase(), mailService });
  const denied = await request(app).get("/api/staff/submissions");
  assert.equal(denied.status, 401);
  assert.deepEqual(denied.body, { error: "AUTHENTICATION_REQUIRED" });

  const canonical = await request(app).get("/admin");
  assert.equal(canonical.status, 301);
  assert.equal(canonical.headers.location, "/admin/");

  const admin = await request(app).get("/admin/");
  assert.equal(admin.status, 200);
  assert.match(admin.headers["content-type"], /^text\/html/);
  assert.match(admin.text, /id="staffApp"/);
});
