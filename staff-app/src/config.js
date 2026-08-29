import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
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

function csv(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function roleMap(value) {
  if (!value) return new Map();
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("STAFF_ROLE_MAP must be valid JSON.");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("STAFF_ROLE_MAP must be a JSON object keyed by email.");
  }
  const allowedRoles = new Set(["member", "editor", "finance", "admin"]);
  const mapped = new Map();
  for (const [email, role] of Object.entries(parsed)) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRole = String(role).trim().toLowerCase();
    if (!normalizedEmail.endsWith("@noortetugi.ee") || !allowedRoles.has(normalizedRole)) {
      throw new Error("STAFF_ROLE_MAP contains an invalid email or role.");
    }
    mapped.set(normalizedEmail, normalizedRole);
  }
  return mapped;
}

function requiredInProduction(name, value, production) {
  if (production && !value) {
    throw new Error(`${name} is required in production.`);
  }
  return value;
}

export function loadConfig(overrides = {}) {
  const environment = overrides.environment ?? process.env.NODE_ENV ?? "development";
  const production = environment === "production";
  const baseUrl = (overrides.baseUrl ?? process.env.STAFF_BASE_URL ?? "http://localhost:3100")
    .replace(/\/+$/, "");
  const databasePath = resolve(
    overrides.databasePath ?? process.env.STAFF_DATABASE_PATH ?? resolve(appRoot, "private/runtime/staff.sqlite")
  );
  const uploadsPath = resolve(
    overrides.uploadsPath ?? process.env.STAFF_UPLOADS_PATH ?? resolve(appRoot, "private/runtime/uploads")
  );

  const config = {
    appRoot,
    environment,
    production,
    port: integer(overrides.port ?? process.env.PORT, 3100, 1),
    trustProxy: integer(overrides.trustProxy ?? process.env.STAFF_TRUST_PROXY, production ? 1 : 0, 0),
    baseUrl,
    googleClientId: overrides.googleClientId ?? process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: overrides.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
    googleWorkspaceDomain: "noortetugi.ee",
    allowedEmails: new Set(overrides.allowedEmails ?? csv(process.env.STAFF_ALLOWED_EMAILS)),
    roleMap: overrides.roleMap instanceof Map ? overrides.roleMap : roleMap(process.env.STAFF_ROLE_MAP),
    defaultRole: overrides.defaultRole ?? process.env.STAFF_DEFAULT_ROLE ?? "member",
    cookieName: production ? "__Host-noortetugi_staff" : "noortetugi_staff",
    sessionTtlMs:
      overrides.sessionTtlMs ?? integer(process.env.STAFF_SESSION_TTL_HOURS, 12, 1) * 60 * 60 * 1000,
    oauthAttemptTtlMs: 10 * 60 * 1000,
    csrfSecret:
      overrides.csrfSecret ??
      process.env.STAFF_CSRF_SECRET ??
      (production ? "" : randomBytes(32).toString("base64url")),
    logHashSecret:
      overrides.logHashSecret ??
      process.env.STAFF_LOG_HASH_SECRET ??
      (production ? "" : randomBytes(32).toString("base64url")),
    databasePath,
    uploadsPath,
    maxUploadBytes: integer(overrides.maxUploadBytes ?? process.env.STAFF_MAX_UPLOAD_MB, 15, 1) * 1024 * 1024,
    openAiApiKey: overrides.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "",
    openAiModel: overrides.openAiModel ?? process.env.OPENAI_MODEL ?? "gpt-5-mini",
    publicSiteOrigin: (overrides.publicSiteOrigin ?? process.env.PUBLIC_SITE_ORIGIN ?? baseUrl).replace(/\/+$/, ""),
    enableDevAuth: boolean(overrides.enableDevAuth ?? process.env.STAFF_ENABLE_DEV_AUTH, false)
  };

  if (!["member", "editor", "finance", "admin"].includes(config.defaultRole)) {
    throw new Error("STAFF_DEFAULT_ROLE must be member, editor, finance, or admin.");
  }
  requiredInProduction("GOOGLE_CLIENT_ID", config.googleClientId, production);
  requiredInProduction("GOOGLE_CLIENT_SECRET", config.googleClientSecret, production);
  requiredInProduction("STAFF_CSRF_SECRET", config.csrfSecret, production);
  requiredInProduction("STAFF_LOG_HASH_SECRET", config.logHashSecret, production);
  if (config.enableDevAuth && production) {
    throw new Error("STAFF_ENABLE_DEV_AUTH cannot be enabled in production.");
  }

  mkdirSync(dirname(databasePath), { recursive: true });
  mkdirSync(uploadsPath, { recursive: true });
  return Object.freeze(config);
}
