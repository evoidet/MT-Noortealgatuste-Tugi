import assert from "node:assert/strict";
import test from "node:test";

import { __configTestUtils, loadConfig } from "../src/config.js";

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
    openAiApiKey: "",
    financeNotificationEmail: "finance@noortetugi.ee",
    smtpHost: "smtp.gmail.com",
    smtpUser: "staff@noortetugi.ee",
    smtpPassword: "test-google-app-password",
    mailFrom: "Noorte Tugi <staff@noortetugi.ee>",
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
  assert.equal(config.smtpPort, 465);
  assert.equal(config.smtpSecure, true);
  assert.equal(config.smtpRequireTls, false);
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
    ["blobReadWriteToken", "BLOB_READ_WRITE_TOKEN"],
    ["financeNotificationEmail", "FINANCE_NOTIFICATION_EMAIL"],
    ["smtpHost", "STAFF_SMTP_HOST"],
    ["smtpUser", "STAFF_SMTP_USER"],
    ["smtpPassword", "STAFF_SMTP_PASSWORD"],
    ["mailFrom", "STAFF_MAIL_FROM"]
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

test("canonical SMTP password takes precedence over the temporary legacy alias", () => {
  assert.equal(__configTestUtils.smtpPasswordValue(undefined, {
    STAFF_SMTP_PASSWORD: "canonical-test-password",
    STAFF_SMTP_PASS: "legacy-test-password"
  }), "canonical-test-password");
});

test("temporary STAFF_SMTP_PASS fallback works only when the canonical password is absent", () => {
  assert.equal(__configTestUtils.smtpPasswordValue(undefined, {
    STAFF_SMTP_PASS: "legacy-test-password"
  }), "legacy-test-password");
});

test("SMTP port and TLS booleans preserve explicit direct-TLS and STARTTLS values", () => {
  for (const smtp of [
    { smtpPort: "465", smtpSecure: "true", smtpRequireTls: "false", expected: [465, true, false] },
    { smtpPort: "587", smtpSecure: "false", smtpRequireTls: "true", expected: [587, false, true] }
  ]) {
    const config = loadConfig(productionOverrides(smtp));
    assert.deepEqual(
      [config.smtpPort, config.smtpSecure, config.smtpRequireTls],
      smtp.expected
    );
  }
});

test("invalid SMTP booleans and missing credentials fail with safe exact variable names", () => {
  assert.throws(
    () => loadConfig(productionOverrides({ smtpSecure: "sometimes" })),
    /STAFF_SMTP_SECURE must be a boolean value/
  );
  assert.throws(
    () => loadConfig(productionOverrides({ smtpPassword: "" })),
    /STAFF_SMTP_PASSWORD is required in production/
  );
  assert.throws(
    () => loadConfig(productionOverrides({ smtpUser: "" })),
    /STAFF_SMTP_USER is required in production/
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
