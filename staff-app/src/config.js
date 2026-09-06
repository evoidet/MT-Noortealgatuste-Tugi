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

function strictBoolean(value, fallback, name) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be a boolean value (true/false or 1/0).`);
}

function strictInteger(value, fallback, minimum, maximum, name) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be a whole number.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
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
      throw new Error(`${name} must contain only email addresses in ALLOWED_GOOGLE_DOMAIN.`);
    }
  }
  return new Set(normalized);
}

function workspaceEmail(value, name, domain) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/i.test(normalized) ||
      !emailHasExactDomain(normalized, domain)) {
    throw new Error(`${name} must be a valid email address in ALLOWED_GOOGLE_DOMAIN.`);
  }
  return normalized;
}

function driveFolderId(value, name) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(normalized)) {
    throw new Error(`${name} must contain a valid Google Drive folder ID.`);
  }
  return normalized;
}

function driveUserFolderMap(value, domain) {
  if (value === undefined || value === null || value === "") return new Map();
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("GOOGLE_DRIVE_USER_FOLDER_MAP must be valid JSON.");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("GOOGLE_DRIVE_USER_FOLDER_MAP must be a JSON object.");
  }
  const result = new Map();
  const folderOwners = new Set();
  for (const [emailValue, folderValue] of Object.entries(parsed)) {
    const email = workspaceEmail(emailValue, "GOOGLE_DRIVE_USER_FOLDER_MAP", domain);
    if (result.has(email)) {
      throw new Error("GOOGLE_DRIVE_USER_FOLDER_MAP contains a duplicate staff email.");
    }
    const folderId = driveFolderId(folderValue, "GOOGLE_DRIVE_USER_FOLDER_MAP");
    if (folderOwners.has(folderId)) {
      throw new Error("GOOGLE_DRIVE_USER_FOLDER_MAP must assign a different folder to each staff email.");
    }
    folderOwners.add(folderId);
    result.set(email, folderId);
  }
  return result;
}

function reimbursementRecipientMap(value, domain) {
  if (value === undefined || value === null || value === "") return new Map();
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("REIMBURSEMENT_RECIPIENTS must be valid JSON.");
    }
  }
  const entries = Array.isArray(parsed)
    ? parsed.map((entry) => [entry?.email, entry?.name])
    : parsed && typeof parsed === "object"
      ? Object.entries(parsed)
      : null;
  if (!entries) {
    throw new Error("REIMBURSEMENT_RECIPIENTS must be a JSON array or object.");
  }
  const result = new Map();
  for (const [emailValue, nameValue] of entries) {
    const email = workspaceEmail(emailValue, "REIMBURSEMENT_RECIPIENTS", domain);
    const name = String(nameValue ?? "")
      .normalize("NFC")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();
    if (!name || name.length > 160) {
      throw new Error("REIMBURSEMENT_RECIPIENTS names must contain between 1 and 160 characters.");
    }
    if (result.has(email)) {
      throw new Error("REIMBURSEMENT_RECIPIENTS contains a duplicate staff email.");
    }
    result.set(email, name);
  }
  return result;
}

function mailbox(value, name) {
  const normalized = String(value ?? "").trim();
  const angleAddress = /^(?:[^<>\r\n]+\s*)?<([^<>\s]+)>$/.exec(normalized);
  const address = (angleAddress?.[1] || normalized).toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(address)) {
    throw new Error(`${name} must contain a valid email address.`);
  }
  return normalized;
}

function smtpHostname(value, production) {
  const normalized = String(value ?? "").trim();
  requiredInProduction("STAFF_SMTP_HOST", normalized, production);
  if (normalized && (/\s|:\/\//.test(normalized) || normalized.length > 253)) {
    throw new Error("STAFF_SMTP_HOST must be a hostname without a URL scheme or port.");
  }
  return normalized;
}

function requiredInProduction(name, value, production) {
  if (production && !value) {
    throw new Error(`${name} is required in production.`);
  }
  return value;
}

function smtpPasswordValue(override, environment = process.env) {
  return String(
    override ??
    environment.STAFF_SMTP_PASSWORD ??
    environment.STAFF_SMTP_PASS ??
    ""
  );
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

function canonicalAppUrl(value, production, name = "APP_URL") {
  const parsed = absoluteHttpUrl(value, name, production);
  if (parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain a query string or fragment.`);
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
  const smtpUser = String(overrides.smtpUser ?? process.env.STAFF_SMTP_USER ?? "").trim();
  const smtpPassword = smtpPasswordValue(overrides.smtpPassword);
  const maxUploadBytes = overrides.maxUploadBytes ??
    strictInteger(process.env.STAFF_MAX_UPLOAD_MB, 15, 1, 1_024, "STAFF_MAX_UPLOAD_MB") * 1024 * 1024;
  const openAiModel = String(overrides.openAiModel ?? process.env.OPENAI_MODEL ?? "gpt-5-mini").trim();
  if (!openAiModel || /\s/.test(openAiModel)) {
    throw new Error("OPENAI_MODEL must be a nonempty model identifier without whitespace.");
  }

  requiredInProduction("STORAGE_DATABASE_URL", storageDatabaseUrl, production);
  requiredInProduction("GOOGLE_CLIENT_ID", googleClientId, production);
  requiredInProduction("GOOGLE_CLIENT_SECRET", googleClientSecret, production);
  requiredInProduction("SESSION_SECRET", sessionSecret, production);
  requiredInProduction("BLOB_READ_WRITE_TOKEN", blobReadWriteToken, production);
  if (production && Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes in production.");
  }

  const configuredFinanceEmail = overrides.financeNotificationEmail ?? process.env.FINANCE_NOTIFICATION_EMAIL ?? "";
  const financeNotificationEmail = workspaceEmail(
    requiredInProduction("FINANCE_NOTIFICATION_EMAIL", configuredFinanceEmail, production) || "egor@noortetugi.ee",
    "FINANCE_NOTIFICATION_EMAIL",
    allowedGoogleDomain
  );
  const smtpHost = smtpHostname(overrides.smtpHost ?? process.env.STAFF_SMTP_HOST, production);
  const configuredMailFrom = overrides.mailFrom ?? process.env.STAFF_MAIL_FROM ?? "";
  const mailFromValue = requiredInProduction("STAFF_MAIL_FROM", configuredMailFrom, production) ||
    (!production ? smtpUser : "");
  const mailFrom = mailFromValue ? mailbox(mailFromValue, "STAFF_MAIL_FROM") : "";
  const smtpPort = strictInteger(
    overrides.smtpPort ?? process.env.STAFF_SMTP_PORT,
    smtpHost.toLowerCase() === "smtp.gmail.com" ? 465 : 587,
    1,
    65_535,
    "STAFF_SMTP_PORT"
  );
  const smtpSecure = strictBoolean(
    overrides.smtpSecure ?? process.env.STAFF_SMTP_SECURE,
    smtpPort === 465,
    "STAFF_SMTP_SECURE"
  );
  const smtpRequireTls = strictBoolean(
    overrides.smtpRequireTls ?? process.env.STAFF_SMTP_REQUIRE_TLS,
    !smtpSecure,
    "STAFF_SMTP_REQUIRE_TLS"
  );

  const googleDriveArchiveEnabled = strictBoolean(
    overrides.googleDriveArchiveEnabled ?? process.env.GOOGLE_DRIVE_ARCHIVE_ENABLED,
    false,
    "GOOGLE_DRIVE_ARCHIVE_ENABLED"
  );
  const googleDriveRootFolderIdValue = overrides.googleDriveRootFolderId ??
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? "";
  const googleDriveServiceAccountEmail = String(
    overrides.googleDriveServiceAccountEmail ?? process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL ?? ""
  ).trim().toLowerCase();
  const googleDriveServiceAccountPrivateKey = String(
    overrides.googleDriveServiceAccountPrivateKey ?? process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY ?? ""
  ).replace(/\\n/g, "\n");
  const googleDriveUserFolderMap = driveUserFolderMap(
    overrides.googleDriveUserFolderMap ?? process.env.GOOGLE_DRIVE_USER_FOLDER_MAP,
    allowedGoogleDomain
  );
  const configuredReimbursementRecipients = overrides.reimbursementRecipients ??
    process.env.REIMBURSEMENT_RECIPIENTS ?? "";
  const reimbursementRecipients = reimbursementRecipientMap(
    requiredInProduction(
      "REIMBURSEMENT_RECIPIENTS",
      configuredReimbursementRecipients,
      production
    ),
    allowedGoogleDomain
  );
  if (production && reimbursementRecipients.size === 0) {
    throw new Error("REIMBURSEMENT_RECIPIENTS must contain at least one approved recipient in production.");
  }
  const googleDriveInvoiceFolderIdValue = overrides.googleDriveInvoiceFolderId ??
    process.env.GOOGLE_DRIVE_INVOICE_FOLDER_ID ?? "";
  let googleDriveRootFolderId = "";
  let googleDriveInvoiceFolderId = "";
  if (googleDriveArchiveEnabled) {
    googleDriveRootFolderId = driveFolderId(
      googleDriveRootFolderIdValue,
      "GOOGLE_DRIVE_ROOT_FOLDER_ID"
    );
    if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(googleDriveServiceAccountEmail)) {
      throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL must be a service-account email address.");
    }
    if (!googleDriveServiceAccountPrivateKey.includes("BEGIN PRIVATE KEY") ||
        !googleDriveServiceAccountPrivateKey.includes("END PRIVATE KEY")) {
      throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY must contain a PEM private key.");
    }
    if (googleDriveUserFolderMap.size === 0) {
      throw new Error("GOOGLE_DRIVE_USER_FOLDER_MAP must contain at least one staff mapping when archival is enabled.");
    }
    const requiredInvoiceFolderId = requiredInProduction(
      "GOOGLE_DRIVE_INVOICE_FOLDER_ID",
      googleDriveInvoiceFolderIdValue,
      production
    );
    if (requiredInvoiceFolderId) {
      googleDriveInvoiceFolderId = driveFolderId(
        requiredInvoiceFolderId,
        "GOOGLE_DRIVE_INVOICE_FOLDER_ID"
      );
    }
  } else if (googleDriveInvoiceFolderIdValue) {
    googleDriveInvoiceFolderId = driveFolderId(
      googleDriveInvoiceFolderIdValue,
      "GOOGLE_DRIVE_INVOICE_FOLDER_ID"
    );
  }

  requiredInProduction("STAFF_SMTP_USER", smtpUser, production);
  requiredInProduction("STAFF_SMTP_PASSWORD", smtpPassword, production);
  if (smtpUser && !smtpPassword) {
    throw new Error("STAFF_SMTP_PASSWORD is required when STAFF_SMTP_USER is configured.");
  }
  if (!smtpUser && smtpPassword) {
    throw new Error("STAFF_SMTP_USER is required when STAFF_SMTP_PASSWORD is configured.");
  }

  const config = {
    appRoot,
    environment,
    production,
    port: integer(overrides.port ?? process.env.PORT, 3100, 1),
    trustProxy: strictInteger(
      overrides.trustProxy ?? process.env.STAFF_TRUST_PROXY,
      production ? 1 : 0, 0, 32, "STAFF_TRUST_PROXY"
    ),
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
      overrides.sessionTtlMs ??
        strictInteger(overrides.sessionTtlHours ?? process.env.STAFF_SESSION_TTL_HOURS, 12, 1, 8_760, "STAFF_SESSION_TTL_HOURS") * 60 * 60 * 1000,
    oauthAttemptTtlMs: overrides.oauthAttemptTtlMs ?? 10 * 60 * 1000,
    csrfSecret: overrides.csrfSecret ?? deriveSecret(sessionSecret, "csrf"),
    logHashSecret: overrides.logHashSecret ?? deriveSecret(sessionSecret, "log-hash"),
    maxUploadBytes,
    serverUploadMaxBytes: overrides.serverUploadMaxBytes ??
      Math.min(maxUploadBytes, production ? 4 * 1024 * 1024 : maxUploadBytes),
    openAiApiKey: overrides.openAiApiKey ?? process.env.OPENAI_API_KEY ?? "",
    openAiModel,
    publicSiteOrigin: canonicalAppUrl(
      overrides.publicSiteOrigin ?? process.env.PUBLIC_SITE_ORIGIN ?? appUrl,
      production,
      "PUBLIC_SITE_ORIGIN"
    ),
    enableDevAuth: strictBoolean(
      overrides.enableDevAuth ?? process.env.STAFF_ENABLE_DEV_AUTH,
      false,
      "STAFF_ENABLE_DEV_AUTH"
    ),
    financeNotificationEmail,
    // Invoice creation follows the already configured Egor/finance identity.
    // Keeping one source of truth avoids a second identity environment variable.
    invoiceCreatorEmail: financeNotificationEmail,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpRequireTls,
    smtpUser,
    smtpPassword,
    mailFrom,
    mailConnectionTimeoutMs: strictInteger(
      overrides.mailConnectionTimeoutMs ?? process.env.STAFF_MAIL_CONNECTION_TIMEOUT_MS,
      10_000,
      1_000,
      120_000,
      "STAFF_MAIL_CONNECTION_TIMEOUT_MS"
    ),
    googleDriveArchiveEnabled,
    googleDriveRootFolderId,
    googleDriveInvoiceFolderId,
    googleDriveServiceAccountEmail,
    googleDriveServiceAccountPrivateKey,
    googleDriveUserFolderMap,
    reimbursementRecipients
  };

  if (config.enableDevAuth && production) {
    throw new Error("STAFF_ENABLE_DEV_AUTH cannot be enabled in production.");
  }
  return Object.freeze(config);
}

export const __configTestUtils = Object.freeze({ smtpPasswordValue });
