import { createHmac, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function integer(value, fallback, minimum = 0) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function boolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function entries(value) {
  if (value instanceof Set || Array.isArray(value)) return [...value];
  return String(value ?? "").split(",");
}

function normalizeDomain(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/^@/, "");
  const valid = normalized.length <= 253 &&
    normalized.split(".").every((label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    );
  if (!valid) throw new Error("ALLOWED_GOOGLE_DOMAIN must be a valid domain name.");
  return normalized;
}

function emailHasExactDomain(email, domain) {
  const separator = email.lastIndexOf("@");
  return separator > 0 &&
    email.indexOf("@") === separator &&
    email.slice(separator + 1) === domain;
}

function emailSet(value, name, domain) {
  const normalized = entries(value)
    .map((entry) => String(entry).trim().toLowerCase())
    .filter(Boolean);
  for (const email of normalized) {
    if (!emailHasExactDomain(email, domain)) {
      throw new Error(`${name} must contain only exact @${domain} email addresses.`);
    }
  }
  return new Set(normalized);
}

function workspaceEmail(value, name, domain) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!emailHasExactDomain(normalized, domain)) {
    throw new Error(`${name} must be an @${domain} email address.`);
  }
  return normalized;
}

function requiredInProduction(name, value, production) {
  if (production && !value) {
    throw new Error(`${name} is required in production.`);
  }
  return value;
}

function absoluteHttpUrl(value, name, production) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${name} must be an absolute HTTP(S) URL without credentials.`);
  }
  if (production && parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production.`);
  }
  return parsed;
}

function canonicalAppUrl(value, production) {
  const parsed = absoluteHttpUrl(value, "APP_URL", production);
  if (parsed.search || parsed.hash) {
    throw new Error("APP_URL must not contain a query string or fragment.");
  }
  return parsed.href.replace(/\/+$/, "");
}

function canonicalCallbackUrl(value, appUrl, production) {
  const parsed = absoluteHttpUrl(value, "GOOGLE_CALLBACK_URL", production);
  if (parsed.pathname !== "/api/staff/auth/google/callback" || parsed.search || parsed.hash) {
    throw new Error("GOOGLE_CALLBACK_URL must end exactly with /api/staff/auth/google/callback.");
  }
  if (production && parsed.origin !== new URL(appUrl).origin) {
    throw new Error("GOOGLE_CALLBACK_URL must use the same origin as APP_URL in production.");
  }
  return parsed.href;
}

function deriveSecret(secret, purpose) {
  return createHmac("sha256", secret)
    .update(`noortetugi-staff:${purpose}:v1`)
    .digest("base64url");
}

