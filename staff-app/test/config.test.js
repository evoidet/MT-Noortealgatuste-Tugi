import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

function productionOverrides(overrides = {}) {
  return {
    environment: "production",
    appUrl: "https://www.noortetugi.ee",
    googleCallbackUrl: "https://www.noortetugi.ee/api/staff/auth/google/callback",
    storageDatabaseUrl: "postgresql://example.invalid/noortetugi",
    googleClientId: "test-client-id",
    googleClientSecret: "test-client-secret",
    sessionSecret: "test-session-secret-with-sufficient-entropy",
    blobReadWriteToken: "test-blob-token",
    financeNotificationEmail: "finance@noortetugi.ee",
    ...overrides
  };
}

test("production config uses the Vercel URLs, persistent services, and secure cookie defaults", () => {
  const config = loadConfig(productionOverrides({
    allowedStaffEmails: ["MEMBER@NOORTETUGI.EE"],
    adminEmails: new Set(["ADMIN@NOORTETUGI.EE"])
  }));

  assert.equal(config.appUrl, "https://www.noortetugi.ee");
  assert.equal(config.baseUrl, config.appUrl);
  assert.equal(config.googleCallbackUrl, "https://www.noortetugi.ee/api/staff/auth/google/callback");
  assert.equal(config.storageDatabaseUrl, "postgresql://example.invalid/noortetugi");
  assert.equal(config.blobReadWriteToken, "test-blob-token");
  assert.equal(config.trustProxy, 1);
  assert.equal(config.cookieName, "__Host-noortetugi_staff");
  assert.equal(config.allowedGoogleDomain, "noortetugi.ee");
  assert.deepEqual([...config.allowedStaffEmails], ["member@noortetugi.ee"]);
  assert.deepEqual([...config.adminEmails], ["admin@noortetugi.ee"]);
  assert.equal(config.defaultRole, "member");
  assert.notEqual(config.csrfSecret, config.sessionSecret);
  assert.notEqual(config.logHashSecret, config.sessionSecret);
  assert.equal("databasePath" in config, false);
  assert.equal("uploadsPath" in config, false);
});

test("production config requires each deployment secret and canonical URL", () => {
  for (const [property, expectedName] of [
    ["appUrl", "APP_URL"],
    ["googleCallbackUrl", "GOOGLE_CALLBACK_URL"],
    ["storageDatabaseUrl", "STORAGE_DATABASE_URL"],
    ["googleClientId", "GOOGLE_CLIENT_ID"],
    ["googleClientSecret", "GOOGLE_CLIENT_SECRET"],
    ["sessionSecret", "SESSION_SECRET"],
    ["blobReadWriteToken", "BLOB_READ_WRITE_TOKEN"]
  ]) {
    assert.throws(
      () => loadConfig(productionOverrides({ [property]: "" })),
      new RegExp(expectedName)
    );
  }
  assert.throws(
    () => loadConfig(productionOverrides({ sessionSecret: "too-short" })),
    /at least 32 bytes/
  );
});

test("email lists accept only exact addresses in the configured Google domain", () => {
  assert.throws(
    () => loadConfig(productionOverrides({
      allowedStaffEmails: ["person@evilnoortetugi.ee"]
    })),
    /ALLOWED_STAFF_EMAILS/
  );
  assert.throws(
    () => loadConfig(productionOverrides({
      adminEmails: ["admin@gmail.com"]
    })),
    /ADMIN_EMAILS/
  );
});

test("production callback must stay on APP_URL and use the exact staff callback path", () => {
  assert.throws(
    () => loadConfig(productionOverrides({
      googleCallbackUrl: "https://staff.example.com/api/staff/auth/google/callback"
    })),
    /same origin/
  );
  assert.throws(
    () => loadConfig(productionOverrides({
      googleCallbackUrl: "https://www.noortetugi.ee/api/staff/auth/google/callback/extra"
    })),
    /must end exactly/
  );
});