export function loadConfig(overrides = {}) {
  const environment = overrides.environment ?? process.env.NODE_ENV ?? "development";
  const production = environment === "production";
  const configuredAppUrl = overrides.appUrl ?? overrides.baseUrl ?? process.env.APP_URL ?? "";
  const appUrl = canonicalAppUrl(
    requiredInProduction("APP_URL", configuredAppUrl, production) || "http://localhost:3100",
    production
  );
  const configuredCallbackUrl = overrides.googleCallbackUrl ?? process.env.GOOGLE_CALLBACK_URL ?? "";
  const googleCallbackUrl = canonicalCallbackUrl(
    requiredInProduction("GOOGLE_CALLBACK_URL", configuredCallbackUrl, production) ||
      `${appUrl}/api/staff/auth/google/callback`,
    appUrl,
    production
  );
  const allowedGoogleDomain = normalizeDomain(
    (overrides.allowedGoogleDomain ?? overrides.googleWorkspaceDomain ??
      process.env.ALLOWED_GOOGLE_DOMAIN) || "noortetugi.ee"
  );
  const allowedStaffEmails = emailSet(
    overrides.allowedStaffEmails ?? overrides.allowedEmails ??
      process.env.ALLOWED_STAFF_EMAILS ?? process.env.STAFF_ALLOWED_EMAILS,
    "ALLOWED_STAFF_EMAILS",
    allowedGoogleDomain
  );
  const adminEmails = emailSet(
    overrides.adminEmails ?? process.env.ADMIN_EMAILS,
    "ADMIN_EMAILS",
    allowedGoogleDomain
  );
  const sessionSecret = overrides.sessionSecret ?? process.env.SESSION_SECRET ??
    (production ? "" : randomBytes(32).toString("base64url"));
  const storageDatabaseUrl = overrides.storageDatabaseUrl ?? process.env.STORAGE_DATABASE_URL ?? "";
  const blobReadWriteToken = overrides.blobReadWriteToken ?? process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const googleClientId = overrides.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? "";
  const googleClientSecret = overrides.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  const smtpUser = overrides.smtpUser ?? process.env.STAFF_SMTP_USER ?? "";
  const smtpPassword = overrides.smtpPassword ?? process.env.STAFF_SMTP_PASSWORD ?? "";
  const maxUploadBytes = overrides.maxUploadBytes ??
    integer(process.env.STAFF_MAX_UPLOAD_MB, 15, 1) * 1024 * 1024;

  requiredInProduction("STORAGE_DATABASE_URL", storageDatabaseUrl, production);
  requiredInProduction("GOOGLE_CLIENT_ID", googleClientId, production);
  requiredInProduction("GOOGLE_CLIENT_SECRET", googleClientSecret, production);
  requiredInProduction("SESSION_SECRET", sessionSecret, production);
  requiredInProduction("BLOB_READ_WRITE_TOKEN", blobReadWriteToken, production);
  if (production && Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes in production.");
  }

  const financeNotificationEmail = workspaceEmail(
    overrides.financeNotificationEmail ?? process.env.FINANCE_NOTIFICATION_EMAIL ?? "egor@noortetugi.ee",
    "FINANCE_NOTIFICATION_EMAIL",
    allowedGoogleDomain
  );

  const config = {
    appRoot,
    environment,
    production,
    port: integer(overrides.port ?? process.env.PORT, 3100, 1),
    trustProxy: integer(overrides.trustProxy ?? process.env.STAFF_TRUST_PROXY, production ? 1 : 0, 0),
    appUrl,
    baseUrl: appUrl,
    storageDatabaseUrl,
    blobReadWriteToken,
    googleClientId,
    googleClientSecret,
    googleCallbackUrl,
    allowedGoogleDomain,
    googleWorkspaceDomain: allowedGoogleDomain,
    allowedStaffEmails,
    allowedEmails: allowedStaffEmails,
    adminEmails,
    defaultRole: "member",
    cookieName: production ? "__Host-noortetugi_staff" : "noortetugi_staff",
    oauthCookieName: production ? "__Host-noortetugi_oauth" : "noortetugi_oauth",
    sessionSecret,
    sessionTtlMs:
      overrides.sessionTtlMs ?? integer(process.env.STAFF_SESSION_TTL_HOURS, 12, 1) * 60 * 60 * 1000,
    oauthAttemptTtlMs: overrides.oauthAttemptTtlMs ?? 10 * 60 * 1000,
    csrfSecret: overrides.csrfSecret ?? deriveSecret(sessionSecret, "csrf"),
    logHashSecret: overrides.logHashSecret ?? deriveSecret(sessionSecret, "log-hash"),
    maxUploadBytes,
    serverUploadMaxBytes: overrides.serverUploadMaxBytes ??
      Math.min(maxUploadBytes, production ? 4 * 1024 * 1024 : maxUploadBytes),
    openAiApiKey: overrides.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "",
    openAiModel: overrides.openAiModel ?? process.env.OPENAI_MODEL ?? "gpt-5-mini",
    publicSiteOrigin: canonicalAppUrl(
      overrides.publicSiteOrigin ?? process.env.PUBLIC_SITE_ORIGIN ?? appUrl,
      production
    ),
    enableDevAuth: boolean(overrides.enableDevAuth ?? process.env.STAFF_ENABLE_DEV_AUTH, false),
    financeNotificationEmail,
    // Invoice creation follows the already configured Egor/finance identity.
    // Keeping one source of truth avoids a second identity environment variable.
    invoiceCreatorEmail: financeNotificationEmail,
    smtpHost: overrides.smtpHost ?? process.env.STAFF_SMTP_HOST ?? "",
    smtpPort: integer(overrides.smtpPort ?? process.env.STAFF_SMTP_PORT, 587, 1),
    smtpSecure: boolean(overrides.smtpSecure ?? process.env.STAFF_SMTP_SECURE, false),
    smtpRequireTls: boolean(overrides.smtpRequireTls ?? process.env.STAFF_SMTP_REQUIRE_TLS, true),
    smtpUser,
    smtpPassword,
    mailFrom: overrides.mailFrom ?? process.env.STAFF_MAIL_FROM ?? smtpUser,
    mailConnectionTimeoutMs: integer(
      overrides.mailConnectionTimeoutMs ?? process.env.STAFF_MAIL_CONNECTION_TIMEOUT_MS,
      10_000,
      1_000
    )
  };

  if (config.enableDevAuth && production) {
    throw new Error("STAFF_ENABLE_DEV_AUTH cannot be enabled in production.");
  }
  if (Boolean(config.smtpUser) !== Boolean(config.smtpPassword)) {
    throw new Error("STAFF_SMTP_USER and STAFF_SMTP_PASSWORD must be configured together.");
  }

  return Object.freeze(config);
}
